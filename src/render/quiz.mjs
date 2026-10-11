import { escapeHtml } from './claims.mjs';
import { expandTokens } from './tokens.mjs';

function item(q, ctx) {
  const chaps = q.reasoning_chapters
    .map((r) => `<a href="#${r}">${escapeHtml(ctx.chapterTitles.get(r) ?? r)}</a>`).join('、');
  return `
<article class="quiz-item" id="${q.id}" data-category="${escapeHtml(q.category)}">
  <h3>${escapeHtml(q.category)}</h3>
  <p class="scenario">${escapeHtml(q.scenario)}</p>
  <details class="model-answer">
    <summary>参考答案与判断要点</summary>
    <p>${escapeHtml(q.model_answer)}</p>
    <ul>${q.judging_points.map((p) => `<li>判断要点：${escapeHtml(p)}</li>`).join('')}</ul>
  </details>
  <p class="xrefs">推导经过：${chaps}</p>
</article>`;
}

export function renderQuiz(quiz, ctx) {
  const body = quiz.map((q) => expandTokens(item(q, ctx), ctx)).join('\n');
  return `<section id="quiz"><h2>能力自测：情境题</h2>
<p>每题先自己写出答案，再展开参考答案对照。参考答案不是标准答案，是"一个合格回答长什么样 + 判断要点"；
每题都标明了它的推导经过哪几章——如果你只能靠"教程里好像写过"来回答，回去读那几章。</p>
${body}</section>`;
}
