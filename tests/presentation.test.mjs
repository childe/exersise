import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from '../src/build.mjs';
import { nextTheme } from '../src/assets/app.js';

const root = path.resolve(import.meta.dirname, '..');
const css = await readFile(path.join(root, 'src/assets/styles.css'), 'utf8');

test('轨道隐藏规则必须被 js-on 限定（无 JS 时两轨都可见）', () => {
  assert.match(css, /\.js-on\s+\.track:not\(\.is-active\)\s*\{[^}]*display:\s*none/);
  assert.doesNotMatch(css, /^\s*\.track\s*\{[^}]*display:\s*none/m);
});

test('打印样式隐藏交互件并展开两轨', () => {
  const print = css.match(/@media\s+print\s*\{[\s\S]*\}/)?.[0] ?? '';
  for (const sel of ['.track-switch', '.filters', '.toc', '.theme-toggle']) {
    assert.ok(print.includes(sel), `打印样式应隐藏 ${sel}`);
  }
  assert.match(print, /\.track\s*\{[^}]*display:\s*block/);
  assert.match(print, /\[hidden\]/, '打印时被筛选器隐藏的卡片必须重新显示');
  assert.match(print, /a\[href\^="http"\]::after/, '外部链接需以脚注形式显示 URL');
  assert.match(print, /details\[open\]|details\s*>\s*\*|details\s*\{/, '参考答案等折叠区在打印时需展开');
});

test('深浅主题 token 成对定义，且 data-theme 覆盖优先于系统偏好', () => {
  assert.match(css, /:root\s*\{[\s\S]*--bg/);
  assert.match(css, /@media\s*\(prefers-color-scheme:\s*dark\)[\s\S]*:root:not\(\[data-theme="light"\]\)/);
  assert.match(css, /:root\[data-theme="dark"\]/);
});

test('存在 ≤400px 的窄屏规则且无横向溢出来源', () => {
  assert.match(css, /@media\s*\(max-width:\s*(400|4\d\dpx|480px|600px)/);
  assert.doesNotMatch(css, /min-width:\s*(7|8|9|1\d)\d\dpx/);
  assert.match(css, /table[\s\S]*overflow-x:\s*auto|\.table-wrap[\s\S]*overflow-x:\s*auto/);
});

test('无 JS 时两轨都可见：不存在无条件隐藏 .track 的规则', () => {
  // 注意：这一条不能用单条正则表达——"隐藏 .track 的规则"与"唯一允许的 .js-on .track 规则"
  // 在正则层面互相包含。改为逐条规则解析：凡是把 .track 设成 display:none 的规则，
  // 其选择器必须带 .js-on 限定符。
  const offenders = [];
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selector = m[1].trim();
    const body = m[2];
    if (!/\.track\b/.test(selector)) continue;
    if (!/display\s*:\s*none/.test(body)) continue;
    if (!/\.js-on\b/.test(selector)) offenders.push(selector);
  }
  assert.deepEqual(offenders, [], '这些规则会在无 JS 时吃掉半份教程');
  assert.match(css, /\.js-on\s+\.track:not\(\.is-active\)\s*\{[^}]*display\s*:\s*none/);
});

test('打印时两轨强制展开', () => {
  assert.match(css, /@media\s+print[\s\S]*\.track\s*\{[^}]*display\s*:\s*block\s*!important/);
});

test('nextTheme 在 light/dark 间切换', () => {
  assert.equal(nextTheme('light'), 'dark');
  assert.equal(nextTheme('dark'), 'light');
});

test('构建产物不引用任何本地外部资源', async () => {
  const html = await build(root);
  assert.doesNotMatch(html, /(src|href)="(?!#|https:)[^"]+\.(css|js|svg|png|jpg|woff2?)"/);
});
