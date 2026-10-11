import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesFilter, countVisible } from '../src/assets/app.js';

const squat = { pattern: '蹲', equipment: '杠铃', muscles: ['股四头', '臀'], difficulty: '入门' };
const empty = { pattern: new Set(), equipment: new Set(), muscles: new Set(), difficulty: new Set() };

test('空筛选条件下全部可见', () => {
  assert.equal(matchesFilter(squat, empty), true);
});

test('同维度多选取并集', () => {
  assert.equal(matchesFilter(squat, { ...empty, equipment: new Set(['哑铃', '杠铃']) }), true);
});

test('跨维度取交集', () => {
  assert.equal(matchesFilter(squat, { ...empty, pattern: new Set(['蹲']), difficulty: new Set(['进阶']) }), false);
});

test('肌群维度按包含匹配', () => {
  assert.equal(matchesFilter(squat, { ...empty, muscles: new Set(['臀']) }), true);
  assert.equal(matchesFilter(squat, { ...empty, muscles: new Set(['胸']) }), false);
});

test('无交集组合返回 0，由调用方显示空状态', () => {
  const state = { ...empty, pattern: new Set(['搬运']), equipment: new Set(['固定器械']) };
  assert.equal(countVisible([squat], state), 0);
});

test('证据标签按 方向 与 确定性 两维独立筛选', () => {
  const claim = { direction: '未定', certainty: '低' };
  assert.equal(matchesFilter(claim, { direction: new Set(['未定']) }), true);
  assert.equal(matchesFilter(claim, { direction: new Set(['支持']) }), false);
  assert.equal(matchesFilter(claim, { direction: new Set(['未定']), certainty: new Set(['高']) }), false);
});
