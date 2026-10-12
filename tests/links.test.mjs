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

// —— 限流与临时故障：429/5xx 不是"链接失效" ——
// 真实事故：53 条外链被 Promise.all 同时打出去，PubMed 对 26 条返回 429，
// 检查器把它们全判成 dead，等于指示维护者把 26 条有效来源标成 dead=true。

const fakeFetch = (plan) => {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const seq = plan[url];
    const status = Array.isArray(seq) ? seq[Math.min(calls.filter((c) => c === url).length - 1, seq.length - 1)] : seq;
    return { ok: status >= 200 && status < 300, status };
  };
  fn.calls = calls;
  return fn;
};

test('被限流后重试成功的链接算 ok，不算失效', async () => {
  const fetchImpl = fakeFetch({ 'https://pubmed.test/1/': [429, 200] });
  const res = await checkExternalUrls(['https://pubmed.test/1/'], { fetchImpl, retryDelayMs: 0 });
  assert.equal(res[0].status, 'ok');
});

test('一直 429 的链接标 unchecked 而不是 dead（绝不诱导把有效来源标成 dead=true）', async () => {
  const fetchImpl = fakeFetch({ 'https://pubmed.test/2/': 429 });
  const res = await checkExternalUrls(['https://pubmed.test/2/'], { fetchImpl, retryDelayMs: 0 });
  assert.equal(res[0].status, 'unchecked');
  assert.match(String(res[0].detail), /429|限流/);
});

test('5xx 是站点临时故障，重试后仍失败也只标 unchecked', async () => {
  const fetchImpl = fakeFetch({ 'https://x.test/3/': 503 });
  const res = await checkExternalUrls(['https://x.test/3/'], { fetchImpl, retryDelayMs: 0 });
  assert.equal(res[0].status, 'unchecked');
});

test('404 仍然是 dead（重试不把真失效洗白）', async () => {
  const fetchImpl = fakeFetch({ 'https://x.test/4/': 404 });
  const res = await checkExternalUrls(['https://x.test/4/'], { fetchImpl, retryDelayMs: 0 });
  assert.equal(res[0].status, 'dead');
});

test('同一主机的请求串行发出，不并发轰站点', async () => {
  let inFlight = 0;
  let maxPerHost = 0;
  const fetchImpl = async () => {
    inFlight += 1;
    maxPerHost = Math.max(maxPerHost, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight -= 1;
    return { ok: true, status: 200 };
  };
  const urls = Array.from({ length: 6 }, (_, i) => `https://pubmed.test/${i}/`);
  const res = await checkExternalUrls(urls, { fetchImpl, retryDelayMs: 0 });
  assert.equal(res.filter((r) => r.status === 'ok').length, 6);
  assert.equal(maxPerHost, 1, '同一主机应串行');
});

test('命中 429 后同一主机自动放慢，并尊重 Retry-After', async () => {
  const gaps = [];
  let prev = 0;
  let n = 0;
  const fetchImpl = async () => {
    const now = Date.now();
    if (prev) gaps.push(now - prev);
    prev = now;
    n += 1;
    // 第一条限流一次（给出 Retry-After），其余正常
    if (n === 1) return { ok: false, status: 429, headers: new Map([['retry-after', '0']]) };
    return { ok: true, status: 200 };
  };
  const urls = ['https://pubmed.test/a/', 'https://pubmed.test/b/'];
  const res = await checkExternalUrls(urls, { fetchImpl, retryDelayMs: 0, paceMs: 10 });
  assert.deepEqual(res.map((r) => r.status), ['ok', 'ok']);
  // 限流发生后，后续同主机请求的间隔必须比初始 paceMs 更大
  // 限流后同主机的节流必须显著放大（而不是继续按初始 10ms 轰过去）
  assert.ok(gaps.at(-1) >= 300, `限流后应显著放慢，实际间隔 ${gaps.at(-1)}ms`);
});

test('请求带 User-Agent（无 UA 时 PubMed 直接 429，整批来源会被误判为检查不到）', async () => {
  const seen = [];
  const fetchImpl = async (url, opts) => {
    seen.push(opts?.headers?.['user-agent'] ?? opts?.headers?.['User-Agent']);
    return { ok: true, status: 200 };
  };
  await checkExternalUrls(['https://pubmed.test/ua/'], { fetchImpl, retryDelayMs: 0 });
  assert.ok(seen[0] && /Mozilla/.test(seen[0]), `应发送浏览器 UA，实际 ${seen[0]}`);
});
