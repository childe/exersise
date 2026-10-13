// 骨架补间。
//
// 三条约束，按优先级：
//   1. 骨长不变        —— 链式构造保证，不是插值出来的
//   2. 脚不动          —— 踩地的姿态把踝钉死，链从踝往上建
//   3. 杠过足中线      —— 反解躯干角，而不是插值它
//
// 为什么不能简单插值关节坐标：两端点间走直线会让肢体在中间帧变短。
// 为什么根不能放在髋：髋做线性位移、腿靠角度推出去的话，踝会走一段圆弧，
// 脚就在地上前后滑——深蹲时脚是固定基座，髋才是动的那个。
// 为什么躯干角要反解不能插值：真实深蹲里小腿角、大腿角、躯干角是协调变化的，
// 正是这种协调让杠走直线。线性插值各角度不满足这个约束，杠会漂出去十几像素。
import { POSES, GROUND, MIDFOOT } from './skeleton.mjs';

const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const ang = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
const lerp = (a, b, t) => a + (b - a) * t;
// 最短弧：跨 ±π 时走近路，否则肢体会绕一整圈
const alerp = (a, b, t) => {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
};
const from = (base, a, l) => [base[0] + Math.cos(a) * l, base[1] + Math.sin(a) * l];

const flatOnGround = (p) => p.heel && p.toe
  && Math.abs(p.heel[1] - GROUND) <= 7 && Math.abs(p.toe[1] - GROUND) <= 7;

// 踝根链（脚踩地）与髋根链（卧/悬垂/坐姿器械）
const UP_FROM_ANKLE = [['knee','ankle'],['hip','knee']];
const FROM_HIP      = [['knee','hip'],['ankle','knee'],['knee2','hip'],['ankle2','knee2']];
const UPPER         = [['elbow','shoulder'],['wrist','elbow'],['head','shoulder'],
                       ['elbow2','shoulder2'],['wrist2','elbow2']];

/**
 * @param {object} A 起始姿态  @param {object} B 结束姿态  @param {number} t 0..1
 * @param {{plumb?: boolean}} opts plumb=true 时反解躯干角使杠过足中线
 */
export function interpolate(A, B, t, opts = {}) {
  const { plumb = true } = opts;
  const q = { view: A.view };   // 正视/侧视是姿态属性，丢了 facing() 会按侧视画一只眼
  const grounded = flatOnGround(A) && flatOnGround(B);
  const barOnShoulder = A.load?.anchor === 'shoulder'
    || (A.load && Math.abs(A.load.at[1] - A.shoulder[1]) < 14);

  if (grounded) {
    // 踝钉在起始帧的位置：一次重复里脚不动，这是地面接触的语义。
    // （两端点的脚位若本就不同，那是姿态数据的分歧，不该由补间来抹平。）
    q.ankle = [...A.ankle];
    for (const [c, p] of UP_FROM_ANKLE) q[c] = from(q[p], alerp(ang(A[p],A[c]), ang(B[p],B[c]), t), len(A[p],A[c]));
    // 远侧腿从髋往下建（两条腿共用一个髋）。原来这一分支只建近侧腿，
    // 正视图（帕洛夫）的动画帧里远侧腿、远侧脚全部消失。
    for (const [c, p] of [['knee2','hip'],['ankle2','knee2']]) {
      if (A[c] && B[c]) q[c] = from(q[p], alerp(ang(A[p],A[c]), ang(B[p],B[c]), t), len(A[p],A[c]));
    }
  } else {
    q.hip = [lerp(A.hip[0],B.hip[0],t), lerp(A.hip[1],B.hip[1],t)];
    for (const [c, p] of FROM_HIP) { if (A[c] && B[c]) q[c] = from(q[p], alerp(ang(A[p],A[c]), ang(B[p],B[c]), t), len(A[p],A[c])); }
  }

  // 躯干：能解就解，解不出来就退回插值（并在 _solved 上标出来）
  const tl = len(A.hip, A.shoulder);
  let th = alerp(ang(A.hip,A.shoulder), ang(B.hip,B.shoulder), t);
  q._solved = false;
  if (grounded && plumb && A.load && B.load && barOnShoulder) {
    const dx = lerp(A.load.at[0] - A.shoulder[0], B.load.at[0] - B.shoulder[0], t);
    const c = (MIDFOOT - dx - q.hip[0]) / tl;
    if (Math.abs(c) <= 1) {
      const a1 = Math.acos(c), a2 = -a1;
      const gap = (x) => { let v = x - th; while (v > Math.PI) v -= 2*Math.PI; while (v < -Math.PI) v += 2*Math.PI; return Math.abs(v); };
      th = gap(a1) < gap(a2) ? a1 : a2;   // 取离插值初值近的那一支
      q._solved = true;
    }
  }
  q.shoulder = from(q.hip, th, tl);
  if (A.shoulder2 && B.shoulder2) q.shoulder2 = from(q.hip, alerp(ang(A.hip,A.shoulder2), ang(B.hip,B.shoulder2), t), len(A.hip,A.shoulder2));

  for (const [c, p] of UPPER) {
    if (!A[c] || !B[c]) continue;
    const pa = A[p] ?? A.shoulder, pb = B[p] ?? B.shoulder, pn = q[p] ?? q.shoulder;
    // 手臂的投影长度在两端之间插值。腿与躯干两端等长（归一化保证），插值等于取 A；
    // 出平面 / 指向读者的手臂两端投影不同，必须随动作变——帕洛夫推出时前臂从 19.7 缩到 11.7。
    const l = lerp(len(pa, A[c]), len(pb, B[c]), t);
    q[c] = from(pn, alerp(ang(pa,A[c]), ang(pb,B[c]), t), l);
  }
  for (const [f, src] of [['heel','ankle'],['toe','ankle'],['heel2','ankle2'],['toe2','ankle2']]) {
    if (!A[f] || !B[f] || !q[src]) continue;
    if (grounded && (f === 'heel' || f === 'toe')) {
      // 脚平放在地时它是个刚体，踝也是脚上的固定点：踝已钉死，脚就原样搬过来。
      // 插值踝→脚的偏移会让脚在地上滑几像素——两端点的偏移本就不该不同。
      q[f] = [...A[f]];
      continue;
    }
    const oa = [A[f][0]-A[src][0], A[f][1]-A[src][1]], ob = [B[f][0]-B[src][0], B[f][1]-B[src][1]];
    q[f] = [q[src][0] + lerp(oa[0],ob[0],t), q[src][1] + lerp(oa[1],ob[1],t)];
  }
  if (A.load && B.load) {
    const anc = A.load.anchor ?? (barOnShoulder ? 'shoulder' : 'wrist');
    const base = q[anc] ?? q.wrist ?? q.shoulder;
    const ba = A[anc] ?? A.wrist ?? A.shoulder, bb = B[anc] ?? B.wrist ?? B.shoulder;
    q.load = { ...A.load, at: [base[0] + lerp(A.load.at[0]-ba[0], B.load.at[0]-bb[0], t),
                    base[1] + lerp(A.load.at[1]-ba[1], B.load.at[1]-bb[1], t)] };
    // 只回 at 不回 type 的话，load() 按 type 分发会落到 default 返回空串——
    // 动画里卧推变成空手上下挥、健腹轮没有轮。at2（第二只哑铃）跟着 wrist2 走。
    if (A.load.at2 && B.load.at2 && q.wrist2 && A.wrist2 && B.wrist2) {
      q.load.at2 = [q.wrist2[0] + lerp(A.load.at2[0]-A.wrist2[0], B.load.at2[0]-B.wrist2[0], t),
                    q.wrist2[1] + lerp(A.load.at2[1]-A.wrist2[1], B.load.at2[1]-B.wrist2[1], t)];
    }
  }
  if (A.bench && B.bench) q.bench = A.bench.map((v,i)=>lerp(v,B.bench[i],t));
  if (A.benchIncline) q.benchIncline = A.benchIncline;   // 凳子不动
  // 固定物（单杠、低杠）两帧必须相同（validateFixedRigs 断言），这里直接取 A，不插值
  if (A.fixed) q.fixed = { ...A.fixed, at: [...A.fixed.at] };
  return q;
}

/** 三条约束逐帧核验。 */
export function validateInterp(A, B, { steps = 24, plumb = true } = {}) {
  const errs = [];
  const LIMBS = [['hip','knee','大腿'],['knee','ankle','小腿'],['shoulder','elbow','上臂'],['elbow','wrist','前臂'],['hip','shoulder','躯干']];
  const grounded = flatOnGround(A) && flatOnGround(B);
  for (let i = 0; i <= steps; i++) {
    const t = i/steps, q = interpolate(A, B, t, { plumb });
    for (const [j1,j2,label] of LIMBS) {
      if (!A[j1]||!A[j2]||!B[j1]||!B[j2]||!q[j1]||!q[j2]) continue;
      // 对**两个**端点都比。只比 A 是同义反复——骨长就是从 A 取的，
      // 永远相等，这条断言会变成装饰。比 B 才能发现两帧骨长本身不一致：
      // 那种情况下动画的末帧对不上原始姿态，而画面上看不出来。
      const got = len(q[j1],q[j2]);
      const isArm = j1 === 'shoulder' && j2 === 'elbow' || j1 === 'elbow';
      if (isArm) {
        // 手臂投影长度允许随动作变，但只能在两端之间单调过渡
        const la = len(A[j1],A[j2]), lb = len(B[j1],B[j2]);
        if (got < Math.min(la,lb) - 0.5 || got > Math.max(la,lb) + 0.5) {
          errs.push(`t=${t.toFixed(2)} ${label}长度 ${got.toFixed(1)} 跑出两端范围 [${Math.min(la,lb).toFixed(1)}, ${Math.max(la,lb).toFixed(1)}]`);
        }
        continue;
      }
      for (const [ref, which] of [[len(A[j1],A[j2]),'起始'], [len(B[j1],B[j2]),'结束']]) {
        if (Math.abs(got-ref)/ref > 0.01) {
          errs.push(`t=${t.toFixed(2)} ${label}骨长与${which}帧不符 ${(Math.abs(got-ref)/ref*100).toFixed(1)}%`
            + `（补间 ${got.toFixed(1)} vs ${ref.toFixed(1)}）`);
        }
      }
    }
    if (grounded && Math.abs(q.heel[0]-A.heel[0]) > 0.5) errs.push(`t=${t.toFixed(2)} 脚在地上滑动 ${(q.heel[0]-A.heel[0]).toFixed(1)}px`);
    for (const k of ['heel','toe']) if (q[k] && q[k][1] > GROUND+8) errs.push(`t=${t.toFixed(2)} ${k}穿地`);
    if (q._solved && Math.abs(q.load.at[0]-MIDFOOT) > 0.5) errs.push(`t=${t.toFixed(2)} 杠偏离足中线 ${Math.abs(q.load.at[0]-MIDFOOT).toFixed(1)}px`);
  }
  return errs;
}
