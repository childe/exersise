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
