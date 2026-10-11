// 极简 CDP 驱动：用系统上已装的 Chromium 内核浏览器（headless）打开构建产物，
// 在真实浏览器里跑路由 / 筛选 / 锚点 / 历史导航 / 打印 / 窄屏 / 无 JS 的行为。
// 不引入任何依赖（package.json 是零依赖的），只用 Node 自带的 WebSocket 与 fetch。
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

export function findBrowser() {
  return process.env.CHROME_BIN ?? CANDIDATES.find((p) => existsSync(p)) ?? null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch(fileUrl, { port = 9400 + (process.pid % 400) } = {}) {
  const bin = findBrowser();
  if (!bin) throw new Error('没有找到 Chromium 内核浏览器');
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'fg-browser-'));
  const proc = spawn(bin, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--allow-file-access-from-files',
    `--user-data-dir=${userDataDir}`, `--remote-debugging-port=${port}`, fileUrl,
  ], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 100 && !target; i += 1) {
    await sleep(100);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === 'page' && t.url.startsWith('file://'));
    } catch { /* 还没起来 */ }
  }
  if (!target) {
    proc.kill('SIGKILL');
    throw new Error('浏览器没有在 10 秒内打开目标页面');
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });

  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
    else p.resolve(msg.result);
  });

  function send(method, params = {}) {
    const id = (seq += 1);
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (pending.delete(id)) reject(new Error(`CDP ${method} 超时`));
      }, 15000);
    });
  }

  async function evaluate(fn, ...args) {
    const expr = `(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(',')})`;
    const r = await send('Runtime.evaluate', {
      expression: expr, awaitPromise: true, returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error('页面里抛错：' + (r.exceptionDetails.exception?.description
        ?? r.exceptionDetails.text));
    }
    return r.result.value;
  }

  async function waitForLoad() {
    for (let i = 0; i < 100; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const ready = await evaluate(() => document.readyState === 'complete'
        && typeof window.__IDS__ !== 'undefined');
      if (ready) return;
      // eslint-disable-next-line no-await-in-loop
      await sleep(50);
    }
    throw new Error('页面没有加载完成');
  }

  async function reload() {
    await send('Page.enable');
    await send('Page.reload', { ignoreCache: true });
    await sleep(300);
    await waitForLoad();
  }

  async function close() {
    try { ws.close(); } catch { /* 已经断了 */ }
    proc.kill('SIGKILL');
    // 浏览器被杀掉之后还会有写缓存的尾巴，直接删目录会偶发 ENOTEMPTY。
    // 清不掉也只是 /tmp 里留个目录，不该让测试因此失败。
    for (let i = 0; i < 5; i += 1) {
      try {
        await rm(userDataDir, { recursive: true, force: true, maxRetries: 3 });
        return;
      } catch {
        await sleep(200);
      }
    }
  }

  await send('Runtime.enable');
  await waitForLoad();
  return { send, evaluate, reload, close, sleep };
}
