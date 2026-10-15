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
import { renderOrbit, ORBIT_YAW, ORBIT_PERIOD } from '../render/orbit.mjs';
import { faultPhase, faultU } from '../render/faults.mjs';
const ARM_TAU = Math.PI * 2;
const ARM_TRUE_UPPER = 50, ARM_TRUE_FORE = 39;   // 与 BONE 一致：投影不可能超过真骨
// 最短弧：跨 ±π 时走近路
const armAngMix = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= ARM_TAU; while (d < -Math.PI) d += ARM_TAU; return a + d * t; };
// 肘在「肩—手」连线的哪一侧。手臂伸直时叉积只是浮点噪声，必须判成 0（无歧义）——
// 否则 ±1e-13 的符号会被当成真的「异侧」，逼出一次根本不需要的换边。
const armSide = (S, H, E) => {
  const c = (H[0]-S[0])*(E[1]-S[1]) - (H[1]-S[1])*(E[0]-S[0]);
  const scale = Math.hypot(H[0]-S[0], H[1]-S[1]) * Math.hypot(E[0]-S[0], E[1]-S[1]);
  return Math.abs(c) < scale * 1e-3 ? 0 : Math.sign(c);
};

/** 按「肘在连线哪一侧」选 IK 解；该侧无解（手臂伸直）时回落到就近。 */
function ik2Side(S, H, l1, l2, want, near) {
  const dx = H[0]-S[0], dy = H[1]-S[1], d = Math.hypot(dx, dy) || 1e-6;
  const dc = Math.min(Math.max(d, Math.abs(l1-l2) + 1e-6), l1 + l2 - 1e-6);
  const a = (l1*l1 - l2*l2 + dc*dc) / (2*dc), h = Math.sqrt(Math.max(0, l1*l1 - a*a));
  const ux = dx/d, uy = dy/d, M = [S[0] + ux*a, S[1] + uy*a];
  const c1 = [M[0] - uy*h, M[1] + ux*h], c2 = [M[0] + uy*h, M[1] - ux*h];
  const s1 = armSide(S, H, c1);
  if (s1 === want) return c1;
  if (armSide(S, H, c2) === want) return c2;
  return Math.hypot(c1[0]-near[0], c1[1]-near[1]) <= Math.hypot(c2[0]-near[0], c2[1]-near[1]) ? c1 : c2;
}

const armPolar = (base, a, l) => [base[0] + Math.cos(a) * l, base[1] + Math.sin(a) * l];


/** 这一帧实际用的投影骨长与手位——选边扫描与绘制必须用同一组，否则扫出来的穿越点是假的。 */
function armFrame(a, b, u, p) {
  const anc = p.load?.at ?? p.fixed?.at ?? null;
  if (!(anc && a.grip && b.grip)) return null;
  let l1 = a.eLen + (b.eLen - a.eLen) * u, l2 = a.hLen + (b.hLen - a.hLen) * u;
  let H = [anc[0] + a.grip[0] + (b.grip[0] - a.grip[0]) * u,
           anc[1] + a.grip[1] + (b.grip[1] - a.grip[1]) * u];
  const d = Math.hypot(H[0] - p.shoulder[0], H[1] - p.shoulder[1]);
  // 够不到器械时投影该放长（手臂没那么「斜指画面外」），上限是真骨。两条都要满足：
  //   · 放长到**正好等于 d** 等于把手臂拉成直线（推举曾有 14/25 帧肘角钉在 178°）——留 25% 余量；
  //   · 一步跳到真骨长会让肘位瞬移（画出的肘单帧跳 29.5px）——所以按比例连续放大。
  const need = d * 1.25, sum = l1 + l2;
  if (sum < need) {
    const k = Math.min(need, ARM_TRUE_UPPER + ARM_TRUE_FORE) / sum;
    l1 = Math.min(l1 * k, ARM_TRUE_UPPER); l2 = Math.min(l2 * k, ARM_TRUE_FORE);
  }
  if (l1 + l2 <= d) {
    // 连真骨都够不到：把手拉回可达集，而不是把骨头拉长
    const k = (l1 + l2) / d * 0.9999;
    H = [p.shoulder[0] + (H[0] - p.shoulder[0]) * k, p.shoulder[1] + (H[1] - p.shoulder[1]) * k];
  }
  return { H, l1, l2, d: Math.hypot(H[0] - p.shoulder[0], H[1] - p.shoulder[1]) };
}

/**
 * 肘该落在「肩—手」连线的哪一侧——整段动画一次定好，不能每帧各自就近选。
 *
 * 原来 ik2 的选边提示是极坐标插出来的肘；它一越过连线，IK 就换到镜像那一支，
 * 画出的肘单帧瞬移最多 41.7px（下拉 t=0.7475）。而镜像解的上臂长、前臂长、肘角、
 * 手到器械全部相等，所有逐帧断言都碰不到它。
 *
 * 两端同侧 → 整段用那一侧。两端异侧 → 肘必须穿过连线，让它在**手臂最伸直的那一帧**穿，
 * 那里两支解重合，换边不产生跳变。
 */
function ratioAt(a, b, u, A, B, interp, opts) {
  const fr = armFrame(a, b, u, interp(A, B, u, opts));
  return fr ? fr.d / Math.max(fr.l1 + fr.l2, 1e-6) : -1;
}

export function armSidePlan(a, b, A, B, dA, dB, interp, opts) {
  const sA = armSide(A.shoulder, dA.H, dA.E), sB = armSide(B.shoulder, dB.H, dB.E);
  if (sA === sB || sA === 0 || sB === 0) return { side: sA || sB, side2: sA || sB, uCross: null };
  let best = -1, bestU = 1;
  for (let i = 0; i <= 64; i++) {
    const u = i / 64, p = interp(A, B, u, opts);
    const fr = armFrame(a, b, u, p);
    if (!fr) continue;
    const r = fr.d / Math.max(fr.l1 + fr.l2, 1e-6);
    if (r > best) { best = r; bestU = u; }
  }
  // 粗扫只精确到 1/64，而换边点必须正好落在两支解重合处，否则还是会跳（推举曾残留 1.25px）。
  // 在粗扫邻域内二分细化。
  let lo = Math.max(0, bestU - 1/64), hi = Math.min(1, bestU + 1/64);
  for (let i = 0; i < 24; i++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    const r1 = ratioAt(a, b, m1, A, B, interp, opts), r2 = ratioAt(a, b, m2, A, B, interp, opts);
    if (r1 < r2) lo = m1; else hi = m2;
  }
  return { side: sA, side2: sB, uCross: (lo + hi) / 2 };
}

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
 */
export function blendArm(a, b, u, p, plan) {
  if (!a.rebuilt && !b.rebuilt) return undefined;
  const eLen = a.eLen + (b.eLen - a.eLen) * u, hLen = a.hLen + (b.hLen - a.hLen) * u;
  const guess = armPolar(p.shoulder, armAngMix(a.eAng, b.eAng, u), eLen);
  const fr = armFrame(a, b, u, p);
  if (!fr) {
    return { E: guess, H: armPolar(guess, armAngMix(a.hAng, b.hAng, u), hLen) };
  }
  if (plan && plan.side) {
    // 换边点落在端点意味着「两端异侧且中间没有伸直帧」——那种构型在上游就该消掉
    // （把那一端的手臂画成精确伸直），这里不做端点特判：特判会让断言采到的 u=1
    // 与浏览器实际画的 u=1−ε 走不同的支。
    const want = plan.uCross === null ? plan.side : (u <= plan.uCross ? plan.side : plan.side2);
    return { E: ik2Side(p.shoulder, fr.H, fr.l1, fr.l2, want, guess), H: fr.H };
  }
  return { E: ik2(p.shoulder, fr.H, fr.l1, fr.l2, guess), H: fr.H };
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
    // 启用环绕视角的动作只有一格（服务端画好的静止帧），动画直接接管它；
    // 其余动作在两帧之后追加一格侧视循环演示。
    const orbit = cfg.orbit ?? null;
    const [x, y, w, h] = orbit ? orbit.box : cfg.box;
    let svg = orbit ? fig.querySelector('svg.sk-orbit') : null;
    if (orbit && !svg) continue;
    if (!svg) {
      svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
      svg.setAttribute('class', 'sk-frame sk-anim' + (w / h > 1.6 ? ' sk-wide' : ''));
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', `${fig.dataset.exercise}·循环演示`);
      fig.insertBefore(svg, fig.querySelector('figcaption'));
    } else {
      svg.classList.add('sk-anim');
    }
    // 自重动作把模板里的负荷摘掉——照着练一副不存在的杠铃就是教错
    const strip = (p) => (cfg.no_load ? { ...p, load: undefined } : p);
    const A = strip(POSES[cfg.a]), B = strip(POSES[cfg.b]);
    // 错误示范：正确动作（灰影）的两端
    const GA = cfg.ga && POSES[cfg.ga] ? strip(POSES[cfg.ga]) : null, GB = cfg.gb && POSES[cfg.gb] ? strip(POSES[cfg.gb]) : null;
    // 手臂分两种画法，按端点是不是**重建过**来分：
    //   矢状面内（没重建）：直接用补间链算出的 elbow/wrist。链保证骨长不变、
    //     俯撑家族的手回到地面；以前对所有图一律走下面的混合，等于在两端点之间
    //     拉一条弦——角度走得越大弦越短，手臂中途缩水约 20%，俯卧撑的手还飘离地面。
    //   出平面（重建过）：解不能每帧重求（过顶无解、握点钳制处跳 36px），
    //     所以仍在两端之间插值，但插极坐标不插直角坐标：肘按「相对肩的方向+投影长」，
    //     手按「相对器械的握点偏移」——手因此全程贴在杠/哑铃上，不会脱手。
    const dA = drawnArm(cfg.a, A, cfg.load_type ?? undefined);
    const dB = drawnArm(cfg.b, B, cfg.load_type ?? undefined);
    const armA = armDescriptor(dA, A), armB = armDescriptor(dB, B);
    const opts = { plumb: cfg.plumb, handPath: cfg.handPath };
    items.push({ svg, cfg, box: { x, y, w, h }, A, B, GA, GB, visible: false, t: 0, armA, armB,
      orbit, orbT: 0,
      plan: armSidePlan(armA, armB, A, B, dA, dB, interpolate, opts) });
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
    if (it.cfg.fault) {
      // 错误示范：错误动作按自己的节奏走（弹震、失控下落），灰影始终按正常节奏
      const yaw = ORBIT_YAW * Math.sin((it.orbT / ORBIT_PERIOD) * Math.PI * 2);
      const io = { plumb: it.cfg.ip ?? undefined, handPath: it.cfg.handPath };
      const w = faultPhase(it.cfg.tempo, ph), g = faultPhase(null, ph);
      const uw = faultU(it.cfg.fault, w.u);
      const p = interpolate(it.A, it.B, uw, io);
      const ghost = it.GA ? { p: interpolate(it.GA, it.GB, g.u, io), names: { a: it.cfg.ga, b: it.cfg.gb }, u: g.u } : undefined;
      it.svg.innerHTML = renderOrbit(p, { slug: it.cfg.slug, names: { a: it.cfg.a, b: it.cfg.b }, u: uw, half: w.half, yaw,
        frame: it.orbit, caption: '错误示范', plumb: it.cfg.plumb, lt: it.cfg.load_type ?? undefined, fault: it.cfg.fault, ghost });
      return;
    }
    const u = ease(ph < 0.5 ? ph * 2 : (1 - ph) * 2);
    const p = interpolate(it.A, it.B, u, { plumb: it.cfg.plumb, handPath: it.cfg.handPath });
    if (it.orbit) {
      // 环绕视角：相机在侧视两边来回摆，摆一个来回 = 两次起落
      const yaw = ORBIT_YAW * Math.sin((it.orbT / ORBIT_PERIOD) * Math.PI * 2);
      it.svg.innerHTML = renderOrbit(p, { slug: it.cfg.slug, names: { a: it.cfg.a, b: it.cfg.b }, u, yaw, frame: it.orbit,
        prime: it.cfg.prime, caption: '环绕视角', plumb: it.cfg.plumb, lt: it.cfg.load_type ?? undefined });
      return;
    }
    const arm = blendArm(it.armA, it.armB, u, p, it.plan);
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
      it.orbT = (it.orbT + dt) % ORBIT_PERIOD;
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
