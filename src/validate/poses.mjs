// 骨架图的几何断言。
//
// §7 排除生成图的理由是「作者无法核验，因此无法打证据标签」。手绘骨架图能进页面，
// 前提是它必须可核验——而可核验的意思不是"我看了一眼觉得对"，是**写成断言、构建期跑**。
// 这个文件就是那个前提。断言失败 = 构建失败，画错的图进不了页面。

import { POSES, GROUND, MIDFOOT, FIG_W, FIG_H } from '../render/skeleton.mjs';

const JOINTS = ['head', 'shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle', 'heel', 'toe'];

// 站姿动作：杠线必须落在足中线附近。容差 ±6，约等于脚长的 1/6——
// 超过这个量在图上已经肉眼可辨，也确实会改变力学结论。
const PLUMB_TOL = 6;

// 这些姿态是站姿且持械，杠线断言对它们生效
const STANDING_LOADED = new Set([
  'squat_bottom', 'squat_top', 'squat_front_bottom', 'squat_front_top',
  'hinge_bottom', 'hinge_top', 'rdl_bottom',
  'ohp_bottom', 'ohp_top', 'row_start', 'row_end',
  'carry_stance', 'carry_front', 'carry_overhead',
]);

// 这些姿态要求髋低于膝（蹲到位）
const DEPTH_REQUIRED = new Set(['squat_bottom', 'squat_front_bottom']);

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
      if (x < -80 || x > FIG_W + 100 || y < -80 || y > FIG_H + 60) {
        push(name, `关节 ${j} 坐标离谱 (${x.toFixed(0)},${y.toFixed(0)})`);
      }
    }

    // 3. 脚不穿地
    for (const j of ['heel', 'toe', 'heel2', 'toe2']) {
      if (p[j] && p[j][1] > GROUND + 8) push(name, `${j} 穿过地面 (y=${p[j][1].toFixed(1)})`);
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
    for (const [j1, j2, label] of LIMBS) {
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

import { rebuildArm, OUT_OF_PLANE_ARM } from '../render/arm.mjs';

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
  ['row_end', 34.5], ['one_arm_row_end', 33.6],
  ['back_extension_down', 31.8], ['back_extension_up', 31.3],
  ['face_pull_end', 28.4], ['curl_up', 23.6], ['triceps_top', 14.7],
]);

/** 关节角校验。出平面的手臂按重建后的肘位判定——那才是实际画出来的东西。 */
export function validateJointAngles() {
  const errors = [];
  for (const [name, p] of Object.entries(POSES)) {
    if (p.hip && p.knee && p.ankle) {
      const k = deg(p.knee, p.hip, p.ankle);
      if (k < KNEE_MIN) errors.push(`${name}: 膝角 ${k.toFixed(1)}° 低于解剖下限 ${KNEE_MIN}°`);
    }
    if (!p.shoulder || !p.elbow || !p.wrist) continue;
    const arm = OUT_OF_PLANE_ARM.has(name) ? rebuildArm(p) : null;
    const e = arm ? deg(arm.elbow, p.shoulder, arm.hand) : deg(p.elbow, p.shoulder, p.wrist);
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
