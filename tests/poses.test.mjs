import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { POSES, POSE_NAMES, renderSkeleton, renderPose, contentBox, drawnArm, MIDFOOT, GROUND, FIG_W, FIG_H } from '../src/render/skeleton.mjs';
import { validatePoses, validateFigures, validateMuscles, validateFrameConsistency } from '../src/validate/poses.mjs';
import { MUSCLE_NAMES, MUSCLE_REGIONS, renderCardMuscleMap, renderFullMuscleMap } from '../src/render/muscles.mjs';
import { ORBIT_FIGS } from '../src/render/orbit.mjs';

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
  // 全仓唯一一条从产物文本回读坐标比 viewBox 的断言。
  //
  // 它独立的是**元素几何**——contentBox 对某个元素外延的建模（头半径、杠半宽、BAND_HALF、
  // 眼偏移、把手宽）与 load()/fixed()/renderFace() 真正吐出来的几何之间的分歧，历史上
  // 咬过人的正是这一类。它**不独立于关节模型**：框也是用 drawnArm 算的，把手臂整体平移
  // 60px 两边一起长大，这条一声不吭（由 validateJointAngles 等关节角断言兜底）。
  // 灵敏度约 5px：排除按设计贴边画的 sk-ground 后，逐帧最小余量 5.00px。
  //
  // 旧版算框和渲染都不传 name/loadType，两边一起回落到链上 elbow/wrist，恒等通过；
  // 18 个姿态真实手臂与链上差到 37.9px（goblet_top）。
  const figures = await readJson('data/figures.json');
  const exercises = await readJson('data/exercises.json');
  const primeOf = new Map((Array.isArray(exercises) ? exercises : exercises.exercises)
    .map((e) => [e.slug, e.muscles?.prime ?? []]));
  const pointsOf = (svg) => {
    const pts = [];
    let hit = 0;
    for (const m of svg.matchAll(/x1="(-?[\d.]+)" y1="(-?[\d.]+)" x2="(-?[\d.]+)" y2="(-?[\d.]+)"/g)) {
      pts.push([+m[1], +m[2]], [+m[3], +m[4]]); hit++;
    }
    for (const m of svg.matchAll(/<circle[^>]*cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="(-?[\d.]+)"/g)) {
      const [x, y, r] = [+m[1], +m[2], +m[3]];
      pts.push([x - r, y - r], [x + r, y + r]); hit++;
    }
    for (const m of svg.matchAll(/<rect[^>]*x="(-?[\d.]+)" y="(-?[\d.]+)" width="(-?[\d.]+)" height="(-?[\d.]+)"([^>]*)/g)) {
      const [x, y, w, h] = [+m[1], +m[2], +m[3], +m[4]];
      const rot = /rotate\((-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)\)/.exec(m[5]);
      if (rot) {
        // 阻力垫按未旋转的四角算会漏掉转出去的那两个角。pivot 从 transform 里读，
        // 不要假定它等于矩形中心——今天 sk-pad 恰好相等，换个元素就不是了。
        const t = (+rot[1]) * Math.PI / 180, cx = +rot[2], cy = +rot[3];
        for (const [qx, qy] of [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]) {
          const dx = qx - cx, dy = qy - cy;
          pts.push([cx + dx * Math.cos(t) - dy * Math.sin(t), cy + dx * Math.sin(t) + dy * Math.cos(t)]);
        }
      } else pts.push([x, y], [x + w, y + h]);
      hit++;
    }
    for (const m of svg.matchAll(/<polygon[^>]*points="([^"]+)"/g)) {
      for (const pair of m[1].trim().split(/\s+/)) { const [x, y] = pair.split(',').map(Number); pts.push([x, y]); }
      hit++;
    }
    // 帧标题也是画出来的东西。它过去一个点都没被扫到，而 <text> 既不在解析器里
    // 也不在禁用名单里——「有个没扫的标签」连报都不会报。
    for (const m of svg.matchAll(/<text[^>]*x="(-?[\d.]+)" y="(-?[\d.]+)"/g)) { pts.push([+m[1], +m[2]]); hit++; }
    // 按类对账：解析命中数必须等于产物里的几何元素总数。
    // 只断言「扫到的点数 > 某个下限」挡不住静默漏解析——把 seg() 的属性顺序换成
    // y1 x1 y2 x2（画的位置毫无变化），1077 条线里 817 条解析不到，点数下限照样通过。
    const total = (svg.match(/<(line|circle|rect|polygon|text)\b/g) ?? []).length;
    assert.equal(hit, total, `产物里 ${total} 个几何元素，只解析到 ${hit} 个——正则与产物脱节了`);
    // 标签必须是白名单：黑名单挡不住没想到的标签。把头从 circle 换成 ellipse（曾放行）、
    // 或换成一个挪出框 300px 的 <text>（也曾放行），白名单都会立刻报。
    const DRAWN = new Set(['svg', 'g', 'line', 'circle', 'rect', 'polygon', 'text']);
    for (const m of svg.matchAll(/<([a-z]+)\b/g))
      assert.ok(DRAWN.has(m[1]), `产物里出现未纳入扫描的元素 <${m[1]}>`);
    // transform 同样是白名单：只允许绕自身中心的 rotate。translate 被忽略的话，
    // 元素可以整个平移出框而扫描毫无反应（实测给 sk-bench 加 translate(0,300) 放行）。
    for (const m of svg.matchAll(/transform="([^"]+)"/g))
      assert.match(m[1], /^rotate\(-?[\d.]+ -?[\d.]+ -?[\d.]+\)$/, `只允许 rotate(a cx cy)，见到 ${m[1]}`);
    return pts;
  };
  let scanned = 0, frames = 0;
  for (const [slug, f] of Object.entries(figures)) {
    // 照 build 的口径渲染：带 prime（158 条 sk-muscle 段）和 caption（104 个标题）
    const html = renderSkeleton(f, slug, primeOf.get(slug) ?? [], slug);
    for (const m of html.matchAll(/viewBox="([-0-9. ]+)"[^>]*class="sk-frame[^"]*"[\s\S]*?<\/svg>/g)) {
      const [bx, by, bw, bh] = m[1].split(' ').map(Number);
      const pts = pointsOf(m[0]);
      // 「该画的东西被整类删掉」对账看不见——hit 与 total 一起减，恒等成立。
      // 实测把 sk-head / sk-foot / sk-bench / sk-bar 整类删掉，全仓 241 条测试无一报警。
      // 所以这里逐帧查该出现的 class：骨架件永远要有，器械件按这一帧真画了什么推导。
      // 环绕视角帧的地面是一块透视平面（sk-floor），不是侧视的地线
      const ground = m[0].includes('sk-orbit') ? 'sk-floor' : 'sk-ground';
      for (const c of ['sk-trunk', 'sk-limb', 'sk-foot', 'sk-head', ground, 'sk-caption'])
        assert.ok(m[0].includes(`"${c}`) || m[0].includes(` ${c}`), `${slug}: 这一帧没有 ${c}`);
      assert.ok(pts.length >= 20, `${slug}: 这一帧只有 ${pts.length} 个点，画空了`);
      for (const [x, y] of pts) {
        assert.ok(x >= bx - 1 && x <= bx + bw + 1, `${slug}: x=${x} 落在 viewBox 外`);
        assert.ok(y >= by - 1 && y <= by + bh + 1, `${slug}: y=${y} 落在 viewBox 外`);
        scanned++;
      }
      frames++;
    }
  }
  // 帧数由 figures 自己推导，不写死 104——写死的数字在正常增删动作时误报，
  // 而「把数字改大」这个动作没有任何信息量，正是会被当橡皮图章盖掉的那种断言。
  // 启用环绕视角的双帧动作只画一格（环绕视角的静止帧），取代起止两帧。
  const expect = Object.entries(figures)
    .reduce((n, [slug, f]) => n + (f.end && f.end !== f.start ? (ORBIT_FIGS.has(slug) ? 1 : 2) : 1), 0);
  assert.equal(frames, expect, `${expect} 张帧里只扫到 ${frames}——有帧没被正则捞到`);
});

test('分区定义不与肌肉词表脱节', () => {
  for (const [name, def] of Object.entries(MUSCLE_REGIONS)) {
    assert.ok(['front', 'back'].includes(def.view), `${name} 的 view 非法`);
    assert.ok(def.label && def.label.length > 1, `${name} 缺少解剖名`);
    assert.ok(def.shapes.length > 0, `${name} 没有图形`);
  }
});
