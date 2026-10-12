import test from 'node:test';
import assert from 'node:assert/strict';
import { scanSafety, scanSafetyReview } from '../src/validate/safety.mjs';
import { build } from '../src/build.mjs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

// ——— hard 层：确定性规则，命中即构建失败 ———

test('内嵌位图被扫出', () => {
  assert.ok(scanSafety('<img src="data:image/png;base64,AAAA">').some((e) => e.includes('位图')));
});

test('未写完的占位内容被扫出', () => {
  assert.ok(scanSafety('<p>本章待撰写</p>').some((e) => e.includes('未完成')));
  assert.ok(scanSafety('<p>TODO: 补充</p>').length > 0);
});

test('hard 层不碰自由文本关键词', () => {
  assert.deepEqual(scanSafety('<p>轻重量时可以不上卡扣</p>'), []);
  assert.deepEqual(scanSafety('<p>如果肩膀疼就先 deload 一周</p>'), []);
});

// ——— soft 层：待复核提示，人工安全验收判定 ———

test('免卡扣的"建议"进待复核', () => {
  assert.ok(scanSafetyReview('<p>轻重量时可以不上卡扣</p>').some((e) => e.includes('卡扣')));
  assert.ok(scanSafetyReview('<p>熟练后无需卡扣</p>').length > 0);
});

test('把疼痛并进疲劳调整的"建议"进待复核', () => {
  assert.ok(scanSafetyReview('<p>如果肩膀疼就先 deload 继续练</p>').some((e) => e.includes('疼痛')));
  assert.ok(scanSafetyReview('<p>关节痛的话换个同模式动作继续练</p>').length > 0);
});

test('AI 生成图的字样进待复核', () => {
  assert.ok(scanSafetyReview('<p>下图由 AI 生成</p>').length > 0);
});

// ——— 否定／引用／纠错语境不得误报（这是本层存在的前提） ———

test('禁令句不误报', () => {
  assert.deepEqual(scanSafetyReview('<p>出现疼痛，禁止减量继续练，先停止该动作。</p>'), []);
  assert.deepEqual(scanSafetyReview('<p>禁止不上卡扣，两侧卡扣必须上紧，无例外。</p>'), []);
  assert.deepEqual(scanSafetyReview('<p>本教程不含任何 AI 生成的动作或解剖示意图。</p>'), []);
  assert.deepEqual(scanSafetyReview('<p>常见误区：有点痛就把重量降 10% 接着做。</p>'), []);
});

test('合规文本不误报', () => {
  assert.deepEqual(scanSafetyReview('<p>两侧卡扣必须上紧，无例外。出现疼痛先停止该动作，按第 9 章判断是否就医。</p>'), []);
  assert.deepEqual(scanSafetyReview('<p>恢复不足时先插入一周 deload，而不是先降重量。</p>'), []);
  assert.deepEqual(scanSafetyReview('<p>疼痛不走 deload、不走减量、不走换同模式动作。</p>'), []);
});

test('最终产物通过 hard 层全站扫描', async () => {
  const html = await build(root);
  assert.deepEqual(scanSafety(html), []);
});
