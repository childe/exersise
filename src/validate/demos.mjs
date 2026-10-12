const SOURCE_TYPES = ['机构官方', '专业示范', '人工绘制'];
const KEY_EQUIPMENT = ['杠铃', '哑铃'];
const STATUSES = ['符合', '未覆盖', '不符'];
const COVERAGE = ['逐条核验', '部分覆盖', '形态参考'];

// 核验成色由机器从逐条状态推出，数据里写的必须与它一致——
// 这样"页面其实没覆盖这条判据"或"页面用的是别的器械"就不可能再被写成已核验。
export function deriveCoverage(demo, exercise) {
  const items = demo?.verification ?? [];
  const hits = items.filter((v) => v.status === '符合').length;
  if (hits === 0) return '形态参考';
  const sameKit = !exercise || demo?.shows_equipment === exercise.equipment;
  if (hits === items.length && sameKit && demo?.shows_variant === '相同') return '逐条核验';
  return '部分覆盖';
}

export function validateDemos(demos, { exercises }) {
  const errs = [];
  const byId = new Map(demos.map((d) => [d.id, d]));
  const slugs = new Set(exercises.map((e) => e.slug));

  demos.forEach((d, i) => {
    const at = `data/demos.json[${i}] (${d?.id ?? '无 id'})`;
    if (!/^demo-[a-z0-9-]+$/.test(d?.id ?? '')) errs.push(`${at}: id 必须是 demo-<slug>`);
    if (!slugs.has(d?.exercise_id)) errs.push(`${at}: exercise_id 指向不存在的动作 ${d?.exercise_id}`);
    if (!d?.url && !d?.image) errs.push(`${at}: 必须有 url（外部链接）或 image（自制/授权图）`);
    if (d?.url && !/^https:\/\//.test(d.url)) errs.push(`${at}: url 必须是 https 链接`);
    if (!SOURCE_TYPES.includes(d?.source_type)) errs.push(`${at}: source_type 必须是 ${SOURCE_TYPES.join('/')}`);
    if (!d?.publisher) errs.push(`${at}: publisher 必填`);
    if (d?.source_type === '专业示范' && !d?.author_credential) errs.push(`${at}: 专业示范必须记录作者资质 author_credential`);
    if (!d?.license) errs.push(`${at}: license 必填（链接=不转载；图片=明确授权或自制）`);
    if (d?.image && !/授权|自制/.test(d?.license ?? '')) errs.push(`${at}: 图片类示范的 license 必须写明授权或自制`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d?.verified_on ?? '')) errs.push(`${at}: verified_on 必填，格式 YYYY-MM-DD`);
    if (!d?.verified_by) errs.push(`${at}: verified_by 必填（核验人）`);
    if (typeof d?.dead !== 'boolean') errs.push(`${at}: dead 必须是布尔值`);
    // 失效降级的闭环：标 dead 之后这条链接退出检查队列、也退出页面上的可点击链接，
    // 因此必须留下"为什么降级、原链接是什么、降级后读者看什么"的书面记录。
    if (d?.dead === true) {
      if (!d?.dead_note) errs.push(`${at}: dead=true 必须填 dead_note（失效日期 + 读者改看什么：文字要点 + 自检判据）`);
      if (!d?.retired_url && d?.url) errs.push(`${at}: dead=true 时把原 url 移到 retired_url 并清空 url，确保渲染不再产出可点击链接`);
      if (d?.url) errs.push(`${at}: dead=true 的条目不得保留 url 字段（页面只输出失效提示，不留死链）`);
    }
    const ex = exercises.find((e) => e.slug === d?.exercise_id);
    if (ex) {
      const covered = new Set((d?.verification ?? []).map((v) => v.criterion));
      for (const c of ex.self_checks ?? []) {
        if (!covered.has(c.criterion)) errs.push(`${at}: 核验记录缺少对判据「${c.criterion}」的逐条核验`);
      }
      (d?.verification ?? []).forEach((v, j) => {
        if (!v.result) errs.push(`${at}.verification[${j}].result: 必填`);
        if (!STATUSES.includes(v?.status)) {
          errs.push(`${at}.verification[${j}].status: 必须是 ${STATUSES.join('/')}（缺省不等于"符合"）`);
        }
      });

      // 来源页面实际展示的器械与变式必须显式登记：靠"没写就是一样"是上一轮
      // 把 TRX 悬吊带滚轮当成杠铃滚轮示范的直接原因。
      if (d?.visual_url && !/^https:\/\//.test(d.visual_url)) {
        errs.push(`${at}: visual_url 必须是 https 链接`);
      }
      if (!d?.shows_equipment) errs.push(`${at}: shows_equipment 必填（来源页面实际展示的器械）`);
      if (!['相同', '不同'].includes(d?.shows_variant)) {
        errs.push(`${at}: shows_variant 必须是 相同/不同（来源页面展示的是不是同一变式）`);
      }
      if (d?.shows_equipment && d.shows_equipment !== ex.equipment && !d?.substitute_note) {
        errs.push(`${at}: 来源器械（${d.shows_equipment}）与本卡（${ex.equipment}）不同，`
          + '必须填 substitute_note 写明哪些部分可参考、哪些以本卡为准');
      }
      if (d?.shows_variant === '不同' && !d?.variant_note) {
        errs.push(`${at}: 来源展示的是别的变式，必须填 variant_note 写明差异`);
      }
      if (!COVERAGE.includes(d?.coverage)) {
        errs.push(`${at}: coverage 必须是 ${COVERAGE.join('/')}`);
      } else {
        const want = deriveCoverage(d, ex);
        if (d.coverage !== want) {
          errs.push(`${at}: coverage 写的是「${d.coverage}」，但逐条状态只支持「${want}」`
            + (want === '形态参考' ? '——没有任何一条判据被覆盖的来源只能作形态参考，不得标为已核验' : ''));
        }
        if (want !== '逐条核验' && !d?.gaps_note) {
          errs.push(`${at}: 非「逐条核验」的来源必须填 gaps_note（缺口是什么、读者以什么为准）`);
        }
      }
    }
  });

  for (const e of exercises) {
    const isKey = KEY_EQUIPMENT.includes(e.equipment);
    if (!isKey) continue;
    const d = e.demo_id ? byId.get(e.demo_id) : null;
    if (!d) {
      errs.push(`重点动作 ${e.slug}（${e.equipment}）必须有登记在 data/demos.json 的示范来源（§7.2）`);
    } else if (d.dead === true) {
      errs.push(`重点动作 ${e.slug} 的示范 ${d.id} 已标 dead=true：重点动作不接受只剩失效提示，`
        + `必须更换为可用来源（机构官方／专业示范／自制授权图）后才能发布（§7.2 / 设计 §243）`);
    } else {
      // 示范对重点动作是必需件（设计 §7.2：自检判据是补充而非替代），因此下面两种
      // 成色不合格的来源要**阻断验收**，而不是挂着链接、把差异写进提示里了事：
      // 1) 一条判据都没对上的「形态参考」——读者点进去看到的是另一件事；
      // 2) 与本卡判据明确「不符」——读者照着来源做就会把本卡的判据做反。
      if (d.coverage === '形态参考') {
        errs.push(`重点动作 ${e.slug} 的示范 ${d.id} 只是「形态参考」（一条自检判据都没覆盖）：`
          + `重点动作必须有覆盖到判据的示范，请更换来源或补一条匹配动作与变式的视觉示范（§7.2）`);
      }
      const conflicts = (d.verification ?? []).filter((v) => v.status === '不符').map((v) => v.criterion);
      if (conflicts.length) {
        errs.push(`重点动作 ${e.slug} 的示范 ${d.id} 与判据「${conflicts.join('、')}」不符：`
          + `重点动作不接受与自检判据冲突的示范（读者照着做会做反），必须换源（§7.2）`);
      }
      if (!d.visual_check) {
        errs.push(`${d.id}: 重点动作的示范必须填 visual_check（实际看过的画面是什么：哪几张图／哪个机位，`
          + `看到了什么），只读文字说明不算核验视觉示范（§7.2）`);
      }
    }
  }
  return errs;
}
