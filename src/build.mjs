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
import { escapeHtml } from './render/claims.mjs';

const defaultRoot = path.resolve(import.meta.dirname, '..');

export async function build(root = defaultRoot) {
  const data = await loadData(root);
  const css = await readFile(path.join(root, 'src/assets/styles.css'), 'utf8');
  const js = await readFile(path.join(root, 'src/assets/app.js'), 'utf8');
  const loaded = await loadChapters(root, data.chapters);
  const chapterErrs = [...validateChapterList(data.chapters), ...validateChapters(loaded)];
  if (chapterErrs.length) throw new Error(`章节校验失败:\n- ${chapterErrs.join('\n- ')}`);
  const figs = await loadFigures(root);
  const figErrs = validateFigures(figs);
  if (figErrs.length) throw new Error(`概念图校验失败:\n- ${figErrs.join('\n- ')}`);
  const renderCtx = {
    claims: new Map(data.claims.map((c) => [c.id, c])),
    exercises: new Map(data.exercises.map((e) => [e.slug, e])),
    plans: new Map(data.plans.map((p) => [p.slug, p])),
    demos: new Map(data.demos.map((d) => [d.id, d])),
    figures: new Map([...figs].map(([k, v]) =>
      [k, `<figure class="concept">${v.svg.replace(/<!--caption:[\s\S]*?-->\s*/, '')}<figcaption>${escapeHtml(v.caption)}</figcaption></figure>`])),
    chapterTitles: new Map(data.chapters.map((c) => [c.id, `第 ${c.num} 章 ${c.title}`])),
    safetyCanon: data.safetyCanon,
  };
  const html = renderPage(data, {
    css, js,
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
