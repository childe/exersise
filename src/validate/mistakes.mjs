// 错误示范图（data/mistake-figures.json）的数据校验。
//
// 覆盖是硬要求：每个动作的每条常见错误都必须有一条记录——要么画图，要么写明为什么画不出来
// （节奏、呼吸、器械固定这类错误在骨架上没有形状差别）。漏一条不会在页面上报错，
// 只是那条错误下面静默地没有图，所以由构建来抓。
import { POSES } from '../render/skeleton.mjs';

const OPS = {
  trunk: ['deg'], arm: ['deg'], hip: ['dx', 'dy'], heel: ['deg'], shrug: ['px'], load: ['dx', 'dy'], shift: ['dx', 'dy'], foot: ['dx'], regrip: [], chain: ['deg'],
  valgus: ['px'], lateral: ['deg'], twist: ['deg'], arm3: ['deg'], spine: ['bend'],
};
const PROFS = new Set(['u', 'u2', 'late', 'early', '1-u', 'mid', 'up', 'down', 'const']);
// allow：这条错误示范允许出现的「副作用」（断言默认禁止）。depth 蹲浅、kneeBack 膝到踝后、shin 小腿前倾超过 45°
const ALLOW = new Set(['depth', 'kneeBack', 'shin']);
export const MISTAKE_PARTS = new Set(['trunk', 'shoulders', 'pelvis', 'head', 'thigh', 'shin', 'foot', 'upperarm', 'forearm', 'load']);
const TEMPOS = new Set(['bounce', 'drop']);

export function validateMistakeFigures(mf, exercises, poseFigures, { requireAll = true } = {}) {
  const errs = [];
  const bySlug = new Map(exercises.map((e) => [e.slug, e]));
  for (const slug of Object.keys(mf)) if (!bySlug.has(slug)) errs.push(`mistake-figures：没有动作 ${slug}`);
  for (const e of exercises) {
    const list = mf[e.slug] ?? [];
    for (let i = 0; i < e.mistakes.length; i++) {
      const hits = list.filter((m) => m.mistake === i);
      if (hits.length > 1 || (requireAll && hits.length !== 1)) errs.push(`${e.slug} 第 ${i} 条错误「${e.mistakes[i].error}」：应有 1 条错误示范记录，实有 ${hits.length}`);
    }
    for (const m of list) {
      const where = `${e.slug}#${m.mistake}`;
      if (!(m.mistake >= 0 && m.mistake < e.mistakes.length)) { errs.push(`${where}：错误序号越界`); continue; }
      if (m.none !== undefined) {
        if (typeof m.none !== 'string' || m.none.length < 12) errs.push(`${where}：不画图必须写明理由（none）`);
        if (m.ops || m.why || m.start || m.rom || m.tempo) errs.push(`${where}：none 与画图字段并存`);
        continue;
      }
      if (!poseFigures[e.slug]) { errs.push(`${where}：该动作没有正确动作图，错误示范无从对照`); continue; }
      if (!m.why || m.why.length < 20) errs.push(`${where}：缺少「为什么错」的说明（why）`);
      if (!(m.ops?.length || m.rom || m.tempo || m.start || m.end || m.params)) errs.push(`${where}：没有任何错误变换，画出来与正确动作一样`);
      if (!m.hl?.length && !m.rom && !m.tempo) errs.push(`${where}：没有标出出错部位（hl）`);
      for (const h of m.hl ?? []) {
        const [ps, oi] = h.split('@'), [part, sd] = ps.split('.');
        if (sd !== undefined && !['N', 'F'].includes(sd)) errs.push(`${where}：部位侧别只能是 .N / .F，见到 ${h}`);
        if (sd !== undefined && !['thigh', 'shin', 'foot', 'upperarm', 'forearm'].includes(part)) errs.push(`${where}：${part} 没有左右之分，不能写 ${h}`);
        if (oi !== undefined && !(m.ops?.[+oi])) errs.push(`${where}：${h} 引用的变换不存在`);
      }
      for (const h of m.hl ?? []) if (!MISTAKE_PARTS.has(h.split('@')[0].replace(/\.[NF]$/, ''))) errs.push(`${where}：未知部位 ${h}`);
      for (const k of ['start', 'end']) if (m[k] && !POSES[m[k]]) errs.push(`${where}：姿态 ${m[k]} 不存在`);
      if (m.yaw !== undefined && !(typeof m.yaw === 'number' && Math.abs(m.yaw) <= 120)) errs.push(`${where}：yaw 必须是 ±120 内的角度`);
      if (m.still && !(m.still.u >= 0 && m.still.u <= 1 && [0, 1].includes(m.still.half))) errs.push(`${where}：still 必须是 {u: 0..1, half: 0|1}`);
      for (const a of m.allow ?? []) if (!ALLOW.has(a)) errs.push(`${where}：未知的 allow ${a}`);
      if (m.pprof && !PROFS.has(m.pprof)) errs.push(`${where}：未知 pprof ${m.pprof}`);
      if (m.tempo && !TEMPOS.has(m.tempo)) errs.push(`${where}：未知节奏 ${m.tempo}`);
      if (m.rom && !(m.rom.length === 2 && m.rom.every((x) => x >= 0 && x <= 1))) errs.push(`${where}：rom 必须是 [0..1, 0..1]`);
      // 侧倾 / 旋转只转身体；横在两手之间的杠铃不会跟着转，手会离杠
      const lt = poseFigures[e.slug].load_type ?? POSES[m.start ?? poseFigures[e.slug].start]?.load?.type;
      if ((m.ops ?? []).some((op) => op.op === 'lateral' || op.op === 'twist') && ['bar', 'front'].includes(lt) && !poseFigures[e.slug].no_load)
        errs.push(`${where}：lateral / twist 不能用在杠铃上（杠不随身体转，手会离杠）`);
      // 单侧转手臂：杠铃只有一件，3D 里两只手都重解到杠上——要么拖走整根杠，要么被完全抵消
      if ((m.ops ?? []).some((op) => op.op === 'arm' && op.side) && ['bar', 'front'].includes(lt) && !poseFigures[e.slug].no_load)
        errs.push(`${where}：杠铃上不能单侧转手臂（arm 带 side）`);
      for (const op of m.ops ?? []) {
        const need = OPS[op.op];
        if (!need) { errs.push(`${where}：未知变换 ${op.op}`); continue; }
        for (const k of need) if (typeof op[k] !== 'number') errs.push(`${where}：变换 ${op.op} 缺数值 ${k}`);
        if (op.op === 'foot' && !['near', 'far'].includes(op.side)) errs.push(`${where}：foot 必须写明 side（near / far）`);
        if (op.from !== undefined && !(op.from > 0 && op.from < 1)) errs.push(`${where}：from 必须在 (0, 1) 之间`);
        if (op.prof && !PROFS.has(op.prof)) errs.push(`${where}：未知强度曲线 ${op.prof}`);
      }
    }
  }
  return errs;
}
