import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadData } from './data.mjs';
import { renderPage } from './render/page.mjs';
import { renderClaimRegistry } from './render/claims.mjs';
import { renderExercises } from './render/exercises.mjs';
import { renderPlans } from './render/plans.mjs';
import { loadChapters, renderChapters } from './render/chapters.mjs';
import { renderQuiz } from './render/quiz.mjs';
import { validateChapters, validateChapterList } from './validate/chapters.mjs';
import { validateInternalLinks } from './validate/links.mjs';
import { loadFigures, validateFigures } from './validate/figures.mjs';
import { scanSafety, scanSafetyReview } from './validate/safety.mjs';
import { validatePoses, validateFigures as validatePoseFigures, validateMuscles,
  validateFrameConsistency, validateJointAngles } from './validate/poses.mjs';
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
  const js = `${parts.join('\n')}\ninitSkeletonAnimation({ POSES, interpolate, renderPose });\n`;
  const tops = [...js.matchAll(/^(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  const dup = [...new Set(tops.filter((n, i) => tops.indexOf(n) !== i))];
  if (dup.length) throw new Error(`动画脚本拼接后顶层重名声明：${dup.join('、')}`);
  try { new Function(js); } catch (e) { throw new Error(`动画脚本编译失败：${e.message}`); }
  return js;
}

export async function build(root = defaultRoot) {
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
  const angleErrs = validateJointAngles();
  if (angleErrs.length) throw new Error(`关节角校验失败:\n- ${angleErrs.join('\n- ')}`);
  const renderCtx = {
    claims: new Map(data.claims.map((c) => [c.id, c])),
    exercises: new Map(data.exercises.map((e) => [e.slug, e])),
    plans: new Map(data.plans.map((p) => [p.slug, p])),
    demos: new Map(data.demos.map((d) => [d.id, d])),
    figures: new Map([...figs].map(([k, v]) =>
      [k, `<figure class="concept">${v.svg.replace(/<!--caption:[\s\S]*?-->\s*/, '')}<figcaption>${escapeHtml(v.caption)}</figcaption></figure>`])),
    chapterTitles: new Map(data.chapters.map((c) => [c.id, `第 ${c.num} 章 ${c.title}`])),
    safetyCanon: data.safetyCanon,
    poseFigures: data.poseFigures,
  };
  const html = renderPage(data, {
    css, js, animJs,
    chapterHtml: renderChapters(loaded, renderCtx),
    exerciseHtml: renderExercises(data.exercises, renderCtx),
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
  const linkErrs = validateInternalLinks(html);
  if (linkErrs.length) throw new Error(`内部锚点校验失败:\n- ${linkErrs.join('\n- ')}`);
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await writeFile(path.join(root, 'dist/index.html'), html, 'utf8');
  // 发布用的同一份内容：Artifact 发布时由平台补 <!doctype>/<html>/<head>/<body> 外壳，
  // 所以这里去掉文档外壳，只留 <title>/<style>/正文/<script>。两份内容完全同源。
  const inner = html
    .replace(/^[\s\S]*?<title>/, '<title>')
    .replace(/<\/head>\s*<body>/, '')
    .replace(/<\/body>\s*<\/html>\s*$/, '');
  await writeFile(path.join(root, 'dist/artifact.html'), inner, 'utf8');
  return html;
}

if (process.argv[1] === path.resolve(new URL(import.meta.url).pathname)) {
  build().catch((err) => {
    console.error(`构建失败: ${err.message}`);
    process.exit(1);
  });
}
