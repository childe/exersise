import { renderClaimTag, escapeHtml } from './claims.mjs';

const TOKEN_RE = /\{\{(claim|ex|plan|fig|anat):([a-z0-9-]+)\}\}/g;

/** 一张已登记的肌肉分布图。正文占位符与参考库图谱共用，保证两处标记一致、都能过登记校验。 */
export function anatFigure(a) {
  const t = escapeHtml(a.title);
  // 竖图（全身、躯干）铺满正文宽度会有一千多像素高，单独收窄
  const cls = a.height > a.width ? 'anat tall' : 'anat';
  return `<figure class="${cls}"><a href="${a.url}" target="_blank" rel="noopener">`
    + `<img src="${a.url}" alt="${t}" width="${a.width}" height="${a.height}" loading="lazy" decoding="async"></a>`
    + `<figcaption>${t} · 示意图，AI 生成底图，中文标注人工撰写；点图看大图</figcaption></figure>`;
}

export function expandTokens(html, ctx) {
  return html.replace(TOKEN_RE, (_m, kind, id) => {
    if (kind === 'claim') {
      const claim = ctx.claims.get(id);
      if (!claim) throw new Error(`未知 claim id: ${id}`);
      return renderClaimTag(claim);
    }
    if (kind === 'ex') {
      const ex = ctx.exercises.get(id);
      if (!ex) throw new Error(`未知动作 slug: ${id}`);
      return `<a class="xref" href="#ex-${id}">${escapeHtml(ex.name_zh)}</a>`;
    }
    if (kind === 'plan') {
      const plan = ctx.plans.get(id);
      if (!plan) throw new Error(`未知模板 slug: ${id}`);
      return `<a class="xref" href="#plan-${id}">${escapeHtml(plan.title)}</a>`;
    }
    if (kind === 'anat') {
      // 肌肉分布图（spec §7.5）：只能引用 data/anatomy.json 里登记过的图
      const a = ctx.anatomy?.get(`anat-${id}`);
      if (!a) throw new Error(`未登记的肌肉分布图: anat-${id}（见 data/anatomy.json）`);
      return anatFigure(a);
    }
    const svg = ctx.figures.get(id);
    if (!svg) throw new Error(`未知概念图: ${id}`);
    return svg;
  });
}
