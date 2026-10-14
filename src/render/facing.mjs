// 头部朝向。
//
// 为什么需要：骨架的头是一个实心圆，没有任何面部特征，读者无法判断人面向哪边。
// 站姿里还能靠脚的形状反推，坐姿和卧姿里脚被器械挡着，就完全看不出来了。
// 这影响全部图示，不是某一张的问题。
//
// 为什么不能纯靠几何算：试过两条规则，都不行。
//   膝相对「髋→踝」连线的偏移  —— 把平板支撑、俯卧撑、腿弯举都判成朝上（它们是俯卧朝下）
//   躯干接近水平即判为卧姿      —— 把俯身划船、RDL、低杠底部也抓了进来（那些人面朝前下）
// 朝向和「手臂是否出平面」一样是**语义**的，几何量里没有它。
//
// 所以：默认用脊柱推，例外显式声明。默认规则对 64 个侧视姿态里的 54 个成立——
// 站立与坐姿全部朝右、俯身类朝右下、仰卧类朝上，都对。错的恰好是俯卧那一组。

/**
 * 俯卧（面朝下）的姿态。默认规则给出的是它们的背侧，需要取反。
 *
 * 这些姿态有个共同的几何特征可以交叉验证：肩全在髋的左边（shoulder.x − hip.x
 * 在 −72 到 −80 之间），也就是它们是「头朝左」躺着的，与站姿图头朝右相反。
 * 但这个特征不能拿来当判据——仰卧的 bench/deadbug 也是头朝左。朝下还是朝上，
 * 只有动作本身知道。
 */
export const PRONE_POSES = new Set([
  'plank',
  'pushup_top', 'pushup_bottom',
  'knee_pushup_top', 'knee_pushup_bottom',
  'leg_curl_start', 'leg_curl_end',
  'rollout_start', 'rollout_end',
  'back_extension_down', 'back_extension_up',
]);

/**
 * 头朝向的单位向量。脊柱（髋→肩）逆时针转 90° 得到前侧；俯卧姿态取反。
 * 随躯干倾斜自动旋转——俯身划船的脸朝前下方，不是水平朝前。
 * @returns {[number, number] | null} 正视姿态返回 null（人面向读者，没有左右之分）
 */
export function facing(name, p) {
  if (p.view === 'front') return null;
  const sx = p.shoulder[0] - p.hip[0], sy = p.shoulder[1] - p.hip[1];
  const len = Math.hypot(sx, sy);
  if (len < 1e-6) return null;
  const s = PRONE_POSES.has(name) ? -1 : 1;
  return [(-sy / len) * s, (sx / len) * s];
}

const HEAD_R = 12;
const EYE_OFF = 5.6, EYE_R = 2.7;

/** 面部标记：侧视画一只眼（朝向侧），正视画两只。底色填充，在实心头上读作缺口。 */
/** 从正后方看的姿态（反向飞鸟：判据「正后方拍」）。画两只眼等于说人面向读者，是错的。 */
export const BACK_VIEW = new Set(['reverse_fly_start', 'reverse_fly_end']);

export function renderFace(name, p) {
  if (BACK_VIEW.has(name)) return '';
  const [hx, hy] = p.head;
  const f = facing(name, p);
  if (!f) {
    return `<circle class="sk-eye" cx="${(hx - 4.4).toFixed(1)}" cy="${(hy - 1).toFixed(1)}" r="${EYE_R}"/>`
      + `<circle class="sk-eye" cx="${(hx + 4.4).toFixed(1)}" cy="${(hy - 1).toFixed(1)}" r="${EYE_R}"/>`;
  }
  return `<circle class="sk-eye" cx="${(hx + f[0] * EYE_OFF).toFixed(1)}"`
    + ` cy="${(hy + f[1] * EYE_OFF).toFixed(1)}" r="${EYE_R}"/>`;
}

export const FACE_GEOMETRY = { HEAD_R, EYE_OFF, EYE_R };
