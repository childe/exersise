import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDemos } from '../src/validate/demos.mjs';

const ex = [{ slug: 'back-squat-high-bar', pattern: '蹲', equipment: '杠铃', demo_id: 'demo-a',
  self_checks: [{ criterion: '杠在足中线正上方' }, { criterion: '脊柱在中立范围内' }] }];
const demo = {
  id: 'demo-a', exercise_id: 'back-squat-high-bar', url: 'https://www.nsca.com/exercise/back-squat/',
  source_type: '机构官方', publisher: 'NSCA', author_credential: '机构官方动作库',
  license: '链接引用，不转载', verified_on: '2026-10-11', verified_by: 'childe',
  shows_equipment: '杠铃', shows_variant: '相同', coverage: '逐条核验',
  verification: [{ criterion: '杠在足中线正上方', status: '符合', result: '页面写明杠走足中线' },
                 { criterion: '脊柱在中立范围内', status: '符合', result: '页面要求全程背部挺直' }],
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

// ——— 核验状态结构化（§7.2）———
// 旧实现只检查"判据名称出现过且 result 非空"，于是"未覆盖"和"页面用的是别的器械"
// 都能被当成已核验通过。下面这组把核验状态变成受控取值并由机器判定成色。
const ex2 = [{ slug: 'back-squat-high-bar', pattern: '蹲', equipment: '杠铃', demo_id: 'demo-a',
  self_checks: [{ criterion: '杠在足中线正上方' }, { criterion: '脊柱在中立范围内' }] }];
const full = {
  ...demo,
  shows_equipment: '杠铃', shows_variant: '相同', coverage: '逐条核验',
  verification: [
    { criterion: '杠在足中线正上方', status: '符合', result: '页面写明杠走足中线' },
    { criterion: '脊柱在中立范围内', status: '符合', result: '页面要求全程背部挺直' },
  ],
};

test('逐条核验：每条判据都必须带受控的核验状态', () => {
  assert.deepEqual(validateDemos([full], { exercises: ex2 }), []);
  const bad = { ...full, verification: [{ ...full.verification[0], status: '差不多' }, full.verification[1]] };
  assert.ok(validateDemos([bad], { exercises: ex2 }).some((e) => e.includes('status')));
  const missing = { ...full, verification: [{ criterion: '杠在足中线正上方', result: 'x' }, full.verification[1]] };
  assert.ok(validateDemos([missing], { exercises: ex2 }).some((e) => e.includes('status')));
});

test('有判据未覆盖时不得标成"逐条核验"，且必须写明缺口', () => {
  const partial = {
    ...full,
    verification: [{ ...full.verification[0], status: '未覆盖', result: '页面没有描述杠与足中线的关系' },
      full.verification[1]],
  };
  const errs = validateDemos([partial], { exercises: ex2 });
  assert.ok(errs.some((e) => e.includes('coverage')), '核验成色必须降级为「部分覆盖」');
  const fixed = { ...partial, coverage: '部分覆盖', gaps_note: '足中线一条以本卡文字为准' };
  assert.deepEqual(validateDemos([fixed], { exercises: ex2 }), []);
  const noNote = { ...partial, coverage: '部分覆盖' };
  assert.ok(validateDemos([noNote], { exercises: ex2 }).some((e) => e.includes('gaps_note')));
});

test('一条判据都没覆盖时只能是「形态参考」，不能冒充示范核验', () => {
  const none = {
    ...full, coverage: '逐条核验',
    verification: full.verification.map((v) => ({ ...v, status: '未覆盖', result: '页面没写' })),
  };
  assert.ok(validateDemos([none], { exercises: ex2 }).some((e) => e.includes('形态参考')));
  const ok = { ...none, coverage: '形态参考', gaps_note: '仅作动作形态参考，判据以本卡为准' };
  assert.deepEqual(validateDemos([ok], { exercises: ex2 }), []);
});

test('来源页面的器械或变式与本卡不同时，必须显式登记并写明差异', () => {
  // 评审发现的真实问题：杠铃滚轮指向 TRX 悬吊带版本，旧校验器一路放行。
  const trx = { ...full, shows_equipment: '悬吊带' };
  const errs = validateDemos([trx], { exercises: ex2 });
  assert.ok(errs.some((e) => e.includes('substitute_note')), '器械不同必须写明');
  assert.ok(errs.some((e) => e.includes('coverage')), '器械不同不能算逐条核验');
  const variant = { ...full, shows_variant: '不同' };
  const errs2 = validateDemos([variant], { exercises: ex2 });
  assert.ok(errs2.some((e) => e.includes('variant_note')));
  assert.ok(errs2.some((e) => e.includes('coverage')));
});

test('shows_equipment / shows_variant 缺失直接判错（不能靠"没写就是一样"蒙混）', () => {
  const { shows_equipment, shows_variant, ...bare } = full;
  const errs = validateDemos([bare], { exercises: ex2 });
  assert.ok(errs.some((e) => e.includes('shows_equipment')));
  assert.ok(errs.some((e) => e.includes('shows_variant')));
});

// ——— 渲染层：成色必须写在读者眼前 ———
test('只有逐条核验的来源才显示成"示范…逐条核验"，形态参考不得冒充示范', async () => {
  const { renderDemo } = await import('../src/render/exercises.mjs');
  const base = { publisher: 'ACE', url: 'https://x/', verified_on: '2026-10-12', verification: [] };
  assert.match(renderDemo({ ...base, coverage: '逐条核验' }), /逐条核验于 2026-10-12/);

  const partial = renderDemo({
    ...base, coverage: '部分覆盖', gaps_note: '足中线以本卡为准',
    verification: [{ criterion: '杠在足中线正上方', status: '未覆盖', result: 'x' }],
  });
  assert.match(partial, /部分覆盖/);
  assert.match(partial, /该来源未对上的判据：杠在足中线正上方（未覆盖）/);
  assert.match(partial, /足中线以本卡为准/);

  const shape = renderDemo({ ...base, coverage: '形态参考', gaps_note: '以本卡为准' });
  assert.match(shape, /动作形态参考/);
  assert.doesNotMatch(shape, /核验于/, '没覆盖任何判据的来源不得出现"核验"字样');
});

test('真实数据：每条示范的成色都与逐条状态自洽，且不存在器械不符却没说明的来源', async () => {
  const { readFile } = await import('node:fs/promises');
  const path = (await import('node:path')).default;
  const root = path.resolve(import.meta.dirname, '..');
  const demos = JSON.parse(await readFile(path.join(root, 'data/demos.json'), 'utf8'));
  const exercises = JSON.parse(await readFile(path.join(root, 'data/exercises.json'), 'utf8'));
  assert.deepEqual(validateDemos(demos, { exercises }), []);
  // 评审点名的那条：杠铃滚轮不得再指向 TRX 悬吊带版本
  const rollout = demos.find((d) => d.id === 'demo-barbell-rollout');
  assert.equal(rollout.shows_equipment, '杠铃');
  assert.doesNotMatch(rollout.url, /trx/i);
});
