// 错误示范与灰影（正确动作）在同一时刻的几何差：给「为什么错」的文字取数，也给断言用。
//   node tools/mistake-metrics.mjs <slug> <序号> [u] [half]
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { mistakeSetup, mistakeStill } from '../src/render/skeleton.mjs';
import { interpolate } from '../src/render/interp.mjs';
import { mistakeMetrics } from '../src/render/mistake-metrics.mjs';
const root = path.resolve(import.meta.dirname, '..');
const [slug, idx, uArg, hArg] = process.argv.slice(2);
const figures = JSON.parse(await readFile(path.join(root, 'data/figures.json'), 'utf8'));
const mf = JSON.parse(await readFile(path.join(root, 'data/mistake-figures.json'), 'utf8'))[slug].find((m) => m.mistake === +idx);
const st = uArg !== undefined ? { u: +uArg, half: +(hArg ?? 0) } : mistakeStill(mf);
console.log('still', st);
const m = mistakeMetrics(slug, figures[slug], mf, st.u, st.half);
const r = (v) => (typeof v === 'number' ? +v.toFixed(1) : Array.isArray(v) ? v.map(r) : v);
for (const k of Object.keys(m.wrong)) console.log(k.padEnd(18), 'wrong', JSON.stringify(r(m.wrong[k])), ' right', JSON.stringify(r(m.right[k])));
