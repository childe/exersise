import { isCanonRef } from '../safety-canon.mjs';

const NUM_RANGE_RE = /\d/;
const VAGUE_RE = /感觉|觉得|差不多|适当|酌情/;
// 字段 9 不做自由文本关键词扫描：C1 原句本身含"疼痛不走 deload"，任何关键词正则都会误拒正确答案。
// 取而代之，pain_path 必须是对受控口径 C1 的合法引用（`canon:C1` 或 C1 全句逐字一致）。

export function validatePlans(plans, ctx) {
  const errs = [];
  if (!Array.isArray(plans)) return ['data/plans.json: 顶层必须是数组'];
  plans.forEach((p, i) => {
    const at = `data/plans.json[${i}] (${p?.slug ?? '无 slug'})`;
    if (!/^[a-z0-9-]+$/.test(p?.slug ?? '')) errs.push(`${at}: slug 必须是 [a-z0-9-]`);
    if (!p?.title) errs.push(`${at}: title 必填`);
    const a = p?.audience;
    if (!a?.level || !Number.isInteger(a?.days_per_week) || !a?.equipment || !a?.goal || !a?.prerequisites) {
      errs.push(`${at}: 字段1 audience 需含 level/days_per_week/equipment/goal/prerequisites`);
    }
    const week = p?.week ?? [];
    if (!week.length) errs.push(`${at}: 字段2 week 必填`);
    if (!week.some((d) => d.type === '有氧' || d.cardio)) errs.push(`${at}: 字段2 周安排必须含有氧安排`);
    if (!week.some((d) => d.type === '休息')) errs.push(`${at}: 字段2 周安排必须含休息日`);
    week.forEach((d, j) => {
      const dat = `${at}.week[${j}]`;
      if (d.cardio) {
        for (const k of ['mode', 'minutes', 'intensity', 'placement', 'placement_reason', 'chapter_ref']) {
          if (!d.cardio[k]) errs.push(`${dat}.cardio.${k}: 必填（放置理由需链到干扰效应章节）`);
        }
        if (d.cardio.chapter_ref && !ctx.chapters.has(d.cardio.chapter_ref)) {
          errs.push(`${dat}.cardio.chapter_ref: 指向不存在的章节 ${d.cardio.chapter_ref}`);
        }
      }
      (d.items ?? []).forEach((it, k) => {
        const iat = `${dat}.items[${k}]`;
        if (!ctx.exercises.has(it.exercise)) errs.push(`${iat}: 指向不存在的动作 ${it.exercise}`);
        if (!Number.isInteger(it.sets)) errs.push(`${iat}.sets: 字段3 组数必填且为整数`);
        if (!NUM_RANGE_RE.test(String(it.reps ?? ''))) errs.push(`${iat}.reps: 字段3 次数必须具体到数字`);
        if (it.rir === undefined || it.rir === null) errs.push(`${iat}.rir: 字段3 RIR 必填`);
        if (!NUM_RANGE_RE.test(String(it.rest ?? ''))) errs.push(`${iat}.rest: 字段3 组间休息必须具体到时间`);
      });
    });
    if (!p?.start_load || !NUM_RANGE_RE.test(p.start_load)) errs.push(`${at}: 字段4 start_load 必填且必须具体到步骤与数字`);
    if (!(p?.start_load_refs ?? []).length) errs.push(`${at}: 字段4 start_load_refs 需给主要动作的起始重量参考区间`);
    (p?.start_load_refs ?? []).forEach((r, j) => {
      if (!ctx.exercises.has(r.exercise)) errs.push(`${at}.start_load_refs[${j}]: 未知动作 ${r.exercise}`);
      if (!r.range || !r.source) errs.push(`${at}.start_load_refs[${j}]: range 与 source（区间来源与个体差异说明）必填`);
    });
    for (const k of ['general', 'specific', 'by_type']) {
      if (!p?.warmup?.[k]) errs.push(`${at}: 字段5 warmup.${k} 必填`);
    }
    const prog = p?.progression ?? [];
    if (!prog.length) errs.push(`${at}: 字段6 progression 必填`);
    prog.forEach((g, j) => {
      const gat = `${at}.progression[${j}]`;
      if (!ctx.exercises.has(g.exercise)) errs.push(`${gat}: 未知动作 ${g.exercise}`);
      if (!NUM_RANGE_RE.test(String(g.increment_kg ?? '')) || VAGUE_RE.test(String(g.increment_kg ?? ''))) {
        errs.push(`${gat}.increment_kg: 字段6 必须是具体增量数字，不接受"感觉轻了就加重"`);
      }
      if (typeof g.cap_pct !== 'number') errs.push(`${gat}.cap_pct: 字段6 必须给出比例上限（单次增幅占当前工作重量的百分比）`);
      if (!NUM_RANGE_RE.test(String(g.trigger ?? '')) || VAGUE_RE.test(String(g.trigger ?? ''))) {
        errs.push(`${gat}.trigger: 字段6 触发条件必须具体到数字`);
      }
    });
    if (!p?.increment_mismatch) errs.push(`${at}: 字段7 increment_mismatch 必填（器械最小增量不匹配时采用哪条策略）`);
    const fr = p?.failure_rules ?? {};
    for (const k of ['single_miss', 'two_misses', 'miss_one_session', 'miss_1_2_weeks', 'miss_over_month', 'underrecovery']) {
      if (!fr[k]) errs.push(`${at}: 字段8 failure_rules.${k} 必填`);
    }
    if (/疼痛|痛/.test(JSON.stringify(fr))) errs.push(`${at}: 字段8 只处理疲劳，不得出现疼痛处理（疼痛走字段 9）`);
    if (!p?.pain_path) errs.push(`${at}: 字段9 pain_path 必填`);
    else if (!ctx?.safetyCanon) errs.push(`${at}: 字段9 pain_path 无法校验——调用方必须传入 ctx.safetyCanon（loadSafetyCanon 的结果）`);
    else if (!isCanonRef(p.pain_path, ctx.safetyCanon, 'C1')) {
      errs.push(`${at}: 字段9 pain_path 必须照抄安全口径 C1 全句或写 'canon:C1'，不得自撰疼痛处理方案`);
    }
    const subs = p?.substitutions ?? [];
    if (!subs.length) errs.push(`${at}: 字段10 substitutions 必填`);
    subs.forEach((s, j) => {
      const sat = `${at}.substitutions[${j}]`;
      if (!ctx.exercises.has(s.exercise)) errs.push(`${sat}: 未知动作 ${s.exercise}`);
      if (!(s.alts ?? []).length || s.alts.length > 2) errs.push(`${sat}.alts: 需 1–2 个替代项`);
      (s.alts ?? []).forEach((x) => { if (!ctx.exercises.has(x)) errs.push(`${sat}.alts: 未知动作 ${x}`); });
      if (!s.scope) errs.push(`${sat}.scope: 必填`);
      else if (!/不适用于疼痛|不是疼痛/.test(s.scope) || /疼痛时|痛了[^。]{0,8}换/.test(s.scope)) {
        errs.push(`${sat}.scope: 字段10 substitutions 必须写明适用场景仅限器械不可用或不适合其水平/体型，并声明不适用于疼痛`);
      }
    });
    const ex = p?.exit_criteria;
    if (!ex?.when || !ex?.next || !ex?.chapter_ref) errs.push(`${at}: 字段11 exit_criteria 需含 when/next/chapter_ref`);
    else {
      if (!ctx.plans.has(ex.next)) errs.push(`${at}: 字段11 exit_criteria.next 指向不存在的模板 ${ex.next}`);
      if (!ctx.chapters.has(ex.chapter_ref)) errs.push(`${at}: 字段11 exit_criteria.chapter_ref 指向不存在的章节 ${ex.chapter_ref}`);
    }
  });
  return errs;
}
