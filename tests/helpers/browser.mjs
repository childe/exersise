// 极简 CDP 驱动：用系统上已装的 Chromium 内核浏览器（headless）打开构建产物，
// 在真实浏览器里跑路由 / 筛选 / 锚点 / 历史导航 / 打印 / 窄屏 / 无 JS 的行为。
// 不引入任何依赖（package.json 是零依赖的），只用 Node 自带的 WebSocket 与 fetch。
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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

// CI 的 2 核机器上几个测试文件并行跑，冷启动 Chrome 偶尔要 10 秒以上——
// 给 30 秒；真起不来的情况靠下面的「进程已退出」快速失败，不会白等。
const LAUNCH_TIMEOUT_MS = 30000;

export async function launch(fileUrl) {
  const bin = findBrowser();
  if (!bin) throw new Error('没有找到 Chromium 内核浏览器');
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'fg-browser-'));
  // 端口交给 Chrome 自己挑（0），它把实际端口写进 user-data-dir/DevToolsActivePort。
  // 以前按 pid 算端口，并行的测试文件偶尔撞上同一个，表现为「没有打开目标页面」。
  const proc = spawn(bin, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--allow-file-access-from-files',
    `--user-data-dir=${userDataDir}`, '--remote-debugging-port=0', fileUrl,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d) => { stderr = (stderr + d).slice(-2000); });
  let exited = null;
  proc.on('exit', (code, signal) => { exited = signal ?? code; });

  let target = null;
  const deadline = Date.now() + LAUNCH_TIMEOUT_MS;
  while (!target && exited === null && Date.now() < deadline) {
    await sleep(100);
    try {
      const port = (await readFile(path.join(userDataDir, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === 'page' && t.url.startsWith('file://'));
    } catch { /* 还没起来 */ }
  }
  if (!target) {
    proc.kill('SIGKILL');
    const why = exited !== null ? `浏览器进程已退出（${exited}）` : `浏览器没有在 ${LAUNCH_TIMEOUT_MS / 1000} 秒内打开目标页面`;
    throw new Error(`${why}${stderr ? `\n--- stderr 末尾 ---\n${stderr}` : ''}`);
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
