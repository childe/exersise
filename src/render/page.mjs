export function renderPage(data, parts) {
  const { css, js, animJs = '', chapterHtml = '', exerciseHtml = '', atlasHtml = '', planHtml = '',
          claimHtml = '', quizHtml = '' } = parts;
  // 路由靠这张表判断锚点属于哪条轨道——新加的区块不进表，链接过去就不会切到参考库
  const ids = [...`${chapterHtml}${exerciseHtml}${atlasHtml}${planHtml}${claimHtml}${quizHtml}`
    .matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
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
<p class="route-notice" tabindex="-1" hidden role="status"></p>
<main>
  <section id="track-learn" class="track is-active" data-track="learn">${chapterHtml}${quizHtml}</section>
  <section id="track-ref" class="track" data-track="ref">${exerciseHtml}${atlasHtml}${planHtml}${claimHtml}</section>
</main>
<script>window.__IDS__=${JSON.stringify(ids)}</script>
<script type="module">${js}</script>
<script type="module">${animJs}</script>
</body>
</html>
`;
}
