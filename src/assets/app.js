// 容器锚点（两轨自身与参考库里的三个分区）必须显式登记所属轨道：
// 它们不带 ex-/plan-/claim- 前缀，靠前缀推断会落回 learn，
// 结果是点「参考库」写入 #exercises、刷新后却停在学习轨、目标被藏起来。
export const CONTAINER_TRACK = Object.freeze({
  'track-learn': 'learn',
  'track-ref': 'ref',
  exercises: 'ref',
  plans: 'ref',
  claims: 'ref',
});

export function trackOf(id) {
  if (Object.hasOwn(CONTAINER_TRACK, id)) return CONTAINER_TRACK[id];
  if (/^ch\d+$/.test(id)) return 'learn';
  if (/^(ex|plan|claim)-/.test(id)) return 'ref';
  return 'learn';
}

// 某个锚点可能被哪个筛选面板隐藏（null = 不受筛选影响）。
export function filterGroupOf(id) {
  if (/^ex-/.test(id)) return 'exercises';
  if (/^plan-/.test(id)) return 'plans';
  if (/^claim-/.test(id)) return 'claims';
  return null;
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

  // 筛选面板登记处：路由要靠它在跳转前把被筛掉的目标放出来。
  const panels = new Map(); // group -> { clear() }

  function reveal(target) {
    const el = document.getElementById(target);
    if (!el) return;
    // 目标被筛选器藏起来时，光 scrollIntoView 是无效的——先解除这一组筛选，
    // 并同步按钮状态与计数，读者才看得到"为什么整组又变回来了"。
    const group = filterGroupOf(target);
    if (group && el.hidden) panels.get(group)?.clear();
    el.scrollIntoView();
  }

  function apply() {
    const { track, target, missing } = resolveRoute(location.hash, ids);
    showTrack(track);
    notice.hidden = !missing;
    if (missing) {
      notice.textContent = `没有找到 ${decodeURIComponent(location.hash.slice(1))} 这个条目——它可能已被删除或链接有误。可以从下面的目录重新找。`;
      notice.focus();
    } else if (target) {
      reveal(target);
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

  // ——— 证据筛选的全站部分 ———
  // 设计 §8 要求证据标签「可全局筛选」：登记表之外，学习正文、动作卡与图注里的
  // 每个证据标签也要跟着标出来。这里只做"命中/不命中"的视觉降权，不隐藏正文——
  // 隐藏正文会让一段话读起来是另一个意思；安全提示里的标签则永不降权。
  const SAFETY_SCOPE = '.safety, .safety-note, .safety-box, [data-safety]';

  function applyEvidenceFilterSiteWide(state) {
    const active = Object.values(state ?? {}).some((s) => s && s.size > 0);
    document.body.classList.toggle('evidence-filtering', active);
    let hit = 0;
    const tags = document.querySelectorAll('.claim-tag[data-direction]');
    for (const tag of tags) {
      const pinned = tag.closest(SAFETY_SCOPE) !== null;
      const match = matchesFilter(
        { direction: tag.dataset.direction, certainty: tag.dataset.certainty },
        state,
      );
      if (match) hit += 1;
      tag.classList.toggle('is-off', active && !match && !pinned);
      tag.classList.toggle('is-on', active && match);
      tag.classList.toggle('is-pinned', active && !match && pinned);
    }
    const scope = document.querySelector('.evidence-scope');
    if (scope) {
      scope.textContent = active
        ? `全站 ${tags.length} 处证据标签中，${hit} 处命中当前条件（正文不隐藏，只标出；安全提示始终完整显示）`
        : `证据筛选同时作用于全站 ${tags.length} 处证据标签`;
    }
  }

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
      // 证据筛选是全站的：登记表之外，正文、动作卡与图注里的证据标签同步标出，
      // 不命中的只降权（不隐藏正文，安全提示任何时候都不被筛走）。
      if (group === 'claims') applyEvidenceFilterSiteWide(state);
    }

    function clearAll() {
      for (const s of Object.values(state)) s.clear();
      for (const b of panel.querySelectorAll('fieldset button')) b.setAttribute('aria-pressed', 'false');
      refresh();
    }
    panels.set(group, { clear: clearAll });

    panel.addEventListener('click', (e) => {
      const clear = e.target.closest('.clear-filters');
      if (clear) {
        clearAll();
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

    // 肌肉分布图与「部位」筛选是同一个状态的两个入口：
    // 点图上的肌群，等同于点下面那一排按钮，两边的 aria-pressed 必须一起变。
    if (group === 'exercises') {
      const syncMap = () => {
        const on = state.muscles ?? new Set();
        for (const el of document.querySelectorAll('#muscle-map [data-muscle]')) {
          el.classList.toggle('is-on', on.has(el.dataset.muscle));
          if (el.tagName === 'BUTTON') el.setAttribute('aria-pressed', String(on.has(el.dataset.muscle)));
        }
      };
      const toggleMuscle = (name) => {
        if (!name || !state.muscles) return;
        const fs = panel.querySelector('fieldset[data-dim="muscles"]');
        const btn = fs?.querySelector(`button[data-value="${CSS.escape(name)}"]`);
        if (!btn) return; // 没有任何动作练它，就没有对应按钮，点了不该有反应
        if (state.muscles.has(name)) state.muscles.delete(name);
        else state.muscles.add(name);
        btn.setAttribute('aria-pressed', String(state.muscles.has(name)));
        syncMap();
        refresh();
        document.getElementById('exercises')?.scrollIntoView({ block: 'start' });
      };
      const map = document.getElementById('muscle-map');
      map?.addEventListener('click', (e) => {
        const t = e.target.closest('[data-muscle]');
        if (t) toggleMuscle(t.dataset.muscle);
      });
      map?.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const t = e.target.closest('[data-muscle]');
        if (!t) return;
        e.preventDefault();
        toggleMuscle(t.dataset.muscle);
      });
      const prevClear = clearAll;
      panels.set(group, { clear: () => { prevClear(); syncMap(); } });
      syncMap();
    }

    refresh();
  }

  // 路由要在筛选器登记之后跑：首屏直接打开一个被默认筛选藏住的锚点也要能放出来。
  apply();

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
