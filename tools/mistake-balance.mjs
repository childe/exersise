// 站姿错误示范的重心检查：全身（含负荷）重心是否落在支撑面（脚跟—脚尖，脚跟离地时只算前脚掌）上。
//   node tools/mistake-balance.mjs [slug]
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { mistakeBalance } from '../src/render/mistake-metrics.mjs';
const root = path.resolve(import.meta.dirname, '..');
const figures = JSON.parse(await readFile(path.join(root, 'data/figures.json'), 'utf8'));
const MF = JSON.parse(await readFile(path.join(root, 'data/mistake-figures.json'), 'utf8'));
for (const [slug, list] of Object.entries(MF)) {
  if (process.argv[2] && slug !== process.argv[2]) continue;
  for (const mf of list) {
    if (mf.none !== undefined) continue;
    const r = mistakeBalance(slug, figures[slug], mf);
    if (!r) { console.log(slug, mf.mistake, '非站姿，不查'); continue; }
    console.log(slug, mf.mistake, r.ok ? 'OK ' : 'BAD', r.worst);
  }
}
