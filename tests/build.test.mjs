import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from '../src/build.mjs';
import { loadSafetyCanon, isCanonRef, expandCanon } from '../src/safety-canon.mjs';

const root = path.resolve(import.meta.dirname, '..');

test('build 产出自包含单文件', async () => {
  // 写进各自的临时目录：node --test 并行跑多个测试文件，大家都往 dist/ 写的话，
  // 这里读到的可能是别的文件刚写进去的那一版，CI 会偶发红。
  const outDir = await mkdtemp(path.join(tmpdir(), 'fitguide-build-'));
  const html = await build(root, { outDir });
  const onDisk = await readFile(path.join(outDir, 'index.html'), 'utf8');
  assert.equal(html, onDisk);
  assert.match(html, /<title>系统化健身知识教程<\/title>/);
  assert.doesNotMatch(html, /<link[^>]+rel="stylesheet"/);
  assert.doesNotMatch(html, /<script[^>]+src="(?!https:)/);
  assert.match(html, /<style>/);
  assert.match(html, /<script>/);
});

test('package.json 零依赖', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.deepEqual(pkg.dependencies ?? {}, {});
  assert.deepEqual(pkg.devDependencies ?? {}, {});
  assert.equal(pkg.type, 'module');
});

test('安全口径可被解析成受控取值', async () => {
  const canon = await loadSafetyCanon(root);
  for (const k of ['C1', 'C2', 'C3', 'C4', 'C5']) assert.ok(canon[k], `${k} 必须解析出来`);
  assert.match(canon.C1, /当场停止该动作/);
  assert.match(canon.C3, /两侧卡扣必须上紧/);
  assert.ok(isCanonRef(canon.C1, canon, 'C1'));
  assert.ok(isCanonRef('canon:C1', canon, 'C1'));
  assert.ok(!isCanonRef('出现疼痛就 deload 一周', canon, 'C1'));
  assert.ok(!isCanonRef('canon:C3', canon, 'C1'));
  assert.equal(expandCanon('canon:C1', canon), canon.C1);
});

test('参考库里的每个容器锚点都在 CONTAINER_TRACK 里登记为 ref', async () => {
  // 新增一个分区却忘了登记轨道时，这条会先失败——而不是等读者分享链接时才发现。
  const { trackOf } = await import('../src/assets/app.js');
  const html = await build(root);
  const ref = html.slice(html.indexOf('id="track-ref"'));
  const ids = [...ref.matchAll(/<section id="([a-z0-9-]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 3, '参考库应至少有动作库 / 模板 / 登记表三个分区');
  for (const id of ids) assert.equal(trackOf(id), 'ref', `容器锚点 #${id} 未登记到参考库轨`);
});
