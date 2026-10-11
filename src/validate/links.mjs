export function collectInternalAnchors(html) {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
}

export function validateInternalLinks(html) {
  const errs = [];
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const seen = new Set();
  for (const id of ids) {
    if (seen.has(id)) errs.push(`锚点 id 重复: ${id}（分享链接会落到错误位置）`);
    seen.add(id);
  }
  for (const m of html.matchAll(/href="#([^"]+)"/g)) {
    if (!seen.has(m[1])) errs.push(`内部链接指向不存在的锚点 #${m[1]}`);
  }
  return errs;
}

/**
 * 发布检查要覆盖页面上**每一条**可点击外链：claim 来源、未降级的示范链接，
 * 以及示范的补充视觉链接（visual_url）。漏掉哪一类，哪一类就会悄悄死在页面上。
 */
export function collectExternalUrls(claims, demos) {
  return [
    ...claims.flatMap((c) => c.sources.map((s) => s.url)),
    ...demos.filter((d) => d.dead !== true).flatMap((d) => [d.url, d.visual_url]),
  ].filter(Boolean);
}

/**
 * 发布级外链检查有两条来自真实事故的硬约束：
 *
 * 1. **按主机串行**。原先用 `Promise.all` 把 53 条外链一次性打出去，PubMed 对其中 26 条
 *    返回 429；并发轰站点既不礼貌，也直接制造假失效。
 * 2. **429 / 5xx 永远不判 dead**。"现在别问我"不等于"链接坏了"。重试退避后仍不通，
 *    只能标 unchecked（发布级仍然失败，必须有人重跑），绝不能标 dead——
 *    dead 的处置动作是"换来源或标 dead=true 降级"，对 26 条有效来源执行那个动作就是毁掉引用。
 *    只有明确的 4xx（404/410 这类"这个东西不在了"）才是 dead。
 */
const RETRYABLE = (status) => status === 429 || status >= 500;

// PubMed（以及不少出版商站点）对没有 UA 的请求直接回 429：不带 UA 时 53 条里有 26 条
// 被限流，带上常规浏览器 UA 后同样的节奏一条都不限流。这不是"伪装"，是按站点期待的方式提问。
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export async function checkExternalUrls(
  urls,
  { timeoutMs = 10000, fetchImpl = fetch, retries = 4, retryDelayMs = 2000, paceMs = 400 } = {},
) {
  const unique = [...new Set(urls)];
  // 按主机分组：组间并发，组内严格串行且每次请求之间留间隔
  const byHost = new Map();
  for (const url of unique) {
    const host = (() => { try { return new URL(url).host; } catch { return url; } })();
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host).push(url);
  }

  const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

  // 每个主机一份自适应节流：一旦被 429，就把该主机的间隔放大（并尊重 Retry-After），
  // 否则后面的请求只会继续撞同一堵墙，把整批有效来源染成"检查不到"。
  const hostPace = new Map();
  // 连续成功就把节流收回来：被一次 429 撞到最慢档之后一直保持最慢档，
  // 会让 50 多条外链的发布检查拖到十几分钟，没人会愿意在发布前跑它。
  const relax = (host) => {
    const cur = hostPace.get(host);
    if (cur && cur > paceMs) hostPace.set(host, Math.max(paceMs, Math.round(cur / 2)));
  };
  const bump = (host, retryAfterSec) => {
    const want = Math.max((hostPace.get(host) ?? paceMs) * 2, (retryAfterSec ?? 0) * 1000, 1000);
    hostPace.set(host, Math.min(want, 15000));
  };
  const retryAfterOf = (res) => {
    const h = res?.headers;
    const raw = typeof h?.get === 'function' ? h.get('retry-after') : undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };

  const checkOne = async (url, host) => {
    let last = null;
    for (let attempt = 0; attempt < retries; attempt += 1) {
      if (attempt > 0) await sleep(retryDelayMs * 2 ** (attempt - 1));
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const init = { redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': UA } };
        let res = await fetchImpl(url, { ...init, method: 'HEAD' });
        if (res.status === 405 || res.status === 403) {
          res = await fetchImpl(url, { ...init, method: 'GET' });
        }
        if (res.ok) { relax(host); return { url, status: 'ok', detail: res.status }; }
        if (RETRYABLE(res.status)) {
          if (res.status === 429) bump(host, retryAfterOf(res));
          last = { url, status: 'unchecked', detail: `${res.status}（限流或站点临时故障，重试 ${retries} 次仍未通过——这不是链接失效，不要标 dead=true）` };
          await sleep(hostPace.get(host) ?? 0);
          continue;
        }
        return { url, status: 'dead', detail: res.status };
      } catch (err) {
        // 网络不可用与站点真死无法在离线环境下区分，一律标 unchecked，绝不报 ok
        last = { url, status: 'unchecked', detail: err.name === 'AbortError' ? '超时' : err.message };
      } finally {
        clearTimeout(timer);
      }
    }
    return last;
  };

  const perHost = await Promise.all([...byHost.entries()].map(async ([host, list]) => {
    const out = [];
    for (const [i, url] of list.entries()) {
      if (i > 0) await sleep(hostPace.get(host) ?? paceMs);
      out.push(await checkOne(url, host));
    }
    return out;
  }));
  const flat = perHost.flat();
  // 保持输入顺序，便于逐轮比对输出
  const index = new Map(flat.map((r) => [r.url, r]));
  return unique.map((u) => index.get(u));
}

/**
 * 开发检查与发布检查的判据不同，用同一个纯函数表达，便于测试：
 * - dev（默认）：只有未处理的 dead 才失败；unchecked 允许（离线开发）。
 * - release（`--release`）：任何 dead 或任何 unchecked 都失败——
 *   "全部未检查"绝不等于"全部可达"，发布验收必须真的检查过。
 */
export function summarizeLinkCheck(results, { release = false } = {}) {
  const dead = results.filter((r) => r.status === 'dead');
  const unchecked = results.filter((r) => r.status === 'unchecked');
  const ok = results.filter((r) => r.status === 'ok');
  const lines = [`合计 ${results.length}：可达 ${ok.length}，失效 ${dead.length}，未检查 ${unchecked.length}`];
  const problems = [];
  if (dead.length) {
    problems.push(`失效 ${dead.length} 条：必须更换来源，或在 data/demos.json 把该条标 dead=true 并填 dead_note（降级为"文字 + 判据 + 失效提示"）。`
      + `标记后本检查不再抓取它，也不再在页面上输出可点击链接。`);
  }
  if (release && unchecked.length) {
    problems.push(`未检查 ${unchecked.length} 条：发布验收不接受 unchecked（离线或超时都算没检查过），请在有网环境重跑 \`npm run check:links:release\`。`);
  }
  if (release && results.length === 0) {
    problems.push('一条外链都没有被检查——发布验收至少要覆盖全部 claim 来源与未降级的示范链接。');
  }
  return { exitCode: problems.length ? 1 : 0, lines: [...lines, ...problems] };
}

if (process.argv[1]?.endsWith('links.mjs') && process.argv.includes('--external')) {
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const release = process.argv.includes('--release');
  const root = path.resolve(import.meta.dirname, '..', '..');
  const claims = JSON.parse(await readFile(path.join(root, 'data/claims.json'), 'utf8'));
  const demos = JSON.parse(await readFile(path.join(root, 'data/demos.json'), 'utf8'));
  // 已标 dead=true 的示范是"已处理"的：不再抓取、不再因它失败，但会显式列出来
  const degraded = demos.filter((d) => d.dead === true);
  const urls = collectExternalUrls(claims, demos);
  const results = await checkExternalUrls(urls);
  for (const r of results) console.log(`${r.status.padEnd(9)} ${r.url}  ${r.detail}`);
  for (const d of degraded) console.log(`degraded  ${d.id}  已降级为文字+判据+失效提示：${d.dead_note ?? '（缺 dead_note）'}`);
  const { exitCode, lines } = summarizeLinkCheck(results, { release });
  console.log('\n' + lines.join('\n'));
  if (exitCode) process.exit(exitCode);
}
