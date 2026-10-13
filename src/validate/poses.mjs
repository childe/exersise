// 骨架图的几何断言。
//
// §7 排除生成图的理由是「作者无法核验，因此无法打证据标签」。手绘骨架图能进页面，
// 前提是它必须可核验——而可核验的意思不是"我看了一眼觉得对"，是**写成断言、构建期跑**。
// 这个文件就是那个前提。断言失败 = 构建失败，画错的图进不了页面。

import { POSES, RAW_POSES, FORESHORTENED_ARM, GROUND, MIDFOOT, FIG_W, FIG_H, drawnArm } from '../render/skeleton.mjs';
import { interpolate } from '../render/interp.mjs';
import { armDescriptor, blendArm } from '../assets/anim.js';
import { rebuildArmFor, OUT_OF_PLANE_ARM } from '../render/arm.mjs';
import { facing } from '../render/facing.mjs';

const JOINTS = ['head', 'shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle', 'heel', 'toe'];

// 站姿动作：杠线必须落在足中线附近。容差 ±6，约等于脚长的 1/6——
// 超过这个量在图上已经肉眼可辨，也确实会改变力学结论。
const PLUMB_TOL = 6;

// 这些姿态是站姿且持械，杠线断言对它们生效
const STANDING_LOADED = new Set([
  'squat_bottom', 'squat_top', 'squat_front_bottom', 'squat_front_top',
  'squat_lowbar_top', 'squat_lowbar_bottom',
  'hinge_bottom', 'hinge_top', 'rdl_bottom',
  'ohp_bottom', 'ohp_top',
  'carry_stance', 'carry_front', 'carry_overhead',
  'gm_top', 'gm_bottom',    // 早安式也是站姿持械，之前漏在集合外，杠线断言对它不生效
]);

// 这些姿态要求髋低于膝（蹲到位）
const DEPTH_REQUIRED = new Set(['squat_bottom', 'squat_front_bottom', 'squat_lowbar_bottom', 'squat_bw_bottom', 'squat_dbfront_bottom']);

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
                 ['shoulder', 'elbow', '上臂'], ['elbow', 'wrist', '前臂']];
  for (const [slug, f] of Object.entries(figures)) {
    if (!f.end || f.end === f.start) continue;
    const a = POSES[f.start], b = POSES[f.end];
    if (!a || !b) continue;
    // 契约 §4：手臂的投影长度在一次重复内本来就会变（推举底部出平面、顶部回矢状面），
    // 对出平面与指向读者的手臂不套等长断言。腿与躯干始终在矢状面内，照查。
    const armFree = [f.start, f.end].some((n) => OUT_OF_PLANE_ARM.has(n) || FORESHORTENED_ARM.has(n));
    for (const [j1, j2, label] of LIMBS) {
      if (armFree && (j1 === 'shoulder' || j1 === 'elbow')) continue;
      const la = len(a[j1], a[j2]), lb = len(b[j1], b[j2]);
      const diff = Math.abs(la - lb) / Math.max(la, lb);
      if (diff > 0.18) {
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
export function validateJointAngles() {
  const errors = [];
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
    const arm = OUT_OF_PLANE_ARM.has(name) ? rebuildArmFor(name, p) : null;
    const e = arm ? deg(arm.elbow, p.shoulder, arm.hand) : deg(p.elbow, p.shoulder, p.wrist);
    if (arm && arm.fore > 41) errors.push(`${name}: 重建后的前臂 ${arm.fore.toFixed(1)}px 比真长 39 还长，投影不可能长于实物——肘离杠线太远`);
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
export const SUPINE_ON_FLOOR = new Set(['bridge_bottom', 'bridge_top', 'deadbug_start', 'deadbug_end']);

export function validateContacts() {
  const errors = [];
  // 踝不是接触点：脚平放时踝本来就在地面上方 7–9px。接触的是脚跟/脚尖、手、肘、膝、髋、肩。
  const GROUND_JOINTS = ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'heel', 'toe',
                         'shoulder2', 'elbow2', 'wrist2', 'knee2', 'heel2', 'toe2'];
  const TOL = 6.5;
  for (const [name, raw] of Object.entries(RAW_POSES)) {
    const p = POSES[name];
    for (const j of GROUND_JOINTS) {
      if (!raw[j] || !p[j]) continue;
      if (Math.abs(raw[j][1] - GROUND) <= 7 && Math.abs(p[j][1] - GROUND) > TOL) {
        errors.push(`${name}: ${j} 作者画在地面上（y=${raw[j][1]}），归一化后离地 ${(GROUND - p[j][1]).toFixed(1)}px`);
      }
    }
    // 凳面：只查 normalize 登记的支撑关节（卧姿是肩与髋，坐姿是髋，单臂划船是膝）。
    // 手扶把手、脚踩踏板不是"贴凳"，不在此列。
    for (const j of p.support ?? []) {
      if (!p[j]) continue;
      if (p.bench) {
        const d = p.bench[1] - p[j][1];
        if (Math.abs(d - 5.5) > TOL) errors.push(`${name}: ${j} 离凳面 ${d.toFixed(1)}px（应贴着）`);
      } else if (p.benchIncline) {
        const { from, n } = p.benchIncline;
        const d = (p[j][0] - from[0]) * n[0] + (p[j][1] - from[1]) * n[1];   // 沿凳面法线
        if (Math.abs(d + 5) > TOL) errors.push(`${name}: ${j} 离上斜凳面 ${(-d).toFixed(1)}px（应贴着）`);
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
    const upMax = Math.max(L(A.shoulder, dA.E), L(B.shoulder, dB.E));
    const foreMax = Math.max(L(dA.E, dA.H), L(dB.E, dB.H));
    const held = HELD_LOAD.has((lt ?? A.load?.type));
    const handMax = held ? Math.max(A.load ? L(dA.H, A.load.at) : 0, B.load ? L(dB.H, B.load.at) : 0) : null;
    const onGround = (p) => p.wrist && Math.abs(p.wrist[1] - GROUND) <= 7;
    const handGrounded = onGround(A) && onGround(B);
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const p = interpolate(A, B, u, { plumb: f.plumb });
      const arm = blendArm(a, b, u, p) ?? { E: p.elbow, H: p.wrist };
      const at = `${slug} t=${u.toFixed(2)}`;
      if (L(p.shoulder, arm.E) > upMax + 1)
        errors.push(`${at}: 画出的上臂 ${L(p.shoulder, arm.E).toFixed(1)} 超出两端最大值 ${upMax.toFixed(1)}`);
      if (L(arm.E, arm.H) > foreMax + 9)
        errors.push(`${at}: 画出的前臂 ${L(arm.E, arm.H).toFixed(1)} 超出两端最大值 ${foreMax.toFixed(1)} 逾 9px`);
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
const FRONT_RACK = new Set(['squat_front_top', 'squat_front_bottom', 'carry_front']);
export function validateRackSide() {
  const errors = [];
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
