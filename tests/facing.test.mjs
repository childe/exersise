import test from 'node:test';
import assert from 'node:assert/strict';
import { POSES } from '../src/render/skeleton.mjs';
import { facing, renderFace, PRONE_POSES, FACE_GEOMETRY } from '../src/render/facing.mjs';

const { HEAD_R, EYE_R } = FACE_GEOMETRY;
// 把单位向量归到八个方位，便于把"应该朝哪"写成可读的断言
const dirName = (d) => {
  if (!d) return '正视';
  const a = Math.atan2(d[1], d[0]) * 180 / Math.PI;
  if (a >= -30 && a < 30) return '右';
  if (a >= 30 && a < 75) return '右下';
  if (a >= 75 && a < 105) return '下';
  if (a >= 105 && a < 150) return '左下';
  if (a >= 150 || a < -150) return '左';
  if (a >= -150 && a < -105) return '左上';
  if (a >= -105 && a < -75) return '上';
  return '右上';
};

test('每个侧视姿态都有朝向，正视姿态没有左右之分', () => {
  for (const [n, p] of Object.entries(POSES)) {
    const f = facing(n, p);
    if (p.view === 'front') {
      assert.equal(f, null, `${n} 是正视图，不该有左右朝向`);
    } else {
      assert.ok(f, `${n} 解不出朝向`);
      assert.ok(Math.abs(Math.hypot(...f) - 1) < 1e-9, `${n} 的朝向不是单位向量`);
    }
  }
});

test('眼睛落在头圆之内——越出去就不是脸了', () => {
  for (const [n, p] of Object.entries(POSES)) {
    for (const m of renderFace(n, p).matchAll(/cx="([-\d.]+)" cy="([-\d.]+)"/g)) {
      const d = Math.hypot(+m[1] - p.head[0], +m[2] - p.head[1]);
      assert.ok(d + EYE_R <= HEAD_R, `${n}: 眼睛离头心 ${d.toFixed(1)}，加半径超出头半径 ${HEAD_R}`);
    }
  }
});

test('朝向与动作本身相符', () => {
  const expect = {
    squat_top: '右',           // 站立，面向前（项目约定 +x 为前）
    squat_bottom: '右下',       // 蹲到底躯干前倾，脸随之朝前下
    hinge_bottom: '右下',       // 俯身
    row_start: '右下',          // 俯身划船
    bench_top: '上',            // 仰卧
    deadbug_start: '上',        // 仰卧
    incline_top: '右上',        // 上斜卧推，仰卧且躯干倾斜
    plank: '下',                // 俯撑，面朝地
    pushup_top: '下',           // 俯撑
    leg_curl_start: '下',       // 俯卧腿弯举
    rollout_start: '下',        // 跪姿起始躯干水平，脸朝地；头在左端
    seated_calf_down: '右',     // 坐姿，水平朝前
    pullup_hang: '右',          // 悬垂
  };
  for (const [n, want] of Object.entries(expect)) {
    assert.equal(dirName(facing(n, POSES[n])), want, `${n} 的朝向`);
  }
});

test('俯卧集合里的姿态都存在，且取反后才对', () => {
  for (const n of PRONE_POSES) assert.ok(POSES[n], `PRONE_POSES 里的 ${n} 不是已知姿态`);
  // 断言本身必须会失败：把 plank 当成非俯卧，它就会朝上——正是要避免的那个错
  const p = POSES.plank;
  const sx = p.shoulder[0] - p.hip[0], sy = p.shoulder[1] - p.hip[1];
  const len = Math.hypot(sx, sy);
  const asIfNotProne = [-sy / len, sx / len];
  assert.equal(dirName(asIfNotProne), '上', '若不登记为俯卧，平板支撑会被画成面朝上');
  assert.equal(dirName(facing('plank', p)), '下', '登记为俯卧后应面朝地');
});

test('正视姿态画两只眼，侧视画一只', () => {
  const eyes = (n) => (renderFace(n, POSES[n]).match(/sk-eye/g) ?? []).length;
  assert.equal(eyes('lateral_raise_up'), 2, '正视应有两只眼（表示面向读者）');
  assert.equal(eyes('squat_top'), 1, '侧视应只有一只眼');
});

test('朝向随躯干倾斜旋转，不是写死的水平方向', () => {
  // 同一个动作从站立到蹲底，脸应当跟着躯干转下去
  const a = facing('squat_top', POSES.squat_top);
  const b = facing('squat_bottom', POSES.squat_bottom);
  const turn = Math.abs(Math.atan2(b[1], b[0]) - Math.atan2(a[1], a[0])) * 180 / Math.PI;
  assert.ok(turn > 20, `顶部到底部脸应明显转下去，实际只转了 ${turn.toFixed(1)}°`);
});
