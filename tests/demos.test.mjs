import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDemos } from '../src/validate/demos.mjs';

const ex = [{ slug: 'back-squat-high-bar', pattern: '蹲', equipment: '杠铃', demo_id: 'demo-a',
  self_checks: [{ criterion: '杠在足中线正上方' }, { criterion: '脊柱在中立范围内' }] }];
const demo = {
  id: 'demo-a', exercise_id: 'back-squat-high-bar', url: 'https://www.nsca.com/exercise/back-squat/',
  source_type: '机构官方', publisher: 'NSCA', author_credential: '机构官方动作库',
  license: '链接引用，不转载', verified_on: '2026-10-11', verified_by: 'childe',
  verification: [{ criterion: '杠在足中线正上方', result: '符合' },
                 { criterion: '脊柱在中立范围内', result: '符合' }],
  dead: false,
};

test('合法示范登记通过', () => {
  assert.deepEqual(validateDemos([demo], { exercises: ex }), []);
});

test('核验记录必须逐条覆盖该动作的自检判据', () => {
  const errs = validateDemos([{ ...demo, verification: [demo.verification[0]] }], { exercises: ex });
  assert.ok(errs.some((e) => e.includes('脊柱在中立范围内')));
});

test('缺核验日期或核验人被拒', () => {
  const { verified_on, verified_by, ...bad } = demo;
  const errs = validateDemos([bad], { exercises: ex });
  assert.ok(errs.some((e) => e.includes('verified_on')));
  assert.ok(errs.some((e) => e.includes('verified_by')));
});

test('图片类示范必须写明授权或自制', () => {
  const { url, ...rest } = demo;
  const errs = validateDemos([{ ...rest, image: 'assets/demos/x.svg', license: '' }], { exercises: ex });
  assert.ok(errs.some((e) => e.includes('license')));
});

test('重点动作（六大模式主干杠铃/哑铃动作）缺示范被拒', () => {
  const errs = validateDemos([], { exercises: ex });
  assert.ok(errs.some((e) => e.includes('back-squat-high-bar')));
});

test('失效链接必须标记 dead=true 而不是留着假装可用', () => {
  const errs = validateDemos([{ ...demo, dead: 'yes' }], { exercises: ex });
  assert.ok(errs.some((e) => e.includes('dead')));
});

test('标 dead 后必须留下降级记录并清掉 url（不留死链）', () => {
  const errs = validateDemos([{ ...demo, dead: true }], { exercises: ex });
  assert.ok(errs.some((e) => e.includes('dead_note')));
  assert.ok(errs.some((e) => e.includes('retired_url')));
});

test('重点动作不接受"只剩失效提示"', () => {
  const degraded = { ...demo, dead: true, dead_note: '2026-10-11 404', retired_url: demo.url, url: undefined };
  const errs = validateDemos([degraded], { exercises: ex });
  assert.ok(errs.some((e) => e.includes('必须更换为可用来源')));
});
