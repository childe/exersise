import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadData } from './data.mjs';
import { renderPage } from './render/page.mjs';
import { renderClaimRegistry } from './render/claims.mjs';
import { renderExercises } from './render/exercises.mjs';
import { renderPlans } from './render/plans.mjs';
import { loadChapters, renderChapters } from './render/chapters.mjs';
import { validateChapters, validateChapterList } from './validate/chapters.mjs';
import { validateInternalLinks } from './validate/links.mjs';
import { loadFigures, validateFigures } from './validate/figures.mjs';
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
  });
  const linkErrs = validateInternalLinks(html);
  if (linkErrs.length) throw new Error(`内部锚点校验失败:\n- ${linkErrs.join('\n- ')}`);
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await writeFile(path.join(root, 'dist/index.html'), html, 'utf8');
  return html;
}

if (process.argv[1] === path.resolve(new URL(import.meta.url).pathname)) {
  build().catch((err) => {
    console.error(`构建失败: ${err.message}`);
    process.exit(1);
  });
}
