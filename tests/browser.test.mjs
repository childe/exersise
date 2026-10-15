// 真实浏览器里的行为验收：纯函数与 CSS 文本断言看不出"点下去到底发生了什么"。
// 覆盖：切轨→刷新→后退、容器锚点、筛选→锚点跳转、全站证据筛选、
//       无 JS 两轨完整、窄屏无横向滚动、打印展开、主题持久化。
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { build } from '../src/build.mjs';
import { launch, findBrowser } from './helpers/browser.mjs';

const root = path.resolve(import.meta.dirname, '..');
const skip = findBrowser() ? false : '本机没有 Chromium 内核浏览器（设 CHROME_BIN 可指定）';

let B;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  if (skip) return;
  // 自己的输出目录：并行跑的其他测试文件也在 build()，共用 dist/ 会互相覆盖
  const outDir = await mkdtemp(path.join(tmpdir(), 'fitguide-browser-'));
  await build(root, { outDir });
  B = await launch(pathToFileURL(path.join(outDir, 'index.html')).href);
}, { timeout: 90000 });

after(async () => { if (B) await B.close(); });

async function go(hash) {
  await B.evaluate((h) => { window.location.hash = h; }, hash);
  await sleep(150);
}

test('切到参考库后 URL 反映位置，刷新仍停在参考库，后退回到学习路径', { skip }, async () => {
  await go('#ch0');
  await B.evaluate(() => document.querySelector('.track-switch button[data-track="ref"]').click());
  await sleep(150);
  assert.equal(await B.evaluate(() => location.hash), '#exercises');
  assert.equal(await B.evaluate(() => document.querySelector('.track.is-active').dataset.track), 'ref');

  await B.reload();
  assert.equal(await B.evaluate(() => document.querySelector('.track.is-active').dataset.track), 'ref',
    '刷新 #exercises 后必须仍在参考库轨');
  assert.equal(
    await B.evaluate(() => document.getElementById('exercises').offsetParent !== null), true,
    '#exercises 必须真的可见，而不是躺在未激活的轨里',
  );

  await B.evaluate(() => history.back());
  await sleep(300);
  assert.equal(await B.evaluate(() => document.querySelector('.track.is-active').dataset.track), 'learn',
    '后退应回到学习路径');
});

test('容器锚点 #plans / #claims 直接打开即可见', { skip }, async () => {
  for (const id of ['plans', 'claims']) {
    await go('#' + id);
    assert.equal(await B.evaluate((x) => document.getElementById(x).offsetParent !== null, id), true,
      `#${id} 打开后应可见`);
    assert.equal(await B.evaluate(() => document.querySelector('.route-notice').hidden), true,
      '容器锚点不应被当成失效锚点');
  }
});

test('筛选之后跳到被筛掉的动作卡，卡片会重新出现且筛选状态同步', { skip }, async () => {
  await go('#exercises');
  // 只看"自重"，杠铃高杠背蹲会被隐藏
  await B.evaluate(() => {
    const panel = document.querySelector('.filters[data-for="exercises"]');
    panel.querySelector('fieldset[data-dim="equipment"] button[data-value="自重"]').click();
  });
  await sleep(100);
  assert.equal(await B.evaluate(() => document.getElementById('ex-back-squat-high-bar').hidden), true,
    '前置条件：该卡此时应被筛掉');

  await go('#ex-back-squat-high-bar');
  assert.equal(await B.evaluate(() => document.getElementById('ex-back-squat-high-bar').hidden), false,
    '跳转到被筛掉的卡时必须解除遮挡，而不是滚到一个看不见的元素');
  assert.equal(
    await B.evaluate(() => [...document.querySelectorAll('.filters[data-for="exercises"] fieldset button')]
      .every((b) => b.getAttribute('aria-pressed') !== 'true')),
    true, '筛选按钮状态必须跟着复位',
  );
  const count = await B.evaluate(() => document.querySelector('.filters[data-for="exercises"] .result-count').textContent);
  assert.match(count, /已显示 (\d+) \/ 共 \1 条/, '计数必须同步回全部可见');
});

test('证据筛选是全站的：学习正文里的证据标签同步标出，正文与安全提示不被隐藏', { skip }, async () => {
  await go('#claims');
  const before = await B.evaluate(() => {
    const t = document.querySelector('#track-learn .claim-tag[data-direction="支持"]');
    return { id: t.getAttribute('href'), text: t.closest('p, li')?.textContent.length ?? 0 };
  });
  await B.evaluate(() => {
    document.querySelector('.filters[data-for="claims"] fieldset[data-dim="direction"] button[data-value="反对"]').click();
  });
  await sleep(100);
  const after = await B.evaluate(() => {
    const off = document.querySelector('#track-learn .claim-tag[data-direction="支持"]');
    const on = document.querySelector('#track-learn .claim-tag[data-direction="反对"]');
    return {
      offHasClass: off.classList.contains('is-off'),
      // 学习轨此刻不是激活轨，所以不能用 offsetParent 判断；
      // 要验的是"证据筛选没有把正文藏起来"：元素本身与它所在的章节都不是 hidden。
      offStillInFlow: !off.closest('p, li').hidden && !off.closest('.chapter').hidden,
      offTextLen: off.closest('p, li').textContent.length,
      onHasClass: on ? on.classList.contains('is-on') : null,
      bodyFlag: document.body.classList.contains('evidence-filtering'),
      scope: document.querySelector('.evidence-scope').textContent,
      safetyDimmed: [...document.querySelectorAll('.safety .claim-tag')]
        .some((t) => t.classList.contains('is-off')),
    };
  });
  assert.equal(after.offHasClass, true, '不命中的证据标签应在全站被标出（降权）');
  assert.equal(after.onHasClass, true, '命中的证据标签应在全站被高亮');
  assert.equal(after.offStillInFlow, true, '正文不得被证据筛选隐藏');
  assert.equal(after.offTextLen, before.text, '正文文字一个字都不该少');
  assert.equal(after.bodyFlag, true);
  assert.match(after.scope, /全站 \d+ 处证据标签/);
  assert.equal(after.safetyDimmed, false, '安全提示里的证据标签永不降权');
  await B.evaluate(() => document.querySelector('.filters[data-for="claims"] .clear-filters').click());
  await sleep(50);
});

test('窄屏 390px 不出现横向滚动', { skip }, async () => {
  await B.send('Emulation.setDeviceMetricsOverride',
    { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(200);
  const over = await B.evaluate(() => ({
    doc: document.documentElement.scrollWidth, win: window.innerWidth,
  }));
  assert.ok(over.doc <= over.win + 1, `横向溢出：内容 ${over.doc}px > 视口 ${over.win}px`);
  await B.send('Emulation.clearDeviceMetricsOverride');
});

test('打印时切换器与筛选器消失、两轨都展开、被筛掉的卡重新出现', { skip }, async () => {
  await B.send('Emulation.setEmulatedMedia', { media: 'print' });
  await sleep(150);
  const r = await B.evaluate(() => {
    const vis = (sel) => getComputedStyle(document.querySelector(sel)).display;
    return {
      sw: vis('.track-switch'), filters: vis('.filters'),
      learn: vis('#track-learn'), ref: vis('#track-ref'),
    };
  });
  assert.equal(r.sw, 'none');
  assert.equal(r.filters, 'none');
  assert.equal(r.learn, 'block');
  assert.equal(r.ref, 'block');
  await B.send('Emulation.setEmulatedMedia', { media: '' });
});

test('禁用 JS 后两轨正文都完整可见', { skip }, async () => {
  await B.send('Emulation.setScriptExecutionDisabled', { value: true });
  await B.send('Page.enable');
  await B.send('Page.reload', { ignoreCache: true });
  await sleep(1200);
  const r = await B.send('Runtime.evaluate', {
    expression: `(() => {
      const d = (s) => getComputedStyle(document.querySelector(s)).display;
      return JSON.stringify({ learn: d('#track-learn'), ref: d('#track-ref'),
        len: document.querySelector('#track-ref').textContent.length });
    })()`,
    returnByValue: true,
  });
  const v = JSON.parse(r.result.value);
  assert.notEqual(v.learn, 'none', '无 JS 时学习轨必须可见');
  assert.notEqual(v.ref, 'none', '无 JS 时参考库轨必须可见');
  assert.ok(v.len > 5000, '无 JS 时参考库正文应完整');
  await B.send('Emulation.setScriptExecutionDisabled', { value: false });
  await B.reload();
});

test('主题切换写入 data-theme 并在刷新后保持', { skip }, async () => {
  const first = await B.evaluate(() => {
    document.querySelector('.theme-toggle').click();
    return document.documentElement.dataset.theme;
  });
  assert.ok(first === 'dark' || first === 'light');
  await B.reload();
  assert.equal(await B.evaluate(() => document.documentElement.dataset.theme), first,
    '刷新后主题应保持');
});

test('实际发布的 artifact.html（平台补外壳后）在浏览器里同样可用', { skip }, async () => {
  // 发布走的是 dist/artifact.html，平台会给它补 <!doctype html><head></head><body>。
  // 这里复刻那层外壳再在浏览器里点一遍，避免"本地 index.html 好用、发布版不好用"。
  const { readFile, writeFile, mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const body = await readFile(path.join(root, 'dist/artifact.html'), 'utf8');
  const dir = await mkdtemp(path.join(tmpdir(), 'fg-artifact-'));
  const file = path.join(dir, 'wrapped.html');
  await writeFile(file, `<!doctype html><html><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width, initial-scale=1">`
    + `</head><body>${body}</body></html>`, 'utf8');
  const A = await launch(pathToFileURL(file).href);
  try {
    assert.equal(await A.evaluate(() => document.body.classList.contains('js-on')), true);
    await A.evaluate(() => { document.querySelector('.track-switch button[data-track="ref"]').click(); });
    await sleep(150);
    assert.equal(await A.evaluate(() => location.hash), '#exercises');
    assert.equal(await A.evaluate(() => document.getElementById('exercises').offsetParent !== null), true);
    await A.evaluate(() => {
      document.querySelector('.filters[data-for="exercises"] fieldset[data-dim="equipment"] button[data-value="自重"]').click();
    });
    await sleep(100);
    assert.equal(await A.evaluate(() => document.getElementById('ex-back-squat-high-bar').hidden), true);
    await A.evaluate(() => { window.location.hash = '#ex-back-squat-high-bar'; });
    await sleep(150);
    assert.equal(await A.evaluate(() => document.getElementById('ex-back-squat-high-bar').hidden), false);
    assert.equal(await A.evaluate(() => document.querySelectorAll('html, body').length), 2,
      '发布形态不得自带文档外壳（平台会补），否则会出现嵌套 html/body');
  } finally {
    await A.close();
  }
}, { timeout: 90000 });
