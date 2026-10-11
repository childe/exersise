# 系统化健身知识教程 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个零依赖、可脚本验收的内容流水线，产出单文件静态网页 `dist/index.html`——双轨（11 章学习路径 ⇄ 动作库/计划模板参考库）、全站结论带「方向·确定性」证据标签、可筛选、可分享锚点、深浅主题、移动端与打印可用。

**Architecture:** 内容与结构分离。所有结构化内容写进 `data/*.json`（结论登记表、动作卡、计划模板、示范来源、情境题），叙述性内容写成 `content/ch*.html` 片段（含 `{{claim:…}}` / `{{ex:…}}` / `{{fig:…}}` 占位符）。`src/validate/*.mjs` 是先于内容存在的验收闸门（§9.1 的每一条都对应一个可执行检查）；`src/build.mjs` 加载 → 校验 → 渲染，把 CSS/JS/SVG 全部内联成单个 HTML 文件。先建管道与校验器，再灌内容——这样每一批内容进仓库时都被同一套规则挡一次。

**Tech Stack:** Node.js ≥ 22（本机 v26.11.1）、ESM、`node:test` + `node:assert/strict` 内置测试运行器、零 npm 运行时依赖；发布走 Artifact 工具（单文件 HTML）。

**Spec:** `docs/superpowers/specs/2026-10-11-fitness-guide-design.md`

## Global Constraints

- **零运行时依赖**：`package.json` 的 `dependencies` 与 `devDependencies` 必须为空对象；测试用 `node --test`，不引入 jest/vitest/markdown 库。
- **产物是单文件**：`dist/index.html` 自包含——CSS、JS、SVG 全部内联，不引用任何本地相对资源；唯一允许的外部 URL 是 `data/claims.json` / `data/demos.json` 中的来源与示范链接（以 `<a href>` 形式出现，不作资源加载）。
- **锚点命名固定且永不重命名**：`#ch<N>`（N = 0–10）、`#ex-<slug>`、`#plan-<slug>`、`#claim-<id>`；slug 只允许 `[a-z0-9-]`。
- **证据标签只有两维**：`direction ∈ {支持, 反对, 未定}`，`certainty ∈ {高, 中, 低}`，展示为 `方向·确定性`（如 `支持·高`）。不得出现 A/B/C/D 或任何一维分级。
- **单一事实源**：正文、动作卡、图注一律通过 claim id 引用 `data/claims.json`，不得在别处重新写方向或确定性。
- **安全红线（全站文本级禁止）**：不得出现任何"不上卡扣/免卡扣/不用卡扣"的建议；不得用 deload、减量、"换同模式动作"作为疼痛的处理方案；疼痛一律导向"停止该动作 + 第 9 章就医判断"。
- **不含 AI 生成的动作或解剖示意图**；概念图一律人工编写的内联 SVG。
- **全站不含任何个人健康数据**（链接外泄即公开）。
- **排除范围**：食谱餐单、补剂品牌、竞技专项技术、体型评级、个性化诊断处方、商业带训/教练认证级内容。
- **git 提交身份**（公司 GitLab 要求）：`git config user.email childe@ctrip.com && git config user.name "vlj刘佳(IT)"`。
- 不执行 `git push`、不创建 MR——由编排器统一处理。

## Review Focus

以下五类输入/失败模式规范隐含但没有任何一条内容任务天然覆盖，每条都已挂到拥有对应代码的任务上，以该任务的步骤风格补测：

1. **URL 里带着一个已不存在的锚点**（旧链接、手打错字、`#ex-不存在`）——页面必须正常渲染并给出"未找到该条目"的提示和回到目录的入口，而不是白屏或默认静默落回首章。→ Task 7。
2. **筛选条件组合后结果为空**（例如"固定器械 + 搬运 + 入门"无交集）——必须显示空状态文案与"清除筛选"按钮，而不是一片空白让人以为页面坏了。→ Task 8。
3. **JavaScript 不可用或打印时，被轨道切换器隐藏的那一半内容**——双轨是用 JS 切换的，默认隐藏态若只靠 JS 解除，无 JS 读者和打印/PDF 会永久丢失半份教程。两轨内容必须在无 JS 与打印下都完整呈现。→ Task 9。
4. **数据文件缺字段、claim id 拼错、动作卡引用了不存在的章节锚点**——构建必须带着文件名与字段路径失败退出（非零退出码），绝不静默产出残页。→ Task 2、Task 3。
5. **外部示范链接失效**——必须降级为"文字 + 判据 + 失效提示"并在检查中可见地报出，不留死链；且链接检查在离线环境下只报"未检查"不报"通过"。→ Task 6。

---

## File Structure

```
package.json                    # type=module, scripts, 零依赖
src/build.mjs                   # 入口：load → validate → render → dist/index.html
src/data.mjs                    # 读取并校验全部 data/*.json，任一失败即抛
src/validate/claims.mjs         # 结论登记表校验（§4.3 / §9.1-4）
src/validate/exercises.mjs      # 动作卡 13 字段 + 覆盖矩阵（§6.1 / §9.1-2）
src/validate/plans.mjs          # 计划模板 11 字段（§6.2 / §9.1-3）
src/validate/demos.mjs          # 示范来源登记与许可（§7.2 / §9.1-9）
src/validate/quiz.mjs           # 情境题四类各 ≥3、总数 ≥12（§9.2）
src/validate/chapters.mjs       # 0–10 章齐备、自测清单 + 练习任务 + 参考答案（§9.1-1）
src/validate/safety.mjs         # 安全红线全站文本扫描（§9.3-11）
src/validate/figures.mjs        # SVG 刻度/图注/viewBox 规则（§7.4 / §9.1-8）
src/validate/links.mjs          # 内部锚点完整性 + 外部链接可达性（§9.1-7）
src/render/page.mjs             # 页面骨架、内联 CSS/JS 组装
src/render/tokens.mjs           # {{claim:}} {{ex:}} {{plan:}} {{fig:}} 占位符展开
src/render/chapters.mjs         # 学习路径轨渲染
src/render/exercises.mjs        # 动作卡渲染 + 筛选器 facet
src/render/plans.mjs            # 计划模板渲染 + 筛选器 facet
src/render/claims.mjs           # 证据标签与结论登记表区块渲染
src/assets/styles.css           # 主题 token、布局、响应式、打印样式
src/assets/app.js               # 轨道切换、hash 路由、筛选、主题切换
assets/figures/*.svg            # 四张概念图（人工编写）
data/claims.json                # 结论登记表（单一事实源）
data/exercises.json             # 动作卡数组
data/plans.json                 # 5 套计划模板
data/demos.json                 # 示范来源登记
data/quiz.json                  # §9.2 情境题
content/chapters.json           # 章节清单（号、标题、文件、依赖）
content/ch0.html … ch10.html    # 11 章正文片段
tests/*.test.mjs                # 与 src/validate、src/render 一一对应
docs/acceptance/                # 人工验收记录（§9.3 第 10–13 条）
```

---

### Task 1: 项目骨架与构建管道

**Files:**
- Create: `package.json`, `src/build.mjs`, `src/data.mjs`, `src/render/page.mjs`, `src/assets/styles.css`, `src/assets/app.js`, `content/chapters.json`, `.gitignore`（追加 `dist/`）
- Test: `tests/build.test.mjs`

**Interfaces:**
- Consumes: 无
- Produces:
  - `src/data.mjs`：`export async function loadData(root): Promise<{claims, exercises, plans, demos, quiz, chapters}>`，任一数据文件缺失或非法时 `throw new Error('<file>: <字段路径>: <原因>')`
  - `src/render/page.mjs`：`export function renderPage(data, { css, js, chapterHtml, exerciseHtml, planHtml, claimHtml, quizHtml }): string`
  - `src/build.mjs`：`export async function build(root = <repo root>): Promise<string>`，返回完整 HTML 并写入 `dist/index.html`

- [ ] **Step 1: 配置 git 身份（公司 GitLab pre-receive 要求）**

```bash
cd "$(git rev-parse --show-toplevel)"
git config user.email childe@ctrip.com
git config user.name "vlj刘佳(IT)"
```

- [ ] **Step 2: 写失败测试**

`tests/build.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from '../src/build.mjs';

const root = path.resolve(import.meta.dirname, '..');

test('build 产出自包含单文件', async () => {
  const html = await build(root);
  const onDisk = await readFile(path.join(root, 'dist/index.html'), 'utf8');
  assert.equal(html, onDisk);
  assert.match(html, /<title>系统化健身知识教程<\/title>/);
  // CSS 与 JS 必须内联：不得出现指向本地文件的 link/script src
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
```

- [ ] **Step 3: 运行测试确认失败**

Run: `node --test tests/build.test.mjs`
Expected: FAIL — `Cannot find module '../src/build.mjs'`

- [ ] **Step 4: 写 package.json**

```json
{
  "name": "fitness-guide",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "node src/build.mjs",
    "test": "node --test tests/",
    "check": "node --test tests/",
    "check:links": "node src/validate/links.mjs --external"
  },
  "dependencies": {},
  "devDependencies": {}
}
```

- [ ] **Step 5: 写 content/chapters.json（11 章清单，正文留到后续任务）**

```json
[
  { "num": 0,  "id": "ch0",  "title": "导读",            "file": "ch0.html",  "deps": [] },
  { "num": 1,  "id": "ch1",  "title": "肌肉为什么会长",  "file": "ch1.html",  "deps": [] },
  { "num": 2,  "id": "ch2",  "title": "训练变量",        "file": "ch2.html",  "deps": [1] },
  { "num": 3,  "id": "ch3",  "title": "渐进超负荷与适应", "file": "ch3.html",  "deps": [1, 2] },
  { "num": 4,  "id": "ch4",  "title": "动作模式与功能解剖", "file": "ch4.html", "deps": [1] },
  { "num": 5,  "id": "ch5",  "title": "计划构建",        "file": "ch5.html",  "deps": [2, 3, 4] },
  { "num": 6,  "id": "ch6",  "title": "营养",            "file": "ch6.html",  "deps": [1, 3] },
  { "num": 7,  "id": "ch7",  "title": "恢复与疲劳",      "file": "ch7.html",  "deps": [3] },
  { "num": 8,  "id": "ch8",  "title": "有氧与心肺",      "file": "ch8.html",  "deps": [2, 5, 7] },
  { "num": 9,  "id": "ch9",  "title": "伤病预防与疼痛",  "file": "ch9.html",  "deps": [4, 7] },
  { "num": 10, "id": "ch10", "title": "指导他人基础",    "file": "ch10.html", "deps": [1,2,3,4,5,6,7,8,9] }
]
```

- [ ] **Step 6: 写 src/data.mjs（本任务只做加载与"文件存在/可解析"，字段校验在后续任务接入）**

```js
import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function readJson(root, rel) {
  const file = path.join(root, rel);
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    throw new Error(`${rel}: 无法读取 (${err.code})`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${rel}: JSON 解析失败 — ${err.message}`);
  }
}

export async function loadData(root) {
  const [claims, exercises, plans, demos, quiz, chapters] = await Promise.all([
    readJson(root, 'data/claims.json'),
    readJson(root, 'data/exercises.json'),
    readJson(root, 'data/plans.json'),
    readJson(root, 'data/demos.json'),
    readJson(root, 'data/quiz.json'),
    readJson(root, 'content/chapters.json'),
  ]);
  return { claims, exercises, plans, demos, quiz, chapters };
}
```

- [ ] **Step 7: 建最小数据文件，让管道跑通**

```bash
cd "$(git rev-parse --show-toplevel)"
mkdir -p data
printf '[]\n' > data/claims.json
printf '[]\n' > data/exercises.json
printf '[]\n' > data/plans.json
printf '[]\n' > data/demos.json
printf '[]\n' > data/quiz.json
```

- [ ] **Step 8: 写 src/render/page.mjs**

```js
export function renderPage(data, parts) {
  const { css, js, chapterHtml = '', exerciseHtml = '', planHtml = '',
          claimHtml = '', quizHtml = '' } = parts;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>系统化健身知识教程</title>
<style>${css}</style>
</head>
<body>
<header class="site-head">
  <h1>系统化健身知识教程</h1>
  <nav class="track-switch" role="tablist" aria-label="轨道切换">
    <button role="tab" data-track="learn" aria-selected="true">学习路径</button>
    <button role="tab" data-track="ref" aria-selected="false">参考库</button>
  </nav>
  <button class="theme-toggle" type="button" aria-label="切换深浅主题">主题</button>
</header>
<main>
  <section id="track-learn" class="track" data-track="learn">${chapterHtml}${quizHtml}</section>
  <section id="track-ref" class="track" data-track="ref">${exerciseHtml}${planHtml}${claimHtml}</section>
</main>
<script>${js}</script>
</body>
</html>
`;
}
```

- [ ] **Step 9: 写 src/build.mjs**

```js
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadData } from './data.mjs';
import { renderPage } from './render/page.mjs';

const defaultRoot = path.resolve(import.meta.dirname, '..');

export async function build(root = defaultRoot) {
  const data = await loadData(root);
  const css = await readFile(path.join(root, 'src/assets/styles.css'), 'utf8');
  const js = await readFile(path.join(root, 'src/assets/app.js'), 'utf8');
  const html = renderPage(data, { css, js });
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await writeFile(path.join(root, 'dist/index.html'), html, 'utf8');
  return html;
}

if (process.argv[1] === path.resolve(new URL(import.meta.url).pathname)) {
  build().catch((err) => {
    console.error(`构建失败: ${err.message}`);
    process.exit(1);
  });
}
```

- [ ] **Step 10: 写占位样式与脚本（后续任务填充）**

`src/assets/styles.css`：

```css
:root {
  color-scheme: light dark;
  --bg: #fcfcfa;
  --fg: #1b1b1a;
  --muted: #5d5d58;
  --rule: #d9d8d2;
  --accent: #7a4a1e;
}
body { margin: 0; background: var(--bg); color: var(--fg);
  font: 16px/1.7 system-ui, -apple-system, "PingFang SC", "Noto Sans CJK SC", sans-serif; }
```

`src/assets/app.js`：

```js
// 轨道切换、hash 路由、筛选、主题切换在 Task 7/8/9 中实现。
```

- [ ] **Step 11: 运行测试确认通过**

Run: `node --test tests/build.test.mjs`
Expected: PASS（2 项）

- [ ] **Step 12: 提交**

```bash
cd "$(git rev-parse --show-toplevel)"
printf 'dist/\nnode_modules/\n' >> .gitignore
git add package.json src content data tests .gitignore
git commit -m "feat: 构建管道骨架与单文件产出"
```

---

### Task 2: 结论登记表与证据标签

**Files:**
- Create: `src/validate/claims.mjs`, `src/render/claims.mjs`, `src/render/tokens.mjs`
- Modify: `src/data.mjs`（接入校验）, `src/build.mjs`（渲染结论区块）, `data/claims.json`
- Test: `tests/claims.test.mjs`, `tests/tokens.test.mjs`

**Interfaces:**
- Consumes: Task 1 的 `loadData(root)`、`renderPage(data, parts)`
- Produces:
  - `src/validate/claims.mjs`：`export function validateClaims(claims): string[]`（返回错误信息数组，空数组=通过）
  - `src/render/claims.mjs`：`export function renderClaimTag(claim): string`（`<a class="claim-tag" href="#claim-<id>" data-direction data-certainty>方向·确定性</a>`）、`export function renderClaimRegistry(claims): string`
  - `src/render/tokens.mjs`：`export function expandTokens(html, ctx): string`，`ctx = { claims: Map, exercises: Map, plans: Map, figures: Map }`；未知 id 抛 `Error`

- [ ] **Step 1: 写失败测试**

`tests/claims.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateClaims } from '../src/validate/claims.mjs';
import { renderClaimTag } from '../src/render/claims.mjs';

const ok = {
  id: 'claim-protein-threshold',
  statement: '以增肌为目标时每日蛋白质摄入约 1.6 g/kg 体重后收益趋平。',
  direction: '支持',
  certainty: '高',
  sources: [{ authors: 'Morton 等', year: 2018, title: '系统综述与剂量反应荟萃分析',
              type: '系统综述', url: 'https://bjsm.bmj.com/content/52/6/376' }],
  population: '健康成年抗阻训练者，男女均有；可外推到本教程读者',
  limitations: '多数研究周期 6–12 周；高龄与极低能量摄入人群外推受限',
  rating_rationale: '多项 RCT 的剂量反应荟萃结论一致，拐点估计稳定',
};

test('合法 claim 通过', () => {
  assert.deepEqual(validateClaims([ok]), []);
});

test('方向与确定性只接受规定取值', () => {
  const bad = { ...ok, id: 'claim-x', direction: 'A', certainty: '很高' };
  const errs = validateClaims([bad]);
  assert.ok(errs.some((e) => e.includes('direction')));
  assert.ok(errs.some((e) => e.includes('certainty')));
});

test('无来源的 claim 被拒', () => {
  const errs = validateClaims([{ ...ok, id: 'claim-y', sources: [] }]);
  assert.ok(errs.some((e) => e.includes('sources')));
});

test('来源缺年份/人群/局限/分级理由被拒', () => {
  const { population, limitations, rating_rationale, ...stripped } = ok;
  const errs = validateClaims([{ ...stripped, id: 'claim-z' }]);
  for (const f of ['population', 'limitations', 'rating_rationale']) {
    assert.ok(errs.some((e) => e.includes(f)), `应报告缺失字段 ${f}`);
  }
});

test('重复 id 被拒', () => {
  const errs = validateClaims([ok, ok]);
  assert.ok(errs.some((e) => e.includes('重复')));
});

test('id 必须是 claim- 前缀的小写 slug', () => {
  const errs = validateClaims([{ ...ok, id: '蛋白质' }]);
  assert.ok(errs.some((e) => e.includes('id')));
});

test('标签渲染为 方向·确定性', () => {
  assert.match(renderClaimTag(ok), /支持·高/);
  assert.match(renderClaimTag(ok), /href="#claim-protein-threshold"/);
});
```

`tests/tokens.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { expandTokens } from '../src/render/tokens.mjs';

const ctx = {
  claims: new Map([['claim-a', { id: 'claim-a', direction: '反对', certainty: '高' }]]),
  exercises: new Map([['back-squat-high-bar', { slug: 'back-squat-high-bar', name_zh: '高杠背蹲' }]]),
  plans: new Map([['novice-3d', { slug: 'novice-3d', title: '新手全身 3 天' }]]),
  figures: new Map([['sra-curve', '<svg data-fig="sra-curve"></svg>']]),
};

test('claim 占位符展开为标签', () => {
  assert.match(expandTokens('局部减脂{{claim:claim-a}}', ctx), /反对·高/);
});

test('动作与模板占位符展开为锚点链接', () => {
  assert.match(expandTokens('{{ex:back-squat-high-bar}}', ctx), /href="#ex-back-squat-high-bar"/);
  assert.match(expandTokens('{{plan:novice-3d}}', ctx), /href="#plan-novice-3d"/);
});

test('图占位符内联 SVG', () => {
  assert.match(expandTokens('{{fig:sra-curve}}', ctx), /<svg data-fig="sra-curve">/);
});

test('未知 id 让构建失败而不是静默留空', () => {
  assert.throws(() => expandTokens('{{claim:claim-nope}}', ctx), /claim-nope/);
  assert.throws(() => expandTokens('{{ex:nope}}', ctx), /nope/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/claims.test.mjs tests/tokens.test.mjs`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现 src/validate/claims.mjs**

```js
const DIRECTIONS = new Set(['支持', '反对', '未定']);
const CERTAINTIES = new Set(['高', '中', '低']);
const SOURCE_TYPES = new Set(['系统综述', 'RCT', '观察', '机制', '指南']);
const ID_RE = /^claim-[a-z0-9-]+$/;

export function validateClaims(claims) {
  const errs = [];
  if (!Array.isArray(claims)) return ['data/claims.json: 顶层必须是数组'];
  const seen = new Set();
  claims.forEach((c, i) => {
    const at = `data/claims.json[${i}] (${c?.id ?? '无 id'})`;
    if (!ID_RE.test(c?.id ?? '')) errs.push(`${at}: id 必须匹配 ${ID_RE}`);
    else if (seen.has(c.id)) errs.push(`${at}: id 重复`);
    else seen.add(c.id);
    if (!c?.statement || c.statement.length < 6) errs.push(`${at}: statement 必填且需成句`);
    if (!DIRECTIONS.has(c?.direction)) errs.push(`${at}: direction 必须是 支持/反对/未定`);
    if (!CERTAINTIES.has(c?.certainty)) errs.push(`${at}: certainty 必须是 高/中/低`);
    for (const f of ['population', 'limitations', 'rating_rationale']) {
      if (!c?.[f]) errs.push(`${at}: ${f} 必填`);
    }
    const sources = c?.sources;
    if (!Array.isArray(sources) || sources.length === 0) {
      errs.push(`${at}: sources 至少 1 条`);
    } else {
      sources.forEach((s, j) => {
        const sat = `${at}.sources[${j}]`;
        if (!s.authors) errs.push(`${sat}: authors 必填`);
        if (!Number.isInteger(s.year)) errs.push(`${sat}: year 必须是整数年份`);
        if (!s.title) errs.push(`${sat}: title 必填`);
        if (!SOURCE_TYPES.has(s.type)) errs.push(`${sat}: type 必须是 ${[...SOURCE_TYPES].join('/')}`);
        if (!/^https?:\/\//.test(s.url ?? '')) errs.push(`${sat}: url 必须是可访问的 http(s) 链接或 DOI 链接`);
      });
    }
    if (c?.safety === true) {
      const okSource = (c.sources ?? []).some((s) =>
        ['系统综述', '指南'].includes(s.type) ||
        /acsm|nsca|who|aaos|bjsm|nih/i.test(s.url ?? ''));
      if (!okSource) errs.push(`${at}: safety=true 的结论来源必须是公开文献或权威机构指南（§4.3 更高门槛）`);
    }
  });
  return errs;
}
```

- [ ] **Step 4: 实现 src/render/claims.mjs**

```js
export function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function renderClaimTag(claim) {
  const label = `${claim.direction}·${claim.certainty}`;
  return `<a class="claim-tag" href="#claim-${claim.id}" data-direction="${claim.direction}"` +
    ` data-certainty="${claim.certainty}" title="${escapeHtml(claim.statement ?? '')}">${label}</a>`;
}

export function renderClaimRegistry(claims) {
  const items = claims.map((c) => `
<article class="claim-entry" id="claim-${c.id}">
  <h3>${escapeHtml(c.statement)} ${renderClaimTag(c)}</h3>
  <dl>
    <dt>分级理由</dt><dd>${escapeHtml(c.rating_rationale)}</dd>
    <dt>研究人群</dt><dd>${escapeHtml(c.population)}</dd>
    <dt>已知局限</dt><dd>${escapeHtml(c.limitations)}</dd>
    <dt>来源</dt><dd><ul>${c.sources.map((s) =>
      `<li>${escapeHtml(s.authors)}（${s.year}）《${escapeHtml(s.title)}》[${escapeHtml(s.type)}]
        <a href="${escapeHtml(s.url)}" rel="noreferrer noopener" target="_blank">${escapeHtml(s.url)}</a></li>`).join('')}</ul></dd>
  </dl>
</article>`).join('\n');
  return `<section id="claims" class="claim-registry"><h2>结论登记表</h2>${items}</section>`;
}
```

- [ ] **Step 5: 实现 src/render/tokens.mjs**

```js
import { renderClaimTag, escapeHtml } from './claims.mjs';

const TOKEN_RE = /\{\{(claim|ex|plan|fig):([a-z0-9-]+)\}\}/g;

export function expandTokens(html, ctx) {
  return html.replace(TOKEN_RE, (_m, kind, id) => {
    if (kind === 'claim') {
      const claim = ctx.claims.get(id);
      if (!claim) throw new Error(`未知 claim id: ${id}`);
      return renderClaimTag(claim);
    }
    if (kind === 'ex') {
      const ex = ctx.exercises.get(id);
      if (!ex) throw new Error(`未知动作 slug: ${id}`);
      return `<a class="xref" href="#ex-${id}">${escapeHtml(ex.name_zh)}</a>`;
    }
    if (kind === 'plan') {
      const plan = ctx.plans.get(id);
      if (!plan) throw new Error(`未知模板 slug: ${id}`);
      return `<a class="xref" href="#plan-${id}">${escapeHtml(plan.title)}</a>`;
    }
    const svg = ctx.figures.get(id);
    if (!svg) throw new Error(`未知概念图: ${id}`);
    return svg;
  });
}
```

- [ ] **Step 6: 用 3 条真实 claim 填 data/claims.json**

写入 3 条（覆盖三种方向各一条，证明分级装置可用；其余 claim 随章节内容逐步增补）：`claim-protein-threshold`（支持·高，Morton 2018）、`claim-spot-reduction`（反对·高，局部减脂，safety=false，用 Ramírez-Campillo 或 Vispute 2011 一类 RCT）、`claim-stretch-timing`（未定·低，训练前静态拉伸时机对肥大的影响，写明"目前没有足够研究"）。每条字段按 Step 3 的校验齐备；`claim-spot-reduction` 的 statement 写成被否定的说法本身（"针对某部位的训练能优先消耗该部位脂肪"），方向标 `反对`。

- [ ] **Step 7: 把校验接进 src/data.mjs**

在 `loadData` 末尾、`return` 之前插入：

```js
import { validateClaims } from './validate/claims.mjs';
// ...
  const errs = [...validateClaims(claims)];
  if (errs.length) throw new Error(`数据校验失败:\n- ${errs.join('\n- ')}`);
```

- [ ] **Step 8: 在 build 中渲染结论登记表**

`src/build.mjs` 中 `renderPage` 调用改为：

```js
import { renderClaimRegistry } from './render/claims.mjs';
// ...
  const html = renderPage(data, { css, js, claimHtml: renderClaimRegistry(data.claims) });
```

- [ ] **Step 9: 运行全部测试与构建**

Run: `node --test tests/` 然后 `node src/build.mjs`
Expected: 全部 PASS；`dist/index.html` 中出现 `id="claim-protein-threshold"` 与 `支持·高`

- [ ] **Step 10: 提交**

```bash
cd "$(git rev-parse --show-toplevel)"
git add src/validate/claims.mjs src/render/claims.mjs src/render/tokens.mjs src/data.mjs src/build.mjs data/claims.json tests/claims.test.mjs tests/tokens.test.mjs
git commit -m "feat: 结论登记表校验与证据标签渲染"
```

---

### Task 3: 动作卡 13 字段校验与覆盖矩阵

**Files:**
- Create: `src/validate/exercises.mjs`, `src/render/exercises.mjs`
- Modify: `src/data.mjs`, `src/build.mjs`, `data/exercises.json`
- Test: `tests/exercises.test.mjs`

**Interfaces:**
- Consumes: Task 2 的 `validateClaims` 模式（返回错误数组）、`escapeHtml`
- Produces:
  - `export function validateExercises(exercises, { claims, demos, chapters }): string[]`
  - `export function validateCoverage(exercises): string[]`（§2 覆盖矩阵，内容灌满前会报错，Task 11/12 之后必须为空）
  - `export function renderExercises(exercises, ctx): string`
  - 动作卡数据契约（后续所有任务按此写卡）：

```js
{
  slug: 'back-squat-high-bar',           // 锚点 #ex-back-squat-high-bar
  name_zh: '高杠背蹲', name_en: 'High-Bar Back Squat',   // 字段 1
  pattern: '蹲', laterality: '双侧',                      // 字段 2
  muscles: { prime: ['股四头','臀大肌'], synergist: ['内收肌'], stabilizer: ['竖脊肌','核心'] }, // 字段 3
  equipment: '杠铃',                                      // 字段 4：杠铃/哑铃/固定器械/自重/弹力带
  cues: [{ phase: '设置', text: '…' }, { phase: '发力', text: '…' }, { phase: '收尾', text: '…' }], // 字段 5，3–5 条
  mistakes: [{ error: '…', consequence: '…' }],           // 字段 6
  self_checks: [{ criterion: '…', how: '…', cannot: '…' }], // 字段 7，2–4 条，必填
  audience: { suitable: '…', cautions: '…' },             // 字段 8
  home_alts: ['goblet-squat'],                            // 字段 9，1–2 个 slug
  difficulty: '入门',                                      // 字段 10：入门/进阶
  safety: { rack: '…', collars: '两侧卡扣必须上紧', setup: '…',
            solo_ok: true, solo_alt: null, bailout: '…' }, // 字段 11，必填
  demo_id: 'demo-back-squat-high-bar',                    // 字段 12，重点动作必填，其余可 null
  chapter_refs: ['ch4', 'ch5'],                           // 字段 13，≥1
  claim_refs: ['claim-…']                                 // 可选：卡上引用的结论
}
```

- [ ] **Step 1: 写失败测试**

`tests/exercises.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateExercises, validateCoverage } from '../src/validate/exercises.mjs';

const root = path.resolve(import.meta.dirname, '..');
const ctx = { claims: new Set(), demos: new Set(['demo-x']), chapters: new Set(['ch4','ch5']) };

const card = {
  slug: 'back-squat-high-bar', name_zh: '高杠背蹲', name_en: 'High-Bar Back Squat',
  pattern: '蹲', laterality: '双侧',
  muscles: { prime: ['股四头'], synergist: ['臀'], stabilizer: ['核心'] },
  equipment: '杠铃',
  cues: [{ phase: '设置', text: '杠置于斜方肌上缘形成的肉垫' },
         { phase: '发力', text: '髋膝同步下沉，杠走足中线铅垂线' },
         { phase: '收尾', text: '站直后退回挂钩，不在负重下转身' }],
  mistakes: [{ error: '起身时髋先走', consequence: '躯干前倾加大，腰段力矩上升' }],
  self_checks: [{ criterion: '杠在足中线正上方', how: '正侧面视频逐帧看', cannot: '镜头有角度偏差时会误判' },
                { criterion: '脊柱在中立范围内', how: '看腰胸段曲度是否突然塌陷', cannot: '体表看不到脊柱实际位置' }],
  audience: { suitable: '无急性腰膝症状、已练过退出方式的读者', cautions: '出现疼痛先停止该动作，按第 9 章判断' },
  home_alts: ['goblet-squat'], difficulty: '入门',
  safety: { rack: '保护杆高度用空杆实测，低于最低位 2–3 cm', collars: '两侧卡扣必须上紧',
            setup: '挂钩略低于站立肩高', solo_ok: true, solo_alt: null,
            bailout: '做不动就把杠往保护杆上坐，不要硬撑' },
  demo_id: 'demo-x', chapter_refs: ['ch4'], claim_refs: [],
};

test('合法动作卡通过', () => {
  assert.deepEqual(validateExercises([card], ctx), []);
});

test('字段 7 自检判据为空的动作不进库', () => {
  const errs = validateExercises([{ ...card, self_checks: [] }], ctx);
  assert.ok(errs.some((e) => e.includes('self_checks')));
});

test('字段 11 安全设置为空的动作不进库', () => {
  const { safety, ...noSafety } = card;
  const errs = validateExercises([noSafety], ctx);
  assert.ok(errs.some((e) => e.includes('safety')));
});

test('solo_ok=false 必须给出替代动作', () => {
  const errs = validateExercises([{ ...card, safety: { ...card.safety, solo_ok: false, solo_alt: null } }], ctx);
  assert.ok(errs.some((e) => e.includes('solo_alt')));
});

test('卡扣字段出现任何免卡扣表述即失败', () => {
  const errs = validateExercises([{ ...card, safety: { ...card.safety, collars: '轻重量可以不上卡扣' } }], ctx);
  assert.ok(errs.some((e) => e.includes('卡扣')));
});

test('引用不存在的章节锚点被拒', () => {
  const errs = validateExercises([{ ...card, chapter_refs: ['ch99'] }], ctx);
  assert.ok(errs.some((e) => e.includes('ch99')));
});

test('home_alts 指向库内不存在的 slug 被拒', () => {
  const errs = validateExercises([{ ...card, home_alts: ['nope'] }], ctx);
  assert.ok(errs.some((e) => e.includes('nope')));
});

test('覆盖矩阵未填满时报出缺口格子', () => {
  const errs = validateCoverage([card]);
  assert.ok(errs.some((e) => e.includes('推')));
});

test('仓库内的 data/exercises.json 始终满足 13 字段校验', async () => {
  const exercises = JSON.parse(await readFile(path.join(root, 'data/exercises.json'), 'utf8'));
  const chapters = JSON.parse(await readFile(path.join(root, 'content/chapters.json'), 'utf8'));
  const demos = JSON.parse(await readFile(path.join(root, 'data/demos.json'), 'utf8'));
  const claims = JSON.parse(await readFile(path.join(root, 'data/claims.json'), 'utf8'));
  const errs = validateExercises(exercises, {
    claims: new Set(claims.map((c) => c.id)),
    demos: new Set(demos.map((d) => d.id)),
    chapters: new Set(chapters.map((c) => c.id)),
  });
  assert.deepEqual(errs, []);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/exercises.test.mjs`
Expected: FAIL — `Cannot find module '../src/validate/exercises.mjs'`

- [ ] **Step 3: 实现 src/validate/exercises.mjs**

```js
export const PATTERNS = ['推', '拉', '蹲', '髋铰链', '搬运', '核心抗阻'];
export const EQUIPMENT = ['杠铃', '哑铃', '固定器械', '自重', '弹力带'];
export const EQUIP_CLASSES = { 杠铃: '杠铃', 哑铃: '哑铃', 固定器械: '固定器械', 自重: '自重或弹力带', 弹力带: '自重或弹力带' };
export const MUSCLES = ['胸','上背','下背','前束','中束','后束','肱二头','肱三头','股四头','腘绳','臀','小腿','核心'];
const DIFFICULTY = ['入门', '进阶'];
const SLUG_RE = /^[a-z0-9-]+$/;
const NO_COLLAR_RE = /(不上|免|不用|无需|可不)\s*卡扣/;

export function validateExercises(list, ctx) {
  const errs = [];
  if (!Array.isArray(list)) return ['data/exercises.json: 顶层必须是数组'];
  const slugs = new Set(list.map((e) => e?.slug));
  list.forEach((e, i) => {
    const at = `data/exercises.json[${i}] (${e?.slug ?? '无 slug'})`;
    if (!SLUG_RE.test(e?.slug ?? '')) errs.push(`${at}: slug 必须是 [a-z0-9-]`);
    if (!e?.name_zh || !e?.name_en) errs.push(`${at}: 字段1 name_zh/name_en 必填`);
    if (!PATTERNS.includes(e?.pattern)) errs.push(`${at}: 字段2 pattern 必须是 ${PATTERNS.join('/')}`);
    if (!['单侧', '双侧'].includes(e?.laterality)) errs.push(`${at}: 字段2 laterality 必须是 单侧/双侧`);
    for (const k of ['prime', 'synergist', 'stabilizer']) {
      if (!Array.isArray(e?.muscles?.[k]) || e.muscles[k].length === 0) errs.push(`${at}: 字段3 muscles.${k} 必填`);
    }
    if (!EQUIPMENT.includes(e?.equipment)) errs.push(`${at}: 字段4 equipment 必须是 ${EQUIPMENT.join('/')}`);
    const cues = e?.cues ?? [];
    if (cues.length < 3 || cues.length > 5) errs.push(`${at}: 字段5 cues 需 3–5 条`);
    if (!['设置', undefined].includes(cues[0]?.phase) || cues[0]?.phase !== '设置') errs.push(`${at}: 字段5 首条必须是"设置"阶段`);
    if (!(e?.mistakes ?? []).length) errs.push(`${at}: 字段6 mistakes 必填`);
    (e?.mistakes ?? []).forEach((m, j) => {
      if (!m.error || !m.consequence) errs.push(`${at}.mistakes[${j}]: 必须写成"错误 → 它导致什么"两段`);
    });
    const checks = e?.self_checks ?? [];
    if (checks.length < 2 || checks.length > 4) errs.push(`${at}: 字段7 self_checks 必填且为 2–4 条`);
    checks.forEach((c, j) => {
      for (const k of ['criterion', 'how', 'cannot']) {
        if (!c?.[k]) errs.push(`${at}.self_checks[${j}].${k}: 必填（判据 + 怎么自检 + 判不了什么）`);
      }
      if (/松开一只手|单手|负重下.*改变握/.test(c?.how ?? '')) {
        errs.push(`${at}.self_checks[${j}].how: 自检不得要求在负重状态下改变握持或支撑`);
      }
    });
    if (!e?.audience?.suitable || !e?.audience?.cautions) errs.push(`${at}: 字段8 audience.suitable/cautions 必填`);
    const alts = e?.home_alts ?? [];
    if (alts.length < 1 || alts.length > 2) errs.push(`${at}: 字段9 home_alts 需 1–2 个`);
    alts.forEach((s) => { if (!slugs.has(s)) errs.push(`${at}: 字段9 home_alts 指向不存在的 slug ${s}`); });
    if (!DIFFICULTY.includes(e?.difficulty)) errs.push(`${at}: 字段10 difficulty 必须是 入门/进阶`);
    const s = e?.safety;
    if (!s) errs.push(`${at}: 字段11 safety 必填，为空的动作不进库`);
    else {
      for (const k of ['rack', 'collars', 'setup', 'bailout']) {
        if (!s[k]) errs.push(`${at}: 字段11 safety.${k} 必填`);
      }
      if (typeof s.solo_ok !== 'boolean') errs.push(`${at}: 字段11 safety.solo_ok 必须是布尔值`);
      if (s.solo_ok === false && !s.solo_alt) errs.push(`${at}: 字段11 solo_ok=false 必须给出 solo_alt 替代动作`);
      if (s.solo_alt && !slugs.has(s.solo_alt)) errs.push(`${at}: 字段11 solo_alt 指向不存在的 slug ${s.solo_alt}`);
      if (NO_COLLAR_RE.test(JSON.stringify(s))) errs.push(`${at}: 字段11 出现"不上卡扣"类表述，全站禁止`);
    }
    if (e?.demo_id && !ctx.demos.has(e.demo_id)) errs.push(`${at}: 字段12 demo_id ${e.demo_id} 未登记在 data/demos.json`);
    const refs = e?.chapter_refs ?? [];
    if (!refs.length) errs.push(`${at}: 字段13 chapter_refs 至少 1 个`);
    refs.forEach((r) => { if (!ctx.chapters.has(r)) errs.push(`${at}: 字段13 指向不存在的章节锚点 ${r}`); });
    (e?.claim_refs ?? []).forEach((c) => { if (!ctx.claims.has(c)) errs.push(`${at}: claim_refs 指向不存在的 claim ${c}`); });
  });
  return errs;
}

export function validateCoverage(list) {
  const errs = [];
  const classes = [...new Set(Object.values(EQUIP_CLASSES))];
  for (const p of PATTERNS) {
    for (const c of classes) {
      const hit = list.some((e) => e.pattern === p && EQUIP_CLASSES[e.equipment] === c);
      if (!hit) errs.push(`覆盖矩阵缺口: 模式「${p}」× 器械「${c}」没有动作`);
    }
    const home = list.some((e) => e.pattern === p && e.difficulty === '入门'
      && EQUIP_CLASSES[e.equipment] === '自重或弹力带');
    if (!home) errs.push(`覆盖矩阵缺口: 模式「${p}」缺少入门级家庭可做版本`);
  }
  for (const m of MUSCLES) {
    const hits = list.filter((e) => [...(e.muscles?.prime ?? []), ...(e.muscles?.synergist ?? [])].includes(m));
    if (hits.length < 2) errs.push(`肌群兜底不足: 「${m}」只有 ${hits.length} 个动作，需 ≥2`);
    else if (new Set(hits.map((e) => EQUIP_CLASSES[e.equipment])).size < 2) {
      errs.push(`肌群兜底不足: 「${m}」的动作全部依赖同一器械类别`);
    }
  }
  return errs;
}
```

- [ ] **Step 4: 实现 src/render/exercises.mjs**

```js
import { escapeHtml } from './claims.mjs';
import { expandTokens } from './tokens.mjs';

function card(e, ctx) {
  const demo = e.demo_id ? ctx.demos.get(e.demo_id) : null;
  const demoHtml = !demo
    ? ''
    : demo.dead
      ? `<p class="demo dead">示范链接当前不可达，请依据文字要点与自检判据执行；来源：${escapeHtml(demo.publisher)}</p>`
      : `<p class="demo"><a href="${escapeHtml(demo.url)}" rel="noreferrer noopener" target="_blank">示范（${escapeHtml(demo.publisher)}，核验于 ${escapeHtml(demo.verified_on)}）</a></p>`;
  return `
<article class="ex-card" id="ex-${e.slug}"
  data-pattern="${e.pattern}" data-equipment="${e.equipment}"
  data-difficulty="${e.difficulty}" data-muscles="${escapeHtml([...e.muscles.prime, ...e.muscles.synergist].join(' '))}">
  <h3>${escapeHtml(e.name_zh)} <span class="en">${escapeHtml(e.name_en)}</span></h3>
  <p class="meta">${e.pattern} · ${e.laterality} · ${e.equipment} · ${e.difficulty}</p>
  <p class="muscles">主动肌 ${escapeHtml(e.muscles.prime.join('、'))}；协同肌 ${escapeHtml(e.muscles.synergist.join('、'))}；稳定肌 ${escapeHtml(e.muscles.stabilizer.join('、'))}</p>
  <h4>执行要点</h4><ol>${e.cues.map((c) => `<li><b>${escapeHtml(c.phase)}</b>：${expandTokens(escapeHtml(c.text), ctx)}</li>`).join('')}</ol>
  <h4>常见错误 → 它导致什么</h4><ul>${e.mistakes.map((m) => `<li>${escapeHtml(m.error)} → ${escapeHtml(m.consequence)}</li>`).join('')}</ul>
  <h4>可自检判据</h4><ol>${e.self_checks.map((c) => `<li><b>${escapeHtml(c.criterion)}</b><br><i>怎么自检</i>：${escapeHtml(c.how)}<br><i>判不了</i>：${escapeHtml(c.cannot)}</li>`).join('')}</ol>
  <h4>安全设置与失败退出</h4>
  <ul class="safety">
    <li>保护杆／保护架：${escapeHtml(e.safety.rack)}</li>
    <li>卡扣：${escapeHtml(e.safety.collars)}</li>
    <li>器械对齐：${escapeHtml(e.safety.setup)}</li>
    <li>独练：${e.safety.solo_ok ? '无保护者时可做' : `无保护杆且无保护者时<b>不做</b>，改做 ${escapeHtml(e.safety.solo_alt)}`}</li>
    <li>做不动了怎么脱身：${escapeHtml(e.safety.bailout)}</li>
  </ul>
  <p class="audience">适用：${escapeHtml(e.audience.suitable)}；慎用：${escapeHtml(e.audience.cautions)}</p>
  <p class="alts">家庭／有限器械替代：${e.home_alts.map((s) => `{{ex:${s}}}`).join('、')}</p>
  ${demoHtml}
  <p class="xrefs">→ 关联原理：${e.chapter_refs.map((r) => `<a href="#${r}">${escapeHtml(ctx.chapterTitles.get(r))}</a>`).join('、')}</p>
</article>`;
}

export function renderExercises(list, ctx) {
  const body = list.map((e) => expandTokens(card(e, ctx), ctx)).join('\n');
  return `<section id="exercises"><h2>动作库</h2><div class="filters" data-for="exercises"></div><div class="ex-grid">${body}</div></section>`;
}
```

- [ ] **Step 5: 把两个校验器接进 src/data.mjs**

```js
import { validateExercises, validateCoverage } from './validate/exercises.mjs';
// 在 errs 组装处追加：
  const ctx = {
    claims: new Set(claims.map((c) => c.id)),
    demos: new Set(demos.map((d) => d.id)),
    chapters: new Set(chapters.map((c) => c.id)),
  };
  errs.push(...validateExercises(exercises, ctx));
  if (process.env.SKIP_COVERAGE !== '1') errs.push(...validateCoverage(exercises));
```

> 覆盖矩阵在内容灌满前必然报错，因此 Task 3–10 期间构建用 `SKIP_COVERAGE=1 node src/build.mjs`；Task 12 完成后去掉该开关并永久保持默认开启。

- [ ] **Step 6: 用示例测试里的高杠背蹲卡 + 其 home_alt（`goblet-squat`）初始化 data/exercises.json**

两张卡都必须满足 13 字段校验（`goblet-squat` 的 `home_alts` 指回 `back-squat-high-bar` 或 `bodyweight-squat`，不得指向不存在的 slug）。`demo_id` 暂为 `null`（Task 6 建立 demos 登记后回填）。

- [ ] **Step 7: 运行测试与构建**

Run: `node --test tests/exercises.test.mjs` 然后 `SKIP_COVERAGE=1 node src/build.mjs`
Expected: 全部 PASS；`dist/index.html` 含 `id="ex-back-squat-high-bar"`

- [ ] **Step 8: 提交**

```bash
cd "$(git rev-parse --show-toplevel)"
git add src/validate/exercises.mjs src/render/exercises.mjs src/data.mjs src/build.mjs data/exercises.json tests/exercises.test.mjs
git commit -m "feat: 动作卡 13 字段校验、覆盖矩阵与渲染"
```

---

### Task 4: 计划模板 11 字段校验

**Files:**
- Create: `src/validate/plans.mjs`, `src/render/plans.mjs`
- Modify: `src/data.mjs`, `src/build.mjs`, `data/plans.json`
- Test: `tests/plans.test.mjs`

**Interfaces:**
- Consumes: Task 3 的 `PATTERNS`、动作 slug 集合
- Produces:
  - `export function validatePlans(plans, { exercises, chapters }): string[]`
  - `export function renderPlans(plans, ctx): string`
  - 模板数据契约：

```js
{
  slug: 'novice-3d', title: '新手 全身 3 天（健身房）',
  audience: { level: '新手', days_per_week: 3, equipment: '健身房', goal: '增肌',
              prerequisites: '已读导读「第一次训练前必读」并练过退出方式' },   // 字段 1
  week: [{ day: '周一', type: '力量', items: [{ exercise: 'back-squat-high-bar',
            sets: 3, reps: '5', rir: 2, rest: '3–5 分钟' }] },
         { day: '周三', type: '有氧', cardio: { mode: '快走或固定单车', minutes: 25,
            intensity: '能完整说话的强度（Zone 2）', placement: '独立日',
            placement_reason: '与力量日分开，避开干扰效应', chapter_ref: 'ch8' } },
         { day: '周日', type: '休息' }],                                      // 字段 2+3
  start_load: '…空杆 × 8 次评估 → 每组加一对最小片直到达到目标 RIR → 取该重量 90% 作为第一周工作重量…', // 字段 4
  start_load_refs: [{ exercise: 'back-squat-high-bar', range: '空杆 20 kg 起，常见首周工作重量 20–35 kg',
                      source: '区间为常见起点示例，个体差异大，以流程实测为准' }],
  warmup: { general: '5 分钟渐进有氧把心率与体温抬起来', specific: '空杆 × 10 → 50% × 5 → 70% × 3 → 90% × 1 → 工作重量',
            by_type: '单关节与器械动作只做 1–2 组轻重量递增' },                // 字段 5
  progression: [{ exercise: 'back-squat-high-bar', increment_kg: '2.5–5',
                  cap_pct: 5, trigger: '连续两次训练都能在 RIR ≥ 2 下完成 3×5 则上调' }], // 字段 6
  increment_mismatch: 'double progression：先把次数爬到区间上限再跳重量',       // 字段 7
  failure_rules: { single_miss: '保持重量重做一次，不下调', two_misses: '该动作下调 10%，重新爬坡',
                   miss_one_session: '顺延，不补练', miss_1_2_weeks: '按原重量 ~90% 重启',
                   miss_over_month: '按字段 4 的新手流程重走',
                   underrecovery: '出现恢复不足信号先插入一周 deload（容量减半或强度降 10%），而不是先降重量' }, // 字段 8
  pain_path: '训练中出现疼痛当场停止该动作，当次不用其他动作替代着练同一部位；…按第 9 章判断原则就医，不用 deload 或减量绕过', // 字段 9
  substitutions: [{ exercise: 'back-squat-high-bar', alts: ['goblet-squat'],
                    scope: '器械不可用或该动作不适合其水平/体型；不适用于疼痛' }], // 字段 10
  exit_criteria: { when: '同一动作连续两次 deload 后仍无法推进，或线性加重已连续 4 周停滞',
                   next: 'upper-lower-4d', chapter_ref: 'ch5' }                // 字段 11
}
```

- [ ] **Step 1: 写失败测试**

`tests/plans.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validatePlans } from '../src/validate/plans.mjs';

const root = path.resolve(import.meta.dirname, '..');
const ctx = { exercises: new Set(['back-squat-high-bar', 'goblet-squat']),
              plans: new Set(['novice-3d', 'upper-lower-4d']),
              chapters: new Set(['ch5', 'ch8', 'ch9']) };

const plan = JSON.parse(await readFile(path.join(root, 'tests/fixtures/plan-novice-3d.json'), 'utf8'));

test('合法模板通过', () => {
  assert.deepEqual(validatePlans([plan], ctx), []);
});

test('周安排必须同时含有氧与休息日', () => {
  const noCardio = { ...plan, week: plan.week.filter((d) => d.type !== '有氧') };
  assert.ok(validatePlans([noCardio], ctx).some((e) => e.includes('有氧')));
  const noRest = { ...plan, week: plan.week.filter((d) => d.type !== '休息') };
  assert.ok(validatePlans([noRest], ctx).some((e) => e.includes('休息日')));
});

test('有氧安排必须说明放置理由并链到第 8 章', () => {
  const week = plan.week.map((d) => d.type === '有氧'
    ? { ...d, cardio: { ...d.cardio, placement_reason: '' } } : d);
  assert.ok(validatePlans([{ ...plan, week }], ctx).some((e) => e.includes('placement_reason')));
});

test('每个动作必须有 组数×次数×RIR×组间休息', () => {
  const week = plan.week.map((d) => d.type === '力量'
    ? { ...d, items: d.items.map(({ rir, ...rest }) => rest) } : d);
  assert.ok(validatePlans([{ ...plan, week }], ctx).some((e) => e.includes('rir')));
});

test('进阶规则必须具体到数字且有比例上限', () => {
  const bad = { ...plan, progression: [{ exercise: 'back-squat-high-bar',
    increment_kg: '感觉轻了就加', cap_pct: 5, trigger: '觉得可以的时候' }] };
  const errs = validatePlans([bad], ctx);
  assert.ok(errs.some((e) => e.includes('increment_kg')));
  assert.ok(errs.some((e) => e.includes('trigger')));
});

test('疼痛路径不得出现 deload/减量/换动作 作为处理方案', () => {
  const bad = { ...plan, pain_path: '出现疼痛就 deload 一周，或换一个同模式动作接着练' };
  assert.ok(validatePlans([bad], ctx).some((e) => e.includes('pain_path')));
});

test('替代映射必须写明不适用于疼痛，且替代项同模式', () => {
  const bad = { ...plan, substitutions: [{ exercise: 'back-squat-high-bar',
    alts: ['goblet-squat'], scope: '疼痛时可以换这个继续练' }] };
  assert.ok(validatePlans([bad], ctx).some((e) => e.includes('substitutions')));
});

test('exit_criteria 指向的下一套模板必须存在', () => {
  const bad = { ...plan, exit_criteria: { ...plan.exit_criteria, next: 'nope' } };
  assert.ok(validatePlans([bad], ctx).some((e) => e.includes('nope')));
});

test('仓库内 data/plans.json 始终合法', async () => {
  const plans = JSON.parse(await readFile(path.join(root, 'data/plans.json'), 'utf8'));
  const exercises = JSON.parse(await readFile(path.join(root, 'data/exercises.json'), 'utf8'));
  const chapters = JSON.parse(await readFile(path.join(root, 'content/chapters.json'), 'utf8'));
  const errs = validatePlans(plans, {
    exercises: new Set(exercises.map((e) => e.slug)),
    plans: new Set(plans.map((p) => p.slug)),
    chapters: new Set(chapters.map((c) => c.id)),
  });
  assert.deepEqual(errs, []);
});
```

- [ ] **Step 2: 建 fixture**

把 Task 4 开头「模板数据契约」里的完整对象原样存为 `tests/fixtures/plan-novice-3d.json`（补全到周一/周三/周五力量日 + 周三或周六有氧 + 至少一个 `type: "休息"` 日）。

- [ ] **Step 3: 运行测试确认失败**

Run: `node --test tests/plans.test.mjs`
Expected: FAIL — `Cannot find module '../src/validate/plans.mjs'`

- [ ] **Step 4: 实现 src/validate/plans.mjs**

```js
const NUM_RANGE_RE = /\d/;
const VAGUE_RE = /感觉|觉得|差不多|适当|酌情/;
const PAIN_BYPASS_RE = /(疼痛|痛).{0,20}(deload|减量|降重|换(一个)?(同模式)?动作|继续练)|((deload|减量|换动作).{0,20}(疼痛|痛))/;

export function validatePlans(plans, ctx) {
  const errs = [];
  if (!Array.isArray(plans)) return ['data/plans.json: 顶层必须是数组'];
  plans.forEach((p, i) => {
    const at = `data/plans.json[${i}] (${p?.slug ?? '无 slug'})`;
    if (!/^[a-z0-9-]+$/.test(p?.slug ?? '')) errs.push(`${at}: slug 必须是 [a-z0-9-]`);
    if (!p?.title) errs.push(`${at}: title 必填`);
    const a = p?.audience;
    if (!a?.level || !Number.isInteger(a?.days_per_week) || !a?.equipment || !a?.goal || !a?.prerequisites) {
      errs.push(`${at}: 字段1 audience 需含 level/days_per_week/equipment/goal/prerequisites`);
    }
    const week = p?.week ?? [];
    if (!week.length) errs.push(`${at}: 字段2 week 必填`);
    if (!week.some((d) => d.type === '有氧' || d.cardio)) errs.push(`${at}: 字段2 周安排必须含有氧安排`);
    if (!week.some((d) => d.type === '休息')) errs.push(`${at}: 字段2 周安排必须含休息日`);
    week.forEach((d, j) => {
      const dat = `${at}.week[${j}]`;
      if (d.cardio) {
        for (const k of ['mode', 'minutes', 'intensity', 'placement', 'placement_reason', 'chapter_ref']) {
          if (!d.cardio[k]) errs.push(`${dat}.cardio.${k}: 必填（放置理由需链到干扰效应章节）`);
        }
        if (d.cardio.chapter_ref && !ctx.chapters.has(d.cardio.chapter_ref)) {
          errs.push(`${dat}.cardio.chapter_ref: 指向不存在的章节 ${d.cardio.chapter_ref}`);
        }
      }
      (d.items ?? []).forEach((it, k) => {
        const iat = `${dat}.items[${k}]`;
        if (!ctx.exercises.has(it.exercise)) errs.push(`${iat}: 指向不存在的动作 ${it.exercise}`);
        if (!Number.isInteger(it.sets)) errs.push(`${iat}.sets: 字段3 组数必填且为整数`);
        if (!NUM_RANGE_RE.test(String(it.reps ?? ''))) errs.push(`${iat}.reps: 字段3 次数必须具体到数字`);
        if (it.rir === undefined || it.rir === null) errs.push(`${iat}.rir: 字段3 RIR 必填`);
        if (!NUM_RANGE_RE.test(String(it.rest ?? ''))) errs.push(`${iat}.rest: 字段3 组间休息必须具体到时间`);
      });
    });
    if (!p?.start_load || !NUM_RANGE_RE.test(p.start_load)) errs.push(`${at}: 字段4 start_load 必填且必须具体到步骤与数字`);
    if (!(p?.start_load_refs ?? []).length) errs.push(`${at}: 字段4 start_load_refs 需给主要动作的起始重量参考区间`);
    (p?.start_load_refs ?? []).forEach((r, j) => {
      if (!ctx.exercises.has(r.exercise)) errs.push(`${at}.start_load_refs[${j}]: 未知动作 ${r.exercise}`);
      if (!r.range || !r.source) errs.push(`${at}.start_load_refs[${j}]: range 与 source（区间来源与个体差异说明）必填`);
    });
    for (const k of ['general', 'specific', 'by_type']) {
      if (!p?.warmup?.[k]) errs.push(`${at}: 字段5 warmup.${k} 必填`);
    }
    const prog = p?.progression ?? [];
    if (!prog.length) errs.push(`${at}: 字段6 progression 必填`);
    prog.forEach((g, j) => {
      const gat = `${at}.progression[${j}]`;
      if (!ctx.exercises.has(g.exercise)) errs.push(`${gat}: 未知动作 ${g.exercise}`);
      if (!NUM_RANGE_RE.test(String(g.increment_kg ?? '')) || VAGUE_RE.test(String(g.increment_kg ?? ''))) {
        errs.push(`${gat}.increment_kg: 字段6 必须是具体增量数字，不接受"感觉轻了就加重"`);
      }
      if (typeof g.cap_pct !== 'number') errs.push(`${gat}.cap_pct: 字段6 必须给出比例上限（单次增幅占当前工作重量的百分比）`);
      if (!NUM_RANGE_RE.test(String(g.trigger ?? '')) || VAGUE_RE.test(String(g.trigger ?? ''))) {
        errs.push(`${gat}.trigger: 字段6 触发条件必须具体到数字`);
      }
    });
    if (!p?.increment_mismatch) errs.push(`${at}: 字段7 increment_mismatch 必填（器械最小增量不匹配时采用哪条策略）`);
    const fr = p?.failure_rules ?? {};
    for (const k of ['single_miss', 'two_misses', 'miss_one_session', 'miss_1_2_weeks', 'miss_over_month', 'underrecovery']) {
      if (!fr[k]) errs.push(`${at}: 字段8 failure_rules.${k} 必填`);
    }
    if (/疼痛|痛/.test(JSON.stringify(fr))) errs.push(`${at}: 字段8 只处理疲劳，不得出现疼痛处理（疼痛走字段 9）`);
    if (!p?.pain_path) errs.push(`${at}: 字段9 pain_path 必填`);
    else if (PAIN_BYPASS_RE.test(p.pain_path)) errs.push(`${at}: 字段9 pain_path 不得用 deload／减量／换动作作为疼痛处理方案`);
    else if (!/停止/.test(p.pain_path)) errs.push(`${at}: 字段9 pain_path 必须明确"当场停止该动作"`);
    const subs = p?.substitutions ?? [];
    if (!subs.length) errs.push(`${at}: 字段10 substitutions 必填`);
    subs.forEach((s, j) => {
      const sat = `${at}.substitutions[${j}]`;
      if (!ctx.exercises.has(s.exercise)) errs.push(`${sat}: 未知动作 ${s.exercise}`);
      if (!(s.alts ?? []).length || s.alts.length > 2) errs.push(`${sat}.alts: 需 1–2 个替代项`);
      (s.alts ?? []).forEach((x) => { if (!ctx.exercises.has(x)) errs.push(`${sat}.alts: 未知动作 ${x}`); });
      if (!s.scope) errs.push(`${sat}.scope: 必填`);
      else if (!/不适用于疼痛|不是疼痛/.test(s.scope) || /疼痛时|痛了.*换/.test(s.scope)) {
        errs.push(`${sat}.scope: 字段10 必须写明适用场景仅限器械不可用或不适合其水平/体型，并声明不适用于疼痛`);
      }
    });
    const ex = p?.exit_criteria;
    if (!ex?.when || !ex?.next || !ex?.chapter_ref) errs.push(`${at}: 字段11 exit_criteria 需含 when/next/chapter_ref`);
    else {
      if (!ctx.plans.has(ex.next)) errs.push(`${at}: 字段11 exit_criteria.next 指向不存在的模板 ${ex.next}`);
      if (!ctx.chapters.has(ex.chapter_ref)) errs.push(`${at}: 字段11 exit_criteria.chapter_ref 指向不存在的章节 ${ex.chapter_ref}`);
    }
  });
  return errs;
}
```

> 字段 10 的 `alts` 必须同模式——这条由 Task 12 的跨数据检查统一执行（在 `src/validate/links.mjs` 里比对 `exercises` 的 `pattern`），因为 `validatePlans` 只拿到 slug 集合。

- [ ] **Step 5: 实现 src/render/plans.mjs**

渲染要求（照 `renderExercises` 的写法，用 `escapeHtml` + `expandTokens`）：外层 `<article class="plan-card" id="plan-<slug>" data-level data-days data-goal>`；依次输出字段 1–11 的小节，标题分别为 `适用对象与前提`、`周安排`（表格，含有氧行与休息日行，有氧行附放置理由与 `<a href="#ch8">` 链接）、`处方`、`起始负荷选择流程`、`热身流程`、`进阶规则`、`增量不匹配怎么办`、`失败与中断（疲劳）`、`疼痛的独立处理路径`（加 `class="pain-path"` 以便样式上与疲劳规则明显分区）、`替代动作映射`、`何时停用、换到哪套`。

- [ ] **Step 6: 接进 data.mjs 与 build.mjs**

```js
import { validatePlans } from './validate/plans.mjs';
  errs.push(...validatePlans(plans, { ...ctx, exercises: new Set(exercises.map((e) => e.slug)),
                                      plans: new Set(plans.map((p) => p.slug)) }));
```

`build.mjs` 中给 `renderPage` 增加 `planHtml: renderPlans(data.plans, renderCtx)`。

- [ ] **Step 7: 把 fixture 作为第一套真实模板写入 data/plans.json**

`data/plans.json` 放入 `novice-3d` 一套（`exit_criteria.next` 暂指向自身 `novice-3d` 并在 Task 13 改为 `upper-lower-4d`，避免引用不存在的模板）。

- [ ] **Step 8: 运行测试与构建**

Run: `node --test tests/` 然后 `SKIP_COVERAGE=1 node src/build.mjs`
Expected: 全部 PASS；`dist/index.html` 含 `id="plan-novice-3d"` 与 `class="pain-path"`

- [ ] **Step 9: 提交**

```bash
cd "$(git rev-parse --show-toplevel)"
git add src/validate/plans.mjs src/render/plans.mjs src/data.mjs src/build.mjs data/plans.json tests/plans.test.mjs tests/fixtures/plan-novice-3d.json
git commit -m "feat: 计划模板 11 字段校验与渲染，疲劳与疼痛路径分离"
```

---

### Task 5: 章节管道与「自测清单 + 练习任务」结构校验

**Files:**
- Create: `src/validate/chapters.mjs`, `src/render/chapters.mjs`, `content/ch0.html`（骨架，正文在 Task 11 写）
- Modify: `src/data.mjs`, `src/build.mjs`
- Test: `tests/chapters.test.mjs`

**Interfaces:**
- Consumes: Task 2 的 `expandTokens`
- Produces:
  - `export async function loadChapters(root, chapters): Promise<Array<{num,id,title,html}>>`（`src/render/chapters.mjs`）
  - `export function validateChapters(loaded): string[]`（`src/validate/chapters.mjs`）
  - `export function renderChapters(loaded, ctx): string`
  - **章节片段的硬性结构**（每个 `content/ch*.html` 必须有，后续所有章节任务照此写）：

```html
<section class="chapter" id="ch2">
  <h2>第 2 章 训练变量</h2>
  <p>正文……{{claim:claim-xxx}}……</p>

  <section class="selfcheck">
    <h3>这章让你能回答的问题</h3>
    <ul><li>……</li><li>……</li><li>……</li></ul>
  </section>

  <section class="exercise-task">
    <h3>练习任务</h3>
    <p>任务描述……</p>
    <details class="model-answer">
      <summary>参考答案与判断要点</summary>
      <p>一个合格回答长什么样……</p>
      <ul><li>判断要点：……</li></ul>
    </details>
  </section>
</section>
```

- [ ] **Step 1: 写失败测试**

`tests/chapters.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { loadChapters } from '../src/render/chapters.mjs';
import { validateChapters } from '../src/validate/chapters.mjs';

const root = path.resolve(import.meta.dirname, '..');

const good = [{ num: 2, id: 'ch2', title: '训练变量', html: `
<section class="chapter" id="ch2"><h2>第 2 章 训练变量</h2><p>正文</p>
<section class="selfcheck"><h3>这章让你能回答的问题</h3><ul><li>a</li><li>b</li><li>c</li></ul></section>
<section class="exercise-task"><h3>练习任务</h3><p>记录一次训练的七个变量</p>
<details class="model-answer"><summary>参考答案与判断要点</summary><p>合格回答</p><ul><li>判断要点：逐项给出数值</li></ul></details>
</section></section>` }];

test('合规章节通过', () => {
  assert.deepEqual(validateChapters(good), []);
});

test('缺自测清单被拒', () => {
  const bad = [{ ...good[0], html: good[0].html.replace(/<section class="selfcheck">[\s\S]*?<\/section>/, '') }];
  assert.ok(validateChapters(bad).some((e) => e.includes('selfcheck')));
});

test('缺练习任务被拒', () => {
  const bad = [{ ...good[0], html: good[0].html.replace(/<section class="exercise-task">[\s\S]*?$/, '</section>') }];
  assert.ok(validateChapters(bad).some((e) => e.includes('exercise-task')));
});

test('练习任务缺参考答案被拒', () => {
  const bad = [{ ...good[0], html: good[0].html.replace(/<details class="model-answer">[\s\S]*?<\/details>/, '') }];
  assert.ok(validateChapters(bad).some((e) => e.includes('model-answer')));
});

test('章节根元素 id 必须与清单一致', () => {
  const bad = [{ ...good[0], html: good[0].html.replace('id="ch2"', 'id="chapter-2"') }];
  assert.ok(validateChapters(bad).some((e) => e.includes('ch2')));
});

test('仓库内 11 章全部存在且合规（内容任务完成后必须为空）', async () => {
  const chapters = JSON.parse(await readFile(path.join(root, 'content/chapters.json'), 'utf8'));
  assert.equal(chapters.length, 11);
  if (process.env.CHAPTERS_WIP === '1') return;
  const loaded = await loadChapters(root, chapters);
  assert.deepEqual(validateChapters(loaded), []);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/chapters.test.mjs`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现 src/render/chapters.mjs**

```js
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expandTokens } from './tokens.mjs';

export async function loadChapters(root, chapters) {
  return Promise.all(chapters.map(async (c) => {
    const file = path.join(root, 'content', c.file);
    let html;
    try {
      html = await readFile(file, 'utf8');
    } catch (err) {
      throw new Error(`content/${c.file}: 无法读取 (${err.code})`);
    }
    return { ...c, html };
  }));
}

export function renderChapters(loaded, ctx) {
  const toc = loaded.map((c) =>
    `<li><a href="#${c.id}">第 ${c.num} 章 ${c.title}</a></li>`).join('');
  const body = loaded.map((c) => expandTokens(c.html, ctx)).join('\n');
  return `<nav class="toc" aria-label="章节目录"><ol>${toc}</ol></nav>
<div class="chapters">${body}</div>`;
}
```

- [ ] **Step 4: 实现 src/validate/chapters.mjs**

```js
export function validateChapters(loaded) {
  const errs = [];
  if (loaded.length !== 11) errs.push(`content/chapters.json: 必须是第 0–10 章共 11 章，当前 ${loaded.length}`);
  loaded.forEach((c) => {
    const at = `content/${c.file ?? c.id}`;
    if (!new RegExp(`<section class="chapter" id="${c.id}"`).test(c.html)) {
      errs.push(`${at}: 根元素必须是 <section class="chapter" id="${c.id}">`);
    }
    if (!/<section class="selfcheck">[\s\S]*?这章让你能回答的问题/.test(c.html)) {
      errs.push(`${at}: 缺少 selfcheck 小节（"这章让你能回答的问题"自测清单）`);
    } else {
      const items = (c.html.match(/<section class="selfcheck">([\s\S]*?)<\/section>/)?.[1].match(/<li>/g) ?? []).length;
      if (items < 3) errs.push(`${at}: selfcheck 自测清单至少 3 条，当前 ${items}`);
    }
    const task = c.html.match(/<section class="exercise-task">([\s\S]*?)<\/section>\s*<\/section>/)?.[1];
    if (!task) errs.push(`${at}: 缺少 exercise-task 小节（练习任务）`);
    else if (!/<details class="model-answer">[\s\S]*?判断要点/.test(task)) {
      errs.push(`${at}: exercise-task 缺少 model-answer（参考答案与判断要点）`);
    }
  });
  return errs;
}
```

- [ ] **Step 5: 建 content/ch0.html … ch10.html 的合规骨架**

每个文件先写成上面「章节片段的硬性结构」的最小合规版本：真实标题 + 一句"本章待撰写"的正文占位 + 3 条自测清单 + 1 个练习任务与参考答案。这不是最终内容占位符，而是让管道在内容任务之前就能跑通；Task 11–14 会逐章替换正文。**Task 14 结束时任何一章仍含"本章待撰写"即视为未完成**（该检查在 Task 17 的全站扫描中执行）。

- [ ] **Step 6: 接进 build.mjs**

```js
import { loadChapters, renderChapters } from './render/chapters.mjs';
import { validateChapters } from './validate/chapters.mjs';
// build() 内：
  const loaded = await loadChapters(root, data.chapters);
  const errs = validateChapters(loaded);
  if (errs.length) throw new Error(`章节校验失败:\n- ${errs.join('\n- ')}`);
  const renderCtx = {
    claims: new Map(data.claims.map((c) => [c.id, c])),
    exercises: new Map(data.exercises.map((e) => [e.slug, e])),
    plans: new Map(data.plans.map((p) => [p.slug, p])),
    demos: new Map(data.demos.map((d) => [d.id, d])),
    figures: new Map(),           // Task 10 填充
    chapterTitles: new Map(data.chapters.map((c) => [c.id, `第 ${c.num} 章 ${c.title}`])),
  };
  const html = renderPage(data, { css, js,
    chapterHtml: renderChapters(loaded, renderCtx),
    exerciseHtml: renderExercises(data.exercises, renderCtx),
    planHtml: renderPlans(data.plans, renderCtx),
    claimHtml: renderClaimRegistry(data.claims) });
```

- [ ] **Step 7: 运行测试与构建**

Run: `node --test tests/` 然后 `SKIP_COVERAGE=1 node src/build.mjs`
Expected: 全部 PASS；`dist/index.html` 含 11 个 `class="chapter"` 与目录 `<nav class="toc">`

- [ ] **Step 8: 提交**

```bash
cd "$(git rev-parse --show-toplevel)"
git add src/render/chapters.mjs src/validate/chapters.mjs content src/build.mjs tests/chapters.test.mjs
git commit -m "feat: 章节管道与自测清单/练习任务结构校验"
```

---

### Task 6: 示范来源登记与链接检查（含失效降级）

**Files:**
- Create: `src/validate/demos.mjs`, `src/validate/links.mjs`
- Modify: `src/data.mjs`, `data/demos.json`, `data/exercises.json`（回填 demo_id）, `package.json`
- Test: `tests/demos.test.mjs`, `tests/links.test.mjs`

**Interfaces:**
- Consumes: Task 3 的动作数据、Task 2 的 claim 数据
- Produces:
  - `export function validateDemos(demos, { exercises }): string[]`
  - `export function collectInternalAnchors(html): Set<string>` / `export function validateInternalLinks(html): string[]`（`src/validate/links.mjs`）
  - `export async function checkExternalUrls(urls, { timeoutMs = 10000 }): Promise<Array<{url, status: 'ok'|'dead'|'unchecked', detail}>>`
  - demos 记录契约：

```js
{
  id: 'demo-back-squat-high-bar', exercise_id: 'back-squat-high-bar',
  url: 'https://…',               // 或 image: 'assets/demos/xxx.svg'
  source_type: '机构官方',          // 机构官方 / 专业示范 / 人工绘制
  publisher: 'NSCA', author_credential: '机构官方动作库',
  license: '链接引用，不转载',       // 图片必须写明授权或自制
  verified_on: '2026-10-11', verified_by: 'childe',
  verification: [{ criterion: '杠在足中线正上方', result: '符合' }],  // 逐条对照该动作自检判据
  dead: false
}
```

- [ ] **Step 1: 写失败测试**

`tests/demos.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDemos } from '../src/validate/demos.mjs';

const ex = [{ slug: 'back-squat-high-bar', pattern: '蹲', equipment: '杠铃', demo_id: 'demo-a',
  self_checks: [{ criterion: '杠在足中线正上方' }, { criterion: '脊柱在中立范围内' }] }];
const demo = {
  id: 'demo-a', exercise_id: 'back-squat-high-bar', url: 'https://www.nsca.com/exercise/back-squat/',
  source_type: '机构官方', publisher: 'NSCA', author_credential: '机构官方动作库',
  license: '链接引用，不转载', verified_on: '2026-10-11', verified_by: 'childe',
  verification: [{ criterion: '杠在足中线正上方', result: '符合' },
                 { criterion: '脊柱在中立范围内', result: '符合' }],
  dead: false,
};

test('合法示范登记通过', () => {
  assert.deepEqual(validateDemos([demo], { exercises: ex }), []);
});

test('核验记录必须逐条覆盖该动作的自检判据', () => {
  const errs = validateDemos([{ ...demo, verification: [demo.verification[0]] }], { exercises: ex });
  assert.ok(errs.some((e) => e.includes('脊柱在中立范围内')));
});

test('缺核验日期或核验人被拒', () => {
  const { verified_on, verified_by, ...bad } = demo;
  const errs = validateDemos([bad], { exercises: ex });
  assert.ok(errs.some((e) => e.includes('verified_on')));
  assert.ok(errs.some((e) => e.includes('verified_by')));
});

test('图片类示范必须写明授权或自制', () => {
  const { url, ...rest } = demo;
  const errs = validateDemos([{ ...rest, image: 'assets/demos/x.svg', license: '' }], { exercises: ex });
  assert.ok(errs.some((e) => e.includes('license')));
});

test('重点动作（六大模式主干杠铃/哑铃动作）缺示范被拒', () => {
  const errs = validateDemos([], { exercises: ex });
  assert.ok(errs.some((e) => e.includes('back-squat-high-bar')));
});

test('失效链接必须标记 dead=true 而不是留着假装可用', () => {
  const errs = validateDemos([{ ...demo, dead: 'yes' }], { exercises: ex });
  assert.ok(errs.some((e) => e.includes('dead')));
});
```

`tests/links.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInternalLinks, checkExternalUrls } from '../src/validate/links.mjs';

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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/demos.test.mjs tests/links.test.mjs`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现 src/validate/demos.mjs**

```js
const SOURCE_TYPES = ['机构官方', '专业示范', '人工绘制'];
const KEY_EQUIPMENT = ['杠铃', '哑铃'];

export function validateDemos(demos, { exercises }) {
  const errs = [];
  const byId = new Map(demos.map((d) => [d.id, d]));
  const slugs = new Set(exercises.map((e) => e.slug));

  demos.forEach((d, i) => {
    const at = `data/demos.json[${i}] (${d?.id ?? '无 id'})`;
    if (!/^demo-[a-z0-9-]+$/.test(d?.id ?? '')) errs.push(`${at}: id 必须是 demo-<slug>`);
    if (!slugs.has(d?.exercise_id)) errs.push(`${at}: exercise_id 指向不存在的动作 ${d?.exercise_id}`);
    if (!d?.url && !d?.image) errs.push(`${at}: 必须有 url（外部链接）或 image（自制/授权图）`);
    if (d?.url && !/^https:\/\//.test(d.url)) errs.push(`${at}: url 必须是 https 链接`);
    if (!SOURCE_TYPES.includes(d?.source_type)) errs.push(`${at}: source_type 必须是 ${SOURCE_TYPES.join('/')}`);
    if (!d?.publisher) errs.push(`${at}: publisher 必填`);
    if (d?.source_type === '专业示范' && !d?.author_credential) errs.push(`${at}: 专业示范必须记录作者资质 author_credential`);
    if (!d?.license) errs.push(`${at}: license 必填（链接=不转载；图片=明确授权或自制）`);
    if (d?.image && !/授权|自制/.test(d?.license ?? '')) errs.push(`${at}: 图片类示范的 license 必须写明授权或自制`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d?.verified_on ?? '')) errs.push(`${at}: verified_on 必填，格式 YYYY-MM-DD`);
    if (!d?.verified_by) errs.push(`${at}: verified_by 必填（核验人）`);
    if (typeof d?.dead !== 'boolean') errs.push(`${at}: dead 必须是布尔值`);
    const ex = exercises.find((e) => e.slug === d?.exercise_id);
    if (ex) {
      const covered = new Set((d?.verification ?? []).map((v) => v.criterion));
      for (const c of ex.self_checks ?? []) {
        if (!covered.has(c.criterion)) errs.push(`${at}: 核验记录缺少对判据「${c.criterion}」的逐条核验`);
      }
      (d?.verification ?? []).forEach((v, j) => {
        if (!v.result) errs.push(`${at}.verification[${j}].result: 必填`);
      });
    }
  });

  for (const e of exercises) {
    const isKey = KEY_EQUIPMENT.includes(e.equipment);
    if (isKey && !(e.demo_id && byId.has(e.demo_id))) {
      errs.push(`重点动作 ${e.slug}（${e.equipment}）必须有登记在 data/demos.json 的示范来源（§7.2）`);
    }
  }
  return errs;
}
```

- [ ] **Step 4: 实现 src/validate/links.mjs**

```js
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

if (process.argv[1]?.endsWith('links.mjs') && process.argv.includes('--external')) {
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');
  const root = path.resolve(import.meta.dirname, '..', '..');
  const claims = JSON.parse(await readFile(path.join(root, 'data/claims.json'), 'utf8'));
  const demos = JSON.parse(await readFile(path.join(root, 'data/demos.json'), 'utf8'));
  const urls = [...claims.flatMap((c) => c.sources.map((s) => s.url)),
                ...demos.map((d) => d.url).filter(Boolean)];
  const results = await checkExternalUrls(urls);
  for (const r of results) console.log(`${r.status.padEnd(9)} ${r.url}  ${r.detail}`);
  const dead = results.filter((r) => r.status === 'dead');
  const unchecked = results.filter((r) => r.status === 'unchecked');
  console.log(`\n合计 ${results.length}：可达 ${results.length - dead.length - unchecked.length}，失效 ${dead.length}，未检查 ${unchecked.length}`);
  if (dead.length) {
    console.error('失效链接必须在 data/demos.json 标记 dead=true（降级为文字+判据+失效提示），或更换来源。');
    process.exit(1);
  }
}
```

- [ ] **Step 5: 接进 src/data.mjs 与 build.mjs**

`data.mjs` 追加 `errs.push(...validateDemos(demos, { exercises }))`；`build.mjs` 在写文件前对最终 HTML 跑一次 `validateInternalLinks(html)`，有错即抛（这条确保 Review Focus #4 的"不静默产出残页"）。

- [ ] **Step 6: 登记高杠背蹲的示范并回填 demo_id**

在 `data/demos.json` 写入一条真实的、已人工打开核验过的机构官方示范（NSCA / ACSM / 主要器械品牌官方动作库其一），`verification` 逐条对照该卡的两条自检判据；把 `data/exercises.json` 里 `back-squat-high-bar.demo_id` 改为该 id。`goblet-squat` 若器械为哑铃，同样需要一条示范。

- [ ] **Step 7: 运行测试、外部链接检查与构建**

Run: `node --test tests/` → `npm run check:links` → `SKIP_COVERAGE=1 node src/build.mjs`
Expected: 测试全 PASS；链接检查输出每条 ok/unchecked，无 dead；构建成功

- [ ] **Step 8: 提交**

```bash
cd "$(git rev-parse --show-toplevel)"
git add src/validate/demos.mjs src/validate/links.mjs src/data.mjs src/build.mjs data/demos.json data/exercises.json tests/demos.test.mjs tests/links.test.mjs package.json
git commit -m "feat: 示范来源登记校验与内外链检查"
```

---

### Task 7: 双轨切换与 hash 路由（含未知锚点降级）

**Files:**
- Modify: `src/assets/app.js`, `src/render/page.mjs`, `src/assets/styles.css`
- Test: `tests/router.test.mjs`

**Interfaces:**
- Consumes: Task 1 的 `renderPage`
- Produces（`src/assets/app.js` 是 ESM，纯逻辑导出供 node 直接测试，DOM 接线包在 `typeof document !== 'undefined'` 守卫里）：
  - `export function resolveRoute(hash, knownIds): { track: 'learn'|'ref', target: string|null, missing: boolean }`
  - `export function trackOf(id): 'learn'|'ref'`

> `src/render/page.mjs` 的脚本标签同时改为 `<script type="module">`，并在页面里注入 `window.__IDS__`（全部锚点 id 数组）供路由判断。

- [ ] **Step 1: 写失败测试**

`tests/router.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoute, trackOf } from '../src/assets/app.js';

const known = new Set(['ch0', 'ch2', 'ex-back-squat-high-bar', 'plan-novice-3d', 'claim-protein-threshold']);

test('章节锚点落到学习路径轨', () => {
  assert.deepEqual(resolveRoute('#ch2', known), { track: 'learn', target: 'ch2', missing: false });
});

test('动作与模板锚点落到参考库轨', () => {
  assert.equal(resolveRoute('#ex-back-squat-high-bar', known).track, 'ref');
  assert.equal(resolveRoute('#plan-novice-3d', known).track, 'ref');
  assert.equal(resolveRoute('#claim-protein-threshold', known).track, 'ref');
});

test('空 hash 默认进学习路径且不报缺失', () => {
  assert.deepEqual(resolveRoute('', known), { track: 'learn', target: null, missing: false });
});

test('未知锚点标记 missing，保留原 hash 推断的轨道，不静默落回首章', () => {
  const r = resolveRoute('#ex-does-not-exist', known);
  assert.equal(r.missing, true);
  assert.equal(r.track, 'ref');
  assert.equal(r.target, null);
});

test('URL 编码的中文锚点能正确解码后判断', () => {
  assert.equal(resolveRoute('#' + encodeURIComponent('ch2'), known).target, 'ch2');
  assert.equal(resolveRoute('#%E4%B8%AD%E6%96%87', known).missing, true);
});

test('trackOf 覆盖四类前缀', () => {
  assert.equal(trackOf('ch10'), 'learn');
  assert.equal(trackOf('ex-x'), 'ref');
  assert.equal(trackOf('plan-x'), 'ref');
  assert.equal(trackOf('claim-x'), 'ref');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/router.test.mjs`
Expected: FAIL — `resolveRoute is not a function`

- [ ] **Step 3: 实现 src/assets/app.js 的路由部分**

```js
export function trackOf(id) {
  if (/^ch\d+$/.test(id)) return 'learn';
  if (/^(ex|plan|claim)-/.test(id)) return 'ref';
  return 'learn';
}

export function resolveRoute(hash, knownIds) {
  const raw = (hash || '').replace(/^#/, '');
  if (!raw) return { track: 'learn', target: null, missing: false };
  let id = raw;
  try { id = decodeURIComponent(raw); } catch { /* 保留原串 */ }
  const known = knownIds instanceof Set ? knownIds : new Set(knownIds);
  if (known.has(id)) return { track: trackOf(id), target: id, missing: false };
  return { track: trackOf(id), target: null, missing: true };
}

if (typeof document !== 'undefined') {
  const ids = new Set(window.__IDS__ || []);
  const notice = document.querySelector('.route-notice');

  function showTrack(track) {
    for (const el of document.querySelectorAll('.track')) {
      el.classList.toggle('is-active', el.dataset.track === track);
    }
    for (const btn of document.querySelectorAll('.track-switch button')) {
      btn.setAttribute('aria-selected', String(btn.dataset.track === track));
    }
  }

  function apply() {
    const { track, target, missing } = resolveRoute(location.hash, ids);
    showTrack(track);
    notice.hidden = !missing;
    if (missing) {
      notice.textContent = `没有找到 ${decodeURIComponent(location.hash.slice(1))} 这个条目——它可能已被删除或链接有误。可以从下面的目录重新找。`;
      notice.focus();
    } else if (target) {
      document.getElementById(target)?.scrollIntoView();
    }
  }

  document.querySelector('.track-switch').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-track]');
    if (!btn) return;
    showTrack(btn.dataset.track);
    history.pushState(null, '', btn.dataset.track === 'learn' ? '#ch0' : '#exercises');
  });

  window.addEventListener('hashchange', apply);
  window.addEventListener('popstate', apply);
  apply();
}
```

- [ ] **Step 4: 在 page.mjs 注入锚点清单与提示条**

```js
// renderPage 内，先从各片段收集 id：
const ids = [...`${chapterHtml}${exerciseHtml}${planHtml}${claimHtml}${quizHtml}`
  .matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
// <main> 之前插入：
//   <p class="route-notice" tabindex="-1" hidden role="status"></p>
// </body> 之前：
//   <script>window.__IDS__=${JSON.stringify(ids)}</script>
//   <script type="module">${js}</script>
```

同时给 `styles.css` 加：`.track { display: none } .track.is-active { display: block }`（无 JS 与打印下的兜底在 Task 9 处理）。

- [ ] **Step 5: 运行测试与构建**

Run: `node --test tests/` 然后 `SKIP_COVERAGE=1 node src/build.mjs`
Expected: 全部 PASS

- [ ] **Step 6: 人工确认（浏览器）**

```bash
open dist/index.html
```
依次验证：点"参考库"→ URL 变化；浏览器后退回到上一位置；直接打开 `dist/index.html#ex-back-squat-high-bar` 落到该卡；打开 `dist/index.html#ex-nope` 出现提示条且页面正常。

- [ ] **Step 7: 提交**

```bash
cd "$(git rev-parse --show-toplevel)"
git add src/assets/app.js src/render/page.mjs src/assets/styles.css tests/router.test.mjs
git commit -m "feat: 双轨切换与 hash 路由，未知锚点降级为提示"
```

---

### Task 8: 参考库筛选器与证据标签全局筛选（含空结果状态）

**Files:**
- Modify: `src/assets/app.js`, `src/render/exercises.mjs`, `src/render/plans.mjs`, `src/render/page.mjs`, `src/assets/styles.css`
- Test: `tests/filters.test.mjs`

**Interfaces:**
- Consumes: Task 7 的 `app.js` 结构、Task 3/4 渲染出的 `data-*` 属性
- Produces:
  - `export function matchesFilter(item, state): boolean`，`item = { pattern, equipment, muscles: string[], difficulty, level, days, goal, direction, certainty }`，`state` 为各维度的 `Set`（空 Set = 不限）
  - `export function countVisible(items, state): number`

- [ ] **Step 1: 写失败测试**

`tests/filters.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesFilter, countVisible } from '../src/assets/app.js';

const squat = { pattern: '蹲', equipment: '杠铃', muscles: ['股四头', '臀'], difficulty: '入门' };
const empty = { pattern: new Set(), equipment: new Set(), muscles: new Set(), difficulty: new Set() };

test('空筛选条件下全部可见', () => {
  assert.equal(matchesFilter(squat, empty), true);
});

test('同维度多选取并集', () => {
  assert.equal(matchesFilter(squat, { ...empty, equipment: new Set(['哑铃', '杠铃']) }), true);
});

test('跨维度取交集', () => {
  assert.equal(matchesFilter(squat, { ...empty, pattern: new Set(['蹲']), difficulty: new Set(['进阶']) }), false);
});

test('肌群维度按包含匹配', () => {
  assert.equal(matchesFilter(squat, { ...empty, muscles: new Set(['臀']) }), true);
  assert.equal(matchesFilter(squat, { ...empty, muscles: new Set(['胸']) }), false);
});

test('无交集组合返回 0，由调用方显示空状态', () => {
  const state = { ...empty, pattern: new Set(['搬运']), equipment: new Set(['固定器械']) };
  assert.equal(countVisible([squat], state), 0);
});

test('证据标签按 方向 与 确定性 两维独立筛选', () => {
  const claim = { direction: '未定', certainty: '低' };
  assert.equal(matchesFilter(claim, { direction: new Set(['未定']) }), true);
  assert.equal(matchesFilter(claim, { direction: new Set(['支持']) }), false);
  assert.equal(matchesFilter(claim, { direction: new Set(['未定']), certainty: new Set(['高']) }), false);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/filters.test.mjs`
Expected: FAIL — `matchesFilter is not a function`

- [ ] **Step 3: 实现筛选逻辑（追加到 src/assets/app.js 的导出区）**

```js
const ARRAY_DIMS = new Set(['muscles']);

export function matchesFilter(item, state) {
  for (const [dim, selected] of Object.entries(state ?? {})) {
    if (!selected || selected.size === 0) continue;
    const value = item[dim];
    if (value === undefined || value === null) return false;
    const hit = ARRAY_DIMS.has(dim) || Array.isArray(value)
      ? value.some((v) => selected.has(v))
      : selected.has(value);
    if (!hit) return false;
  }
  return true;
}

export function countVisible(items, state) {
  return items.filter((it) => matchesFilter(it, state)).length;
}
```

- [ ] **Step 4: DOM 接线（app.js 守卫块内追加）**

要点，逐条实现：
1. 筛选器区块 `.filters[data-for="exercises"]` / `[data-for="plans"]` / `[data-for="claims"]` 由渲染层输出复选按钮（维度与取值从数据 facet 生成，不写死）。
2. 点击切换 `state`，遍历对应卡片按 `data-*` 调 `matchesFilter`，用 `el.hidden = !hit` 控制显隐。
3. **每次筛选后更新计数条**：`已显示 N / 共 M 条`。
4. **N === 0 时显示空状态**：`<p class="empty-state">这组条件下没有任何条目——这通常意味着该组合本身不存在（例如固定器械很少覆盖搬运模式）。<button class="clear-filters">清除筛选</button></p>`，并把计数条保留可见。
5. `清除筛选` 按钮清空所有 `state` 并重新渲染。

- [ ] **Step 5: 渲染层输出筛选 UI 与空状态容器**

`renderExercises` 的 `.filters` 容器内按 facet 输出按钮：动作库维度 = 模式 / 器械 / 部位 / 难度；`renderPlans` 维度 = 水平 / 天数 / 目标；`renderClaimRegistry` 维度 = 方向 / 确定性。每个分组 `<fieldset data-dim="pattern"><legend>模式</legend><button data-value="蹲">蹲</button>…</fieldset>`，容器尾部固定输出 `<p class="result-count" role="status"></p>` 与隐藏的 `.empty-state`。

- [ ] **Step 6: 运行测试与构建**

Run: `node --test tests/` 然后 `SKIP_COVERAGE=1 node src/build.mjs`
Expected: 全部 PASS

- [ ] **Step 7: 人工确认**

`open dist/index.html` → 参考库 → 勾选"固定器械 + 搬运 + 入门"，确认出现空状态文案与"清除筛选"按钮且点击后恢复。

- [ ] **Step 8: 提交**

```bash
cd "$(git rev-parse --show-toplevel)"
git add src/assets/app.js src/render tests/filters.test.mjs src/assets/styles.css
git commit -m "feat: 参考库与证据标签筛选，空结果显式提示"
```

---

### Task 9: 主题、响应式与打印（含无 JS 兜底）

**Files:**
- Modify: `src/assets/styles.css`, `src/assets/app.js`, `src/render/page.mjs`
- Test: `tests/presentation.test.mjs`

**Interfaces:**
- Consumes: Task 7 的 `.track` 显隐机制
- Produces: `src/assets/app.js` 新增 `export function nextTheme(current): 'light'|'dark'`；页面 `<html data-theme>` 由 JS 写入，默认跟随系统

> **关键约束（Review Focus #3）**：`.track` 的隐藏必须由 JS 主动施加——HTML 默认两轨都可见，脚本运行后才给 `<body>` 加 `js-on` 类并启用 `display:none` 规则。这样无 JS 与打印时两轨内容完整呈现。

- [ ] **Step 1: 写失败测试**

`tests/presentation.test.mjs`：

```js
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

test('nextTheme 在 light/dark 间切换', () => {
  assert.equal(nextTheme('light'), 'dark');
  assert.equal(nextTheme('dark'), 'light');
});

test('构建产物不引用任何本地外部资源', async () => {
  const html = await build(root);
  assert.doesNotMatch(html, /(src|href)="(?!#|https:)[^"]+\.(css|js|svg|png|jpg|woff2?)"/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/presentation.test.mjs`
Expected: FAIL — CSS 规则缺失

- [ ] **Step 3: 补全 src/assets/styles.css**

按测试逐条实现：

```css
:root {
  color-scheme: light dark;
  --bg: #fcfcfa; --surface: #fff; --fg: #1b1b1a; --muted: #5d5d58;
  --rule: #d9d8d2; --accent: #7a4a1e; --warn-bg: #fdf1e7; --danger: #a2301c;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #15161a; --surface: #1d1f24; --fg: #e8e6e1; --muted: #a3a099;
    --rule: #33363d; --accent: #e0a46a; --warn-bg: #2a2119; --danger: #e0725c;
  }
}
:root[data-theme="dark"] {
  --bg: #15161a; --surface: #1d1f24; --fg: #e8e6e1; --muted: #a3a099;
  --rule: #33363d; --accent: #e0a46a; --warn-bg: #2a2119; --danger: #e0725c;
}
body { margin: 0; background: var(--bg); color: var(--fg); padding-block: 0; }
main { max-width: 68rem; margin: 0 auto; padding: 16px; }
img, svg { max-width: 100%; }
.table-wrap, table { display: block; overflow-x: auto; max-width: 100%; }

/* 无 JS 与打印时两轨都展开；只有脚本跑起来后才隐藏非活动轨 */
.js-on .track:not(.is-active) { display: none; }

@media (max-width: 400px) {
  main { padding: 12px; }
  .ex-grid { grid-template-columns: 1fr; }
  .site-head { flex-wrap: wrap; }
}

@media print {
  .track-switch, .filters, .toc, .theme-toggle, .route-notice { display: none !important; }
  .track { display: block !important; }
  [hidden] { display: revert !important; }
  details > summary { display: none; }
  details > *:not(summary) { display: block !important; }
  a[href^="http"]::after { content: "（" attr(href) "）"; font-size: 0.85em; word-break: break-all; }
  .chapter, .ex-card, .plan-card { break-inside: avoid-page; }
}
```

- [ ] **Step 4: app.js 补主题逻辑**

```js
export function nextTheme(current) { return current === 'dark' ? 'light' : 'dark'; }
// 守卫块内：
//   document.body.classList.add('js-on');   // 必须是脚本做的第一件事
//   读取 localStorage('theme')（try/catch 包裹），写 document.documentElement.dataset.theme
//   .theme-toggle 点击 → nextTheme → 写 dataset 与 localStorage（try/catch）
```

- [ ] **Step 5: 运行测试与构建**

Run: `node --test tests/` 然后 `SKIP_COVERAGE=1 node src/build.mjs`
Expected: 全部 PASS

- [ ] **Step 6: 人工确认**

浏览器打开产物：① 切深浅主题；② 开发者工具设宽度 390px 检查无横向滚动；③ `Cmd+P` 预览确认两轨内容都在、折叠的参考答案已展开、外部链接带 URL 脚注；④ 在开发者工具里禁用 JavaScript 刷新，确认两轨内容仍可读。

- [ ] **Step 7: 提交**

```bash
cd "$(git rev-parse --show-toplevel)"
git add src/assets tests/presentation.test.mjs src/render/page.mjs
git commit -m "feat: 深浅主题、窄屏与打印样式，无 JS 下两轨完整可读"
```

---

### Task 10: 四张概念图（内联 SVG）与图注规则

**Files:**
- Create: `assets/figures/sra-curve.svg`, `assets/figures/volume-response.svg`, `assets/figures/periodization-week.svg`, `assets/figures/energy-balance.svg`, `src/validate/figures.mjs`
- Modify: `src/build.mjs`（装载 figures 到 renderCtx）
- Test: `tests/figures.test.mjs`

**Interfaces:**
- Consumes: Task 2 的 `expandTokens`（`{{fig:<name>}}`）
- Produces: `export function validateFigures(figures): string[]`，`figures = Map<name, { svg, meta }>`；SVG 根元素上用 `data-kind="conceptual"|"quantitative"` 与 `data-claim="<claim id>"` 声明类型

- [ ] **Step 1: 写失败测试**

`tests/figures.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateFigures, loadFigures } from '../src/validate/figures.mjs';

const root = path.resolve(import.meta.dirname, '..');

test('四张必需概念图齐备', async () => {
  const files = await readdir(path.join(root, 'assets/figures'));
  for (const n of ['sra-curve.svg', 'volume-response.svg', 'periodization-week.svg', 'energy-balance.svg']) {
    assert.ok(files.includes(n), `缺少 ${n}`);
  }
});

test('概念图不得画数字刻度，且图注写明"示意，非个体预测"', () => {
  const svg = `<svg data-kind="conceptual" viewBox="0 0 400 200"><text x="10" y="20">时间</text>
    <text x="10" y="40">刺激</text></svg>`;
  assert.deepEqual(validateFigures(new Map([['x', { svg, caption: '示意图，表达趋势而非数值；不是对个体反应的预测' }]])), []);
  const withTicks = svg.replace('时间', '48 小时');
  assert.ok(validateFigures(new Map([['x', { svg: withTicks, caption: '示意图，表达趋势而非数值；不是对个体反应的预测' }]]))
    .some((e) => e.includes('数字刻度')));
  assert.ok(validateFigures(new Map([['x', { svg, caption: 'SRA 曲线' }]]))
    .some((e) => e.includes('示意')));
});

test('带数字刻度的图必须声明 quantitative 并引用 claim 与年份', () => {
  const svg = `<svg data-kind="quantitative" data-claim="claim-protein-threshold" viewBox="0 0 400 200"><text x="10" y="20">1.6 g/kg</text></svg>`;
  assert.deepEqual(validateFigures(new Map([['y', { svg, caption: '来源：Morton 等 2018' }]])), []);
  const noClaim = svg.replace(' data-claim="claim-protein-threshold"', '');
  assert.ok(validateFigures(new Map([['y', { svg: noClaim, caption: '来源：Morton 等 2018' }]]))
    .some((e) => e.includes('data-claim')));
});

test('标注文字必须落在 viewBox 内', () => {
  const svg = `<svg data-kind="conceptual" viewBox="0 0 400 200"><text x="460" y="20">越界</text></svg>`;
  assert.ok(validateFigures(new Map([['z', { svg, caption: '示意图，表达趋势而非数值；不是对个体反应的预测' }]]))
    .some((e) => e.includes('viewBox')));
});

test('取色必须走 currentColor 或主题变量', () => {
  const svg = `<svg data-kind="conceptual" viewBox="0 0 400 200"><path stroke="#ff0000" d="M0 0"/><text x="10" y="20">a</text></svg>`;
  assert.ok(validateFigures(new Map([['w', { svg, caption: '示意图，表达趋势而非数值；不是对个体反应的预测' }]]))
    .some((e) => e.includes('currentColor')));
});

test('仓库内四张图全部合规', async () => {
  const figures = await loadFigures(root);
  assert.deepEqual(validateFigures(figures), []);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/figures.test.mjs`
Expected: FAIL — 模块与 SVG 文件不存在

- [ ] **Step 3: 实现 src/validate/figures.mjs**

```js
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export async function loadFigures(root) {
  const dir = path.join(root, 'assets/figures');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.svg'));
  const out = new Map();
  for (const f of files) {
    const svg = await readFile(path.join(dir, f), 'utf8');
    const caption = svg.match(/<!--caption:([\s\S]*?)-->/)?.[1]?.trim() ?? '';
    out.set(path.basename(f, '.svg'), { svg, caption });
  }
  return out;
}

export function validateFigures(figures) {
  const errs = [];
  for (const [name, { svg, caption }] of figures) {
    const at = `assets/figures/${name}.svg`;
    const kind = svg.match(/data-kind="(conceptual|quantitative)"/)?.[1];
    if (!kind) { errs.push(`${at}: 根元素需声明 data-kind="conceptual" 或 "quantitative"`); continue; }
    const vb = svg.match(/viewBox="([-\d.\s]+)"/)?.[1]?.trim().split(/\s+/).map(Number);
    if (!vb || vb.length !== 4) { errs.push(`${at}: 缺少合法 viewBox`); continue; }
    const [vx, vy, vw, vh] = vb;
    for (const m of svg.matchAll(/<text[^>]*\sx="([-\d.]+)"[^>]*\sy="([-\d.]+)"/g)) {
      const x = Number(m[1]), y = Number(m[2]);
      if (x < vx || x > vx + vw || y < vy || y > vy + vh) {
        errs.push(`${at}: 标注文字 (${x}, ${y}) 落在 viewBox 外`);
      }
    }
    const texts = [...svg.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1]);
    const hasNumbers = texts.some((t) => /\d/.test(t));
    if (kind === 'conceptual') {
      if (hasNumbers) errs.push(`${at}: 概念图不得画数字刻度（§7.4），轴只标方向与定性标签`);
      if (!/示意/.test(caption) || !/个体/.test(caption)) {
        errs.push(`${at}: 概念图图注必须写明"示意图，表达趋势而非数值；不是对个体反应的预测"`);
      }
    } else {
      if (!/data-claim="claim-[a-z0-9-]+"/.test(svg)) errs.push(`${at}: 带数字刻度的图必须用 data-claim 引用登记表中的结论`);
      if (!/\d{4}/.test(caption)) errs.push(`${at}: 定量图图注必须写明来源与年份`);
    }
    for (const m of svg.matchAll(/(stroke|fill)="([^"]+)"/g)) {
      const v = m[2];
      if (!/^(currentColor|none|var\(--[a-z-]+\))$/.test(v)) {
        errs.push(`${at}: ${m[1]}="${v}" 必须用 currentColor / none / var(--token) 取色，深浅主题才都可读`);
      }
    }
  }
  return errs;
}
```

- [ ] **Step 4: 人工编写四张 SVG**

每张文件头部放 `<!--caption: …-->` 注释作为图注（`loadFigures` 读取），全部用 `currentColor` / `var(--accent)` / `none` 取色：

1. `sra-curve.svg`（第 3 章，conceptual）：横轴"时间 →"，纵轴"表现水平 →"，一条先降（疲劳）后升过基线（超量恢复）再回落的曲线；标出"刺激""恢复""适应""下一次刺激的窗口"四个定性标签，**无任何数字**。
2. `volume-response.svg`（第 2 章，conceptual）：横轴"每周每肌群组数 →"，纵轴"肥大反应 →"，一条先快速上升后边际递减、末端转平或略降的曲线；标"收益最快区""边际递减区""恢复能力上限"，无数字。
3. `periodization-week.svg`（第 5 章，conceptual）：一周 7 格的条带图，分别标"力量""力量""有氧""休息""力量""有氧/轻活动""休息"，并用高度表示相对负荷（标签写"较高/中等/低"，不写数字）。
4. `energy-balance.svg`（第 6 章，quantitative）：`data-claim` 指向一条登记过的增肌/减脂速率 claim；横轴为能量收支方向、纵轴为体重变化速率（如 `+0.25%~0.5% 体重/周`），刻度值必须来自该 claim，图注写"来源：<作者> <年份>"。

- [ ] **Step 5: 接进 build.mjs**

```js
import { loadFigures, validateFigures } from './validate/figures.mjs';
// build() 内，组装 renderCtx 前：
  const figs = await loadFigures(root);
  const figErrs = validateFigures(figs);
  if (figErrs.length) throw new Error(`概念图校验失败:\n- ${figErrs.join('\n- ')}`);
  // renderCtx.figures = new Map([...figs].map(([k, v]) => [k, `<figure class="concept">${v.svg}<figcaption>${v.caption}</figcaption></figure>`]));
```

- [ ] **Step 6: 运行测试与构建**

Run: `node --test tests/` 然后 `SKIP_COVERAGE=1 node src/build.mjs`
Expected: 全部 PASS

- [ ] **Step 7: 提交**

```bash
cd "$(git rev-parse --show-toplevel)"
git add assets/figures src/validate/figures.mjs src/build.mjs tests/figures.test.mjs
git commit -m "feat: 四张内联 SVG 概念图与图注刻度规则"
```

---

### Task 11: 动作库 A — 六大模式的主干杠铃／哑铃动作

**Files:**
- Modify: `data/exercises.json`, `data/demos.json`
- Test: `tests/exercises.test.mjs`（已存在的"仓库内 data/exercises.json 始终合规"一条即为闸门）

**Interfaces:**
- Consumes: Task 3 的 13 字段契约与 `validateExercises`、Task 6 的 `validateDemos`
- Produces: 每个主干动作的 `slug` 成为后续模板与章节可引用的锚点

**本任务要写进库的动作（每个一张完整 13 字段卡，变式分卡）：**

| 模式 | 杠铃 | 哑铃 |
|---|---|---|
| 蹲 | `back-squat-high-bar`、`back-squat-low-bar`、`front-squat` | `goblet-squat`、`db-bulgarian-split-squat`（单侧） |
| 髋铰链 | `conventional-deadlift`、`sumo-deadlift`、`romanian-deadlift` | `db-romanian-deadlift`、`db-hip-thrust` |
| 推 | `barbell-bench-press`、`incline-barbell-bench-press`、`overhead-press` | `db-bench-press`、`db-shoulder-press` |
| 拉 | `barbell-row`、`pendlay-row` | `db-one-arm-row`（单侧） |
| 搬运 | `barbell-front-rack-carry` | `db-farmer-carry`、`db-suitcase-carry`（单侧） |
| 核心抗阻 | `barbell-rollout`（或 `ab-wheel` 归自重，放 Task 12） | `db-pallof-press-alt`（弹力带版放 Task 12） |

- [ ] **Step 1: 先为每张卡写自检判据（字段 7），再写其余字段**

判据格式必须是 `criterion / how / cannot` 三段（§7.3），2–4 条，覆盖"最容易出错且后果最严重"的点。**自检不得要求在负重下改变握持或支撑**——需要改变负重方式才能验证的，一律写成"卸下负重或用空杆单独验证"。设计文档 §7.3 给出的高杠背蹲三条是格式范本，其中第 ② 条已含"不要在负重下松手测试"与疼痛处理口径，照此口径写其余卡。

- [ ] **Step 2: 写字段 11 安全设置与失败退出**

逐卡具体到动作，不得泛泛而谈：
- `barbell-bench-press`：`solo_ok: false`，`solo_alt: 'db-bench-press'`，`rack` 写"保护杆高度用空杆实测，确认力竭时能托住杠且不压胸"，`bailout` 写"落到保护杆上，不做滚杠卸载"。**这是 §5.1 的硬性前置条件在卡上的落地。**
- 所有杠铃动作 `collars` 一律写"两侧卡扣必须上紧，无例外"。
- 硬拉类 `bailout` 写"直接把杠放下，不抢救"。
- 搬运类写明"放下的方式与落点"。

- [ ] **Step 3: 为每张卡登记示范来源**

每条写进 `data/demos.json`，来源优先级按 §7.2：① 机构官方（NSCA / ACSM / 主要器械品牌官方动作库）→ ② 可识别资质的专业示范。**必须真的打开链接看过**，`verification` 逐条对照该卡字段 7 的每条判据写 `result`，`verified_on` 填当天日期、`verified_by` 填执行人。做不到逐条核验的动作，把 `demo_id` 留 `null` 并在 Task 18 的验收记录里登记为缺口——但杠铃/哑铃动作留空会被 `validateDemos` 挡住，所以这意味着该动作本轮不进库。

- [ ] **Step 4: 回填字段 9 home_alts 与字段 13 chapter_refs**

`home_alts` 指向 Task 12 将要写的自重/弹力带动作 slug——**因此本任务先把 Task 12 的目标 slug 以最小合规卡形式占位写入是不允许的**；正确做法是：Task 11 的 `home_alts` 只指向本任务已写完的卡（如 `barbell-bench-press → db-bench-press`），Task 12 写完自重动作后再回头调整为更合适的家庭替代。`chapter_refs` 一律至少含 `ch4`（动作模式），复合动作另加 `ch5`。

- [ ] **Step 5: 运行校验**

Run: `node --test tests/exercises.test.mjs tests/demos.test.mjs`
Expected: PASS（覆盖矩阵此时仍会缺自重/器械格子，由 `SKIP_COVERAGE=1` 暂时放行）

Run: `npm run check:links`
Expected: 无 `dead`

- [ ] **Step 6: 构建并人工抽查三张卡**

Run: `SKIP_COVERAGE=1 node src/build.mjs && open dist/index.html`
抽查 `#ex-barbell-bench-press`：独练条件、替代动作、脱身方式三项是否都在页面上一眼可见。

- [ ] **Step 7: 提交**

```bash
cd "$(git rev-parse --show-toplevel)"
git add data/exercises.json data/demos.json
git commit -m "content: 动作库主干杠铃与哑铃动作及示范核验记录"
```

---

### Task 12: 动作库 B — 器械／自重／弹力带，覆盖矩阵清零

**Files:**
- Modify: `data/exercises.json`, `data/demos.json`, `src/data.mjs`（移除 `SKIP_COVERAGE` 逃生门）
- Test: `tests/coverage.test.mjs`

**Interfaces:**
- Consumes: Task 3 的 `validateCoverage`
- Produces: 覆盖矩阵与肌群兜底全部满足，`SKIP_COVERAGE` 开关从代码中删除

**要补齐的格子：** 六大模式 × {固定器械, 自重或弹力带} 各 ≥1；六大模式各 ≥1 个"入门 + 自重或弹力带"；§2 的 13 个肌群各 ≥2 个动作且不全依赖同一器械类别（小腿、后束、肱二、肱三、腘绳通常是缺口，单关节动作在这里补：`seated-calf-raise`、`cable-face-pull`、`db-curl`、`cable-pushdown`、`lying-leg-curl` 等）。

- [ ] **Step 1: 写覆盖闸门测试**

`tests/coverage.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateCoverage } from '../src/validate/exercises.mjs';

const root = path.resolve(import.meta.dirname, '..');
const exercises = JSON.parse(await readFile(path.join(root, 'data/exercises.json'), 'utf8'));

test('覆盖矩阵与肌群兜底全部满足', () => {
  assert.deepEqual(validateCoverage(exercises), []);
});

test('动作数量落在设计估算的量级内（45–60），偏离需在评审中说明', () => {
  assert.ok(exercises.length >= 45 && exercises.length <= 60,
    `当前 ${exercises.length} 条，超出 §2 估算区间`);
});

test('每个家庭可做的入门版本都不依赖健身房器械', () => {
  for (const e of exercises.filter((x) => x.difficulty === '入门' && ['自重', '弹力带'].includes(x.equipment))) {
    assert.ok(!/器械|杠铃架|史密斯/.test(e.safety.setup + e.cues.map((c) => c.text).join('')),
      `${e.slug} 标为家庭可做但要点中出现健身房器械`);
  }
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/coverage.test.mjs`
Expected: FAIL — 列出所有缺口格子与肌群

- [ ] **Step 3: 按失败输出逐格补卡**

每补一批跑一次 `node --test tests/coverage.test.mjs`，把报错列表当作待办清单消到空。每张卡仍须满足 13 字段（字段 7、11 不得为空），自重动作的字段 11 写"失败时怎么安全结束"（如引体向下放、俯卧撑落膝）。**质量门槛先于数量**：写不出可核验自检判据的动作不进库，宁可该格子只有一个动作。

- [ ] **Step 4: 回头优化 Task 11 各卡的 home_alts**

把主干动作的家庭替代指向本任务新建的自重/弹力带动作（如 `barbell-bench-press → push-up`、`back-squat-high-bar → bodyweight-squat` 或 `goblet-squat`）。

- [ ] **Step 5: 删除逃生门**

`src/data.mjs` 中 `if (process.env.SKIP_COVERAGE !== '1')` 改为无条件 `errs.push(...validateCoverage(exercises))`；全仓搜索确认无残留：

```bash
cd "$(git rev-parse --show-toplevel)" && grep -rn "SKIP_COVERAGE" --include="*.mjs" --include="*.js" --include="*.json" . ; echo "exit=$?"
```
Expected: 无输出（grep exit=1）

- [ ] **Step 6: 全量校验与构建**

Run: `node --test tests/` → `npm run check:links` → `node src/build.mjs`
Expected: 全部 PASS；构建不再需要任何环境变量

- [ ] **Step 7: 提交**

```bash
cd "$(git rev-parse --show-toplevel)"
git add data/exercises.json data/demos.json src/data.mjs tests/coverage.test.mjs
git commit -m "content: 动作库补齐覆盖矩阵与肌群兜底，移除覆盖检查逃生门"
```

---

### Task 13: 五套计划模板

**Files:**
- Modify: `data/plans.json`
- Test: `tests/plans.test.mjs`（追加一条"五套齐备"）

**Interfaces:**
- Consumes: Task 4 的 `validatePlans`、Task 11/12 的动作 slug
- Produces: `novice-3d`、`upper-lower-4d`、`ppl-6d`、`home-3d`、`cut-maintain-3d` 五个锚点

- [ ] **Step 1: 追加闸门测试**

在 `tests/plans.test.mjs` 末尾加：

```js
test('五套模板齐备且 slug 固定', async () => {
  const plans = JSON.parse(await readFile(path.join(root, 'data/plans.json'), 'utf8'));
  assert.deepEqual(plans.map((p) => p.slug).sort(),
    ['cut-maintain-3d', 'home-3d', 'novice-3d', 'ppl-6d', 'upper-lower-4d']);
});

test('每套模板的替代动作与被替代动作属于同一动作模式', async () => {
  const plans = JSON.parse(await readFile(path.join(root, 'data/plans.json'), 'utf8'));
  const exercises = JSON.parse(await readFile(path.join(root, 'data/exercises.json'), 'utf8'));
  const pattern = new Map(exercises.map((e) => [e.slug, e.pattern]));
  for (const p of plans) {
    for (const s of p.substitutions) {
      for (const alt of s.alts) {
        assert.equal(pattern.get(alt), pattern.get(s.exercise),
          `${p.slug}: ${alt} 与 ${s.exercise} 不同模式`);
      }
    }
  }
});

test('家庭模板不使用健身房器械', async () => {
  const plans = JSON.parse(await readFile(path.join(root, 'data/plans.json'), 'utf8'));
  const exercises = new Map(JSON.parse(await readFile(path.join(root, 'data/exercises.json'), 'utf8'))
    .map((e) => [e.slug, e]));
  const home = plans.find((p) => p.slug === 'home-3d');
  for (const d of home.week) {
    for (const it of d.items ?? []) {
      assert.ok(['自重', '弹力带', '哑铃'].includes(exercises.get(it.exercise).equipment),
        `home-3d 用到了 ${it.exercise}（${exercises.get(it.exercise).equipment}）`);
    }
  }
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/plans.test.mjs`
Expected: FAIL — 只有 `novice-3d`

- [ ] **Step 3: 写满五套模板的 11 字段**

逐套按 Task 4 的契约写；下列是各套必须有自己答案、不能相互抄的字段：

| 模板 | 字段 2 有氧放置 | 字段 6 进阶 | 字段 7 增量不匹配 | 字段 11 出口 |
|---|---|---|---|---|
| `novice-3d` | 独立日 Zone 2，25–30 分钟 | 线性，每次训练上调 | double progression | 线性停滞 → `upper-lower-4d` |
| `upper-lower-4d` | 力量日之后或独立日 | 每周上调 + RIR 控制 | 小配重片 | 周内恢复不足反复 → `ppl-6d` 或减频 |
| `ppl-6d` | 低强度，仅安排在腿日之外 | 波动（重/中/轻） | 先加组再加重 | 睡眠/恢复撑不住 → 退回 `upper-lower-4d` |
| `home-3d` | 与力量同日之后 | 加次数 → 加难度变式 → 加弹力带阻力 | 以变式难度替代重量增量 | 弹力带最大阻力下仍 RIR ≥ 3 → 转健身房模板 |
| `cut-maintain-3d` | 每周 2–3 次，明确"不是靠有氧造赤字的唯一手段" | **维持为主，不追求加重** | 不适用，保持重量 | 减脂期结束 → 回 `novice-3d`/`upper-lower-4d` |

字段 4 的 `start_load_refs` 对每套的主要动作给区间并注明"区间是常见起点示例，个体差异大，以流程实测为准"。字段 9 的 `pain_path` 五套写法必须一致口径：当场停止该动作 + 当次不用替代动作继续练同一部位 + 红旗征或持续关节痛就医 + 诱因纠正后按字段 4 重新起步。

- [ ] **Step 4: 运行测试与构建**

Run: `node --test tests/` → `node src/build.mjs`
Expected: 全部 PASS，五个 `id="plan-*"` 都在产物中

- [ ] **Step 5: 提交**

```bash
cd "$(git rev-parse --show-toplevel)"
git add data/plans.json tests/plans.test.mjs
git commit -m "content: 五套计划模板，各自的有氧安排、进阶规则与出口条件"
```

---

### Task 14: 第 0–2 章（导读含两块前置安全内容、肌肉为什么会长、训练变量）

**Files:**
- Modify: `content/ch0.html`, `content/ch1.html`, `content/ch2.html`, `data/claims.json`
- Test: `tests/ch0.test.mjs`

**Interfaces:**
- Consumes: Task 5 的章节结构契约、Task 2 的 `{{claim:}}`、Task 10 的 `{{fig:volume-response}}`
- Produces: 第 1–2 章建立的术语与变量命名，后续各章一律沿用（负荷强度 / 容量 / 频率 / RIR / 动作选择 / 节奏 / 组间休息）

- [ ] **Step 1: 写导读结构的失败测试**

`tests/ch0.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const ch0 = await readFile(path.join(root, 'content/ch0.html'), 'utf8');

test('导读含红旗征速查，覆盖 §5.1 列出的全部征象', () => {
  assert.match(ch0, /<section class="red-flags"/);
  for (const s of ['胸痛', '晕厥', '静息呼吸困难', '夜间痛醒', '外伤后', '鞍区麻木', '体重骤降']) {
    assert.ok(ch0.includes(s), `红旗征缺少「${s}」`);
  }
  assert.match(ch0, /立即停(止|练).*就医|立即就医/);
});

test('导读含「第一次训练前必读」七项', () => {
  const sec = ch0.match(/<section class="first-session">([\s\S]*?)<\/section>/)?.[1];
  assert.ok(sec, '缺少 first-session 小节');
  for (const [k, re] of [
    ['先做什么', /体检|咨询/],
    ['器械设置通则', /卡扣必上|卡扣必须上紧/],
    ['保护杆高度', /空杆实测/],
    ['失败退出方式', /没练过退出方式[^。]*不做/],
    ['卧推硬性前置', /保护杆[\s\S]{0,80}保护者[\s\S]{0,120}(都没有|两者都没)[\s\S]{0,40}不做/],
    ['首次负荷', /第一次不测极限/],
    ['练中不适', /疼痛不是("|「)?减量继续/],
  ]) {
    assert.match(sec, re, `「第一次训练前必读」缺少：${k}`);
  }
});

test('导读说明证据分级是两维且三种方向', () => {
  for (const s of ['支持', '反对', '未定', '高', '中', '低']) assert.ok(ch0.includes(s));
  assert.match(ch0, /absence of evidence|没有证据.*不等于/);
});

test('导读给出术语地图与两轨使用说明', () => {
  assert.match(ch0, /<section class="glossary"|术语/);
  assert.match(ch0, /学习路径[\s\S]{0,200}参考库/);
});

test('导读不含任何免卡扣表述与疼痛减量说法', () => {
  assert.doesNotMatch(ch0, /(不上|免|不用|无需|可不)\s*卡扣/);
  assert.doesNotMatch(ch0, /(疼痛|痛)[^。]{0,20}(减量|降重|deload)[^。]{0,20}继续/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/ch0.test.mjs`
Expected: FAIL — 骨架里没有这些小节

- [ ] **Step 3: 写 content/ch0.html**

按 §5.1 写满：① 如何使用本教程（双轨、锚点可分享、打印）；② 术语地图（在第 1–9 章出现前先给一句话定义：组、次、RIR、容量、频率、渐进超负荷、deload、分化、干扰效应）；③ 证据分级说明（两维、三方向、三确定性、"未定"为何单列，引 Cochrane Handbook 第 15 章）；④ `<section class="red-flags">` 红旗征速查；⑤ `<section class="first-session">` 第一次训练前必读七项，逐项照 §5.1 原文口径写，其中卡扣、保护杆、失败退出、卧推前置条件、首次负荷、独练、练中不适七条都要有自己的小标题。文末按 Task 5 的结构补自测清单与练习任务（任务例：照着「第一次训练前必读」给自己写出下次进健身房的前 10 分钟清单）。

- [ ] **Step 4: 写 content/ch1.html（肌肉为什么会长）**

机械张力为主驱动；代谢压力与肌肉损伤的真实地位（损伤不是必要条件，酸痛不是进步指标）。每条可争议结论都写成 `{{claim:…}}` 并在 `data/claims.json` 补齐记录（至少：机械张力主导、训练后酸痛与肥大不相关、肌肉损伤非必要）。练习任务：用本章原理解释"为什么练完不酸不代表白练"。

- [ ] **Step 5: 写 content/ch2.html（训练变量）**

七个旋钮逐个定义 + 各自的证据现状 + 调一个会影响哪些别的；插入 `{{fig:volume-response}}`；补 claims（每周每肌群组数与肥大的剂量反应、低负荷高次数在接近力竭时的等效性、组间休息时长、训练到力竭的必要性等），方向与确定性严格按证据写，拿不出反证的坊间说法一律 `未定·低`。练习任务：记录一次训练的七个变量（给记录表模板与参考答案）。

- [ ] **Step 6: 运行测试与构建**

Run: `node --test tests/` → `node src/build.mjs`
Expected: 全部 PASS（章节结构校验 + ch0 专项 + claim 引用完整性）

- [ ] **Step 7: 提交**

```bash
cd "$(git rev-parse --show-toplevel)"
git add content/ch0.html content/ch1.html content/ch2.html data/claims.json tests/ch0.test.mjs
git commit -m "content: 第 0–2 章，导读含红旗征与第一次训练前必读七项"
```

---

### Task 15: 第 3–5 章（渐进超负荷、动作模式与功能解剖、计划构建）

**Files:**
- Modify: `content/ch3.html`, `content/ch4.html`, `content/ch5.html`, `data/claims.json`
- Test: `tests/crossrefs.test.mjs`

**Interfaces:**
- Consumes: Task 10 的 `{{fig:sra-curve}}`、`{{fig:periodization-week}}`；Task 11/12 的动作 slug；Task 13 的模板 slug
- Produces: 第 4 章是动作库的理论接口、第 5 章是计划模板的理论接口——两处的反向链接由本任务的测试强制

- [ ] **Step 1: 写双轨接缝的失败测试**

`tests/crossrefs.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from '../src/build.mjs';

const root = path.resolve(import.meta.dirname, '..');

test('每个动作的 chapter_refs 在产物中都是可点回链', async () => {
  const html = await build(root);
  const exercises = JSON.parse(await readFile(path.join(root, 'data/exercises.json'), 'utf8'));
  for (const e of exercises) {
    const card = html.match(new RegExp(`<article class="ex-card" id="ex-${e.slug}"[\\s\\S]*?</article>`))?.[0];
    assert.ok(card, `产物缺少 ${e.slug} 的卡`);
    for (const ref of e.chapter_refs) assert.ok(card.includes(`href="#${ref}"`), `${e.slug} 缺到 ${ref} 的回链`);
  }
});

test('第 4 章正链到动作库、第 5 章正链到计划模板', async () => {
  const ch4 = await readFile(path.join(root, 'content/ch4.html'), 'utf8');
  const ch5 = await readFile(path.join(root, 'content/ch5.html'), 'utf8');
  for (const p of ['推', '拉', '蹲', '髋铰链', '搬运', '核心抗阻']) {
    assert.ok(ch4.includes(p), `第 4 章未覆盖模式「${p}」`);
  }
  assert.ok((ch4.match(/\{\{ex:/g) ?? []).length >= 6, '第 4 章应为六大模式各举至少一个动作链接');
  assert.ok((ch5.match(/\{\{plan:/g) ?? []).length >= 5, '第 5 章应链到全部五套模板');
});

test('第 3 章使用 SRA 概念图', async () => {
  const ch3 = await readFile(path.join(root, 'content/ch3.html'), 'utf8');
  assert.ok(ch3.includes('{{fig:sra-curve}}'));
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/crossrefs.test.mjs`
Expected: FAIL — 章节仍是骨架

- [ ] **Step 3: 写 content/ch3.html**

SRA 曲线（插 `{{fig:sra-curve}}`）、适应阈值、渐进超负荷的多条路径（重量 / 次数 / 组数 / 缩短休息 / 提高质量）、停滞的四类成因（刺激不足、恢复不足、营养不足、测量误差）——这四类是 §9.2「停滞分析」情境题的推导来源，必须在本章讲到能推。练习任务：给一段四周训练记录，判断属于哪一类停滞。

- [ ] **Step 4: 写 content/ch4.html**

六大模式各自的定义、关节动作与主要肌群、长度—张力关系、关节力矩如何随角度变化（这是"为什么同一肌群需要不同角度动作"的推导基础）。每个模式至少 `{{ex:…}}` 链一个代表动作。练习任务：为自己每个模式各选一个动作并说明理由（参考答案给出判断要点：器械可得性、该模式的安全前置条件、与其他模式的重叠）。

- [ ] **Step 5: 写 content/ch5.html**

分化方式（全身/上下肢/推拉腿）各自适用条件、周期化（线性/波动/板块）、deload 的时机与做法、频率与容量如何在一周里分配；插 `{{fig:periodization-week}}`；`{{plan:…}}` 链到全部五套模板并说明各自适合谁。练习任务：用某套模板草拟自己的一周安排。

- [ ] **Step 6: 运行测试与构建**

Run: `node --test tests/` → `node src/build.mjs`
Expected: 全部 PASS

- [ ] **Step 7: 提交**

```bash
cd "$(git rev-parse --show-toplevel)"
git add content/ch3.html content/ch4.html content/ch5.html data/claims.json tests/crossrefs.test.mjs
git commit -m "content: 第 3–5 章与双轨反向链接接缝"
```

---

### Task 16: 第 6–9 章（营养、恢复与疲劳、有氧与心肺、伤病预防与疼痛）

**Files:**
- Modify: `content/ch6.html`, `content/ch7.html`, `content/ch8.html`, `content/ch9.html`, `data/claims.json`
- Test: `tests/ch9.test.mjs`

**Interfaces:**
- Consumes: Task 10 的 `{{fig:energy-balance}}`；Task 2 的安全 claim 门槛（`safety: true`）
- Produces: 第 9 章的疼痛判断原则是全站疼痛口径的权威出处，动作卡与模板字段 9 都指回这里

- [ ] **Step 1: 写第 9 章口径的失败测试**

`tests/ch9.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const ch9 = await readFile(path.join(root, 'content/ch9.html'), 'utf8');
const ch6 = await readFile(path.join(root, 'content/ch6.html'), 'utf8');

test('第 9 章给出疼痛 vs 酸胀的区分与停止规则', () => {
  assert.match(ch9, /酸胀/);
  assert.match(ch9, /停止(该)?动作/);
  assert.doesNotMatch(ch9, /(疼痛|痛)[^。]{0,24}(deload|减量|降重|换(一个)?动作)[^。]{0,16}继续/);
});

test('第 9 章覆盖腰膝肩三类损伤机制与热身的作用边界', () => {
  for (const s of ['腰', '膝', '肩', '热身']) assert.ok(ch9.includes(s));
  assert.match(ch9, /热身[^。]{0,40}(不能|无法|并不)/, '需写明热身的作用边界而非万能');
});

test('涉及就医判断的结论必须是 safety 级 claim', async () => {
  const claims = JSON.parse(await readFile(path.join(root, 'data/claims.json'), 'utf8'));
  const ids = [...ch9.matchAll(/\{\{claim:([a-z0-9-]+)\}\}/g)].map((m) => m[1]);
  const safety = claims.filter((c) => ids.includes(c.id) && c.safety === true);
  assert.ok(safety.length >= 3, '第 9 章至少应有 3 条标记 safety 的结论');
});

test('第 6 章不含食谱餐单与补剂品牌（§2 排除项）', () => {
  assert.doesNotMatch(ch6, /早餐[：:]|午餐[：:]|晚餐[：:]|食谱/);
  assert.doesNotMatch(ch6, /(品牌|牌子|推荐购买|某某牌)/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/ch9.test.mjs`
Expected: FAIL

- [ ] **Step 3: 写 content/ch6.html（营养）**

能量收支（插 `{{fig:energy-balance}}`）、蛋白质阈值与分配、增肌期/减脂期速率区间、碳水与脂肪的作用、补剂**按证据分级谈作用机制与效应量，不提品牌、不给餐单**。每条结论挂 claim。练习任务：按自己的体重算出蛋白质目标区间，并说明这个数字的来源与不确定性。

- [ ] **Step 4: 写 content/ch7.html（恢复与疲劳）**

睡眠对合成代谢与表现的作用、疲劳的识别信号（睡眠债、静息心率升高、广泛酸胀不退、连续表现下滑——与模板字段 8 的 `underrecovery` 口径一致）、过度训练 vs 训练不足的区分、deload 的指征与做法。**显式写明：疲劳走 deload，疼痛不走。** 练习任务：用一周自我记录判断自己是恢复不足还是刺激不足。

- [ ] **Step 5: 写 content/ch8.html（有氧与心肺）**

干扰效应的真实量级（模式、频率、时长、肌群重叠如何影响）与规避办法；心肺健康的独立价值（与增肌目标无关也该做）；强度区间的定义与自测方法（说话测试）。练习任务：给自己的周计划安排有氧并说明放置理由。

- [ ] **Step 6: 写 content/ch9.html（伤病预防与疼痛）**

腰/膝/肩的常见损伤机制（接上第 4 章的力矩与第 7 章的疲劳）、热身的作用与它办不到的事、疼痛 vs 酸胀的判断原则、红旗征（回链 `#ch0` 的速查）、**什么时候停、什么时候就医、什么时候可以恢复训练**。安全结论按 §4.3 的更高门槛登记（来源限 ACSM / NSCA / WHO / 骨科或运动医学学会），`safety: true`。练习任务：给三段主诉，判断"继续、停这个动作、还是就医"。

- [ ] **Step 7: 运行测试与构建**

Run: `node --test tests/` → `npm run check:links` → `node src/build.mjs`
Expected: 全部 PASS，无 dead 链接

- [ ] **Step 8: 提交**

```bash
cd "$(git rev-parse --show-toplevel)"
git add content/ch6.html content/ch7.html content/ch8.html content/ch9.html data/claims.json tests/ch9.test.mjs
git commit -m "content: 第 6–9 章，疼痛判断原则作为全站权威口径"
```

---

### Task 17: 第 10 章「指导他人基础」与 ≥12 道情境题

**Files:**
- Modify: `content/ch10.html`, `data/quiz.json`
- Create: `src/validate/quiz.mjs`, `src/render/quiz.mjs`
- Modify: `src/data.mjs`, `src/build.mjs`
- Test: `tests/quiz.test.mjs`, `tests/ch10.test.mjs`

**Interfaces:**
- Consumes: 第 1–9 章全部内容
- Produces:
  - `export function validateQuiz(quiz, { chapters }): string[]`
  - 情境题契约：`{ id, category: '选动作'|'调计划'|'停滞分析'|'指导边界', scenario, model_answer, reasoning_chapters: ['ch3','ch7'], judging_points: [...] }`

- [ ] **Step 1: 写失败测试**

`tests/quiz.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateQuiz } from '../src/validate/quiz.mjs';

const root = path.resolve(import.meta.dirname, '..');
const chapters = new Set(JSON.parse(await readFile(path.join(root, 'content/chapters.json'), 'utf8')).map((c) => c.id));
const quiz = JSON.parse(await readFile(path.join(root, 'data/quiz.json'), 'utf8'));

test('四类情境题各 ≥3 道，总数 ≥12', () => {
  assert.deepEqual(validateQuiz(quiz, { chapters }), []);
  assert.ok(quiz.length >= 12);
  for (const c of ['选动作', '调计划', '停滞分析', '指导边界']) {
    assert.ok(quiz.filter((q) => q.category === c).length >= 3, `${c} 不足 3 道`);
  }
});

test('每题必须标明推导经过哪几章（不能靠"教程里写过"回答）', () => {
  for (const q of quiz) {
    assert.ok(q.reasoning_chapters.length >= 1, `${q.id} 未标明推导章节`);
    for (const ch of q.reasoning_chapters) assert.ok(chapters.has(ch), `${q.id} 指向不存在的章节 ${ch}`);
  }
});

test('指导边界类必须含至少一例应转介、一例信息不足需追问', () => {
  const boundary = quiz.filter((q) => q.category === '指导边界');
  assert.ok(boundary.some((q) => /转介|去找|就医/.test(q.model_answer)));
  assert.ok(boundary.some((q) => /追问|信息不足|还需要问/.test(q.model_answer)));
});

test('选动作类必须包含一处受限条件', () => {
  const pick = quiz.filter((q) => q.category === '选动作');
  assert.ok(pick.some((q) => /肩痛史|腰伤|时间只有|没有器械|受限/.test(q.scenario)));
});

test('缺参考答案或判断要点的题被拒', () => {
  const bad = [{ id: 'q-x', category: '选动作', scenario: 's', model_answer: '', reasoning_chapters: ['ch4'], judging_points: [] }];
  const errs = validateQuiz(bad, { chapters });
  assert.ok(errs.some((e) => e.includes('model_answer')));
  assert.ok(errs.some((e) => e.includes('judging_points')));
});
```

`tests/ch10.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const ch10 = await readFile(path.join(root, 'content/ch10.html'), 'utf8');

test('第 10 章五节齐备', () => {
  for (const s of ['先问什么', '什么该转介出去', '怎么看动作', '怎么调计划', '指导能力自测']) {
    assert.ok(ch10.includes(s), `缺少小节「${s}」`);
  }
});

test('转介边界清单覆盖 §5.2 列出的全部情形并给出话术', () => {
  for (const s of ['红旗征', '康复', '怀孕', '未成年', '进食障碍', '慢性病']) {
    assert.ok(ch10.includes(s), `边界清单缺少「${s}」`);
  }
  assert.match(ch10, /不知道就说不知道/);
  assert.match(ch10, /话术|可以这样说/);
});

test('调计划三个案例齐备，每个都写出"哪里信息不够必须再问"', () => {
  const cases = ch10.match(/<section class="case"[\s\S]*?<\/section>/g) ?? [];
  assert.equal(cases.length, 3);
  for (const c of cases) {
    assert.match(c, /推导/);
    assert.match(c, /还需要问|信息不够|必须再问/);
  }
});

test('不含商业带训内容（§2 排除项）', () => {
  assert.doesNotMatch(ch10, /定价|获客|合同|收费标准|教练认证/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/quiz.test.mjs tests/ch10.test.mjs`
Expected: FAIL

- [ ] **Step 3: 实现 src/validate/quiz.mjs**

```js
const CATEGORIES = ['选动作', '调计划', '停滞分析', '指导边界'];

export function validateQuiz(quiz, { chapters }) {
  const errs = [];
  if (!Array.isArray(quiz)) return ['data/quiz.json: 顶层必须是数组'];
  const seen = new Set();
  quiz.forEach((q, i) => {
    const at = `data/quiz.json[${i}] (${q?.id ?? '无 id'})`;
    if (!/^q-[a-z0-9-]+$/.test(q?.id ?? '')) errs.push(`${at}: id 必须是 q-<slug>`);
    else if (seen.has(q.id)) errs.push(`${at}: id 重复`);
    else seen.add(q.id);
    if (!CATEGORIES.includes(q?.category)) errs.push(`${at}: category 必须是 ${CATEGORIES.join('/')}`);
    if (!q?.scenario || q.scenario.length < 20) errs.push(`${at}: scenario 必须给足情境信息`);
    if (!q?.model_answer) errs.push(`${at}: model_answer 必填（参考答案）`);
    if (!(q?.judging_points ?? []).length) errs.push(`${at}: judging_points 必填（判断要点）`);
    const refs = q?.reasoning_chapters ?? [];
    if (!refs.length) errs.push(`${at}: reasoning_chapters 必填——答案必须能从某章原理推出`);
    refs.forEach((r) => { if (!chapters.has(r)) errs.push(`${at}: reasoning_chapters 指向不存在的章节 ${r}`); });
  });
  if (quiz.length < 12) errs.push(`data/quiz.json: 至少 12 道，当前 ${quiz.length}`);
  for (const c of CATEGORIES) {
    const n = quiz.filter((q) => q.category === c).length;
    if (n < 3) errs.push(`data/quiz.json: 类别「${c}」至少 3 道，当前 ${n}`);
  }
  return errs;
}
```

- [ ] **Step 4: 实现 src/render/quiz.mjs**

输出 `<section id="quiz"><h2>能力自测：情境题</h2>` + 每题 `<article class="quiz-item" id="q-…">`，题干可见，参考答案放 `<details class="model-answer">`（打印时由 Task 9 的样式展开），底部列出"推导经过：第 N 章"的锚点链接。

- [ ] **Step 5: 写 content/ch10.html 五节**

照 §5.2 逐节写：① 结构化访谈清单（每个问题后写"不问会错在哪"）；② 边界清单与转介话术示例，含"不知道就说不知道"；③ 观察顺序（先安全后效率）、看的角度、把 §7.3 判据转到旁观视角、一次只纠一个点、反馈三段式（描述现象 → 说后果 → 给一个具体调整）；④ 三个完整案例，各自 `<section class="case">`，每个写"别人提供的信息 → 推导过程 → 建议 → 哪里信息不够必须再问"；⑤ 指导能力自测，正文链到 `#quiz` 的「指导边界」类题目。

- [ ] **Step 6: 写 data/quiz.json（≥12 道）**

四类各 ≥3 道，按 §9.2 的要求：选动作题带器械条件、时间限制与一处受限；调计划题给训练记录要求判断加重/维持/deload 并指出依据的规则；停滞分析题给表现曲线与睡眠/进食/缺课信息要求区分四类成因；指导边界题至少一例应转介、一例信息不足需追问。**每题写完后自查：这题的参考答案能不能只靠"教程某处写过这条"回答？如果能，说明对应章节原理没写够——回去补写那一章，而不是改题。**

- [ ] **Step 7: 接进 data.mjs 与 build.mjs**

```js
import { validateQuiz } from './validate/quiz.mjs';
  errs.push(...validateQuiz(quiz, { chapters: new Set(chapters.map((c) => c.id)) }));
// build.mjs：renderPage(..., { quizHtml: renderQuiz(data.quiz, renderCtx) })
```

- [ ] **Step 8: 运行测试与构建**

Run: `node --test tests/` → `node src/build.mjs`
Expected: 全部 PASS

- [ ] **Step 9: 提交**

```bash
cd "$(git rev-parse --show-toplevel)"
git add content/ch10.html data/quiz.json src/validate/quiz.mjs src/render/quiz.mjs src/data.mjs src/build.mjs tests/quiz.test.mjs tests/ch10.test.mjs
git commit -m "content: 第 10 章指导他人基础与 12 道情境题"
```

---

### Task 18: 全站安全扫描、人工验收记录与发布

**Files:**
- Create: `src/validate/safety.mjs`, `docs/acceptance/source-audit.md`, `docs/acceptance/safety-review.md`, `docs/acceptance/zero-experience-readthrough.md`, `docs/acceptance/delivery-check.md`
- Modify: `src/build.mjs`, `package.json`
- Test: `tests/safety.test.mjs`

**Interfaces:**
- Consumes: 全部内容任务的产物
- Produces: `export function scanSafety(html): string[]`——对**最终 HTML 全文**（而非单个数据文件）做 §9.3 第 11 条的红线扫描；构建在有命中时失败

- [ ] **Step 1: 写失败测试**

`tests/safety.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { scanSafety } from '../src/validate/safety.mjs';
import { build } from '../src/build.mjs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

test('免卡扣表述被扫出', () => {
  assert.ok(scanSafety('<p>轻重量时可以不上卡扣</p>').some((e) => e.includes('卡扣')));
  assert.ok(scanSafety('<p>熟练后无需卡扣</p>').length > 0);
});

test('把疼痛并进疲劳调整的表述被扫出', () => {
  assert.ok(scanSafety('<p>如果肩膀疼就先 deload 一周</p>').some((e) => e.includes('疼痛')));
  assert.ok(scanSafety('<p>关节痛的话换个同模式动作继续练</p>').length > 0);
  assert.ok(scanSafety('<p>有点痛就把重量降 10% 接着做</p>').length > 0);
});

test('AI 生成图的痕迹被扫出', () => {
  assert.ok(scanSafety('<img src="data:image/png;base64,AAAA">').some((e) => e.includes('图')));
  assert.ok(scanSafety('<p>下图由 AI 生成</p>').length > 0);
});

test('未写完的占位内容被扫出', () => {
  assert.ok(scanSafety('<p>本章待撰写</p>').some((e) => e.includes('占位')));
  assert.ok(scanSafety('<p>TODO: 补充</p>').length > 0);
});

test('合规文本不误报', () => {
  assert.deepEqual(scanSafety('<p>两侧卡扣必须上紧，无例外。出现疼痛先停止该动作，按第 9 章判断是否就医。</p>'), []);
  assert.deepEqual(scanSafety('<p>恢复不足时先插入一周 deload，而不是先降重量。</p>'), []);
});

test('最终产物通过全站安全扫描', async () => {
  const html = await build(root);
  assert.deepEqual(scanSafety(html), []);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/safety.test.mjs`
Expected: FAIL — 模块不存在

- [ ] **Step 3: 实现 src/validate/safety.mjs**

```js
const RULES = [
  { re: /(不上|免|不用|无需|可不|没必要上)\s*卡扣/g,
    msg: '出现"不上卡扣"类表述，全站禁止（§5.1 / §9.3-11d）' },
  { re: /(疼痛|疼|痛)[^。；\n]{0,24}(deload|减量|降(重|重量)|减(重|重量)|换(一个)?(同模式)?动作)[^。；\n]{0,16}(继续|接着|再练|练)/g,
    msg: '把疼痛并入疲劳调整规则（§9.3-11e）：疼痛必须导向停止该动作与第 9 章就医判断' },
  { re: /(deload|减量|降重)[^。；\n]{0,16}(来|以)?(处理|应对|缓解)[^。；\n]{0,8}(疼痛|疼|痛)/g,
    msg: '用 deload／减量作为疼痛处理方案（§9.3-11e）' },
  { re: /<img[^>]+src="data:image\/(png|jpe?g|webp)/g,
    msg: '内嵌位图可能是 AI 生成的动作或解剖图（§9.1-9）：动作示范走外部核验链接，概念图走内联 SVG' },
  { re: /(AI\s*生成|由\s*AI\s*绘制|gpt-image|midjourney|stable\s*diffusion)/gi,
    msg: '出现 AI 生成图痕迹（§7.2.1）' },
  { re: /(待撰写|待补充|TODO|TBD|占位|lorem ipsum)/gi,
    msg: '存在未完成的占位内容' },
];

export function scanSafety(html) {
  const errs = [];
  for (const { re, msg } of RULES) {
    for (const m of html.matchAll(re)) {
      const start = Math.max(0, m.index - 40);
      errs.push(`${msg} —— 命中「${html.slice(start, m.index + m[0].length + 40).replace(/\s+/g, ' ')}」`);
    }
  }
  return errs;
}
```

- [ ] **Step 4: 在 build.mjs 写文件前接入**

```js
import { scanSafety } from './validate/safety.mjs';
  const safetyErrs = scanSafety(html);
  if (safetyErrs.length) throw new Error(`安全红线扫描失败:\n- ${safetyErrs.join('\n- ')}`);
```

- [ ] **Step 5: 跑全量自动验收（§9.1 全部条目）**

```bash
cd "$(git rev-parse --show-toplevel)"
node --test tests/ && npm run check:links && node src/build.mjs && echo "自动验收通过"
```
Expected: 测试全绿、无 dead 链接、构建成功。任一失败即回到对应任务修订，不得跳过。

- [ ] **Step 6: 人工验收 ①——来源核验（§9.3 第 10 条）**

随机抽 ≥15 条 claim（安全相关的 100% 抽），逐条打开来源确认"确实支持所写结论 / 人群可外推 / 分级理由成立"，把结果写进 `docs/acceptance/source-audit.md`：

```markdown
# 来源核验记录（§9.3 第 10 条）
核验人： / 日期：
| claim id | 来源是否支持该结论 | 人群可否外推 | 分级理由是否成立 | 处理 |
|---|---|---|---|---|
| claim-… | 是 | 是 | 是 | 保留 |
安全相关 claim 清单（100% 核验）：…
```

- [ ] **Step 7: 人工验收 ②——安全内容复核（§9.3 第 11 条）**

逐条检查导读「第一次训练前必读」、所有动作卡字段 11、所有模板字段 8/9/10、所有自检判据的 (a)–(e) 五问，写进 `docs/acceptance/safety-review.md`（每张卡一行，五列 a–e）。**有一处不合格即不通过**，回改后重跑 Step 5。

- [ ] **Step 8: 人工验收 ③——零经验试读（§9.3 第 12 条）**

请至少 1 位无健身房经验的人读第 0–2 章与 3 张动作卡，回答三个问题：第一次训练做什么动作、用多重、做不动怎么办。把原话与卡住的环节记进 `docs/acceptance/zero-experience-readthrough.md`，每个卡住的环节登记为缺陷并修订。

- [ ] **Step 9: 发布为 Artifact 并做交付可用性验收（§9.3 第 13 条）**

用 Artifact 工具发布 `dist/index.html`（标题「系统化健身知识教程」，favicon 一个即可，首次发布后记录 URL；更新时复用同一 URL，链接不变）。随后在手机与桌面各打开一次，验证双轨切换、筛选、锚点分享、浏览器前进后退、打印导出，记进 `docs/acceptance/delivery-check.md`（含发布 URL 与两端截图说明）。

- [ ] **Step 10: 提交**

```bash
cd "$(git rev-parse --show-toplevel)"
git add src/validate/safety.mjs src/build.mjs tests/safety.test.mjs docs/acceptance
git commit -m "feat: 全站安全红线扫描；docs: 四份人工验收记录与发布"
```

---

## 自查记录（写完计划后的 self-review）

- **规范覆盖**：§1 交付形态→Task 1/9/18；§2 覆盖矩阵与排除项→Task 3/12/16/17；§3 双轨→Task 7；§4 证据分级与登记表→Task 2；§5 章节依赖→Task 5/14/15/16；§5.1 两块前置安全内容→Task 14（测试逐项断言）；§5.2 第 10 章五节→Task 17；§5.3 练习链→Task 5 的结构校验 + 各内容任务；§6.1 十三字段→Task 3/11/12；§6.2 十一字段→Task 4/13；§6.3 五套模板→Task 13；§7.1–7.3 示范与自检→Task 6/11；§7.4 四张 SVG→Task 10；§8 网页形态→Task 7/8/9；§9.1 结构验收→Task 1–13 的测试；§9.2 情境题→Task 17；§9.3 人工验收→Task 18。
- **类型一致性**：`validateX(list, ctx) -> string[]` 在全部校验器中统一；动作用 `slug`、结论用 `id`、模板用 `slug`，锚点一律 `#ex-/#plan-/#claim-/#ch`；`renderCtx` 的六个 Map 在 Task 5 定义后被 Task 8/10/17 沿用，键名不变。
- **已知的顺序依赖**：覆盖矩阵检查在 Task 3 引入时带 `SKIP_COVERAGE` 逃生门，Task 12 删除它——这是计划内唯一的临时开关，Task 12 的 Step 5 用 grep 确认已清除。
