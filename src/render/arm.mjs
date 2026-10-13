// 投影退化姿态的手臂重建。
//
// 病因：严格侧视下，握在杠上的手投影回肩旁边（相距 1–8px），而上臂+前臂全长 59px。
// 59px 的骨头塞进几像素的跨度，只能折成贴在一起的两根线——就是现在看到的那根"断骨"。
//
// 两条都得改：
//   1. 长度：斜指画面外的肢体，投影必然短于真长。强行套 BONE 全长正是病根。
//      注意这与"骨长固定由构造保证"不矛盾——那条对矢状面内的肢体（腿、躯干）成立，
//      对出平面的肢体不成立，投影本来就该短。
//   2. 手的位置：手在杠上的**握点**，不是杠心。握距比肩宽，画面里沿杠线外移。
//
// 保留的是原始肘朝向——它编码了教学提示（背蹲肘向后下、前架位向前下、下压正下方），
// 丢掉就把动作要点一起丢了。所以只缩短长度、只反解握点，方向照抄。
import { facing } from './facing.mjs';
const UPPER_ARM = 50, FOREARM = 39; // 与 skeleton.mjs 的 BONE 一致
const FORESHORTEN = 0.5;            // 投影缩短比例（= 25px）。这是经验投影长度，不随 BONE 缩放：
                                    // 0.50 时上臂只有 15px、躯干 80px，肘和手挤成一团读不出。
                                    // 能提到 0.85（上臂 25.5px）靠的不是放宽角度，而是把杠片
                                    // 外推画细（r11@±30 → r7@±31），净空握点从 ±19 增到 ±24——
                                    // 肩部的拥挤来自那两个大圆盘，不来自杠的长度。
const TARGET_DEG = 62;              // 目标肘角：高于屈曲极限 35°，低于 90°，读得出是条手臂
const GRIP_MAX = 24;                // 握点离杠心的上限 = 杠片内缘（31 - 7）。再往外就压在杠片上，看不出是只手
const MIN_DEG = 40;
const BAND_GRIP = 17;               // = skeleton.mjs 的 BAND_HALF：手落在带子边缘上                 // 钳制后仍须达到的下限

export function rebuildArm(p, opts = {}) {
  const { foreshorten = FORESHORTEN, targetDeg = TARGET_DEG, gripMax = GRIP_MAX } = opts;
  const bar = p.load ?? p.fixed;          // 引体的杠是 fixed，不是 load
  if (!bar || !p.shoulder || !p.elbow) return null;
  const S = [...p.shoulder];
  const barY = bar.at[1];

  // 1. 肘：照抄原始方向，长度按投影缩短。
  //    opts.elbowDir 用于链上的肘位被别的约束占住的姿态（引体顶部的链要够到杠，
  //    肘只能甩到身体前上方；而画出来的肘必须在后下方）。
  const ed = opts.elbowDir ?? [p.elbow[0] - S[0], p.elbow[1] - S[1]];
  const d0 = Math.hypot(ed[0], ed[1]) || 1;
  const eu = [ed[0] / d0, ed[1] / d0];
  const u = UPPER_ARM * foreshorten;
  const E = [S[0] + eu[0] * u, S[1] + eu[1] * u];

  // 2. 握点：在 y = barY 这条线上，取使 ∠SEH = targetDeg 的那个点。
  //    从 E→S 方向转 ±targetDeg 得两条射线，与杠线求交，取离原 wrist 近的一支。
  // 前臂沿**世界竖直**到杠线：上斜凳的 facing 随凳面倾斜 30°，
  // 复用它会把本该竖直的前臂也转 30°，而判据写的是「前臂接近垂直」（对地面而言）。
  if (opts.handAlongVertical) {
    const H = [E[0], barY];
    const ang3 = (c, a, b) => { const ux=a[0]-c[0], uy=a[1]-c[1], vx=b[0]-c[0], vy=b[1]-c[1];
      return Math.acos(Math.max(-1, Math.min(1, (ux*vx+uy*vy)/(Math.hypot(ux,uy)*Math.hypot(vx,vy))))) * 180 / Math.PI; };
    return { hand: H, elbow: E, upper: u, fore: Math.abs(E[1] - barY), deg: ang3(E, S, H), minDeg: MIN_DEG };
  }
  if (opts.handAlongFacing && opts.facing) {
    // 前臂沿朝脸方向竖直到杠：H = E + k·facing，k 使 H 落在杠线上
    const f = opts.facing, k = Math.abs(f[1]) > 1e-6 ? (barY - E[1]) / f[1] : 0;
    const H = [E[0] + f[0] * k, barY];
    const ang2 = (c, a, b) => { const ux=a[0]-c[0], uy=a[1]-c[1], vx=b[0]-c[0], vy=b[1]-c[1];
      return Math.acos(Math.max(-1, Math.min(1, (ux*vx+uy*vy)/(Math.hypot(ux,uy)*Math.hypot(vx,vy))))) * 180 / Math.PI; };
    return { hand: H, elbow: E, upper: u, fore: Math.hypot(E[0]-H[0], E[1]-H[1]), deg: ang2(E, S, H), minDeg: MIN_DEG };
  }
  const th = targetDeg * Math.PI / 180;
  const aSE = Math.atan2(S[1] - E[1], S[0] - E[0]);
  const cands = [];
  for (const sgn of [1, -1]) {
    const a = aSE + sgn * th;
    const dy = Math.sin(a);
    if (Math.abs(dy) < 1e-6) continue;          // 射线与杠线平行，无交点
    const t = (barY - E[1]) / dy;
    if (t <= 0) continue;                        // 交点在射线反向
    cands.push([E[0] + Math.cos(a) * t, barY]);
  }
  if (!cands.length) return null;
  const near = (h) => Math.hypot(h[0] - p.wrist[0], h[1] - p.wrist[1]);
  const H = cands.sort((a, b) => near(a) - near(b))[0];
  // 握点不能压到杠片上，否则读不出那是只手。钳制后肘角会略变，由下面的断言兜底。
  // 握点外推是为杠铃设计的（握距比肩宽，沿杠线外移）。哑铃只有 18px 宽，手就在哑铃中心。
  // 弹力带那一段带子半宽 16（BAND_HALF），走杠铃的 ±24 会让手悬在带子外；±9 把肘角压到 24°。
  const gm = (bar.type === 'hands' || bar.type === 'hands2') ? 9
    : bar.type === 'band' ? BAND_GRIP : bar.type === 'handle' ? 10 : gripMax;   // 把手只有 20 宽
  H[0] = Math.max(bar.at[0] - gm, Math.min(bar.at[0] + gm, H[0]));
  const ang = (c, a, b) => {
    const ux = a[0]-c[0], uy = a[1]-c[1], vx = b[0]-c[0], vy = b[1]-c[1];
    return Math.acos(Math.max(-1, Math.min(1,
      (ux*vx + uy*vy) / (Math.hypot(ux,uy) * Math.hypot(vx,vy))))) * 180 / Math.PI;
  };
  return { hand: H, elbow: E, upper: u, fore: Math.hypot(E[0] - H[0], E[1] - H[1]),
           deg: ang(E, S, H), minDeg: MIN_DEG };
}

/**
 * 哪些姿态的手臂是出平面的——显式声明，不用几何阈值猜。
 *
 * 试过按「手到肩 ÷ 前臂」分：出平面组落在 0.04–0.24，矢状面组落在 0.42–0.60，
 * 看着能分开，但 triceps_top（绳索下压，侧视两臂重合，明明在矢状面内）是 0.26，
 * 紧贴着 squat_front_bottom 的 0.24。阈值分不开它们，因为这件事本来就是语义的：
 * 器械是横架在肩上/举在两侧（握距沿 Z 轴展开 → 出平面），还是在矢状面内。
 *
 * 这个集合与 skeleton.mjs 的 LOAD_ANCHOR === 'shoulder' 同源，外加坐姿推举——
 * 哑铃在肩两侧，同样是出平面，只是它的 load 锚在腕上。
 */
export const OUT_OF_PLANE_ARM = new Set([
  'squat_top', 'squat_bottom',
  'squat_front_top', 'squat_front_bottom',
  'squat_lowbar_top', 'squat_lowbar_bottom',
  'carry_front', 'ohp_bottom', 'seated_press_bottom',
  // 卧推底部：肘向两侧张开，上臂指向读者；引体顶部：握距比肩宽，肘在后下方。
  // 两者的上臂与前臂在侧视里都投影重叠，和背蹲是同一类。
  'bench_bottom', 'incline_bottom', 'pullup_top', 'inverted_row_end',
  // 下拉终点：握距比肩宽、肘向两侧下方，把手贴到锁骨时侧视里手几乎落在肩上
  'pulldown_end',
  // 坐姿推胸起始：肘向两侧张开（与卧推底部同类），原来画成满长向后伸进靠背里
  'machine_press_start',
  // 早安式手扶肩上握带：握距沿 Z 轴展开
  'gm_top', 'gm_bottom',
]);

/**
 * 个别姿态的重建参数覆盖。卧推底部的上臂几乎正对读者，投影比 85% 还要短得多——
 * 不缩到 45% 的话，肘离杠太远，解出来的前臂会比全长还长。
 */
export const ARM_OVERRIDES = {
  // 卧推底部：肘在杠正下方，前臂沿朝脸方向竖直到杠（自检判据「前臂接近垂直」）
  bench_bottom: { foreshorten: 0.45, handAlongFacing: true },
  incline_bottom: { foreshorten: 0.45, handAlongVertical: true },
  // 引体顶部：肘在后下方（cue「肘往下往后拉」）。链上的肘够不到这个方向——
  // 手钉在杠上、肩在杠下 18px，50+39 的链只能把肘甩到身体前上方。
  pullup_top: { elbowDir: [-0.6, 0.8], foreshorten: 0.32 },
};

/** 按姿态名取覆盖参数再重建。renderPose 与校验都该走这个入口，保证画的和查的一致。 */
export function rebuildArmFor(name, p) {
  // 前架位拿哑铃时握点必须按哑铃算（±9），不能沿用杠铃的 ±24——
  // 哑铃只有 18 宽，手画在 ±24 就悬在哑铃外面。drawnArm 把 figures.json 的
  // load_type 覆盖传进来，就是为了让这里看到**画出来的**器械。
  // 代价是肘角落到 35–38°：侧视里肩、哑铃、肘几乎共线，上臂与前臂投影重叠，
  // 和窄握卧推同类，由图注说明（见 data/figures.json 的 db-front-squat/goblet-squat）。
  return rebuildArm(p, { ...(ARM_OVERRIDES[name] ?? {}), facing: facing(name, p) });
}

/**
 * 注意：手臂的投影长度在一次重复内**本来就会变**，不要对它套帧间一致性断言。
 * 推举底部肘向两侧展开、手臂斜指画面外，投影短；顶部手臂过顶回到矢状面，投影全长。
 * 这与腿骨、躯干必须全程等长是两回事——那些始终在矢状面内，长度变化只可能是画错。
 */
export const needsRebuild = (name, p) =>
  OUT_OF_PLANE_ARM.has(name) && !!(p.load ?? p.fixed) && p.shoulder && p.elbow && p.wrist;
