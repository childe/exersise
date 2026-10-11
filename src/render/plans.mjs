import { escapeHtml } from './claims.mjs';
import { expandTokens } from './tokens.mjs';
import { expandCanon } from '../safety-canon.mjs';

function weekRow(d, ctx) {
  if (d.type === '休息') {
    return `<tr><th scope="row">${escapeHtml(d.day)}</th><td>休息</td><td>完全休息日——恢复发生在这里，不是练出来的。</td></tr>`;
  }
  if (d.cardio) {
    const c = d.cardio;
    return `<tr><th scope="row">${escapeHtml(d.day)}</th><td>有氧</td><td>${escapeHtml(c.mode)}，${escapeHtml(String(c.minutes))} 分钟，${escapeHtml(c.intensity)}；
      放在${escapeHtml(c.placement)}——${escapeHtml(c.placement_reason)}（<a href="#${escapeHtml(c.chapter_ref)}">${escapeHtml(ctx.chapterTitles.get(c.chapter_ref) ?? c.chapter_ref)}</a>）</td></tr>`;
  }
  const items = (d.items ?? []).map((it) =>
    `<li>{{ex:${it.exercise}}}：${it.sets} 组 × ${escapeHtml(String(it.reps))} 次，RIR ${escapeHtml(String(it.rir))}，组间休息 ${escapeHtml(it.rest)}</li>`).join('');
  return `<tr><th scope="row">${escapeHtml(d.day)}</th><td>${escapeHtml(d.type)}</td><td><ul class="rx">${items}</ul></td></tr>`;
}

function planCard(p, ctx) {
  const a = p.audience;
  const fr = p.failure_rules;
  return `
<article class="plan-card" id="plan-${p.slug}"
  data-level="${escapeHtml(a.level)}" data-days="${escapeHtml(String(a.days_per_week))}" data-goal="${escapeHtml(a.goal)}">
  <h3>${escapeHtml(p.title)}</h3>
  <h4>适用对象与前提</h4>
  <p>水平 ${escapeHtml(a.level)}／每周 ${escapeHtml(String(a.days_per_week))} 天／器械 ${escapeHtml(a.equipment)}／目标 ${escapeHtml(a.goal)}。前提：${escapeHtml(a.prerequisites)}</p>
  <h4>周安排（含有氧与休息日）与处方</h4>
  <div class="table-wrap"><table><thead><tr><th>日</th><th>类型</th><th>内容</th></tr></thead>
  <tbody>${p.week.map((d) => weekRow(d, ctx)).join('')}</tbody></table></div>
  <h4>起始负荷选择流程</h4>
  <p>${escapeHtml(p.start_load)}</p>
  <ul>${p.start_load_refs.map((r) => `<li>{{ex:${r.exercise}}}：${escapeHtml(r.range)}——${escapeHtml(r.source)}</li>`).join('')}</ul>
  <h4>热身流程</h4>
  <ul><li>一般热身：${escapeHtml(p.warmup.general)}</li><li>专项热身组：${escapeHtml(p.warmup.specific)}</li><li>按动作类型：${escapeHtml(p.warmup.by_type)}</li></ul>
  <h4>进阶规则</h4>
  <ul>${p.progression.map((g) => `<li>{{ex:${g.exercise}}}：每次 +${escapeHtml(String(g.increment_kg))} kg，单次增幅不超过当前工作重量的 ${escapeHtml(String(g.cap_pct))}%（两者取小）；触发条件：${escapeHtml(g.trigger)}</li>`).join('')}</ul>
  <h4>增量不匹配怎么办</h4>
  <p>${escapeHtml(p.increment_mismatch)}</p>
  <h4>失败与中断（疲劳）</h4>
  <ul>
    <li>单次没完成：${escapeHtml(fr.single_miss)}</li>
    <li>连续两次未达标：${escapeHtml(fr.two_misses)}</li>
    <li>缺课 1 次：${escapeHtml(fr.miss_one_session)}</li>
    <li>缺课 1–2 周：${escapeHtml(fr.miss_1_2_weeks)}</li>
    <li>缺课超过 1 个月：${escapeHtml(fr.miss_over_month)}</li>
    <li>恢复不足信号：${escapeHtml(fr.underrecovery)}</li>
  </ul>
  <h4 class="pain-path-title">疼痛的独立处理路径</h4>
  <p class="pain-path">${escapeHtml(expandCanon(p.pain_path, ctx.safetyCanon ?? {}))}</p>
  <h4>替代动作映射</h4>
  <ul>${p.substitutions.map((s) => `<li>{{ex:${s.exercise}}} → ${s.alts.map((x) => `{{ex:${x}}}`).join('、')}；适用范围：${escapeHtml(s.scope)}</li>`).join('')}</ul>
  <h4>何时停用、换到哪套</h4>
  <p>${escapeHtml(p.exit_criteria.when)} → 换到 {{plan:${p.exit_criteria.next}}}（<a href="#${escapeHtml(p.exit_criteria.chapter_ref)}">${escapeHtml(ctx.chapterTitles.get(p.exit_criteria.chapter_ref) ?? p.exit_criteria.chapter_ref)}</a>）</p>
</article>`;
}

function facet(dim, legend, values) {
  const btns = values.map((v) => `<button type="button" data-value="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join('');
  return `<fieldset data-dim="${dim}"><legend>${legend}</legend>${btns}</fieldset>`;
}

export function renderPlans(list, ctx) {
  const body = list.map((p) => expandTokens(planCard(p, ctx), ctx)).join('\n');
  const uniq = (xs) => [...new Set(xs.map(String))];
  const filters = [
    facet('level', '水平', uniq(list.map((p) => p.audience.level))),
    facet('days', '天数', uniq(list.map((p) => p.audience.days_per_week))),
    facet('goal', '目标', uniq(list.map((p) => p.audience.goal))),
  ].join('');
  return `<section id="plans"><h2>计划模板</h2>
<div class="filters" data-for="plans">${filters}<p class="result-count" role="status"></p>
<p class="empty-state" hidden>这组条件下没有任何模板——换一个条件组合试试。<button type="button" class="clear-filters">清除筛选</button></p></div>
<div class="plan-grid">${body}</div></section>`;
}
