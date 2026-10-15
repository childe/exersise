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

export function renderChapters(loaded, ctx) {
  const toc = loaded.map((c) =>
    `<li><a href="#${c.id}">第 ${c.num} 章 ${c.title}</a></li>`).join('');
  const body = loaded.map((c) => expandTokens(c.html, ctx)).join('\n');
  return `<nav class="toc" aria-label="章节目录"><ol>${toc}</ol></nav>
<div class="chapters">${body}</div>`;
}
