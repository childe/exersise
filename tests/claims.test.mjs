import test from 'node:test';
import assert from 'node:assert/strict';
import { validateClaims } from '../src/validate/claims.mjs';
import { renderClaimTag } from '../src/render/claims.mjs';

const ok = {
  id: 'claim-protein-threshold',
  statement: '以增肌为目标时每日蛋白质摄入约 1.6 g/kg 体重后收益趋平。',
  direction: '支持',
  certainty: '高',
  sources: [{ authors: 'Morton 等', year: 2018, title: '系统综述与剂量反应荟萃分析',
              type: '系统综述', url: 'https://bjsm.bmj.com/content/52/6/376' }],
  population: '健康成年抗阻训练者，男女均有；可外推到本教程读者',
  limitations: '多数研究周期 6–12 周；高龄与极低能量摄入人群外推受限',
  rating_rationale: '多项 RCT 的剂量反应荟萃结论一致，拐点估计稳定',
};

test('合法 claim 通过', () => {
  assert.deepEqual(validateClaims([ok]), []);
});

test('方向与确定性只接受规定取值', () => {
  const bad = { ...ok, id: 'claim-x', direction: 'A', certainty: '很高' };
  const errs = validateClaims([bad]);
  assert.ok(errs.some((e) => e.includes('direction')));
  assert.ok(errs.some((e) => e.includes('certainty')));
});

test('无来源的 claim 被拒', () => {
  const errs = validateClaims([{ ...ok, id: 'claim-y', sources: [] }]);
  assert.ok(errs.some((e) => e.includes('sources')));
});

test('来源缺年份/人群/局限/分级理由被拒', () => {
  const { population, limitations, rating_rationale, ...stripped } = ok;
  const errs = validateClaims([{ ...stripped, id: 'claim-z' }]);
  for (const f of ['population', 'limitations', 'rating_rationale']) {
    assert.ok(errs.some((e) => e.includes(f)), `应报告缺失字段 ${f}`);
  }
});

test('重复 id 被拒', () => {
  const errs = validateClaims([ok, ok]);
  assert.ok(errs.some((e) => e.includes('重复')));
});

test('id 必须是 claim- 前缀的小写 slug', () => {
  const errs = validateClaims([{ ...ok, id: '蛋白质' }]);
  assert.ok(errs.some((e) => e.includes('id')));
});

test('标签渲染为 方向·确定性', () => {
  assert.match(renderClaimTag(ok), /支持·高/);
  assert.match(renderClaimTag(ok), /href="#claim-protein-threshold"/);
});
