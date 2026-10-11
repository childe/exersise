import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateCoverage } from '../src/validate/exercises.mjs';

const root = path.resolve(import.meta.dirname, '..');
const exercises = JSON.parse(await readFile(path.join(root, 'data/exercises.json'), 'utf8'));

test('覆盖矩阵与肌群兜底全部满足', () => {
  assert.deepEqual(validateCoverage(exercises), []);
});

test('动作数量落在设计估算的量级内（45–60），偏离需在评审中说明', () => {
  assert.ok(exercises.length >= 45 && exercises.length <= 60,
    `当前 ${exercises.length} 条，超出 §2 估算区间`);
});

test('每个家庭可做的入门版本都不依赖健身房器械', () => {
  for (const e of exercises.filter((x) => x.difficulty === '入门' && ['自重', '弹力带'].includes(x.equipment))) {
    assert.ok(!/器械|杠铃架|史密斯/.test(e.safety.setup + e.cues.map((c) => c.text).join('')),
      `${e.slug} 标为家庭可做但要点中出现健身房器械`);
  }
});
