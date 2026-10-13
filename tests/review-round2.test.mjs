// figure-reviewer 第二轮（6 个评审、55 个动作）查出的机制性问题，锁成回归测试。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { POSES, GROUND, MIDFOOT, renderPose, drawnArm, FORESHORTENED_ARM } from '../src/render/skeleton.mjs';
import { interpolate } from '../src/render/interp.mjs';
import { OUT_OF_PLANE_ARM, rebuildArmFor } from '../src/render/arm.mjs';
import { validateSecondHand, validateKneeStable, validateContacts, SUPINE_ON_FLOOR } from '../src/validate/poses.mjs';

const root = path.resolve(import.meta.dirname, '..');
const readJson = async (rel) => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const deg = (c, a, b) => {
  const ux = a[0]-c[0], uy = a[1]-c[1], vx = b[0]-c[0], vy = b[1]-c[1];
  return Math.acos(Math.max(-1, Math.min(1, (ux*vx+uy*vy) / (Math.hypot(ux,uy)*Math.hypot(vx,vy))))) * 180 / Math.PI;
};
// 点在躯干轴上的位置：0=髋，1=肩
const along = (p, pt) => { const s = [p.shoulder[0]-p.hip[0], p.shoulder[1]-p.hip[1]]; const L = len(p.hip,p.shoulder);
  return ((pt[0]-p.hip[0])*s[0] + (pt[1]-p.hip[1])*s[1]) / (L*L); };

// ── 比例：手臂相对躯干 ─────────────────────────────────
test('手臂相对躯干的比例接近真人', () => {
  const p = POSES.carry_stance;
  const arm = len(p.shoulder, p.elbow) + len(p.elbow, p.wrist), torso = len(p.hip, p.shoulder);
  assert.ok(arm / torso > 1.0 && arm / torso < 1.25, `手臂/躯干 = ${(arm/torso).toFixed(2)}，真人约 1.11`);
});

// ── 站姿：脚钉标准位、杠解到足中线 ─────────────────────
test('站姿持械的两帧脚位完全一致，足中线标记在真正的足中点', async () => {
  const figs = await readJson('data/figures.json');
  for (const [slug, f] of Object.entries(figs)) {
    const a = POSES[f.start], b = POSES[f.end ?? f.start];
    if (!a.load || !a.heel || !b.heel || !b.load) continue;
    if (Math.abs(a.heel[1]-GROUND) > 1 || Math.abs(b.heel[1]-GROUND) > 1) continue;
    if (Math.abs(a.load.at[0]-MIDFOOT) > 0.5) continue;   // 不是站姿持械
    assert.ok(len(a.heel, b.heel) < 0.5, `${slug}: 两帧脚跟差 ${len(a.heel,b.heel).toFixed(1)}px`);
    const mid = (a.heel[0] + a.toe[0]) / 2;
    assert.ok(Math.abs(mid - MIDFOOT) < 1, `${slug}: 足中线标记 ${MIDFOOT} 不在足中点 ${mid.toFixed(1)}`);
  }
});

// ── 硬拉家族 ───────────────────────────────────────────
test('硬拉起始杠在地上，锁定杠在大腿；RDL 膝角基本不变', () => {
  assert.ok(GROUND - POSES.hinge_bottom.load.at[1] <= 10, `硬拉起始杠离地 ${(GROUND - POSES.hinge_bottom.load.at[1]).toFixed(1)}px`);
  const top = POSES.hinge_top;
  assert.ok(top.load.at[1] > top.hip[1] && top.load.at[1] < top.knee[1], '锁定时杠应在髋与膝之间（大腿）');
  assert.deepEqual(validateKneeStable(), []);
});

test('早安式的负荷在颈后、带子从脚下拉起，不是手里的杠', () => {
  for (const n of ['gm_top', 'gm_bottom']) {
    const p = POSES[n];
    assert.equal(p.load.type, 'band');
    assert.ok(p.load.at[1] < p.shoulder[1] + 2, `${n}: 负荷应在肩/颈后，不在手里`);
    assert.ok(Math.abs(p.load.from[1] - GROUND) < 1, `${n}: 带子应从地面（脚下）拉起`);
  }
});

// ── 划船家族：拉到躯干哪里 ─────────────────────────────
test('划船拉到肚脐–肋下，不是拉到肩', () => {
  const s = along(POSES.row_end, POSES.row_end.load.at);
  assert.ok(s > 0.3 && s < 0.65, `杠铃划船终点杠在躯干 s=${s.toFixed(2)}（应 0.3–0.65）`);
  const s2 = along(POSES.one_arm_row_end, POSES.one_arm_row_end.load.at);
  assert.ok(s2 > 0.15 && s2 < 0.5, `单臂划船终点哑铃在躯干 s=${s2.toFixed(2)}（应 0.15–0.5，髋侧）`);
});

test('下拉把手不在头里，面拉肘高于手', () => {
  const pd = POSES.pulldown_end;
  assert.ok(len(pd.load.at, pd.head) > 12 + 4, `下拉把手离头心 ${len(pd.load.at, pd.head).toFixed(1)}px`);
  const fp = POSES.face_pull_end;
  assert.ok(fp.elbow[1] < fp.wrist[1], '面拉终点肘应高于手');
  assert.ok(fp.wrist[0] > fp.head[0] + 12, '面拉终点手应在脸前，不在头里');
});

// ── 反向划船：脚跟是支点，杠固定，顶部出平面 ─────────
test('反向划船绕脚跟旋转、杠两帧同位', () => {
  const a = POSES.inverted_row_start, b = POSES.inverted_row_end;
  for (const p of [a, b]) assert.ok(Math.abs(p.heel[1] - GROUND) <= 1, '脚跟应在地上');
  assert.ok(len(a.heel, b.heel) < 0.5, '脚跟两帧不动');
  assert.deepEqual(a.fixed.at, b.fixed.at);
  assert.ok(a.shoulder[1] - b.shoulder[1] > 40, '肩应明显上升');
  assert.ok(OUT_OF_PLANE_ARM.has('inverted_row_end'));
});

// ── 推家族 ─────────────────────────────────────────────
test('推举起始肘在肩前（不是颈后推），坐姿推举两只哑铃齐平且各有手臂', () => {
  for (const n of ['ohp_bottom', 'seated_press_bottom']) {
    const p = POSES[n], r = rebuildArmFor(n, p);
    assert.ok(r.elbow[0] > p.shoulder[0], `${n}: 肘应在肩前，实际 ${(r.elbow[0]-p.shoulder[0]).toFixed(1)}`);
  }
  assert.deepEqual(validateSecondHand(), []);
  const t = POSES.seated_press_top;
  assert.ok(Math.abs(t.load.at[1] - t.load.at2[1]) < 4, `锁定位两只哑铃高差 ${Math.abs(t.load.at[1]-t.load.at2[1]).toFixed(1)}`);
  assert.ok(t.load.at2[1] < t.head[1] - 12, '远侧哑铃也应过头');
});

test('卧推底部：前臂竖直、杠在胸骨下段、重建前臂不超真长', () => {
  for (const n of ['bench_bottom', 'incline_bottom']) {
    const p = POSES[n], r = rebuildArmFor(n, p);
    assert.ok(r.fore <= 41, `${n}: 前臂 ${r.fore.toFixed(1)} > 39`);
    const s = along(p, p.load.at);
    assert.ok(s > 0.55 && s < 0.85, `${n}: 杠在躯干 s=${s.toFixed(2)}（胸骨应在 0.55–0.85）`);
  }
  const r = rebuildArmFor('bench_bottom', POSES.bench_bottom);
  assert.ok(Math.abs(r.hand[0] - r.elbow[0]) < 1, '平板卧推底部前臂应竖直（手在肘正上方）');
});

test('侧平举与反向飞鸟的肘角两帧一致', () => {
  for (const [a, b] of [['lateral_raise_down', 'lateral_raise_up'], ['reverse_fly_start', 'reverse_fly_end']]) {
    const pa = POSES[a], pb = POSES[b];
    const d = Math.abs(deg(pa.elbow, pa.shoulder, pa.wrist) - deg(pb.elbow, pb.shoulder, pb.wrist));
    assert.ok(d < 6, `${a}→${b} 肘角变化 ${d.toFixed(1)}°`);
  }
});

// ── 核心 / 支撑 ────────────────────────────────────────
test('死虫仰卧贴地，对侧伸展：手向头后、腿伸直', () => {
  assert.deepEqual(validateContacts().filter((e) => e.includes('deadbug')), []);
  const e = POSES.deadbug_end;
  assert.ok(e.wrist[0] < e.shoulder[0] - 30, '伸展的手应在头的方向');
  assert.ok(deg(e.knee, e.hip, e.ankle) > 150, `伸展腿膝角 ${deg(e.knee,e.hip,e.ankle).toFixed(1)}° 应接近伸直`);
  assert.ok(SUPINE_ON_FLOOR.has('deadbug_start'));
});

test('帕洛夫推出接近伸直（反算真肘角 ≥150°）', () => {
  const p = POSES.pallof_out;
  const u = len(p.shoulder, p.elbow), f = len(p.elbow, p.wrist);
  // 投影长度即真相（FORESHORTENED），用骨长反算景深
  const zu = Math.sqrt(Math.max(0, 50*50 - u*u)), zf = Math.sqrt(Math.max(0, 39*39 - f*f));
  const U = [p.elbow[0]-p.shoulder[0], p.elbow[1]-p.shoulder[1], zu], F = [p.wrist[0]-p.elbow[0], p.wrist[1]-p.elbow[1], zf];
  const cos = (-(U[0]*F[0]+U[1]*F[1]+U[2]*F[2])) / (50*39);
  const trueDeg = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
  assert.ok(FORESHORTENED_ARM.has('pallof_out'));
  assert.ok(trueDeg > 150, `推出时真肘角 ${trueDeg.toFixed(1)}°`);
});

test('健腹轮最远点肩角打开，手在轮轴上方', () => {
  const e = POSES.rollout_end;
  assert.ok(deg(e.shoulder, e.hip, e.wrist) > 110, `肩角 ${deg(e.shoulder,e.hip,e.wrist).toFixed(1)}°`);
  assert.ok(e.load.at[1] - e.wrist[1] > 4, '手应在轮轴上方');
});

// ── 动画：支点、手臂连续、末帧 ─────────────────────────
test('补间的根随动作：悬垂腕根、俯卧撑脚尖根、健腹轮膝根，支点全程不漂', () => {
  const cases = [['pullup_hang','pullup_top','wrist'], ['pushup_top','pushup_bottom','toe'], ['rollout_start','rollout_end','knee'], ['squat_top','squat_bottom','ankle']];
  for (const [a, b, root] of cases) {
    for (let i = 0; i <= 20; i++) {
      const q = interpolate(POSES[a], POSES[b], i/20, { plumb: root === 'ankle' });
      assert.equal(q._root, root, `${a}→${b} 根应为 ${root}`);
      assert.ok(len(q[root], POSES[a][root]) < 0.5, `${a}→${b} t=${i/20}: 支点 ${root} 漂 ${len(q[root],POSES[a][root]).toFixed(2)}`);
    }
  }
});

test('俯卧撑动画全程手在地上（身体绕脚尖转动）', () => {
  for (let i = 0; i <= 20; i++) {
    const q = interpolate(POSES.pushup_top, POSES.pushup_bottom, i/20, { plumb: false });
    assert.ok(Math.abs(q.wrist[1] - GROUND) <= 1.5, `t=${i/20}: 手离地 ${(GROUND - q.wrist[1]).toFixed(1)}px`);
  }
});

test('动画画出来的手臂在两端点之间连续，末帧与静态帧相同', async () => {
  const figs = await readJson('data/figures.json');
  for (const [slug, f] of Object.entries(figs)) {
    if (!f.end || f.end === f.start) continue;
    const A = POSES[f.start], B = POSES[f.end];
    if (!A.shoulder || !B.shoulder) continue;
    const rel = (arm, p) => ({ E: [arm.E[0]-p.shoulder[0], arm.E[1]-p.shoulder[1]], H: [arm.H[0]-p.shoulder[0], arm.H[1]-p.shoulder[1]] });
    const a = rel(drawnArm(f.start, A), A), b = rel(drawnArm(f.end, B), B);
    let prev = null;
    for (let i = 0; i <= 48; i++) {
      const u = i/48, q = interpolate(A, B, u, { plumb: f.plumb !== false && !f.no_load });
      const H = [q.shoulder[0] + a.H[0] + (b.H[0]-a.H[0])*u, q.shoulder[1] + a.H[1] + (b.H[1]-a.H[1])*u];
      if (prev) assert.ok(len(H, prev) < 6, `${slug}: 手在相邻帧跳 ${len(H,prev).toFixed(1)}px`);
      prev = H;
    }
    const endH = drawnArm(f.end, B).H;
    assert.ok(len(prev, endH) < 1, `${slug}: 动画末帧的手与静态帧差 ${len(prev,endH).toFixed(1)}px`);
  }
});

test('动画末帧骨架与静态结束帧一致（两帧脚位一致的前提下）', async () => {
  const figs = await readJson('data/figures.json');
  for (const [slug, f] of Object.entries(figs)) {
    if (!f.end || f.end === f.start) continue;
    const q = interpolate(POSES[f.start], POSES[f.end], 1, { plumb: f.plumb !== false && !f.no_load });
    for (const k of ['hip', 'shoulder', 'knee']) {
      assert.ok(len(q[k], POSES[f.end][k]) <= 3, `${slug}: t=1 的 ${k} 与结束帧差 ${len(q[k], POSES[f.end][k]).toFixed(1)}px`);
    }
  }
});

test('动画帧保留器械类型覆盖（哑铃卧推动画里是哑铃）', async () => {
  const figs = await readJson('data/figures.json');
  const f = figs['db-bench-press'];
  assert.equal(f.load_type, 'hands');
  const q = interpolate(POSES[f.start], POSES[f.end], 0.5, { plumb: false });
  const svg = renderPose(q, { box: { x: -100, y: -100, w: 400, h: 400 }, name: f.start, loadType: f.load_type });
  assert.ok(svg.includes('sk-dumbbell') && !svg.includes('sk-plate'), '覆盖后动画帧应画哑铃不画杠片');
});
