import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from '../src/build.mjs';
import { loadSafetyCanon, isCanonRef, expandCanon } from '../src/safety-canon.mjs';

const root = path.resolve(import.meta.dirname, '..');

test('build 产出自包含单文件', async () => {
  const html = await build(root);
  const onDisk = await readFile(path.join(root, 'dist/index.html'), 'utf8');
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
