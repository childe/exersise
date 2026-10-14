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
import { POSES, GROUND, MIDFOOT, torsoCoords, solveTorsoAngle } from './skeleton.mjs';

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
/**
 * 两骨 IK：肩 S、手 H 已定，求肘。l1/l2 是上臂/前臂长，near 用来在两个镜像解里选边。
 * 握在固定杠上的姿态用它：手钉在杠上、肩由身体决定，肘是解出来的，不是插出来的。
 */
export function ik2(S, H, l1, l2, near) {
  const dx = H[0]-S[0], dy = H[1]-S[1], d = Math.hypot(dx, dy) || 1e-6;
  const dc = Math.min(Math.max(d, Math.abs(l1-l2) + 1e-6), l1 + l2 - 1e-6);
  const a = (l1*l1 - l2*l2 + dc*dc) / (2*dc), h = Math.sqrt(Math.max(0, l1*l1 - a*a));
  const ux = dx/d, uy = dy/d, M = [S[0] + ux*a, S[1] + uy*a];
  const c1 = [M[0] - uy*h, M[1] + ux*h], c2 = [M[0] + uy*h, M[1] - ux*h];
  const dist = (c) => Math.hypot(c[0]-near[0], c[1]-near[1]);
  return dist(c1) <= dist(c2) ? c1 : c2;
}

const flatOnGround = (p) => p.heel && p.toe
  && Math.abs(p.heel[1] - GROUND) <= 7 && Math.abs(p.toe[1] - GROUND) <= 7;
const onG = (p, k) => p[k] && Math.abs(p[k][1] - GROUND) <= 7;
const lerp2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const UPPER = [['elbow','shoulder'],['wrist','elbow'],['head','shoulder'],['elbow2','shoulder2'],['wrist2','elbow2']];

/**
 * 运动链的根取决于什么在动作里是不动的：
 *   悬垂/反向划船  手在杠上      → 腕根，从手往下建
 *   站姿           整只脚踩地    → 踝根
 *   俯卧撑/平板    脚尖撑地      → 脚尖根（脚跟悬着，踝随脚尖）
 *   跪姿（健腹轮） 膝在地        → 膝根
 *   其余（卧姿）                 → 髋根
 * 根放错的症状都一样：支点在动画里漂。踝根之前漏了后三类，健腹轮的膝漂 8px 还沉到地面下。
 *
 * @param {object} A 起始姿态  @param {object} B 结束姿态  @param {number} t 0..1
 * @param {{plumb?: boolean}} opts plumb=true 时反解躯干角使负荷过足中线
 */
export function interpolate(A, B, t, opts = {}) {
  const { plumb = true } = opts;
  const q = { view: A.view, loadAnchor: A.loadAnchor };
  const wristRooted = !!(A.fixed && B.fixed && A.wrist && B.wrist);
  const heelRooted = wristRooted && onG(A,'heel') && onG(B,'heel');
  const grounded = !wristRooted && flatOnGround(A) && flatOnGround(B);
  // 跪姿脚尖也在地上，但支点是膝：膝先于脚尖判定
  const kneeRooted = !wristRooted && !grounded && onG(A,'knee') && onG(B,'knee');
  const toeRooted = !wristRooted && !grounded && !kneeRooted && onG(A,'toe') && onG(B,'toe');
  const seg = (parent, child) =>
    from(q[parent], alerp(ang(A[parent],A[child]), ang(B[parent],B[child]), t),
         lerp(len(A[parent],A[child]), len(B[parent],B[child]), t));

  // 握在固定杠上：手全程钉在杠上，肘由 IK 解出。杠不动，动的是身体。
  const armToBar = () => {
    q.wrist = [...A.wrist];
    const l1 = lerp(len(A.shoulder,A.elbow), len(B.shoulder,B.elbow), t);
    const l2 = lerp(len(A.elbow,A.wrist), len(B.elbow,B.wrist), t);
    const d = len(q.shoulder, q.wrist);
    // 投影退化：引体顶部手在杠上、肩与杠齐平，侧视里手几乎落在肩上（d≈6 < |l1−l2|）。
    // 这时链上的手臂本来就画不出来——画出来的那条由 arm.mjs 重建。标记一下，
    // 让骨长断言跳过这几帧，而不是去断言一条不会被画的线。
    q._ikClamped = d < Math.abs(l1 - l2) || d > l1 + l2;
    q.elbow = ik2(q.shoulder, q.wrist, l1, l2, lerp2(A.elbow, B.elbow, t));
  };
  const tl = len(A.hip, A.shoulder);
  let th = alerp(ang(A.hip,A.shoulder), ang(B.hip,B.shoulder), t);
  q._solved = false;

  if (heelRooted) {
    // 反向划船：脚跟是支点，身体近似一根刚体绕它转，手留在杠上。
    // 从腕往上建链的后果是肩沿圆弧甩出去——手离杠 23px、身体摆 32px。
    // 做法：把起始帧整体绕脚跟转 δ(t)，再按 t 线性补上「转完与结束帧」的残差，
    // 两端因此都精确（t=0 是 A，t=1 是 B），而支点全程不动。
    const P = A.heel;
    const d0 = ang(P, A.hip), d1 = ang(P, B.hip);
    const rot = (pt, d) => { const dx = pt[0]-P[0], dy = pt[1]-P[1];
      return [P[0] + dx*Math.cos(d) - dy*Math.sin(d), P[1] + dx*Math.sin(d) + dy*Math.cos(d)]; };
    let dd = d1 - d0; while (dd > Math.PI) dd -= 2*Math.PI; while (dd < -Math.PI) dd += 2*Math.PI;
    for (const k of ['shoulder','hip','knee','ankle','head','shoulder2','knee2','ankle2']) {
      if (!A[k] || !B[k]) continue;
      const r = rot(A[k], dd * t), rf = rot(A[k], dd);
      q[k] = [r[0] + (B[k][0] - rf[0]) * t, r[1] + (B[k][1] - rf[1]) * t];
    }
    armToBar();
  } else if (wristRooted) {
    // 悬垂：杠不动，人整体向杠移动。肩相对杠的位置直接插值，躯干以下照常建链。
    // （原先从腕经肘建到肩：肘角取自**未重建**的出平面坐标，肩因此绕出一段圆弧。）
    const bar = A.fixed.at;
    q.shoulder = [bar[0] + lerp(A.shoulder[0]-bar[0], B.shoulder[0]-bar[0], t),
                  bar[1] + lerp(A.shoulder[1]-bar[1], B.shoulder[1]-bar[1], t)];
    q.hip = from(q.shoulder, alerp(ang(A.shoulder,A.hip), ang(B.shoulder,B.hip), t), tl);
    q.knee = seg('hip','knee'); q.ankle = seg('knee','ankle');
    q.head = from(q.shoulder, alerp(ang(A.shoulder,A.head), ang(B.shoulder,B.head), t), lerp(len(A.shoulder,A.head), len(B.shoulder,B.head), t));
    armToBar();
  } else {
    if (grounded) { q.ankle = [...A.ankle]; q.knee = seg('ankle','knee'); q.hip = seg('knee','hip'); }
    else if (toeRooted) {
      q.toe = [...A.toe];
      q.ankle = [q.toe[0] + lerp(A.ankle[0]-A.toe[0], B.ankle[0]-B.toe[0], t),
                 q.toe[1] + lerp(A.ankle[1]-A.toe[1], B.ankle[1]-B.toe[1], t)];
      q.knee = seg('ankle','knee'); q.hip = seg('knee','hip');
    } else if (kneeRooted) { q.knee = [...A.knee]; q.hip = seg('knee','hip'); q.ankle = seg('knee','ankle'); }
    else { q.hip = lerp2(A.hip, B.hip, t); q.knee = seg('hip','knee'); q.ankle = seg('knee','ankle'); }

    // 躯干：站姿持械且 plumb 时反解，让负荷落在足中线上。
    // 负荷相对肩的偏移是世界坐标下的量——肩锚直接插值；腕锚由手臂方向算出。
    if (grounded && plumb && A.load && B.load && (A.loadAnchor === 'shoulder' || A.loadAnchor === 'wrist')) {
      let off;
      if (A.loadAnchor === 'shoulder') {
        // 架在肩上的杠随躯干转，所以偏移取躯干系并在躯干系里插值，角度用同一个闭式解。
        // 用世界偏移的话杠会在肩上来回滑（高杠 7px），因为躯干角在一次重复里变了 20°。
        const oa = torsoCoords(A.hip, A.shoulder, A.load.at), ob = torsoCoords(B.hip, B.shoulder, B.load.at);
        const a = lerp(oa[0], ob[0], t), b2 = lerp(oa[1], ob[1], t);
        const sol = solveTorsoAngle(q.hip[0], a, b2, tl, th);
        if (sol !== null) { th = sol; q._solved = true; q._torsoOff = [a, b2]; }
        off = null;
      } else {
        const ua = alerp(ang(A.shoulder,A.elbow), ang(B.shoulder,B.elbow), t), ul = lerp(len(A.shoulder,A.elbow), len(B.shoulder,B.elbow), t);
        const fa = alerp(ang(A.elbow,A.wrist), ang(B.elbow,B.wrist), t), fl = lerp(len(A.elbow,A.wrist), len(B.elbow,B.wrist), t);
        const lo = lerp2([A.load.at[0]-A.wrist[0], A.load.at[1]-A.wrist[1]], [B.load.at[0]-B.wrist[0], B.load.at[1]-B.wrist[1]], t);
        off = [Math.cos(ua)*ul + Math.cos(fa)*fl + lo[0], Math.sin(ua)*ul + Math.sin(fa)*fl + lo[1]];
      }
      const c = off === null ? 2 : (MIDFOOT - off[0] - q.hip[0]) / tl;
      if (Math.abs(c) <= 1) {
        const a1 = Math.acos(c), a2 = -a1;
        const gap = (x) => { let v = x - th; while (v > Math.PI) v -= 2*Math.PI; while (v < -Math.PI) v += 2*Math.PI; return Math.abs(v); };
        th = gap(a1) < gap(a2) ? a1 : a2;
        q._solved = true;
      }
    }
    q.shoulder = from(q.hip, th, tl);
  }
  // 远侧腿从髋建（两条腿共用一个髋）。
  // 但两帧的远侧踝若在同一点，它就是第二个接触点（保加利亚的后脚搭在凳上）——
  // 自由摆出来的话中途会离开凳面 12.5px 并穿进凳板。钉死它，膝由两骨 IK 解。
  const ankle2Pinned = A.ankle2 && B.ankle2 && Math.hypot(A.ankle2[0]-B.ankle2[0], A.ankle2[1]-B.ankle2[1]) < 1;
  if (ankle2Pinned) {
    q.ankle2 = [...A.ankle2];
    // 脚背搭在凳上：脚是刚体且贴着凳面，不跟着小腿一起转（原来末帧整条脚线陷进凳板 5.2px）
    if (A.heel2 && B.heel2) q._pinFoot2 = true;
    q.knee2 = ik2(q.hip, q.ankle2, lerp(len(A.hip,A.knee2), len(B.hip,B.knee2), t),
      lerp(len(A.knee2,A.ankle2), len(B.knee2,B.ankle2), t), lerp2(A.knee2, B.knee2, t));
  } else {
    for (const [c, p] of [['knee2','hip'],['ankle2','knee2']]) if (A[c] && B[c]) q[c] = seg(p, c);
  }
  if (A.shoulder2 && B.shoulder2) q.shoulder2 = from(q.hip, alerp(ang(A.hip,A.shoulder2), ang(B.hip,B.shoulder2), t), len(A.hip,A.shoulder2));
  // 正视图的肩线中点：不透传的话补间帧没有 shoulderMid，躯干改接在近侧肩上、
  // 肩线整条消失——动画一开播躯干就横跳 16px。
  if (A.shoulderMid && B.shoulderMid && q.shoulder && q.shoulder2)
    q.shoulderMid = [(q.shoulder[0] + q.shoulder2[0]) / 2, (q.shoulder[1] + q.shoulder2[1]) / 2];
  for (const [c, p] of UPPER) {
    if (!A[c] || !B[c]) continue;
    if (wristRooted && (c === 'elbow' || c === 'wrist' || c === 'head')) continue;   // 手钉在杠上，肘已由 IK 解出
    const pa = A[p] ?? A.shoulder, pb = B[p] ?? B.shoulder, pn = q[p] ?? q.shoulder;
    // 手臂的投影长度在两端之间插值（出平面/指向读者的手臂两端投影不同）；腿与躯干两端等长，插值等于取 A
    q[c] = from(pn, alerp(ang(pa,A[c]), ang(pb,B[c]), t), lerp(len(pa,A[c]), len(pb,B[c]), t));
  }
  // 坐姿器械：身体被凳子固定，动的是把手。把手走的是器械定的一条路径，
  // 所以直接插值手的位置、再用 IK 解肘——而不是插值两段的极角。
  // 插极角会出事：下拉的上臂极角两端差 210°，alerp 取最短弧就从头顶往**身后**扫，
  // 与前臂在中途重合，肘角折到 4.4°、把手撞进头里，而两端静态帧都合格。
  if (opts.handPath && A.wrist && B.wrist && A.elbow && B.elbow) {
    const rel = (p) => [p.wrist[0] - p.shoulder[0], p.wrist[1] - p.shoulder[1]];
    const ra = rel(A), rb = rel(B);
    q.wrist = [q.shoulder[0] + lerp(ra[0], rb[0], t), q.shoulder[1] + lerp(ra[1], rb[1], t)];
    q.elbow = ik2(q.shoulder, q.wrist,
      lerp(len(A.shoulder, A.elbow), len(B.shoulder, B.elbow), t),
      lerp(len(A.elbow, A.wrist), len(B.elbow, B.wrist), t),
      lerp2(A.elbow, B.elbow, t));
    if (A.wrist2 && B.wrist2 && A.elbow2 && B.elbow2) {
      const s2 = q.shoulder2 ?? q.shoulder, a2 = A.shoulder2 ?? A.shoulder, b2 = B.shoulder2 ?? B.shoulder;
      q.wrist2 = [s2[0] + lerp(A.wrist2[0]-a2[0], B.wrist2[0]-b2[0], t), s2[1] + lerp(A.wrist2[1]-a2[1], B.wrist2[1]-b2[1], t)];
      q.elbow2 = ik2(s2, q.wrist2, lerp(len(a2,A.elbow2), len(b2,B.elbow2), t),
        lerp(len(A.elbow2,A.wrist2), len(B.elbow2,B.wrist2), t), lerp2(A.elbow2, B.elbow2, t));
    }
  }
  // 俯撑家族（手与脚尖/膝都在地上）：手臂与身体各自插值后手会离地几像素。
  // 真实动作是身体绕脚尖/膝这个支点转动、手始终按在地上，所以这里对整条链
  // 绕支点转一个角 δ，使腕回到地面——与站姿"反解躯干角让杠过足中线"是同一类解。
  // 负荷先算：第二接触点的求解要知道轮心在哪（健腹轮贴地的是轮，不是手）
  if (A.load && B.load && q._torsoOff) {
    // 肩锚：负荷在躯干系里的位置是插出来的，这里按解出的躯干角放回世界坐标
    const dth = Math.atan2(q.shoulder[1]-q.hip[1], q.shoulder[0]-q.hip[0]);
    const uu = [Math.cos(dth), Math.sin(dth)], nn = [-uu[1], uu[0]];
    const [a, b2] = q._torsoOff;
    q.load = { ...A.load, at: [q.shoulder[0] + a*uu[0] + b2*nn[0], q.shoulder[1] + a*uu[1] + b2*nn[1]] };
  } else if (A.load && B.load && A.load.type === 'pad' && (A.loadAnchor === 'ankle' || A.loadAnchor === 'knee')) {
    // 压在肢体上的滚轮垫：位置写在该肢体的局部系里、长轴垂直于肢体。
    // 从 A 帧原样抄 padAngle 的后果是动画末帧的垫子与静态结束帧差 89–109°——
    // 从「横压在小腿上」翻成「顺着小腿立起来」。
    const joint = A.loadAnchor, base = joint === 'ankle' ? 'knee' : 'hip';
    const loc = (p) => {
      const d = [p[joint][0] - p[base][0], p[joint][1] - p[base][1]], L = Math.hypot(d[0], d[1]) || 1;
      const u = [d[0] / L, d[1] / L], n = [-u[1], u[0]];
      const v = [p.load.at[0] - p[joint][0], p.load.at[1] - p[joint][1]];
      return [v[0] * u[0] + v[1] * u[1], v[0] * n[0] + v[1] * n[1]];
    };
    const la = loc(A), lb = loc(B);
    const aa = lerp(la[0], lb[0], t), bb = lerp(la[1], lb[1], t);
    const d = [q[joint][0] - q[base][0], q[joint][1] - q[base][1]], L = Math.hypot(d[0], d[1]) || 1;
    const u = [d[0] / L, d[1] / L], n = [-u[1], u[0]];
    q.load = { ...A.load,
      at: [q[joint][0] + aa * u[0] + bb * n[0], q[joint][1] + aa * u[1] + bb * n[1]],
      padAngle: Math.atan2(u[1], u[0]) };
  } else if (A.load && B.load) {
    const anc = A.loadAnchor ?? 'wrist';
    const base = q[anc] ?? q.wrist ?? q.shoulder, ba = A[anc] ?? A.wrist ?? A.shoulder, bb = B[anc] ?? B.wrist ?? B.shoulder;
    // 展开保留 type 等字段：只回 at 的话 load() 按 type 分发落到 default 返回空串
    q.load = { ...A.load, at: [base[0] + lerp(A.load.at[0]-ba[0], B.load.at[0]-bb[0], t), base[1] + lerp(A.load.at[1]-ba[1], B.load.at[1]-bb[1], t)] };
    if (A.load.at2 && B.load.at2) {
      q.load.at2 = (q.wrist2 && A.wrist2 && B.wrist2)
        ? [q.wrist2[0] + lerp(A.load.at2[0]-A.wrist2[0], B.load.at2[0]-B.wrist2[0], t), q.wrist2[1] + lerp(A.load.at2[1]-A.wrist2[1], B.load.at2[1]-B.wrist2[1], t)]
        : lerp2(A.load.at2, B.load.at2, t);   // 没有远侧手臂时直接插值，不能冻结在 A
    }
  }
  // 第二接触点：链只钉得住一个支点，另一个接触点会在中途离面。
  // 统一的解法是绕支点转一个角 δ，把它送回去——与站姿「反解躯干角让杠过足中线」同类。
  //   俯撑家族：支点是脚尖/膝，要送回地面的是手；
  //   健腹轮：手离地 16px，真正贴地的是**轮底**（原来只看手，轮因此中途沉进地面 3.2px）；
  //   仰卧家族：支点是脚，要送回地面的是上背（肩漂 4.8px、头圆陷地 2.05px）。
  const supine = grounded && onG(A,'shoulder') && onG(B,'shoulder');
  const pivotable = (toeRooted || kneeRooted || supine) && q.wrist;
  if (pivotable) {
    const P = toeRooted ? q.toe : kneeRooted ? q.knee : q.ankle;
    const keys = ['ankle','knee','hip','shoulder','shoulder2','elbow','wrist','head','elbow2','wrist2','knee2','ankle2','heel','toe','heel2','toe2'];
    const rot = (pt, d) => { const dx = pt[0]-P[0], dy = pt[1]-P[1]; return [P[0] + dx*Math.cos(d) - dy*Math.sin(d), P[1] + dx*Math.sin(d) + dy*Math.cos(d)]; };
    // 要送回地面的那个点，以及它贴地时的目标 y
    let probe = null, target = GROUND;
    if (supine) { probe = () => q.shoulder; target = A.shoulder[1]; }
    else if (onG(A,'wrist') && onG(B,'wrist')) probe = () => q.wrist;
    else if (q.load?.type === 'wheel') { probe = () => q.load.at; target = GROUND - 9; }
    if (probe) {
      const yAt = (d) => rot(probe(), d)[1];
      let lo = -0.3, hi = 0.3;
      if ((yAt(lo) - target) * (yAt(hi) - target) < 0) {
        for (let i = 0; i < 40; i++) { const mid = (lo+hi)/2; if ((yAt(mid)-target) * (yAt(lo)-target) <= 0) hi = mid; else lo = mid; }
        const d = (lo+hi)/2;
        for (const k of keys) if (q[k] && q[k] !== P) q[k] = rot(q[k], d);
        if (q.load) q.load = { ...q.load, at: rot(q.load.at, d) };
        q._pivoted = d;
      }
    }
  }
  for (const [f, src] of [['heel','ankle'],['toe','ankle'],['heel2','ankle2'],['toe2','ankle2']]) {
    if (!A[f] || !B[f] || !q[src]) continue;
    if (grounded && (f === 'heel' || f === 'toe')) { q[f] = [...A[f]]; continue; }   // 脚是刚体，踝钉死脚就不动
    if (toeRooted && f === 'toe') continue;                                        // 已钉
    if (q._pinFoot2 && (f === 'heel2' || f === 'toe2')) { q[f] = [...A[f]]; continue; }
    // 脚相对踝的偏移插极坐标，不插直角坐标：弦比弧短，直角插值会让脚在中途缩水——
    // 腿屈伸中段脚长比结束帧短 30%，腿弯举中段脚跟只剩离踝 1.0px（关节圆半径就是 3.2）。
    // 这是第三轮「所有图一律拉弦」那条在脚上的残留。
    const oa = [A[f][0]-A[src][0], A[f][1]-A[src][1]], ob = [B[f][0]-B[src][0], B[f][1]-B[src][1]];
    const fa = alerp(Math.atan2(oa[1], oa[0]), Math.atan2(ob[1], ob[0]), t);
    const fl = lerp(Math.hypot(oa[0], oa[1]), Math.hypot(ob[0], ob[1]), t);
    q[f] = [q[src][0] + Math.cos(fa) * fl, q[src][1] + Math.sin(fa) * fl];
  }
  if (A.bench && B.bench) q.bench = A.bench.map((v, i) => lerp(v, B.bench[i], t));
  if (A.benchIncline) q.benchIncline = A.benchIncline;   // 凳子不动
  if (A.fixed) q.fixed = { ...A.fixed, at: [...A.fixed.at] };   // 固定物不动
  q._root = heelRooted ? 'heel' : wristRooted ? 'bar' : grounded ? 'ankle' : toeRooted ? 'toe' : kneeRooted ? 'knee' : 'hip';
  return q;
}

/** 逐帧核验：骨长、支点不漂、不穿地、杠过足中线、端点与静态帧一致。 */
export function validateInterp(A, B, { steps = 24, plumb = true } = {}) {
  const errs = [];
  const LIMBS = [['hip','knee','大腿'],['knee','ankle','小腿'],['shoulder','elbow','上臂'],['elbow','wrist','前臂'],['hip','shoulder','躯干']];
  const JOINTS = ['head','shoulder','elbow','wrist','hip','knee','ankle','heel','toe','shoulder2','elbow2','wrist2','knee2','ankle2','heel2','toe2'];
  for (let i = 0; i <= steps; i++) {
    const t = i/steps, q = interpolate(A, B, t, { plumb });
    for (const [j1,j2,label] of LIMBS) {
      if (!A[j1]||!A[j2]||!B[j1]||!B[j2]||!q[j1]||!q[j2]) continue;
      const got = len(q[j1],q[j2]);
      const isArm = (j1 === 'shoulder' && j2 === 'elbow') || j1 === 'elbow';
      if (isArm && q._ikClamped) continue;
      if (isArm) {
        const la = len(A[j1],A[j2]), lb = len(B[j1],B[j2]);
        if (got < Math.min(la,lb) - 0.5 || got > Math.max(la,lb) + 0.5)
          errs.push(`t=${t.toFixed(2)} ${label}长度 ${got.toFixed(1)} 跑出两端范围 [${Math.min(la,lb).toFixed(1)}, ${Math.max(la,lb).toFixed(1)}]`);
        continue;
      }
      for (const [ref, which] of [[len(A[j1],A[j2]),'起始'], [len(B[j1],B[j2]),'结束']]) {
        if (Math.abs(got-ref)/ref > 0.01) errs.push(`t=${t.toFixed(2)} ${label}骨长与${which}帧不符 ${(Math.abs(got-ref)/ref*100).toFixed(1)}%`);
      }
    }
    // 支点不漂
    const pin = { ankle: 'heel', toe: 'toe', knee: 'knee', heel: 'heel' }[q._root];
    if (pin && q[pin] && Math.abs(q[pin][0]-A[pin][0]) + Math.abs(q[pin][1]-A[pin][1]) > 0.5)
      errs.push(`t=${t.toFixed(2)} 支点 ${pin} 漂移 ${Math.hypot(q[pin][0]-A[pin][0], q[pin][1]-A[pin][1]).toFixed(1)}px`);
    for (const k of JOINTS) if (q[k] && q[k][1] > GROUND + 3) errs.push(`t=${t.toFixed(2)} ${k} 穿地 ${(q[k][1]-GROUND).toFixed(1)}px`);
    if (q._solved && Math.abs(q.load.at[0]-MIDFOOT) > 0.5) errs.push(`t=${t.toFixed(2)} 杠偏离足中线 ${Math.abs(q.load.at[0]-MIDFOOT).toFixed(1)}px`);
  }
  // 端点必须回到静态帧：t=1 与 B 的肩/髋/膝差 ≤3px。两帧脚位不一致时这里会报——那正是要报的。
  const q1 = interpolate(A, B, 1, { plumb });
  for (const k of ['hip','shoulder','knee']) {
    if (!q1[k] || !B[k]) continue;
    const d = Math.hypot(q1[k][0]-B[k][0], q1[k][1]-B[k][1]);
    if (d > 3) errs.push(`t=1 的 ${k} 与结束帧差 ${d.toFixed(1)}px（动画末帧不是静态帧那张图）`);
  }
  return errs;
}
