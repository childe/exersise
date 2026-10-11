import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInternalLinks, checkExternalUrls, summarizeLinkCheck } from '../src/validate/links.mjs';

test('指向不存在锚点的内部链接被报出', () => {
  const html = '<a href="#ch3">x</a><section id="ch2"></section>';
  assert.ok(validateInternalLinks(html).some((e) => e.includes('#ch3')));
});

test('锚点齐备时通过', () => {
  const html = '<a href="#ch2">x</a><section id="ch2"></section>';
  assert.deepEqual(validateInternalLinks(html), []);
});

test('重复 id 被报出（锚点分享会落错位置）', () => {
  const html = '<section id="ch2"></section><div id="ch2"></div>';
  assert.ok(validateInternalLinks(html).some((e) => e.includes('重复')));
});

test('网络不可用时标记 unchecked，不报 ok', async () => {
  const res = await checkExternalUrls(['https://invalid.invalid/nope'], { timeoutMs: 1500 });
  assert.notEqual(res[0].status, 'ok');
});

// —— 开发检查 vs 发布检查：四种结果组合 ——

const ok = (u) => ({ url: u, status: 'ok', detail: 200 });
const dead = (u) => ({ url: u, status: 'dead', detail: 404 });
const unk = (u) => ({ url: u, status: 'unchecked', detail: '超时' });

test('全部可达：开发与发布都通过', () => {
  const rs = [ok('https://a'), ok('https://b')];
  assert.equal(summarizeLinkCheck(rs).exitCode, 0);
  assert.equal(summarizeLinkCheck(rs, { release: true }).exitCode, 0);
});

test('存在失效：开发与发布都失败', () => {
  const rs = [ok('https://a'), dead('https://b')];
  assert.equal(summarizeLinkCheck(rs).exitCode, 1);
  assert.equal(summarizeLinkCheck(rs, { release: true }).exitCode, 1);
});

test('全部未检查：开发可通过，发布必须失败（离线不等于可达）', () => {
  const rs = [unk('https://a'), unk('https://b')];
  assert.equal(summarizeLinkCheck(rs).exitCode, 0);
  const rel = summarizeLinkCheck(rs, { release: true });
  assert.equal(rel.exitCode, 1);
  assert.ok(rel.lines.some((l) => l.includes('未检查')));
});

test('混合（可达 + 未检查）：开发通过，发布失败', () => {
  const rs = [ok('https://a'), unk('https://b')];
  assert.equal(summarizeLinkCheck(rs).exitCode, 0);
  assert.equal(summarizeLinkCheck(rs, { release: true }).exitCode, 1);
});

test('一条都没检查时发布失败，而不是"零失效即通过"', () => {
  assert.equal(summarizeLinkCheck([], { release: true }).exitCode, 1);
});
