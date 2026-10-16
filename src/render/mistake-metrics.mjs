// 错误示范与正确动作（灰影）同一时刻的对照量：躯干角、关节角、关键点的位移。
// 「为什么错」里写的数字从这里取，tests/mistakes.test.mjs 用同一个函数断言它们。
import { mistakeSetup } from './skeleton.mjs';
import { interpolate } from './interp.mjs';
import { orbitScene, ORBIT_PARAMS } from './orbit.mjs';
const ORBIT_P = (slug) => ORBIT_PARAMS[slug] ?? {};
import { faultU } from './faults.mjs';

const deg = (r) => r * 180 / Math.PI;
const sub = (a, b) => a.map((x, i) => x - b[i]);
const len = (v) => Math.hypot(...v);
const angAt = (a, b, c) => { const u = sub(a, b), v = sub(c, b); return deg(Math.acos(Math.max(-1, Math.min(1, u.reduce((s, x, i) => s + x * v[i], 0) / (len(u) * len(v)))))); };

/** 一副 3D 关节表的读数。 */
export function jointReadout(J, p) {
  const tv = sub(J.neck, J.pelvis);
  return {
    trunkFromVertical: deg(Math.atan2(Math.abs(tv[0]), -tv[1])),       // 侧视躯干离竖直
    trunkLateral: deg(Math.atan2(Math.abs(tv[2]), -tv[1])),            // 正视躯干侧倾
    kneeAngle: angAt(J.hipN, J.kneeN, J.ankleN),
    hipAngle: angAt(J.neck, J.pelvis, J.kneeN),
    elbowAngle: angAt(J.shoulderN, J.elbowN, J.wristN),
    kneeZ: Math.abs(J.kneeN[2]), ankleZ: Math.abs(J.ankleN[2]),
    load: p.load?.at ?? null,
    hipToLoadX: p.load ? Math.abs(p.load.at[0] - J.pelvis[0]) : null,   // 髋到负荷的水平距离：髋 / 腰要对抗的力臂
    hipY: J.pelvis[1], shoulderY: J.neck[1],
    J,
  };
}

/** 错误动作与正确动作在 (u, half) 的读数。错误动作的 u 按 rom 映射，正确动作用原 u。 */
export function mistakeMetrics(slug, fig, mf, u, half) {
  const s = mistakeSetup(fig, mf);
  const uw = faultU(s.fault, u);
  const pw = interpolate(s.A, s.B, uw, s.iopts), pg = interpolate(s.GA, s.GB, u, s.iopts);
  const sw = orbitScene(slug, { a: s.wa, b: s.wb }, pw, { u: uw, half, lt: fig.load_type, fault: s.fault });
  const sg = orbitScene(slug, { a: s.ga, b: s.gb }, pg, { u, lt: fig.load_type });
  const W = jointReadout(sw.J, sw.p ?? pw), G = jointReadout(sg.J, pg);
  const strip = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'J'));
  return { wrong: strip(W), right: strip(G), Jw: W.J, Jg: G.J, pw: sw.p, pg };
}

// ── 全身重心（站姿错误示范要站得住） ─────────────────────────
// 分段质量与质心位置按 Winter《Biomechanics and Motor Control of Human Movement》表 4.1：
// 头颈 8.1%，躯干 49.7%（肩—髋中点），上臂 2.8%（近端 43.6%），前臂+手 2.2%（近端 68.2%），
// 大腿 10%（近端 43.3%），小腿 4.65%（近端 43.3%），足 1.45%（踝—脚尖中点）。
const SEG = [
  ['head', null, 0.081, 0],
  ['pelvis', 'neck', 0.497, 0.5],
];
const SEG_SIDE = [
  ['shoulder', 'elbow', 0.028, 0.436], ['elbow', 'wrist', 0.022, 0.682],
  ['hip', 'knee', 0.10, 0.433], ['knee', 'ankle', 0.0465, 0.433], ['ankle', 'toe', 0.0145, 0.5],
];

/** 负荷在哪：杠 / 单只哑铃在负荷点，每手一只的哑铃 / 把手在两只手上。 */
export function loadPoints(J, p, P = {}) {
  if (!p.load) return [];
  const t = p.load.type;
  if ((t === 'hands' || t === 'hands2') && P.dbMode !== 'single') return P.dbMode === 'near' ? [J.wristN] : [J.wristN, J.wristF];
  return [[p.load.at[0], p.load.at[1], 0]];
}

/** 全身（含负荷）重心的 x。frac 是负荷占体重的比例。 */
export function comX(J, loads, frac) {
  let m = 0, x = 0;
  const add = (w, q) => { m += w; x += w * q[0]; };
  for (const [a, b, w, t] of SEG) add(w, b ? J[a].map((v, i) => v + (J[b][i] - v) * t) : J[a]);
  for (const s of ['N', 'F']) for (const [a, b, w, t] of SEG_SIDE) add(w, J[a + s].map((v, i) => v + (J[b + s][i] - v) * t));
  for (const q of loads) add(frac / loads.length, q);
  return x / m;
}

/** 髋以上部分（含负荷）对髋的水平力矩（体重 × px）：髋 / 腰要对抗的总伸髋力矩的相对量。 */
export function hipMoment(J, loads, frac) {
  const h = J.pelvis[0];
  let M = 0;
  M += 0.081 * (J.head[0] - h) + 0.497 * ((J.pelvis[0] + J.neck[0]) / 2 - h);
  for (const s of ['N', 'F']) {
    M += 0.028 * (J['shoulder' + s][0] + (J['elbow' + s][0] - J['shoulder' + s][0]) * 0.436 - h);
    M += 0.022 * (J['elbow' + s][0] + (J['wrist' + s][0] - J['elbow' + s][0]) * 0.682 - h);
  }
  for (const q of loads) M += frac / loads.length * (q[0] - h);
  return M;
}

/** 负荷占体重比例的检查区间：两端都要站得住（杠铃 0.3–0.8 倍体重，哑铃 / 把手 0.1–0.3）。 */
const LOAD_FRAC = { bar: [0.3, 0.8], front: [0.3, 0.8], hands: [0.1, 0.3], hands2: [0.1, 0.3] };

/**
 * 站姿（两脚踩地、没有凳和杠托着、手不撑地）的错误示范：每一帧的全身重心都要落在支撑面上。
 * 支撑面取近侧脚的脚跟到脚尖；脚跟离地时只剩前脚掌（脚尖往后 35% 脚长）。容差 2px。
 * 返回 null 表示不是站姿；否则 { ok, worst: 最差一帧的描述 }。灰影（正确动作）同样要过。
 */
export function mistakeBalance(slug, fig, mf) {
  const s = mistakeSetup(fig, mf);
  if (s.GA.bench || s.GA.fixed || s.GA.view === 'front') return null;
  const flat = (p) => p.heel[1] >= 222 && p.toe[1] >= 222 && p.wrist[1] < 215;
  if (!flat(s.GA) || !flat(s.GB)) return null;
  // 返回最小余量那一帧（余量 < 0 即出界）。支撑面：后沿脚跟（容差 2，脚跟着地时重心可以压在跟上），
  // 前沿脚尖往回 3px（重心不可能落在趾尖上）；脚跟离地 0–3px 之间，后沿从脚跟连续退到前脚掌（脚尖往后 35% 脚长）。
  let worst = null;
  for (const half of [0, 1]) for (let i = 0; i <= 16; i++) {
    const u = i / 16, m = mistakeMetrics(slug, fig, mf, u, half);
    for (const [who, J, p] of [['错误', m.Jw, m.pw], ['灰影', m.Jg, m.pg]]) {
      const lt = fig.load_type ?? p.load?.type;
      const fr = fig.no_load ? [0] : LOAD_FRAC[lt] ?? [0];
      const len = Math.abs(p.toe[0] - p.heel[0]);
      const lift = Math.min(Math.max((225 - p.heel[1]) / 3, 0), 1);
      const fore = p.toe[0] - len * 0.35;
      const lo = p.heel[0] - 2 * (1 - lift) + (fore - p.heel[0]) * lift;
      const hi = p.toe[0] - 3;
      const P = { ...ORBIT_P(slug), ...(s.fault.params ?? {}) };
      for (const f of fr) {
        const x = comX(J, loadPoints(J, p, P), f);
        const margin = Math.min(x - lo, hi - x);
        if (!worst || margin < worst.margin) worst = { margin: +margin.toFixed(1), who, u, half, frac: f, com: +x.toFixed(1), support: [+lo.toFixed(1), +hi.toFixed(1)] };
      }
    }
  }
  return { ok: worst.margin >= 0, worst };
}
