// 骨架动画驱动。
//
// 渐进增强：没有 JS、或读者开了"减少动态效果"时，动作卡仍是原来那两帧静态图，
// 信息不缺一条。有 JS 时在两帧之后追加一格循环演示——静态两帧看不出轨迹，
// 而动作卡的自检判据反复要求"逐帧看下降和上升两段"，轨迹正是它们要看的东西。
//
// 性能：55 张卡不会各跑一个 rAF。一个共享循环 + IntersectionObserver，
// 只重绘当前在视口里的那几格；标签页切走时整个停掉。

const REP = 4.2;                       // 一次完整起落的秒数
const SVG_NS = 'http://www.w3.org/2000/svg';
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);

export function initSkeletonAnimation({ POSES, interpolate, renderPose }) {
  if (typeof document === 'undefined') return null;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return null;

  const items = [];
  for (const fig of document.querySelectorAll('figure.skeleton[data-anim]')) {
    let cfg;
    try { cfg = JSON.parse(fig.dataset.anim); } catch { continue; }
    if (!POSES[cfg.a] || !POSES[cfg.b]) continue;
    const [x, y, w, h] = cfg.box;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    svg.setAttribute('class', 'sk-frame sk-anim' + (w / h > 1.6 ? ' sk-wide' : ''));
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${fig.dataset.exercise}·循环演示`);
    fig.insertBefore(svg, fig.querySelector('figcaption'));
    // 自重动作把模板里的负荷摘掉——照着练一副不存在的杠铃就是教错
    const strip = (p) => (cfg.no_load ? { ...p, load: undefined } : p);
    items.push({ svg, cfg, box: { x, y, w, h },
      A: strip(POSES[cfg.a]), B: strip(POSES[cfg.b]), visible: false, t: 0 });
  }
  if (!items.length) return null;

  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      const it = items.find((i) => i.svg === en.target);
      if (it) it.visible = en.isIntersecting;
    }
  }, { rootMargin: '120px' });
  for (const it of items) io.observe(it.svg);

  const draw = (it) => {
    const ph = it.t / REP;
    const p = interpolate(it.A, it.B, ease(ph < 0.5 ? ph * 2 : (1 - ph) * 2),
      { plumb: it.cfg.plumb });
    it.svg.innerHTML = renderPose(p, { plumb: it.cfg.plumb, box: it.box,
      caption: '循环演示', name: it.cfg.a, prime: it.cfg.prime });
  };
  for (const it of items) draw(it);        // 先画出静止的第一帧，不留空格子

  let last = 0, raf = 0;
  const tick = (now) => {
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;  // 切回标签页时不要跳一大步
    last = now;
    for (const it of items) {
      if (!it.visible) continue;
      it.t = (it.t + dt) % REP;
      draw(it);
    }
    raf = requestAnimationFrame(tick);
  };
  const start = () => { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } };
  const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else start();
  });
  start();
  return { items, stop, start };
}
