import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { validateFigures, loadFigures } from '../src/validate/figures.mjs';

const root = path.resolve(import.meta.dirname, '..');

test('四张必需概念图齐备', async () => {
  const files = await readdir(path.join(root, 'assets/figures'));
  for (const n of ['sra-curve.svg', 'volume-response.svg', 'periodization-week.svg', 'energy-balance.svg']) {
    assert.ok(files.includes(n), `缺少 ${n}`);
  }
});

test('概念图不得画数字刻度，且图注写明"示意，非个体预测"', () => {
  const svg = `<svg data-kind="conceptual" viewBox="0 0 400 200"><text x="10" y="20">时间</text>
    <text x="10" y="40">刺激</text></svg>`;
  assert.deepEqual(validateFigures(new Map([['x', { svg, caption: '示意图，表达趋势而非数值；不是对个体反应的预测' }]])), []);
  const withTicks = svg.replace('时间', '48 小时');
  assert.ok(validateFigures(new Map([['x', { svg: withTicks, caption: '示意图，表达趋势而非数值；不是对个体反应的预测' }]]))
    .some((e) => e.includes('数字刻度')));
  assert.ok(validateFigures(new Map([['x', { svg, caption: 'SRA 曲线' }]]))
    .some((e) => e.includes('示意')));
});

test('带数字刻度的图必须声明 quantitative 并引用 claim 与年份', () => {
  const svg = `<svg data-kind="quantitative" data-claim="claim-protein-threshold" viewBox="0 0 400 200"><text x="10" y="20">1.6 g/kg</text></svg>`;
  assert.deepEqual(validateFigures(new Map([['y', { svg, caption: '来源：Morton 等 2018' }]])), []);
  const noClaim = svg.replace(' data-claim="claim-protein-threshold"', '');
  assert.ok(validateFigures(new Map([['y', { svg: noClaim, caption: '来源：Morton 等 2018' }]]))
    .some((e) => e.includes('data-claim')));
});

test('标注文字必须落在 viewBox 内', () => {
  const svg = `<svg data-kind="conceptual" viewBox="0 0 400 200"><text x="460" y="20">越界</text></svg>`;
  assert.ok(validateFigures(new Map([['z', { svg, caption: '示意图，表达趋势而非数值；不是对个体反应的预测' }]]))
    .some((e) => e.includes('viewBox')));
});

test('取色必须走 currentColor 或主题变量', () => {
  const svg = `<svg data-kind="conceptual" viewBox="0 0 400 200"><path stroke="#ff0000" d="M0 0"/><text x="10" y="20">a</text></svg>`;
  assert.ok(validateFigures(new Map([['w', { svg, caption: '示意图，表达趋势而非数值；不是对个体反应的预测' }]]))
    .some((e) => e.includes('currentColor')));
});

test('仓库内四张图全部合规', async () => {
  const figures = await loadFigures(root);
  assert.deepEqual(validateFigures(figures), []);
});
