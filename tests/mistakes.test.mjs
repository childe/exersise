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
import { faultU, faultWeight, mistakeInterpOpts } from '../src/render/faults.mjs';
import { ORBIT_STATIC } from '../src/render/orbit.mjs';
import { mistakeMetrics } from '../src/render/mistake-metrics.mjs';
import { validateMistakeFigures } from '../src/validate/mistakes.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = async (f) => JSON.parse(await readFile(path.join(root, f), 'utf8'));
const figures = await read('data/figures.json');
const exercises = await read('data/exercises.json');
const MF = await read('data/mistake-figures.json');
const L3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

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
  pelvis: ['trunk', 'thigh', 'pelvis'], neck: ['trunk', 'shoulders', 'head'], back: ['trunk'], shoulder: ['shoulders', 'trunk', 'upperarm'],
  elbow: ['upperarm', 'forearm'], wrist: ['forearm', 'load'], head: ['head'], spine: ['trunk'],
};
/** 错误与灰影在若干视角下投影位移最大的关节：[位移, 关节名]。 */
function maxShift(d, yaws) {
  const cfg = cfgOf(d), base = orbitBaseYaw(d.slug, cfg.fault);
  let best = [0, ''];
  for (const { W, G } of framesOf(d)) {
    const pts = (J) => {
      const o = Object.fromEntries(Object.entries(J).filter(([, v]) => Array.isArray(v) && typeof v[0] === 'number'));
      // 圆背 / 塌腰只改躯干线中段：取弧的中点，灰影取直线中点
      o.spine = J.spinePts ? J.spinePts[Math.floor(J.spinePts.length / 2)] : J.pelvis.map((x, i) => (x + J.neck[i]) / 2);
      return o;
    };
    const w = pts(W.J), g = pts(G.J);
    for (const yaw of (yaws ?? [base - ORBIT_YAW, base, base + ORBIT_YAW])) {
      for (const k of Object.keys(g)) {
        if (!w[k]) continue;
        const a = orbitProject(w[k], yaw, cfg.orbit.pivot), b = orbitProject(g[k], yaw, cfg.orbit.pivot);
        const dd = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (dd > best[0]) best = [dd, k.replace(/[NF]$/, '')];
      }
    }
  }
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
  for (const d of drawn) {
    if (!d.mf.hl?.length) continue;
    const [, k] = maxShift(d);
    const parts = PART_OF[k] ?? [];
    const hl = d.mf.hl.map((h) => h.replace(/\.[NF]$/, ''));
    assert.ok(parts.some((x) => hl.includes(x)), `${d.slug}#${d.mf.mistake}: 差别最大的是 ${k}，可标红的是 ${d.mf.hl.join('、')}`);
  }
});

test('变换没有被钳住：要多少给多少', () => {
  // 挪髋挪到腿够不到时会被钳到两圆交点上——画出来的是「腿锁直、小腿后仰」，不是数据写的那个错误
  for (const d of drawn) for (const { W, u, half } of framesOf(d))
    assert.ok(!W.p._faultClamped, `${d.slug}#${d.mf.mistake} u=${u} half=${half}: 变换被钳住，调小幅度`);
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
    if (!d.mf.ops?.length || d.mf.params || d.mf.rom) continue;
    for (const { W, u, half } of framesOf(d)) {
      const on = d.mf.ops.some((op) => faultWeight(op.prof, u, half) >= 0.2);
      const red = W.S.some((it) => it.cls.includes('sk-fault'));
      assert.equal(red, on, `${d.slug}#${d.mf.mistake} u=${u} half=${half}: 标红 ${red}，变换强度 ${on ? '≥' : '<'} 0.2`);
    }
  }
});

// ── 每条错误示范的「为什么错」里写的数字 ──────────────────────
// 写进文字的量都在这里核对：图改了、文字没跟上，这里会失败。
const near = (v, x, tol, msg) => assert.ok(Math.abs(v - x) <= tol, `${msg}：实测 ${v.toFixed(1)}，文字写 ${x}`);
const CLAIMS = {
  'back-squat-high-bar#0': ({ wrong: w, right: r, pw }) => {
    near(w.kneeAngle - r.kneeAngle, 20, 2, '膝多伸');
    const shin = Math.atan2(pw.knee[0] - pw.ankle[0], pw.ankle[1] - pw.knee[1]) * 180 / Math.PI;
    near(shin, 0, 3, '小腿接近竖直（不往后仰）');
    near(r.trunkFromVertical, 33, 1, '正确躯干离竖直');
    near(w.trunkFromVertical, 42, 1, '错误躯干离竖直');
    near(r.hipToLoadX, 43, 1, '正确髋到杠水平距离');
    near(w.hipToLoadX, 52, 1, '错误髋到杠水平距离');
    near((w.hipToLoadX / r.hipToLoadX - 1) * 100, 22, 2, '力臂增幅 %');
    near(w.load[0], r.load[0], 0.5, '杠的水平位置不变');
  },
  'back-squat-high-bar#1': ({ wrong: w, right: r }) => {
    near(r.kneeZ - w.kneeZ, 12, 1, '膝往中线收');
    assert.ok(w.kneeZ < w.ankleZ, '错误动作的膝落在踝的内侧');
    assert.ok(r.kneeZ >= r.ankleZ, '正确动作的膝在踝的正上方或外侧');
  },
  'goblet-squat#0': ({ wrong: w, right: r }) => {
    near(w.load[0] - r.load[0], 16, 0.5, '哑铃前移');
    near(r.hipToLoadX, 36, 1, '正确力臂');
    near(w.hipToLoadX, 52, 1, '错误力臂');
    near((w.hipToLoadX / r.hipToLoadX - 1) * 100, 45, 2, '力臂增幅 %');
    assert.ok(w.load[0] > 90 + 6, '哑铃铅垂线落在足中线前方');
  },
  'goblet-squat#1': ({ pw, pg }) => {
    near(225 - pw.heel[1], 9, 0.5, '脚跟离地');
    near(pw.toe[1], 225, 0.5, '前脚掌仍在地上');
    assert.ok(pw.knee[0] - pg.knee[0] > 1, '膝更往前');
  },
  'back-squat-low-bar#0': ({ wrong: w, right: r, pw, pg }) => {
    near(w.trunkFromVertical, 35, 1, '错误躯干角');
    near(r.trunkFromVertical, 48, 1, '正确躯干角');
    near(w.load[0] - 90, 11, 1, '杠在足中线前');
    near(pw.knee[0] - pw.toe[0], 16, 1, '膝超过脚尖');
    near(pg.toe[0] - pg.knee[0], 10, 1, '灰影的膝在脚尖后');
    assert.ok(!pw._faultClamped);
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
    for (const u of [0, 1]) {
      const m = mistakeMetrics(d.slug, d.fig, d.mf, u, 0);
      assert.ok(ua(m.Jw) >= 50 && ua(m.Jw) <= 71, `u=${u} 错误上臂低于水平 ${ua(m.Jw).toFixed(1)}°`);
      assert.ok(Math.abs(ua(m.Jg)) <= 13, `u=${u} 正确上臂离水平 ${ua(m.Jg).toFixed(1)}°`);
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
};

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
