import test from 'node:test';
import assert from 'node:assert/strict';
import { expandTokens } from '../src/render/tokens.mjs';

const ctx = {
  claims: new Map([['claim-a', { id: 'claim-a', direction: '反对', certainty: '高' }]]),
  exercises: new Map([['back-squat-high-bar', { slug: 'back-squat-high-bar', name_zh: '高杠背蹲' }]]),
  plans: new Map([['novice-3d', { slug: 'novice-3d', title: '新手全身 3 天' }]]),
  figures: new Map([['sra-curve', '<svg data-fig="sra-curve"></svg>']]),
};

test('claim 占位符展开为标签', () => {
  assert.match(expandTokens('局部减脂{{claim:claim-a}}', ctx), /反对·高/);
});

test('动作与模板占位符展开为锚点链接', () => {
  assert.match(expandTokens('{{ex:back-squat-high-bar}}', ctx), /href="#ex-back-squat-high-bar"/);
  assert.match(expandTokens('{{plan:novice-3d}}', ctx), /href="#plan-novice-3d"/);
});

test('图占位符内联 SVG', () => {
  assert.match(expandTokens('{{fig:sra-curve}}', ctx), /<svg data-fig="sra-curve">/);
});

test('未知 id 让构建失败而不是静默留空', () => {
  assert.throws(() => expandTokens('{{claim:claim-nope}}', ctx), /claim-nope/);
  assert.throws(() => expandTokens('{{ex:nope}}', ctx), /nope/);
});
