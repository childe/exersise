import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { POSES, MIDFOOT, GROUND, renderPose, renderSkeleton } from '../src/render/skeleton.mjs';
import { interpolate, validateInterp } from '../src/render/interp.mjs';
import { rebuildArm, OUT_OF_PLANE_ARM } from '../src/render/arm.mjs';
import { MUSCLE_SEG } from '../src/render/muscle-segments.mjs';
import { validateJointAngles, ELBOW_PENDING, validateFigures } from '../src/validate/poses.mjs';
import { MUSCLE_NAMES } from '../src/render/muscles.mjs';

const root = path.resolve(import.meta.dirname, '..');
const readJson = async (rel) => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const deg = (c, a, b) => {
  const ux = a[0] - c[0], uy = a[1] - c[1], vx = b[0] - c[0], vy = b[1] - c[1];
  return Math.acos(Math.max(-1, Math.min(1,
    (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))))) * 180 / Math.PI;
};

// ── 补间的三条约束 ─────────────────────────────────────

test('每个双帧动作的补间都满足三条约束', async () => {
  const figs = await readJson('data/figures.json');
  const bad = [];
  for (const [slug, f] of Object.entries(figs)) {
    if (!f.end || f.end === f.start) continue;
    const errs = validateInterp(POSES[f.start], POSES[f.end],
      { plumb: f.plumb !== false && !f.no_load });
    if (errs.length) bad.push(`${slug}: ${errs[0]}`);
  }
  assert.deepEqual(bad, []);
});

test('补间按骨骼方向算——中间帧骨长不漂移', () => {
  const A = POSES.squat_top, B = POSES.squat_bottom;
  const ref = len(A.hip, A.knee);
  for (let i = 0; i <= 20; i++) {
    const q = interpolate(A, B, i / 20);
    assert.ok(Math.abs(len(q.hip, q.knee) - ref) < 0.01,
      `t=${i / 20}: 大腿 ${len(q.hip, q.knee).toFixed(2)}，应为 ${ref.toFixed(2)}`);
  }
});

test('踩地姿态的脚在补间全程不动——根在踝不在髋', () => {
  const A = POSES.squat_top, B = POSES.squat_bottom;
  for (let i = 0; i <= 20; i++) {
    const q = interpolate(A, B, i / 20);
    assert.ok(Math.abs(q.heel[0] - A.heel[0]) < 0.01,
      `t=${i / 20}: 脚跟滑了 ${(q.heel[0] - A.heel[0]).toFixed(2)}px`);
  }
});

test('躯干角由杠过足中线反解，不是插值出来的', () => {
  const A = POSES.squat_top, B = POSES.squat_bottom;
  for (let i = 0; i <= 20; i++) {
    const q = interpolate(A, B, i / 20, { plumb: true });
    assert.ok(q._solved, `t=${i / 20}: 未解出躯干角`);
    assert.ok(Math.abs(q.load.at[0] - MIDFOOT) < 0.01,
      `t=${i / 20}: 杠偏离足中线 ${Math.abs(q.load.at[0] - MIDFOOT).toFixed(2)}px`);
  }
});

// 这三条是本次改动的全部理由，断言必须真的会失败，否则只是装饰
test('髋根插值会让脚在地上滑——所以根必须在踝', () => {
  // 复现改之前的做法：髋做线性位移，膝踝靠角度推出去
  const A = POSES.squat_top, B = POSES.squat_bottom;
  const lerp = (a, b, t) => a + (b - a) * t;
  const ang = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
  const from = (o, a, l) => [o[0] + Math.cos(a) * l, o[1] + Math.sin(a) * l];
  const hip = [lerp(A.hip[0], B.hip[0], 0.5), lerp(A.hip[1], B.hip[1], 0.5)];
  const knee = from(hip, (ang(A.hip, A.knee) + ang(B.hip, B.knee)) / 2, len(A.hip, A.knee));
  const ankle = from(knee, (ang(A.knee, A.ankle) + ang(B.knee, B.ankle)) / 2, len(A.knee, A.ankle));
  const slide = Math.abs(ankle[0] - A.ankle[0]);
  assert.ok(slide > 5, `髋根应当把踝推开（实际 ${slide.toFixed(1)}px）——这正是要避免的`);
  const fixed = interpolate(A, B, 0.5);
  assert.ok(Math.abs(fixed.ankle[0] - A.ankle[0]) < 0.01, '踝根插值不该有这个位移');
});

test('两帧骨长不一致会被判失败——只比起始帧的话这条断言是同义反复', () => {
  const A = POSES.squat_top;
  const B = { ...POSES.squat_bottom, knee: [POSES.squat_bottom.knee[0], POSES.squat_bottom.knee[1] + 25] };
  const errs = validateInterp(A, B);
  assert.ok(errs.some((e) => e.includes('骨长与结束帧不符')),
    `应当报出与结束帧不符，实际: ${errs.slice(0, 2).join(' | ') || '无'}`);
  // 反过来确认它不是见谁都报：原样的两帧必须干净
  assert.deepEqual(validateInterp(POSES.squat_top, POSES.squat_bottom)
    .filter((e) => e.includes('骨长')), []);
});

// ── 出平面手臂 ─────────────────────────────────────────

test('出平面姿态重建后的肘角都进入可读范围', () => {
  for (const name of OUT_OF_PLANE_ARM) {
    const p = POSES[name];
    const r = rebuildArm(p);
    assert.ok(r, `${name}: 重建失败`);
    assert.ok(r.deg >= r.minDeg, `${name}: 肘角 ${r.deg.toFixed(1)}°，下限 ${r.minDeg}°`);
  }
});

test('握点不压到杠片上——压上去就看不出那是只手', () => {
  const PLATE_INNER = 31 - 7;   // 与 skeleton.mjs 的 load() 保持一致
  for (const name of OUT_OF_PLANE_ARM) {
    const p = POSES[name];
    const bar = p.load ?? p.fixed;   // 引体的杠是 fixed
    const off = Math.abs(rebuildArm(p).hand[0] - bar.at[0]);
    assert.ok(off <= PLATE_INNER + 0.01, `${name}: 握点偏移 ${off.toFixed(1)} > ${PLATE_INNER}`);
  }
});

test('重建保留原始肘朝向——它编码的是教学提示', () => {
  // 背蹲肘向后下、前架位向前下。方向丢了等于把动作要点一起丢了。
  for (const [name, side] of [['squat_top', -1], ['ohp_bottom', 1], ['squat_front_top', 1]]) {
    const p = POSES[name], r = rebuildArm(p);
    const before = Math.sign(p.elbow[0] - p.shoulder[0]);
    const after = Math.sign(r.elbow[0] - p.shoulder[0]);
    assert.equal(after, before, `${name}: 肘的前后朝向被改了`);
    assert.equal(after, side, `${name}: 肘朝向与动作要点不符`);
    assert.ok(r.elbow[1] > p.shoulder[1], `${name}: 肘应当在肩之下`);
  }
});

test('逐帧重建连续，不跳变', () => {
  const A = POSES.squat_top, B = POSES.squat_bottom;
  let prev = null;
  for (let i = 0; i <= 60; i++) {
    const r = rebuildArm(interpolate(A, B, i / 60));
    if (prev) {
      assert.ok(len(r.elbow, prev.elbow) < 2, `t=${i / 60}: 肘单帧位移 ${len(r.elbow, prev.elbow).toFixed(2)}px`);
      assert.ok(len(r.hand, prev.hand) < 2, `t=${i / 60}: 手单帧位移 ${len(r.hand, prev.hand).toFixed(2)}px`);
    }
    prev = r;
  }
});

// ── 关节角棘轮 ─────────────────────────────────────────

test('关节角校验通过', () => {
  assert.deepEqual(validateJointAngles(), []);
});

test('新增的超限肘角会让构建失败——棘轮只锁现状，不接纳新债', () => {
  const saved = POSES.pulldown_end;
  // 把手腕拉到肩旁边，制造一个折叠的肘
  POSES.pulldown_end = { ...saved, wrist: [saved.shoulder[0] + 1, saved.shoulder[1] + 1] };
  try {
    const errs = validateJointAngles();
    assert.ok(errs.some((e) => e.includes('pulldown_end') && e.includes('低于解剖下限')),
      `应当报出肘角超限，实际: ${errs.join(' | ')}`);
  } finally {
    POSES.pulldown_end = saved;
  }
});

test('已修好的姿态必须从棘轮表里移除', () => {
  // 棘轮表现在是空的（第二轮把 7 个都修了）。临时登记一个合格的姿态，断言必须报"应移除"。
  assert.equal(ELBOW_PENDING.size, 0, '棘轮表应已清空；若有新登记项，这条测试要改用它');
  ELBOW_PENDING.set('pulldown_start', 20);
  try {
    assert.ok(validateJointAngles().some((e) => e.includes('pulldown_start') && e.includes('应从 ELBOW_PENDING 移除')));
  } finally {
    ELBOW_PENDING.delete('pulldown_start');
  }
});

// ── 主动肌标注 ─────────────────────────────────────────

test('肌肉→线段映射与动作库词表一一对应', () => {
  assert.deepEqual(Object.keys(MUSCLE_SEG).sort(), [...MUSCLE_NAMES].sort());
});

test('每段映射都落在合法关节对与 0–1 区间内', () => {
  const JOINTS = new Set(['shoulder', 'hip', 'knee', 'ankle', 'elbow', 'wrist']);
  for (const [m, segs] of Object.entries(MUSCLE_SEG)) {
    assert.ok(segs.length > 0, `${m} 没有线段`);
    for (const [a, b, t0, t1] of segs) {
      assert.ok(JOINTS.has(a) && JOINTS.has(b), `${m}: 关节 ${a}/${b} 不可用`);
      assert.ok(t0 >= 0 && t1 <= 1 && t0 < t1, `${m}: 区间 [${t0}, ${t1}] 非法`);
    }
  }
});

test('动作卡画出它自己的主动肌', async () => {
  const exercises = await readJson('data/exercises.json');
  const figs = await readJson('data/figures.json');
  const e = exercises.find((x) => x.slug === 'back-squat-high-bar');
  const html = renderSkeleton(figs[e.slug], e.name_zh, e.muscles.prime);
  assert.ok(html.includes('sk-muscle'), '主动肌没有画出来');
  assert.ok(html.includes('data-anim'), '双帧动作应登记动画数据');
  const cfg = JSON.parse(html.match(/data-anim="([^"]+)"/)[1].replace(/&quot;/g, '"'));
  assert.deepEqual(cfg.prime, e.muscles.prime);
  assert.equal(cfg.a, figs[e.slug].start);
});

test('不传主动肌就不画肌肉层——静态图的既有行为不变', () => {
  const svg = renderPose(POSES.squat_top, { plumb: true, name: 'squat_top' });
  assert.ok(!svg.includes('sk-muscle'));
});

// ── 器械与身体分色 ─────────────────────────────────────

test('器械、判据线、主动肌各用各的颜色变量', async () => {
  const css = await readFile(path.join(root, 'src/assets/styles.css'), 'utf8');
  const decl = (sel) => css.match(new RegExp(`\\${sel}\\s*\\{[^}]*\\}`))?.[0] ?? '';
  assert.match(decl('.sk-bar'), /--equip/, '器械应走 --equip');
  assert.match(decl('.sk-plumb'), /--accent/, '判据线应走 --accent');
  assert.match(decl('.sk-muscle'), /--danger/, '主动肌应与肌肉分布图同色');
  // --equip 必须在三处主题块里都有定义，否则某个主题下是空值
  assert.equal((css.match(/--equip:/g) ?? []).length, 3, '--equip 应在浅色/深色/手动深色三处都定义');
});

test('no_load 用上出平面手臂的姿态会被判失败——否则手臂静默回落成折叠的', async () => {
  const exercises = await readJson('data/exercises.json');
  const bad = { 'bodyweight-squat': { start: 'squat_top', end: 'squat_bottom', no_load: true } };
  for (const e of exercises) if (!bad[e.slug]) bad[e.slug] = { start: 'plank' };
  const errs = validateFigures(bad, exercises);
  assert.ok(errs.some((e) => e.includes('no_load') && e.includes('squat_top')),
    `应当报出 no_load 与出平面手臂矛盾，实际: ${errs.slice(0, 2).join(' | ')}`);
});

test('自重深蹲用自己的手臂姿态：前伸、在矢状面内、不需要重建', () => {
  for (const n of ['squat_bw_top', 'squat_bw_bottom']) {
    const p = POSES[n];
    assert.ok(!OUT_OF_PLANE_ARM.has(n), `${n} 不该在出平面集合里`);
    assert.equal(p.load, undefined, `${n} 不该带负荷`);
    assert.ok(p.wrist[0] - p.shoulder[0] > 30, `${n}: 手该在肩前，实际 ${(p.wrist[0] - p.shoulder[0]).toFixed(1)}px`);
    assert.ok(deg(p.elbow, p.shoulder, p.wrist) >= 35, `${n}: 肘角 ${deg(p.elbow, p.shoulder, p.wrist).toFixed(1)}°`);
  }
});

// ── 低杠背蹲必须真的和高杠不同 ─────────────────────────

test('低杠与高杠不共用姿态——图注声称有差别就不能画一样的图', async () => {
  const figs = await readJson('data/figures.json');
  const hi = figs['back-squat-high-bar'], lo = figs['back-squat-low-bar'];
  assert.notEqual(lo.start, hi.start, '低杠与高杠共用了起始姿态');
  assert.notEqual(lo.end, hi.end, '低杠与高杠共用了结束姿态');
});

test('低杠的两处差别可量：杠位更低、躯干更倾', () => {
  const lean = (p) => Math.abs(Math.atan2(p.shoulder[0] - p.hip[0], p.hip[1] - p.shoulder[1]) * 180 / Math.PI);
  // 杠位：高杠在肩之上（斜方肌上缘），低杠在肩之下（后三角/肩胛冈）
  assert.ok(POSES.squat_top.load.at[1] < POSES.squat_top.shoulder[1],
    '高杠的杠应在肩之上');
  assert.ok(POSES.squat_lowbar_top.load.at[1] > POSES.squat_lowbar_top.shoulder[1] + 5,
    '低杠的杠应明显在肩之下');
  // 躯干：底部前倾低杠明显更多
  const d = lean(POSES.squat_lowbar_bottom) - lean(POSES.squat_bottom);
  assert.ok(d > 8, `低杠底部应比高杠前倾更多，实际只多 ${d.toFixed(1)}°`);
});

test('髋更往后是约束推出来的，不是摆出来的', () => {
  // 杠位更低 + 躯干更倾，而「杠过足中线」对两者都不变 → 髋必须更往后走。
  // 这条断言的意义：如果哪天有人"顺手"把低杠的髋挪回去，图就不再演示这个力学关系了。
  const back = POSES.squat_bottom.hip[0] - POSES.squat_lowbar_bottom.hip[0];
  assert.ok(back > 8, `低杠底部的髋应明显更靠后，实际只多 ${back.toFixed(1)}px`);
  for (const n of ['squat_bottom', 'squat_lowbar_bottom']) {
    assert.ok(Math.abs(POSES[n].load.at[0] - MIDFOOT) < 0.5,
      `${n}: 杠未落在足中线上，上面那条推理的前提就不成立`);
  }
});

test('契约文档与代码里的阈值一致', async () => {
  const doc = await readFile(path.join(root, 'docs/figure-contract.md'), 'utf8');
  // 文档写错数字比没有文档更糟——它会被当成权威
  for (const [what, want] of [['大腿 / 小腿', '60 / 60'], ['上臂 / 前臂', '50 / 39'],
                              ['躯干 / 颈', '80 / 17']]) {
    assert.ok(doc.includes(what) && doc.includes(want), `契约里的 ${what} 应为 ${want}`);
  }
  assert.ok(doc.includes('35°') && doc.includes('38°'), '契约应记录肘/膝角下限');
  assert.ok(doc.includes('25px'), '契约应记录投影缩短长度');
  assert.ok(doc.includes('±24'), '契约应记录握点上限');
});
