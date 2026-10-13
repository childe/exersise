import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { POSES, POSE_NAMES, renderSkeleton, renderPose, contentBox, drawnArm, MIDFOOT, GROUND, FIG_W, FIG_H } from '../src/render/skeleton.mjs';
import { validatePoses, validateFigures, validateMuscles, validateFrameConsistency } from '../src/validate/poses.mjs';
import { MUSCLE_NAMES, MUSCLE_REGIONS, renderCardMuscleMap, renderFullMuscleMap } from '../src/render/muscles.mjs';

const root = path.resolve(import.meta.dirname, '..');
const readJson = async (rel) => JSON.parse(await readFile(path.join(root, rel), 'utf8'));

test('全部姿态通过几何断言', () => {
  assert.deepEqual(validatePoses(), []);
});

test('每个动作都有骨架图，且引用的姿态都存在', async () => {
  const figures = await readJson('data/figures.json');
  const exercises = await readJson('data/exercises.json');
  assert.deepEqual(validateFigures(figures, exercises), []);
});

test('肌肉词表与分区定义一一对应', async () => {
  const exercises = await readJson('data/exercises.json');
  assert.deepEqual(validateMuscles(exercises, MUSCLE_NAMES), []);
});

test('同一动作两帧的肢体长度一致', async () => {
  const figures = await readJson('data/figures.json');
  assert.deepEqual(validateFrameConsistency(figures), []);
});

test('骨架归一化让肢体长度成为构造事实', () => {
  const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const lens = POSE_NAMES.map((n) => len(POSES[n].hip, POSES[n].knee));
  const spread = Math.max(...lens) - Math.min(...lens);
  assert.ok(spread < 0.5, `全部姿态的大腿长度应当相同，实际跨度 ${spread.toFixed(2)}`);
});

test('站姿持械姿态的杠线落在足中线上——由平移构造保证', () => {
  for (const n of ['squat_bottom', 'squat_top', 'hinge_bottom', 'hinge_top', 'carry_stance']) {
    assert.ok(Math.abs(POSES[n].load.at[0] - MIDFOOT) < 0.5,
      `${n}: 杠 x=${POSES[n].load.at[0].toFixed(1)}，足中线 ${MIDFOOT}`);
  }
});

// ——— 断言本身必须会失败，否则它只是装饰 ———

test('杠线偏离足中线会被判失败', () => {
  const good = POSES.squat_bottom;
  assert.equal(Math.abs(good.load.at[0] - MIDFOOT) <= 6, true, '基准姿态应当是合格的');
  // 把杠挪到脚跟后方——正是两轮生成图犯的那个错
  const bad = { ...good, load: { ...good.load, at: [good.heel[0] - 4, good.load.at[1]] } };
  const saved = POSES.squat_bottom;
  POSES.squat_bottom = bad;
  try {
    const errs = validatePoses();
    assert.ok(errs.some((e) => e.includes('squat_bottom') && e.includes('偏离足中线')),
      `应当报出杠线偏离，实际: ${errs.join(' | ')}`);
  } finally {
    POSES.squat_bottom = saved;
  }
});

test('髋没低于膝会被判失败', () => {
  const saved = POSES.squat_bottom;
  POSES.squat_bottom = { ...saved, hip: [saved.hip[0], saved.knee[1] - 10] };
  try {
    const errs = validatePoses();
    assert.ok(errs.some((e) => e.includes('髋低于膝')), `应当报出深度不足，实际: ${errs.join(' | ')}`);
  } finally {
    POSES.squat_bottom = saved;
  }
});

test('坐标离谱会被判失败', () => {
  // viewBox 已改为按内容自动裁剪，固定画布不再是约束；
  // 但坐标跑到离谱的位置仍然说明姿态写错了，这条合理性边界必须还在。
  const saved = POSES.carry_stance;
  POSES.carry_stance = { ...saved, head: [FIG_W + 400, 20] };
  try {
    assert.ok(validatePoses().some((e) => e.includes('坐标离谱')));
  } finally {
    POSES.carry_stance = saved;
  }
});

test('缺图的动作会被判失败', async () => {
  const figures = await readJson('data/figures.json');
  const exercises = await readJson('data/exercises.json');
  const { ...missing } = figures;
  delete missing['pull-up'];
  assert.ok(validateFigures(missing, exercises).some((e) => e.includes('pull-up')));
});

test('未知肌肉会被判失败——分区图画不出来的肌肉不许进数据', () => {
  const errs = validateMuscles(
    [{ slug: 'x', muscles: { prime: ['前锯肌'], synergist: [], stabilizer: [] } }],
    MUSCLE_NAMES,
  );
  assert.ok(errs.some((e) => e.includes('前锯肌')));
});

// ——— 渲染 ———

test('骨架图输出两帧，且含判据线', () => {
  const svg = renderSkeleton({ start: 'squat_top', end: 'squat_bottom' }, '高杠背蹲');
  assert.equal((svg.match(/<svg /g) ?? []).length, 2);
  assert.ok(svg.includes('sk-plumb'), '站姿持械动作必须画出杠线');
  assert.ok(svg.includes('sk-midfoot'), '站姿持械动作必须画出足中线');
  assert.ok(svg.includes('role="img"'));
  assert.ok(svg.includes('aria-label'));
});

test('单帧动作只出一帧', () => {
  const svg = renderSkeleton({ start: 'plank', no_load: true }, '平板支撑');
  assert.equal((svg.match(/<svg /g) ?? []).length, 1);
});

test('自重动作不画负荷——照着练一副不存在的杠铃就是教错', () => {
  const svg = renderSkeleton({ start: 'squat_top', end: 'squat_bottom', no_load: true }, '自重深蹲');
  assert.ok(!svg.includes('sk-plate'), '自重动作不应出现杠片');
  assert.ok(!svg.includes('sk-plumb'), '没有负荷就没有杠线可画');
});

test('肌肉图按三级角色上色，且 prime 覆盖低级别', () => {
  const svg = renderCardMuscleMap(
    { prime: ['股四头'], synergist: ['臀'], stabilizer: ['核心'] }, '测试动作',
  );
  assert.ok(svg.includes('m-prime'));
  assert.ok(svg.includes('m-syn'));
  assert.ok(svg.includes('m-stab'));
  assert.ok(svg.includes('aria-label'));
  assert.ok(svg.includes('主动肌 股四头'));
});

test('同一肌肉同时是主动肌与稳定肌时按主动肌画', () => {
  const svg = renderCardMuscleMap({ prime: ['核心'], synergist: [], stabilizer: ['核心'] }, 'x');
  const m = svg.match(/<g class="m-region ([a-z-]+)" data-muscle="核心"/);
  assert.equal(m?.[1], 'm-prime');
});

test('整体肌肉分布图含全部 13 个分区且可点', () => {
  const counts = new Map(MUSCLE_NAMES.map((n) => [n, 3]));
  const html = renderFullMuscleMap(counts);
  for (const n of MUSCLE_NAMES) {
    assert.ok(html.includes(`data-muscle="${n}"`), `缺少分区 ${n}`);
  }
  assert.ok(html.includes('tabindex="0"'), '肌群必须可键盘聚焦');
  assert.equal(MUSCLE_NAMES.length, 13);
});

test('每张图画出来的东西都落在它自己的 viewBox 内', async () => {
  // 这条是全仓**唯一**从产物文本回读坐标去比框的断言，必须守住。
  // 自从渲染端与校验端共用 drawnArm/blendArm 之后，validateAnimBox 只回读框、内容是重算的——
  // 手臂模型本身错了两边会一起错，只有「把画出来的字符串解析回坐标」这条看得见。
  //
  // 旧版渲染时既不传 name 也不传 loadType，renderPose 内部 drawnArm('') 回落到链上 elbow/wrist，
  // 框和画一起用链，恒等通过。实测 18 个姿态真实手臂与它差到 37.9px（goblet_top）。
  const figures = await readJson('data/figures.json');
  // 线、圆（含半径）、矩形（含旋转）、多边形全部顶点都要算进去，不能只看 x1/x2/cx
  const pointsOf = (svg) => {
    const pts = [];
    for (const m of svg.matchAll(/x1="(-?[\d.]+)" y1="(-?[\d.]+)" x2="(-?[\d.]+)" y2="(-?[\d.]+)"/g))
      pts.push([+m[1], +m[2]], [+m[3], +m[4]]);
    for (const m of svg.matchAll(/<circle[^>]*cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="(-?[\d.]+)"/g)) {
      const [x, y, r] = [+m[1], +m[2], +m[3]];
      pts.push([x - r, y - r], [x + r, y + r]);
    }
    for (const m of svg.matchAll(/<rect[^>]*x="(-?[\d.]+)" y="(-?[\d.]+)" width="(-?[\d.]+)" height="(-?[\d.]+)"/g)) {
      const [x, y, w, h] = [+m[1], +m[2], +m[3], +m[4]];
      pts.push([x, y], [x + w, y + h]);
    }
    for (const m of svg.matchAll(/<polygon[^>]*points="([^"]+)"/g))
      for (const pair of m[1].trim().split(/\s+/)) { const [x, y] = pair.split(',').map(Number); pts.push([x, y]); }
    return pts;
  };
  let scanned = 0;
  for (const [slug, f] of Object.entries(figures)) {
    for (const key of [f.start, f.end]) {
      if (!key || !POSES[key]) continue;
      // 和产物同一套参数：strip、name、loadType、按画出来的手臂算的框
      const p = f.no_load ? { ...POSES[key], load: undefined } : POSES[key];
      const plumb = f.plumb !== false && !f.no_load;
      const arm = drawnArm(key, p, f.load_type);
      const box = contentBox(p, { plumb, loadType: f.load_type, arm });
      const svg = renderPose(p, { name: key, plumb, box, loadType: f.load_type });
      const pts = pointsOf(svg);
      assert.ok(pts.length > 0, `${slug}/${key}: 产物里一个坐标都没解析到`);
      for (const [x, y] of pts) {
        assert.ok(x >= box.x - 1 && x <= box.x + box.w + 1, `${slug}/${key}: x=${x} 落在 viewBox 外`);
        assert.ok(y >= box.y - 1 && y <= box.y + box.h + 1, `${slug}/${key}: y=${y} 落在 viewBox 外`);
      }
      scanned += pts.length;
    }
  }
  // 解析不到就「通过」是假的通过
  assert.ok(scanned > 2000, `只扫到 ${scanned} 个坐标，产物解析大概率漏了`);
});

test('分区定义不与肌肉词表脱节', () => {
  for (const [name, def] of Object.entries(MUSCLE_REGIONS)) {
    assert.ok(['front', 'back'].includes(def.view), `${name} 的 view 非法`);
    assert.ok(def.label && def.label.length > 1, `${name} 缺少解剖名`);
    assert.ok(def.shapes.length > 0, `${name} 没有图形`);
  }
});
