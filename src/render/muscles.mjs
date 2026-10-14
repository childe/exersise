// 肌肉分布图。
//
// 为什么是手写几何而不是外部解剖图：动作与解剖的图示在本项目里受 §7 约束——
// 一张画错的解剖图会被读者当成权威参考直接照做，而我们无法给一张不可核验的图
// 打 A/B/D 标签。这里的每个分区都是按解剖位置摆的坐标，错不错可以逐条看、
// 可以写成断言，因此它是"构造上正确"的，与 §7 不冲突。
//
// 词表来自 data/exercises.json 的 muscles.prime/synergist/stabilizer，
// 共 14 个取值，与本文件的 MUSCLE_REGIONS 键必须完全一致（见 validate/muscles.mjs）。

// 单个视图的画布：110 × 230，中线 x=55。
// 正面与背面并排时，背面整体平移 +120。
export const VIEW_W = 110;
export const VIEW_H = 230;
export const BACK_DX = 120;

// 人体轮廓（正背面共用同一副剪影，背面只换分区）。
const SILHOUETTE = [
  // 头 + 颈
  { t: 'ellipse', cx: 55, cy: 20, rx: 11, ry: 13 },
  { t: 'rect', x: 50, y: 30, w: 10, h: 12 },
  // 躯干：肩宽 34–76，腰 44–66，髋 42–68
  { t: 'path', d: 'M34 48 Q34 42 40 42 L70 42 Q76 42 76 48 L72 86 L68 108 L68 122 L42 122 L42 108 L38 86 Z' },
  // 上臂
  { t: 'path', d: 'M34 48 L26 54 L24 84 L32 86 L38 60 Z' },
  { t: 'path', d: 'M76 48 L84 54 L86 84 L78 86 L72 60 Z' },
  // 前臂 + 手
  { t: 'path', d: 'M24 84 L22 112 L30 114 L32 86 Z' },
  { t: 'path', d: 'M86 84 L88 112 L80 114 L78 86 Z' },
  // 大腿
  { t: 'path', d: 'M42 122 L40 168 L52 170 L54 122 Z' },
  { t: 'path', d: 'M68 122 L70 168 L58 170 L56 122 Z' },
  // 小腿 + 足
  { t: 'path', d: 'M40 168 L41 206 L52 206 L52 170 Z' },
  { t: 'path', d: 'M70 168 L69 206 L58 206 L58 170 Z' },
  { t: 'path', d: 'M41 206 L36 206 L36 212 L54 212 L54 206 Z' },
  { t: 'path', d: 'M69 206 L74 206 L74 212 L56 212 L56 206 Z' },
];

// 14 个分区。view 决定它画在正面还是背面——
// 肌肉画在它实际可见的那一面，而不是两面都画一遍。
export const MUSCLE_REGIONS = {
  前束: { view: 'front', label: '三角肌前束', shapes: [
    { t: 'ellipse', cx: 37, cy: 52, rx: 8, ry: 9 },
    { t: 'ellipse', cx: 73, cy: 52, rx: 8, ry: 9 },
  ] },
  中束: { view: 'front', label: '三角肌中束', shapes: [
    { t: 'ellipse', cx: 29, cy: 56, rx: 6, ry: 10 },
    { t: 'ellipse', cx: 81, cy: 56, rx: 6, ry: 10 },
  ] },
  胸: { view: 'front', label: '胸大肌', shapes: [
    { t: 'path', d: 'M43 48 L54 46 L54 70 L45 66 Q41 58 43 48 Z' },
    { t: 'path', d: 'M67 48 L56 46 L56 70 L65 66 Q69 58 67 48 Z' },
  ] },
  肱二头: { view: 'front', label: '肱二头肌', shapes: [
    { t: 'ellipse', cx: 31, cy: 70, rx: 6, ry: 13 },
    { t: 'ellipse', cx: 79, cy: 70, rx: 6, ry: 13 },
  ] },
  // 前臂屈肌群与肱桡肌在掌侧/桡侧，正面看得到；伸肌在背侧，但握力类动作两组一起工作，
  // 只画一处，放在正面（与肱二头同一面，读者找手臂时先看这里）。
  前臂: { view: 'front', label: '前臂肌群（肱桡肌与腕屈伸肌）', shapes: [
    { t: 'ellipse', cx: 27, cy: 97, rx: 4.5, ry: 12 },
    { t: 'ellipse', cx: 83, cy: 97, rx: 4.5, ry: 12 },
  ] },
  核心: { view: 'front', label: '腹肌与深层核心', shapes: [
    { t: 'path', d: 'M46 72 L64 72 L66 106 L62 118 L48 118 L44 106 Z' },
  ] },
  股四头: { view: 'front', label: '股四头肌', shapes: [
    { t: 'ellipse', cx: 47, cy: 143, rx: 7.5, ry: 22 },
    { t: 'ellipse', cx: 63, cy: 143, rx: 7.5, ry: 22 },
  ] },

  上背: { view: 'back', label: '斜方肌与背阔肌', shapes: [
    { t: 'path', d: 'M40 44 L70 44 L74 62 L70 90 L55 96 L40 90 L36 62 Z' },
  ] },
  后束: { view: 'back', label: '三角肌后束', shapes: [
    { t: 'ellipse', cx: 32, cy: 54, rx: 7, ry: 9 },
    { t: 'ellipse', cx: 78, cy: 54, rx: 7, ry: 9 },
  ] },
  肱三头: { view: 'back', label: '肱三头肌', shapes: [
    { t: 'ellipse', cx: 30, cy: 72, rx: 6, ry: 14 },
    { t: 'ellipse', cx: 80, cy: 72, rx: 6, ry: 14 },
  ] },
  下背: { view: 'back', label: '竖脊肌（下背）', shapes: [
    { t: 'path', d: 'M46 96 L64 96 L66 116 L44 116 Z' },
  ] },
  臀: { view: 'back', label: '臀大肌与臀中肌', shapes: [
    { t: 'ellipse', cx: 48, cy: 128, rx: 9, ry: 11 },
    { t: 'ellipse', cx: 62, cy: 128, rx: 9, ry: 11 },
  ] },
  腘绳: { view: 'back', label: '腘绳肌', shapes: [
    { t: 'ellipse', cx: 47, cy: 152, rx: 7.5, ry: 19 },
    { t: 'ellipse', cx: 63, cy: 152, rx: 7.5, ry: 19 },
  ] },
  小腿: { view: 'back', label: '腓肠肌与比目鱼肌', shapes: [
    { t: 'ellipse', cx: 46, cy: 186, rx: 6, ry: 15 },
    { t: 'ellipse', cx: 64, cy: 186, rx: 6, ry: 15 },
  ] },
};

export const MUSCLE_NAMES = Object.keys(MUSCLE_REGIONS);

// 三级角色对应三档视觉权重。颜色全部走主题 token，深浅两套都读得出。
const ROLE_CLASS = { prime: 'm-prime', synergist: 'm-syn', stabilizer: 'm-stab' };
export const ROLE_LABEL = { prime: '主动肌', synergist: '协同肌', stabilizer: '稳定肌' };

function shape(s, dx = 0, cls = '', extra = '') {
  const a = cls ? ` class="${cls}"` : '';
  if (s.t === 'ellipse') return `<ellipse cx="${s.cx + dx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}"${a}${extra}/>`;
  if (s.t === 'rect') return `<rect x="${s.x + dx}" y="${s.y}" width="${s.w}" height="${s.h}"${a}${extra}/>`;
  // path：只有 M/L/Q/Z 与绝对坐标，平移时逐个数字对 x 偏移
  const d = dx === 0 ? s.d : s.d.replace(/([MLQ])\s*([\d.]+)\s+([\d.]+)(\s+([\d.]+)\s+([\d.]+))?/g,
    (_, cmd, x1, y1, rest, x2, y2) => rest
      ? `${cmd}${Number(x1) + dx} ${y1} ${Number(x2) + dx} ${y2}`
      : `${cmd}${Number(x1) + dx} ${y1}`);
  return `<path d="${d}"${a}${extra}/>`;
}

function silhouette(dx) {
  return SILHOUETTE.map((s) => shape(s, dx, 'm-body')).join('');
}

/**
 * 一副正背面人体，按 roles 高亮。
 * @param {Map<string,'prime'|'synergist'|'stabilizer'>} roles
 * @param {{interactive?: boolean, labels?: boolean}} opts
 */
export function renderBody(roles, opts = {}) {
  const { interactive = false, labels = false } = opts;
  const parts = [];
  for (const [view, dx] of [['front', 0], ['back', BACK_DX]]) {
    parts.push(`<g class="m-view" data-view="${view}">${silhouette(dx)}`);
    for (const [name, def] of Object.entries(MUSCLE_REGIONS)) {
      if (def.view !== view) continue;
      const role = roles.get(name);
      const cls = ['m-region', role ? ROLE_CLASS[role] : 'm-off'].join(' ');
      const attrs = interactive
        ? ` data-muscle="${name}" tabindex="0" role="button"`
          + ` aria-label="${def.label}：筛出练到它的动作"`
        : role
          ? ` data-muscle="${name}"><title>${def.label}（${ROLE_LABEL[role]}）</title></g><g`
          : '';
      if (interactive) {
        parts.push(`<g class="${cls}"${attrs}>`
          + def.shapes.map((s) => shape(s, dx)).join('')
          + `<title>${def.label}</title></g>`);
      } else {
        const t = role ? `<title>${def.label}（${ROLE_LABEL[role]}）</title>` : '';
        parts.push(`<g class="${cls}" data-muscle="${name}">`
          + def.shapes.map((s) => shape(s, dx)).join('') + t + '</g>');
      }
    }
    if (labels) {
      parts.push(`<text class="m-viewlabel" x="${dx + VIEW_W / 2}" y="${VIEW_H - 4}">`
        + (view === 'front' ? '正面' : '背面') + '</text>');
    }
    parts.push('</g>');
  }
  return parts.join('');
}

/** 动作卡上的小图：按该动作的三级肌肉高亮，不可交互。 */
export function renderCardMuscleMap(muscles, nameZh) {
  const roles = new Map();
  for (const m of muscles.stabilizer ?? []) roles.set(m, 'stabilizer');
  for (const m of muscles.synergist ?? []) roles.set(m, 'synergist');
  for (const m of muscles.prime ?? []) roles.set(m, 'prime'); // prime 最后写，覆盖低级别
  const legend = ['prime', 'synergist', 'stabilizer']
    .filter((r) => [...roles.values()].includes(r))
    .map((r) => `<span class="m-key ${ROLE_CLASS[r]}">${ROLE_LABEL[r]}</span>`).join('');
  return `<figure class="muscle-map" data-exercise="${nameZh}">`
    + `<svg viewBox="0 0 ${VIEW_W + BACK_DX} ${VIEW_H}" role="img"`
    + ` aria-label="${nameZh}练到的肌肉：主动肌 ${(muscles.prime ?? []).join('、')}；`
    + `协同肌 ${(muscles.synergist ?? []).join('、')}；稳定肌 ${(muscles.stabilizer ?? []).join('、')}">`
    + renderBody(roles, { labels: true })
    + '</svg>'
    + `<figcaption class="m-legend">${legend}</figcaption></figure>`;
}

/** 第 4 章的整体肌肉分布图：全部 14 个分区可点，点了筛动作库。 */
export function renderFullMuscleMap(counts) {
  const roles = new Map(MUSCLE_NAMES.map((n) => [n, 'prime']));
  const rows = MUSCLE_NAMES.map((n) => {
    const d = MUSCLE_REGIONS[n];
    return `<li><button type="button" data-muscle="${n}">`
      + `<b>${n}</b><span class="m-full-label">${d.label}</span>`
      + `<span class="m-count">${counts.get(n) ?? 0} 个动作</span></button></li>`;
  }).join('');
  return `<figure class="muscle-map muscle-map-full" id="muscle-map">
  <svg viewBox="0 0 ${VIEW_W + BACK_DX} ${VIEW_H}" role="img" aria-label="全身肌肉分布图，点击任一肌群筛出练到它的动作">
    ${renderBody(roles, { interactive: true, labels: true })}
  </svg>
  <figcaption>
    <p class="m-full-hint">点任一肌群，或点下面的名称，筛出练到它的动作。</p>
    <ul class="m-full-list">${rows}</ul>
  </figcaption>
</figure>`;
}
