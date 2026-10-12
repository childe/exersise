import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const ch10 = await readFile(path.join(root, 'content/ch10.html'), 'utf8');

test('第 10 章五节齐备', () => {
  for (const s of ['先问什么', '什么该转介出去', '怎么看动作', '怎么调计划', '指导能力自测']) {
    assert.ok(ch10.includes(s), `缺少小节「${s}」`);
  }
});

test('转介边界清单覆盖 §5.2 列出的全部情形并给出话术', () => {
  for (const s of ['红旗征', '康复', '怀孕', '未成年', '进食障碍', '慢性病']) {
    assert.ok(ch10.includes(s), `边界清单缺少「${s}」`);
  }
  assert.match(ch10, /不知道就说不知道/);
  assert.match(ch10, /话术|可以这样说/);
});

test('调计划三个案例齐备，每个都写出"哪里信息不够必须再问"', () => {
  const cases = ch10.match(/<section class="case"[\s\S]*?<\/section>/g) ?? [];
  assert.equal(cases.length, 3);
  for (const c of cases) {
    assert.match(c, /推导/);
    assert.match(c, /还需要问|信息不够|必须再问/);
  }
});

test('不含商业带训内容（§2 排除项）', () => {
  assert.doesNotMatch(ch10, /定价|获客|合同|收费标准|教练认证/);
});
