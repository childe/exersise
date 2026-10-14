import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expandTokens } from './tokens.mjs';

export async function loadChapters(root, chapters) {
  return Promise.all(chapters.map(async (c) => {
    const file = path.join(root, 'content', c.file);
    let html;
    try {
      html = await readFile(file, 'utf8');
    } catch (err) {
      throw new Error(`content/${c.file}: 无法读取 (${err.code})`);
    }
    return { ...c, html };
  }));
}

export function renderChapters(loaded, ctx, { atlas = false } = {}) {
  const toc = loaded.map((c) =>
    `<li><a href="#${c.id}">第 ${c.num} 章 ${c.title}</a></li>`).join('')
    // 图谱是学习路径的附录，排在各章之后；目录里不编号，免得和章号混在一起
    + (atlas ? '<li class="toc-appendix"><a href="#atlas">附录 肌肉图谱</a></li>' : '');
  const body = loaded.map((c) => expandTokens(c.html, ctx)).join('\n');
  return `<nav class="toc" aria-label="章节目录"><ol>${toc}</ol></nav>
<div class="chapters">${body}</div>`;
}
