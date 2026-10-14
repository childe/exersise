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
  model: 'gpt-image-2', generated: '2026-10-14', width: 1600, height: 1052,
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
  const { readFile } = await import('node:fs/promises');
  const registry = JSON.parse(await readFile(path.join(root, 'data/anatomy.json'), 'utf8'));
  assert.ok(registry.length > 0 && html.includes('<img '), '页面上应该真有图，否则这条测的是空集');
  assert.deepEqual(validateImages(html, registry), [], '页面上的每张图都应已登记');
  const injected = html.replace('</body>', '<img src="https://evil.example/a.png" alt=""></body>');
  assert.equal(validateImages(injected, registry).length, 1);
  // 反过来：从登记表里抽掉一张，页面上那张就该被报出来
  assert.equal(validateImages(html, registry.slice(1)).length, 1);
});

test('分布图 URL 纳入外链可达性检查——挂了的图在页面上就是一个破图标', async () => {
  const { collectExternalUrls } = await import('../src/validate/links.mjs');
  assert.ok(collectExternalUrls([], [], [ok]).includes(ok.url));
  assert.deepEqual(collectExternalUrls([], []), [], '不传登记表时行为不变');
});

test('{{anat:..}} 只能引用登记过的图，渲染出带宽高的 <img>', async () => {
  const { expandTokens } = await import('../src/render/tokens.mjs');
  const entry = ok;
  const ctx = { anatomy: new Map([[entry.id, entry]]) };
  const html = expandTokens('{{anat:push}}', ctx);
  assert.match(html, /<figure class="anat">/);
  assert.match(html, new RegExp(`src="${entry.url}"`));
  assert.match(html, /width="1600" height="1052"/, '不写宽高，图片加载前正文会整段跳动');
  assert.match(html, /AI 生成/, '图注必须如实写明是生成图（spec §7.5）');
  assert.deepEqual(validateImages(html, [entry]), [], '占位符渲染出的图必须能过登记校验');
  assert.throws(() => expandTokens('{{anat:nope}}', ctx), /未登记的肌肉分布图/);
});

test('登记表缺宽高被拒', () => {
  assert.match(validateAnatomy([{ ...ok, width: undefined }]).join(), /width 必须是正整数/);
  assert.match(validateAnatomy([{ ...ok, height: 0 }]).join(), /height 必须是正整数/);
});

test('真实登记表：每张登记的图都在页面上出现在该在的位置', async () => {
  const { readFile } = await import('node:fs/promises');
  const list = JSON.parse(await readFile(path.join(root, 'data/anatomy.json'), 'utf8'));
  assert.deepEqual(validateAnatomy(list), []);
  // 动作模式图配在第 4 章 4.2 正文里
  const ch4 = await readFile(path.join(root, 'content/ch4.html'), 'utf8');
  const actions = list.filter((a) => a.kind === '动作模式');
  assert.equal(actions.length, 8, '4.2 的推、拉各拆水平 / 垂直，加蹲、髋铰链、搬运、核心抗阻，共 8 张');
  for (const a of actions) assert.ok(ch4.includes(`{{anat:${a.id.slice(5)}}}`), `${a.id} 登记了却没在第 4 章里用`);
  // 全局图与部位图在参考库的肌肉图谱里，且全局在前
  const { renderAtlas } = await import('../src/render/atlas.mjs');
  const atlas = renderAtlas(list);
  const rest = list.filter((a) => a.kind !== '动作模式');
  assert.ok(rest.length > 0);
  for (const a of rest) assert.ok(atlas.includes(a.url), `${a.id} 登记了却没出现在图谱里`);
  const lastGlobal = Math.max(...list.filter((a) => a.kind === '全局').map((a) => atlas.indexOf(a.url)));
  const firstPart = Math.min(...list.filter((a) => a.kind === '部位').map((a) => atlas.indexOf(a.url)));
  assert.ok(lastGlobal < firstPart, '全局图（在哪）应排在部位图（分几束）前面');
});

test('图谱是学习路径的一部分：进路由表、归学习轨、目录有入口，动作库能链过去', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'fitguide-atlas-'));
  const html = await build(root, { outDir });
  const ids = JSON.parse(/window\.__IDS__=(\[[^\]]*\])/.exec(html)[1]);
  assert.ok(ids.includes('atlas'), '不进路由表的话，从别处点到 #atlas 会提示锚点不存在');
  const learnStart = html.indexOf('id="track-learn"');
  const refStart = html.indexOf('id="track-ref"');
  const atlasAt = html.indexOf('<section id="atlas">');
  assert.ok(atlasAt > learnStart && atlasAt < refStart, '图谱应在学习路径轨道里，而不是参考库');
  const toc = /<nav class="toc"[\s\S]*?<\/nav>/.exec(html)[0];
  assert.ok(toc.includes('href="#atlas"'), '章节目录里应有图谱入口');
  const { trackOf } = await import('../src/assets/app.js');
  assert.equal(trackOf('atlas'), 'learn', '#atlas 应切到学习轨');
  const ref = html.slice(refStart);
  assert.ok(ref.includes('href="#atlas"'), '动作库顶部仍应有跳到图谱的入口');
  const ch4 = html.slice(html.indexOf('id="ch4"'), html.indexOf('id="ch5"'));
  assert.ok(ch4.includes('href="#atlas"'), '第 4 章功能解剖应链到图谱');
});
