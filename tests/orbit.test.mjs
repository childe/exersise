// 环绕视角（src/render/orbit.mjs）的 3D 断言。
//
// 侧视的 2D 断言（validatePoses 等）仍然管着姿态数据本身；这里管的是从 2D 推出 3D 之后
// 才出现的东西：手臂在 3D 里的骨长、手是否还握在器械上、动画任何一帧任何角度都不越框。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { POSES, GROUND, drawnArm } from '../src/render/skeleton.mjs';
import { interpolate } from '../src/render/interp.mjs';
import { ORBIT_PARAMS, ORBIT_YAW, orbitLift, orbitScene, orbitFrame, orbitPoints, orbitBaseYaw, orbitProject } from '../src/render/orbit.mjs';

const root = path.resolve(import.meta.dirname, '..');
const figures = JSON.parse(await readFile(path.join(root, 'data/figures.json'), 'utf8'));
const L = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** 每个动作的补间帧：与客户端同一套 interpolate、同一组选项。 */
function* framesOf() {
  for (const [slug, f] of Object.entries(figures)) {
    const strip = (p) => (f.no_load && p ? { ...p, load: undefined } : p);
    const a = strip(POSES[f.start]), b = strip(POSES[f.end ?? f.start]);
    const io = { plumb: f.plumb, handPath: !!f.hand_path };
    for (let i = 0; i <= 16; i++) {
      const u = i / 16;
      yield { slug, f, a, b, io, u, p: interpolate(a, b, u, io), names: { a: f.start, b: f.end ?? f.start } };
    }
  }
}

test('figures.json 里每个动作都登记了 3D 参数', () => {
  // 漏登记不会报错——会静默落到默认站距和握距，画出来像个别的动作
  const missing = Object.keys(figures).filter((s) => !ORBIT_PARAMS[s]);
  assert.deepEqual(missing, [], `没有 ORBIT_PARAMS 的动作：${missing.join('、')}`);
  const stale = Object.keys(ORBIT_PARAMS).filter((s) => !figures[s]);
  assert.deepEqual(stale, [], `ORBIT_PARAMS 里有已不存在的动作：${stale.join('、')}`);
});

test('3D 手臂是真骨长：上臂 50、前臂 39，全程不伸缩', () => {
  // 2D 侧视里出平面的手臂只能画投影（见 arm.mjs），3D 里没有这个借口。
  // 握点够不到时由 orbReach 把手拉回，而不是把前臂拉长——曾经拉长到 47（+8.3）。
  let n = 0;
  for (const { slug, f, p, u, names } of framesOf()) {
    const J = orbitLift(slug, names, p, u, f.load_type);
    for (const t of ['N', 'F']) {
      const up = L(J['shoulder' + t], J['elbow' + t]), fo = L(J['elbow' + t], J['wrist' + t]);
      assert.ok(Math.abs(up - 50) < 0.01, `${slug} u=${u} ${t}: 上臂 ${up.toFixed(2)}`);
      assert.ok(Math.abs(fo - 39) < 0.01, `${slug} u=${u} ${t}: 前臂 ${fo.toFixed(2)}`);
      n++;
    }
  }
  assert.ok(n > 1000, `只查了 ${n} 条手臂`);
});

test('握杆类器械：两只手都在杆上', () => {
  // 杠铃、单杠、健腹轮、雪橇：手离杆心不超过 10px（2D 里杠心画在手下方 6–8px，
  // 握点够不到时 orbReach 再拉回 1–2px），
  // 且手在杆的长度范围之内（不会握到杠铃片外面去）。
  for (const { slug, f, p, u, names } of framesOf()) {
    const t = f.load_type ?? p.load?.type;
    const at = p.fixed?.at ?? (['bar', 'front', 'wheel', 'sled'].includes(t) ? p.load?.at : null);
    if (!at || ORBIT_PARAMS[slug].view) continue;
    const J = orbitLift(slug, names, p, u, f.load_type);
    for (const k of ['wristN', 'wristF']) {
      const d = Math.hypot(J[k][0] - at[0], J[k][1] - at[1]);
      assert.ok(d <= 10, `${slug} u=${u} ${k}: 手离杆心 ${d.toFixed(1)}px`);
      assert.ok(Math.abs(J[k][2]) <= 64, `${slug} u=${u} ${k}: 手在 z=${J[k][2]}，超出杆长`);
    }
  }
});

test('任何东西都不穿地', () => {
  // 杠铃片贴地时半径被限制为杠心离地高度，就是为了这一条。
  // 容差 3px 与 2D 契约 §2 第 3 条同口径：3D 的 y 原样来自 2D 补间，补间中途本来就有零点几像素的出入。
  for (const { slug, f, p, u, names } of framesOf()) {
    const sc = orbitScene(slug, names, p, { u, lt: f.load_type });
    for (const it of sc.S) {
      // 关节与手是圆点标记：查圆心（手撑地时圆心在地面上，圆的下沿本来就低 4px）；头是实体，查下沿
      const ball = it.cls === 'sk-head' ? [[it.c[0], it.c[1] + it.r, it.c[2]]] : [it.c];
      for (const q of it.t === 'line' ? [it.a, it.b] : it.t === 'poly' ? it.pts : ball) {
        assert.ok(q[1] <= GROUND + 3, `${slug} u=${u}: ${it.cls} 在 y=${q[1].toFixed(1)}，低于地面 ${GROUND}`);
      }
    }
  }
});

test('动画任何一帧、任何角度都落在固定画框内', () => {
  // 画框是按若干采样帧算的；这里用更密的帧和角度去验，抓「采样之间越框」
  const done = new Set();
  for (const { slug, f, a, b, io, names } of framesOf()) {
    if (done.has(slug)) continue;
    done.add(slug);
    const ro = { prime: [], plumb: f.plumb !== false && !f.no_load, lt: f.load_type, names };
    const fr = orbitFrame(slug, a, b, interpolate, io, ro);
    const [bx, by, bw, bh] = fr.box;
    for (let i = 0; i <= 20; i++) {
      const u = i / 20, p = interpolate(a, b, u, io);
      const sc = orbitScene(slug, names, p, { u, plumb: ro.plumb, floor: fr.floor, lt: f.load_type });
      for (let k = -4; k <= 4; k++) {
        const yaw = orbitBaseYaw(slug) + ORBIT_YAW * k / 4;
        for (const [x, y] of orbitPoints(sc, yaw, fr.pivot)) {
          assert.ok(x >= bx - 1 && x <= bx + bw + 1 && y >= by - 1 && y <= by + bh + 1,
            `${slug} u=${u} yaw=${yaw}: (${x.toFixed(1)}, ${y.toFixed(1)}) 越出画框 ${fr.box}`);
        }
      }
    }
  }
});

const angAt = (E, S, H) => {
  const a = [S[0] - E[0], S[1] - E[1], S[2] - E[2]], b = [H[0] - E[0], H[1] - E[1], H[2] - E[2]];
  return Math.acos((a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / Math.hypot(...a) / Math.hypot(...b)) * 180 / Math.PI;
};

test('肘角在解剖范围内：≥25°', () => {
  // 骨长断言抓不到这一类：手离肩只有 11px 时 IK 照样解出 50/39，只是前臂平贴在上臂上（曾到 4°）。
  // 真人肘屈到头约 25–35°（前架位、高脚杯就在这一端）。
  for (const { slug, f, p, u, names } of framesOf()) {
    const J = orbitLift(slug, names, p, u, f.load_type);
    for (const t of ['N', 'F']) {
      const d = angAt(J['elbow' + t], J['shoulder' + t], J['wrist' + t]);
      assert.ok(d >= 25, `${slug} u=${u} ${t}: 肘角 ${d.toFixed(1)}°`);
    }
  }
});

test('Pallof 推出时手臂接近伸直（≥150°，与 2D 判据同口径）', () => {
  for (const slug of ['band-pallof-press', 'cable-pallof-press']) {
    const f = figures[slug], names = { a: f.start, b: f.end };
    const J = orbitLift(slug, names, interpolate(POSES[f.start], POSES[f.end], 1, { plumb: f.plumb }), 1);
    for (const t of ['N', 'F']) {
      const d = angAt(J['elbow' + t], J['shoulder' + t], J['wrist' + t]);
      assert.ok(d >= 150, `${slug} ${t}: 推出时肘角 ${d.toFixed(1)}°`);
    }
  }
});

test('卧推、推举到底时前臂接近竖直（≤20°）', () => {
  // cue 与自检都点名这一条（「下放到底时前臂接近垂直」「底部时前臂接近垂直」）。
  // 底部 = 两端里手离肩更近的那一端。
  for (const slug of ['barbell-bench-press', 'db-bench-press', 'db-incline-bench-press', 'db-shoulder-press', 'machine-shoulder-press']) {
    const f = figures[slug], names = { a: f.start, b: f.end };
    const ends = [0, 1].map((u) => {
      const p = interpolate(POSES[f.start], POSES[f.end], u, { plumb: f.plumb });
      const J = orbitLift(slug, names, p, u, f.load_type);
      return { J, d: L(J.shoulderN, J.wristN) };
    });
    const { J } = ends[0].d < ends[1].d ? ends[0] : ends[1];
    for (const t of ['N', 'F']) {
      const v = [J['wrist' + t][0] - J['elbow' + t][0], J['wrist' + t][1] - J['elbow' + t][1], J['wrist' + t][2] - J['elbow' + t][2]];
      const off = Math.acos(-v[1] / Math.hypot(...v)) * 180 / Math.PI;
      assert.ok(off <= 20, `${slug} ${t}: 底部前臂偏离竖直 ${off.toFixed(1)}°`);
    }
  }
});

test('近侧始终比远侧离读者近（近实远灰的主次不会画反）', () => {
  // 反向飞鸟曾取基准 120°，相机在 −z 一侧，整段摆动里远侧都更近，灰的反而是近的那侧
  for (const { slug, f, p, u, names } of framesOf()) {
    if (ORBIT_PARAMS[slug].view === 'front') continue;   // 正视两侧等距，不分主次
    const J = orbitLift(slug, names, p, u, f.load_type);
    for (let k = -4; k <= 4; k++) {
      const yaw = orbitBaseYaw(slug) + ORBIT_YAW * k / 4;
      const dn = orbitProject(J.shoulderN, yaw, [0, 0])[2], df = orbitProject(J.shoulderF, yaw, [0, 0])[2];
      assert.ok(dn >= df - 0.5, `${slug} u=${u} yaw=${yaw}: 近侧肩深度 ${dn.toFixed(1)} < 远侧 ${df.toFixed(1)}`);
    }
  }
});

test('单侧支撑落在凳面上：单臂划船的手与膝、保加利亚的后脚', () => {
  // 凳面范围从**画出来的**凳子图元里取，不读 ORBIT_PARAMS——读参数表的话，凳子没挪也照样通过
  const benchZ = (slug, names, p, u, lt) => {
    const zs = orbitScene(slug, names, p, { u, lt }).S.filter((it) => it.cls === 'sk-bench').flatMap((it) => it.pts.map((q) => q[2]));
    return [Math.min(...zs), Math.max(...zs)];
  };
  const checks = { 'db-one-arm-row': ['wristF', 'kneeF'], 'db-bulgarian-split-squat': ['heelF', 'toeF'] };
  for (const { slug, f, p, u, names } of framesOf()) {
    if (!checks[slug]) continue;
    const J = orbitLift(slug, names, p, u, f.load_type);
    const [z0, z1] = benchZ(slug, names, p, u, f.load_type);
    for (const k of checks[slug]) assert.ok(J[k][2] >= z0 && J[k][2] <= z1, `${slug} u=${u}: ${k} 在 z=${J[k][2]}，凳面 ${z0}…${z1}`);
    // 站立腿在凳外（单臂划船）
    if (slug === 'db-one-arm-row') assert.ok(J.kneeN[2] > z1, `${slug}: 站立腿的膝 z=${J.kneeN[2]} 穿过凳面`);
  }
});

test('一根把手的动作：两只手都握在把手上', () => {
  // 下拉终点的横杆曾跟着「按起始姿态名解出的手」走，落到胸骨下段，离负荷点 35px
  for (const { slug, f, p, u, names } of framesOf()) {
    const P = ORBIT_PARAMS[slug];
    if ((f.load_type ?? p.load?.type) !== 'handle' || P.perHand || P.view) continue;
    const J = orbitLift(slug, names, p, u, f.load_type);
    for (const k of ['wristN', 'wristF']) {
      const d = Math.hypot(J[k][0] - p.load.at[0], J[k][1] - p.load.at[1]);
      assert.ok(d <= 10, `${slug} u=${u} ${k}: 手离把手 ${d.toFixed(1)}px`);
      assert.ok(Math.abs(J[k][2]) <= (P.handle ?? 10) + 2, `${slug} u=${u} ${k}: 手在 z=${J[k][2].toFixed(1)}，把手半长 ${P.handle}`);
    }
  }
});

test('引体顶点肘在肩下方（cue「肘往下往后拉」）', () => {
  const f = figures['pull-up'], names = { a: f.start, b: f.end };
  const J = orbitLift('pull-up', names, interpolate(POSES[f.start], POSES[f.end], 1, { plumb: f.plumb }), 1);
  for (const t of ['N', 'F']) assert.ok(J['elbow' + t][1] > J['shoulder' + t][1], `引体顶点 ${t} 肘 y=${J['elbow' + t][1].toFixed(1)} 不在肩 y=${J['shoulder' + t][1].toFixed(1)} 之下`);
});

test('肘的去向跟着当前端点的姿态走（起止两端各自对上 2D 画出的肘）', () => {
  // 曾经整段动画都按起始姿态名解手臂：下拉终点肘仍按「手举过头」的方案解，引体顶点肘跑到肩上前方。
  // 这里在 u=0 / u=1 比 3D 肘（xy 分量）与该端 2D 画出的肘方向，夹角须 < 60°。
  // 由 pole 显式指定肘去向的动作（推举类、引体、抱胸）不在此列——它们的去向本来就不取 2D。
  for (const [slug, f] of Object.entries(figures)) {
    const P = ORBIT_PARAMS[slug];
    if (P.view || P.pole || P.foreVertical || P.crossChest || !f.end || f.end === f.start) continue;
    const names = { a: f.start, b: f.end };
    for (const [u, nm] of [[0, f.start], [1, f.end]]) {
      const strip = (q) => (f.no_load ? { ...q, load: undefined } : q);
      const p = interpolate(strip(POSES[f.start]), strip(POSES[f.end]), u, { plumb: f.plumb, handPath: !!f.hand_path });
      const J = orbitLift(slug, names, p, u, f.load_type);
      const E2 = drawnArm(nm, p, f.load_type).E;
      const a = [J.elbowN[0] - J.shoulderN[0], J.elbowN[1] - J.shoulderN[1]], b = [E2[0] - p.shoulder[0], E2[1] - p.shoulder[1]];
      if (Math.hypot(...a) < 8 || Math.hypot(...b) < 8) continue;   // 肘几乎正对读者，xy 方向没有意义
      const c = (a[0] * b[0] + a[1] * b[1]) / Math.hypot(...a) / Math.hypot(...b);
      assert.ok(c > Math.cos(Math.PI / 3), `${slug} u=${u}: 3D 肘与 ${nm} 的 2D 肘方向差 ${(Math.acos(c) * 180 / Math.PI).toFixed(0)}°`);
    }
  }
});
