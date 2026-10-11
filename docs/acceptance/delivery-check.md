# 交付可用性验收记录（§9.3 第 13 条）

## 发布能力预检（Task 1 Step 1b，2026-10-11）

1. **工具可用性**：当前会话工具清单中存在 `Artifact` 工具（支持 `publish` / `list` / `read` /
   `update` 等 action）。预检结论：**可用**，走主路径，不需要启用退路。
2. **具体工具与上传方式**：`Artifact` 工具，单文件发布。产物自包含（CSS / JS / SVG 全部内联），
   不依赖任何本地相对资源，因此不需要 `files` 附件。
3. **访问模型**：发布后默认私有，链接可分享（unlisted）。页面不含任何个人健康数据
   （见计划的 Global Constraints），因此链接外泄的后果仅限于内容公开，可接受。
4. **更新行为**：同一 `file_path` 在同一会话内重复发布 → 同一 URL 原地更新；跨会话更新必须带
   `url` 参数指向已发布的 Artifact。首次发布后把 URL 记在下面的「发布记录」一节，后续一律带该
   URL 更新，不再新建。
5. **退路（本次未启用）**：若 Artifact 不可用，产物仍是自包含的 `dist/index.html`，改为
   「交付文件 + 任一静态托管」——优先 GitLab Pages，其次直接交付 `dist/index.html` 文件本身
   （双击即可在浏览器打开，功能不依赖服务器）。

## 发布记录

| 日期 | URL | 说明 |
|---|---|---|
| 2026-10-12 | https://claude.ai/artifact/NcoN5i5QGYfaBLDiwpbCSd | 首次发布（Version 1）。标题「系统化健身知识教程」，favicon 🏋️。后续更新一律带这个 URL，链接不变。 |
| 2026-10-12 | 同上（Version 2） | 第一轮评审修复后原地更新：容器锚点轨道登记、锚点跳转解除筛选遮挡、证据筛选全站生效、示范核验状态结构化、来源实质核验后的分级修正。链接不变。 |

### 一个与预检记录的偏差（已确认，记录在案）

预检时写的是"`file_path` 指向 `dist/index.html`"。实际发布用的是 `dist/artifact.html`。
原因：Artifact 平台会在发布时为页面补上 `<!doctype html>…<head>…</head><body>` 外壳，
直接上传一份完整 HTML 文档会产生嵌套的 `<html>`/`<body>`。因此 `src/build.mjs` 在写出
`dist/index.html` 的同时，用同一份渲染结果去掉文档外壳写出 `dist/artifact.html`
（只留 `<title>` / `<style>` / 正文 / `<script>`）。两份文件同源、同一次构建产出：

- `dist/index.html`：完整文档，双击即可在本地浏览器打开——这是退路里的"直接交付文件"形态；
- `dist/artifact.html`：发布形态。

## 自动验收（2026-10-12 第二轮重跑）

| 项目 | 命令 | 结果 |
|---|---|---|
| 全部测试 | `node --test tests/` | 第三轮：见本文件末尾「第三轮重跑」一节 |
| 外链发布级检查 | `npm run check:links:release` | 合计 47 条：可达 47、失效 0、未检查 0 |
| 构建（含覆盖矩阵、内部锚点、安全红线 hard 扫描） | `node src/build.mjs` | 成功；hard 扫描 0 命中；soft 扫描 3 处待复核，已在 `safety-review.md` 逐条判定 |
| 占位内容清零 | `grep -rn "本章待撰写\|TODO\|TBD\|待补充" content/ dist/index.html` | 无命中 |

## 两端验收（2026-10-12 在真实浏览器里跑过）

验收方式：`tests/browser.test.mjs` 通过 CDP 驱动本机的 Chromium 内核浏览器
（Microsoft Edge 155.0.4283.45，`--headless=new`）打开构建产物，**真正点按钮、改 hash、按后退、
切打印媒体、改视口**，再读回 DOM 与 computed style。这不是对源码的文本断言，而是页面在浏览器里的实际行为。
两个被测对象都验了：本地形态 `dist/index.html`，以及发布形态 `dist/artifact.html`（按平台的方式补上
`<!doctype html><head></head><body>` 外壳后再打开）。

跑法：`node --test tests/browser.test.mjs`（本机没有 Chromium 内核浏览器时整组自动跳过，
可用 `CHROME_BIN` 指定）。2026-10-12 结果：**9 项全部通过**。

| 检查项 | 怎么验 | 桌面（1280×800，Edge 155 headless） | 窄屏（390×844，移动视口模拟） |
|---|---|---|---|
| 双轨切换 + URL | 点「参考库」，读 `location.hash` 与 `.track.is-active` | 通过：hash 变为 `#exercises`，激活轨为 ref | 同一份断言，视口无关 |
| 刷新后仍在原轨 | 带 `#exercises` 硬刷新 | 通过（这是本轮修掉的缺陷：此前 `#exercises` 被判成学习轨） | 同上 |
| 浏览器后退 | `history.back()` 后读激活轨 | 通过：回到学习路径 | 同上 |
| 容器锚点分享 | 直接打开 `#plans` / `#claims`，读 `offsetParent` 与提示条 | 通过：两者都可见，不触发"锚点失效"提示 | 同上 |
| 筛选 → 锚点跳转 | 勾「自重」把杠铃卡筛掉，再跳 `#ex-back-squat-high-bar` | 通过：卡片重新显示，筛选按钮与计数同步复位（本轮修掉的缺陷） | 同上 |
| 筛选与空状态 | 勾互斥组合后读 `.empty-state` | 通过（`tests/filters.test.mjs` + 渲染层断言，浏览器侧验了隐藏/计数联动） | 同上 |
| 证据筛选的全站效果 | 在登记表里勾「反对」，读学习轨里证据标签的 class 与正文长度 | 通过：不命中的标签降权、命中的高亮，正文一个字没少，安全提示里的标签不降权 | 同上 |
| 禁用 JS 后两轨完整 | `Emulation.setScriptExecutionDisabled` 后硬刷新，读两轨 computed display | 通过：两轨都不是 `none`，参考库正文完整 | 同上 |
| 打印 / 导出 PDF | `Emulation.setEmulatedMedia: print` 后读 computed display | 通过：切换器与筛选器 `none`，两轨 `block` | 同上 |
| **真的导出一次 PDF** | `Page.printToPDF`（A4、含背景）导出 `dist/artifact.pdf`，再核对文件与内容 | 通过：5.6 MB、**132 页**，两轨完整展开；全部 **53 条外部来源链接**在 PDF 里一条不少（`tests/print-pdf.test.mjs`） | 同一份导出 |
| ≤400px 窄屏 | 设 390×844 视口，比较 `documentElement.scrollWidth` 与 `innerWidth` | — | 通过：无横向溢出 |
| 深浅主题 | 点主题按钮后刷新，读 `data-theme` | 通过：切换生效且刷新后保持 | 同上 |
| 发布形态（artifact.html） | 补平台外壳后打开，重跑切轨 + 筛选 + 锚点跳转，并检查没有嵌套 `html/body` | 通过 | 同上 |

### 这份记录覆盖不到的部分（仍属人工）

- **真机**：上面"窄屏"是移动视口模拟，不是 iOS / Android 真机。真机特有的问题（触摸目标大小、
  Safari 的 `100vh`、系统字体放大）需要在手机上开一次链接才能确认。
- **打印机的实际出纸**：PDF 已经真导出并核对过页数与外链脚注（见上表），但没有真打到纸上，
  也没有人逐页看过 132 页里每一页的分页位置好不好看（例如动作卡是否被切成两页）。
  这一条要人翻一遍导出的 `dist/artifact.pdf`。
- **读者是否读得懂**：见 `zero-experience-readthrough.md`，那条必须由人来做。


## 第三轮重跑（2026-10-12，第 2 轮评审意见修复后）

| 项目 | 命令 | 结果 |
|---|---|---|
| 全部测试 | `node --test tests/` | 见 `.xdev/.../test-results.txt` 的完整输出（含 9 项浏览器测试 + 2 项真实 PDF 导出测试） |
| 外链发布级检查 | `npm run check:links:release` | **合计 53：可达 53、失效 0、未检查 0**（本轮外链从 47 条增加到 53 条） |
| 真实 PDF 导出 | `node --test tests/print-pdf.test.mjs` | 通过：132 页、53 条外链齐全 |

### 仍然只能由人完成的两条（本轮没有假装做掉）

1. **手机真机 + 最终发布链接**：本轮验的仍是本地产物与模拟视口。发布链接在真机上的表现
   （触摸目标、Safari 的 100vh、系统字体放大、长按复制）必须有人拿手机打开一次。
2. **零经验读者试读**：见 `zero-experience-readthrough.md`。
