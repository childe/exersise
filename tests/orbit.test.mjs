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

test('俯卧撑底部肘在腕正上方：侧视前臂竖直，肘外展 30–50°（ACE「下放位前臂垂直于地面」）', () => {
  // 曾经手按「肩正下方」摆，到底肩只前移十来像素，肘被甩向脚的方向，前臂斜 57–63°。
  for (const slug of ['push-up', 'knee-push-up']) {
    const f = figures[slug], names = { a: f.start, b: f.end };
    const p = interpolate(POSES[f.start], POSES[f.end], 1, { plumb: f.plumb });
    const J = orbitLift(slug, names, p, 1);
    for (const t of ['N', 'F']) {
      const E = J['elbow' + t], H = J['wrist' + t], S = J['shoulder' + t];
      const sag = Math.atan2(Math.abs(E[0] - H[0]), H[1] - E[1]) * 180 / Math.PI;
      assert.ok(sag < 5, `${slug} ${t}: 侧视前臂偏离竖直 ${sag.toFixed(1)}°`);
      const flare = Math.atan2(Math.abs(E[2]) - Math.abs(S[2]), Math.abs(E[0] - S[0])) * 180 / Math.PI;
      assert.ok(flare >= 30 && flare <= 50, `${slug} ${t}: 肘外展 ${flare.toFixed(0)}°`);
    }
    // 2D 的肘也必须在腕正上方——姿态数据本身就是对的，不是靠 3D 求解掩盖
    const b = POSES[f.end];
    assert.ok(Math.abs(b.elbow[0] - b.wrist[0]) < 2 && b.elbow[1] < b.wrist[1], `${slug}: 2D 底部肘不在腕正上方`);
  }
});

test('俯撑动画：手钉在地上不滑、支点贴地、顶部手臂后倾 ≤25°、归一化是恒等', async () => {
  // 手曾在地上来回滑 8–11px：转支点只把手的 y 送回地面，x 随两段极角插值漂。
  // 顶部原始臂长与 FORESHORTENED_ARM 登记不符时，归一化会把整个人抬高 2.4px、膝全程离地。
  const { RAW_POSES } = await import('../src/render/skeleton.mjs');
  for (const [slug, pivot] of [['push-up', 'toe'], ['knee-push-up', 'knee']]) {
    const f = figures[slug], A = POSES[f.start], B = POSES[f.end];
    for (const n of [f.start, f.end]) for (const k of ['shoulder', 'elbow', 'wrist', 'hip', 'knee', 'toe'])
      assert.ok(Math.hypot(POSES[n][k][0] - RAW_POSES[n][k][0], POSES[n][k][1] - RAW_POSES[n][k][1]) < 0.05, `${n}.${k} 归一化后移动了`);
    const tilt = Math.atan2(A.wrist[0] - A.shoulder[0], A.wrist[1] - A.shoulder[1]) * 180 / Math.PI;
    assert.ok(tilt >= 0 && tilt <= 25, `${slug} 顶部手臂后倾 ${tilt.toFixed(1)}°`);
    for (let i = 0; i <= 20; i++) {
      const t = i / 20, q = interpolate(A, B, t, { plumb: f.plumb });
      const wx = A.wrist[0] + (B.wrist[0] - A.wrist[0]) * t;
      assert.ok(Math.abs(q.wrist[0] - wx) < 1 && Math.abs(q.wrist[1] - GROUND) < 1, `${slug} t=${t}: 手在 (${q.wrist[0].toFixed(1)}, ${q.wrist[1].toFixed(1)})，应钉在 x≈${wx.toFixed(1)}`);
      assert.ok(Math.abs(q[pivot][1] - GROUND) < 0.5, `${slug} t=${t}: ${pivot} 离地 ${(GROUND - q[pivot][1]).toFixed(1)}px`);
      const J = orbitLift(slug, { a: f.start, b: f.end }, q, t);
      assert.ok(Math.abs(J.wristN[1] - GROUND) < 1, `${slug} t=${t}: 3D 手离地 ${(GROUND - J.wristN[1]).toFixed(1)}px`);
    }
  }
});

test('下拉终点前臂正面看竖直、侧视略后倾（「前臂尽量保持竖直」）', () => {
  // 原来终点肘在手外侧 17px、侧视后倾 50°：手往内收，读起来是在用二头弯举把杆拉下来。
  const slug = 'lat-pulldown', f = figures[slug];
  const p = interpolate(POSES[f.start], POSES[f.end], 1, { plumb: f.plumb, handPath: !!f.hand_path });
  const J = orbitLift(slug, { a: f.start, b: f.end }, p, 1, f.load_type);
  for (const t of ['N', 'F']) {
    const E = J['elbow' + t], H = J['wrist' + t];
    const front = Math.atan2(Math.abs(E[2]) - Math.abs(H[2]), E[1] - H[1]) * 180 / Math.PI;
    const back = Math.atan2(H[0] - E[0], E[1] - H[1]) * 180 / Math.PI;   // 人朝 +x，肘在手之后为正
    assert.ok(Math.abs(front) < 5, `${t}: 正面看前臂偏离竖直 ${front.toFixed(1)}°`);
    assert.ok(back >= 0 && back <= 25, `${t}: 侧视前臂后倾 ${back.toFixed(1)}°`);
  }
  // 中段握距只略比肩宽、上臂接近水平，肘必然在手外侧；但不能外翻成「用二头」的样子
  for (let i = 0; i <= 16; i++) {
    const u = i / 16, q = interpolate(POSES[f.start], POSES[f.end], u, { plumb: f.plumb, handPath: !!f.hand_path });
    const K = orbitLift(slug, { a: f.start, b: f.end }, q, u, f.load_type), E = K.elbowN, H = K.wristN;
    const front = Math.atan2(Math.abs(E[2]) - Math.abs(H[2]), Math.abs(E[1] - H[1])) * 180 / Math.PI;
    assert.ok(front <= 40, `u=${u}: 正面看前臂外倾 ${front.toFixed(1)}°`);
  }
});

test('窄握卧推触点在胸骨下段、肘贴身、底部前臂接近竖直', () => {
  // 原来借用平板卧推的 bench_bottom：杠落在中胸，与 cue「杠落到胸骨下段」不符，肘折到 31°。
  const slug = 'close-grip-bench-press', f = figures[slug];
  const B = POSES[f.end], flat = POSES.bench_bottom;
  const along = (p) => p.load.at[0] - p.shoulder[0];   // 仰卧、头在 −x：沿躯干往脚的距离
  assert.ok(along(B) - along(flat) >= 6, `窄握触点只比平板低 ${(along(B) - along(flat)).toFixed(1)}px`);
  const p = interpolate(POSES[f.start], B, 1, { plumb: f.plumb });
  const J = orbitLift(slug, { a: f.start, b: f.end }, p, 1, f.load_type);
  const E = J.elbowN, H = J.wristN, S = J.shoulderN;
  const sag = Math.atan2(Math.abs(E[0] - H[0]), E[1] - H[1]) * 180 / Math.PI;
  const front = Math.atan2(Math.abs(E[2]) - Math.abs(H[2]), E[1] - H[1]) * 180 / Math.PI;
  const tuck = Math.atan2(Math.abs(E[2]) - Math.abs(S[2]), E[0] - S[0]) * 180 / Math.PI;   // 俯视上臂离躯干
  assert.ok(sag < 20 && front < 25, `底部前臂侧视 ${sag.toFixed(0)}°、正面 ${front.toFixed(0)}°`);
  assert.ok(tuck < 35, `肘外展 ${tuck.toFixed(0)}°，cue 要求贴身`);
});

test('哑铃臀推：上背搭在凳沿上，全程钉住；顶点躯干水平、小腿竖直', () => {
  // 原来照抄臀桥：肩躺在地上、图里没有凳，与 cue「上背靠在稳固的凳边」不符（Contreras：凳高 30–40cm）。
  const f = figures['db-hip-thrust'], A = POSES[f.start], B = POSES[f.end];
  for (const p of [A, B]) {
    assert.ok(p.bench, '臀推要有凳');
    assert.ok(GROUND - p.bench[1] >= 45 && GROUND - p.bench[1] <= 70, `凳高 ${(GROUND - p.bench[1]).toFixed(0)}px`);
    assert.ok(p.bench[0] <= p.shoulder[0] && p.shoulder[0] <= p.bench[0] + p.bench[2], '肩在凳面上');
    // 凳沿不能伸到髋那一侧：底部躯干下斜，否则躯干穿过凳板
    assert.ok(p.bench[0] + p.bench[2] - p.shoulder[0] <= 10, '凳沿离肩太远');
  }
  const deg = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
  assert.ok(Math.abs(deg(B.shoulder, B.hip)) < 10, `顶点躯干偏离水平 ${deg(B.shoulder, B.hip).toFixed(1)}°`);
  assert.ok(Math.abs(90 - deg(B.knee, B.ankle)) < 10, `顶点小腿偏离竖直 ${(90 - deg(B.knee, B.ankle)).toFixed(1)}°`);
  for (let i = 0; i <= 16; i++) {
    const q = interpolate(A, B, i / 16, { plumb: f.plumb });
    assert.ok(Math.hypot(q.shoulder[0] - A.shoulder[0], q.shoulder[1] - A.shoulder[1]) < 0.5, `t=${i / 16}: 肩离开凳沿`);
    assert.ok(Math.hypot(q.ankle[0] - A.ankle[0], q.ankle[1] - A.ankle[1]) < 0.5, `t=${i / 16}: 踝漂移`);
  }
});

test('硬拉：起始杠片着地、髋高于膝；拉起全程杠不穿过膝', () => {
  // 原来杠心离地 7px（片被钳成半径 7），髋压到膝高（髋角 27°），画成「蹲着拉」。
  const f = figures['conventional-deadlift'], A = POSES[f.start], B = POSES[f.end];
  const R = ORBIT_PARAMS['conventional-deadlift'].plateR;
  assert.ok(R >= 28 && R <= 34, `硬拉片半径 ${R}（标准片直径 45cm，按腿的比例约 31px）`);
  assert.ok(Math.abs(GROUND - A.load.at[1] - R) <= 1, `起始杠心离地 ${(GROUND - A.load.at[1]).toFixed(1)}px，片（半径 ${R}）应着地`);
  const ang = (c, a, b) => { const u = [a[0] - c[0], a[1] - c[1]], v = [b[0] - c[0], b[1] - c[1]];
    return Math.acos((u[0] * v[0] + u[1] * v[1]) / Math.hypot(...u) / Math.hypot(...v)) * 180 / Math.PI; };
  const hipAng = ang(A.hip, A.shoulder, A.knee);
  assert.ok(hipAng >= 40 && hipAng <= 70, `起始髋角 ${hipAng.toFixed(0)}°`);
  for (let i = 0; i <= 40; i++) {
    const q = interpolate(A, B, i / 40, { plumb: f.plumb !== false });
    // 杠在膝上下 15px 内时，离膝关节须 ≥7px（髌骨在关节前方约 5px）
    if (Math.abs(q.load.at[1] - q.knee[1]) < 15)
      assert.ok(Math.hypot(q.load.at[0] - q.knee[0], q.load.at[1] - q.knee[1]) >= 7,
        `t=${i / 40}: 杠离膝 ${Math.hypot(q.load.at[0] - q.knee[0], q.load.at[1] - q.knee[1]).toFixed(1)}px`);
    assert.ok(Math.abs(q.load.at[0] - 90) < 0.6, `t=${i / 40}: 杠离开足中线`);
  }
});

test('哑铃前蹲：上臂接近水平、肘朝前（cue「肘抬到与地面接近平行」「肘不许掉」）', () => {
  // 原来手在肩前 6、与肩齐平，为了肘角 ≥25° 握点外移到 z=50，上臂掉到水平下 41–43°。
  const slug = 'db-front-squat', f = figures[slug];
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;   // 下蹲中段躯干比底部更前倾（u≈0.75），上臂最低在这里，不只查端点
    const p = interpolate(POSES[f.start], POSES[f.end], u, { plumb: f.plumb !== false && !f.no_load });
    const J = orbitLift(slug, { a: f.start, b: f.end }, p, u, f.load_type);
    for (const t of ['N', 'F']) {
      const S = J['shoulder' + t], E = J['elbow' + t], v = [E[0] - S[0], E[1] - S[1], E[2] - S[2]];
      const below = Math.atan2(v[1], Math.hypot(v[0], v[2])) * 180 / Math.PI;
      assert.ok(below <= 20, `u=${u} ${t}: 上臂低于水平 ${below.toFixed(0)}°`);
      assert.ok(v[0] > Math.abs(Math.abs(E[2]) - Math.abs(S[2])), `u=${u} ${t}: 肘朝外多于朝前`);
    }
  }
});

test('弹力带早安：底部躯干接近水平、不比 RDL 浅，且身体质心全程落在脚上', () => {
  // 原来把颈后的带子当杠铃反解到足中线：躯干只到高于水平 53°，身体质心却落在脚跟之后（会后倒）。
  // 带子一端踩在脚下，拉力是内力；平衡看的是身体自己的质心。
  const f = figures['band-good-morning'], A = POSES[f.start], B = POSES[f.end];
  const above = (p) => Math.atan2(p.hip[1] - p.shoulder[1], Math.abs(p.shoulder[0] - p.hip[0])) * 180 / Math.PI;
  assert.ok(above(B) <= 35, `底部躯干高于水平 ${above(B).toFixed(0)}°`);
  assert.ok(above(B) <= above(POSES.rdl_bottom) + 2, `早安底部比 RDL 底部还浅（${above(B).toFixed(0)}° vs ${above(POSES.rdl_bottom).toFixed(0)}°）`);
  const mid = (a, b) => (a[0] + b[0]) / 2;
  const com = (p) => p.head[0] * 0.08 + mid(p.hip, p.shoulder) * 0.5 + mid(p.shoulder, p.elbow) * 0.055
    + mid(p.elbow, p.wrist) * 0.045 + mid(p.hip, p.knee) * 0.2 + mid(p.knee, p.ankle) * 0.12;
  for (let i = 0; i <= 16; i++) {
    const q = interpolate(A, B, i / 16, { plumb: f.plumb !== false });
    const x = com(q);
    assert.ok(x > A.heel[0] + 2 && x < A.toe[0], `t=${i / 16}: 身体质心 x=${x.toFixed(1)} 不在脚上（${A.heel[0]}–${A.toe[0]}）`);
  }
});

test('坐姿推胸：握把起始在胸骨中段（乳头线），推出沿水平路径', () => {
  // 原来握把随腕归一化落到肩下 30px（躯干 s=0.38，约剑突）；cue 与 ACE 都要求在胸骨中段 / 乳头线。
  const f = figures['machine-chest-press'], A = POSES[f.start], B = POSES[f.end];
  const s = (p) => (p.load.at[1] - p.shoulder[1]) / Math.hypot(p.hip[0] - p.shoulder[0], p.hip[1] - p.shoulder[1]);
  assert.ok(s(A) >= 0.15 && s(A) <= 0.28, `起始握把在躯干 s=${s(A).toFixed(2)}（胸骨中段约 0.2）`);
  assert.ok(Math.abs(A.load.at[1] - B.load.at[1]) < 1, '推出应沿水平方向');
  for (let i = 0; i <= 16; i++) {
    const u = i / 16, q = interpolate(A, B, u, { plumb: f.plumb, handPath: !!f.hand_path });
    const J = orbitLift('machine-chest-press', { a: f.start, b: f.end }, q, u, f.load_type);
    assert.ok(Math.abs(J.wristN[1] - A.load.at[1]) < 6, `u=${u}: 手离开握把路径 ${(J.wristN[1] - A.load.at[1]).toFixed(1)}px`);
  }
  // 起始手在胸前（肩前 ≥15）、肘角不屈到头（卧推类到底 42–54°）
  const J0 = orbitLift('machine-chest-press', { a: f.start, b: f.end }, interpolate(A, B, 0, { plumb: f.plumb, handPath: true }), 0, f.load_type);
  const S0 = J0.shoulderN, E0 = J0.elbowN, H0 = J0.wristN;
  assert.ok(H0[0] - S0[0] >= 15, `起始手只在肩前 ${(H0[0] - S0[0]).toFixed(1)}px`);
  const v1 = [S0[0] - E0[0], S0[1] - E0[1], S0[2] - E0[2]], v2 = [H0[0] - E0[0], H0[1] - E0[1], H0[2] - E0[2]];
  const el = Math.acos((v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]) / Math.hypot(...v1) / Math.hypot(...v2)) * 180 / Math.PI;
  assert.ok(el >= 35, `起始肘角 ${el.toFixed(1)}°`);
  const J1 = orbitLift('machine-chest-press', { a: f.start, b: f.end }, interpolate(A, B, 1, { plumb: f.plumb, handPath: true }), 1, f.load_type);
  const r1 = Math.hypot(...[0, 1, 2].map((k) => J1.wristN[k] - J1.shoulderN[k]));
  assert.ok(r1 < 87.5, `推出终点肩到手 ${r1.toFixed(1)}，手臂锁死了（cue「接近伸直但不锁死」）`);
  // 推出全程手不跳（重建手曾在两支之间换支，一步前冲 14px）
  let prev = null;
  for (let i = 0; i <= 64; i++) {
    const u = i / 64, q = interpolate(A, B, u, { plumb: f.plumb, handPath: true });
    const H = orbitLift('machine-chest-press', { a: f.start, b: f.end }, q, u, f.load_type).wristN;
    if (prev) assert.ok(Math.hypot(H[0] - prev[0], H[1] - prev[1], H[2] - prev[2]) <= 3, `u=${u}: 手一步移动 ${Math.hypot(H[0] - prev[0], H[1] - prev[1]).toFixed(1)}px`);
    prev = H;
  }
});

test('保加利亚分腿蹲：凳高约到膝（setup 文字与图一致）', () => {
  // setup 原写「凳高约到小腿中段」，图里的凳约到膝（站立膝高的 81%）；资料（Gymshark、Sweat）也是约到膝。改的是文字。
  const f = figures['db-bulgarian-split-squat'], A = POSES[f.start];
  const benchH = GROUND - A.bench[1], kneeH = GROUND - A.knee[1];
  assert.ok(benchH >= 0.6 * kneeH && benchH <= 1.05 * kneeH, `凳高 ${benchH.toFixed(0)}px，站立膝高 ${kneeH.toFixed(0)}px`);
});

test('卡片文字提到靠背的坐姿动作，图上要有靠背', async () => {
  // 五张卡的 cue / 自检点名「背贴靠背」「看腰与靠背之间有没有空隙」，图上原来只有座面，没有对照物。
  const ex = JSON.parse(await readFile(path.join(root, 'data/exercises.json'), 'utf8'));
  const list = Array.isArray(ex) ? ex : ex.exercises;
  const need = list.filter((e) => /靠背/.test(JSON.stringify([e.cues, e.self_checks, e.mistakes, e.safety]))
    && figures[e.slug] && (POSES[figures[e.slug].start]?.bench || POSES[figures[e.slug].start]?.benchIncline)).map((e) => e.slug);
  assert.ok(need.length >= 5, `应找到至少 5 张提到靠背的坐姿卡，实际 ${need.join(',')}`);
  // 斜躺座（腿举）沿躯干铺开，本身就是靠背；平座面要另画一块
  for (const slug of need) assert.ok(ORBIT_PARAMS[slug].backrest || POSES[figures[slug].start].benchIncline, `${slug}: 文字提到靠背，图上没有`);
});

test('坐姿推举躯干（靠背）略后仰 4–12°，不前倾', () => {
  // setup「靠背调到接近垂直（略仰 5–10 度）」；原来躯干前倾 2°，补上的靠背跟着前倾，方向反了。
  for (const n of ['seated_press_bottom', 'seated_press_top']) {
    const p = POSES[n];
    const back = Math.atan2(p.hip[0] - p.shoulder[0], p.hip[1] - p.shoulder[1]) * 180 / Math.PI;   // 人朝 +x，肩在髋后为正
    assert.ok(back >= 4 && back <= 12, `${n}: 躯干后仰 ${back.toFixed(1)}°`);
  }
});
