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

### 一个与预检记录的偏差（已确认，记录在案）

预检时写的是"`file_path` 指向 `dist/index.html`"。实际发布用的是 `dist/artifact.html`。
原因：Artifact 平台会在发布时为页面补上 `<!doctype html>…<head>…</head><body>` 外壳，
直接上传一份完整 HTML 文档会产生嵌套的 `<html>`/`<body>`。因此 `src/build.mjs` 在写出
`dist/index.html` 的同时，用同一份渲染结果去掉文档外壳写出 `dist/artifact.html`
（只留 `<title>` / `<style>` / 正文 / `<script>`）。两份文件同源、同一次构建产出：

- `dist/index.html`：完整文档，双击即可在本地浏览器打开——这是退路里的"直接交付文件"形态；
- `dist/artifact.html`：发布形态。

## 自动验收（2026-10-12 已执行）

| 项目 | 命令 | 结果 |
|---|---|---|
| 全部测试 | `node --test tests/` | 123 项全部通过 |
| 外链发布级检查 | `npm run check:links:release` | 合计 46 条：可达 46、失效 0、未检查 0 |
| 构建（含覆盖矩阵、内部锚点、安全红线 hard 扫描） | `node src/build.mjs` | 成功；hard 扫描 0 命中；soft 扫描 3 处待复核，已在 `safety-review.md` 逐条判定 |
| 占位内容清零 | `grep -rn "本章待撰写\|TODO\|TBD\|待补充" content/ dist/index.html` | 无命中 |

## 两端人工验收（**未完成，需在浏览器里做**）

下面这些必须在真实浏览器里点一遍才算数；实现阶段只能保证它们在代码与测试层面成立，
保证不了"在你的手机上点下去确实是这样"。逐项验完后把结果填进来。

| 检查项 | 怎么验 | 代码层面的现状 | 桌面 | 手机 |
|---|---|---|---|---|
| 双轨切换 | 点顶部「学习路径 / 参考库」，看 URL 变化 | `tests/router.test.mjs` 覆盖 `resolveRoute`/`trackOf` | 待填 | 待填 |
| 筛选与空状态 | 参考库里勾「固定器械 + 搬运 + 入门」，应出现空状态文案与「清除筛选」 | `tests/filters.test.mjs` 覆盖匹配逻辑；渲染层固定输出 `.empty-state` | 待填 | 待填 |
| 锚点分享（含不存在的锚点） | 打开 `...#ex-back-squat-high-bar` 应落到该卡；打开 `...#ex-nope` 应出现提示条且页面正常 | `resolveRoute` 对未知锚点返回 `missing:true`，不静默回首章 | 待填 | 待填 |
| 浏览器前进 / 后退 | 切轨道后按后退，应回到上一位置 | `popstate`/`hashchange` 均已接线 | 待填 | 待填 |
| 禁用 JS 后两轨完整 | DevTools → Disable JavaScript → 硬刷新，两轨正文都应完整可读 | CSS 中不存在无条件隐藏 `.track` 的规则，`tests/presentation.test.mjs` 逐条断言 | 待填 | 待填 |
| 打印 / 导出 PDF | `Cmd+P` 预览：切换器与筛选器隐藏、两轨展开、折叠的参考答案展开、外链带 URL 脚注 | `@media print` 规则齐备并有测试断言 | 待填 | 待填 |
| ≤400px 窄屏 | DevTools 设 390px 宽，确认无横向滚动 | `@media (max-width: 400px)` + 表格 `overflow-x:auto`；无 ≥700px 的 `min-width` | 待填 | 待填 |
| 深浅主题 | 点主题按钮来回切；再把系统主题切到深色看默认表现 | token 在 `:root` / `prefers-color-scheme` / `[data-theme]` 三处成对定义 | 待填 | 待填 |
