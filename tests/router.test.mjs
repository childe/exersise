import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoute, trackOf } from '../src/assets/app.js';

const known = new Set(['ch0', 'ch2', 'ex-back-squat-high-bar', 'plan-novice-3d', 'claim-protein-threshold']);

test('章节锚点落到学习路径轨', () => {
  assert.deepEqual(resolveRoute('#ch2', known), { track: 'learn', target: 'ch2', missing: false });
});

test('动作与模板锚点落到参考库轨', () => {
  assert.equal(resolveRoute('#ex-back-squat-high-bar', known).track, 'ref');
  assert.equal(resolveRoute('#plan-novice-3d', known).track, 'ref');
  assert.equal(resolveRoute('#claim-protein-threshold', known).track, 'ref');
});

test('空 hash 默认进学习路径且不报缺失', () => {
  assert.deepEqual(resolveRoute('', known), { track: 'learn', target: null, missing: false });
});

test('未知锚点标记 missing，保留原 hash 推断的轨道，不静默落回首章', () => {
  const r = resolveRoute('#ex-does-not-exist', known);
  assert.equal(r.missing, true);
  assert.equal(r.track, 'ref');
  assert.equal(r.target, null);
});

test('URL 编码的中文锚点能正确解码后判断', () => {
  assert.equal(resolveRoute('#' + encodeURIComponent('ch2'), known).target, 'ch2');
  assert.equal(resolveRoute('#%E4%B8%AD%E6%96%87', known).missing, true);
});

test('trackOf 覆盖四类前缀', () => {
  assert.equal(trackOf('ch10'), 'learn');
  assert.equal(trackOf('ex-x'), 'ref');
  assert.equal(trackOf('plan-x'), 'ref');
  assert.equal(trackOf('claim-x'), 'ref');
});
