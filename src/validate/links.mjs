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

export async function checkExternalUrls(urls, { timeoutMs = 10000 } = {}) {
  return Promise.all([...new Set(urls)].map(async (url) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal });
      if (res.status === 405 || res.status === 403) {
        res = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctrl.signal });
      }
      return res.ok
        ? { url, status: 'ok', detail: res.status }
        : { url, status: 'dead', detail: res.status };
    } catch (err) {
      // 网络不可用与站点真死无法在离线环境下区分，一律标 unchecked，绝不报 ok
      return { url, status: 'unchecked', detail: err.name === 'AbortError' ? '超时' : err.message };
    } finally {
      clearTimeout(timer);
    }
  }));
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
