// 骨架动画驱动。
//
// 渐进增强：没有 JS、或读者开了"减少动态效果"时，动作卡仍是原来那两帧静态图，
// 信息不缺一条。有 JS 时在两帧之后追加一格循环演示——静态两帧看不出轨迹，
// 而动作卡的自检判据反复要求"逐帧看下降和上升两段"，轨迹正是它们要看的东西。
//
// 性能：55 张卡不会各跑一个 rAF。一个共享循环 + IntersectionObserver，
// 只重绘当前在视口里的那几格；标签页切走时整个停掉。

const REP = 4.2;                       // 一次完整起落的秒数
import { ik2 } from '../render/interp.mjs';
const ARM_TAU = Math.PI * 2;
// 最短弧：跨 ±π 时走近路
const armAngMix = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= ARM_TAU; while (d < -Math.PI) d += ARM_TAU; return a + d * t; };
const armPolar = (base, a, l) => [base[0] + Math.cos(a) * l, base[1] + Math.sin(a) * l];

/** 把一端的「画出来的手臂」拆成可插值的极坐标描述。 */
export function armDescriptor(d, p) {
  const anc = p.load?.at ?? p.fixed?.at ?? null;
  return { rebuilt: d.rebuilt,
    eAng: Math.atan2(d.E[1] - p.shoulder[1], d.E[0] - p.shoulder[0]),
    eLen: Math.hypot(d.E[0] - p.shoulder[0], d.E[1] - p.shoulder[1]),
    hAng: Math.atan2(d.H[1] - d.E[1], d.H[0] - d.E[0]),
    hLen: Math.hypot(d.H[0] - d.E[0], d.H[1] - d.E[1]),
    grip: anc ? [d.H[0] - anc[0], d.H[1] - anc[1]] : null };
}

/**
 * 两端都在矢状面内 → 回 undefined，让 renderPose 用补间链的 elbow/wrist。
 *
 * 手钉在器械上之后，肘**不能**再独立按极坐标插值：两者不协调时差额全落在前臂上，
 * 画出的前臂一度到 47px——而真骨只有 39，投影不可能比实物长。
 * 改成：手由握点偏移定，肘由两骨 IK 从肩解出，骨长用两端投影长插值。
 * 够不到时（混合端点：一端重建成 25px 投影、另一端是全长 50）按比例放大两段，
 * 宁可两段一起略长，也不让其中一段单独超过真长。
 */
export function blendArm(a, b, u, p) {
  if (!a.rebuilt && !b.rebuilt) return undefined;
  const eLen = a.eLen + (b.eLen - a.eLen) * u, hLen = a.hLen + (b.hLen - a.hLen) * u;
  const guess = armPolar(p.shoulder, armAngMix(a.eAng, b.eAng, u), eLen);
  const anc = p.load?.at ?? p.fixed?.at ?? null;
  if (!(anc && a.grip && b.grip)) {
    return { E: guess, H: armPolar(guess, armAngMix(a.hAng, b.hAng, u), hLen) };
  }
  const H = [anc[0] + a.grip[0] + (b.grip[0] - a.grip[0]) * u,
             anc[1] + a.grip[1] + (b.grip[1] - a.grip[1]) * u];
  const d = Math.hypot(H[0] - p.shoulder[0], H[1] - p.shoulder[1]);
  let l1 = eLen, l2 = hLen;
  if (d > l1 + l2) { const k = d / (l1 + l2) * 1.0001; l1 *= k; l2 *= k; }
  return { E: ik2(p.shoulder, H, l1, l2, guess), H };
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);

export function initSkeletonAnimation({ POSES, interpolate, renderPose, drawnArm }) {
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
    const A = strip(POSES[cfg.a]), B = strip(POSES[cfg.b]);
    // 手臂分两种画法，按端点是不是**重建过**来分：
    //   矢状面内（没重建）：直接用补间链算出的 elbow/wrist。链保证骨长不变、
    //     俯撑家族的手回到地面；以前对所有图一律走下面的混合，等于在两端点之间
    //     拉一条弦——角度走得越大弦越短，手臂中途缩水约 20%，俯卧撑的手还飘离地面。
    //   出平面（重建过）：解不能每帧重求（过顶无解、握点钳制处跳 36px），
    //     所以仍在两端之间插值，但插极坐标不插直角坐标：肘按「相对肩的方向+投影长」，
    //     手按「相对器械的握点偏移」——手因此全程贴在杠/哑铃上，不会脱手。
    const desc = (key, p) => armDescriptor(drawnArm(key, p, cfg.load_type ?? undefined), p);
    items.push({ svg, cfg, box: { x, y, w, h }, A, B, visible: false, t: 0,
      armA: desc(cfg.a, A), armB: desc(cfg.b, B) });
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
    const u = ease(ph < 0.5 ? ph * 2 : (1 - ph) * 2);
    const p = interpolate(it.A, it.B, u, { plumb: it.cfg.plumb, handPath: it.cfg.handPath });
    const arm = blendArm(it.armA, it.armB, u, p);
    it.svg.innerHTML = renderPose(p, { plumb: it.cfg.plumb, box: it.box, arm,
      caption: '循环演示', name: it.cfg.a, prime: it.cfg.prime, loadType: it.cfg.load_type ?? undefined });
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
