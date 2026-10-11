const SOURCE_TYPES = ['机构官方', '专业示范', '人工绘制'];
const KEY_EQUIPMENT = ['杠铃', '哑铃'];

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
      });
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
    }
  }
  return errs;
}
