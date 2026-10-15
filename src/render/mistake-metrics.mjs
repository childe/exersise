// 错误示范与正确动作（灰影）同一时刻的对照量：躯干角、关节角、关键点的位移。
// 「为什么错」里写的数字从这里取，tests/mistakes.test.mjs 用同一个函数断言它们。
import { mistakeSetup } from './skeleton.mjs';
import { interpolate } from './interp.mjs';
import { orbitLift, orbitScene } from './orbit.mjs';
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
