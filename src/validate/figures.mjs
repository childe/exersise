import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export async function loadFigures(root) {
  const dir = path.join(root, 'assets/figures');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.svg'));
  const out = new Map();
  for (const f of files) {
    const svg = await readFile(path.join(dir, f), 'utf8');
    const caption = svg.match(/<!--caption:([\s\S]*?)-->/)?.[1]?.trim() ?? '';
    out.set(path.basename(f, '.svg'), { svg, caption });
  }
  return out;
}

export function validateFigures(figures) {
  const errs = [];
  for (const [name, { svg, caption }] of figures) {
    const at = `assets/figures/${name}.svg`;
    const kind = svg.match(/data-kind="(conceptual|quantitative)"/)?.[1];
    if (!kind) { errs.push(`${at}: 根元素需声明 data-kind="conceptual" 或 "quantitative"`); continue; }
    const vb = svg.match(/viewBox="([-\d.\s]+)"/)?.[1]?.trim().split(/\s+/).map(Number);
    if (!vb || vb.length !== 4) { errs.push(`${at}: 缺少合法 viewBox`); continue; }
    const [vx, vy, vw, vh] = vb;
    for (const m of svg.matchAll(/<text[^>]*\sx="([-\d.]+)"[^>]*\sy="([-\d.]+)"/g)) {
      const x = Number(m[1]), y = Number(m[2]);
      if (x < vx || x > vx + vw || y < vy || y > vy + vh) {
        errs.push(`${at}: 标注文字 (${x}, ${y}) 落在 viewBox 外`);
      }
    }
    const texts = [...svg.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1]);
    const hasNumbers = texts.some((t) => /\d/.test(t));
    if (kind === 'conceptual') {
      if (hasNumbers) errs.push(`${at}: 概念图不得画数字刻度（§7.4），轴只标方向与定性标签`);
      if (!/示意/.test(caption) || !/个体/.test(caption)) {
        errs.push(`${at}: 概念图图注必须写明"示意图，表达趋势而非数值；不是对个体反应的预测"`);
      }
    } else {
      if (!/data-claim="claim-[a-z0-9-]+"/.test(svg)) errs.push(`${at}: 带数字刻度的图必须用 data-claim 引用登记表中的结论`);
      if (!/\d{4}/.test(caption)) errs.push(`${at}: 定量图图注必须写明来源与年份`);
    }
    for (const m of svg.matchAll(/(stroke|fill)="([^"]+)"/g)) {
      const v = m[2];
      if (!/^(currentColor|none|var\(--[a-z-]+\))$/.test(v)) {
        errs.push(`${at}: ${m[1]}="${v}" 必须用 currentColor / none / var(--token) 取色，深浅主题才都可读`);
      }
    }
  }
  return errs;
}
