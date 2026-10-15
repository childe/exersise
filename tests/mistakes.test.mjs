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
import { orbitScene, orbitFrame, orbitPoints, orbitBaseYaw, ORBIT_YAW } from '../src/render/orbit.mjs';
import { faultU, faultWeight } from '../src/render/faults.mjs';
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

test('错误示范与灰影看得出差别', () => {
  // 最大的关节位移至少 8px（约 5cm）：再小就是两层几乎重合的线，读者看不出错在哪。
  // 节奏类错误（tempo）的差别在时间上，不在形状上，不查。
  for (const d of drawn) {
    if (d.mf.tempo) continue;
    let best = 0;
    for (const { W, G } of framesOf(d)) {
      for (const k of Object.keys(G.J)) if (Array.isArray(G.J[k]) && W.J[k]) best = Math.max(best, L3(W.J[k], G.J[k]));
    }
    assert.ok(best >= 8, `${d.slug}#${d.mf.mistake}: 错误与正确最多只差 ${best.toFixed(1)}px`);
  }
});

test('错误示范的每一帧、每个角度都在画框内', () => {
  for (const d of drawn) {
    const html = renderMistakeFigure(d.fig, d.mf, d.slug, d.slug, 'x');
    const cfg = JSON.parse(html.match(/data-anim="([^"]+)"/)[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&'));
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
    if (!d.mf.ops?.length) continue;
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
  'back-squat-high-bar#0': ({ wrong: w, right: r }) => {
    near(r.kneeAngle, 113, 2, '正确动作起身中段膝角');
    near(w.kneeAngle, 163, 2, '错误动作膝角');
    near(r.trunkFromVertical, 33, 1.5, '正确躯干离竖直');
    near(w.trunkFromVertical, 49, 1.5, '错误躯干离竖直');
    near(r.hipToLoadX, 43, 1.5, '正确髋到杠水平距离');
    near(w.hipToLoadX, 60, 1.5, '错误髋到杠水平距离');
    near(w.load[0], r.load[0], 0.5, '杠的水平位置不变');
  },
  'back-squat-high-bar#1': ({ wrong: w, right: r }) => {
    near(r.kneeZ - w.kneeZ, 12, 1, '膝往中线收');
    assert.ok(w.kneeZ < w.ankleZ, '错误动作的膝落在踝的内侧');
    assert.ok(r.kneeZ >= r.ankleZ, '正确动作的膝在踝的正上方或外侧');
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
    claim(mistakeMetrics(d.slug, d.fig, d.mf, u, half));
  }
});
