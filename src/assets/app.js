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
}
