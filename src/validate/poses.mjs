// 骨架图的几何断言。
//
// §7 排除生成图的理由是「作者无法核验，因此无法打证据标签」。手绘骨架图能进页面，
// 前提是它必须可核验——而可核验的意思不是"我看了一眼觉得对"，是**写成断言、构建期跑**。
// 这个文件就是那个前提。断言失败 = 构建失败，画错的图进不了页面。

import { renderPose } from '../render/skeleton.mjs';
import { POSES, RAW_POSES, FORESHORTENED_ARM, GROUND, MIDFOOT, FIG_W, FIG_H, drawnArm, contentBox, torsoCoords, RACKED_POSES, BEHIND_POSES, BAND_HALF, BENCH_GAP } from '../render/skeleton.mjs';
import { interpolate } from '../render/interp.mjs';
import { armDescriptor, blendArm, armSidePlan } from '../assets/anim.js';
import { rebuildArmFor, OUT_OF_PLANE_ARM } from '../render/arm.mjs';
import { facing, FACE_GEOMETRY } from '../render/facing.mjs';
import { MUSCLE_SEG } from '../render/muscle-segments.mjs';

const JOINTS = ['head', 'shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle', 'heel', 'toe'];

// 站姿动作：杠线必须落在足中线附近。容差 ±6，约等于脚长的 1/6——
// 超过这个量在图上已经肉眼可辨，也确实会改变力学结论。
const PLUMB_TOL = 6;

// 这些姿态是站姿且持械，杠线断言对它们生效
const STANDING_LOADED = new Set([
  'squat_bottom', 'squat_top', 'squat_front_bottom', 'squat_front_top',
  'squat_lowbar_top', 'squat_lowbar_bottom', 'goblet_top', 'goblet_bottom',
  'hinge_bottom', 'hinge_top', 'rdl_bottom',
  'ohp_bottom', 'ohp_top',
  'carry_stance', 'carry_front', 'carry_overhead',
  'gm_top', 'gm_bottom',    // 早安式也是站姿持械，之前漏在集合外，杠线断言对它不生效
]);

// 这些姿态要求髋低于膝（蹲到位）
// 名字必须真实存在于 POSES，否则这条保护是空的（曾经有个 'squat_dbfront_bottom' 从来没命中过）
const DEPTH_REQUIRED = new Set(['squat_bottom', 'squat_front_bottom', 'squat_lowbar_bottom', 'squat_bw_bottom', 'goblet_bottom']);

export function validatePoses() {
  const errors = [];
  const push = (name, msg) => errors.push(`${name}: ${msg}`);

  for (const [name, p] of Object.entries(POSES)) {
    // 1. 关节齐全
    for (const j of JOINTS) {
      if (!Array.isArray(p[j]) || p[j].length !== 2 || p[j].some((n) => typeof n !== 'number')) {
        push(name, `缺少或格式错误的关节 ${j}`);
      }
    }
    if (errors.some((e) => e.startsWith(`${name}:`))) continue;

    // 2. 合理性边界。viewBox 现按内容自动裁剪，固定画布不再是约束，
    //    但坐标跑到离谱的位置仍然说明姿态写错了。
    for (const j of JOINTS) {
      const [x, y] = p[j];
      if (x < -80 || x > FIG_W + 100 || y < -130 || y > FIG_H + 60) {
        push(name, `关节 ${j} 坐标离谱 (${x.toFixed(0)},${y.toFixed(0)})`);
      }
    }

    // 3. 任何关节都不穿地。原来只查 heel/toe 且容差 8：跪撑的膝沉到地下 9.8px、
    //    下拉的脚跟穿地 7.8px 都没抓到。
    for (const j of [...JOINTS, 'heel2', 'toe2', 'knee2', 'ankle2', 'elbow2', 'wrist2']) {
      if (p[j] && p[j][1] > GROUND + 3) push(name, `${j} 穿过地面 ${(p[j][1] - GROUND).toFixed(1)}px (y=${p[j][1].toFixed(1)})`);
    }

    // 4. 足部朝向：仅对「整只脚平放在地」的姿态成立。
    //    俯卧（脚尖撑地）、仰卧（脚跟着地脚尖朝上）、坐姿器械（脚踩踏板）
    //    的脚本来就不平放，对它们套这条规则会把正确的姿态判成错的。
    const onGround = (j) => p[j] && Math.abs(p[j][1] - GROUND) <= 6;
    const flatFoot = onGround('heel') && onGround('toe');
    if (p.view !== 'front' && flatFoot && p.toe[0] <= p.heel[0]) {
      push(name, `脚尖(${p.toe[0]}) 未在脚跟(${p.heel[0]}) 之前，朝向矛盾`);
    }

    // 5. 肢体长度自洽：同一副骨架内大腿与小腿不应差出一倍
    const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const thigh = len(p.hip, p.knee);
    const shank = len(p.knee, p.ankle);
    if (thigh > 0 && shank > 0) {
      const r = thigh / shank;
      if (r < 0.5 || r > 2.0) push(name, `大腿/小腿比例失真 ${r.toFixed(2)}（应在 0.5–2.0）`);
    }
    const upper = len(p.shoulder, p.elbow);
    const fore = len(p.elbow, p.wrist);
    if (upper > 0 && fore > 0) {
      const r = upper / fore;
      if (r < 0.4 || r > 2.5) push(name, `上臂/前臂比例失真 ${r.toFixed(2)}（应在 0.4–2.5）`);
    }

    // 6. 杠线过足中线（站姿持械）
    if (STANDING_LOADED.has(name)) {
      if (!p.load) {
        push(name, '标记为站姿持械但没有 load');
      } else {
        const d = Math.abs(p.load.at[0] - MIDFOOT);
        if (d > PLUMB_TOL) {
          push(name, `负荷铅垂线偏离足中线 ${d.toFixed(1)}（上限 ${PLUMB_TOL}）`
            + ` — 杠在 x=${p.load.at[0]}，足中线 x=${MIDFOOT}`);
        }
        // 足中线必须真的落在脚上
        if (MIDFOOT < p.heel[0] || MIDFOOT > p.toe[0]) {
          push(name, `足中线 x=${MIDFOOT} 不在脚的范围 [${p.heel[0]}, ${p.toe[0]}] 内`);
        }
      }
    }

    // 7. 蹲到位：髋低于膝（y 向下为正，故髋的 y 应更大）
    if (DEPTH_REQUIRED.has(name) && p.hip[1] <= p.knee[1]) {
      push(name, `髋(y=${p.hip[1]}) 未低于膝(y=${p.knee[1]})，不满足"髋低于膝"判据`);
    }

    // 8. 头在肩之上
    if (p.view !== 'front' && name !== 'plank' && !name.startsWith('bridge')
        && !name.startsWith('bench') && !name.startsWith('incline')
        && !name.startsWith('pushup') && !name.startsWith('knee_pushup')
        && !name.startsWith('deadbug') && !name.startsWith('rollout')
        && !name.startsWith('leg_curl') && !name.startsWith('leg_press')
        && !name.startsWith('back_extension') && !name.startsWith('inverted')) {
      if (p.head[1] >= p.shoulder[1]) push(name, `头(y=${p.head[1]}) 未高于肩(y=${p.shoulder[1]})`);
    }
  }
  return errors;
}

/** 校验 figures.json：每个动作都有图，引用的姿态都存在。 */
export function validateFigures(figures, exercises) {
  const errors = [];
  const slugs = new Set(exercises.map((e) => e.slug));

  for (const slug of slugs) {
    if (!figures[slug]) errors.push(`动作 ${slug} 缺少骨架图定义（data/figures.json）`);
  }
  for (const [slug, f] of Object.entries(figures)) {
    if (!slugs.has(slug)) errors.push(`figures.json 的 ${slug} 不是已知动作`);
    for (const key of ['start', 'end']) {
      if (f[key] && !POSES[f[key]]) errors.push(`${slug}.${key} 引用了不存在的姿态 ${f[key]}`);
    }
    if (!f.start) errors.push(`${slug} 缺少 start 姿态`);
    // 出平面的手臂之所以出平面，正是因为它握着器械——握距沿 Z 轴展开。
    // no_load 把器械摘掉，这个前提就没了：rebuildArm 失去定握点的依据会返回 null，
    // 渲染**静默回落**到原始坐标，也就是那根折叠的手臂，而页面上不报任何错。
    // 这类动作该有自己的手臂姿态（例如自重深蹲两臂前伸），不是把别人的杠摘掉。
    for (const key of ['start', 'end']) {
      if (f.no_load && f[key] && OUT_OF_PLANE_ARM.has(f[key])) {
        errors.push(`${slug}: ${key} 用了出平面手臂的姿态 ${f[key]}，却标了 no_load。`
          + '器械摘掉后手臂重建失去前提，会静默回落成折叠的手臂——请为它另写一套手臂在矢状面内的姿态。');
      }
    }
  }
  return errors;
}

/** 同一动作两帧的肢体长度必须一致：同一个人不会在一次重复里换掉骨骼比例。 */
export function validateFrameConsistency(figures) {
  const errors = [];
  const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const LIMBS = [['hip', 'knee', '大腿'], ['knee', 'ankle', '小腿'],
                 ['shoulder', 'elbow', '上臂'], ['elbow', 'wrist', '前臂'],
                 // 脚也是刚体。站姿提踵把踝—脚尖画成会伸缩（+23%），而那张图的全部内容
                 // 就是踝的屈伸；脚不在这张表里，所以四轮都没人拦得住。
                 ['ankle', 'heel', '脚跟段'], ['ankle', 'toe', '前脚段'], ['heel', 'toe', '脚长'],
                 ['ankle2', 'heel2', '远侧脚跟段'], ['ankle2', 'toe2', '远侧前脚段']];
  for (const [slug, f] of Object.entries(figures)) {
    if (!f.end || f.end === f.start) continue;
    const a = POSES[f.start], b = POSES[f.end];
    if (!a || !b) continue;
    // 契约 §4：手臂的投影长度在一次重复内本来就会变（推举底部出平面、顶部回矢状面），
    // 对出平面与指向读者的手臂不套等长断言。腿与躯干始终在矢状面内，照查。
    const armFree = [f.start, f.end].some((n) => OUT_OF_PLANE_ARM.has(n) || FORESHORTENED_ARM.has(n));
    for (const [j1, j2, label] of LIMBS) {
      if (armFree && (j1 === 'shoulder' || j1 === 'elbow')) continue;
      if (!a[j1] || !a[j2] || !b[j1] || !b[j2]) continue;
      const la = len(a[j1], a[j2]), lb = len(b[j1], b[j2]);
      const diff = Math.abs(la - lb) / Math.max(la, lb);
      const cap = label.includes('脚') ? 0.12 : 0.18;   // 脚不参与屈伸，伸缩余量该比肢体小
      if (diff > cap) {
        errors.push(`${slug}: ${label}在两帧间长度差 ${(diff * 100).toFixed(0)}%`
          + `（${f.start}=${la.toFixed(1)} vs ${f.end}=${lb.toFixed(1)}），同一个人不该换比例`);
      }
    }
  }
  return errors;
}

/** 校验肌肉词表与分区定义一致。 */
export function validateMuscles(exercises, regionNames) {
  const errors = [];
  const known = new Set(regionNames);
  const used = new Set();
  for (const e of exercises) {
    for (const role of ['prime', 'synergist', 'stabilizer']) {
      for (const m of e.muscles?.[role] ?? []) {
        used.add(m);
        if (!known.has(m)) errors.push(`动作 ${e.slug} 的 ${role} 含未知肌肉「${m}」，分区图画不出它`);
      }
    }
    if (!(e.muscles?.prime ?? []).length) errors.push(`动作 ${e.slug} 没有主动肌，肌肉图会是空的`);
  }
  for (const m of known) {
    if (!used.has(m)) errors.push(`分区「${m}」没有任何动作用到，应从分区图移除或补动作`);
  }
  return errors;
}

// ── 关节角 ─────────────────────────────────────────────


const deg = (c, a, b) => {
  const ux = a[0] - c[0], uy = a[1] - c[1], vx = b[0] - c[0], vy = b[1] - c[1];
  const d = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
  return Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI;
};

// 解剖活动范围：肘完全伸直 180°，最大屈曲约 145° → 夹角下限 35°。
// 膝完全伸直 180°，最大屈曲约 140° → 夹角下限约 38°。
// 低于下限意味着前臂折回贴在上臂上——画出来是一根断掉的骨头，不是手臂。
const ELBOW_MIN = 35, KNEE_MIN = 38;

// 棘轮：这些姿态的肘角在加上本断言时就已超限，且手臂在矢状面内
// （没有投影退化可解释，属于坐标画过头），需要逐个调 wrist/elbow。
// 列在这里是为了「锁住现状、禁止新增」——改好一个就从表里删一个，
// 而任何**新的**超限姿态都会让构建失败。不要往这张表里加东西。
export const ELBOW_PENDING = new Map([
]);

/** 关节角校验。出平面的手臂按重建后的肘位判定——那才是实际画出来的东西。 */
/**
 * @param {object} figures data/figures.json——肘角要查**画出来的**那条手臂，
 * 而画出来的手臂取决于 figures 的 load_type 覆盖（高脚杯深蹲借用前蹲姿态但拿的是哑铃，
 * 握点钳制从杠铃的 ±24 变成 ±9，肘角随之从 61° 掉到 36°）。不传 figures 就是在查另一条臂。
 */

/**
 * 姿态 → 它实际被画成的器械类型集合。
 *
 * 原来三条断言各自建表，写法是「一姿态一值、后写覆盖、没有 load_type 的那一支根本不入表」：
 * ohp_bottom 被记成 band（弹力带推举），于是杠铃站姿推举画出的那条手臂从来没被查过；
 * bench_bottom 被记成 hands，杠铃卧推那条也没查过。12 个姿态被 2–3 种器械画，只查了一种。
 * 这正是「断言查的不是画出来的东西」那一类，所以改成枚举全部组合。
 */
export function loadTypeVariants(figures) {
  const m = new Map();
  for (const f of Object.values(figures)) {
    for (const k of ['start', 'end']) {
      if (!f[k]) continue;
      if (!m.has(f[k])) m.set(f[k], new Set());
      m.get(f[k]).add(f.load_type ?? undefined);
    }
  }
  return m;
}

export function validateJointAngles(figures = {}) {
  const errors = [];
  const variants = loadTypeVariants(figures);
  for (const [name, p] of Object.entries(POSES)) {
    for (const [kj, hj, aj, label] of [['knee','hip','ankle','膝角'], ['knee2','hip','ankle2','远侧膝角']]) {
      if (p[kj] && p[hj] && p[aj]) {
        const k = deg(p[kj], p[hj], p[aj]);
        if (k < KNEE_MIN) errors.push(`${name}: ${label} ${k.toFixed(1)}° 低于解剖下限 ${KNEE_MIN}°`);
      }
    }
    // 远侧手臂同样要查：坐姿推举的远侧臂曾被画成折叠 32° 的全长手臂，
    // 因为断言只看 elbow/wrist，看不见 elbow2/wrist2。
    if (p.shoulder2 && p.elbow2 && p.wrist2 && !FORESHORTENED_ARM.has(name)) {
      const e2 = deg(p.elbow2, p.shoulder2, p.wrist2);
      if (e2 < ELBOW_MIN) errors.push(`${name}: 远侧肘角 ${e2.toFixed(1)}° 低于解剖下限 ${ELBOW_MIN}°`
        + '——远侧手臂没有投影重建这条退路，画得出来就得站得住。');
    }
    if (!p.shoulder || !p.elbow || !p.wrist) continue;
    if (FORESHORTENED_ARM.has(name)) continue;   // 指向读者的手臂，投影肘角不是真肘角
    // 量**画出来的**那只手臂：重建器内部解出的 (elbow, hand) 不一定就是最终画上去的
    // （握在固定杠上的姿态会把手换成常量握点）。反向划船终点画出 5.2°，而内部解是 62°。
    let e = Infinity;
    for (const lt of (variants.get(name) ?? new Set([undefined]))) {
      const d = drawnArm(name, p, lt);
      const tag = lt ? `（画成 ${lt}）` : '';
      const fore = Math.hypot(d.H[0] - d.E[0], d.H[1] - d.E[1]);
      if (d.rebuilt && fore > 41) errors.push(`${name}${tag}: 画出的前臂 ${fore.toFixed(1)}px 比真长 39 还长，投影不可能长于实物`);
      // 下限：只有上限的话投影可以塌成一个点——高脚杯曾被挤到 4.2px，整条前臂藏在哑铃矩形里。
      // 关节圆半径 3.2 + 手圆 4，低于 8px 就两个圆相交、读不出中间有一段。
      if (d.rebuilt && fore < 8) errors.push(`${name}${tag}: 画出的前臂只有 ${fore.toFixed(1)}px，肘与手两个圆会叠在一起，读不出是条手臂`);
      e = Math.min(e, deg(d.E, p.shoulder, d.H));
    }
    if (e >= ELBOW_MIN) {
      if (ELBOW_PENDING.has(name)) {
        errors.push(`${name}: 肘角已达 ${e.toFixed(1)}°，应从 ELBOW_PENDING 移除`);
      }
      continue;
    }
    if (!ELBOW_PENDING.has(name)) {
      errors.push(`${name}: 肘角 ${e.toFixed(1)}° 低于解剖下限 ${ELBOW_MIN}°`
        + '（前臂折回贴在上臂上）。出平面的手臂应登记进 OUT_OF_PLANE_ARM 走投影重建；'
        + '矢状面内的应调 wrist/elbow 坐标——不要往 ELBOW_PENDING 里加。');
    }
  }
  return errors;
}


// ── 支撑关系 ───────────────────────────────────────────

/**
 * 作者画在地面/凳面上的点，归一化之后必须还贴着。
 *
 * normalize 把肢体拉到固定骨长，再把"原本贴地的点里最低的那个"按回地面。
 * 只按一个点：当手臂和腿的放大倍数不同（俯卧撑：腿 ×1.8、手臂 ×1.07），
 * 脚端下沉得多、整体上提后手就悬在半空——俯卧撑手离地 36px、平板前臂 27px、
 * 臀桥上背 67px，全是这一条漏的。这里逐点核对，一个都不许飘。
 */
export const SUPINE_ON_FLOOR = new Set(['bridge_bottom', 'bridge_top', 'deadbug_start', 'deadbug_end',
  // 哑铃臀推从臀桥拆出来时漏了登记——新姿态没有任何断言证明它画对了
  'hipthrust_bottom', 'hipthrust_top']);

export function validateContacts() {
  const errors = [];
  // 踝不是接触点：脚平放时踝本来就在地面上方 7–9px。接触的是脚跟/脚尖、手、肘、膝、髋、肩。
  const GROUND_JOINTS = ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'heel', 'toe',
                         'shoulder2', 'elbow2', 'wrist2', 'knee2', 'heel2', 'toe2'];
  // 贴地与贴凳两套容差：贴地点的「间隙」是身体厚度（仰卧的肩关节本来就在地面上方几 px），
  // 贴凳的间隙是 normalize 统一生成的 BENCH_GAP，没有理由散开——所以后者收得紧得多。
  const GROUND_TOL = 6.5, BENCH_TOL = 1.5;
  for (const [name, raw] of Object.entries(RAW_POSES)) {
    const p = POSES[name];
    for (const j of GROUND_JOINTS) {
      if (!raw[j] || !p[j]) continue;
      if (Math.abs(raw[j][1] - GROUND) <= 7 && Math.abs(p[j][1] - GROUND) > GROUND_TOL) {
        errors.push(`${name}: ${j} 作者画在地面上（y=${raw[j][1]}），归一化后离地 ${(GROUND - p[j][1]).toFixed(1)}px`);
      }
    }
    // 凳面：只查 normalize 登记的支撑关节（卧姿是肩与髋，坐姿是髋，单臂划船是膝）。
    // 手扶把手、脚踩踏板不是"贴凳"，不在此列。
    for (const j of p.support ?? []) {
      if (!p[j]) continue;
      if (p.bench) {
        const d = p.bench[1] - p[j][1];
        if (Math.abs(d - BENCH_GAP) > BENCH_TOL) errors.push(`${name}: ${j} 离凳面 ${d.toFixed(1)}px（应为 ${BENCH_GAP}）`);
      } else if (p.benchIncline) {
        const { from, n } = p.benchIncline;
        const d = (p[j][0] - from[0]) * n[0] + (p[j][1] - from[1]) * n[1];   // 沿凳面法线
        if (Math.abs(d + BENCH_GAP) > BENCH_TOL) errors.push(`${name}: ${j} 离上斜凳面 ${(-d).toFixed(1)}px（应为 ${BENCH_GAP}）`);
      }
    }
    // 仰卧家族：肩与头贴地、底部髋近地——不依赖作者是否把它画在 ±7 内（死虫曾悬空 21px）
    if (SUPINE_ON_FLOOR.has(name)) {
      if (GROUND - p.shoulder[1] > 8) errors.push(`${name}: 仰卧的肩离地 ${(GROUND - p.shoulder[1]).toFixed(1)}px`);
      if (p.head && GROUND - (p.head[1] + 12) > 4) errors.push(`${name}: 仰卧的头离地 ${(GROUND - p.head[1] - 12).toFixed(1)}px`);
    }
    // 健腹轮：轮在地上滚，轮底必须贴地
    if (p.load?.type === 'wheel' && Math.abs(p.load.at[1] + 9 - GROUND) > 3) {
      errors.push(`${name}: 健腹轮轮底离地 ${(GROUND - p.load.at[1] - 9).toFixed(1)}px`);
    }
  }
  return errors;
}

/**
 * 该成直线的地方必须成直线——这几张卡的第一条自检判据就是「从头到脚跟一条线」。
 * 值：[起点, 终点, 必须落在连线上的关节...]，垂距容差 8px。
 */
export const STRAIGHT_LINE = {
  plank: ['shoulder', 'ankle', 'hip', 'knee'],
  hipthrust_top: ['shoulder', 'knee', 'hip'],
  pushup_top: ['shoulder', 'ankle', 'hip', 'knee'],
  pushup_bottom: ['shoulder', 'ankle', 'hip', 'knee'],
  rollout_end: ['shoulder', 'knee', 'hip'],
  bridge_top: ['shoulder', 'knee', 'hip'],
  hinge_top: ['shoulder', 'ankle', 'hip', 'knee'],
  back_extension_up: ['shoulder', 'knee', 'hip'],
  knee_pushup_top: ['shoulder', 'knee', 'hip'],
  knee_pushup_bottom: ['shoulder', 'knee', 'hip'],
  inverted_row_start: ['shoulder', 'ankle', 'hip', 'knee'],
  inverted_row_end: ['shoulder', 'ankle', 'hip', 'knee'],
};

export function validateStraightLines() {
  const errors = [];
  for (const [name, [a, b, ...mids]] of Object.entries(STRAIGHT_LINE)) {
    const p = POSES[name];
    if (!p) { errors.push(`STRAIGHT_LINE 引用了不存在的姿态 ${name}`); continue; }
    const A = p[a], B = p[b];
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
    for (const m of mids) {
      const M = p[m];
      const d = Math.abs((B[0] - A[0]) * (A[1] - M[1]) - (A[0] - M[0]) * (B[1] - A[1])) / L;
      if (d > 8) errors.push(`${name}: ${m} 偏离 ${a}–${b} 连线 ${d.toFixed(1)}px（上限 8），身体没成直线`);
    }
  }
  return errors;
}

/**
 * 固定物两帧必须相同：单杠、低杠、凳子都不会跟着人动。
 * 引体曾经是"杠下降 33px，人没动"——正是 fixed 跟着手走的结果。
 */
export function validateFixedRigs(figures) {
  const errors = [];
  for (const [slug, f] of Object.entries(figures)) {
    if (!f.end || f.end === f.start) continue;
    const a = POSES[f.start], b = POSES[f.end];
    if (!a || !b) continue;
    if (a.fixed || b.fixed) {
      if (!a.fixed || !b.fixed) { errors.push(`${slug}: 只有一帧有固定物`); continue; }
      const d = Math.hypot(a.fixed.at[0] - b.fixed.at[0], a.fixed.at[1] - b.fixed.at[1]);
      if (d > 0.5) errors.push(`${slug}: 固定物两帧位移 ${d.toFixed(1)}px（${f.start} → ${f.end}），固定物不该动`);
    }
    if (a.bench && b.bench) {
      const d = Math.max(...a.bench.map((v, i) => Math.abs(v - b.bench[i])));
      if (d > 2) errors.push(`${slug}: 凳子两帧不同（最大差 ${d.toFixed(1)}px）`);
    }
    if (a.benchIncline && b.benchIncline) {
      const d = Math.max(...['from', 'to'].flatMap((k) => [0, 1].map((i) => Math.abs(a.benchIncline[k][i] - b.benchIncline[k][i]))));
      if (d > 2) errors.push(`${slug}: 上斜凳两帧不同（最大差 ${d.toFixed(1)}px）`);
    }
  }
  return errors;
}

/**
 * 卧推类「触胸」：杠停在胸面上，即躯干线朝脸那一侧 5–14px 处。
 * 用 facing() 取"朝上"方向，所以上斜卧推躯干倾斜也照查。
 */
export const BAR_ON_CHEST = ['bench_bottom', 'incline_bottom'];
export function validateBarOnChest() {
  const errors = [];
  for (const name of BAR_ON_CHEST) {
    const p = POSES[name];
    if (!p?.load) { errors.push(`${name}: 缺少负荷`); continue; }
    const f = facing(name, p);
    const d = (p.load.at[0] - p.shoulder[0]) * f[0] + (p.load.at[1] - p.shoulder[1]) * f[1];
    if (d < 5 || d > 14) errors.push(`${name}: 杠在胸面上方 ${d.toFixed(1)}px（应为 5–14），图注写的是「触胸」`);
  }
  return errors;
}


/** 有 at2 就必须有 wrist2：否则第二只哑铃不归一化、动画里冻结在起始帧，是一只没人握的哑铃。 */
export function validateSecondHand() {
  const errors = [];
  for (const [name, p] of Object.entries(POSES)) {
    if (p.load?.at2 && !p.wrist2) errors.push(`${name}: 有第二只负荷 at2 却没有 wrist2——它不随手走`);
  }
  return errors;
}

/**
 * 罗马尼亚硬拉：膝角基本不变是它与常规硬拉的分界（图注与自检都这么写）。
 * 曾经画成 171° → 120°，变化 51°，就是一个半程硬拉。
 */
export function validateKneeStable() {
  const errors = [];
  const ang = (c, a, b) => {
    const ux = a[0]-c[0], uy = a[1]-c[1], vx = b[0]-c[0], vy = b[1]-c[1];
    return Math.acos(Math.max(-1, Math.min(1, (ux*vx+uy*vy) / (Math.hypot(ux,uy)*Math.hypot(vx,vy))))) * 180 / Math.PI;
  };
  const a = ang(POSES.hinge_top.knee, POSES.hinge_top.hip, POSES.hinge_top.ankle);
  const b = ang(POSES.rdl_bottom.knee, POSES.rdl_bottom.hip, POSES.rdl_bottom.ankle);
  if (Math.abs(a - b) > 15) errors.push(`rdl_bottom: 膝角 ${b.toFixed(1)}° 与 hinge_top ${a.toFixed(1)}° 差 ${Math.abs(a-b).toFixed(1)}°（RDL 膝角应基本不变，上限 15°）`);
  return errors;
}

/**
 * 逐帧核验**画出来的**手臂——不是补间链里的那条。
 *
 * 病根：anim.js 原先对所有图一律在两端点的肘/手之间拉直角坐标的弦。弦比弧短，
 * 角度走得越大缩得越多（矢状面手臂中途短 ~20%）；腕锚的负荷跟着补间链走、手却走弦，
 * 两者分家最远 26px（手离开杠）；俯撑家族「把手转回地面」那一步也被绕开，手飘起 12px。
 * 现在矢状面手臂直接用链的 elbow/wrist，出平面手臂插极坐标且手钉在器械上。
 * 这条断言把那个修复钉住：以后谁改回去，构建就红。
 */
const HELD_LOAD = new Set(['bar', 'front', 'hands', 'hands2', 'handle', 'band']);
const HEAD_CLEAR = 16;   // 头半径 12 + 把手半高 4
// 与 renderPose 的 barBehind 同口径：架在身上的负荷画在身体之后，被身体挡住。
/**
 * 「负荷架在身上」——用来豁免两条断言：手握在器械上（架着的不是握着的）、
 * 器械不许撞进头里（架在锁骨上的杠本来就贴着下巴）。
 *
 * 注意它**不是**渲染端的 `barBehind`（那个用 BEHIND_POSES）：前架位架在身上但画在身体
 * **前面**，两件事的集合本来就不同。第九轮建议合并，核对后判定不合并——合并会把
 * 前架位的哑铃贴下巴误报成错误，而那正是前架位该有的样子。两处各自带注释说明口径。
 */
const DRAWN_BEHIND = (name, p) => RACKED_POSES.has(name) || ['sled', 'plate', 'band'].includes(p.load?.type);
/**
 * 静态帧：手持类器械的手必须真的握在器械上。
 *
 * validateDrawnAnimation 的手—器械上界取自两端点，两端点自己就松的时候它查不出来——
 * 绳索下压的底部帧手离握把 14.6px（顶部只有 6.0），动画里握把就那样从手里滑出去。
 */
export function validateHeldLoad(figures) {
  const errors = [];
  const L = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const variants = loadTypeVariants(figures);
  for (const [name, p] of Object.entries(POSES)) {
    if (!p.load) continue;
    for (const ov of (variants.get(name) ?? new Set([undefined]))) {
    const type = ov ?? p.load.type;
    if (!HELD_LOAD.has(type)) continue;
    // 架在身上的负荷不是握在手里。注意这里的豁免**只用于**手—器械距离这一条：
    // 第十轮核对过，11 个 RACKED 姿态即使不豁免也全部通过（最紧的是背蹲 24.0 ≤ 26），
    // 所以这条豁免其实可以更窄；留着是为了语义清楚，不是为了放过谁。
    if (DRAWN_BEHIND(name, p)) continue;
    // 上限按器械自己的半宽给：杠铃握点可沿杠线外移到杠片内缘，哑铃只有 9，带子 17。
    const max = { bar: 26, front: 26, hands: 11, hands2: 11, handle: 12, band: BAND_HALF + 2 }[type] ?? 12;
    const d = L(drawnArm(name, p, ov).H, p.load.at);
    if (d > max) errors.push(`${name}（画成 ${type}）: 画出的手离器械 ${d.toFixed(1)}px（上限 ${max}）——手该握在上面`);
    }
  }
  return errors;
}

export function validateDrawnAnimation(figures, { steps = 24 } = {}) {
  const errors = [];
  const L = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  for (const [slug, f] of Object.entries(figures)) {
    if (!f.end || f.end === f.start) continue;
    if (!POSES[f.start] || !POSES[f.end]) continue;
    const strip = (p) => (f.no_load ? { ...p, load: undefined } : p);
    const A = strip(POSES[f.start]), B = strip(POSES[f.end]);
    const lt = f.load_type ?? undefined;
    const dA = drawnArm(f.start, A, lt), dB = drawnArm(f.end, B, lt);
    const a = armDescriptor(dA, A), b = armDescriptor(dB, B);
    // 必须和 anim.js 用同一条代码路径：少传 plan，blendArm 就退回「每帧各自就近选边」，
    // 断言核验的是另一条路径——第九轮刚修掉的那条。两端异侧的 6 个动作分歧最大 18.5px。
    const iopts = { plumb: f.plumb, handPath: !!f.hand_path };
    const plan = armSidePlan(a, b, A, B, dA, dB, interpolate, iopts);
    const upMax = Math.max(L(A.shoulder, dA.E), L(B.shoulder, dB.E));
    const foreMax = Math.max(L(dA.E, dA.H), L(dB.E, dB.H));
    const held = HELD_LOAD.has((lt ?? A.load?.type));
    const handMax = held ? Math.max(A.load ? L(dA.H, A.load.at) : 0, B.load ? L(dB.H, B.load.at) : 0) : null;
    const onGround = (p) => p.wrist && Math.abs(p.wrist[1] - GROUND) <= 7;
    const handGrounded = onGround(A) && onGround(B);
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const p = interpolate(A, B, u, { plumb: f.plumb, handPath: !!f.hand_path });
      const arm = blendArm(a, b, u, p, plan) ?? { E: p.elbow, H: p.wrist };
      const at = `${slug} t=${u.toFixed(2)}`;
      if (L(p.shoulder, arm.E) > upMax + 1)
        errors.push(`${at}: 画出的上臂 ${L(p.shoulder, arm.E).toFixed(1)} 超出两端最大值 ${upMax.toFixed(1)}`);
      if (L(arm.E, arm.H) > foreMax + 1)
        errors.push(`${at}: 画出的前臂 ${L(arm.E, arm.H).toFixed(1)} 超出两端最大值 ${foreMax.toFixed(1)}`
          + '——投影不可能长于真骨，手钉在器械上时肘必须由 IK 解出，不能独立插值');
      // 肘角：矢状面手臂逐帧都要像条胳膊。下拉曾在 t=0.8 折到 4.4°——
      // 上臂极角走最短弧从头顶扫到身后，与前臂在中途重合，而两端静态帧都合格。
      // 只对两端都在矢状面内的手臂查肘角：任一端出平面时画出来的是投影，
      // 投影角不是真肘角（反向划船从悬垂到胸触杠，肩一路靠近杠，投影里必然越折越紧）。
      if (!a.rebuilt && !b.rebuilt && !FORESHORTENED_ARM.has(f.start) && !FORESHORTENED_ARM.has(f.end)) {
        const e = deg(arm.E, p.shoulder, arm.H);
        if (e < ELBOW_MIN) errors.push(`${at}: 画出的肘角 ${e.toFixed(1)}° 低于解剖下限 ${ELBOW_MIN}°`
          + '——前臂折回贴在上臂上。两端静态帧合格不代表中间帧合格，扫掠方向可能绕错边');
      }
      // 肘角上限：手钉在器械上、投影骨长又够不到时，手臂会被拉成一条直线——
      // 推举动画曾有 14/25 帧肘角钉在 178°，而同一手位用真骨解只有 137°。
      const eMax = Math.max(deg(dA.E, A.shoulder, dA.H), deg(dB.E, B.shoulder, dB.H));
      // +8：手位与投影骨长各自插值，中途略微超过两端是构造上不可避免的；
      // 真正要拦的是「被拉成直线」那种 67° 的误差。
      if (deg(arm.E, p.shoulder, arm.H) > eMax + 8)
        errors.push(`${at}: 画出的肘角 ${deg(arm.E, p.shoulder, arm.H).toFixed(1)}° 超过两端最大值 ${eMax.toFixed(1)}°`
          + '——手够不到器械时被拉直了，应放长投影到真骨为止，而不是把骨头拉长');

      // 肢体不穿头：静态帧有 validateLimbVsHead，动画帧原来没有——
      // 下拉的肘曾在 t=0.73 整个落进头圆（离头心 8.1px），下一帧就是 41.7px 的瞬移。
      if (p.head && !FACE_LEVEL_ARM.has(f.start) && !FACE_LEVEL_ARM.has(f.end)) {
        const dh = L(arm.E, p.head);
        if (dh < FACE_GEOMETRY.HEAD_R + 3.2)
          errors.push(`${at}: 画出的肘离头心 ${dh.toFixed(1)}px，肘画进脸里了`);
      }
      // 器械不许撞进头里：静态终点帧早有这条断言，动画里复发过（下拉把手离头心 12.2px）
      // 只豁免**画在身体之后**的负荷（架在后颈的杠/带被头挡住，贴着是对的）。
      // 原来按 loadAnchor 豁免：下拉为了稳住把手把锚点改成了 shoulder，
      // 这条专为下拉写的断言当场对下拉失效，把手照旧压在脸上。
      if (handMax !== null && !DRAWN_BEHIND(f.start, A) && p.load && p.head && L(p.load.at, p.head) < HEAD_CLEAR)
        errors.push(`${at}: 器械离头心 ${L(p.load.at, p.head).toFixed(1)}px，小于 ${HEAD_CLEAR}（头半径 + 器械半高）`);
      if (handMax !== null && p.load && L(arm.H, p.load.at) > handMax + 1)
        errors.push(`${at}: 画出的手离器械 ${L(arm.H, p.load.at).toFixed(1)}px（两端只有 ${handMax.toFixed(1)}）——手脱离了负荷`);
      if (handGrounded && Math.abs(arm.H[1] - GROUND) > 4)
        errors.push(`${at}: 手离地 ${(GROUND - arm.H[1]).toFixed(1)}px，而两帧的手都按在地上`);
    }
  }
  return errors;
}

/**
 * 架位断言：背蹲的杠在躯干线**后**，前架位在**前**。
 *
 * 低杠曾写成肩前 4px——比前蹲的杠还靠前，而图注说的是「杠更靠后」。
 * 这类错误用肉眼看侧视图很难察觉（杠就在肩附近），但它把动作讲反了。
 */
const BACK_RACK = new Set(['squat_top', 'squat_bottom', 'squat_lowbar_top', 'squat_lowbar_bottom', 'gm_top', 'gm_bottom']);
const FRONT_RACK = new Set(['squat_front_top', 'squat_front_bottom', 'goblet_top', 'goblet_bottom', 'carry_front']);
export function validateRackSide() {
  const errors = [];
  // 同一动作两帧的躯干系偏移必须一致：杠压在同一块肌肉上，不会在背上滑。
  // 偏移是从世界坐标反推的，两帧原始躯干角不同就会推出两个值——低杠曾差 1.92px。
  for (const [a, b] of [['squat_top', 'squat_bottom'], ['squat_lowbar_top', 'squat_lowbar_bottom'],
                        ['squat_front_top', 'squat_front_bottom'], ['gm_top', 'gm_bottom']]) {
    if (!POSES[a]?.load || !POSES[b]?.load) continue;
    const oa = torsoCoords(POSES[a].hip, POSES[a].shoulder, POSES[a].load.at);
    const ob = torsoCoords(POSES[b].hip, POSES[b].shoulder, POSES[b].load.at);
    const d = Math.hypot(oa[0] - ob[0], oa[1] - ob[1]);
    if (d > 0.5) errors.push(`${a}/${b}: 躯干系的负荷偏移两帧差 ${d.toFixed(2)}px——杠在背上滑`);
  }
  // 跪姿俯卧撑的 cue 是「胸接近地面」，俯卧撑是「离地一拳」：跪姿底部必须更低。
  // 这条关系被修过一次、注释也声称修好了，实际没翻过来——钉成断言，别再靠注释。
  if (POSES.knee_pushup_bottom && POSES.pushup_bottom
      && POSES.knee_pushup_bottom.shoulder[1] <= POSES.pushup_bottom.shoulder[1])
    errors.push(`跪姿俯卧撑底部的肩离地 ${(GROUND - POSES.knee_pushup_bottom.shoulder[1]).toFixed(1)}，`
      + `不低于俯卧撑的 ${(GROUND - POSES.pushup_bottom.shoulder[1]).toFixed(1)}——cue 要求前者更深`);
  // 压在肢体上的阻力垫：两帧在该肢体的局部系里不该滑动（与肩上杠同一条规矩）。
  // 原来只枚举了四对深蹲/早安式姿态，pad 一个都没覆盖，坐姿提踵的垫两帧滑 5.1px。
  for (const [a, b, joint] of [['seated_calf_down', 'seated_calf_up', 'knee'],
                               ['leg_extension_down', 'leg_extension_up', 'ankle'],
                               ['leg_curl_start', 'leg_curl_end', 'ankle']]) {
    const pa = POSES[a], pb = POSES[b];
    if (!pa?.load || !pb?.load) continue;
    const base = joint === 'knee' ? 'hip' : 'knee';
    const oa = torsoCoords(pa[base], pa[joint], pa.load.at), ob = torsoCoords(pb[base], pb[joint], pb.load.at);
    const d = Math.hypot(oa[0] - ob[0], oa[1] - ob[1]);
    if (d > 2) errors.push(`${a}/${b}: 阻力垫在肢体局部系里两帧滑 ${d.toFixed(2)}px——垫子压的位置不该变`);
  }
  // 前架位比背蹲直、低杠比高杠倾：这是杠位推出来的，不是摆出来的
  const lean = (n) => Math.abs(Math.atan2(POSES[n].shoulder[0] - POSES[n].hip[0],
    POSES[n].hip[1] - POSES[n].shoulder[1]) * 180 / Math.PI);
  if (lean('squat_bottom') - lean('squat_front_bottom') < 8)
    errors.push(`前架位底部躯干 ${lean('squat_front_bottom').toFixed(1)}° 没有比高杠 ${lean('squat_bottom').toFixed(1)}° 明显更直`);
  if (lean('squat_lowbar_bottom') - lean('squat_bottom') < 8)
    errors.push(`低杠底部躯干 ${lean('squat_lowbar_bottom').toFixed(1)}° 没有比高杠 ${lean('squat_bottom').toFixed(1)}° 明显更倾`);
  for (const [name, p] of Object.entries(POSES)) {
    if (!p.load || (!BACK_RACK.has(name) && !FRONT_RACK.has(name))) continue;
    const f = facing(name, p);
    const d = (p.load.at[0] - p.shoulder[0]) * f[0] + (p.load.at[1] - p.shoulder[1]) * f[1];
    if (BACK_RACK.has(name) && d > -1)
      errors.push(`${name}: 背部架位的杠却在躯干线前方 ${d.toFixed(1)}px——图注说「杠更靠后」，图画的是更靠前`);
    if (FRONT_RACK.has(name) && d < 1)
      errors.push(`${name}: 前部架位的杠却在躯干线后方 ${(-d).toFixed(1)}px`);
  }
  return errors;
}

/**
 * 动画格的 viewBox 必须装得下全程，不只是两个端点。
 *
 * 中间帧的肢体会摆到两端点连线之外（弧在弦之外），用两张静态图的并集当 viewBox，
 * SVG 就把超出的部分裁掉——实测 49 个动画里 20 个被裁，下拉最多 23px、弯举 13.5px。
 * renderSkeleton 现在按 8 等分采样算动画框；这里用 24 等分复查，不是同义反复。
 */
export function validateAnimBox(figures, box4Of) {
  const errors = [];
  for (const [slug, f] of Object.entries(figures)) {
    if (!f.end || f.end === f.start) continue;
    if (!POSES[f.start] || !POSES[f.end]) continue;
    const bx = box4Of(slug);
    if (!bx) continue;
    const [x0, y0, w, h] = bx, x1 = x0 + w, y1 = y0 + h;
    const strip = (p) => (f.no_load ? { ...p, load: undefined } : p);
    const A = strip(POSES[f.start]), B = strip(POSES[f.end]);
    const plumb = f.plumb !== false && !f.no_load;
    for (let i = 0; i <= 24; i++) {
      const q = interpolate(A, B, i / 24, { plumb: f.plumb, handPath: !!f.hand_path });
      const c = contentBox(q, { plumb, loadType: f.load_type });
      const over = Math.max(x0 - c.x, y0 - c.y, (c.x + c.w) - x1, (c.y + c.h) - y1);
      if (over > 1.5) {
        errors.push(`${slug} t=${(i / 24).toFixed(2)}: 内容超出动画框 ${over.toFixed(1)}px，会被 viewBox 裁掉`);
        break;
      }
    }
  }
  return errors;
}

/**
 * 冠状面断言——契约 §8 长期记着「正视姿态没有任何专属断言」，这里补上。
 *
 * 判据里反复要求「肩线保持水平」「骨盆与肩不转」「两侧等高」，而这些话要成立，
 * 图上得先有一条肩线。六个正视姿态原来两肩重合（肩宽 0），判据无从对照，
 * 侧平举的手臂也只能从同一点岔开 36° 才不压在躯干上。
 */
export function validateCoronal() {
  const errors = [];
  for (const [name, p] of Object.entries(POSES)) {
    if (p.view !== 'front') continue;
    if (!p.shoulder2) { errors.push(`${name}: 正视姿态缺少 shoulder2，画不出肩线`); continue; }
    const w = Math.abs(p.shoulder2[0] - p.shoulder[0]);
    if (w < 24) errors.push(`${name}: 肩宽只有 ${w.toFixed(1)}px——正视图的肩线要能看出是一条线`);
    if (Math.abs(p.shoulder2[1] - p.shoulder[1]) > 1)
      errors.push(`${name}: 两肩高度差 ${Math.abs(p.shoulder2[1] - p.shoulder[1]).toFixed(1)}px，肩线不水平`);
    // 左右对称：两侧对应点关于躯干中线镜像
    const mid = (p.shoulder[0] + p.shoulder2[0]) / 2;
    for (const [a, b] of [['elbow', 'elbow2'], ['wrist', 'wrist2'], ['knee', 'knee2'], ['ankle', 'ankle2']]) {
      if (!p[a] || !p[b]) { errors.push(`${name}: 正视图缺少 ${b}，画不出两侧对照`); continue; }
      const dx = Math.abs((p[a][0] + p[b][0]) / 2 - mid), dy = Math.abs(p[a][1] - p[b][1]);
      if (dx > 2 || dy > 1) errors.push(`${name}: ${a}/${b} 不是左右镜像（中线偏 ${dx.toFixed(1)}、高差 ${dy.toFixed(1)}）`);
    }
  }
  return errors;
}

/**
 * 画出来的肢体不得穿过头颅。
 *
 * 肘与手是实心圆（r=3.2 / 4），上臂与前臂是 6px 宽的线。它们落进头圆里就是「肘长在脸上」。
 * 这条缺口让两处错误连着两轮漏网：引体顶部的肘心离头心 3.4px、杠铃前架位 5.3px，
 * 两者都是「只改了手、没重解肘」或「把肘抬过了头」的后果，而当时所有断言查的都是
 * 负荷与头的距离，没有一条查肢体。
 */
const FACE_LEVEL_ARM = new Set(['face_pull_end']);   // 「从脸前拉」的既定画法
export function validateLimbVsHead(figures) {
  const errors = [];
  const variants = loadTypeVariants(figures);
  const R = FACE_GEOMETRY.HEAD_R;
  for (const [name, p] of Object.entries(POSES)) {
    if (!p.head || !p.shoulder || FACE_LEVEL_ARM.has(name)) continue;
    for (const ov of (variants.get(name) ?? new Set([undefined]))) {
    const d = drawnArm(name, p, ov);
    // 只查肘。手本来就会靠近脸——前架位的手托在锁骨前、引体顶部的手与头同高，
    // 那是动作本身；而肘落进头圆里没有任何动作能解释。
    const dist = Math.hypot(d.E[0] - p.head[0], d.E[1] - p.head[1]);
    if (dist < R + 3.2) errors.push(`${name}: 画出的肘离头心 ${dist.toFixed(1)}px，`
      + `小于头半径 ${R} + 肘半径 3.2——肘画进脸里了`);
    }
  }
  return errors;
}

/**
 * 端点必须回到静态帧——查的是**画出来的**肘与手，而且在 ε 邻域上查。
 *
 * 为什么不查 u=0/1 这两个精确值：浏览器里 u = ease(t/REP)，几乎永远取不到精确的 0 或 1，
 * 画的是 0+ε 与 1−ε。我曾在换边判据里加过一个 `u < 1` 的端点特判，断言采到的 u=1
 * 走特判支、浏览器画的 u=1−ε 走另一支，于是 4.37px 的偏差对断言完全不可见。
 * 所以这条断言一律取 ε 邻域。
 */
export function validateAnimEndpoints(figures) {
  const errors = [];
  const L = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  for (const [slug, f] of Object.entries(figures)) {
    if (!f.end || f.end === f.start) continue;
    if (!POSES[f.start] || !POSES[f.end]) continue;
    const strip = (p) => (f.no_load ? { ...p, load: undefined } : p);
    const A = strip(POSES[f.start]), B = strip(POSES[f.end]);
    const lt = f.load_type ?? undefined;
    const dA = drawnArm(f.start, A, lt), dB = drawnArm(f.end, B, lt);
    const a = armDescriptor(dA, A), b = armDescriptor(dB, B);
    const iopts = { plumb: f.plumb, handPath: !!f.hand_path };
    const plan = armSidePlan(a, b, A, B, dA, dB, interpolate, iopts);
    for (const [u, ref, tag] of [[1e-9, dA, 't=0+'], [1 - 1e-9, dB, 't=1−']]) {
      const q = interpolate(A, B, u, iopts);
      // 矢状面动作（两端都没重建）画的是补间链的 elbow/wrist，一样要回到静态帧——
      // 原来这里 continue 掉了 32 个动作，等于没有任何断言查它们画出来的手臂。
      const arm = blendArm(a, b, u, q, plan) ?? { E: q.elbow, H: q.wrist };
      for (const [got, want, label] of [[arm.E, ref.E, '肘'], [arm.H, ref.H, '手']]) {
        if (L(got, want) > 3)
          errors.push(`${slug} ${tag}: 画出的${label}与静态帧差 ${L(got, want).toFixed(2)}px`);
      }
    }
  }
  return errors;
}

/**
 * cue 明说手臂相对躯干不动的动作，两帧在躯干系里必须同位。
 *
 * 背屈伸的「双手交叉抱胸」原来两帧的前臂在躯干系里整整反了 180°（肘与手对调），
 * 动画中 56% 的帧肘角低于解剖下限、u=0.712 时前臂精确压在上臂上。
 * 而 back_extension_* 在 FORESHORTENED_ARM 里，肘角断言对它整体豁免——
 * 豁免的本意是「投影角不是真角」，不是「随便画」。
 */
const ARM_FIXED_TO_TORSO = [['back_extension_down', 'back_extension_up']];
export function validateArmFixedToTorso() {
  const errors = [];
  for (const [a, b] of ARM_FIXED_TO_TORSO) {
    const pa = POSES[a], pb = POSES[b];
    if (!pa || !pb) { errors.push(`${a}/${b}: 姿态不存在`); continue; }
    const da = drawnArm(a, pa), db = drawnArm(b, pb);
    for (const [ka, kb, label] of [[da.E, db.E, '肘'], [da.H, db.H, '手']]) {
      const oa = torsoCoords(pa.hip, pa.shoulder, ka), ob = torsoCoords(pb.hip, pb.shoulder, kb);
      const d = Math.hypot(oa[0] - ob[0], oa[1] - ob[1]);
      if (d > 2) errors.push(`${a}/${b}: 画出的${label}在躯干系里两帧差 ${d.toFixed(2)}px——cue 要求手臂贴着躯干不动`);
    }
  }
  return errors;
}

/**
 * 主动肌的高亮段必须落在**画出来的**骨头上。
 *
 * 契约 §6 说「主动肌标注画在骨头上」，但一直没有断言。躯干改用两肩中点作顶端之后，
 * 肌肉段的 shoulder 端还取近侧肩，正视图里「核心」那条斜着偏出躯干线 11.2px，
 * 画出来是一道独立斜条而不是骨头上的荧光笔。
 *
 * 这条断言必须从**渲染产物**里读两类线段再比对：用姿态对象重算一遍是同义反复
 * （肌肉段本来就定义成那两个关节的插值点，对着同一组关节量永远是 0）。
 */
export function validateMuscleOnBone(figures, exercises) {
  const errors = [];
  const primeOf = new Map((exercises ?? []).map((e) => [e.slug, e.muscles?.prime ?? []]));
  if (primeOf.size === 0) throw new Error('validateMuscleOnBone 需要 exercises 才能拿到 prime');
  const segDist = (pt, a, b) => {
    const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * vx + (pt[1] - a[1]) * vy) / L2));
    return Math.hypot(pt[0] - (a[0] + vx * t), pt[1] - (a[1] + vy * t));
  };
  // 只认带 data-bone 的线：肌肉段声称附着在哪根骨头上，就对着那一根量。
  // 量「离最近的骨头」会放过真错位——侧平举手臂抬平时肩线与上臂几乎共线，
  // 把中束起点错设成 shoulderMid（16px）离正确上臂只有 0.58px，照样通过。
  const boned = (svg, cls) => [...svg.matchAll(new RegExp(
    `class="${cls}[^"]*" data-bone="([a-z-]+)" x1="([-0-9.]+)" y1="([-0-9.]+)" x2="([-0-9.]+)" y2="([-0-9.]+)"`, 'g'))]
    .map((m) => [m[1], [+m[2], +m[3]], [+m[4], +m[5]]]);
  let checked = 0, expected = 0;
  for (const [slug, f] of Object.entries(figures)) {
    const prime = primeOf.get(slug) ?? [];
    if (!prime.length) continue;
    for (const key of [f.start, f.end]) {
      if (!key || !POSES[key]) continue;
      const svg = renderPose(POSES[key], { name: key, prime, loadType: f.load_type });
      const bones = new Map();
      for (const [bone, a, b] of [...boned(svg, 'sk-trunk'), ...boned(svg, 'sk-limb')]) bones.set(bone, [a, b]);
      if (!bones.size) { errors.push(`${slug}/${key}: 渲染产物里一根骨头都没解析到`); continue; }
      expected += prime.reduce((n, m) => n + (MUSCLE_SEG[m]?.length ?? 0), 0);
      for (const [bone, ma, mb] of boned(svg, 'sk-muscle')) {
        checked++;
        const on = bones.get(bone);
        if (!on) { errors.push(`${slug}/${key}: 肌肉段声称附着在 ${bone}，产物里没有这根骨头`); continue; }
        // 容差 0.5px：全库实测最大 0.000px，收紧零成本
        for (const [pt, which] of [[ma, '起点'], [mb, '终点']]) {
          const d = segDist(pt, on[0], on[1]);
          if (d > 0.5) errors.push(`${slug}/${key}: 肌肉段${which}离 ${bone} 这根骨头 ${d.toFixed(1)}px——没画在它附着的骨头上`);
        }
      }
    }
  }
  // 一条肌肉段都没量到就「通过」是假的通过——这个文件里已经栽过一次无声空转。
  if (expected > 0 && checked === 0) {
    throw new Error(`validateMuscleOnBone 空转：MUSCLE_SEG 给出 ${expected} 段，渲染产物里一段都没解析到`);
  }
  return errors;
}
