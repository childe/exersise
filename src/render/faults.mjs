// 错误示范：在正确动作的补间姿态上叠加「错误」变换。
//
// 错误示范图不另画一套人：它从正确动作的同一副姿态出发，只把出错的那一处改掉——
// 躯干多倾多少度、髋多沉多少像素、膝往里扣多少。这样读者看到的差别就**只有**那一个错误，
// 而灰色的正确动作影子叠在同一格里，差多少一眼可量。
//
// 变换分两层：
//   · 2D（faultPose2D）：作用在侧视姿态上，器械跟着身体走（杠在肩上、哑铃在手里）。
//     改完的姿态再交给 orbitLift 抬成 3D，手臂按真骨长重解——骨长不会被变换弄坏。
//   · 3D（faultJoints3D）：只有在 3D 里才有的错误——膝内扣、躯干侧倾 / 旋转、两只手不同步。
//
// 每个变换带一条随动作进程变化的强度曲线（prof）。u 是补间进度（0 = 起始帧，1 = 结束帧），
// half 是动画的哪一半：0 = 从起始走向结束，1 = 走回来。「起身时髋先抬」只在走回来的那一半出现。

const FLT_RAD = Math.PI / 180;

/** 强度曲线：返回 0…1。 */
export function faultWeight(prof, u, half) {
  switch (prof ?? 'u') {
    case 'u': return u;                                  // 越接近结束帧越明显
    case 'u2': return u * u;                             // 前半程几乎没有、到底才明显（踮脚跟只在蹲深时出现）
    case 'late': return u < 0.6 ? 0 : (u - 0.6) / 0.4;         // 进度过六成才开始（先挪重心、再踮脚跟）
    case 'early': return 1 - (1 - u) ** 2;               // 前半程就基本到位（先把重心送过去）
    case '1-u': return 1 - u;                            // 越接近起始帧越明显
    case 'mid': return Math.sin(Math.PI * u);            // 行程中段最明显
    case 'up': return half === 1 ? Math.sin(Math.PI * u) : 0;      // 只在返回的那一半
    case 'down': return half === 0 ? Math.sin(Math.PI * u) : 0;    // 只在去程
    case 'const': return 1;
    default: throw new Error(`未知的强度曲线 ${prof}`);
  }
}

/** 一个变换在 (u, half) 的强度：op.from 让它晚一点开始（进度过 from 才从 0 爬起）。 */
export function opWeight(op, u, half) {
  const v = op.from ? Math.max(0, (u - op.from) / (1 - op.from)) : u;
  return faultWeight(op.prof, v, half);
}

const fltRot = (q, c, deg) => {
  const a = deg * FLT_RAD, cs = Math.cos(a), sn = Math.sin(a);
  const dx = q[0] - c[0], dy = q[1] - c[1];
  return [c[0] + dx * cs - dy * sn, c[1] + dx * sn + dy * cs];
};
const fltAdd = (q, d) => [q[0] + d[0], q[1] + d[1]];
const FLT_UPPER = ['head', 'shoulder', 'shoulder2', 'shoulderMid', 'elbow', 'elbow2', 'wrist', 'wrist2'];
const FLT_ARM = ['elbow', 'elbow2', 'wrist', 'wrist2'];

/** 两骨 IK（2D）：肘 / 膝落在离 hint 近的那一支。 */
function fltIk(A, C, l1, l2, hint) {
  const dx = C[0] - A[0], dy = C[1] - A[1], d0 = Math.hypot(dx, dy) || 1e-6;
  const d = Math.min(Math.max(d0, Math.abs(l1 - l2) + 1e-6), l1 + l2 - 1e-6);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d0, uy = dy / d0, M = [A[0] + ux * a, A[1] + uy * a];
  const c1 = [M[0] - uy * h, M[1] + ux * h], c2 = [M[0] + uy * h, M[1] - ux * h];
  return Math.hypot(c1[0] - hint[0], c1[1] - hint[1]) <= Math.hypot(c2[0] - hint[0], c2[1] - hint[1]) ? c1 : c2;
}

/** 负荷是否跟着上半身走：挂在肩上或手里的跟，压在腿上的（腿屈伸的垫、腿举的踏板）不跟。 */
const fltLoadUpper = (p) => p.load && (p.loadAnchor === 'shoulder' || p.loadAnchor === 'wrist');

function fltMoveLoad(q, f) {
  if (!q.load) return;
  q.load = { ...q.load, at: f(q.load.at) };
  if (q.load.at2) q.load.at2 = f(q.load.at2);
}

/**
 * 2D 变换。返回新姿态，不改原姿态（POSES 是共享的）。
 *   trunk  {deg}      上半身（头、肩、手臂、手里/肩上的负荷）绕髋转 deg°（屏幕坐标，顺时针为正）
 *   arm    {deg}      手臂（肘、手，以及手里的负荷）绕肩转
 *   hip    {dx, dy}   髋往 (dx, dy) 方向挪：肩不动、躯干长不变，膝按大小腿长重解（踝不动）
 *   heel   {deg}      脚跟离地：脚绕脚尖转，踝以上整体随踝平移
 *   shrug  {px}       耸肩：肩（连同手臂和手里的负荷）上提，颈与躯干线不动
 *   load   {dx, dy}   只挪负荷与握着它的手（杠离开腿往前飘）
 */
export function faultPose2D(p, fault, u, half) {
  if (!fault?.ops?.length) return p;
  let q = { ...p };
  for (const op of fault.ops) {
    const w = opWeight(op, u, half);
    if (!w) continue;
    switch (op.op) {
      case 'trunk': {
        const c = q.hip, f = (x) => fltRot(x, c, op.deg * w);
        const S0 = q.shoulder, pre = { ...q, load: q.load && { ...q.load } };
        for (const k of FLT_UPPER) if (q[k]) q[k] = f(q[k]);
        const moveLoad = op.load !== false && fltLoadUpper(q);
        if (moveLoad) fltMoveLoad(q, f);
        // keepArms：手臂保持世界方向（仍朝正上方推），负荷只随肩平移，不跟着躯干转。
        // 写曲线名（如 '1-u'）时按强度在「跟着躯干转」与「保持世界方向」之间混合：
        // 上斜凳调陡后，底部哑铃仍落在胸上段（跟躯干走），只有推到顶的方向是竖直的（世界方向）
        if (op.keepArms) {
          const k = op.keepArms === true ? 1 : faultWeight(op.keepArms, u, half);
          const dS = [q.shoulder[0] - S0[0], q.shoulder[1] - S0[1]];
          const mix = (a, b) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
          for (const kk of FLT_ARM) if (pre[kk]) q[kk] = mix(q[kk], fltAdd(pre[kk], dS));
          if (moveLoad && pre.load) {
            q.load = { ...q.load, at: mix(q.load.at, fltAdd(pre.load.at, dS)) };
            if (pre.load.at2) q.load.at2 = mix(q.load.at2, fltAdd(pre.load.at2, dS));
          }
        }
        // bench: true —— 上斜凳的靠背跟着躯干一起转（凳面角度调错这类错误）
        if (op.bench && !q.benchIncline) throw new Error('trunk 的 bench 选项只适用于上斜凳（benchIncline）；平凳与坐姿靠背不随躯干转 / 已由 orbit 按躯干生成');
        if (op.bench && q.benchIncline) {
          const B = q.benchIncline, a = op.deg * w * FLT_RAD;
          q.benchIncline = { ...B, from: f(B.from), to: f(B.to), n: [B.n[0] * Math.cos(a) - B.n[1] * Math.sin(a), B.n[0] * Math.sin(a) + B.n[1] * Math.cos(a)] };
        }
        break;
      }
      case 'arm': {
        const sides = op.side === 'far' ? ['2'] : op.side === 'near' ? [''] : ['', '2'];
        for (const s of sides) {
          const S = q['shoulder' + s] ?? q.shoulder;
          for (const k of ['elbow', 'wrist']) if (q[k + s]) q[k + s] = fltRot(q[k + s], S, op.deg * w);
        }
        if (op.load !== false && q.load && q.loadAnchor === 'wrist') {
          // 只转被转的那一侧手里的负荷：at 在近侧手、at2 在远侧手
          const L = { ...q.load };
          if (op.side !== 'far') L.at = fltRot(L.at, q.shoulder, op.deg * w);
          if (L.at2 && op.side !== 'near') L.at2 = fltRot(L.at2, q.shoulder2 ?? q.shoulder, op.deg * w);
          if (op.side === 'far' && !L.at2) break;   // 只有一件负荷（杠）时它在两手之间，转一侧手不该带走它
          q.load = L;
        }
        break;
      }
      case 'hip': {
        const S = q.shoulder, H0 = q.hip, tl = Math.hypot(H0[0] - S[0], H0[1] - S[1]);
        const T = [H0[0] + op.dx * w, H0[1] + op.dy * w];
        const v = [T[0] - S[0], T[1] - S[1]], vl = Math.hypot(v[0], v[1]) || 1;
        let H = [S[0] + v[0] * tl / vl, S[1] + v[1] * tl / vl];
        // 腿够不到（髋挪得太远、膝已伸直）：髋停在「离肩一个躯干长」与「离踝一条伸直的腿长」两圆的交点上
        const A0 = q.ankle, K0 = q.knee;
        if (A0 && K0) {
          const reach = Math.hypot(K0[0] - H0[0], K0[1] - H0[1]) + Math.hypot(A0[0] - K0[0], A0[1] - K0[1]) - 0.01;
          if (Math.hypot(H[0] - A0[0], H[1] - A0[1]) > reach) { H = fltIk(S, A0, tl, reach, H); q._faultClamped = true; }
        }
        for (const s of ['', '2']) {
          const K = q['knee' + s], A = q['ankle' + s];
          if (!K || !A) continue;
          const l1 = Math.hypot(K[0] - H0[0], K[1] - H0[1]), l2 = Math.hypot(A[0] - K[0], A[1] - K[1]);
          q['knee' + s] = fltIk(H, A, l1, l2, K);
        }
        // 头随躯干一起转（绕肩），否则多出一个没人要的仰头 / 低头
        const a0 = Math.atan2(S[1] - H0[1], S[0] - H0[0]), a1 = Math.atan2(S[1] - H[1], S[0] - H[0]);
        if (q.head) q.head = fltRot(q.head, S, (a1 - a0) / FLT_RAD);
        q.hip = H;
        break;
      }
      case 'shift': {
        // 髋连同整个上半身（和肩上 / 手里的负荷）平移，踝不动、膝按大小腿长重解
        const d = [op.dx * w, op.dy * w], H0 = q.hip, H = fltAdd(H0, d);
        for (const s of ['', '2']) {
          const K = q['knee' + s], A = q['ankle' + s];
          if (!K || !A) continue;
          const l1 = Math.hypot(K[0] - H0[0], K[1] - H0[1]), l2 = Math.hypot(A[0] - K[0], A[1] - K[1]);
          if (Math.hypot(H[0] - A[0], H[1] - A[1]) > l1 + l2 - 0.01) q._faultClamped = true;
          q['knee' + s] = fltIk(H, A, l1, l2, K);
        }
        q.hip = H;
        for (const k of FLT_UPPER) if (q[k]) q[k] = fltAdd(q[k], d);
        if (fltLoadUpper(q)) fltMoveLoad(q, (x) => fltAdd(x, d));
        break;
      }
      case 'foot': {
        // 一只脚整体前后挪（脚踩的位置不对），髋不动、膝按大小腿长重解
        // 没有第二套腿的姿态（3D 里远侧腿是近侧的镜像）：先把近侧抄一份给远侧，只挪要挪的那只
        if (!q.knee2) for (const k of ['knee', 'ankle', 'heel', 'toe']) q[k + '2'] = q[k];
        const s = op.side === 'far' ? '2' : '';
        const d = [op.dx * w, (op.dy ?? 0) * w], K = q['knee' + s], A0 = q['ankle' + s];
        const l1 = Math.hypot(K[0] - q.hip[0], K[1] - q.hip[1]), l2 = Math.hypot(A0[0] - K[0], A0[1] - K[1]);
        for (const k of ['ankle', 'heel', 'toe']) if (q[k + s]) q[k + s] = fltAdd(q[k + s], d);
        if (Math.hypot(q.hip[0] - q['ankle' + s][0], q.hip[1] - q['ankle' + s][1]) > l1 + l2 - 0.01) q._faultClamped = true;
        q['knee' + s] = fltIk(q.hip, q['ankle' + s], l1, l2, K);
        break;
      }
      case 'heel': {
        const shift = {};
        for (const s of ['', '2']) {
          const T = q['toe' + s];
          if (!T) continue;
          const A0 = q['ankle' + s];
          // 人朝右时脚跟在脚尖左边，抬脚跟是绕脚尖顺时针转（屏幕坐标）；朝左反之
          const dir = (q['heel' + s][0] < T[0]) ? 1 : -1;
          q['heel' + s] = fltRot(q['heel' + s], T, dir * op.deg * w);
          q['ankle' + s] = fltRot(A0, T, dir * op.deg * w);
          shift[s] = [q['ankle' + s][0] - A0[0], q['ankle' + s][1] - A0[1]];
        }
        const d = shift[''] ?? [0, 0];
        for (const k of [...FLT_UPPER, 'hip', 'knee']) if (q[k]) q[k] = fltAdd(q[k], d);
        if (q.knee2) q.knee2 = fltAdd(q.knee2, shift['2'] ?? d);
        if (fltLoadUpper(q)) fltMoveLoad(q, (x) => fltAdd(x, d));
        break;
      }
      case 'shrug': {
        const d = [0, -op.px * w];
        if (!q.shoulderMid) q.shoulderMid = q.shoulder;
        for (const k of ['shoulder', 'shoulder2', ...FLT_ARM]) if (q[k]) q[k] = fltAdd(q[k], d);
        if (op.load !== false && fltLoadUpper(q)) fltMoveLoad(q, (x) => fltAdd(x, d));
        break;
      }
      case 'chain': {
        // 绕某个关节转动它以上的整段身体（at: ankle / knee / hip）：小腿立直、髋抬高、肩压到杠前，
        // 骨长自动保住。负荷默认跟着身体走；load: false 时留在原地（地上的杠），再用 regrip 把手放回去
        const above = { ankle: ['knee', 'hip', ...FLT_UPPER], knee: ['hip', ...FLT_UPPER], hip: FLT_UPPER }[op.at];
        if (!above) throw new Error(`chain 的 at 只能是 ankle / knee / hip，见到 ${op.at}`);
        const c = q[op.at], f = (x) => fltRot(x, c, op.deg * w);
        for (const k of above) if (q[k]) q[k] = f(q[k]);
        if (op.at === 'ankle' && q.knee2 && q.ankle2) q.knee2 = fltRot(q.knee2, q.ankle2, op.deg * w);
        if (op.at === 'knee' && q.knee2) { /* 远侧腿：髋跟着近侧走，远侧膝按骨长重解 */
          const K = q.knee2, A = q.ankle2, l1 = Math.hypot(K[0] - p.hip[0], K[1] - p.hip[1]), l2 = Math.hypot(A[0] - K[0], A[1] - K[1]);
          q.knee2 = fltIk(q.hip, A, l1, l2, K);
        }
        if (op.load !== false && fltLoadUpper(q)) fltMoveLoad(q, f);
        break;
      }
      case 'regrip': {
        // 手回到负荷上：躯干带着肩挪了而杠留在原地（load: false）时，手按原来的握点偏移放回杠上，肘按两骨长重解
        if (!q.load || !p.load) break;
        for (const s of ['', '2']) {
          const W0 = p['wrist' + s], E0 = p['elbow' + s], S = q['shoulder' + s] ?? q.shoulder, S0 = p['shoulder' + s] ?? p.shoulder;
          if (!W0 || !E0) continue;
          const at = s && q.load.at2 ? q.load.at2 : q.load.at, at0 = s && p.load.at2 ? p.load.at2 : p.load.at;
          const W = [at[0] + W0[0] - at0[0], at[1] + W0[1] - at0[1]];
          const l1 = Math.hypot(E0[0] - S0[0], E0[1] - S0[1]), l2 = Math.hypot(W0[0] - E0[0], W0[1] - E0[1]);
          // 原本就伸直的手臂（推到顶）放回去也是伸直的：只有真够不着（差半个像素以上）才算钳制
          if (Math.hypot(W[0] - S[0], W[1] - S[1]) > l1 + l2 + 0.5) q._faultClamped = true;
          q['wrist' + s] = W;
          q['elbow' + s] = fltIk(S, W, l1, l2, q['elbow' + s] ?? E0);
        }
        break;
      }
      case 'load': {
        // side 'near'：只挪近侧手和它的负荷（单臂划船：远侧手撑在凳上不能跟着走）
        const d = [op.dx * w, op.dy * w];
        if (op.side === 'near') {
          if (q.load) q.load = { ...q.load, at: fltAdd(q.load.at, d) };
          q.wrist = fltAdd(q.wrist, d);
        } else {
          fltMoveLoad(q, (x) => fltAdd(x, d));
          for (const k of ['wrist', 'wrist2']) if (q[k]) q[k] = fltAdd(q[k], d);
        }
        break;
      }
      default:
        if (!FLT_3D.has(op.op)) throw new Error(`未知的错误变换 ${op.op}`);
    }
  }
  return q;
}

const FLT_3D = new Set(['valgus', 'lateral', 'twist', 'pitch', 'roll', 'arm3', 'spine', 'hand3', 'shrug3']);
const FLT_UPPER3 = ['head', 'neck', 'back', 'shoulderN', 'shoulderF', 'elbowN', 'elbowF', 'wristN', 'wristF'];

/** 绕过 c 的轴（单位向量 k）转 deg°：Rodrigues。 */
function fltRot3(q, c, k, deg) {
  const a = deg * FLT_RAD, cs = Math.cos(a), sn = Math.sin(a);
  const v = [q[0] - c[0], q[1] - c[1], q[2] - c[2]];
  const kv = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
  const kd = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  return [0, 1, 2].map((i) => c[i] + v[i] * cs + kv[i] * sn + k[i] * kd * (1 - cs));
}

/**
 * 3D 变换（作用在 orbitLift 的关节表上，就地修改）。
 *   valgus {px}        膝内扣：膝绕「髋—踝」轴往中线转，膝的 z 往中线收 px（骨长不变）
 *   lateral {deg}      上半身绕骨盆侧倾（绕前后轴转）。正值倒向近侧（+z）
 *   pitch {deg}        上半身绕骨盆前后摆（绕左右轴 +z 转）。正值往 +x 倒：人朝 +x 时是前屈，朝 −x 时符号相反
 *   twist {deg}        上半身绕竖直轴旋转
 *   arm3 {deg, side, axis}  一侧（或 both）手臂绕肩转：axis 'z'（默认）在矢状面内、'x' 在冠状面内（两侧镜像）
 *   hand3 {dx, dy, dz, side, foreVertical}  手在 3D 里挪开，肘按真骨长重解；foreVertical 时肘在手正下方
 *   spine {bend, at}   脊柱弯曲：只记下来，由 orbitScene 把躯干线画成弧。正值 = 屈（往背侧拱），负值 = 伸（往前塌）
 */
export function faultJoints3D(J, fault, u, half) {
  if (!fault?.ops?.length) return J;
  for (const op of fault.ops) {
    if (!FLT_3D.has(op.op)) continue;
    const w = opWeight(op, u, half);
    if (op.op === 'spine') { J.spine = { bend: (J.spine?.bend ?? 0) + op.bend * w, at: op.at ?? 0.5 }; continue; }
    if (!w) continue;
    if (op.op === 'valgus') {
      for (const t of ['N', 'F']) {
        const H = J['hip' + t], A = J['ankle' + t], K = J['knee' + t];
        const ax = [A[0] - H[0], A[1] - H[1], A[2] - H[2]], al = Math.hypot(...ax) || 1;
        const k = ax.map((x) => x / al);
        // 二分找转角：膝的 |z| 收 px。方向取让 |z| 变小的那一边
        const target = Math.max(0, Math.abs(K[2]) - op.px * w);   // 最多收到中线，不穿过去
        const zAt = (deg) => Math.abs(fltRot3(K, H, k, deg)[2]);
        const sgn = zAt(5) < zAt(-5) ? 1 : -1;
        let lo = 0, hi = 80;
        for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (zAt(sgn * m) > target) lo = m; else hi = m; }
        J['knee' + t] = fltRot3(K, H, k, sgn * lo);
      }
    } else if (op.op === 'lateral' || op.op === 'twist' || op.op === 'pitch') {
      // lateral 绕前后轴（侧倾）、twist 绕竖直轴（旋转）、pitch 绕左右轴（前后摆：正视动作的躯干借力）
      const c = J.pelvis, k = op.op === 'lateral' ? [1, 0, 0] : op.op === 'twist' ? [0, 1, 0] : [0, 0, 1];
      for (const key of FLT_UPPER3) if (J[key]) J[key] = fltRot3(J[key], c, k, op.deg * w);
    } else if (op.op === 'shrug3') {
      // 3D 耸肩：两肩连同手臂往上提（单独搭 3D 的动作——反向飞鸟——2D 变换够不着它）。
      // 沿世界竖直提，不沿脊柱：躯干前倾 45° 时沿脊柱提会把肩线推到颈的前上方、压进头里
      const d3 = [0, -op.px * w, 0];
      for (const key of ['shoulderN', 'shoulderF', 'elbowN', 'elbowF', 'wristN', 'wristF']) J[key] = J[key].map((x, i) => x + d3[i]);
    } else if (op.op === 'roll') {
      // 躯干绕自身长轴（骨盆→颈）转：单臂划船用转身把哑铃带上来。keep 那一侧的手按在凳上不动，
      // 那一侧的肘按真骨长重解（pole 取原来的肘）
      // 转轴平行于脊柱、过撑住那一侧的肩：撑凳臂像支柱一样不动，只有另一侧肩被转起来
      const keep = op.keep, ax = [J.neck[0] - J.pelvis[0], J.neck[1] - J.pelvis[1], J.neck[2] - J.pelvis[2]], al = Math.hypot(...ax) || 1;
      const k = ax.map((x) => x / al), c = keep ? J['shoulder' + keep] : J.pelvis;
      const fixedW = keep ? J['wrist' + keep] : null, E0 = keep ? J['elbow' + keep] : null, S0 = keep ? J['shoulder' + keep] : null;
      for (const key of ['head', 'neck', 'back', 'shoulderN', 'shoulderF', 'elbowN', 'elbowF', 'wristN', 'wristF']) if (J[key]) J[key] = fltRot3(J[key], c, k, op.deg * w);
      if (keep) {
        const S = J['shoulder' + keep], l1 = Math.hypot(E0[0] - S0[0], E0[1] - S0[1], E0[2] - S0[2]), l2 = Math.hypot(fixedW[0] - E0[0], fixedW[1] - E0[1], fixedW[2] - E0[2]);
        const v = [fixedW[0] - S[0], fixedW[1] - S[1], fixedW[2] - S[2]], dd = Math.hypot(...v);
        if (dd > l1 + l2 - 0.01 || dd < Math.abs(l1 - l2)) J._faultClamped = true;
        const u3 = v.map((x) => x / dd), a = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
        const pv = [E0[0] - S[0], E0[1] - S[1], E0[2] - S[2]], kk = pv[0] * u3[0] + pv[1] * u3[1] + pv[2] * u3[2];
        let n = pv.map((x, i) => x - u3[i] * kk); const nl = Math.hypot(...n) || 1; n = n.map((x) => x / nl);
        J['wrist' + keep] = fixedW;
        J['elbow' + keep] = S.map((x, i) => x + u3[i] * a + n[i] * h);
      }
    } else if (op.op === 'hand3') {
      // 一只手在 3D 里挪开（两手不同步：远侧哑铃落在后面）；肘按真骨长重解，pole 取原来的肘方向
      // side 'both'：两只手一起挪，dz 按侧镜像（正值 = 往外）
      for (const t of op.side === 'near' ? ['N'] : op.side === 'both' ? ['N', 'F'] : ['F']) {
        const S = J['shoulder' + t], E0 = J['elbow' + t], H0 = J['wrist' + t], zs = op.side === 'both' && t === 'F' ? -1 : 1;
        const H = [H0[0] + (op.dx ?? 0) * w, H0[1] + (op.dy ?? 0) * w, H0[2] + zs * (op.dz ?? 0) * w];
        if (op.foreVertical) {
          // 前臂保持竖直（卧推类到底的判据）：先按满强度解出目标——肘在手正下方一个前臂长、手沿水平挪到上臂够得着处，
          // 再按强度 w 在原位与目标之间插值并按真骨长重解肘。直接用目标解的话强度刚过 0 手就跳 7px。
          const l1 = Math.hypot(E0[0] - S[0], E0[1] - S[1], E0[2] - S[2]), l2 = Math.hypot(H0[0] - E0[0], H0[1] - E0[1], H0[2] - E0[2]);
          const HT = [H0[0] + (op.dx ?? 0), H0[1] + (op.dy ?? 0), H0[2] + zs * (op.dz ?? 0)];
          const ey = HT[1] + l2, r2 = l1 * l1 - (ey - S[1]) ** 2;
          if (r2 < 0) { J._faultClamped = true; continue; }
          const hx = HT[0] - S[0], hz = HT[2] - S[2], hl = Math.hypot(hx, hz) || 1, r = Math.sqrt(r2);
          HT[0] = S[0] + hx / hl * r; HT[2] = S[2] + hz / hl * r;
          const ET = [HT[0], ey, HT[2]];
          const Hm = H0.map((x, i) => x + (HT[i] - x) * w), Em = E0.map((x, i) => x + (ET[i] - x) * w);
          const v = [Hm[0] - S[0], Hm[1] - S[1], Hm[2] - S[2]], dd = Math.hypot(...v);
          const u3 = v.map((x) => x / dd), a = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
          const pv = [Em[0] - S[0], Em[1] - S[1], Em[2] - S[2]], kk = pv[0] * u3[0] + pv[1] * u3[1] + pv[2] * u3[2];
          let n = pv.map((x, i) => x - u3[i] * kk); const nl = Math.hypot(...n) || 1; n = n.map((x) => x / nl);
          J['wrist' + t] = Hm; J['elbow' + t] = S.map((x, i) => x + u3[i] * a + n[i] * h);
          continue;
        }
        const l1 = Math.hypot(E0[0] - S[0], E0[1] - S[1], E0[2] - S[2]), l2 = Math.hypot(H0[0] - E0[0], H0[1] - E0[1], H0[2] - E0[2]);
        const v = [H[0] - S[0], H[1] - S[1], H[2] - S[2]], d = Math.hypot(...v);
        if (d > l1 + l2 - 0.01) { J._faultClamped = true; continue; }
        const u3 = v.map((x) => x / d), a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
        // pole：给肘一个额外的去向（拉到肩时肘往外张），近侧 +z 为外，远侧镜像
        const pp = op.pole ? [op.pole[0] * 40 * w, op.pole[1] * 40 * w, (t === 'F' ? -1 : 1) * op.pole[2] * 40 * w] : [0, 0, 0];
        const pv = [E0[0] - S[0] + pp[0], E0[1] - S[1] + pp[1], E0[2] - S[2] + pp[2]], k = pv[0] * u3[0] + pv[1] * u3[1] + pv[2] * u3[2];
        let n = pv.map((x, i) => x - u3[i] * k); const nl = Math.hypot(...n) || 1; n = n.map((x) => x / nl);
        J['wrist' + t] = H;
        J['elbow' + t] = S.map((x, i) => x + u3[i] * a + n[i] * h);
      }
    } else if (op.op === 'arm3') {
      // axis 'z'（默认）：在矢状面内转；'x'：在冠状面内转（侧平举抬得更高），两侧镜像
      for (const t of op.side === 'near' ? ['N'] : op.side === 'both' ? ['N', 'F'] : ['F']) {
        const S = J['shoulder' + t], k = op.axis === 'x' ? [1, 0, 0] : [0, 0, 1], sg = op.axis === 'x' && t === 'F' ? -1 : 1;
        for (const key of ['elbow' + t, 'wrist' + t]) J[key] = fltRot3(J[key], S, k, sg * op.deg * w);
      }
    }
  }
  return J;
}

/**
 * 浏览器里错误示范的补间参数：只从 data-anim 的 cfg 取。ip 是 figures.json 的 plumb（补间要不要反解躯干），
 * 不是 cfg.plumb（画不画杠线）——换了视角的错误示范两者不同，混用会让灰影的杠离开足中线。
 */
export const mistakeInterpOpts = (cfg) => ({ plumb: cfg.ip ?? undefined, handPath: cfg.handPath });

/** 静止帧对应的动画相位：页面加载后动画从这一刻开始，而不是从还没出错的第一帧。 */
export function faultPhaseOf(tempo, still) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < 400; i++) {
    const ph = i / 400, r = faultPhase(tempo, ph);
    const dd = Math.abs(r.u - still.u) + (r.half === still.half ? 0 : 10);
    if (dd < bd) { bd = dd; best = ph; }
  }
  return best;
}

/** 错误示范的补间进度：只做半程的错误把 u 压到 rom 区间里。 */
export const faultU = (fault, u) => (fault?.rom ? fault.rom[0] + (fault.rom[1] - fault.rom[0]) * u : u);

/**
 * 节奏类错误的时间曲线：ph 是一次起落内的相位（0…1），返回 { u, half }。
 *   默认：前半程走向结束帧、后半程走回来，两段都用缓入缓出。
 *   'bounce'：去程快、到底反弹一下再走回来（弹震）。
 *   'drop'：回程只用去程三分之一的时间（放回时失控）。
 */
export function faultPhase(tempo, ph) {
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);
  if (tempo === 'bounce') {
    if (ph < 0.25) return { u: (ph / 0.25) ** 2, half: 0 };                       // 自由落下
    if (ph < 0.4) { const t = (ph - 0.25) / 0.15; return { u: 1 - 0.18 * Math.sin(Math.PI * t), half: 1 }; }  // 弹起
    return { u: 1 - ease((ph - 0.4) / 0.6), half: 1 };
  }
  if (tempo === 'bounceA') {
    // 弹震发生在起始帧那一端（坐姿推举的底部就是起始帧）：借着上一次砸到底的反弹直接推上去——
    // 推起段起始速度最大、往上越推越慢（ease-out），到顶后先慢慢放、再一下掉到底，掉到底（ph→1）接上下一次推起（ph=0）
    if (ph < 0.6) { const t = ph / 0.6; return { u: 1 - (1 - t) ** 2, half: 0 }; }
    if (ph < 0.82) { const t = (ph - 0.6) / 0.22; return { u: 1 - 0.15 * ease(t), half: 1 }; }
    const t = (ph - 0.82) / 0.18;
    return { u: 0.85 * (1 - t * t), half: 1 };
  }
  if (tempo === 'drop') {
    if (ph < 0.75) return { u: ease(ph / 0.75), half: 0 };
    const t = (ph - 0.75) / 0.25;
    return { u: 1 - t * t, half: 1 };
  }
  return ph < 0.5 ? { u: ease(ph * 2), half: 0 } : { u: ease((1 - ph) * 2), half: 1 };
}
