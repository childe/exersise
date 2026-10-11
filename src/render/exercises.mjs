import { escapeHtml } from './claims.mjs';
import { expandTokens } from './tokens.mjs';

function card(e, ctx) {
  const demo = e.demo_id ? ctx.demos.get(e.demo_id) : null;
  const demoHtml = !demo
    ? ''
    : demo.dead
      ? `<p class="demo dead">示范链接已失效（${escapeHtml(demo.dead_note ?? '')}），请依据上方文字要点与自检判据执行；原来源：${escapeHtml(demo.publisher)}</p>`
      : `<p class="demo"><a href="${escapeHtml(demo.url)}" rel="noreferrer noopener" target="_blank">示范（${escapeHtml(demo.publisher)}，核验于 ${escapeHtml(demo.verified_on)}）</a></p>`;
  return `
<article class="ex-card" id="ex-${e.slug}"
  data-pattern="${e.pattern}" data-equipment="${e.equipment}"
  data-difficulty="${e.difficulty}" data-muscles="${escapeHtml([...e.muscles.prime, ...e.muscles.synergist].join(' '))}">
  <h3>${escapeHtml(e.name_zh)} <span class="en">${escapeHtml(e.name_en)}</span></h3>
  <p class="meta">${e.pattern} · ${e.laterality} · ${e.equipment} · ${e.difficulty}</p>
  <p class="muscles">主动肌 ${escapeHtml(e.muscles.prime.join('、'))}；协同肌 ${escapeHtml(e.muscles.synergist.join('、'))}；稳定肌 ${escapeHtml(e.muscles.stabilizer.join('、'))}</p>
  <h4>执行要点</h4><ol>${e.cues.map((c) => `<li><b>${escapeHtml(c.phase)}</b>：${escapeHtml(c.text)}</li>`).join('')}</ol>
  <h4>常见错误 → 它导致什么</h4><ul>${e.mistakes.map((m) => `<li>${escapeHtml(m.error)} → ${escapeHtml(m.consequence)}</li>`).join('')}</ul>
  <h4>可自检判据</h4><ol>${e.self_checks.map((c) => `<li><b>${escapeHtml(c.criterion)}</b><br><i>怎么自检</i>：${escapeHtml(c.how)}<br><i>判不了</i>：${escapeHtml(c.cannot)}</li>`).join('')}</ol>
  <h4>安全设置与失败退出</h4>
  <ul class="safety">
    <li>保护杆／保护架：${escapeHtml(e.safety.rack)}</li>
    <li>卡扣：${escapeHtml(e.safety.collars)}</li>
    <li>器械对齐：${escapeHtml(e.safety.setup)}</li>
    <li>独练：${e.safety.solo_ok ? '无保护者时可做' : `无保护杆且无保护者时<b>不做</b>，改做 {{ex:${e.safety.solo_alt}}}`}</li>
    <li>做不动了怎么脱身：${escapeHtml(e.safety.bailout)}</li>
  </ul>
  <p class="audience">适用：${escapeHtml(e.audience.suitable)}；慎用：${escapeHtml(e.audience.cautions)}</p>
  <p class="alts">家庭／有限器械替代：${e.home_alts.map((s) => `{{ex:${s}}}`).join('、')}</p>
  ${demoHtml}
  <p class="xrefs">→ 关联原理：${e.chapter_refs.map((r) => `<a href="#${r}">${escapeHtml(ctx.chapterTitles.get(r))}</a>`).join('、')}</p>
</article>`;
}

function facet(dim, legend, values) {
  const btns = values.map((v) => `<button type="button" data-value="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join('');
  return `<fieldset data-dim="${dim}"><legend>${legend}</legend>${btns}</fieldset>`;
}

export function renderExercises(list, ctx) {
  const body = list.map((e) => expandTokens(card(e, ctx), ctx)).join('\n');
  const uniq = (xs) => [...new Set(xs)];
  const filters = [
    facet('pattern', '模式', uniq(list.map((e) => e.pattern))),
    facet('equipment', '器械', uniq(list.map((e) => e.equipment))),
    facet('muscles', '部位', uniq(list.flatMap((e) => [...e.muscles.prime, ...e.muscles.synergist]))),
    facet('difficulty', '难度', uniq(list.map((e) => e.difficulty))),
  ].join('');
  return `<section id="exercises"><h2>动作库</h2>
<div class="filters" data-for="exercises">${filters}<p class="result-count" role="status"></p>
<p class="empty-state" hidden>这组条件下没有任何条目——这通常意味着该组合本身不存在（例如固定器械很少覆盖搬运模式）。<button type="button" class="clear-filters">清除筛选</button></p></div>
<div class="ex-grid">${body}</div></section>`;
}
