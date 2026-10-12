import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateQuiz } from '../src/validate/quiz.mjs';

const root = path.resolve(import.meta.dirname, '..');
const chapters = new Set(JSON.parse(await readFile(path.join(root, 'content/chapters.json'), 'utf8')).map((c) => c.id));
const quiz = JSON.parse(await readFile(path.join(root, 'data/quiz.json'), 'utf8'));

test('四类情境题各 ≥3 道，总数 ≥12', () => {
  assert.deepEqual(validateQuiz(quiz, { chapters }), []);
  assert.ok(quiz.length >= 12);
  for (const c of ['选动作', '调计划', '停滞分析', '指导边界']) {
    assert.ok(quiz.filter((q) => q.category === c).length >= 3, `${c} 不足 3 道`);
  }
});

test('每题必须标明推导经过哪几章（不能靠"教程里写过"回答）', () => {
  for (const q of quiz) {
    assert.ok(q.reasoning_chapters.length >= 1, `${q.id} 未标明推导章节`);
    for (const ch of q.reasoning_chapters) assert.ok(chapters.has(ch), `${q.id} 指向不存在的章节 ${ch}`);
  }
});

test('指导边界类必须含至少一例应转介、一例信息不足需追问', () => {
  const boundary = quiz.filter((q) => q.category === '指导边界');
  assert.ok(boundary.some((q) => /转介|去找|就医/.test(q.model_answer)));
  assert.ok(boundary.some((q) => /追问|信息不足|还需要问/.test(q.model_answer)));
});

test('选动作类必须包含一处受限条件', () => {
  const pick = quiz.filter((q) => q.category === '选动作');
  assert.ok(pick.some((q) => /肩痛史|腰伤|时间只有|没有器械|受限/.test(q.scenario)));
});

test('缺参考答案或判断要点的题被拒', () => {
  const bad = [{ id: 'q-x', category: '选动作', scenario: '这是一个长度超过二十个字符的情境描述，用于测试校验器。', model_answer: '', reasoning_chapters: ['ch4'], judging_points: [] }];
  const errs = validateQuiz(bad, { chapters });
  assert.ok(errs.some((e) => e.includes('model_answer')));
  assert.ok(errs.some((e) => e.includes('judging_points')));
});
