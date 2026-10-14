import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { validateAnatomy, validateImages } from '../src/validate/anatomy.mjs';
import { build } from '../src/build.mjs';

const root = path.resolve(import.meta.dirname, '..');
const ok = {
  id: 'anat-push', title: '推 · 14 个动作练到哪里', kind: '动作模式',
  url: 'https://ohsaisai.oss-cn-shanghai.aliyuncs.com/fit/anatomy/action/a3-push.png',
  model: 'gpt-image-2', generated: '2026-10-14',
};

test('合格的登记条目通过', () => {
  assert.deepEqual(validateAnatomy([ok]), []);
});

test('登记条目的每个字段都会被查', () => {
  const bad = (patch) => validateAnatomy([{ ...ok, ...patch }]);
  assert.match(bad({ id: 'push' }).join(), /anat-<slug>/);
  assert.match(bad({ url: 'http://x/a.png' }).join(), /https/);
  assert.match(bad({ kind: '其他' }).join(), /kind/);
  assert.match(bad({ model: 'midjourney' }).join(), /model/);
  assert.match(bad({ generated: '2026/10/14' }).join(), /YYYY-MM-DD/);
  assert.match(bad({ title: '' }).join(), /title/);
});

test('id 与 url 都不许重复', () => {
  assert.match(validateAnatomy([ok, { ...ok, url: ok.url + '?2' }]).join(), /id 重复/);
  assert.match(validateAnatomy([ok, { ...ok, id: 'anat-push-2' }]).join(), /url 与前面的条目重复/);
});

test('已登记的图放行，未登记的图拦下——属性顺序不影响', () => {
  assert.deepEqual(validateImages(`<img src="${ok.url}" alt="x">`, [ok]), []);
  assert.deepEqual(validateImages(`<img alt="x" loading="lazy" src="${ok.url}">`, [ok]), []);
  assert.equal(validateImages('<img alt="x" src="https://evil.example/a.png">', [ok]).length, 1);
});

test('SVG 的 <image href> 同样要登记——只查 <img> 等于留一个口子', () => {
  assert.equal(validateImages('<svg><image href="https://evil.example/a.png"/></svg>', [ok]).length, 1);
  assert.equal(validateImages('<svg><image xlink:href="https://evil.example/a.png"/></svg>', [ok]).length, 1);
  assert.deepEqual(validateImages(`<svg><image href="${ok.url}"/></svg>`, [ok]), []);
});

test('缺 src 的 <img> 不能当作「没有图」放过去', () => {
  assert.match(validateImages('<img alt="x">', [ok]).join(), /缺 src/);
});

test('断言查的是渲染产物：真实页面全绿，往产物里塞一张未登记的图就报', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'fitguide-anatomy-'));
  const html = await build(root, { outDir });
  assert.deepEqual(validateImages(html, []), [], '当前页面不该有任何未登记的位图');
  const injected = html.replace('</body>', '<img src="https://evil.example/a.png" alt=""></body>');
  assert.equal(validateImages(injected, []).length, 1);
});

test('分布图 URL 纳入外链可达性检查——挂了的图在页面上就是一个破图标', async () => {
  const { collectExternalUrls } = await import('../src/validate/links.mjs');
  assert.ok(collectExternalUrls([], [], [ok]).includes(ok.url));
  assert.deepEqual(collectExternalUrls([], []), [], '不传登记表时行为不变');
});
