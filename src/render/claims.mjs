export function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function renderClaimTag(claim) {
  const label = `${claim.direction}·${claim.certainty}`;
  // claim 的 id 自身已带 `claim-` 前缀，锚点直接用 id，避免 #claim-claim-… 的双前缀
  return `<a class="claim-tag" href="#${claim.id}" data-direction="${claim.direction}"` +
    ` data-certainty="${claim.certainty}" title="${escapeHtml(claim.statement ?? '')}">${label}</a>`;
}

function facet(dim, legend, values) {
  const btns = values.map((v) => `<button type="button" data-value="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join('');
  return `<fieldset data-dim="${dim}"><legend>${legend}</legend>${btns}</fieldset>`;
}

export function renderClaimRegistry(claims) {
  const items = claims.map((c) => `
<article class="claim-entry" id="${c.id}" data-direction="${escapeHtml(c.direction)}" data-certainty="${escapeHtml(c.certainty)}">
  <h3>${escapeHtml(c.statement)} ${renderClaimTag(c)}</h3>
  <dl>
    <dt>分级理由</dt><dd>${escapeHtml(c.rating_rationale)}</dd>
    <dt>研究人群</dt><dd>${escapeHtml(c.population)}</dd>
    <dt>已知局限</dt><dd>${escapeHtml(c.limitations)}</dd>
    <dt>来源</dt><dd><ul>${c.sources.map((s) =>
      `<li>${escapeHtml(s.authors)}（${s.year}）《${escapeHtml(s.title)}》[${escapeHtml(s.type)}]
        <a href="${escapeHtml(s.url)}" rel="noreferrer noopener" target="_blank">${escapeHtml(s.url)}</a></li>`).join('')}</ul></dd>
  </dl>
</article>`).join('\n');
  const dirs = [...new Set(claims.map((c) => c.direction))];
  const certs = [...new Set(claims.map((c) => c.certainty))];
  const filters = `<div class="filters" data-for="claims">${facet('direction', '方向', dirs)}${facet('certainty', '确定性', certs)}` +
    `<p class="result-count" role="status"></p>` +
    `<p class="empty-state" hidden>这组条件下没有任何条目——这通常意味着该组合本身不存在。<button type="button" class="clear-filters">清除筛选</button></p></div>`;
  return `<section id="claims" class="claim-registry"><h2>结论登记表</h2>${filters}<div class="claim-grid">${items}</div></section>`;
}
