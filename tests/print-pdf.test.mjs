// 真的导出一次 PDF 再核对内容完整性（§9.3 发布验收）。
// 之前这一条只在打印媒体下断言"切换器隐藏、两轨展开"——那验的是 CSS，不是导出结果：
// 分页器把内容截断、外链脚注没打出来、图片没进 PDF，这些只有真导出才看得见。
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { build } from '../src/build.mjs';
import { launch, findBrowser } from './helpers/browser.mjs';

const root = path.resolve(import.meta.dirname, '..');
const skip = findBrowser() ? false : '本机没有 Chromium 内核浏览器（设 CHROME_BIN 可指定）';

let B;
let pdf = null;

before(async () => {
  if (skip) return;
  await build();
  B = await launch(pathToFileURL(path.join(root, 'dist/index.html')).href);
  await B.send('Page.enable');
  const r = await B.send('Page.printToPDF', {
    printBackground: true,
    paperWidth: 8.27, paperHeight: 11.69, // A4
    marginTop: 0.4, marginBottom: 0.4, marginLeft: 0.4, marginRight: 0.4,
  });
  pdf = Buffer.from(r.data, 'base64');
  await writeFile(path.join(root, 'dist/artifact.pdf'), pdf);
}, { timeout: 120000 });

after(async () => { if (B) await B.close(); });

test('导出的 PDF 是有效文件，且两轨内容完整分页（不是只打出首屏）', { skip }, () => {
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  assert.ok(pages >= 60, `导出的 PDF 只有 ${pages} 页，两轨全展开不可能这么短——多半是被截断了`);
});

test('PDF 里保留了每一条外部来源链接（打印脚注的 URL 一条都不能丢）', { skip }, async () => {
  const read = async (f) => JSON.parse(await readFile(path.join(root, f), 'utf8'));
  const claims = await read('data/claims.json');
  const demos = await read('data/demos.json');
  const urls = [...new Set([
    ...claims.flatMap((c) => c.sources.map((s) => s.url)),
    ...demos.flatMap((d) => [d.url, d.visual_url]),
  ].filter(Boolean))];
  const text = pdf.toString('latin1');
  const missing = urls.filter((u) => !text.includes(u));
  assert.deepEqual(missing, [], '这些来源链接没出现在 PDF 里：纸质读者就追不到出处了');
  assert.ok(urls.length >= 45);
});
