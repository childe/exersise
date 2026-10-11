import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const ch9 = await readFile(path.join(root, 'content/ch9.html'), 'utf8');
const ch6 = await readFile(path.join(root, 'content/ch6.html'), 'utf8');

test('第 9 章与 docs/safety-canon.md 的 C1/C2 口径一致', async () => {
  const canon = await readFile(path.join(root, 'docs/safety-canon.md'), 'utf8');
  assert.ok(canon.includes('当场停止该动作'));
  assert.match(ch9, /当场停止该动作/);
  assert.match(ch9, /deload[^。]{0,20}(只|仅)[^。]{0,10}疲劳|疲劳[^。]{0,20}deload[^。]{0,20}疼痛(不|绝不)/);
  const ch0 = await readFile(path.join(root, 'content/ch0.html'), 'utf8');
  assert.match(ch0, /红旗/);
});

test('第 9 章给出疼痛 vs 酸胀的区分与停止规则', () => {
  assert.match(ch9, /酸胀/);
  assert.match(ch9, /停止(该)?动作/);
  assert.doesNotMatch(ch9, /(疼痛|痛)[^。]{0,24}(deload|减量|降重|换(一个)?动作)[^。]{0,16}继续/);
});

test('第 9 章覆盖腰膝肩三类损伤机制与热身的作用边界', () => {
  for (const s of ['腰', '膝', '肩', '热身']) assert.ok(ch9.includes(s));
  assert.match(ch9, /热身[^。]{0,40}(不能|无法|并不)/, '需写明热身的作用边界而非万能');
});

test('涉及就医判断的结论必须是 safety 级 claim', async () => {
  const claims = JSON.parse(await readFile(path.join(root, 'data/claims.json'), 'utf8'));
  const ids = [...ch9.matchAll(/\{\{claim:([a-z0-9-]+)\}\}/g)].map((m) => m[1]);
  const safety = claims.filter((c) => ids.includes(c.id) && c.safety === true);
  assert.ok(safety.length >= 3, '第 9 章至少应有 3 条标记 safety 的结论');
});

test('第 6 章不含食谱餐单与补剂品牌（§2 排除项）', () => {
  assert.doesNotMatch(ch6, /早餐[：:]|午餐[：:]|晚餐[：:]|食谱/);
  assert.doesNotMatch(ch6, /(品牌|牌子|推荐购买|某某牌)/);
});
