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
