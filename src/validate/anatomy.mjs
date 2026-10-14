// 肌肉分布图（spec §7.5）。
//
// AI 生成的肌肉分布图可以用，但必须登记；页面里出现的每一个 <img> 都要能在登记表里找到。
// 「页面里没有未登记的图」这一条只能对**渲染产物**断言：只校验登记表本身，
// 挡不住有人在正文里直接手写一个 <img src="https://...">——那正是外链图片过去完全不受检查的原因。

const KINDS = ['全局', '部位', '动作模式'];
const MODELS = ['gpt-image-2'];

export function validateAnatomy(list) {
  const errs = [];
  if (!Array.isArray(list)) return ['data/anatomy.json: 顶层必须是数组'];
  const seenId = new Set();
  const seenUrl = new Set();
  list.forEach((a, i) => {
    const at = `data/anatomy.json[${i}] (${a?.id ?? '无 id'})`;
    if (!/^anat-[a-z0-9-]+$/.test(a?.id ?? '')) errs.push(`${at}: id 必须是 anat-<slug>`);
    if (seenId.has(a?.id)) errs.push(`${at}: id 重复`);
    seenId.add(a?.id);
    if (!a?.title) errs.push(`${at}: title 必填（同时用作 <img> 的 alt）`);
    if (!/^https:\/\//.test(a?.url ?? '')) errs.push(`${at}: url 必须是 https 链接`);
    if (seenUrl.has(a?.url)) errs.push(`${at}: url 与前面的条目重复`);
    seenUrl.add(a?.url);
    if (!KINDS.includes(a?.kind)) errs.push(`${at}: kind 必须是 ${KINDS.join('/')}`);
    if (!MODELS.includes(a?.model)) errs.push(`${at}: model 必须是 ${MODELS.join('/')}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a?.generated ?? '')) errs.push(`${at}: generated 必须是 YYYY-MM-DD`);
  });
  return errs;
}

/**
 * 渲染产物里的每张位图都必须是已登记的分布图。
 * SVG 的 <image href> 同样能嵌位图，只查 <img> 等于留一个口子。
 */
export function validateImages(html, anatomy) {
  const registered = new Set(anatomy.map((a) => a.url));
  const errs = [];
  for (const m of html.matchAll(/<(img|image)\b[^>]*>/gi)) {
    const attr = m[1].toLowerCase() === 'img' ? 'src' : '(?:xlink:)?href';
    const src = new RegExp(`\\b${attr}="([^"]*)"`, 'i').exec(m[0])?.[1];
    if (src == null) {
      errs.push(`<${m[1]}> 缺 ${m[1] === 'img' ? 'src' : 'href'}：${m[0].slice(0, 80)}`);
      continue;
    }
    if (!registered.has(src)) {
      errs.push(`<${m[1]} ${src.slice(0, 80)}> 未在 data/anatomy.json 登记（spec §7.5）——`
        + '动作示范走 demos.json 的外部链接，不以 <img> 嵌入；概念图走内联 SVG');
    }
  }
  return errs;
}
