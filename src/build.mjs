import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadData } from './data.mjs';
import { renderPage } from './render/page.mjs';
import { renderAtlas } from './render/atlas.mjs';
import { renderClaimRegistry } from './render/claims.mjs';
import { renderExercises } from './render/exercises.mjs';
import { renderPlans } from './render/plans.mjs';
import { loadChapters, renderChapters } from './render/chapters.mjs';
import { renderQuiz } from './render/quiz.mjs';
import { validateChapters, validateChapterList } from './validate/chapters.mjs';
import { validateInternalLinks } from './validate/links.mjs';
import { loadFigures, validateFigures } from './validate/figures.mjs';
import { scanSafety, scanSafetyReview } from './validate/safety.mjs';
import { validateImages } from './validate/anatomy.mjs';
import { validatePoses, validateFigures as validatePoseFigures, validateMuscles,
  validateFrameConsistency, validateJointAngles, validateContacts, validateStraightLines,
  validateFixedRigs, validateBarOnChest, validateSecondHand, validateKneeStable,
  validateDrawnAnimation, validateRackSide, validateAnimBox, validateHeldLoad,
  validateCoronal, validateLimbVsHead, validateAnimEndpoints,
  validateArmFixedToTorso, validateMuscleOnBone } from './validate/poses.mjs';
import { MUSCLE_NAMES } from './render/muscles.mjs';
import { escapeHtml } from './render/claims.mjs';

const defaultRoot = path.resolve(import.meta.dirname, '..');

// 客户端骨架动画：把几个模块拼成一段内联脚本。项目不引打包器，
// 办法是去掉 import/export 后按依赖序拼接——但两个模块里重名的顶层 const
// 会让整段脚本**静默失效**（页面不报错，动画就是不出来）。
// 所以拼完必须编译一遍并扫重名：这类错误不该靠肉眼在页面上发现。
const ANIM_MODULES = [
  'src/render/arm.mjs',
  'src/render/muscle-segments.mjs',
  'src/render/facing.mjs',
  'src/render/skeleton.mjs',   // 依赖上面三个
  'src/render/interp.mjs',     // 依赖 skeleton
  'src/render/orbit.mjs',      // 依赖 skeleton、facing、muscle-segments
  'src/assets/anim.js',
];

async function bundleAnim(root) {
  const parts = [];
  const included = new Set(ANIM_MODULES.map((f) => path.resolve(root, f)));
  for (const f of ANIM_MODULES) {
    const src = await readFile(path.join(root, f), 'utf8');
    // 漏掉一个依赖不会让拼接后的脚本编译失败——它只是在浏览器里抛 ReferenceError，
    // 动画格静默空着而页面其余部分照常。所以这里逐个核对本地 import 都在清单内。
    for (const m of src.matchAll(/^import .*? from '(\.[^']+)';$/gm)) {
      const dep = path.resolve(path.dirname(path.join(root, f)), m[1]);
      if (!included.has(dep)) {
        throw new Error(`动画脚本漏了依赖：${f} 依赖 ${m[1]}，但它不在 ANIM_MODULES 里。`
          + '拼接后 import 会被剥掉，浏览器里是 ReferenceError，动画格会静默空着。');
      }
    }
    parts.push(src.replace(/^import .*?;$/gm, '').replace(/^export\s+/gm, ''));
  }
  const js = `${parts.join('\n')}\ninitSkeletonAnimation({ POSES, interpolate, renderPose, drawnArm });\n`;
  const tops = [...js.matchAll(/^(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  const dup = [...new Set(tops.filter((n, i) => tops.indexOf(n) !== i))];
  if (dup.length) throw new Error(`动画脚本拼接后顶层重名声明：${dup.join('、')}`);
  try { new Function(js); } catch (e) { throw new Error(`动画脚本编译失败：${e.message}`); }
  return js;
}

export async function build(root = defaultRoot, { outDir } = {}) {
  const data = await loadData(root);
  const css = await readFile(path.join(root, 'src/assets/styles.css'), 'utf8');
  const js = await readFile(path.join(root, 'src/assets/app.js'), 'utf8');
  const animJs = await bundleAnim(root);
  const loaded = await loadChapters(root, data.chapters);
  const chapterErrs = [...validateChapterList(data.chapters), ...validateChapters(loaded)];
  if (chapterErrs.length) throw new Error(`章节校验失败:\n- ${chapterErrs.join('\n- ')}`);
  const figs = await loadFigures(root);
  const figErrs = validateFigures(figs);
  if (figErrs.length) throw new Error(`概念图校验失败:\n- ${figErrs.join('\n- ')}`);
  // 骨架图：几何断言是「构造上正确」的兑现处，画错的图不许进页面
  const poseErrs = validatePoses();
  if (poseErrs.length) throw new Error(`骨架姿态几何校验失败:\n- ${poseErrs.join('\n- ')}`);
  const poseFigErrs = validatePoseFigures(data.poseFigures, data.exercises);
  if (poseFigErrs.length) throw new Error(`动作骨架图映射校验失败:\n- ${poseFigErrs.join('\n- ')}`);
  const frameErrs = validateFrameConsistency(data.poseFigures);
  if (frameErrs.length) throw new Error(`骨架两帧一致性校验失败:\n- ${frameErrs.join('\n- ')}`);
  const muscleErrs = validateMuscles(data.exercises, MUSCLE_NAMES);
  if (muscleErrs.length) throw new Error(`肌肉分区校验失败:\n- ${muscleErrs.join('\n- ')}`);
  const angleErrs = validateJointAngles(data.poseFigures);
  if (angleErrs.length) throw new Error(`关节角校验失败:\n- ${angleErrs.join('\n- ')}`);
  const contactErrs = validateContacts();
  if (contactErrs.length) throw new Error(`支撑关系校验失败:\n- ${contactErrs.join('\n- ')}`);
  const lineErrs = validateStraightLines();
  if (lineErrs.length) throw new Error(`直线校验失败:\n- ${lineErrs.join('\n- ')}`);
  const rigErrs = validateFixedRigs(data.poseFigures);
  if (rigErrs.length) throw new Error(`固定物校验失败:\n- ${rigErrs.join('\n- ')}`);
  const chestErrs = validateBarOnChest();
  if (chestErrs.length) throw new Error(`触胸校验失败:\n- ${chestErrs.join('\n- ')}`);
  const handErrs = validateSecondHand();
  if (handErrs.length) throw new Error(`远侧负荷校验失败:\n- ${handErrs.join('\n- ')}`);
  const kneeErrs = validateKneeStable();
  if (kneeErrs.length) throw new Error(`RDL 膝角校验失败:\n- ${kneeErrs.join('\n- ')}`);
  const limbHeadErrs = validateLimbVsHead(data.poseFigures);
  if (limbHeadErrs.length) throw new Error(`肢体与头部重叠校验失败:\n- ${limbHeadErrs.join('\n- ')}`);
  const coronalErrs = validateCoronal();
  if (coronalErrs.length) throw new Error(`冠状面校验失败:\n- ${coronalErrs.join('\n- ')}`);
  const heldErrs = validateHeldLoad(data.poseFigures);
  if (heldErrs.length) throw new Error(`手持器械校验失败:\n- ${heldErrs.join('\n- ')}`);
  const rackErrs = validateRackSide();
  if (rackErrs.length) throw new Error(`架位校验失败:\n- ${rackErrs.join('\n- ')}`);
  const muscleBoneErrs = validateMuscleOnBone(data.poseFigures, data.exercises);
  if (muscleBoneErrs.length) throw new Error(`主动肌标注校验失败:\n- ${muscleBoneErrs.join('\n- ')}`);
  const armFixErrs = validateArmFixedToTorso();
  if (armFixErrs.length) throw new Error(`抱胸手臂校验失败:\n- ${armFixErrs.join('\n- ')}`);
  const endErrs = validateAnimEndpoints(data.poseFigures);
  if (endErrs.length) throw new Error(`动画端点校验失败:\n- ${endErrs.join('\n- ')}`);
  const drawnErrs = validateDrawnAnimation(data.poseFigures);
  if (drawnErrs.length) throw new Error(`动画手臂校验失败:\n- ${drawnErrs.join('\n- ')}`);
  const renderCtx = {
    claims: new Map(data.claims.map((c) => [c.id, c])),
    exercises: new Map(data.exercises.map((e) => [e.slug, e])),
    plans: new Map(data.plans.map((p) => [p.slug, p])),
    demos: new Map(data.demos.map((d) => [d.id, d])),
    anatomy: new Map(data.anatomy.map((a) => [a.id, a])),
    figures: new Map([...figs].map(([k, v]) =>
      [k, `<figure class="concept">${v.svg.replace(/<!--caption:[\s\S]*?-->\s*/, '')}<figcaption>${escapeHtml(v.caption)}</figcaption></figure>`])),
    chapterTitles: new Map(data.chapters.map((c) => [c.id, `第 ${c.num} 章 ${c.title}`])),
    safetyCanon: data.safetyCanon,
    poseFigures: data.poseFigures,
  };
  const exerciseHtml = renderExercises(data.exercises, renderCtx);
  // 从**渲染产物**里把框读回来，而不是在校验器里重算一遍——重算等于同义反复。
  const animBoxes = new Map();
  for (const m of exerciseHtml.matchAll(/data-anim="([^"]*)"/g)) {
    const cfg = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    if (cfg.slug) animBoxes.set(cfg.slug, cfg.box);
  }
  if (animBoxes.size === 0) throw new Error('动画框校验：一个 data-anim 都没解析到，断言会静默放行');
  const animBoxErrs = validateAnimBox(data.poseFigures, (slug) => animBoxes.get(slug) ?? null);
  if (animBoxErrs.length) throw new Error(`动画框校验失败:\n- ${animBoxErrs.join('\n- ')}`);
  const atlasHtml = renderAtlas(data.anatomy);
  const html = renderPage(data, {
    css, js, animJs,
    chapterHtml: renderChapters(loaded, renderCtx, { atlas: Boolean(atlasHtml) }),
    exerciseHtml,
    atlasHtml,
    planHtml: renderPlans(data.plans, renderCtx),
    claimHtml: renderClaimRegistry(data.claims),
    quizHtml: renderQuiz(data.quiz, renderCtx),
  });
  const safetyErrs = scanSafety(html);
  if (safetyErrs.length) throw new Error(`安全红线扫描失败:\n- ${safetyErrs.join('\n- ')}`);
  const review = scanSafetyReview(html);
  if (review.length) {
    console.warn(`安全待复核 ${review.length} 处（不阻断构建，须在 docs/acceptance/safety-review.md 逐条判定）:\n- ${review.join('\n- ')}`);
  }
  const imgErrs = validateImages(html, data.anatomy);
  if (imgErrs.length) throw new Error(`位图登记校验失败:\n- ${imgErrs.join('\n- ')}`);
  const linkErrs = validateInternalLinks(html);
  if (linkErrs.length) throw new Error(`内部锚点校验失败:\n- ${linkErrs.join('\n- ')}`);
  const out = outDir ?? path.join(root, 'dist');
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, 'index.html'), html, 'utf8');
  // 发布用的同一份内容：Artifact 发布时由平台补 <!doctype>/<html>/<head>/<body> 外壳，
  // 所以这里去掉文档外壳，只留 <title>/<style>/正文/<script>。两份内容完全同源。
  const inner = html
    .replace(/^[\s\S]*?<title>/, '<title>')
    .replace(/<\/head>\s*<body>/, '')
    .replace(/<\/body>\s*<\/html>\s*$/, '');
  await writeFile(path.join(out, 'artifact.html'), inner, 'utf8');
  return html;
}

if (process.argv[1] === path.resolve(new URL(import.meta.url).pathname)) {
  build().catch((err) => {
    console.error(`构建失败: ${err.message}`);
    process.exit(1);
  });
}
