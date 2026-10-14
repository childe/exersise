export const PATTERNS = ['推', '拉', '蹲', '髋铰链', '搬运', '核心抗阻'];
export const EQUIPMENT = ['杠铃', '哑铃', '固定器械', '自重', '弹力带'];
export const EQUIP_CLASSES = { 杠铃: '杠铃', 哑铃: '哑铃', 固定器械: '固定器械', 自重: '自重或弹力带', 弹力带: '自重或弹力带' };
export const MUSCLES = ['胸','上背','下背','前束','中束','后束','肱二头','肱三头','前臂','股四头','腘绳','臀','小腿','核心'];
const DIFFICULTY = ['入门', '进阶'];
const SLUG_RE = /^[a-z0-9-]+$/;
const NO_COLLAR_RE = /(不上|免|不用|无需|可不)\s*卡扣/;

export function validateExercises(list, ctx) {
  const errs = [];
  if (!Array.isArray(list)) return ['data/exercises.json: 顶层必须是数组'];
  // 替代项（home_alts / solo_alt）一律对「完整动作库」判定；
  // 省略 ctx.exercises 时才回退到传入数组自身，使单条校验不会因引用库内其他动作而失败。
  const slugs = ctx?.exercises ?? new Set(list.map((e) => e?.slug));
  list.forEach((e, i) => {
    const at = `data/exercises.json[${i}] (${e?.slug ?? '无 slug'})`;
    if (!SLUG_RE.test(e?.slug ?? '')) errs.push(`${at}: slug 必须是 [a-z0-9-]`);
    if (!e?.name_zh || !e?.name_en) errs.push(`${at}: 字段1 name_zh/name_en 必填`);
    if (!PATTERNS.includes(e?.pattern)) errs.push(`${at}: 字段2 pattern 必须是 ${PATTERNS.join('/')}`);
    if (!['单侧', '双侧'].includes(e?.laterality)) errs.push(`${at}: 字段2 laterality 必须是 单侧/双侧`);
    for (const k of ['prime', 'synergist', 'stabilizer']) {
      if (!Array.isArray(e?.muscles?.[k]) || e.muscles[k].length === 0) errs.push(`${at}: 字段3 muscles.${k} 必填`);
    }
    if (!EQUIPMENT.includes(e?.equipment)) errs.push(`${at}: 字段4 equipment 必须是 ${EQUIPMENT.join('/')}`);
    const cues = e?.cues ?? [];
    if (cues.length < 3 || cues.length > 5) errs.push(`${at}: 字段5 cues 需 3–5 条`);
    if (cues[0]?.phase !== '设置') errs.push(`${at}: 字段5 首条必须是"设置"阶段`);
    if (!(e?.mistakes ?? []).length) errs.push(`${at}: 字段6 mistakes 必填`);
    (e?.mistakes ?? []).forEach((m, j) => {
      if (!m.error || !m.consequence) errs.push(`${at}.mistakes[${j}]: 必须写成"错误 → 它导致什么"两段`);
    });
    const checks = e?.self_checks ?? [];
    if (checks.length < 2 || checks.length > 4) errs.push(`${at}: 字段7 self_checks 必填且为 2–4 条`);
    checks.forEach((c, j) => {
      for (const k of ['criterion', 'how', 'cannot']) {
        if (!c?.[k]) errs.push(`${at}.self_checks[${j}].${k}: 必填（判据 + 怎么自检 + 判不了什么）`);
      }
      if (/松开一只手|单手|负重下.*改变握/.test(c?.how ?? '')) {
        errs.push(`${at}.self_checks[${j}].how: 自检不得要求在负重状态下改变握持或支撑`);
      }
    });
    if (!e?.audience?.suitable || !e?.audience?.cautions) errs.push(`${at}: 字段8 audience.suitable/cautions 必填`);
    const alts = e?.home_alts ?? [];
    if (alts.length < 1 || alts.length > 2) errs.push(`${at}: 字段9 home_alts 需 1–2 个`);
    alts.forEach((s) => { if (!slugs.has(s)) errs.push(`${at}: 字段9 home_alts 指向不存在的 slug ${s}`); });
    if (!DIFFICULTY.includes(e?.difficulty)) errs.push(`${at}: 字段10 difficulty 必须是 入门/进阶`);
    const s = e?.safety;
    if (!s) errs.push(`${at}: 字段11 safety 必填，为空的动作不进库`);
    else {
      for (const k of ['rack', 'collars', 'setup', 'bailout']) {
        if (!s[k]) errs.push(`${at}: 字段11 safety.${k} 必填`);
      }
      if (typeof s.solo_ok !== 'boolean') errs.push(`${at}: 字段11 safety.solo_ok 必须是布尔值`);
      if (s.solo_ok === false && !s.solo_alt) errs.push(`${at}: 字段11 solo_ok=false 必须给出 solo_alt 替代动作`);
      if (s.solo_alt && !slugs.has(s.solo_alt)) errs.push(`${at}: 字段11 solo_alt 指向不存在的 slug ${s.solo_alt}`);
      if (NO_COLLAR_RE.test(JSON.stringify(s))) errs.push(`${at}: 字段11 出现"不上卡扣"类表述，全站禁止卡扣例外`);
    }
    if (e?.demo_id && !ctx.demos.has(e.demo_id)) errs.push(`${at}: 字段12 demo_id ${e.demo_id} 未登记在 data/demos.json`);
    const refs = e?.chapter_refs ?? [];
    if (!refs.length) errs.push(`${at}: 字段13 chapter_refs 至少 1 个`);
    refs.forEach((r) => { if (!ctx.chapters.has(r)) errs.push(`${at}: 字段13 指向不存在的章节锚点 ${r}`); });
    (e?.claim_refs ?? []).forEach((c) => { if (!ctx.claims.has(c)) errs.push(`${at}: claim_refs 指向不存在的 claim ${c}`); });
  });
  return errs;
}

export function validateCoverage(list) {
  const errs = [];
  const classes = [...new Set(Object.values(EQUIP_CLASSES))];
  for (const p of PATTERNS) {
    for (const c of classes) {
      const hit = list.some((e) => e.pattern === p && EQUIP_CLASSES[e.equipment] === c);
      if (!hit) errs.push(`覆盖矩阵缺口: 模式「${p}」× 器械「${c}」没有动作`);
    }
    const home = list.some((e) => e.pattern === p && e.difficulty === '入门'
      && EQUIP_CLASSES[e.equipment] === '自重或弹力带');
    if (!home) errs.push(`覆盖矩阵缺口: 模式「${p}」缺少入门级家庭可做版本`);
  }
  for (const m of MUSCLES) {
    const hits = list.filter((e) => [...(e.muscles?.prime ?? []), ...(e.muscles?.synergist ?? [])].includes(m));
    if (hits.length < 2) errs.push(`肌群兜底不足: 「${m}」只有 ${hits.length} 个动作，需 ≥2`);
    else if (new Set(hits.map((e) => EQUIP_CLASSES[e.equipment])).size < 2) {
      errs.push(`肌群兜底不足: 「${m}」的动作全部依赖同一器械类别`);
    }
  }
  return errs;
}
