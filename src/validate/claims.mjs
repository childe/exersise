const DIRECTIONS = new Set(['支持', '反对', '未定']);
const CERTAINTIES = new Set(['高', '中', '低']);
const SOURCE_TYPES = new Set(['系统综述', 'RCT', '观察', '机制', '指南']);
const ID_RE = /^claim-[a-z0-9-]+$/;

export function validateClaims(claims) {
  const errs = [];
  if (!Array.isArray(claims)) return ['data/claims.json: 顶层必须是数组'];
  const seen = new Set();
  claims.forEach((c, i) => {
    const at = `data/claims.json[${i}] (${c?.id ?? '无 id'})`;
    if (!ID_RE.test(c?.id ?? '')) errs.push(`${at}: id 必须匹配 ${ID_RE}`);
    else if (seen.has(c.id)) errs.push(`${at}: id 重复`);
    else seen.add(c.id);
    if (!c?.statement || c.statement.length < 6) errs.push(`${at}: statement 必填且需成句`);
    if (!DIRECTIONS.has(c?.direction)) errs.push(`${at}: direction 必须是 支持/反对/未定`);
    if (!CERTAINTIES.has(c?.certainty)) errs.push(`${at}: certainty 必须是 高/中/低`);
    for (const f of ['population', 'limitations', 'rating_rationale']) {
      if (!c?.[f]) errs.push(`${at}: ${f} 必填`);
    }
    const sources = c?.sources;
    if (!Array.isArray(sources) || sources.length === 0) {
      errs.push(`${at}: sources 至少 1 条`);
    } else {
      sources.forEach((s, j) => {
        const sat = `${at}.sources[${j}]`;
        if (!s.authors) errs.push(`${sat}: authors 必填`);
        if (!Number.isInteger(s.year)) errs.push(`${sat}: year 必须是整数年份`);
        if (!s.title) errs.push(`${sat}: title 必填`);
        if (!SOURCE_TYPES.has(s.type)) errs.push(`${sat}: type 必须是 ${[...SOURCE_TYPES].join('/')}`);
        if (!/^https?:\/\//.test(s.url ?? '')) errs.push(`${sat}: url 必须是可访问的 http(s) 链接或 DOI 链接`);
      });
    }
    if (c?.safety === true) {
      const okSource = (c.sources ?? []).some((s) =>
        ['系统综述', '指南'].includes(s.type) ||
        /acsm|nsca|who|aaos|bjsm|nih/i.test(s.url ?? ''));
      if (!okSource) errs.push(`${at}: safety=true 的结论来源必须是公开文献或权威机构指南（§4.3 更高门槛）`);
    }
  });
  return errs;
}
