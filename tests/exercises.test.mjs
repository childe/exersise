import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateExercises, validateCoverage } from '../src/validate/exercises.mjs';

const root = path.resolve(import.meta.dirname, '..');
// ctx.exercises 是「完整动作库的 slug 集合」，与被校验的那一条/那几条无关
const ctx = { claims: new Set(), demos: new Set(['demo-x']), chapters: new Set(['ch4','ch5']),
              exercises: new Set(['back-squat-high-bar', 'goblet-squat']) };

const card = {
  slug: 'back-squat-high-bar', name_zh: '高杠背蹲', name_en: 'High-Bar Back Squat',
  pattern: '蹲', laterality: '双侧',
  muscles: { prime: ['股四头'], synergist: ['臀'], stabilizer: ['核心'] },
  equipment: '杠铃',
  cues: [{ phase: '设置', text: '杠置于斜方肌上缘形成的肉垫' },
         { phase: '发力', text: '髋膝同步下沉，杠走足中线铅垂线' },
         { phase: '收尾', text: '站直后退回挂钩，不在负重下转身' }],
  mistakes: [{ error: '起身时髋先走', consequence: '躯干前倾加大，腰段力矩上升' }],
  self_checks: [{ criterion: '杠在足中线正上方', how: '正侧面视频逐帧看', cannot: '镜头有角度偏差时会误判' },
                { criterion: '脊柱在中立范围内', how: '看腰胸段曲度是否突然塌陷', cannot: '体表看不到脊柱实际位置' }],
  audience: { suitable: '无急性腰膝症状、已练过退出方式的读者', cautions: '出现疼痛先停止该动作，按第 9 章判断' },
  home_alts: ['goblet-squat'], difficulty: '入门',
  safety: { rack: '保护杆高度用空杆实测，低于最低位 2–3 cm', collars: '两侧卡扣必须上紧',
            setup: '挂钩略低于站立肩高', solo_ok: true, solo_alt: null,
            bailout: '做不动就把杠往保护杆上坐，不要硬撑' },
  demo_id: 'demo-x', chapter_refs: ['ch4'], claim_refs: [],
};

test('单条合法动作卡通过（替代项在库内、不在被校验数组内）', () => {
  assert.deepEqual(validateExercises([card], ctx), []);
});

test('替代项在库内不存在时被拒（ctx.exercises 是唯一判据）', () => {
  const narrow = { ...ctx, exercises: new Set(['back-squat-high-bar']) };
  const errs = validateExercises([card], narrow);
  assert.ok(errs.some((e) => e.includes('goblet-squat')));
});

test('省略 ctx.exercises 时回退为数组自身的 slug 集合（整库校验路径）', () => {
  const { exercises, ...noSet } = ctx;
  const self = { ...card, slug: 'goblet-squat', home_alts: ['back-squat-high-bar'] };
  assert.deepEqual(validateExercises([card, self], noSet), []);
});

test('字段 7 自检判据为空的动作不进库', () => {
  const errs = validateExercises([{ ...card, self_checks: [] }], ctx);
  assert.ok(errs.some((e) => e.includes('self_checks')));
});

test('字段 11 安全设置为空的动作不进库', () => {
  const { safety, ...noSafety } = card;
  const errs = validateExercises([noSafety], ctx);
  assert.ok(errs.some((e) => e.includes('safety')));
});

test('solo_ok=false 必须给出替代动作', () => {
  const errs = validateExercises([{ ...card, safety: { ...card.safety, solo_ok: false, solo_alt: null } }], ctx);
  assert.ok(errs.some((e) => e.includes('solo_alt')));
});

test('卡扣字段出现任何免卡扣表述即失败', () => {
  const errs = validateExercises([{ ...card, safety: { ...card.safety, collars: '轻重量可以不上卡扣' } }], ctx);
  assert.ok(errs.some((e) => e.includes('卡扣')));
});

test('引用不存在的章节锚点被拒', () => {
  const errs = validateExercises([{ ...card, chapter_refs: ['ch99'] }], ctx);
  assert.ok(errs.some((e) => e.includes('ch99')));
});

test('home_alts 指向库内不存在的 slug 被拒', () => {
  const errs = validateExercises([{ ...card, home_alts: ['nope'] }], ctx);
  assert.ok(errs.some((e) => e.includes('nope')));
});

test('覆盖矩阵未填满时报出缺口格子', () => {
  const errs = validateCoverage([card]);
  assert.ok(errs.some((e) => e.includes('推')));
});

test('仓库内的 data/exercises.json 始终满足 13 字段校验', async () => {
  const exercises = JSON.parse(await readFile(path.join(root, 'data/exercises.json'), 'utf8'));
  const chapters = JSON.parse(await readFile(path.join(root, 'content/chapters.json'), 'utf8'));
  const demos = JSON.parse(await readFile(path.join(root, 'data/demos.json'), 'utf8'));
  const claims = JSON.parse(await readFile(path.join(root, 'data/claims.json'), 'utf8'));
  const errs = validateExercises(exercises, {
    claims: new Set(claims.map((c) => c.id)),
    demos: new Set(demos.map((d) => d.id)),
    chapters: new Set(chapters.map((c) => c.id)),
    exercises: new Set(exercises.map((e) => e.slug)),
  });
  assert.deepEqual(errs, []);
});
