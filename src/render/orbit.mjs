// 环绕视角：相机绕竖直轴在基准视角两边来回摆 ±ORBIT_YAW°，略微俯视，透视投影。
//
// 为什么需要：侧视骨架只有 x/y，沿 z 展开的东西全被压扁——横架在肩上的杠铃画成横线，
// 读起来像杠顺着人的前后方向放；握距、肘的去向、单侧负重在哪一侧也读不出来。
// 把杠画成正对镜头的圆片试过，能看出是杠片，但单帧仍然没有深度。只有视角在动，
// 读者才能从运动里读出前后关系。
//
// 为什么只摆 ±30° 而不转满一圈：深蹲的判据（杠过足中线、髋低于膝）只在侧视里看得见，
// 转到正面它们就消失了。摆在基准视角附近，判据始终可读，同时有足够的视差读出深度。
//
// 3D 坐标的来源：
//   · 侧视动作：从已经校验过的 2D 姿态推出来——2D 坐标原样当作 x/y，左右两侧各偏一个
//     关节半宽（ORBIT_PARAMS 按动作登记站距、握距）。有 knee2/elbow2 的姿态，远侧肢体用它们。
//   · 手臂：不沿用 2D 的投影重建（见 arm.mjs），在 3D 里按真骨长从肩解到握点；
//     肘的去向取 2D 画出来的肘方向，再按登记的外展量往外偏。
//   · 正视动作（侧平举、Pallof）：2D 的 x 是左右方向，当作 z；基准视角转到正面。
//   · 反向飞鸟单独搭：它的 2D 是背视、躯干画成直立，但动作是屈髋俯身做的——
//     照背视数据抬成 3D，转起来就是站着做飞鸟，教错了。
//
// 所有图元先组成一个 3D 场景（orbitScene），渲染与画框都从同一个场景出，
// 不存在「框按一套几何算、画按另一套几何画」的分歧。
import { GROUND, MIDFOOT, POSES, drawnArm, BENCH_GAP } from './skeleton.mjs';
import { MUSCLE_SEG } from './muscle-segments.mjs';
import { facing, FACE_GEOMETRY } from './facing.mjs';
import { faultPose2D, faultJoints3D, faultU, opWeight } from './faults.mjs';

export const ORBIT_YAW = 30;                 // 度：摆幅
export const ORBIT_PERIOD = 8.4;             // 秒：一次完整摆动 = 两次起落
// 静止帧（无 JS / 减少动态效果 / 打印）：结束位置、偏 −20°。
// 偏一个角度才看得出沿 z 展开的东西——正对基准视角就又回到了「看不出前后」。
export const ORBIT_STATIC = { u: 1, yaw: -20 };
const ORB_PITCH = 14 * Math.PI / 180;        // 俯角：地面因此成一块平面，深度有了上下的线索
const ORB_CAM_DIST = 520;                    // 相机到视线中心的距离：近端约放大 1.2 倍、远端缩到 0.85
const ORB_UPPER = 50, ORB_FORE = 39;         // 与 skeleton.mjs 的 BONE 一致
const ORB_SHOULDER = 27;                     // 肩关节半宽（侧视动作）。比例：躯干 80px ≈ 50cm，肩关节间距约 34cm
const ORB_BAR = 88, ORB_PLATE_Z = 72, ORB_PLATE_R = 16;
const ORB_BEHIND = -1e4;                     // 托住身体的器械（凳、地面上的踏板）永远画在身体之后

// 站距：关节到身体中线的距离。toe 比 heel 宽 = 脚尖外展。
const ST_HIP = { hip: 14, knee: 15, ankle: 15, heel: 15, toe: 19 };       // 与髋同宽
const ST_SQUAT = { hip: 14, knee: 30, ankle: 28, heel: 27, toe: 36 };     // 约与肩同宽、膝跟脚尖
const ST_PULL = { hip: 14, knee: 18, ankle: 17, heel: 16, toe: 21 };      // 硬拉：髋宽，手在腿外
const ST_LYING = { hip: 14, knee: 26, ankle: 30, heel: 30, toe: 34 };     // 卧推：脚宽踩实
const ST_SEAT = { hip: 14, knee: 18, ankle: 18, heel: 18, toe: 20 };
const ST_TOGETHER = { hip: 12, knee: 11, ankle: 10, heel: 10, toe: 12 };  // 俯撑、悬垂：腿并拢

/**
 * 每个动作的 3D 参数。figures.json 里的每个动作都必须在这里登记（有测试兜底）。
 *   stance  站距（见上）
 *   grip    手到身体中线的距离
 *   out     肘往外偏的量（0 = 肘在 2D 画出的方向上，1 = 几乎全朝外）
 *   db      哑铃长轴方向：'x' 前后（中立握）、'z' 左右（正握）、'y' 竖直（高脚杯）、
 *           'fore' 中立握且随前臂转（锤式弯举：长轴在矢状面内、垂直于前臂）
 *   dbMode  'each' 每只手一只、'near' 只有近侧手、'single' 双手托一只（在中线上）
 *   handle  拉力器把手半长；perHand 时每只手一个
 *   view    'side'（默认）、'front'
 *   band    弹力带下端的半宽（踩在脚下的带子分两股）
 *   benchHalf 凳在 z 方向的半宽（默认 16；臀推横靠长凳 60）
 *   backrest  画靠背（贴在躯干背侧，从髋下到肩高）
 *   handOff   [前, 上]：握点相对肩的偏移（躯干系），取代 2D 的手位
 *   plateR    杠铃片半径（默认 16；硬拉用标准片 31，起始帧片着地）
 *   foreVertical  按「端点处前臂竖直」反解握距、解肘（取代 grip/out）
 *   foreTilt      正面看前臂外倾的角度
 *   foreBack      侧视前臂后倾的角度。只适用于直立动作：只取朝向的 x 分量
 */
export const ORBIT_PARAMS = {
  // 背蹲的杠几乎压在肩关节上：握距太窄，手离肩不到 20px，肘只能折到 20° 以下（真人屈到头约 25–35°）。
  // 低杠 cue「握距比高杠窄一些」。
  'back-squat-high-bar': { stance: ST_SQUAT, grip: 54, out: 0.4 },
  'back-squat-low-bar': { stance: ST_SQUAT, grip: 51, out: 0.5 },
  'bodyweight-squat': { stance: ST_SQUAT, grip: 20, out: 0.1 },
  // 前架位：哑铃竖起来，下端架在三角肌前束上，手握把手在肩前 12、上 20（躯干系）。
  // cue「肘抬到与地面接近平行」：pole 朝前，上臂近水平。原来手在肩前 6、与肩齐平，
  // 为了肘角 ≥25° 只好把握点外移到 z=50，肘掉到水平下 41–43°——画的正是 mistakes 里的「肘下掉」。
  'db-front-squat': { stance: ST_SQUAT, grip: 32, handOff: [12, 20], pole: [1, 0, 0.15], db: 'y', dbMode: 'each' },
  'goblet-squat': { stance: ST_SQUAT, grip: 8, out: 0.3, db: 'y', dbMode: 'single' },
  // 凳心挪到 z=−12：后脚在远侧（z −15 … −19），凳面 ±16 居中时脚尖在凳外 3px
  'db-bulgarian-split-squat': { stance: ST_HIP, grip: 34, out: 0.05, db: 'x', dbMode: 'each', benchZ: -12 },
  'leg-press': { stance: ST_SEAT, grip: 34, out: 0.1 },   // 斜躺座（benchIncline）本身就是靠背
  'seated-leg-extension': { stance: ST_SEAT, grip: 32, out: 0.1, backrest: true },
  'seated-calf-raise': { stance: ST_SEAT, grip: 22, out: 0.1 },
  'standing-calf-raise-bodyweight': { stance: ST_HIP, grip: 31, out: 0.05 },
  // 硬拉从地上拉起：标准片直径 45cm，按腿的比例半径 31px，起始帧片着地、杠心离地 31px
  'conventional-deadlift': { stance: ST_PULL, grip: 26, out: 0.05, plateR: 31 },
  'romanian-deadlift': { stance: ST_PULL, grip: 26, out: 0.05 },
  'db-romanian-deadlift': { stance: ST_PULL, grip: 20, out: 0.05, db: 'z', dbMode: 'each' },
  'band-good-morning': { stance: ST_HIP, grip: 52, out: 0.4, band: 14 },
  // cue「脚约与肩同宽」
  // 臀推是人横靠在凳的长边上：凳的长轴沿 z（benchHalf 60 ≈ 75cm 宽），不是 ±16 的小方墩
  'db-hip-thrust': { stance: { hip: 14, knee: 26, ankle: 27, heel: 27, toe: 30 }, grip: 14, out: 0.3, db: 'z', dbMode: 'single', benchHalf: 60 },
  'glute-bridge-bodyweight': { stance: ST_HIP, grip: 32, out: 0.1 },
  'back-extension': { stance: ST_TOGETHER, crossChest: true },   // cue「双手交叉抱胸」
  'lying-leg-curl': { stance: ST_TOGETHER, grip: 30, out: 0.2 },
  // 卧推、推举类按「前臂竖直」反解握距（foreVertical），肘朝下
  'barbell-bench-press': { stance: ST_LYING, foreVertical: true },
  // 窄握：握距约与肩同宽（肩峰外缘 ≈ 关节半宽 27 + 一点），肘贴身（out 小）。
  // 触点在胸骨下段（close_bench_bottom），底部前臂侧视偏竖直约 12°。
  'close-grip-bench-press': { stance: ST_LYING, grip: 30, out: 0.2 },
  'db-bench-press': { stance: ST_LYING, foreVertical: true, db: 'z', dbMode: 'each' },
  'db-incline-bench-press': { stance: ST_LYING, foreVertical: true, db: 'z', dbMode: 'each' },
  'machine-chest-press': { stance: ST_SEAT, grip: 46, out: 0.6, handle: 6, perHand: true, backrest: true },   // 握把间距约 57cm，起始肘角约 38°
  // 俯卧撑：底部前臂在矢状面内竖直（肘在腕正上方），从正面看外倾 foreTilt°——
  // 完全竖直的话肘外展 40° 要配两倍肩宽的手距。握距按这个约束从底部反解。
  'push-up': { stance: ST_TOGETHER, foreVertical: true, foreTilt: 15 },
  'knee-push-up': { stance: ST_TOGETHER, foreVertical: true, foreTilt: 15 },
  // 窄距俯卧撑：手约与肩同宽（手在肩正下方的 z 上、略内收），肘贴肋往脚的方向走——
  // 手臂在矢状面内，3D 与 2D 的肘一致；out 小，肘只略往外偏一点（不贴死在躯干里）。
  'close-grip-push-up': { stance: ST_TOGETHER, grip: 25, out: 0.1 },
  // 推举起始杠在锁骨前、离肩只有 7px：cue「握距略比肩宽」，握点外移到肘角 ≥25° 的最窄处
  'overhead-press': { stance: ST_HIP, grip: 50, out: 0.3 },
  'band-overhead-press': { stance: ST_HIP, grip: 50, out: 0.3, band: 14 },
  'db-shoulder-press': { stance: ST_SEAT, foreVertical: true, db: 'z', dbMode: 'each', backrest: true },
  'machine-shoulder-press': { stance: ST_SEAT, foreVertical: true, handle: 6, perHand: true, backrest: true },
  'db-lateral-raise': { view: 'front', db: 'x', dbMode: 'each' },
  'cable-lateral-raise': { view: 'front', handle: 6, perHand: true, oneArm: true, dbMode: 'near' },   // cue：单臂，做完换边
  // 下压：「上臂贴住躯干两侧并全程保持」。pole 沿上臂（贴躯干、略内收）；握距 16（绳两端约 20cm）：
  // 原来握距 10，3D 里手往中线收，肩到手的距离随伸肘变化不一致，肘在动画里前后漂 8px。
  'cable-pushdown': { stance: ST_HIP, grip: 16, pole: [-0.11, 0.99, -0.05], handle: 16 },
  'barbell-row': { stance: ST_PULL, grip: 34, out: 0.4 },
  // 凳心在撑凳那一侧（z=−26）：撑凳的手与膝落在凳面上，站立腿在凳外
  'db-one-arm-row': { stance: ST_HIP, grip: 26, out: 0.1, db: 'x', dbMode: 'near', benchZ: -26 },
  'inverted-row': { stance: ST_TOGETHER, grip: 46, out: 0.4 },
  'band-row': { stance: ST_SEAT, grip: 6, out: 0.1, handle: 7 },
  'seated-cable-row': { stance: ST_SEAT, grip: 6, out: 0.1, handle: 7 },
  // 下拉终点：正面看前臂竖直（手不往内收、不往外翻），侧视肘略在横杆之后（后倾 15°）。
  // 原来按 out:0.6 解，终点肘在手外侧 17px、侧视后倾 50°，肘角折到 37°。
  // 按这个约束反解出的握距约 50，与原来登记的一致。
  'lat-pulldown': { stance: ST_SEAT, foreVertical: true, foreBack: 15, handle: 62 },
  'pull-up': { stance: ST_TOGETHER, grip: 50, pole: [-0.5, 0.8, 0.4] },   // cue「肘往下往后拉」
  'dead-hang': { stance: ST_TOGETHER, grip: 50, pole: [-0.5, 0.8, 0.4] },   // 与引体同一副悬垂：握距略比肩宽
  'cable-face-pull': { stance: ST_HIP, grip: 18, out: 0.6, handle: 18 },   // 肘高且外展：out 太大会把「抬高」的信息丢掉
  'db-reverse-fly': { view: 'reverse-fly', stance: ST_PULL, db: 'x', dbMode: 'each' },
  'barbell-curl': { stance: ST_HIP, grip: 24, out: 0.05 },
  'db-curl': { stance: ST_HIP, grip: 28, out: 0.05, db: 'z', dbMode: 'each' },
  'cable-curl': { stance: ST_HIP, grip: 16, out: 0.05, handle: 20 },
  // 锤式弯举：掌心相对，哑铃长轴在矢状面内、垂直于前臂（随前臂转），握距同哑铃弯举
  'db-hammer-curl': { stance: ST_HIP, grip: 28, out: 0.05, db: 'fore', dbMode: 'each' },
  // 反握弯举：正握、握距约与肩同宽（手在肩正下方的 z 上），侧视与杠铃弯举同一副姿态
  'barbell-reverse-curl': { stance: ST_HIP, grip: 27, out: 0.05 },
  'barbell-front-rack-carry': { stance: ST_HIP, grip: 50, out: 0.1 },
  'db-farmer-carry': { stance: ST_HIP, grip: 34, out: 0.05, db: 'x', dbMode: 'each' },
  'db-suitcase-carry': { stance: ST_HIP, grip: 34, out: 0.05, db: 'x', dbMode: 'near' },
  'loaded-carry-household': { stance: ST_HIP, grip: 34, out: 0.05, db: 'x', dbMode: 'each' },
  'sled-push': { stance: ST_HIP, grip: 20, out: 0.2 },
  'plank': { stance: ST_TOGETHER, grip: 18, out: 0.1 },
  'ab-wheel-rollout': { stance: ST_TOGETHER, grip: 12, out: 0.1 },
  'barbell-rollout': { stance: ST_TOGETHER, grip: 28, out: 0.1 },
  'db-dead-bug': { stance: ST_HIP, grip: 27, out: 0.05, db: 'x', dbMode: 'each' },
  'band-pallof-press': { view: 'front' },
  'cable-pallof-press': { view: 'front' },
};
export const ORBIT_FIGS = new Set(Object.keys(ORBIT_PARAMS));

// 基准视角：侧视 0°；正视时人面向读者（人的前方 +x 指向相机）；反向飞鸟从斜后方看。
// 反向飞鸟取 60°（从近侧的斜后方）：取 120° 时相机在 −z 一侧，远侧反而离读者更近，
// 近实远灰的主次就画反了。
const ORB_BASE_YAW = { side: 0, front: -90, 'reverse-fly': 60 };
// 错误示范可以换基准视角（fault.yaw）：膝内扣、躯干侧倾这类冠状面的错误，侧视两边摆 30° 看不出来。
export const orbitBaseYaw = (slug, fault) => fault?.yaw ?? ORB_BASE_YAW[ORBIT_PARAMS[slug]?.view ?? 'side'];
/** 本帧用的 3D 参数：错误示范可以覆盖其中几项（例如卧推肘全外展：out、grip）。 */
// fault.pprof：参数也可以随动作进程渐变（肘在下蹲过程中慢慢掉下来），数值与数组按强度在正确值与错误值之间插值
const orbParams = (slug, fault, u = 0) => {
  const base = ORBIT_PARAMS[slug] ?? {};
  if (!fault?.params) return base;
  if (!fault.pprof) return { ...base, ...fault.params };
  const w = opWeight({ prof: fault.pprof }, u, fault._half ?? 0), P = { ...base };
  for (const [k, v] of Object.entries(fault.params)) {
    const b = base[k];
    P[k] = typeof v === 'number' && typeof b === 'number' ? b + (v - b) * w
      : Array.isArray(v) && Array.isArray(b) ? v.map((x, i) => b[i] + (x - b[i]) * w) : (w >= 0.5 ? v : b);
  }
  return P;
};

// ── 向量 ──────────────────────────────────────────────
const o3sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const o3dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const o3len = (a) => Math.hypot(a[0], a[1], a[2]);
const o3mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const o3add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/**
 * 握点够不到时把手沿「肩→手」拉回到刚好够得着：骨长是真骨，不能为了贴住器械把前臂拉长。
 * 器械仍画在原负荷点上，手与杆因此最多差几像素——2D 里杠心本来就画在手下方 6–8px。
 */
function orbReach(S, H, l, lmin = 0) {
  const v = o3sub(H, S), d = o3len(v) || 1e-6;
  // 太近也不行：上臂 50、前臂 39，手离肩至少 11（哑铃前蹲的手几乎压在肩上）
  const t = Math.min(Math.max(d, lmin), l);
  return t === d ? H : S.map((x, i) => x + v[i] * (t / d));
}

/** 3D 两骨 IK：肘落在以「肩—手」为轴的圆上，取朝 pole 的那一点。 */
function orbIk(S, H, l1, l2, pole) {
  const v = o3sub(H, S), d0 = o3len(v) || 1e-6;
  const d = Math.min(Math.max(d0, Math.abs(l1 - l2) + 1e-6), l1 + l2 - 1e-6);
  const u = v.map((x) => x / d0);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const k = o3dot(pole, u);
  let w = pole.map((x, i) => x - u[i] * k);
  const wl = o3len(w);
  // pole 恰好与肩手连线平行时任取一个垂直方向，避免 0/0
  w = wl > 1e-6 ? w.map((x) => x / wl) : (Math.abs(u[2]) < 0.9 ? [u[1], -u[0], 0] : [0, u[2], -u[1]]);
  return S.map((x, i) => x + u[i] * a + w[i] * h);
}

// ── 2D → 3D ───────────────────────────────────────────

/** names 可以是一个姿态名（单帧动作）或 { a, b }（起止两端）。 */
const orbNames = (names) => (typeof names === 'string' ? { a: names, b: names } : names);
const orbLerp2 = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
const ORB_GRIP_LOAD = new Set(['bar', 'front', 'wheel', 'sled']);

/**
 * 手在 2D 里的位置（按某一端的姿态名解）。
 *   · 负荷挂在手上（loadAnchor = wrist：硬拉的杠、健腹轮、雪橇把手）：手就是 2D 的手腕。
 *     2D 把杠心画在手下方 6–8px，手若放到杠心上，伸直的手臂只能靠把前臂拉长 8px 去够。
 *   · 单杠：手在杠下缘（杠心下 6px），与 2D 一致。
 *   · 握在杆上（背蹲、卧推、前架位、下拉横杆）：手就在负荷点。原器械或覆盖后的器械只要
 *     有一个是杆就算——哑铃卧推借杠铃卧推的姿态。拉力器把手只有一根时也算。
 *   · 其余：画出来的手（出平面手臂取重建后的手）。
 */
function handXY(name, p, lt, P) {
  if (p.fixed) return [p.fixed.at[0], p.fixed.at[1] + 6];
  const d = drawnArm(name, p, lt);
  if (p.load && p.loadAnchor === 'wrist' && !d.rebuilt) return p.wrist;
  const t = p.load?.type, rod = (x) => ORB_GRIP_LOAD.has(x) || (x === 'handle' && !P.perHand);
  if (p.load && (rod(t) || rod(lt))) return p.load.at;
  // 器械握把锚在肩上（坐姿推胸）：握把的位置由座椅定、两端之间线性走，手就在握把上。
  // 取 rebuildArm 的重建手会在两支候选之间换支，推出早段手前冲 14px 再退回。
  if (p.load && t === 'handle' && p.loadAnchor === 'shoulder') return p.load.at;
  return d.H;
}

/**
 * 「前臂竖直」反解出来的握距：卧推、推举类的 cue 都要求到底时前臂接近竖直。
 * 肘在手正下方 39px，又要离肩 50px，于是手离中线的距离只有一个解。取两端里手离肩更近的
 * 那一端（底部）来解，握距全程不变。
 */
const orbGripCache = new Map();
/**
 * 前臂从手到肘的偏移。fy 带符号：卧推、推举的肘在手**下方**（+y），
 * 俯卧撑的手撑地、肘在手**上方**（−y），取 2D 画出来的肘在手的哪一侧。
 * foreTilt：正面看前臂外倾的角度（肘在手外侧）。
 * foreBack：侧视前臂后倾的角度（肘在手的身后一侧，f 是人的朝向）。只取 f 的 x 分量，
 * 所以只对直立动作成立；卧推（朝上）、俯卧撑（朝下）加它会被吞掉。
 */
const foreOffset = (P, E, H, f = [1, 0]) => {
  const t = (P.foreTilt ?? 0) * Math.PI / 180, b = (P.foreBack ?? 0) * Math.PI / 180;
  const up = E[1] < H[1] ? -1 : 1;
  return { fx: -f[0] * ORB_FORE * Math.sin(b), fy: up * ORB_FORE * Math.cos(b) * Math.cos(t),
    fz: ORB_FORE * Math.cos(b) * Math.sin(t) };
};
function foreVerticalGrip(slug, names, P, lt) {
  const key = `${slug}|${names.a}|${names.b}|${P.foreTilt ?? ''}|${P.foreBack ?? ''}`;
  if (orbGripCache.has(key)) return orbGripCache.get(key);
  let best = null;
  for (const n of [names.a, names.b]) {
    const q = POSES[n];
    const H = handXY(n, q, lt, P), S = q.shoulder;
    const d = Math.hypot(H[0] - S[0], H[1] - S[1]);
    const { fx, fy, fz } = foreOffset(P, drawnArm(n, q, lt).E, H, facing(n, q) ?? [1, 0]);
    const zz = ORB_UPPER ** 2 - (H[0] + fx - S[0]) ** 2 - (H[1] + fy - S[1]) ** 2;
    if (zz > 0 && (!best || d < best.d)) best = { d, grip: ORB_SHOULDER + Math.sqrt(zz) - fz };
  }
  const g = best?.grip ?? P.grip ?? ORB_SHOULDER;
  orbGripCache.set(key, g);
  return g;
}

/**
 * 侧视动作的 3D 骨架。返回关节表：N = 近侧（+z），F = 远侧（−z）。
 *
 * 手和肘的 2D 方向按**两端的姿态名**各解一次再按 u 混合。只按起始名解的后果：
 * 下拉终点的横杆落到胸骨下段（按起始名解出的手在 y=119，终点的负荷点在锁骨高度 y=90），
 * 引体顶点的肘跑到肩的上前方——出平面手臂的重建参数是按姿态名登记的。
 */
function liftSide(slug, names, p, u, P, lt) {
  const st = P.stance ?? ST_HIP;
  const J = { head: [p.head[0], p.head[1], 0] };
  const top = p.shoulderMid ?? p.shoulder;
  J.neck = [top[0], top[1], 0];
  J.pelvis = [p.hip[0], p.hip[1], 0];
  const H2 = orbLerp2(handXY(names.a, p, lt, P), handXY(names.b, p, lt, P), u);
  const E2 = orbLerp2(drawnArm(names.a, p, lt).E, drawnArm(names.b, p, lt).E, u);
  const grip = P.foreVertical ? foreVerticalGrip(slug, names, P, lt) : (P.grip ?? ORB_SHOULDER);
  const f = facing(names.a, p) ?? [1, 0];
  J.back = [top[0] - f[0] * 5, top[1] - f[1] * 5, 0];   // 颈后一点（早安式的带子从这里绕过）
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'N' : 'F';
    const two = (k) => (s < 0 && p[k + '2'] ? p[k + '2'] : p[k]);
    J['shoulder' + tag] = [two('shoulder')[0], two('shoulder')[1], s * ORB_SHOULDER];
    J['hip' + tag] = [p.hip[0], p.hip[1], s * st.hip];
    for (const k of ['knee', 'ankle', 'heel', 'toe']) J[k + tag] = [two(k)[0], two(k)[1], s * st[k]];
  }
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'N' : 'F', other = s > 0 ? 'F' : 'N';
    const S = J['shoulder' + tag];
    // 远侧有自己的肘手（单臂划船撑凳的手、死虫的另一只手）时按它解
    const own = s < 0 && p.elbow2 && p.wrist2;
    let H, pole;
    if (P.crossChest) {
      // 双手交叉抱胸：手搭在对侧肩前
      const O = J['shoulder' + other];
      H = [O[0] + f[0] * 9, O[1] + f[1] * 9, -s * 16];
      // 上臂贴着躯干前侧往下、往中线收：pole 沿脊柱指向髋，略朝胸前。
      // 只朝胸前的话，肘会从胸口伸出 40px，读起来像一只胳膊往外伸。
      const sp = [p.hip[0] - S[0], p.hip[1] - S[1]], sl = Math.hypot(sp[0], sp[1]) || 1;
      pole = [sp[0] / sl * 0.9 + f[0] * 0.35, sp[1] / sl * 0.9 + f[1] * 0.35, -s * 0.2];
    } else {
      let hxy = own ? p.wrist2 : H2;
      const exy = own ? p.elbow2 : E2;
      if (P.handOff && !own) {
        // 握点相对肩的偏移，按躯干系给（前、上）：前架位的哑铃随躯干一起前倾，始终架在肩上
        const tv = [top[0] - p.hip[0], top[1] - p.hip[1]], tl = Math.hypot(tv[0], tv[1]) || 1;
        const up = [tv[0] / tl, tv[1] / tl];
        let fw = [-up[1], up[0]];
        if (fw[0] * f[0] + fw[1] * f[1] < 0) fw = [-fw[0], -fw[1]];
        const [a, b] = P.handOff, S2 = s < 0 && p.shoulder2 ? p.shoulder2 : p.shoulder;
        hxy = [S2[0] + fw[0] * a + up[0] * b, S2[1] + fw[1] * a + up[1] * b];
      }
      H = [hxy[0], hxy[1], s * grip];
      const ed = [exy[0] - S[0], exy[1] - S[1]], el = Math.hypot(ed[0], ed[1]) || 1;
      const o = P.out ?? 0.2;
      pole = P.pole ? [P.pole[0], P.pole[1], s * P.pole[2]]
        : [ed[0] / el * (1 - o), ed[1] / el * (1 - o), s * (o + 0.05)];
      // 前臂竖直：pole 直接指向「手正下方一个前臂长」的那一点。底部时它恰好在 IK 的圆上，
      // 解出来就是它；其余帧连续过渡。只给一个「朝下」的 pole 时，圆上离它最近的点不是正下方
      // （卧推底部前臂曾偏 35°）。
      if (P.foreVertical) {
        const { fx, fy, fz } = foreOffset(P, exy, hxy, f);
        pole = [H[0] + fx - S[0], H[1] + fy - S[1], H[2] + s * fz - S[2]];
      }
    }
    H = orbReach(S, H, ORB_UPPER + ORB_FORE - 0.5, ORB_UPPER - ORB_FORE + 0.5);
    J['wrist' + tag] = H;
    J['elbow' + tag] = orbIk(S, H, ORB_UPPER, ORB_FORE, pole);
  }
  return J;
}

/**
 * 正视动作：2D 的 x 是左右（当作 −z，近侧在 +z），前后深度按动作补。
 * 身体宽度不用 2D 的 x：正视数据的肩只在 ±16，侧视动作是 ±27，同一套图里正视的人会窄 40%——
 * 而正视恰恰是看宽度的视角。所以躯干与腿统一用侧视的半宽，手只保留「离肩多远」。
 */
function liftFront(slug, names, p, u, P) {
  const cx = (p.shoulderMid ?? p.shoulder)[0];
  const J = { head: [0, p.head[1], 0] };
  J.neck = [0, (p.shoulderMid ?? p.shoulder)[1], 0];
  J.pelvis = [0, p.hip[1], 0];
  const pallof = slug.includes('pallof');
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'N' : 'F';
    const k2 = (k, q = p) => (s < 0 ? q[k + '2'] ?? q[k] : q[k]);
    J['shoulder' + tag] = [0, k2('shoulder')[1], s * ORB_SHOULDER];
    J['hip' + tag] = [0, p.hip[1], s * ST_HIP.hip];
    J['knee' + tag] = [0, k2('knee')[1], s * ST_HIP.knee];
    J['ankle' + tag] = [0, k2('ankle')[1], s * ST_HIP.ankle];
    J['heel' + tag] = [-8, k2('heel')[1], s * ST_HIP.heel];
    J['toe' + tag] = [24, k2('toe')[1], s * ST_HIP.toe];
    const S = J['shoulder' + tag];
    let H, pole;
    if (pallof) {
      // 双手在胸前合握，沿水平方向推出：收于胸前约 20、推出约 82（肘角约 165°，cue「推直」）
      H = [20 + (82 - 20) * u, k2('wrist')[1], 0];
      pole = [0, 1, s * 0.6];
    } else {
      // 侧平举：在肩胛平面内（略往前），肘微屈。单臂的远侧手停在起始位不动。
      const q = P.oneArm && s < 0 ? POSES[names.a] : p;
      const w = k2('wrist', q), sh = k2('shoulder', q);
      const lat = Math.abs(w[0] - cx) - Math.abs(sh[0] - cx);
      H = [10, w[1], s * (ORB_SHOULDER + lat)];
      pole = [-0.2, -0.6, s * 0.4];
    }
    H = orbReach(S, H, ORB_UPPER + ORB_FORE - 0.5, ORB_UPPER - ORB_FORE + 0.5);
    J['wrist' + tag] = H;
    J['elbow' + tag] = orbIk(S, H, ORB_UPPER, ORB_FORE, pole);
  }
  return J;
}

/** 反向飞鸟：身体借俯身划船起始的髋铰链，手臂从垂在肩下展开到两侧。 */
function liftReverseFly(u, P) {
  const b = POSES.row_start;
  const J = liftSide('', { a: 'row_start', b: 'row_start' }, { ...b, load: undefined }, 0, { ...P, grip: ORB_SHOULDER }, undefined);
  // 顶点：自检「上臂约与躯干在一条线上，不超过」——终点角按背面所在平面反解，而不是写死 84°。
  // 写死时躯干离竖直 51°，上臂越过背面 6.7°（手抬到背的上方）。
  // 背面法线 n（指向背侧）⊥ 躯干、在矢状面内。
  const reach = 87.5;                                  // cue「肘微屈」：肘角约 160°（原来 84 时 141°，屈了 38°）
  const tv = [J.neck[0] - J.pelvis[0], J.neck[1] - J.pelvis[1]], tl = Math.hypot(tv[0], tv[1]) || 1;
  let n = [-tv[1] / tl, tv[0] / tl];
  if (n[1] > 0) n = [-n[0], -n[1]];                    // 背侧朝上（−y）
  // 判据说的是**上臂**：肘微屈、pole 让肘略朝背侧，所以按肘（而不是手）落在背面内二分反解终点角。
  const arm = (th, s, S) => {
    const H = [S[0] + 4, S[1] + Math.cos(th) * reach, S[2] + s * Math.sin(th) * reach];
    return { H, E: orbIk(S, H, ORB_UPPER, ORB_FORE, [0, -Math.sin(th) * 0.7, s * Math.cos(th)]) };
  };
  const SN = J.shoulderN, dev = (th) => { const { E } = arm(th, 1, SN); return (E[0] - SN[0]) * n[0] + (E[1] - SN[1]) * n[1]; };
  let lo = 8 * Math.PI / 180, hi = Math.PI * 0.6;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (dev(m) < 0) lo = m; else hi = m; }
  const th = 8 * Math.PI / 180 + (lo - 8 * Math.PI / 180) * u;   // 上臂与竖直向下的夹角
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'N' : 'F';
    const { H, E } = arm(th, s, J['shoulder' + tag]);
    J['wrist' + tag] = H;
    J['elbow' + tag] = E;
  }
  return J;
}

export function orbitLift(slug, names, p, u = 0, lt, fault) {
  const P = orbParams(slug, fault, u);
  const nm = orbNames(names);
  if (P.view === 'front') return liftFront(slug, nm, p, u, P);
  if (P.view === 'reverse-fly') return liftReverseFly(u, P);
  return liftSide(slug, nm, p, u, P, lt);
}

// ── 场景 ──────────────────────────────────────────────
// 图元：{ t: 'line', a, b, cls, bias }、{ t: 'poly', pts, cls, bias, n }（n 为外法线，背面剔除）、
//       { t: 'ball', c, r, cls }（球：投影成圆，半径随透视缩放）

const ring = (c, r, axis, n = 20) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2, ca = Math.cos(a) * r, sa = Math.sin(a) * r;
  if (axis === 'z') return [c[0] + ca, c[1] + sa, c[2]];
  if (axis === 'x') return [c[0], c[1] + sa, c[2] + ca];
  return [c[0] + ca, c[1], c[2] + sa];
});

/** 长方体：只给六个面和外法线，背面在渲染时剔除。 */
function box(S, x0, x1, y0, y1, z0, z1, cls, bias = 0) {
  const v = (i, j, k) => [[x0, x1][i], [y0, y1][j], [z0, z1][k]];
  const F = [
    [[v(0, 0, 0), v(1, 0, 0), v(1, 0, 1), v(0, 0, 1)], [0, -1, 0]],   // 顶
    [[v(0, 1, 0), v(1, 1, 0), v(1, 1, 1), v(0, 1, 1)], [0, 1, 0]],    // 底
    [[v(0, 0, 0), v(0, 1, 0), v(0, 1, 1), v(0, 0, 1)], [-1, 0, 0]],
    [[v(1, 0, 0), v(1, 1, 0), v(1, 1, 1), v(1, 0, 1)], [1, 0, 0]],
    [[v(0, 0, 0), v(1, 0, 0), v(1, 1, 0), v(0, 1, 0)], [0, 0, -1]],
    [[v(0, 0, 1), v(1, 0, 1), v(1, 1, 1), v(0, 1, 1)], [0, 0, 1]],
  ];
  for (const [pts, n] of F) S.push({ t: 'poly', pts, cls, bias, n });
}

/** 一根沿 z 的杆，切成小段各自排序：近端才能正确地压在近侧肢体上、远端藏到身体后面。 */
function rod(S, x, y, z0, z1, cls, n = 10) {
  for (let i = 0; i < n; i++) {
    S.push({ t: 'line', a: [x, y, z0 + (z1 - z0) * i / n], b: [x, y, z0 + (z1 - z0) * (i + 1) / n], cls });
  }
}

function barbell(S, x, y, plateR = ORB_PLATE_R) {
  rod(S, x, y, -ORB_BAR, ORB_BAR, 'sk-bar');
  for (const s of [1, -1]) S.push({ t: 'poly', pts: ring([x, y, s * ORB_PLATE_Z], plateR, 'z'), cls: 'sk-plate sk-plate-3d' });
}

function dumbbell(S, c, axis) {
  const half = 9, r = 5.5;
  if (Array.isArray(axis)) {
    // 任意方向的长轴（锤式弯举：随前臂转）。片是垂直于长轴的圆，用长轴的一组正交基画
    const l = o3len(axis) || 1, u = axis.map((x) => x / l);
    const ref = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const cr = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
    const e1 = cr(u, ref), l1 = o3len(e1), v1 = e1.map((x) => x / l1), v2 = cr(u, v1);
    const d = u.map((x) => x * half), a = o3sub(c, d), b = o3add(c, d);
    S.push({ t: 'line', a, b, cls: 'sk-bar sk-db-handle' });
    for (const e of [a, b]) {
      S.push({ t: 'poly', cls: 'sk-plate sk-plate-3d', pts: Array.from({ length: 14 }, (_, i) => {
        const t = (i / 14) * Math.PI * 2, ca = Math.cos(t) * r, sa = Math.sin(t) * r;
        return [0, 1, 2].map((k) => e[k] + v1[k] * ca + v2[k] * sa);
      }) });
    }
    return;
  }
  const d = axis === 'x' ? [half, 0, 0] : axis === 'y' ? [0, half, 0] : [0, 0, half];
  const a = o3sub(c, d), b = o3add(c, d);
  S.push({ t: 'line', a, b, cls: 'sk-bar sk-db-handle' });
  for (const e of [a, b]) S.push({ t: 'poly', pts: ring(e, r, axis, 14), cls: 'sk-plate sk-plate-3d' });
}

/**
 * 中立握（掌心相对）时哑铃长轴的方向：在矢状面内、垂直于前臂。
 * 手垂在体侧时朝前后，前臂水平时竖直，举到顶时又朝前后——它随前臂转，不是固定的世界轴。
 */
function neutralGripAxis(E, H) {
  const v = o3sub(H, E);
  return [-v[1], v[0], 0];
}

/** 器械。lt 是 figures.json 的 load_type 覆盖：画出来的是它，不是姿态模板里的那件。 */
function equipment(S, slug, p, J, lt, P = ORBIT_PARAMS[slug] ?? {}) {
  if (p.bench) {
    const [x, y, w, h] = p.bench;
    // 凳心默认在中线；单侧支撑的动作（单臂划船、保加利亚）挪到支撑那一侧
    const bz = P.benchZ ?? 0, bh = P.benchHalf ?? 16;
    box(S, x, x + w, y, y + h, bz - bh, bz + bh, 'sk-bench', ORB_BEHIND);
    for (const lx of [x + 8, x + w - 8]) for (const lz of [-(bh - 5), bh - 5]) {
      S.push({ t: 'line', a: [lx, y + h, bz + lz], b: [lx, GROUND, bz + lz], cls: 'sk-rig', bias: ORB_BEHIND });
    }
  }
  if (P.backrest && p.hip && p.shoulder && p.knee) {
    // 靠背：一块贴在躯干背侧的板（间隙 BENCH_GAP，同凳面）。原来坐姿器械只画了座面，
    // 而五张卡的 cue / 自检都点名「背贴靠背」「看腰与靠背之间有没有空隙」——图上没有对照物。
    // 坐姿动作躯干不动，板按当前帧的躯干放即两帧同位。板只到肩高：这些坐姿的头心在躯干线后约 6px，
    // 板再往上就从头里穿过去（推胸 cue「头贴住靠背」因此没有画出来）。
    const tv = [p.shoulder[0] - p.hip[0], p.shoulder[1] - p.hip[1]], tl = Math.hypot(tv[0], tv[1]) || 1;
    const u = [tv[0] / tl, tv[1] / tl];
    let n = [-u[1], u[0]];
    if (n[0] * (p.knee[0] - p.hip[0]) + n[1] * (p.knee[1] - p.hip[1]) > 0) n = [-n[0], -n[1]];   // 指向身后
    const top = 0, h = 8, half = 18;
    const from = [p.hip[0] - u[0] * 6 + n[0] * BENCH_GAP, p.hip[1] - u[1] * 6 + n[1] * BENCH_GAP];
    const to = [p.shoulder[0] + u[0] * top + n[0] * BENCH_GAP, p.shoulder[1] + u[1] * top + n[1] * BENCH_GAP];
    const f2 = [from[0] + n[0] * h, from[1] + n[1] * h], t2 = [to[0] + n[0] * h, to[1] + n[1] * h];
    const q = (a, z) => [a[0], a[1], z];
    // 竖直的板不像座面那样「从上往下看总在身体后面」：相机转到身后（yaw>0）时板挡在躯干前。
    // faceBias 取板的背向法线：相机在板后时撤掉 ORB_BEHIND，按深度正常排序。
    const fb = [n[0], n[1], 0];
    S.push({ t: 'poly', pts: [q(from, -half), q(to, -half), q(to, half), q(from, half)], cls: 'sk-bench', bias: ORB_BEHIND, faceBias: fb, n: [-n[0], -n[1], 0] });
    S.push({ t: 'poly', pts: [q(f2, -half), q(t2, -half), q(t2, half), q(f2, half)], cls: 'sk-bench', bias: ORB_BEHIND, faceBias: fb, n: [n[0], n[1], 0] });
    for (const z of [-half, half]) S.push({ t: 'poly', pts: [q(from, z), q(to, z), q(t2, z), q(f2, z)], cls: 'sk-bench', bias: ORB_BEHIND, faceBias: fb, n: [0, 0, Math.sign(z)] });
  }
  if (p.benchIncline) {
    const { from, to, n, h } = p.benchIncline;
    const f2 = [from[0] + n[0] * h, from[1] + n[1] * h], t2 = [to[0] + n[0] * h, to[1] + n[1] * h];
    const q = (a, z) => [a[0], a[1], z];
    // 斜凳面：一块有厚度的板，法线取凳面法线（n 指向板下方）
    S.push({ t: 'poly', pts: [q(from, -16), q(to, -16), q(to, 16), q(from, 16)], cls: 'sk-bench', bias: ORB_BEHIND, n: [-n[0], -n[1], 0] });
    S.push({ t: 'poly', pts: [q(f2, -16), q(t2, -16), q(t2, 16), q(f2, 16)], cls: 'sk-bench', bias: ORB_BEHIND, n: [n[0], n[1], 0] });
    for (const z of [-16, 16]) S.push({ t: 'poly', pts: [q(from, z), q(to, z), q(t2, z), q(f2, z)], cls: 'sk-bench', bias: ORB_BEHIND, n: [0, 0, Math.sign(z)] });
    for (const c of [f2, t2]) for (const lz of [-11, 11]) S.push({ t: 'line', a: q(c, lz), b: [c[0], GROUND, lz], cls: 'sk-rig', bias: ORB_BEHIND });
  }
  if (p.fixed) {
    const [x, y] = p.fixed.at;
    const half = p.fixed.type === 'pullup_bar' ? 64 : 54;
    rod(S, x, y, -half, half, 'sk-bar');
    for (const z of [-half, half]) {
      S.push({ t: 'line', a: [x, y, z], b: [x, p.fixed.type === 'pullup_bar' ? y - 40 : GROUND, z], cls: 'sk-rig' });
    }
  }
  const L = p.load;
  if (!L) return;
  const type = lt ?? L.type;
  const [lx, ly] = L.at;
  const hands = (P.dbMode === 'near' ? ['N'] : ['N', 'F']);
  if (type === 'bar' || type === 'front') {
    // 杠铃片贴地时（硬拉起始），片的半径不能大于杠心离地的高度，否则片扎进地里
    barbell(S, lx, ly, Math.min(P.plateR ?? ORB_PLATE_R, GROUND - ly));
    return;
  }
  if (type === 'hands' || type === 'hands2') {
    if (P.dbMode === 'single') {
      // 双手托一只：高脚杯竖着托在胸前、臀推横放在髋上
      dumbbell(S, [lx, ly, 0], P.db ?? 'z');
      return;
    }
    // 手握在哑铃把手中间，所以哑铃心就在手上（2D 里偏开 8px 只是为了不盖住手）
    for (const tag of hands) {
      const axis = P.db === 'fore' ? neutralGripAxis(J['elbow' + tag], J['wrist' + tag]) : P.db ?? 'x';
      dumbbell(S, J['wrist' + tag], axis);
    }
    return;
  }
  if (type === 'handle') {
    if (P.perHand) {
      for (const tag of hands) { const H = J['wrist' + tag]; rod(S, H[0], H[1], H[2] - P.handle, H[2] + P.handle, 'sk-bar', 2); }
    } else {
      // 一根把手（下拉横杆、直杆、绳）画在负荷点上，不跟着两手中点走：手由 handXY 放到这里，
      // 两者一致；跟着手走的话，手一旦解错，横杆就跟着错（下拉终点曾掉到胸骨下段）。
      rod(S, lx, ly, -(P.handle ?? 10), P.handle ?? 10, 'sk-bar', 4);
    }
    return;
  }
  if (type === 'band') {
    for (const tag of ['N', 'F']) {
      const H = J['wrist' + tag];
      let A;
      if (P.view === 'front') {
        // Pallof：带子从体侧胸高的固定点拉到合握的手（固定点不随推出移动）
        A = [20, H[1], -70];
      } else {
        const f = L.from ?? [MIDFOOT, GROUND];
        A = [f[0], f[1], (tag === 'N' ? 1 : -1) * (P.band ?? 14)];
      }
      S.push({ t: 'line', a: A, b: H, cls: 'sk-band' });
    }
    // 早安式：带子绕过后颈——两手之间那一段经过颈后，不是在两手间拉一条直线（那样会悬在颈后 20px）
    if (slug === 'band-good-morning') {
      const back = J.back ?? [J.neck[0] - 5, J.neck[1], 0];
      S.push({ t: 'line', a: J.wristN, b: back, cls: 'sk-band' }, { t: 'line', a: back, b: J.wristF, cls: 'sk-band' });
    }
    return;
  }
  if (type === 'pad') {
    rod(S, lx, ly, -30, 30, 'sk-pad-3d', 6);
    return;
  }
  if (type === 'plate') {
    // 腿举踏板：一块竖着的板，脚蹬在它前面
    // 板在脚的 +x 一侧：相机在 +x 一侧时板挡在脚前，否则在脚后（faceBias 按视线方向二选一）
    S.push({ t: 'poly', pts: [[lx, ly - 24, -36], [lx, ly - 24, 36], [lx, ly + 24, 36], [lx, ly + 24, -36]], cls: 'sk-sled', faceBias: [1, 0, 0] });
    return;
  }
  if (type === 'wheel') {
    if (slug === 'barbell-rollout') { barbell(S, lx, ly, GROUND - ly); return; }
    S.push({ t: 'poly', pts: ring([lx, ly, 0], GROUND - ly, 'z'), cls: 'sk-wheel-3d' });
    rod(S, lx, ly, -16, 16, 'sk-bar', 4);
    return;
  }
  if (type === 'sled') {
    box(S, lx - 14, lx + 16, GROUND - 8, GROUND, -24, 24, 'sk-sled');
    for (const z of [-20, 20]) S.push({ t: 'line', a: [lx, ly, z], b: [lx, GROUND - 8, z], cls: 'sk-rig sk-rig-equip' });
  }
}

/** 一帧的完整 3D 场景。under 永远在最底层、over 永远在最上层，其余按深度排序。 */
export function orbitScene(slug, names, p0, { u = 0, prime = [], plumb = false, floor, lt, fault, half = 0 } = {}) {
  const nm = orbNames(names), name = nm.a;
  // 错误示范：2D 变换先作用在姿态上（器械跟着身体走），抬成 3D 后再做只有 3D 里才有的变换
  const p = fault ? faultPose2D(p0, fault, u, half) : p0;
  const J = orbitLift(slug, nm, p, u, lt, fault && { ...fault, _half: half });
  if (fault) faultJoints3D(J, fault, u, half);
  const S = [], under = [], over = [];
  const P = orbParams(slug, fault && { ...fault, _half: half }, u);
  const front = P.view === 'front';
  let f;
  if (front || P.view === 'reverse-fly') f = [1, 0];
  else f = facing(name, p);

  if (floor) {
    const [x0, x1, zh] = floor;
    under.push({ t: 'poly', pts: [[x0, GROUND, -zh], [x1, GROUND, -zh], [x1, GROUND, zh], [x0, GROUND, zh]], cls: 'sk-floor' });
    // 地面网格：透视下近处格子大、远处格子小，平行线向远处收拢——近大远小靠它读出来
    for (const t of [0.25, 0.5, 0.75]) {
      const x = x0 + (x1 - x0) * t;
      under.push({ t: 'line', a: [x, GROUND, -zh], b: [x, GROUND, zh], cls: 'sk-floor-grid' });
    }
    for (const t of [-0.5, 0, 0.5]) under.push({ t: 'line', a: [x0, GROUND, zh * t], b: [x1, GROUND, zh * t], cls: 'sk-floor-grid' });
  }
  if (plumb && p.load && !front) {
    under.push({ t: 'line', a: [MIDFOOT, GROUND, -40], b: [MIDFOOT, GROUND, 40], cls: 'sk-midfoot sk-midfoot-3d' });
    over.push({ t: 'line', a: [p.load.at[0], p.load.at[1], 0], b: [p.load.at[0], GROUND, 0], cls: 'sk-plumb' });
  }

  // 躯干：一块半透明的面（肩、髋四点）给出体积，中线仍是粗躯干线。
  // 错误示范的脊柱弯曲（圆背、塌腰）把中线画成一条弧，面也跟着分段。
  const bend = J.spine?.bend ?? 0;
  if (Math.abs(bend) > 0.05) {
    const tv = o3sub(J.neck, J.pelvis), tl = o3len(tv) || 1;
    let n = [-tv[1] / tl, tv[0] / tl, 0];
    const ff = f ?? [1, 0];
    if (n[0] * ff[0] + n[1] * ff[1] > 0) n = n.map((x) => -x);      // n 指向背侧
    const at = Math.min(Math.max(J.spine.at, 0.15), 0.85), k = Math.log(0.5) / Math.log(at);
    const N = 8, sp = [], wN = [], wF = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, b = Math.sin(Math.PI * t ** k) * bend;
      const c = o3add(o3mix(J.pelvis, J.neck, t), n.map((x) => x * b));
      sp.push(c);
      const zN = J.hipN[2] + (J.shoulderN[2] - J.hipN[2]) * t, zF = J.hipF[2] + (J.shoulderF[2] - J.hipF[2]) * t;
      wN.push([c[0], c[1], zN]); wF.push([c[0], c[1], zF]);
    }
    // 两端仍对齐真实的肩、髋（近侧肩可能被侧倾 / 耸肩挪过）
    wN[0] = J.hipN; wF[0] = J.hipF; wN[N] = J.shoulderN; wF[N] = J.shoulderF;
    for (let i = 0; i < N; i++) {
      S.push({ t: 'poly', pts: [wN[i + 1], wF[i + 1], wF[i], wN[i]], cls: 'sk-torso-plane', bias: -4, part: 'trunk' });
      S.push({ t: 'line', a: sp[i], b: sp[i + 1], cls: 'sk-trunk', part: 'trunk' });
    }
    J.spinePts = sp;
  } else {
    S.push({ t: 'poly', pts: [J.shoulderN, J.shoulderF, J.hipF, J.hipN], cls: 'sk-torso-plane', bias: -4, part: 'trunk' });
    S.push({ t: 'line', a: J.pelvis, b: J.neck, cls: 'sk-trunk', part: 'trunk' });
  }
  S.push({ t: 'line', a: J.shoulderN, b: J.shoulderF, cls: 'sk-limb sk-girdle', part: 'shoulders' });
  S.push({ t: 'line', a: J.hipN, b: J.hipF, cls: 'sk-limb sk-girdle', part: 'pelvis' });
  S.push({ t: 'line', a: J.neck, b: o3mix(J.neck, J.head, 0.6), cls: 'sk-neck', part: 'head' });

  // 近侧实色、远侧 sk-far——沿用侧视的约定，±30° 内近侧始终离读者更近，不会翻转。
  // 正视动作两侧与读者等距，不分主次。
  for (const tag of ['N', 'F']) {
    const far = tag === 'F' && !front ? ' sk-far' : '';
    S.push({ t: 'line', a: J['hip' + tag], b: J['knee' + tag], cls: 'sk-limb' + far, part: 'thigh', side: tag });
    S.push({ t: 'line', a: J['knee' + tag], b: J['ankle' + tag], cls: 'sk-limb' + far, part: 'shin', side: tag });
    S.push({ t: 'line', a: J['heel' + tag], b: J['toe' + tag], cls: 'sk-foot' + far, part: 'foot', side: tag });
    S.push({ t: 'line', a: J['shoulder' + tag], b: J['elbow' + tag], cls: 'sk-limb' + far, part: 'upperarm', side: tag });
    S.push({ t: 'line', a: J['elbow' + tag], b: J['wrist' + tag], cls: 'sk-limb' + far, part: 'forearm', side: tag });
    S.push({ t: 'ball', c: J['wrist' + tag], r: 4, cls: 'sk-hand' + far, bias: 0.5, part: 'forearm', side: tag });
    if (!far) for (const k of ['shoulder', 'hip', 'knee', 'ankle', 'elbow']) S.push({ t: 'ball', c: J[k + tag], r: 3.2, cls: 'sk-joint', bias: 0.5 });
  }

  // 主动肌：与侧视一致，只标近侧；躯干上的肌肉标在中线上
  const MJ = { shoulder: J.shoulderN, hip: J.hipN, knee: J.kneeN, ankle: J.ankleN, elbow: J.elbowN, wrist: J.wristN };
  for (const m of prime) {
    for (const [a, b, t0, t1] of MUSCLE_SEG[m] ?? []) {
      const trunk = a === 'shoulder' && b === 'hip';
      const A = trunk ? J.neck : MJ[a], B = trunk ? J.pelvis : MJ[b];
      if (!A || !B) continue;
      S.push({ t: 'line', a: o3mix(A, B, t0), b: o3mix(A, B, t1), cls: 'sk-muscle', bias: -1 });
    }
  }

  // 头：球。眼睛贴在球面上朝脸的方向，背向镜头的那只在渲染时剔除。
  S.push({ t: 'ball', c: J.head, r: FACE_GEOMETRY.HEAD_R, cls: 'sk-head', part: 'head' });
  if (f) {
    for (const s of [1, -1]) {
      const n = [f[0] * 0.78, f[1] * 0.78, s * 0.62];
      S.push({ t: 'ball', c: o3add(J.head, n.map((x) => x * 7.5)), r: FACE_GEOMETRY.EYE_R, cls: 'sk-eye', bias: 0.1, eye: n, ref: J.head });
    }
  }

  const n0 = S.length;
  equipment(S, slug, p, J, lt, P);
  // 哑铃把手不标红：它握在手里，红把手和红前臂叠成一条，反而认不出哑铃；标两端的片就够了
  for (let i = n0; i < S.length; i++) if (!/sk-bench|sk-rig\b|sk-db-handle/.test(S[i].cls)) S[i].part = 'load';
  // 出错部位标红：只给错误示范用（它不标主动肌，红色在这里只有「错在这」一个意思）
  // 变换还没起作用的那几帧（「起身时」的错误在下蹲段）不标：红色只出现在真的错了的时候
  // 参数覆盖、换姿态、半程这类错误全程都在，全程标红
  const on = (!fault?.ops?.length && !fault?.pprof) || (fault.params && !fault.pprof) || fault.rom
    || (fault.ops ?? []).some((op) => opWeight(op, u, half) >= 0.2) || (fault.pprof && opWeight({ prof: fault.pprof }, u, half) >= 0.2);
  // hl 里的「shin」两侧都标，「shin.N」只标近侧（分腿蹲只错前腿）
  // 「trunk@0」：这一部位只跟第 0 个变换的强度标红（参数类错误全程在，而躯干前倾是随下蹲才出现的）
  const hit = (it, h) => { const [ps] = h.split('@'); return it.part && (ps === it.part || ps === `${it.part}.${it.side}`); };
  const lit = (h) => { const m = h.split('@')[1]; return m === undefined ? on : opWeight(fault.ops[+m], u, half) >= 0.2; };
  if (fault?.hl?.length) for (const it of S) if (fault.hl.some((h) => lit(h) && hit(it, h))) it.cls += ' sk-fault';
  return { J, S, under, over, p };
}

// ── 投影与渲染 ────────────────────────────────────────

/**
 * 透视投影：绕旋转中心的竖直轴转 yaw，绕视线中心俯视 ORB_PITCH，再按到相机的距离缩放。
 * 返回 [屏幕 x, 屏幕 y, 深度（越大越近）, 缩放 k]。
 *
 * 必须是透视而不是正交：正交投影下远近一样大、平行线永远平行，地面只是一块平行四边形，
 * 读者分不出哪条边近——等于把「看不出前后」的问题从杠铃挪到了地面上。
 */
export function orbitProject(Q, yawDeg, pivot) {
  const t = yawDeg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  const X = Q[0] - pivot[0], Y = Q[1] - pivot[1], Z = Q[2];
  const sx = X * c + Z * s, d = -X * s + Z * c;
  const cp = Math.cos(ORB_PITCH), sp = Math.sin(ORB_PITCH);
  const sy = Y * cp + d * sp, depth = d * cp - Y * sp;
  const k = ORB_CAM_DIST / (ORB_CAM_DIST - depth);
  return [pivot[0] + sx * k, pivot[1] + sy * k, depth, k];
}

/** 世界坐标里「指向相机」的方向：背面剔除、眼睛可见性都用它。 */
function viewDir(yawDeg) {
  const t = yawDeg * Math.PI / 180;
  return [-Math.sin(t) * Math.cos(ORB_PITCH), -Math.sin(ORB_PITCH), Math.cos(t) * Math.cos(ORB_PITCH)];
}

const f1 = (v) => v.toFixed(1);

/** 投影一个图元，返回 { depth, svg, pts }；被剔除的返回 null。 */
function projectItem(it, yaw, pivot, V) {
  const P = (q) => orbitProject(q, yaw, pivot);
  if (it.t === 'line') {
    const A = P(it.a), B = P(it.b);
    return { depth: (A[2] + B[2]) / 2 + (it.bias ?? 0), pts: [A, B],
      svg: `<line class="${it.cls}" x1="${f1(A[0])}" y1="${f1(A[1])}" x2="${f1(B[0])}" y2="${f1(B[1])}"/>` };
  }
  if (it.t === 'poly') {
    if (it.n && o3dot(it.n, V) <= 0) return null;
    const Q = it.pts.map(P);
    const fb = it.faceBias ? (o3dot(it.faceBias, V) > 0 ? -ORB_BEHIND : ORB_BEHIND) : 0;
    return { depth: Q.reduce((s, q) => s + q[2], 0) / Q.length + (it.bias ?? 0) + fb, pts: Q,
      svg: `<polygon class="${it.cls}" points="${Q.map((q) => `${f1(q[0])},${f1(q[1])}`).join(' ')}"/>` };
  }
  if (it.eye && o3dot(it.eye, V) < 0.05) return null;
  const C = P(it.c), r = it.r * C[3];
  const depth = (it.ref ? P(it.ref)[2] : C[2]) + (it.bias ?? 0);
  return { depth, pts: [[C[0] - r, C[1] - r], [C[0] + r, C[1] + r]],
    svg: `<circle class="${it.cls}" cx="${f1(C[0])}" cy="${f1(C[1])}" r="${f1(r)}"/>` };
}

/** 画框计算用：这一帧所有画出来的点。 */
export function orbitPoints(scene, yaw, pivot) {
  const V = viewDir(yaw), pts = [];
  for (const it of [...scene.under, ...scene.S, ...scene.over]) {
    const q = projectItem(it, yaw, pivot, V);
    if (q) pts.push(...q.pts);
  }
  return pts;
}

/**
 * 整段动画的固定参数：旋转中心、地面范围、画框。
 * 框必须固定，否则人会在格子里缩放跳动；所以取若干补间帧 × 若干偏航角的并集。
 */
export function orbitFrame(slug, A, B, interp, opts, { prime = [], plumb = false, lt, names, fault, ghost } = {}) {
  const base = orbitBaseYaw(slug, fault);
  // 每一帧：[姿态, u, 场景选项]。错误示范要把两个半程（变换可能只在回程出现）和灰色的正确动作都算进框里。
  const frames = [];
  for (let i = 0; i <= 12; i++) {
    if (!fault) { frames.push([interp(A, B, i / 12, opts), i / 12, {}]); continue; }
    const uw = faultU(fault, i / 12);
    for (const half of [0, 1]) frames.push([interp(A, B, uw, opts), uw, { fault, half }]);
    if (ghost) frames.push([interp(ghost.A, ghost.B, i / 12, opts), i / 12, { names: ghost.names }]);
  }
  // 旋转中心与地面：取全部帧在 3D 里的范围
  // 地面只按「落在地面附近的东西」定范围：按全部图元算的话，反向飞鸟展开的双臂
  // 把地面撑到 ±120，人反而缩在地面一角。
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  let gx0 = Infinity, gx1 = -Infinity, gz = 0;
  for (const [p, u, o] of frames) {
    const sc = orbitScene(slug, o.names ?? names, p, { u, prime, plumb, lt, fault: o.fault, half: o.half });
    for (const it of sc.S) for (const q of it.t === 'line' ? [it.a, it.b] : it.t === 'poly' ? it.pts : [it.c]) {
      x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
      if (q[1] >= GROUND - 40) { gx0 = Math.min(gx0, q[0]); gx1 = Math.max(gx1, q[0]); gz = Math.max(gz, Math.abs(q[2])); }
    }
  }
  if (!Number.isFinite(gx0)) { gx0 = x0; gx1 = x1; }
  const pivot = [(x0 + x1) / 2, (y0 + Math.min(y1, GROUND)) / 2];
  const floor = [Math.min(gx0, (x0 + x1) / 2 - 40) - 14, Math.max(gx1, (x0 + x1) / 2 + 40) + 14, Math.max(48, gz + 16)];
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const [p, u, o] of frames) {
    const sc = orbitScene(slug, o.names ?? names, p, { u, prime, plumb, floor, lt, fault: o.fault, half: o.half });
    for (const dy of [-ORBIT_YAW, -ORBIT_YAW / 2, 0, ORBIT_YAW / 2, ORBIT_YAW]) {
      for (const q of orbitPoints(sc, base + dy, pivot)) {
        bx0 = Math.min(bx0, q[0]); bx1 = Math.max(bx1, q[0]); by0 = Math.min(by0, q[1]); by1 = Math.max(by1, q[1]);
      }
    }
  }
  const padX = 8, padTop = 22;
  const box = { x: bx0 - padX, y: by0 - padTop, w: bx1 - bx0 + padX * 2, h: by1 - by0 + padTop + 6 };
  return { pivot: pivot.map((v) => +v.toFixed(1)), floor: floor.map((v) => +v.toFixed(1)),
    box: [box.x, box.y, box.w, box.h].map((v) => +v.toFixed(1)) };
}

/** 画一帧。遮挡用画家算法：每个图元按深度从远到近画。yaw 是相对基准视角的偏转。 */
export function renderOrbit(p, { slug, names, u = 0, yaw = 0, frame, prime = [], caption = '', plumb = false, lt, fault, half = 0, ghost } = {}) {
  const [bx, by, bw] = frame.box;
  const Y = orbitBaseYaw(slug, fault) + yaw, V = viewDir(Y);
  const sc = orbitScene(slug, names, p, { u, prime, plumb, floor: frame.floor, lt, fault, half });
  const proj = (list) => list.map((it) => projectItem(it, Y, frame.pivot, V)).filter(Boolean);
  const mid = proj(sc.S).sort((a, b) => a.depth - b.depth);
  const cap = caption ? `<text class="sk-caption" x="${f1(bx + bw / 2)}" y="${f1(by + 15)}">${caption}</text>` : '';
  // 错误示范：正确动作画成一层灰影，压在地面之上、错误动作之下——差多少一眼可量
  let shade = '';
  if (ghost) {
    const g = orbitScene(slug, ghost.names, ghost.p, { u: ghost.u, plumb, lt });
    shade = '<g class="sk-ghost">' + proj(g.S).sort((a, b) => a.depth - b.depth).map((q) => q.svg).join('') + '</g>';
  }
  return cap + proj(sc.under).map((q) => q.svg).join('') + shade + [...mid, ...proj(sc.over)].map((q) => q.svg).join('');
}
