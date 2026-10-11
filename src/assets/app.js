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

export function nextTheme(current) { return current === 'dark' ? 'light' : 'dark'; }

if (typeof document !== 'undefined') {
  document.body.classList.add('js-on'); // 必须是脚本做的第一件事：无 JS 时两轨都可见
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

  // ——— 筛选器 ———
  const CARD_SELECTOR = {
    exercises: '.ex-card',
    plans: '.plan-card',
    claims: '.claim-entry',
  };

  function itemOf(el, group) {
    if (group === 'exercises') {
      return {
        pattern: el.dataset.pattern,
        equipment: el.dataset.equipment,
        difficulty: el.dataset.difficulty,
        muscles: (el.dataset.muscles || '').split(' ').filter(Boolean),
      };
    }
    if (group === 'plans') {
      return { level: el.dataset.level, days: el.dataset.days, goal: el.dataset.goal };
    }
    return { direction: el.dataset.direction, certainty: el.dataset.certainty };
  }

  for (const panel of document.querySelectorAll('.filters[data-for]')) {
    const group = panel.dataset.for;
    const cards = [...document.querySelectorAll(CARD_SELECTOR[group])];
    const count = panel.querySelector('.result-count');
    const emptyState = panel.querySelector('.empty-state');
    const state = {};
    for (const fs of panel.querySelectorAll('fieldset[data-dim]')) state[fs.dataset.dim] = new Set();

    function refresh() {
      let visible = 0;
      for (const el of cards) {
        const hit = matchesFilter(itemOf(el, group), state);
        el.hidden = !hit;
        if (hit) visible += 1;
      }
      if (count) count.textContent = `已显示 ${visible} / 共 ${cards.length} 条`;
      if (emptyState) emptyState.hidden = visible !== 0;
    }

    panel.addEventListener('click', (e) => {
      const clear = e.target.closest('.clear-filters');
      if (clear) {
        for (const s of Object.values(state)) s.clear();
        for (const b of panel.querySelectorAll('fieldset button')) b.setAttribute('aria-pressed', 'false');
        refresh();
        return;
      }
      const btn = e.target.closest('fieldset[data-dim] button');
      if (!btn) return;
      const dim = btn.closest('fieldset').dataset.dim;
      const value = btn.dataset.value;
      if (state[dim].has(value)) state[dim].delete(value);
      else state[dim].add(value);
      btn.setAttribute('aria-pressed', String(state[dim].has(value)));
      refresh();
    });

    refresh();
  }

  // ——— 主题 ———
  let stored = null;
  try { stored = localStorage.getItem('theme'); } catch { /* 隐私模式等场景下读不到 */ }
  if (stored === 'light' || stored === 'dark') document.documentElement.dataset.theme = stored;
  document.querySelector('.theme-toggle')?.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme
      || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = nextTheme(current);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch { /* 写不进去就只在本次会话生效 */ }
  });
}
