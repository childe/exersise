// 错误示范图的拼图预览：把一张错误示范按「动作相位 × 视角」铺成一张 PNG，给人眼看。
//
//   node tools/preview-mistake.mjs <slug> <错误序号> [输出.png]
//
// 断言只能回答「这个点在不在那根骨头上」，回答不了「这张图读起来是不是那个错误」。
// 行是一次起落里的 6 个相位（与浏览器里的时间曲线同一套 faultPhase），列是 −30°、0°、+30° 三个视角。
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mistakeSetup } from '../src/render/skeleton.mjs';
import { interpolate } from '../src/render/interp.mjs';
import { orbitFrame, renderOrbit, ORBIT_YAW } from '../src/render/orbit.mjs';
import { faultPhase, faultU } from '../src/render/faults.mjs';
import { findBrowser } from '../tests/helpers/browser.mjs';

const root = path.resolve(import.meta.dirname, '..');
const [slug, idx, out = path.join(root, `preview-${slug}-${idx}.png`)] = process.argv.slice(2);
const figures = JSON.parse(await readFile(path.join(root, 'data/figures.json'), 'utf8'));
const mfs = JSON.parse(await readFile(path.join(root, 'data/mistake-figures.json'), 'utf8'));
const ex = JSON.parse(await readFile(path.join(root, 'data/exercises.json'), 'utf8')).find((e) => e.slug === slug);
const fig = figures[slug], mf = (mfs[slug] ?? []).find((m) => m.mistake === +idx);
if (!fig || !mf || mf.none !== undefined) throw new Error(`${slug}#${idx}：没有可画的错误示范`);

const { wa, wb, ga, gb, A, B, GA, GB, plumb, iopts: io, fault, ghost: hasGhost } = mistakeSetup(fig, mf);
const ghost = hasGhost ? { A: GA, B: GB, names: { a: ga, b: gb } } : null;
const of = orbitFrame(slug, A, B, interpolate, io, { plumb, lt: fig.load_type, names: { a: wa, b: wb }, fault, ghost });
const [x, y, w, h] = of.box;
const phases = [0, 0.15, 0.3, 0.5, 0.65, 0.8];
const yaws = [-ORBIT_YAW, 0, ORBIT_YAW];
let cells = '';
for (const ph of phases) {
  for (const yaw of yaws) {
    const fw = faultPhase(mf.tempo ?? null, ph), g = faultPhase(null, ph);
    const uw = faultU(fault, fw.u);
    const p = interpolate(A, B, uw, io);
    const gp = ghost ? { p: interpolate(GA, GB, g.u, io), names: ghost.names, u: g.u } : undefined;
    const svg = renderOrbit(p, { slug, names: { a: wa, b: wb }, u: uw, half: fw.half, yaw, frame: of, plumb, lt: fig.load_type,
      caption: `ph ${ph} u ${uw.toFixed(2)} yaw ${yaw}`, fault, ghost: gp });
    cells += `<div class="skeleton sk-mistake"><svg viewBox="${x} ${y} ${w} ${h}" class="sk-frame sk-orbit" style="width:300px">${svg}</svg></div>`;
  }
}
const css = await readFile(path.join(root, 'src/assets/styles.css'), 'utf8');
const html = `<!doctype html><meta charset="utf-8"><style>${css}
body{background:#fff;margin:8px} .grid{display:grid;grid-template-columns:repeat(3,300px);gap:6px}
.sk-caption{font-size:9px}</style>
<p style="font:13px sans-serif;margin:0 0 6px">${slug} #${idx}：${ex.mistakes[+idx].error}</p>
<div class="grid">${cells}</div>`;
const dir = await mkdtemp(path.join(tmpdir(), 'mistake-'));
const file = path.join(dir, 'p.html');
await writeFile(file, html);
const rowH = 300 * h / w + 10;
const bin = findBrowser();
const r = spawnSync(bin, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--screenshot=${out}`,
  `--window-size=940,${Math.ceil(rowH * phases.length + 40)}`, `file://${file}`], { encoding: 'utf8' });
if (r.status !== 0) throw new Error(r.stderr);
console.log(out);
