// 可移植性守卫。
//
// 这个仓库已经两次因为"在我机器上能跑"而让 CI 变红：
//   1. package.json 里 `node --test tests/`（目录形式）在 Node 22 上不支持
//   2. src/render/interp.mjs 里带了一条 /Users/... 的绝对路径 import
// 两次的共同点是本机构建和本机测试都全绿，问题只在别人的机器上出现。
// 下面这些检查专门盯这一类：它们在本机就能发现本机发现不了的东西。

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

async function sourceFiles() {
  const out = [];
  const walk = async (dir) => {
    for (const ent of await readdir(dir, { withFileTypes: true })) {
      if (ent.name.startsWith('.') || ent.name === 'node_modules') continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) await walk(full);
      else if (/\.(mjs|js)$/.test(ent.name)) out.push(full);
    }
  };
  for (const d of ['src', 'tests']) await walk(path.join(root, d));
  return out;
}

// 绝对路径 import 在作者机器上解析得了，别人克隆就断。
const ABSOLUTE_IMPORT = /\b(?:from|import)\s*\(?\s*['"](\/(?:Users|home|var|opt)\/[^'"]*|[A-Za-z]:\\[^'"]*)['"]/;

test('源码里没有绝对路径 import', async () => {
  const bad = [];
  // 本文件自己排除：下面那条反向测试里放着故意写坏的样例字符串，
  // 不排除的话规则会抓住自己的测试样例。
  const SELF = path.relative(root, new URL(import.meta.url).pathname);
  for (const f of await sourceFiles()) {
    if (path.relative(root, f) === SELF) continue;
    const src = await readFile(f, 'utf8');
    src.split('\n').forEach((line, i) => {
      const m = line.match(ABSOLUTE_IMPORT);
      if (m) bad.push(`${path.relative(root, f)}:${i + 1} → ${m[1]}`);
    });
  }
  assert.deepEqual(bad, [], `绝对路径 import 只在作者机器上有效:\n${bad.join('\n')}`);
});

test('绝对路径 import 确实会被这条规则抓到', () => {
  // 断言本身必须会失败，否则它只是装饰
  assert.ok(ABSOLUTE_IMPORT.test("import { x } from '/Users/someone/proj/src/a.mjs';"));
  assert.ok(ABSOLUTE_IMPORT.test('import("/home/runner/x.mjs")'));
  assert.ok(ABSOLUTE_IMPORT.test("from 'C:\\\\proj\\\\a.mjs'"));
  assert.ok(!ABSOLUTE_IMPORT.test("import { x } from './skeleton.mjs';"));
  assert.ok(!ABSOLUTE_IMPORT.test("import path from 'node:path';"));
});

test('npm test 用显式 glob 而不是目录形式', async () => {
  // Node 22 不支持 `node --test <目录>`，本机的新版 Node 支持，
  // 于是这个差异只会在 CI 上炸。
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  for (const name of ['test', 'check']) {
    const cmd = pkg.scripts?.[name] ?? '';
    if (!cmd.includes('--test')) continue;
    assert.ok(!/--test\s+tests\/?\s*$/.test(cmd),
      `scripts.${name} 用了目录形式「${cmd}」，Node 22 跑不了，应写成 tests/*.test.mjs`);
  }
});

test('CI 的 Node 版本是固定的，差异至少是可知的', async () => {
  // 本来想断言「本机 Node 不高于 CI」，但那条写反了：真实情况是本机 26、
  // CI 22，本机**更新**正是问题所在——新版支持 `node --test <目录>`，
  // 于是本机全绿而 CI 炸。而本机版本不是这个仓库能规定的东西。
  // 能断言的只有：CI 版本必须钉死，不能写 latest。钉死了差异才是可知的，
  // 才有上面那条 glob 规则这种针对具体差异的检查。
  const wf = await readFile(path.join(root, '.github/workflows/deploy.yml'), 'utf8');
  const m = wf.match(/node-version:\s*'?([^\s'"]+)/);
  assert.ok(m, 'deploy.yml 应当声明 node-version');
  assert.match(m[1], /^\d+/, `node-version 应钉死大版本，实际是「${m[1]}」`);
});

test('动画脚本的拼接清单是依赖闭包', async () => {
  // 漏掉一个依赖不会让拼接后的脚本编译失败——它只在浏览器里抛 ReferenceError，
  // 动画格静默空着而页面其余部分照常，构建和测试都发现不了。
  // 这个测试独立于构建再算一遍闭包。（真实发生过：skeleton.mjs 新增了
  // facing.mjs 的 import，清单没跟上，全部 49 格动画一起变空白。）
  const build = await readFile(path.join(root, 'src/build.mjs'), 'utf8');
  const list = build.match(/const ANIM_MODULES = \[([\s\S]*?)\];/)?.[1];
  assert.ok(list, 'build.mjs 里找不到 ANIM_MODULES');
  const mods = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(mods.length >= 3, 'ANIM_MODULES 解析结果不合理');
  const included = new Set(mods.map((f) => path.resolve(root, f)));
  const missing = [];
  for (const f of mods) {
    const src = await readFile(path.join(root, f), 'utf8');
    for (const m of src.matchAll(/^import .*? from '(\.[^']+)';$/gm)) {
      const dep = path.resolve(path.dirname(path.join(root, f)), m[1]);
      if (!included.has(dep)) missing.push(`${f} → ${m[1]}`);
    }
  }
  assert.deepEqual(missing, [], `这些依赖没进 ANIM_MODULES:\n${missing.join('\n')}`);
});
