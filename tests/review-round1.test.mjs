// figure-reviewer 第一轮查出的 10 条阻塞，逐条锁成回归测试。
// 每条的来源都是一个具体数字（见 PR 描述），这里把那个数字变成断言。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { POSES, GROUND, renderPose } from '../src/render/skeleton.mjs';
import { interpolate } from '../src/render/interp.mjs';
import { validateContacts, validateStraightLines, validateFixedRigs, validateBarOnChest }
  from '../src/validate/poses.mjs';

const root = path.resolve(import.meta.dirname, '..');
const readJson = async (rel) => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const count = (svg, cls) => (svg.match(new RegExp(`class="[^"]*\\b${cls}\\b`, 'g')) ?? []).length;
const box = { x: -100, y: -100, w: 400, h: 400 };

// ── 维度 1：动画丢元素 ──────────────────────────────────

test('补间帧保留 load.type——动画里卧推有杠、健腹轮有轮、帕洛夫有把手', () => {
  for (const [a, b, cls] of [['bench_top', 'bench_bottom', 'sk-plate'],
                              ['rollout_start', 'rollout_end', 'sk-wheel'],
                              ['pallof_in', 'pallof_out', 'sk-handle']]) {
    const want = count(renderPose(POSES[a], { box, name: a }), cls);
    assert.ok(want > 0, `${a} 静态帧就没有 ${cls}，测试前提不成立`);
    for (const t of [0.25, 0.5, 0.75]) {
      const q = interpolate(POSES[a], POSES[b], t, { plumb: false });
      assert.equal(q.load?.type, POSES[a].load.type, `${a}→${b} t=${t} 丢了 load.type`);
      assert.equal(count(renderPose(q, { box, name: a }), cls), want, `${a}→${b} t=${t} 动画帧少了 ${cls}`);
    }
  }
});

test('正视图的补间帧保留远侧腿与 view——动画不会变成单腿、单眼', () => {
  const q = interpolate(POSES.pallof_in, POSES.pallof_out, 0.5, { plumb: false });
  assert.equal(q.view, 'front');
  for (const k of ['knee2', 'ankle2', 'heel2', 'toe2', 'elbow2', 'wrist2']) assert.ok(q[k], `补间帧缺 ${k}`);
  const svg = renderPose(q, { box, name: 'pallof_in' });
  assert.equal(count(svg, 'sk-eye'), 2, '正视图动画帧应有两只眼');
  assert.ok(count(svg, 'sk-far') >= 3, '远侧肢体应当画出来');
});

// ── 维度 2 / 5：引体是人动杠不动 ──────────────────────

test('引体向上：杠两帧同位，人向上移动，顶部下巴过杠', async () => {
  const a = POSES.pullup_hang, b = POSES.pullup_top;
  assert.deepEqual(a.fixed.at, b.fixed.at, '单杠两帧必须在同一位置');
  assert.ok(a.hip[1] - b.hip[1] > 20, `髋应明显上移，实际 ${(a.hip[1] - b.hip[1]).toFixed(1)}px`);
  assert.ok(b.head[1] + 12 <= b.fixed.at[1] + 0.5, `顶部下巴 y=${(b.head[1] + 12).toFixed(1)} 应不低于杠 y=${b.fixed.at[1]}`);
  assert.ok(a.toe[1] < GROUND - 5, '悬垂时脚应离地');
  assert.deepEqual(validateFixedRigs(await readJson('data/figures.json')), []);
});

// ── 维度 2：卧推触胸 ───────────────────────────────────

test('卧推底部杠在胸面上，行程不再只有 9px', () => {
  assert.deepEqual(validateBarOnChest(), []);
  const travel = Math.hypot(POSES.bench_top.load.at[0] - POSES.bench_bottom.load.at[0],
                            POSES.bench_top.load.at[1] - POSES.bench_bottom.load.at[1]);
  assert.ok(travel > 40, `杠的行程 ${travel.toFixed(1)}px 太小`);
});

// ── 维度 2 / 7：帕洛夫在胸高推出 ─────────────────────

test('帕洛夫：手全程在胸高合握，推出不是向下', () => {
  for (const n of ['pallof_in', 'pallof_out']) {
    const p = POSES[n];
    const chest = p.shoulder[1] + (p.hip[1] - p.shoulder[1]) * 0.25;
    assert.ok(Math.abs(p.wrist[1] - chest) <= 6, `${n}: 手离胸线 ${Math.abs(p.wrist[1] - chest).toFixed(1)}px`);
    assert.equal(p.wrist[0], p.shoulder[0], `${n}: 正视图里合握的手应在中线上`);
  }
  // 推出 = 肘向中线收（景深方向在正视图里只能这样表现）
  assert.ok(POSES.pallof_out.elbow[0] > POSES.pallof_in.elbow[0], '推出时肘应向中线收');
});

// ── 维度 2 / 3：健腹轮 ─────────────────────────────────

test('健腹轮向头的方向滚，膝与轮始终在地上', () => {
  const a = POSES.rollout_start, b = POSES.rollout_end;
  const headward = Math.sign(a.head[0] - a.shoulder[0]);
  assert.equal(Math.sign(b.load.at[0] - a.load.at[0]), headward, '轮应向头的方向滚');
  assert.ok(Math.abs(b.load.at[0] - a.load.at[0]) > 40, '滚动距离应明显');
  for (const p of [a, b]) {
    assert.ok(Math.abs(p.knee[1] - GROUND) <= 6, `膝离地 ${(GROUND - p.knee[1]).toFixed(1)}px`);
    assert.ok(Math.abs(p.load.at[1] + 9 - GROUND) <= 3, `轮底离地 ${(GROUND - p.load.at[1] - 9).toFixed(1)}px`);
  }
  assert.ok(Math.hypot(a.knee[0] - b.knee[0], a.knee[1] - b.knee[1]) < 0.5, '膝是支点，两帧不动');
});

// ── 维度 3：支撑关系 ───────────────────────────────────

test('作者画在地面上的点，归一化后仍在地面上', () => {
  assert.deepEqual(validateContacts(), []);
});

test('悬空的接触点会被判失败——断言本身必须会失败', () => {
  const saved = POSES.plank;
  POSES.plank = { ...saved, elbow: [saved.elbow[0], saved.elbow[1] - 20] };
  try {
    assert.ok(validateContacts().some((e) => e.includes('plank') && e.includes('elbow')));
  } finally {
    POSES.plank = saved;
  }
});

test('俯卧撑手掌、平板前臂、臀桥上背都落在地上', () => {
  assert.ok(Math.abs(POSES.pushup_top.wrist[1] - GROUND) <= 6);
  assert.ok(Math.abs(POSES.pushup_bottom.wrist[1] - GROUND) <= 6);
  assert.ok(Math.abs(POSES.plank.elbow[1] - GROUND) <= 6);
  assert.ok(Math.abs(POSES.plank.wrist[1] - GROUND) <= 6);
  assert.ok(Math.abs(POSES.bridge_bottom.shoulder[1] - GROUND) <= 8);
  assert.ok(Math.abs(POSES.bridge_top.shoulder[1] - GROUND) <= 8);
  assert.ok(GROUND - POSES.bridge_bottom.hip[1] <= 14, '底部髋应落回地面附近');
});

test('俯卧家族脚尖在地、脚跟在上', () => {
  for (const n of ['pushup_top', 'pushup_bottom', 'plank', 'rollout_start', 'rollout_end']) {
    const p = POSES[n];
    assert.ok(Math.abs(p.toe[1] - GROUND) <= 6, `${n}: 脚尖应撑地`);
    assert.ok(p.heel[1] < p.toe[1], `${n}: 脚跟应高于脚尖`);
  }
});

// ── 维度 6：身体成直线 ─────────────────────────────────

test('平板、俯卧撑、硬拉锁定、臀桥顶点、健腹轮最远处身体成直线', () => {
  assert.deepEqual(validateStraightLines(), []);
});

test('折角会被判失败', () => {
  const saved = POSES.plank;
  POSES.plank = { ...saved, hip: [saved.hip[0], saved.hip[1] - 25] };
  try {
    assert.ok(validateStraightLines().some((e) => e.includes('plank') && e.includes('hip')));
  } finally {
    POSES.plank = saved;
  }
});

// ── 维度 8：静态与动画一致 ─────────────────────────────

test('补间端点与静态帧逐关节一致', async () => {
  const figs = await readJson('data/figures.json');
  for (const [slug, f] of Object.entries(figs)) {
    if (!f.end || f.end === f.start) continue;
    const A = POSES[f.start], B = POSES[f.end];
    const q0 = interpolate(A, B, 0, { plumb: f.plumb !== false && !f.no_load });
    for (const k of ['hip', 'knee', 'shoulder', 'head']) {
      const d = Math.hypot(q0[k][0] - A[k][0], q0[k][1] - A[k][1]);
      assert.ok(d <= 1, `${slug}: t=0 的 ${k} 与起始帧差 ${d.toFixed(2)}px`);
    }
  }
});
