// 错误示范图（data/mistake-figures.json）的断言。
//
// 错误示范画的是错的动作，但它仍然必须是一个**物理上成立**的人：骨长不变、脚不穿地、
// 手还握在杠上、不越框。错只能错在那一处——否则读者分不清哪个差别是要学的，哪个是画坏的。
// 另外两条管「读得出」：错误动作与灰影必须看得出差别；「为什么错」里写的数字必须是图上量得到的。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { GROUND, mistakeSetup, mistakeStill, renderMistakeFigure } from '../src/render/skeleton.mjs';
import { interpolate } from '../src/render/interp.mjs';
import { orbitScene, orbitFrame, orbitPoints, orbitBaseYaw, orbitProject, ORBIT_YAW } from '../src/render/orbit.mjs';
import { faultU, opWeight, mistakeInterpOpts } from '../src/render/faults.mjs';
import { ORBIT_STATIC } from '../src/render/orbit.mjs';
import { mistakeMetrics, mistakeBalance, comX, hipMoment, loadPoints } from '../src/render/mistake-metrics.mjs';
import { validateMistakeFigures } from '../src/validate/mistakes.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = async (f) => JSON.parse(await readFile(path.join(root, f), 'utf8'));
const figures = await read('data/figures.json');
const exercises = await read('data/exercises.json');
const MF = await read('data/mistake-figures.json');
const L3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** 器械图元的端点（按顺序）：只改器械朝向的错误（锤式弯举翻腕）关节一个不动，差别全在这里。 */
const loadPts = (S) => S.filter((it) => it.part === 'load').flatMap((it) => (it.t === 'line' ? [it.a, it.b] : it.t === 'poly' ? it.pts : [it.c]));

/** 全部可画的错误示范。 */
const drawn = [];
for (const [slug, list] of Object.entries(MF)) for (const mf of list) if (mf.none === undefined) drawn.push({ slug, mf, fig: figures[slug] });

/** 一张错误示范的逐帧：两个半程 × 17 个 u，错误动作与同一时刻的灰影。 */
function* framesOf({ slug, mf, fig }) {
  const s = mistakeSetup(fig, mf);
  for (const half of [0, 1]) for (let i = 0; i <= 16; i++) {
    const u = i / 16, uw = faultU(s.fault, u);
    const pw = interpolate(s.A, s.B, uw, s.iopts), pg = interpolate(s.GA, s.GB, u, s.iopts);
    const W = orbitScene(slug, { a: s.wa, b: s.wb }, pw, { u: uw, half, lt: fig.load_type, fault: s.fault });
    const G = orbitScene(slug, { a: s.ga, b: s.gb }, pg, { u, lt: fig.load_type });
    yield { s, u, uw, half, W, G };
  }
}

test('错误示范数据：字段合法、引用存在', () => {
  assert.deepEqual(validateMistakeFigures(MF, exercises, figures, { requireAll: false }), []);
});

test('错误示范里的人仍然成立：骨长不变、不穿地', () => {
  for (const d of drawn) {
    for (const { u, half, W } of framesOf(d)) {
      const J = W.J, at = `${d.slug}#${d.mf.mistake} u=${u} half=${half}`;
      for (const t of ['N', 'F']) {
        assert.ok(Math.abs(L3(J['shoulder' + t], J['elbow' + t]) - 50) < 0.05, `${at}: 上臂`);
        assert.ok(Math.abs(L3(J['elbow' + t], J['wrist' + t]) - 39) < 0.05, `${at}: 前臂`);
        // 肘角下限与正确动作同口径（orbit.test 断言 6）：错误动作也不能把前臂折进上臂里
        const S = J['shoulder' + t], E = J['elbow' + t], H = J['wrist' + t];
        const ea = Math.acos(((S[0] - E[0]) * (H[0] - E[0]) + (S[1] - E[1]) * (H[1] - E[1]) + (S[2] - E[2]) * (H[2] - E[2])) / (L3(S, E) * L3(H, E))) * 180 / Math.PI;
        assert.ok(ea >= 25, `${at}: ${t} 肘角 ${ea.toFixed(1)}°`);
      }
      // 腿骨：变换（挪髋、膝内扣、抬脚跟）都必须保骨长。比的是同一动作的灰影，不是写死的 60
      const G = [...framesOf(d)][0].G.J;
      for (const t of ['N', 'F']) {
        assert.ok(Math.abs(L3(J['hip' + t], J['knee' + t]) - L3(G['hip' + t], G['knee' + t])) < 1, `${at}: 大腿长变了`);
        assert.ok(Math.abs(L3(J['knee' + t], J['ankle' + t]) - L3(G['knee' + t], G['ankle' + t])) < 1, `${at}: 小腿长变了`);
      }
      assert.ok(Math.abs(L3(J.pelvis, J.neck) - L3(G.pelvis, G.neck)) < 1, `${at}: 躯干长变了`);
      for (const it of W.S) {
        const pts = it.t === 'line' ? [it.a, it.b] : it.t === 'poly' ? it.pts : [it.cls === 'sk-head' ? [it.c[0], it.c[1] + it.r, it.c[2]] : it.c];
        for (const q of pts) assert.ok(q[1] <= GROUND + 3, `${at}: ${it.cls} 在 y=${q[1].toFixed(1)}，穿地`);
      }
    }
  }
});

const cfgOf = (d) => {
  const html = renderMistakeFigure(d.fig, d.mf, d.slug, d.slug, 'x');
  return JSON.parse(html.match(/data-anim="([^"]+)"/)[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&'));
};
// 关节 → 它所在的骨段（标红按骨段标）
const PART_OF = {
  knee: ['thigh', 'shin'], ankle: ['shin', 'foot'], heel: ['foot'], toe: ['foot'], hip: ['thigh', 'pelvis', 'trunk'],
  load: ['load', 'forearm'], pelvis: ['trunk', 'thigh', 'pelvis'], neck: ['trunk', 'shoulders', 'head'], back: ['trunk'], shoulder: ['shoulders', 'trunk', 'upperarm'],
  elbow: ['upperarm', 'forearm'], wrist: ['forearm', 'load'], head: ['head'], spine: ['trunk'],
};
/** 错误与灰影在若干视角下投影位移最大的关节：[位移, 关节名]。 */
function maxShift(d, yaws) {
  const cfg = cfgOf(d), base = orbitBaseYaw(d.slug, cfg.fault);
  let best = [0, ''];
  const per = {};
  for (const { W, G } of framesOf(d)) {
    const pts = (J) => {
      const o = Object.fromEntries(Object.entries(J).filter(([, v]) => Array.isArray(v) && typeof v[0] === 'number'));
      // 圆背 / 塌腰只改躯干线中段：取弧的中点，灰影取直线中点
      o.spine = J.spinePts ? J.spinePts[Math.floor(J.spinePts.length / 2)] : J.pelvis.map((x, i) => (x + J.neck[i]) / 2);
      return o;
    };
    const w = pts(W.J), g = pts(G.J);
    const lw = loadPts(W.S), lg = loadPts(G.S);
    if (lw.length === lg.length) lw.forEach((q, i) => { w['load' + i] = q; g['load' + i] = lg[i]; });
    for (const yaw of (yaws ?? [base - ORBIT_YAW, base, base + ORBIT_YAW])) {
      for (const k of Object.keys(g)) {
        if (!w[k]) continue;
        const a = orbitProject(w[k], yaw, cfg.orbit.pivot), b = orbitProject(g[k], yaw, cfg.orbit.pivot);
        const dd = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (dd > best[0]) best = [dd, k.startsWith('load') ? 'load' : k.replace(/[NF]$/, ''), /[NF]$/.test(k) ? k.slice(-1) : null];
        per[k] = Math.max(per[k] ?? 0, dd);
      }
    }
  }
  best.per = per;
  return best;
}

test('错误示范与灰影看得出差别（投影到屏幕上量）', () => {
  // 最大的关节位移至少 8px（约 5cm），在基准视角与两侧摆到头的视角里量投影——
  // 3D 距离会放过「纯 z 方向的错误配侧视」：膝内扣 12px 在侧视两边摆 30° 只剩 6px。
  // 节奏类错误（tempo）的差别在时间上，不在形状上，不查。
  for (const d of drawn) {
    if (d.mf.tempo) continue;
    // 只在基准视角与静止帧视角量：取两侧摆到头的最大值，侧视的膝内扣在 +30° 能凑到 8.6px 而放行
    const base = orbitBaseYaw(d.slug, cfgOf(d).fault);
    const [dd, k] = maxShift(d, [base, base + ORBIT_STATIC.yaw]);
    assert.ok(dd >= 8, `${d.slug}#${d.mf.mistake}: 错误与正确投影最多只差 ${dd.toFixed(1)}px（${k}）`);
  }
});

test('标红的部位包含差别最大的那个关节所在的骨段', () => {
  // 「差别最大」取位移达到最大值 70% 的那几个关节：躯干后仰时手里的杠跟着走得最远，
  // 但错在躯干——只要标红覆盖了其中一个就算对。写了侧别的（shin.F）必须与该关节的侧别一致。
  for (const d of drawn) {
    if (!d.mf.hl?.length) continue;
    const best = maxShift(d), top = Object.entries(best.per).filter(([, v]) => v >= best[0] * 0.7);
    const ok = top.some(([k]) => {
      const j = k.startsWith('load') ? 'load' : k.replace(/[NF]$/, ''), sd = /[NF]$/.test(k) ? k.slice(-1) : null;
      const hl = d.mf.hl.map((h) => h.split('@')[0]).filter((h) => { const s = h.split('.')[1]; return !s || !sd || s === sd; }).map((h) => h.replace(/\.[NF]$/, ''));
      return (PART_OF[j] ?? []).some((x) => hl.includes(x));
    });
    assert.ok(ok, `${d.slug}#${d.mf.mistake}: 差别最大的是 ${top.map(([k, v]) => `${k} ${v.toFixed(0)}`).join('、')}，可标红的是 ${d.mf.hl.join('、')}`);
  }
});

test('变换没有被钳住：要多少给多少', () => {
  // 挪髋挪到腿够不到时会被钳到两圆交点上——画出来的是「腿锁直、小腿后仰」，不是数据写的那个错误
  for (const d of drawn) for (const { W, u, half } of framesOf(d))
    assert.ok(!W.p._faultClamped && !W.J._faultClamped, `${d.slug}#${d.mf.mistake} u=${u} half=${half}: 变换被钳住，调小幅度`);
});

test('只在一个半程出现的错误，另一个半程与灰影完全相同', () => {
  for (const d of drawn) {
    const profs = new Set((d.mf.ops ?? []).map((op) => op.prof ?? 'u'));
    if (d.mf.params || d.mf.rom || d.mf.start || d.mf.end || profs.size !== 1) continue;
    const off = profs.has('up') ? 0 : profs.has('down') ? 1 : null;
    if (off === null) continue;
    for (const { W, G, half, u } of framesOf(d)) {
      if (half !== off) continue;
      for (const k of Object.keys(G.J)) if (Array.isArray(G.J[k]) && W.J[k])
        assert.ok(L3(W.J[k], G.J[k]) < 0.5, `${d.slug}#${d.mf.mistake} u=${u}: 不该出错的半程 ${k} 差 ${L3(W.J[k], G.J[k]).toFixed(1)}`);
    }
  }
});

test('握杆类器械：错误示范里手仍握在杆上', () => {
  for (const d of drawn) for (const { W, u, half } of framesOf(d)) {
    const p = W.p, t = d.fig.load_type ?? p.load?.type;
    const at = p.fixed?.at ?? (['bar', 'front', 'wheel', 'sled'].includes(t) ? p.load?.at : null);
    if (!at) continue;
    for (const k of ['wristN', 'wristF']) {
      const dd = Math.hypot(W.J[k][0] - at[0], W.J[k][1] - at[1]);
      assert.ok(dd <= 10, `${d.slug}#${d.mf.mistake} u=${u} half=${half} ${k}: 手离杆心 ${dd.toFixed(1)}px`);
    }
  }
});

test('浏览器里的补间与服务端同一套参数', () => {
  // 客户端只拿得到 data-anim 里的 cfg。曾把「画不画杠线」当成补间参数传过去，
  // 换了视角的错误示范在浏览器里灰影的杠离开足中线 13px，而服务端、断言都看不到。
  for (const d of drawn) {
    const cfg = cfgOf(d), s = mistakeSetup(d.fig, d.mf);
    const io = mistakeInterpOpts(cfg);   // 与 anim.js 同一个函数
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      for (const [A, B] of [[s.A, s.B], [s.GA, s.GB]]) {
        const c = interpolate(A, B, u, io), v = interpolate(A, B, u, s.iopts);
        for (const k of ['hip', 'shoulder', 'knee', 'wrist']) if (v[k])
          assert.ok(Math.hypot(c[k][0] - v[k][0], c[k][1] - v[k][1]) < 0.5, `${d.slug}#${d.mf.mistake} u=${u} ${k}: 客户端与服务端不一致`);
      }
    }
  }
});

test('错误示范的每一帧、每个角度都在画框内', () => {
  for (const d of drawn) {
    const cfg = cfgOf(d);
    const [bx, by, bw, bh] = cfg.orbit.box;
    const base = orbitBaseYaw(d.slug, cfg.fault);
    for (const { W, G, half } of framesOf(d)) {
      for (const sc of [W, G]) for (const k of [-4, -2, 0, 2, 4]) {
        for (const q of orbitPoints(sc, base + ORBIT_YAW * k / 4, cfg.orbit.pivot)) {
          assert.ok(q[0] >= bx - 2 && q[0] <= bx + bw + 2 && q[1] >= by - 2 && q[1] <= by + bh + 2,
            `${d.slug}#${d.mf.mistake} half=${half}: 点 (${q[0].toFixed(1)}, ${q[1].toFixed(1)}) 出框`);
        }
      }
    }
  }
});

test('出错部位只在真的错了的帧标红', () => {
  for (const d of drawn) {
    if (!d.mf.ops?.length || (d.mf.params && !d.mf.pprof) || d.mf.rom) {
      // 参数类错误：带 @ 的部位跟它引用的变换走
      for (const h of d.mf.hl ?? []) { const m = h.split('@')[1]; if (m === undefined) continue;
        for (const { W, u, half } of framesOf(d)) { const want = opWeight(/^\d+$/.test(m) ? d.mf.ops[+m] : { prof: m }, u, half) >= 0.2, part = h.split('@')[0];
          assert.equal(W.S.some((it) => it.part === part && it.cls.includes('sk-fault')), want, `${d.slug}#${d.mf.mistake} u=${u}: ${h} 标红时机`); } }
      continue;
    }
    for (const { W, u, half } of framesOf(d)) {
      const on = d.mf.ops.some((op) => op.op !== 'regrip' && opWeight(op, u, half) >= 0.2) || !!(d.mf.pprof && opWeight({ prof: d.mf.pprof }, u, half) >= 0.2);
      const red = W.S.some((it) => it.cls.includes('sk-fault'));
      if (d.mf.hl.some((h) => h.includes('@'))) continue;   // 分部位定时的另有断言
      assert.equal(red, on, `${d.slug}#${d.mf.mistake} u=${u} half=${half}: 标红 ${red}，变换强度 ${on ? '≥' : '<'} 0.2`);
    }
  }
});

// ── 每条错误示范的「为什么错」里写的数字 ──────────────────────
// 写进文字的量都在这里核对：图改了、文字没跟上，这里会失败。
const near = (v, x, tol, msg) => assert.ok(Math.abs(v - x) <= tol, `${msg}：实测 ${v.toFixed(1)}，文字写 ${x}`);
const CLAIMS = {
  'back-squat-high-bar#0': ({ wrong: w, right: r, pw }) => {
    near(w.kneeAngle - r.kneeAngle, 17, 1, '膝多伸');
    const shin = Math.atan2(pw.knee[0] - pw.ankle[0], pw.ankle[1] - pw.knee[1]) * 180 / Math.PI;
    near(shin, 0, 3, '小腿接近竖直（不往后仰）');
    near(r.trunkFromVertical, 33, 1, '正确躯干离竖直');
    near(w.trunkFromVertical, 41, 1, '错误躯干离竖直');
    near(r.hipToLoadX, 43, 1, '正确髋到杠水平距离');
    near(w.hipToLoadX, 51, 1, '错误髋到杠水平距离');
    near((w.hipToLoadX / r.hipToLoadX - 1) * 100, 20, 1.5, '力臂增幅 %');
    near(w.load[0], r.load[0], 0.5, '杠的水平位置不变');
  },
  'back-squat-high-bar#1': ({ wrong: w, right: r }) => {
    near(r.kneeZ - w.kneeZ, 12, 1, '膝往中线收');
    assert.ok(w.kneeZ < w.ankleZ, '错误动作的膝落在踝的内侧');
    assert.ok(r.kneeZ >= r.ankleZ, '正确动作的膝在踝的正上方或外侧');
  },
  'goblet-squat#0': ({ wrong: w, right: r, Jw, Jg, pw, pg }) => {
    near(w.load[0] - r.load[0], 16, 0.5, '哑铃前移');
    near(r.hipToLoadX, 36, 1, '正确力臂'); near(w.hipToLoadX, 52, 1, '错误力臂');
    near((w.hipToLoadX / r.hipToLoadX - 1) * 100, 45, 2, '力臂增幅 %');
    assert.ok(w.load[0] > 90 + 6, '哑铃铅垂线落在足中线前方');
    const P = { dbMode: 'single' };
    for (const [fr, pct] of [[0.15, 18], [0.3, 23]]) {
      const a = hipMoment(Jw, loadPoints(Jw, pw, P), fr), b = hipMoment(Jg, loadPoints(Jg, pg, P), fr);
      near((a / b - 1) * 100, pct, 1, `哑铃 ${fr} 倍体重时伸髋力矩增幅 %`);
      const dc = comX(Jw, loadPoints(Jw, pw, P), fr) - comX(Jg, loadPoints(Jg, pg, P), fr);
      assert.ok(dc >= 3 && dc <= 5.5, `重心前移 ${dc.toFixed(1)}`);
    }
  },
  'goblet-squat#1': ({ pw, pg, Jw, Jg }) => {
    const shin = (p) => Math.atan2(p.knee[0] - p.ankle[0], p.ankle[1] - p.knee[1]) * 180 / Math.PI;
    const foot = (p) => Math.atan2(p.toe[1] - p.heel[1], p.toe[0] - p.heel[0]) * 180 / Math.PI;
    near(225 - pw.heel[1], 13, 0.6, '脚跟离地');
    near(pw.toe[1], 225, 0.5, '前脚掌仍在地上');
    near(pw.knee[0] - pg.knee[0], 20, 1, '膝前移');
    near(pw.knee[0] - pw.toe[0], 26, 1, '错误膝越过脚尖'); near(pg.knee[0] - pg.toe[0], 6, 1, '灰影膝越过脚尖');
    for (const fr of [0.1, 0.3]) { const x = comX(Jw, loadPoints(Jw, pw, { dbMode: 'single' }), fr); assert.ok(x >= 101 && x <= 103, `重心 ${x.toFixed(1)}`); }
    assert.ok(pw.hip[1] - pw.knee[1] >= 3, '深度不变：髋仍低于膝');
  },
  'back-squat-low-bar#0': ({ wrong: w, right: r, pw, pg, Jw, Jg }, d) => {
    const shin = (p) => Math.atan2(p.knee[0] - p.ankle[0], p.ankle[1] - p.knee[1]) * 180 / Math.PI;
    near(w.trunkFromVertical, 35, 1, '错误躯干角'); near(r.trunkFromVertical, 48, 1, '正确躯干角');
    const only = mistakeMetrics(d.slug, d.fig, { mistake: 0, ops: [d.mf.ops[0]] }, 1, 0);
    near(90 - only.wrong.load[0], 13, 1, '只立躯干时杠退到足中线后');
    near(pw.hip[0] - pg.hip[0], 13, 0.5, '下半身前送');
    near(w.load[0], 90, 1, '杠回到足中线');
    near(shin(pg), 17, 1, '正确小腿'); near(shin(pw), 33, 1, '错误小腿');
    near(pw.knee[0] - pw.toe[0], 4, 1, '膝过脚尖'); near(pg.toe[0] - pg.knee[0], 10, 1, '灰影膝在脚尖后');
    for (const fr of [0.3, 0.8]) { const dc = comX(Jw, loadPoints(Jw, pw), fr) - comX(Jg, loadPoints(Jg, pg), fr); assert.ok(dc >= 3.5 && dc <= 5.5, `重心前移 ${dc.toFixed(1)}`); }
  },
  'back-squat-low-bar#1': ({ wrong: w, right: r, pw, pg }) => {
    const along = (p) => { const S = p.shoulder, H = p.hip, L = p.load.at, v = [S[0] - H[0], S[1] - H[1]], l = Math.hypot(...v); return ((L[0] - H[0]) * v[0] + (L[1] - H[1]) * v[1]) / l; };
    near(along(pg) - along(pw), 10, 0.5, '杠沿躯干下滑');
    near(r.trunkFromVertical, 48, 1, '正确躯干角');
    near(w.trunkFromVertical, 57, 1, '错误躯干角');
    near(w.load[0], 90, 1, '杠仍在足中线上');
  },
  'db-front-squat#0': ({ wrong: w, right: r, Jw, Jg }, d) => {
    const ua = (J) => Math.atan2(J.elbowN[1] - J.shoulderN[1], Math.hypot(J.elbowN[0] - J.shoulderN[0], J.elbowN[2] - J.shoulderN[2])) * 180 / Math.PI;
    for (let i = 0; i <= 20; i++) {
      const u = i / 20, m = mistakeMetrics(d.slug, d.fig, d.mf, u, 0);
      assert.ok(ua(m.Jw) >= 49.5 && ua(m.Jw) <= 71, `u=${u} 错误上臂低于水平 ${ua(m.Jw).toFixed(1)}°`);
      assert.ok(ua(m.Jg) >= -6.5 && ua(m.Jg) <= 16, `u=${u} 正确上臂离水平 ${ua(m.Jg).toFixed(1)}°`);
    }
    near((Jw.wristN[1] - Jw.shoulderN[1]) - (Jg.wristN[1] - Jg.shoulderN[1]), 39, 1.5, '手比正确位置低');
    near(r.trunkFromVertical, 22, 1, '正确躯干角');
    near(w.trunkFromVertical, 32, 1, '错误躯干角');
  },
  'db-front-squat#1': ({ Jw, Jg }) => {
    near(Jg.shoulderN[1] - Jw.shoulderN[1], 8, 0.3, '耸肩');
    near(Jg.shoulderN[1] - Jg.head[1], 14, 0.5, '正确头心到肩');
    near(Jw.shoulderN[1] - Jw.head[1], 6, 0.5, '错误头心到肩');
  },
  'db-bulgarian-split-squat#0': ({ pw, pg }) => {
    const shin = (p) => Math.atan2(p.knee[0] - p.ankle[0], p.ankle[1] - p.knee[1]) * 180 / Math.PI;
    near(pw.ankle[0] - pw.ankle2[0], 64, 1, '错误两脚间距');
    near(pg.ankle[0] - pg.ankle2[0], 90, 1, '正确两脚间距');
    near(shin(pw), 37, 1, '错误小腿前倾');
    near(shin(pg), 15, 1, '正确小腿前倾');
    near(pw.knee[0] - pw.toe[0], 6, 1, '膝越过脚尖');
    near(pg.toe[0] - pg.knee[0], 15, 1, '灰影膝在脚尖后');
  },
  'db-bulgarian-split-squat#1': ({ wrong: w, right: r, Jw, Jg, pw, pg }) => {
    const ang = (a, b, c) => { const u = a.map((x, i) => x - b[i]), v = c.map((x, i) => x - b[i]); return Math.acos(u.reduce((s, x, i) => s + x * v[i], 0) / Math.hypot(...u) / Math.hypot(...v)) * 180 / Math.PI; };
    near(ang(Jg.hipF, Jg.kneeF, Jg.ankleF), 82, 1, '正确后膝');
    near(ang(Jw.hipF, Jw.kneeF, Jw.ankleF), 93, 1, '错误后膝');
    near(pw.hip[0] - pg.hip[0], 12, 0.5, '骨盆前移');
    near(r.kneeAngle, 139, 1, '正确前膝'); near(w.kneeAngle, 132, 1, '错误前膝');
  },
  'conventional-deadlift#0': ({ wrong: w, right: r, pw, pg, Jw, Jg }) => {
    near(pg.hip[1] - pw.hip[1], 14, 0.5, '髋抬高');
    near(pw.knee[1] - pw.hip[1], 28, 1, '错误髋高于膝'); near(pg.knee[1] - pg.hip[1], 14, 1, '正确髋高于膝');
    near(r.kneeAngle, 97, 1, '正确膝角'); near(w.kneeAngle, 113, 1, '错误膝角');
    near(90 - r.trunkFromVertical, 34, 1, '正确躯干离水平'); near(90 - w.trunkFromVertical, 22, 1, '错误躯干离水平');
    near(pw.shoulder[0] - pw.load.at[0], 15, 1, '错误肩在杠前'); near(pg.shoulder[0] - pg.load.at[0], 4, 1, '正确肩在杠前');
    near(Jw.spine.bend, 9, 0.1, '背拱起');
    for (const fr of [0.3, 0.8]) { const k = hipMoment(Jw, loadPoints(Jw, pw), fr) / hipMoment(Jg, loadPoints(Jg, pg), fr) - 1; assert.ok(Math.abs(k) <= 0.05, `静态伸髋力矩差 ${(k * 100).toFixed(1)}%`); }
  },
  'conventional-deadlift#1': ({ wrong: w, right: r, pw, pg }) => {
    near(w.load[0] - r.load[0], 14, 0.3, '杠前飘');
    near(pg.load.at[0] - pg.knee[0], 9, 1, '正确杠到膝前'); near(pw.load.at[0] - pw.knee[0], 23, 1, '错误杠到膝前');
    near(r.hipToLoadX, 47, 1, '正确力臂'); near(w.hipToLoadX, 61, 1, '错误力臂');
    near((w.hipToLoadX / r.hipToLoadX - 1) * 100, 30, 2, '力臂增幅 %');
  },
  'romanian-deadlift#0': ({ wrong: w, right: r }) => {
    near(r.kneeAngle, 158, 1, '正确膝角'); near(w.kneeAngle, 130, 1, '错误膝角');
    near(w.hipAngle, 101, 1, '错误髋角'); near(r.hipAngle, 94, 1, '正确髋角');
    near(r.trunkFromVertical, 56, 1, '正确躯干'); near(w.trunkFromVertical, 38, 1, '错误躯干');
    near(r.load[1] - w.load[1], 12, 1, '杠停得更高');
  },
  'romanian-deadlift#1': ({ wrong: w, right: r, Jw }) => {
    near(Jw.spine.bend, 10, 0.1, '背拱起');
    near(r.trunkFromVertical, 56, 1, '正确躯干'); near(w.trunkFromVertical, 66, 1, '错误躯干');
    near(w.load[1] - r.load[1], 12, 0.5, '杠更低');
    near(r.hipToLoadX, 48, 1, '正确力臂'); near(w.hipToLoadX, 55, 1, '错误力臂');
  },
  'db-romanian-deadlift#0': ({ Jw, Jg, pw, pg }) => {
    near(Jw.wristN[0] - Jg.wristN[0], 18, 0.5, '哑铃前荡');
    near(Jg.wristN[0] - Jg.pelvis[0], 48, 1, '正确哑铃到髋'); near(Jw.wristN[0] - Jw.pelvis[0], 67, 1, '错误哑铃到髋');
    for (const [fr, pct] of [[0.1, 9], [0.3, 16]]) near((hipMoment(Jw, loadPoints(Jw, pw), fr) / hipMoment(Jg, loadPoints(Jg, pg), fr) - 1) * 100, pct, 1, `${fr} 倍体重伸髋力矩增幅 %`);
  },
  'db-romanian-deadlift#1': ({ wrong: w, right: r, Jw }) => {
    near(Jw.spine.bend, 11, 0.1, '背拱起');
    near(w.trunkFromVertical - r.trunkFromVertical, 6, 0.5, '躯干多倾');
  },
  'db-hip-thrust#0': ({ Jw }) => {
    near(Jw.spine.bend, -11, 0.1, '腰拱起');
    // 往前（天花板方向）拱：弧的中段比躯干直线高
    const mid = Jw.spinePts[Math.floor(Jw.spinePts.length / 2)], line = (Jw.pelvis[1] + Jw.neck[1]) / 2;
    assert.ok(mid[1] < line - 5, `腰往上拱：弧中段 y=${mid[1].toFixed(1)}，直线 ${line.toFixed(1)}`);
  },
  'db-hip-thrust#1': ({ wrong: w, right: r, pw, pg }) => {
    const sh = (p) => Math.atan2(p.ankle[0] - p.knee[0], p.ankle[1] - p.knee[1]) * 180 / Math.PI;
    near(pw.ankle[0] - pg.ankle[0], 20, 0.1, '脚挪远');
    near(sh(pg), 0, 1, '正确小腿竖直'); near(sh(pw), 20, 1, '错误小腿前斜');
    near(r.kneeAngle, 91, 1, '正确膝角'); near(w.kneeAngle, 114, 1, '错误膝角');
  },
  'barbell-bench-press#0': ({ wrong: w, right: r, Jw, Jg }) => {
    const ab = (J) => { const t = J.pelvis.map((v, i) => v - J.neck[i]), a = J.elbowN.map((v, i) => v - J.shoulderN[i]); return Math.acos(t.reduce((s, x, i) => s + x * a[i], 0) / Math.hypot(...t) / Math.hypot(...a)) * 180 / Math.PI; };
    near(ab(Jg), 61, 1, '正确上臂与躯干'); near(ab(Jw), 93, 1, '错误上臂与躯干');
  },
  'barbell-bench-press#1': ({ pw, pg }) => {
    near(pg.shoulder[1] - pw.shoulder[1], 8, 0.2, '肩被顶起');
    near(pg.bench[1] - pg.shoulder[1], 6, 0.5, '正确肩离凳面'); near(pw.bench[1] - pw.shoulder[1], 14, 0.5, '错误肩离凳面');
    near(pg.load.at[1] - pw.load.at[1], 0, 0.5, '杠照样落到胸上');
  },
  'overhead-press#0': ({ pw, pg, Jw, Jg }) => {
    const sg = (J) => Math.atan2(J.neck[0] - J.pelvis[0], J.pelvis[1] - J.neck[1]) * 180 / Math.PI;
    near(pw.hip[0] - pg.hip[0], 15, 0.6, '髋前顶');
    near(sg(Jw), -5, 0.6, '错误躯干后仰'); near(sg(Jg), 2, 0.6, '灰影略前倾');
    near(Jw.spine.bend, -8, 0.1, '腰往前塌');
    near(pw.load.at[0], 90, 1.5, '杠仍在足中线上方');
  },
  'overhead-press#1': ({ pw, pg, Jw, Jg }) => {
    near(pw.load.at[0] - pg.load.at[0], 14, 0.2, '杠前移');
    near(pg.load.at[0] - Jg.shoulderN[0], 3, 1, '正确杠到肩'); near(pw.load.at[0] - Jw.shoulderN[0], 17, 1, '错误杠到肩');
    assert.ok(pw.load.at[0] > 96, '杠在足中线前方');
  },
  'close-grip-bench-press#0': ({ Jw, Jg }) => {
    const tilt = (J) => Math.atan2(J.elbowN[2] - J.wristN[2], J.elbowN[1] - J.wristN[1]) * 180 / Math.PI;
    near(Jg.wristN[2] - Jg.wristF[2], 60, 1, '正确两手间距'); near(Jw.wristN[2] - Jw.wristF[2], 24, 1, '错误两手间距');
    near(tilt(Jw), 39, 1.5, '错误前臂外倾'); near(tilt(Jg), 18, 1.5, '正确前臂外倾');
  },
  'close-grip-bench-press#1': ({ Jw, Jg }) => {
    const ab = (J) => { const t = J.pelvis.map((v, i) => v - J.neck[i]), a = J.elbowN.map((v, i) => v - J.shoulderN[i]); return Math.acos(t.reduce((s, x, i) => s + x * a[i], 0) / Math.hypot(...t) / Math.hypot(...a)) * 180 / Math.PI; };
    const tilt = (J) => Math.atan2(J.elbowN[2] - J.wristN[2], J.elbowN[1] - J.wristN[1]) * 180 / Math.PI;
    near(ab(Jg), 37, 1, '正确上臂与躯干'); near(ab(Jw), 50, 1, '错误上臂与躯干');
    near(tilt(Jw), 63, 1.5, '错误前臂外倾');
    near(Jw.wristN[2], Jg.wristN[2], 0.5, '握距不变');
  },
  'db-bench-press#0': ({ Jw, Jg, pw }) => {
    const ua = (J) => Math.asin((J.elbowN[1] - J.shoulderN[1]) / 50) * 180 / Math.PI;
    near(Jw.wristN[1] - Jg.wristN[1], 14, 0.3, '哑铃多下放');
    near(ua(Jg), 36, 1, '正确上臂低于肩'); near(ua(Jw), 59, 1, '错误上臂低于肩');
    const fv = (J) => Math.atan2(Math.hypot(J.elbowN[0] - J.wristN[0], J.elbowN[2] - J.wristN[2]), J.elbowN[1] - J.wristN[1]) * 180 / Math.PI;
    assert.ok(fv(Jw) < 3, `前臂仍竖直 ${fv(Jw).toFixed(1)}°`);
    assert.ok(pw.bench[1] - Jw.wristN[1] < 3, '几乎落到凳面高度');
  },
  'db-bench-press#1': ({ Jw, Jg }) => {
    near(Jw.wristF[1] - Jw.wristN[1], 20, 0.3, '远侧落后'); near(Jg.wristF[1] - Jg.wristN[1], 0, 0.1, '灰影同高');
  },
  'db-incline-bench-press#0': (_, d) => {
    const inc = (J) => Math.atan2(J.pelvis[1] - J.neck[1], J.pelvis[0] - J.neck[0]) * 180 / Math.PI;
    const ang = (J) => { const t = J.neck.map((v, i) => v - J.pelvis[i]), a = J.wristN.map((v, i) => v - J.shoulderN[i]); return Math.acos(t.reduce((s, x, i) => s + x * a[i], 0) / Math.hypot(...t) / Math.hypot(...a)) * 180 / Math.PI; };
    const m = mistakeMetrics(d.slug, d.fig, d.mf, 0, 0);
    near(inc(m.Jg), 30, 1, '正确凳角'); near(inc(m.Jw), 65, 1, '错误凳角');
    near(ang(m.Jg), 62, 1, '正确手臂与躯干'); near(ang(m.Jw), 30, 1, '错误手臂与躯干');
    const along = (J) => { const S = J.neck, H = J.pelvis, v = [H[0] - S[0], H[1] - S[1]], l = Math.hypot(...v); return ((J.wristN[0] - S[0]) * v[0] + (J.wristN[1] - S[1]) * v[1]) / l; };
    const b = mistakeMetrics(d.slug, d.fig, d.mf, 1, 0);
    near(along(b.Jw), along(b.Jg), 0.5, '到底时哑铃仍落在胸上段');
  },
  'db-incline-bench-press#1': ({ Jw, Jg }) => {
    const along = (J) => { const S = J.neck, H = J.pelvis, v = [H[0] - S[0], H[1] - S[1]], l = Math.hypot(...v); return ((J.wristN[0] - S[0]) * v[0] + (J.wristN[1] - S[1]) * v[1]) / l; };
    const ua = (J) => { const t = J.pelvis.map((v, i) => v - J.neck[i]), a = J.elbowN.map((v, i) => v - J.shoulderN[i]); return Math.acos(t.reduce((s, x, i) => s + x * a[i], 0) / Math.hypot(...t) / Math.hypot(...a)) * 180 / Math.PI; };
    near(along(Jw), 31, 1, '错误落点'); near(along(Jg), 14, 1, '正确落点');
    near(ua(Jg), 47, 1, '正确上臂与躯干'); near(ua(Jw), 40, 1, '错误上臂与躯干');
    const fv = (J) => Math.atan2(Math.hypot(J.elbowN[0] - J.wristN[0], J.elbowN[2] - J.wristN[2]), J.elbowN[1] - J.wristN[1]) * 180 / Math.PI;
    near(fv(Jw), 23, 1, '前臂斜向脚侧');
  },
  'db-shoulder-press#0': ({ Jw, Jg }) => {
    const rec = (J) => Math.atan2(J.pelvis[0] - J.neck[0], J.pelvis[1] - J.neck[1]) * 180 / Math.PI;
    const ang = (J) => { const t = J.neck.map((v, i) => v - J.pelvis[i]), a = J.wristN.map((v, i) => v - J.shoulderN[i]); return Math.acos(t.reduce((s, x, i) => s + x * a[i], 0) / Math.hypot(...t) / Math.hypot(...a)) * 180 / Math.PI; };
    near(rec(Jg), 7, 1, '正确后仰'); near(rec(Jw), 45, 1, '错误后仰');
    near(ang(Jg), 26, 1, '正确手臂与躯干'); near(ang(Jw), 52, 1, '错误手臂与躯干');
  },
  'db-shoulder-press#1': ({ Jw, Jg }, d) => {
    const ua = (J) => Math.asin((J.elbowN[1] - J.shoulderN[1]) / 50) * 180 / Math.PI;
    near(Jw.wristN[1] - Jg.wristN[1], 22, 0.3, '多下放');
    assert.ok(Jw.wristN[1] > Jw.shoulderN[1] + 3, '落到肩以下');
    assert.ok(Jg.wristN[1] < Jg.shoulderN[1], '灰影停在比肩高一点');
    near(ua(Jw), 63, 1, '错误上臂低于水平'); near(ua(Jg), 27, 1, '正确上臂低于水平');
    const fv = (J) => Math.atan2(Math.hypot(J.elbowN[0] - J.wristN[0], J.elbowN[2] - J.wristN[2]), J.elbowN[1] - J.wristN[1]) * 180 / Math.PI;
    assert.ok(fv(Jw) < 3, '前臂仍竖直');
    assert.equal(d.mf.tempo, 'bounceA');
  },
  'db-lateral-raise#0': (_, d) => {
    const tp = (J) => Math.atan2(J.neck[0] - J.pelvis[0], J.pelvis[1] - J.neck[1]) * 180 / Math.PI;
    const a = mistakeMetrics(d.slug, d.fig, d.mf, 0, 0), b = mistakeMetrics(d.slug, d.fig, d.mf, 0.56, 0), c = mistakeMetrics(d.slug, d.fig, d.mf, 0.56, 1);
    near(tp(a.Jw), 10, 0.5, '起始前弯'); near(tp(b.Jw), -11, 0.5, '起铃后甩'); near(tp(b.Jg), 0, 0.3, '灰影不动');
    assert.ok(tp(c.Jw) > 0, '下放时不后仰（后甩只在起铃）');
  },
  'db-lateral-raise#1': ({ Jw, Jg }) => {
    const el = (J) => Math.atan2(J.shoulderN[1] - J.wristN[1], Math.abs(J.wristN[2] - J.shoulderN[2])) * 180 / Math.PI;
    near(Jw.shoulderN[1] - Jw.wristN[1], 22, 1, '手高于肩');
    near(el(Jw), 15, 1, '错误高于水平'); near(el(Jg), -15, 1, '灰影低于水平');
    near(Jg.shoulderN[1] - Jw.shoulderN[1], 6, 0.2, '耸肩');
  },
  'barbell-row#0': ({ Jw, Jg, pw, pg }) => {
    const tf = (J) => Math.atan2(J.pelvis[1] - J.neck[1], J.neck[0] - J.pelvis[0]) * 180 / Math.PI;
    near(tf(Jg), 45, 0.5, '正确躯干离水平'); near(tf(Jw), 59, 0.5, '错误躯干离水平');
    near(pg.load.at[1] - pw.load.at[1], 9, 0.6, '杠被荡高');
  },
  'barbell-row#1': ({ Jw, Jg }, d) => {
    const tf = (J) => Math.atan2(J.pelvis[1] - J.neck[1], J.neck[0] - J.pelvis[0]) * 180 / Math.PI;
    near(tf(Jg), 45, 0.5, '正确躯干'); near(tf(Jw), 57, 0.5, '错误躯干');
    const a = mistakeMetrics(d.slug, d.fig, d.mf, 0, 0), b = mistakeMetrics(d.slug, d.fig, d.mf, 1, 0);
    near(a.right.hipToLoadX, 57, 1, '起始正确力臂'); near(a.wrong.hipToLoadX, 37, 1, '起始错误力臂');
    near(a.wrong.kneeAngle, a.right.kneeAngle, 0.5, '膝角不变');
    // 拉到顶时杠仍落在腹部同一处：杠到躯干线的垂距与正确相同
    const perp = (p) => { const S = p.shoulder, H = p.hip, L = p.load.at, t = [S[0] - H[0], S[1] - H[1]], l = Math.hypot(...t); return ((L[0] - H[0]) * t[1] - (L[1] - H[1]) * t[0]) / l; };
    near(perp(b.pw), perp(b.pg), 0.5, '顶点杠贴腹位置不变');
  },
  'barbell-curl#0': ({ wrong: w, right: r, Jw, Jg, pw, pg }) => {
    const sg = (J) => Math.atan2(J.neck[0] - J.pelvis[0], J.pelvis[1] - J.neck[1]) * 180 / Math.PI;
    near(pw.hip[0] - pg.hip[0], 10, 0.6, '髋前顶'); near(sg(Jw), -7, 0.6, '错误后仰'); near(sg(Jg), 2, 0.6, '灰影前倾');
    near(pg.load.at[1] - pw.load.at[1], 5, 0.6, '杠更高'); near(w.elbowAngle, r.elbowAngle, 0.5, '肘角一样');
  },
  'barbell-curl#1': ({ Jw, Jg }) => {
    const ua = (J) => Math.atan2(J.elbowN[0] - J.shoulderN[0], J.elbowN[1] - J.shoulderN[1]) * 180 / Math.PI;
    near(ua(Jw), 26, 1, '上臂前抬'); assert.ok(Math.abs(ua(Jg)) < 4, '灰影上臂竖直');
  },
  'db-one-arm-row#0': ({ Jw, Jg }) => {
    const sl = (J) => Math.atan2(J.shoulderN[1] - J.shoulderF[1], J.shoulderN[2] - J.shoulderF[2]) * 180 / Math.PI;
    near(Math.abs(sl(Jw)), 24, 1, '肩线转'); near(sl(Jg), 0, 0.5, '灰影两肩水平');
    near(Jg.wristN[1] - Jw.wristN[1], 16, 0.6, '哑铃被抬高');
    near(L3(Jw.wristF, Jg.wristF), 0, 0.05, '撑凳的手不动');
  },
  'db-one-arm-row#1': ({ Jw, Jg }) => {
    const along = (J) => { const S = J.neck, H = J.pelvis, v = [H[0] - S[0], H[1] - S[1]], l = Math.hypot(...v); return ((J.wristN[0] - S[0]) * v[0] + (J.wristN[1] - S[1]) * v[1]) / l; };
    near(along(Jw), 24, 1, '错误拉到离肩'); near(along(Jg), 52, 1, '正确拉到离肩');
  },
  'db-reverse-fly#0': ({ Jw, Jg }) => {
    const th = (J) => Math.atan2(J.pelvis[1] - J.neck[1], Math.abs(J.neck[0] - J.pelvis[0])) * 180 / Math.PI;
    near(th(Jg), 45, 0.5, '正确躯干离水平'); near(th(Jw), 63, 0.5, '错误躯干离水平');
    near(Jg.wristN[1] - Jw.wristN[1], 19, 0.6, '哑铃被掀高');
  },
  'db-reverse-fly#1': ({ Jw, Jg }) => {
    near(L3(Jw.shoulderN, Jg.shoulderN), 8, 0.1, '耸肩');
    assert.ok(L3(Jw.neck, Jg.neck) < 0.01, '颈不动');
  },
  'db-curl#0': ({ wrong: w, right: r, Jw, Jg, pw, pg }) => {
    const sg = (J) => Math.atan2(J.neck[0] - J.pelvis[0], J.pelvis[1] - J.neck[1]) * 180 / Math.PI;
    near(pw.hip[0] - pg.hip[0], 10, 0.6, '髋前顶'); near(sg(Jw), -7, 0.6, '错误后仰'); near(sg(Jg), 2, 0.6, '灰影前倾');
    near(Jg.wristN[1] - Jw.wristN[1], 5, 0.6, '哑铃更高'); near(w.elbowAngle, r.elbowAngle, 0.5, '肘角一样');
  },
  'db-curl#1': ({ wrong: w, right: r }) => {
    near(w.elbowAngle, 107, 1, '错误只放到一半'); near(r.elbowAngle, 168, 1, '灰影放到接近伸直');
  },
  'db-hammer-curl#0': (_, d) => {
    // 直接量场景里画出来的哑铃把手方向：错误到顶时与灰影差 90°，起始时重合
    const s = mistakeSetup(d.fig, d.mf);
    const axis = (u, fault) => {
      const p = interpolate(fault ? s.A : s.GA, fault ? s.B : s.GB, u, s.iopts);
      const sc = orbitScene(d.slug, fault ? { a: s.wa, b: s.wb } : { a: s.ga, b: s.gb }, p, { u, lt: d.fig.load_type, fault: fault ? s.fault : undefined });
      const h = sc.S.find((it) => it.cls.includes('sk-db-handle') && it.side === 'N');
      const v = [h.b[0] - h.a[0], h.b[1] - h.a[1], h.b[2] - h.a[2]], l = Math.hypot(...v);
      return v.map((x) => x / l);
    };
    const ang = (a, b) => Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180 / Math.PI;
    near(ang(axis(1, true), axis(1, false)), 90, 1, '到顶翻转 90°');
    near(ang(axis(0, true), axis(0, false)), 0, 1, '起始中立握');
  },
  'db-hammer-curl#1': ({ wrong: w, right: r, Jw, Jg, pw, pg }) => {
    const sg = (J) => Math.atan2(J.neck[0] - J.pelvis[0], J.pelvis[1] - J.neck[1]) * 180 / Math.PI;
    near(pw.hip[0] - pg.hip[0], 10, 0.6, '髋前顶'); near(sg(Jw), -7, 0.6, '错误后仰'); near(sg(Jg), 2, 0.6, '灰影前倾');
    near(Jg.wristN[1] - Jw.wristN[1], 5, 0.6, '哑铃更高'); near(w.elbowAngle, r.elbowAngle, 0.5, '肘角一样');
  },
  'barbell-reverse-curl#1': ({ wrong: w, right: r, Jw, Jg, pw, pg }) => {
    const sg = (J) => Math.atan2(J.neck[0] - J.pelvis[0], J.pelvis[1] - J.neck[1]) * 180 / Math.PI;
    near(pw.hip[0] - pg.hip[0], 10, 0.6, '髋前顶'); near(sg(Jw), -7, 0.6, '错误后仰'); near(sg(Jg), 2, 0.6, '灰影前倾');
    near(pg.load.at[1] - pw.load.at[1], 5, 0.6, '杠更高'); near(w.elbowAngle, r.elbowAngle, 0.5, '肘角一样');
  },
};

test('错误只错在那一处：不许顺带画出别的错误', () => {
  // 评审一再抓到的同一类问题：变换改对了目标关节，却把另一个关节拖成了另一个错误——
  // 抬髋把膝甩到踝后面、前推下半身把深蹲推成半蹲、屈膝时杠穿过大腿。
  // 这些副作用默认禁止；确实属于这条错误本身的，在 allow 里写明。
  const side = (A, B, P) => Math.sign((B[0] - A[0]) * (P[1] - A[1]) - (B[1] - A[1]) * (P[0] - A[0]));
  const segDist = (A, B, P) => { const v = [B[0] - A[0], B[1] - A[1]], t = Math.max(0, Math.min(1, ((P[0] - A[0]) * v[0] + (P[1] - A[1]) * v[1]) / (v[0] ** 2 + v[1] ** 2))); return Math.hypot(P[0] - A[0] - v[0] * t, P[1] - A[1] - v[1] * t); };
  for (const d of drawn) {
    const allow = new Set(d.mf.allow ?? []), key = `${d.slug}#${d.mf.mistake}`;
    for (const { W, G, u, half } of framesOf(d)) {
      const w = W.p, g = G.p, at = `${key} u=${u} half=${half}`;
      if (!w.knee || !w.ankle || !g.knee) continue;
      const standing = !g.bench && !g.benchIncline && !g.fixed && g.heel?.[1] >= 222 && g.toe?.[1] >= 222;
      const fwd = Math.sign((g.toe[0] - g.heel[0]) || 1);
      if (standing && !allow.has('kneeBack') && (g.knee[0] - g.ankle[0]) * fwd >= -1)
        assert.ok((w.knee[0] - w.ankle[0]) * fwd >= -2, `${at}: 膝到了踝后方 ${((w.knee[0] - w.ankle[0]) * fwd).toFixed(1)}px（正确动作不会）`);
      if (standing && !allow.has('shin')) {
        const lean = Math.abs(Math.atan2(w.knee[0] - w.ankle[0], w.ankle[1] - w.knee[1])) * 180 / Math.PI;
        const lg = Math.abs(Math.atan2(g.knee[0] - g.ankle[0], g.ankle[1] - g.knee[1])) * 180 / Math.PI;
        assert.ok(lean <= Math.max(45, lg + 1), `${at}: 小腿前倾 ${lean.toFixed(0)}°`);
      }
      // 肘角：错误动作的手臂不能比正确动作多弯 / 多伸 5° 以上（硬拉「髋高」曾顺带画成弯臂拉）
      if (!allow.has('elbow') && !(d.mf.params) && !d.mf.rom && !(d.mf.ops ?? []).some((op) => ['arm', 'arm3', 'load', 'hand3'].includes(op.op))) {
        const ea = (J) => { const S = J.shoulderN, E = J.elbowN, H = J.wristN; return Math.acos(((S[0] - E[0]) * (H[0] - E[0]) + (S[1] - E[1]) * (H[1] - E[1]) + (S[2] - E[2]) * (H[2] - E[2])) / (L3(S, E) * L3(H, E))) * 180 / Math.PI; };
        assert.ok(Math.abs(ea(W.J) - ea(G.J)) <= 5, `${at}: 肘角 ${ea(W.J).toFixed(0)}° 对灰影 ${ea(G.J).toFixed(0)}°`);
      }
      // 卧推类：底部杠的高度不许变（「没触胸」是另一条错误）
      if (g.bench && w.load?.type === 'bar' && g.load && !allow.has('barDepth') && !(d.mf.ops ?? []).some((op) => op.op === 'load') && u === 1)
        assert.ok(Math.abs(w.load.at[1] - g.load.at[1]) <= 1, `${at}: 底部杠高差 ${(w.load.at[1] - g.load.at[1]).toFixed(1)}px`);
      if (standing && !allow.has('depth') && g.hip[1] > g.knee[1] + 3)
        assert.ok(w.hip[1] > w.knee[1], `${at}: 正确动作蹲到髋低于膝，错误动作没有（${(w.hip[1] - w.knee[1]).toFixed(1)}）`);
      // 垂在身前的杠（硬拉、RDL、划船）：杠必须始终在大腿 / 小腿的前侧，且不贴进骨头里
      if (w.load && ['bar'].includes(w.load.type) && w.loadAnchor === 'wrist' && standing) {
        for (const [A, B] of [[w.hip, w.knee], [w.knee, w.ankle]]) {
          const L = w.load.at;
          if (L[1] < Math.min(A[1], B[1]) || L[1] > Math.max(A[1], B[1])) continue;
          assert.ok(side(A, B, L) === side(A, B, [A[0] + fwd * 50, (A[1] + B[1]) / 2]) && segDist(A, B, L) > 3, `${at}: 杠穿到了腿的后面或贴进骨头（离腿线 ${segDist(A, B, L).toFixed(1)}px）`);
        }
      }
    }
  }
});

test('站姿错误示范站得住：全身重心落在支撑面上', () => {
  // 画出来的错误动作也得是人能做出来的样子：踮脚跟却把重心留在脚跟上方的人会往后倒，
  // 那张图教的就不是「踮脚跟」而是一个不存在的姿势。负荷按体重比例的两端各查一次，灰影同样要过。
  for (const d of drawn) {
    const r = mistakeBalance(d.slug, d.fig, d.mf);
    if (r) assert.ok(r.ok, `${d.slug}#${d.mf.mistake}: 重心出了支撑面 ${JSON.stringify(r.worst)}`);
  }
});

test('只动一侧时，另一侧不标红', () => {
  // 两手不同步：近侧那只是对的，标红了读者就分不出哪只落后
  for (const d of drawn) {
    const sides = new Set((d.mf.hl ?? []).map((h) => h.split('@')[0].split('.')[1]).filter(Boolean));
    if (sides.size !== 1) continue;
    const other = sides.has('F') ? 'N' : 'F';
    for (const { W } of framesOf(d)) assert.ok(!W.S.some((it) => it.side === other && it.cls.includes('sk-fault')), `${d.slug}#${d.mf.mistake}: ${other} 侧被标红`);
  }
});

test('变换几乎没起作用的帧与灰影几乎重合（不许跳变）', () => {
  // hand3 foreVertical 曾经强度刚过 0 就把前臂直接设成竖直，手一下跳 7px
  for (const d of drawn) {
    if (d.mf.params || d.mf.rom || d.mf.start || d.mf.end || d.mf.tempo) continue;
    for (const { W, G, u, half } of framesOf(d)) {
      if (!(d.mf.ops ?? []).every((op) => opWeight(op, u, half) < 0.05)) continue;
      for (const k of Object.keys(G.J)) if (Array.isArray(G.J[k]) && W.J[k])
        assert.ok(L3(W.J[k], G.J[k]) < 3, `${d.slug}#${d.mf.mistake} u=${u} half=${half}: 强度 <0.05 时 ${k} 差 ${L3(W.J[k], G.J[k]).toFixed(1)}`);
    }
  }
});

test('与灰影重合的帧不标红', () => {
  // 不依赖强度曲线的公式：曾经一个辅助变换（regrip，常量强度）让硬拉锁定帧全程标红，而那一帧人与灰影完全重合
  for (const d of drawn) for (const { W, G, u, half } of framesOf(d)) {
    if (d.mf.rom || d.mf.start || d.mf.end) continue;
    // 参数类错误（握距、肘的去向）在行程两端本来就和灰影差一两像素：放宽到 3px
    const tol = d.mf.params ? 3 : 0.5;
    const lw = loadPts(W.S), lg = loadPts(G.S);
    const same = Object.keys(G.J).every((k) => !Array.isArray(G.J[k]) || !W.J[k] || L3(W.J[k], G.J[k]) < tol) && Math.abs(W.J.spine?.bend ?? 0) < 0.5
      && lw.length === lg.length && lw.every((q, i) => L3(q, lg[i]) < tol);
    if (same) assert.ok(!W.S.some((it) => it.cls.includes('sk-fault')), `${d.slug}#${d.mf.mistake} u=${u} half=${half}: 与灰影重合却标红`);
  }
});

test('「为什么错」里的数字是图上量得到的', () => {
  for (const d of drawn) {
    const key = `${d.slug}#${d.mf.mistake}`;
    const claim = CLAIMS[key];
    // 写了数字的说明必须登记核对；没写数字的不强求
    if (/\d/.test(d.mf.why.replace(/[0-9]+\s*章/g, ''))) assert.ok(claim, `${key}：why 里有数字，但没有登记核对`);
    if (!claim) continue;
    const { u, half } = mistakeStill(d.mf);
    claim(mistakeMetrics(d.slug, d.fig, d.mf, u, half), d);
  }
});
