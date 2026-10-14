// 环绕视角：相机绕竖直轴在侧视两边来回摆 ±ORBIT_YAW°，并略微俯视。
//
// 为什么需要：侧视骨架只有 x/y，沿 z 展开的东西全被压扁——横架在肩上的杠铃画成横线，
// 读起来像杠顺着人的前后方向放；握距、肘的去向也读不出来。把杠画成正对镜头的圆片试过，
// 能看出是杠片，但单帧仍然没有深度。只有视角在动，读者才能从运动里读出前后关系。
//
// 为什么只摆 ±30° 而不转满一圈：深蹲的判据（杠过足中线、髋低于膝）只在侧视里看得见，
// 转到正面它们就消失了。摆在侧视附近，判据始终可读，同时有足够的视差读出深度。
//
// 3D 坐标不手写，从已经校验过的 2D 姿态推出来：对称动作的左右侧各偏一个关节半宽，
// 2D 坐标原样当作 x/y。所以 yaw = 0、俯角为 0 时，这里画出的身体与侧视静态图重合。
// 手臂例外：侧视里手臂是投影重建的（见 arm.mjs），这里直接在 3D 里按真骨长从肩解到握点。
import { GROUND, MIDFOOT } from './skeleton.mjs';
import { MUSCLE_SEG } from './muscle-segments.mjs';
import { facing, FACE_GEOMETRY } from './facing.mjs';

/** 启用环绕视角的动作（按 slug）。目前只在高杠背蹲上试。 */
export const ORBIT_FIGS = new Set(['back-squat-high-bar']);
export const ORBIT_YAW = 30;                 // 度：摆幅
export const ORBIT_PERIOD = 8.4;             // 秒：一次完整摆动 = 两次起落
// 静止帧（无 JS / 减少动态效果 / 打印）：底部位置、偏 −20°。底部是判据最多的一帧，
// 偏一个角度才看得出杠铃横架——正侧视就又回到了「看不出前后」。
export const ORBIT_STATIC = { u: 1, yaw: -20 };
const ORB_PITCH = 14 * Math.PI / 180;        // 俯角：地面因此成一块平面，深度有了上下的线索
const ORB_CAM_DIST = 520;                    // 相机到视线中心的距离（px）：近端约放大 1.2 倍、远端缩到 0.85
const ORB_EYE_Y = 115;                       // 视线中心的高度：约在人的腰腹，起落全程都在画面中部

// 关节到身体中线的距离（px）。比例：躯干 80px ≈ 50cm。
// 肩关节间距约 34cm、髋关节约 17cm；深蹲站距约与肩同宽、脚尖略外展、膝跟脚尖走。
const ORB_HALF = { shoulder: 27, hip: 14, knee: 30, ankle: 28, heel: 27, toe: 36 };
const ORB_GRIP = 46;                         // 握距半宽：比肩宽
const ORB_BAR = 88, ORB_PLATE_Z = 72, ORB_PLATE_R = 16;
const ORB_UPPER = 50, ORB_FORE = 39;         // 与 skeleton.mjs 的 BONE 一致
// 背蹲的 cue「肘往后下」：肘的去向 = 后、下、略向外
const ORB_ELBOW_POLE = [-0.6, 0.7, 0.4];
const ORB_FLOOR = { x: 62, z: 60 };

const o3sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const o3dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const o3len = (a) => Math.hypot(a[0], a[1], a[2]);
const o3mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** 3D 两骨 IK：肘落在以「肩—手」为轴的圆上，取朝 pole 的那一点。 */
function orbIk(S, H, l1, l2, pole) {
  const v = o3sub(H, S), d0 = o3len(v) || 1e-6;
  const d = Math.min(Math.max(d0, Math.abs(l1 - l2) + 1e-6), l1 + l2 - 1e-6);
  const u = v.map((x) => x / d0);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const k = o3dot(pole, u);
  let w = pole.map((x, i) => x - u[i] * k);
  const wl = o3len(w) || 1;
  w = w.map((x) => x / wl);
  return S.map((x, i) => x + u[i] * a + w[i] * h);
}

/** 2D 侧视姿态 → 3D。side: +1 近侧（侧视里离读者近的一侧），−1 远侧。 */
export function orbitLift(p) {
  const J = { head: [p.head[0], p.head[1], 0] };
  const top = p.shoulderMid ?? p.shoulder;
  J.neck = [top[0], top[1], 0];
  J.pelvis = [p.hip[0], p.hip[1], 0];
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'N' : 'F';
    for (const k of ['shoulder', 'hip', 'knee', 'ankle', 'heel', 'toe']) {
      J[k + tag] = [p[k][0], p[k][1], s * ORB_HALF[k]];
    }
    const S = J['shoulder' + tag];
    if (p.load?.type === 'bar') {
      const H = [p.load.at[0], p.load.at[1], s * ORB_GRIP];
      J['wrist' + tag] = H;
      J['elbow' + tag] = orbIk(S, H, ORB_UPPER, ORB_FORE,
        [ORB_ELBOW_POLE[0], ORB_ELBOW_POLE[1], s * ORB_ELBOW_POLE[2]]);
    } else {
      J['elbow' + tag] = [p.elbow[0], p.elbow[1], s * ORB_HALF.shoulder];
      J['wrist' + tag] = [p.wrist[0], p.wrist[1], s * ORB_HALF.shoulder];
    }
  }
  return J;
}

/**
 * 投影：绕过足中线的竖直轴转 yaw，绕视线中心俯视 ORB_PITCH，再做透视。
 * 返回 [屏幕 x, 屏幕 y, 深度（越大越近）, 缩放 k]。
 *
 * 必须是透视而不是正交：正交投影下远近一样大、平行线永远平行，地面只是一块平行四边形，
 * 读者分不出哪条边近——等于把「看不出前后」的问题从杠铃挪到了地面上。
 * 代价：yaw = 0 时近侧肢体比远侧略大，不再与侧视静态图逐像素重合。
 */
export function orbitProject(P, yawDeg) {
  const t = yawDeg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  const X = P[0] - MIDFOOT, Y = P[1] - ORB_EYE_Y, Z = P[2];
  const sx = X * c + Z * s, d = -X * s + Z * c;
  const cp = Math.cos(ORB_PITCH), sp = Math.sin(ORB_PITCH);
  const sy = Y * cp + d * sp, depth = d * cp - Y * sp;
  const k = ORB_CAM_DIST / (ORB_CAM_DIST - depth);
  return [MIDFOOT + sx * k, ORB_EYE_Y + sy * k, depth, k];
}

const orbCircle = (cx, cy, z, r, n = 24) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z];
  });

const orbFloor = () => [[-1, -1], [1, -1], [1, 1], [-1, 1]]
  .map(([i, k]) => [MIDFOOT + i * ORB_FLOOR.x, GROUND, k * ORB_FLOOR.z]);

/** 画框：这一帧所有画出来的东西的包围盒。 */
export function orbitExtent(p, yawDeg) {
  const J = orbitLift(p);
  const pts = Object.values(J).map((q) => orbitProject(q, yawDeg));
  for (const q of orbFloor()) pts.push(orbitProject(q, yawDeg));
  if (p.load?.type === 'bar') {
    for (const s of [1, -1]) {
      for (const q of orbCircle(p.load.at[0], p.load.at[1], s * ORB_PLATE_Z, ORB_PLATE_R, 12)) pts.push(orbitProject(q, yawDeg));
    }
  }
  const h = orbitProject(J.head, yawDeg), r = FACE_GEOMETRY.HEAD_R * h[3] + 2;
  pts.push([h[0] - r, h[1] - r], [h[0] + r, h[1] + r]);
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** 整段动画的画框：取若干补间帧 × 若干偏航角的并集。框必须固定，否则人会在格子里缩放跳动。 */
export function orbitBox(A, B, interp, opts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i <= 16; i++) {
    const p = interp(A, B, i / 16, opts);
    for (const yaw of [-ORBIT_YAW, -ORBIT_YAW / 2, 0, ORBIT_YAW / 2, ORBIT_YAW]) {
      const e = orbitExtent(p, yaw);
      x0 = Math.min(x0, e.x0); y0 = Math.min(y0, e.y0); x1 = Math.max(x1, e.x1); y1 = Math.max(y1, e.y1);
    }
  }
  const padX = 8, padTop = 22;
  return { x: x0 - padX, y: y0 - padTop, w: x1 - x0 + padX * 2, h: y1 - y0 + padTop + 6 };
}

const f1 = (v) => v.toFixed(1);
const orbPoly = (pts, cls) => `<polygon class="${cls}" points="${pts.map((q) => `${f1(q[0])},${f1(q[1])}`).join(' ')}"/>`;
const orbLine = (a, b, cls) => `<line class="${cls}" x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}"/>`;

/**
 * 画一帧环绕视角。遮挡用画家算法：每个图元按深度从远到近画。
 * 近侧/远侧沿用侧视的约定（近侧实色、远侧 sk-far）——±30° 内近侧始终离读者更近，约定不会翻转。
 */
export function renderOrbit(p, { yaw = 0, box, prime = [], caption = '', plumb = false, name = '' } = {}) {
  const J = orbitLift(p);
  const P = (q) => orbitProject(q, yaw);
  const items = [];                         // [深度, svg]
  const add = (depth, svg) => items.push([depth, svg]);
  const seg = (a, b, cls, bias = 0) => {
    const A = P(a), B = P(b);
    add((A[2] + B[2]) / 2 + bias, orbLine(A, B, cls));
  };

  // 地面与足中线永远在最底层
  const under = [orbPoly(orbFloor().map(P), 'sk-floor')];
  // 地面网格：透视下近处格子大、远处格子小，平行线向远处收拢——近大远小靠它读出来
  for (const i of [-0.5, 0, 0.5]) {
    const x = MIDFOOT + i * ORB_FLOOR.x, z = i * ORB_FLOOR.z;
    under.push(orbLine(P([x, GROUND, -ORB_FLOOR.z]), P([x, GROUND, ORB_FLOOR.z]), 'sk-floor-grid'));
    under.push(orbLine(P([MIDFOOT - ORB_FLOOR.x, GROUND, z]), P([MIDFOOT + ORB_FLOOR.x, GROUND, z]), 'sk-floor-grid'));
  }
  if (plumb && p.load) {
    under.push(orbLine(P([MIDFOOT, GROUND, -ORB_FLOOR.z * 0.8]), P([MIDFOOT, GROUND, ORB_FLOOR.z * 0.8]), 'sk-midfoot sk-midfoot-3d'));
  }

  // 躯干：一块半透明的面（肩、髋四点）给出体积，中线仍是粗躯干线
  const torso = [J.shoulderN, J.shoulderF, J.hipF, J.hipN].map(P);
  add(torso.reduce((s, q) => s + q[2], 0) / 4 - 4, orbPoly(torso, 'sk-torso-plane'));
  seg(J.pelvis, J.neck, 'sk-trunk');
  seg(J.shoulderN, J.shoulderF, 'sk-limb sk-girdle');
  seg(J.hipN, J.hipF, 'sk-limb sk-girdle');
  seg(J.neck, o3mix(J.neck, J.head, 0.6), 'sk-neck');

  for (const tag of ['N', 'F']) {
    const far = tag === 'F' ? ' sk-far' : '';
    seg(J['hip' + tag], J['knee' + tag], 'sk-limb' + far);
    seg(J['knee' + tag], J['ankle' + tag], 'sk-limb' + far);
    seg(J['heel' + tag], J['toe' + tag], 'sk-foot' + far);
    seg(J['shoulder' + tag], J['elbow' + tag], 'sk-limb' + far);
    seg(J['elbow' + tag], J['wrist' + tag], 'sk-limb' + far);
    const h = P(J['wrist' + tag]);
    add(h[2] + 0.5, `<circle class="sk-hand${far}" cx="${f1(h[0])}" cy="${f1(h[1])}" r="4"/>`);
    if (!far) {
      for (const k of ['shoulder', 'hip', 'knee', 'ankle', 'elbow']) {
        const q = P(J[k + tag]);
        add(q[2] + 0.5, `<circle class="sk-joint" cx="${f1(q[0])}" cy="${f1(q[1])}" r="3.2"/>`);
      }
    }
  }

  // 主动肌：与侧视一致，只标近侧；躯干上的肌肉标在中线上
  const MJ = { shoulder: J.shoulderN, hip: J.hipN, knee: J.kneeN, ankle: J.ankleN, elbow: J.elbowN, wrist: J.wristN };
  for (const m of prime) {
    for (const [a, b, t0, t1] of MUSCLE_SEG[m] ?? []) {
      const trunk = a === 'shoulder' && b === 'hip';
      const A = trunk ? J.neck : MJ[a], B = trunk ? J.pelvis : MJ[b];
      if (!A || !B) continue;
      seg(o3mix(A, B, t0), o3mix(A, B, t1), 'sk-muscle', -1);
    }
  }

  // 头：球投影成圆。眼睛按朝向放在球面上，背向镜头的那只不画。
  const hc = P(J.head);
  add(hc[2], `<circle class="sk-head" cx="${f1(hc[0])}" cy="${f1(hc[1])}" r="${f1(FACE_GEOMETRY.HEAD_R * hc[3])}"/>`);
  const f = facing(name, p);
  if (f) {
    const t = yaw * Math.PI / 180;
    const view = [-Math.sin(t), 0, Math.cos(t)];
    for (const s of [1, -1]) {
      const n = [f[0] * 0.78, f[1] * 0.78, s * 0.62];
      if (o3dot(n, view) < 0.05) continue;
      const e = P([J.head[0] + n[0] * 7.5, J.head[1] + n[1] * 7.5, n[2] * 7.5]);
      add(hc[2] + 0.1, `<circle class="sk-eye" cx="${f1(e[0])}" cy="${f1(e[1])}" r="${f1(FACE_GEOMETRY.EYE_R * hc[3])}"/>`);
    }
  }

  // 杠铃：杠切成小段各自排序，近端才能正确地压在近侧肩上、远端藏在头颈后
  if (p.load?.type === 'bar') {
    const [bx, by] = p.load.at, n = 12;
    for (let i = 0; i < n; i++) {
      const z0 = -ORB_BAR + (2 * ORB_BAR * i) / n, z1 = -ORB_BAR + (2 * ORB_BAR * (i + 1)) / n;
      seg([bx, by, z0], [bx, by, z1], 'sk-bar');
    }
    for (const s of [1, -1]) {
      const ring = orbCircle(bx, by, s * ORB_PLATE_Z, ORB_PLATE_R).map(P);
      add(P([bx, by, s * ORB_PLATE_Z])[2], orbPoly(ring, 'sk-plate sk-plate-3d'));
    }
  }

  items.sort((a, b) => a[0] - b[0]);
  const over = [];
  if (plumb && p.load) {
    const [bx, by] = p.load.at;
    over.push(orbLine(P([bx, by, 0]), P([bx, GROUND, 0]), 'sk-plumb'));
  }
  const cap = caption && box
    ? `<text class="sk-caption" x="${f1(box.x + box.w / 2)}" y="${f1(box.y + 15)}">${caption}</text>` : '';
  return cap + under.join('') + items.map((i) => i[1]).join('') + over.join('');
}
