import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validatePlans } from '../src/validate/plans.mjs';
import { loadSafetyCanon } from '../src/safety-canon.mjs';

const root = path.resolve(import.meta.dirname, '..');
const canon = await loadSafetyCanon(root);
const ctx = { exercises: new Set(['back-squat-high-bar', 'goblet-squat']),
              plans: new Set(['novice-3d', 'upper-lower-4d']),
              chapters: new Set(['ch5', 'ch8', 'ch9']),
              safetyCanon: canon };

const plan = JSON.parse(await readFile(path.join(root, 'tests/fixtures/plan-novice-3d.json'), 'utf8'));

test('合法模板通过', () => {
  assert.deepEqual(validatePlans([plan], ctx), []);
});

test('周安排必须同时含有氧与休息日', () => {
  const noCardio = { ...plan, week: plan.week.filter((d) => d.type !== '有氧') };
  assert.ok(validatePlans([noCardio], ctx).some((e) => e.includes('有氧')));
  const noRest = { ...plan, week: plan.week.filter((d) => d.type !== '休息') };
  assert.ok(validatePlans([noRest], ctx).some((e) => e.includes('休息日')));
});

test('有氧安排必须说明放置理由并链到第 8 章', () => {
  const week = plan.week.map((d) => d.type === '有氧'
    ? { ...d, cardio: { ...d.cardio, placement_reason: '' } } : d);
  assert.ok(validatePlans([{ ...plan, week }], ctx).some((e) => e.includes('placement_reason')));
});

test('每个动作必须有 组数×次数×RIR×组间休息', () => {
  const week = plan.week.map((d) => d.type === '力量'
    ? { ...d, items: d.items.map(({ rir, ...rest }) => rest) } : d);
  assert.ok(validatePlans([{ ...plan, week }], ctx).some((e) => e.includes('rir')));
});

test('进阶规则必须具体到数字且有比例上限', () => {
  const bad = { ...plan, progression: [{ exercise: 'back-squat-high-bar',
    increment_kg: '感觉轻了就加', cap_pct: 5, trigger: '觉得可以的时候' }] };
  const errs = validatePlans([bad], ctx);
  assert.ok(errs.some((e) => e.includes('increment_kg')));
  assert.ok(errs.some((e) => e.includes('trigger')));
});

test('pain_path 自撰处理方案被拒', () => {
  const bad = { ...plan, pain_path: '出现疼痛就 deload 一周，或换一个同模式动作接着练' };
  assert.ok(validatePlans([bad], ctx).some((e) => e.includes('pain_path')));
});

// 回归：C1 原句含"疼痛不走 deload"，旧的关键词正则会把正确答案误拒
test('pain_path 写 C1 全句必须通过', () => {
  const ok = { ...plan, pain_path: canon.C1 };
  assert.deepEqual(validatePlans([ok], ctx).filter((e) => e.includes('pain_path')), []);
});

test('pain_path 写 canon:C1 必须通过', () => {
  const ok = { ...plan, pain_path: 'canon:C1' };
  assert.deepEqual(validatePlans([ok], ctx).filter((e) => e.includes('pain_path')), []);
});

test('pain_path 引用不存在/错误的口径条目被拒', () => {
  for (const v of ['canon:C9', 'canon:C3', 'canon:']) {
    assert.ok(validatePlans([{ ...plan, pain_path: v }], ctx).some((e) => e.includes('pain_path')),
              `${v} 应被拒`);
  }
});

test('替代映射必须写明不适用于疼痛，且替代项同模式', () => {
  const bad = { ...plan, substitutions: [{ exercise: 'back-squat-high-bar',
    alts: ['goblet-squat'], scope: '疼痛时可以换这个继续练' }] };
  assert.ok(validatePlans([bad], ctx).some((e) => e.includes('substitutions')));
});

test('exit_criteria 指向的下一套模板必须存在', () => {
  const bad = { ...plan, exit_criteria: { ...plan.exit_criteria, next: 'nope' } };
  assert.ok(validatePlans([bad], ctx).some((e) => e.includes('nope')));
});

test('仓库内 data/plans.json 始终合法', async () => {
  const plans = JSON.parse(await readFile(path.join(root, 'data/plans.json'), 'utf8'));
  const exercises = JSON.parse(await readFile(path.join(root, 'data/exercises.json'), 'utf8'));
  const chapters = JSON.parse(await readFile(path.join(root, 'content/chapters.json'), 'utf8'));
  const errs = validatePlans(plans, {
    exercises: new Set(exercises.map((e) => e.slug)),
    plans: new Set(plans.map((p) => p.slug)),
    chapters: new Set(chapters.map((c) => c.id)),
    safetyCanon: canon,
  });
  assert.deepEqual(errs, []);
});
