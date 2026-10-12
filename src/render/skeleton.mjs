// 动作骨架示意图。
//
// §7 排除的是**生成的**动作图：模型不持有「杠过足中线」这类力学约束，只拟合
// 画面像不像，于是画风越干净越危险。这里走的是另一条路——每个关节是坐标，
// 几何由 validate/poses.mjs 逐条断言（杠必须过足中线、髋必须低于膝……），
// 画错构建直接失败。构造上正确，因此可以进页面。
//
// 侧视为主：矢状面是判断脊柱中立、杠线、髋膝顺序的唯一有效视角。
// 正视只用于那些侧视看不出要点的动作（如侧平举的肩外展）。

export const FIG_W = 200;
export const FIG_H = 240;
export const GROUND = 225;
export const MIDFOOT = 90; // 站姿动作的足中线；杠线断言以它为准

// 关节：按 [x, y]。缺省朝向为面朝右（+x）。
// 一副姿态必须给出 head/shoulder/elbow/wrist/hip/knee/ankle/heel/toe，
// 器械位置另由 load 描述。
const P = (o) => o;

export const POSES = {
  // ── 蹲 ─────────────────────────────────────────────
  squat_bottom: P({
    head: [104, 74], shoulder: [92, 92], elbow: [74, 114], wrist: [94, 96],
    hip: [44, 160], knee: [108, 152], ankle: [82, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'bar', at: [90, 86] },
  }),
  squat_top: P({
    head: [100, 34], shoulder: [88, 52], elbow: [70, 74], wrist: [88, 56],
    hip: [80, 112], knee: [84, 150], ankle: [80, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'bar', at: [90, 50] },
  }),
  // 前架位（高脚杯蹲 / 前蹲）：负荷在身前，躯干更直
  squat_front_bottom: P({
    head: [100, 70], shoulder: [88, 88], elbow: [102, 112], wrist: [96, 92],
    hip: [48, 158], knee: [106, 150], ankle: [82, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'front', at: [92, 90] },
  }),
  squat_front_top: P({
    head: [98, 32], shoulder: [86, 50], elbow: [96, 76], wrist: [92, 54],
    hip: [82, 110], knee: [84, 150], ankle: [80, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'front', at: [96, 52] },
  }),
  // 单腿（分腿蹲 / 保加利亚 / 箭步）：后腿屈膝落后方
  split_bottom: P({
    head: [96, 54], shoulder: [86, 72], elbow: [84, 104], wrist: [84, 132],
    hip: [84, 130], knee: [118, 168], ankle: [120, 216], heel: [112, 225], toe: [142, 225],
    knee2: [58, 196], ankle2: [46, 220], heel2: [38, 225], toe2: [62, 225],
    load: { type: 'hands', at: [84, 140] },
  }),
  split_top: P({
    head: [96, 32], shoulder: [86, 50], elbow: [84, 84], wrist: [84, 114],
    hip: [84, 108], knee: [112, 152], ankle: [118, 216], heel: [110, 225], toe: [140, 225],
    knee2: [62, 160], ankle2: [50, 218], heel2: [40, 225], toe2: [64, 225],
    load: { type: 'hands', at: [84, 122] },
  }),

  // ── 髋铰链 ─────────────────────────────────────────
  hinge_bottom: P({
    head: [112, 94], shoulder: [96, 108], elbow: [92, 158], wrist: [90, 202],
    hip: [58, 150], knee: [92, 160], ankle: [80, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'bar', at: [90, 210] },
  }),
  hinge_top: P({
    head: [100, 40], shoulder: [88, 58], elbow: [88, 110], wrist: [90, 160],
    hip: [84, 118], knee: [86, 152], ankle: [80, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'bar', at: [90, 168] },
  }),
  // 罗马尼亚 / 早安：膝角变化小，髋位移大，杠不落地
  rdl_bottom: P({
    head: [116, 86], shoulder: [100, 100], elbow: [96, 140], wrist: [92, 178],
    hip: [56, 136], knee: [86, 158], ankle: [80, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'bar', at: [90, 186] },
  }),
  // 臀桥 / 髋推：仰卧，肩支撑
  bridge_bottom: P({
    head: [40, 170], shoulder: [56, 178], elbow: [52, 200], wrist: [72, 206],
    hip: [104, 206], knee: [136, 182], ankle: [142, 222], heel: [136, 225], toe: [160, 225],
    load: { type: 'bar', at: [104, 198] },
  }),
  bridge_top: P({
    head: [40, 168], shoulder: [56, 176], elbow: [52, 198], wrist: [72, 202],
    hip: [106, 172], knee: [138, 180], ankle: [142, 222], heel: [136, 225], toe: [160, 225],
    load: { type: 'bar', at: [106, 164] },
  }),

  // ── 水平推（卧姿）─────────────────────────────────
  bench_bottom: P({
    head: [54, 140], shoulder: [74, 142], elbow: [82, 120], wrist: [74, 108],
    hip: [112, 144], knee: [146, 176], ankle: [150, 216], heel: [142, 225], toe: [170, 225],
    bench: [48, 148, 86, 10],
    load: { type: 'bar', at: [76, 100] },
  }),
  bench_top: P({
    head: [54, 140], shoulder: [74, 142], elbow: [74, 114], wrist: [74, 88],
    hip: [112, 144], knee: [146, 176], ankle: [150, 216], heel: [142, 225], toe: [170, 225],
    bench: [48, 148, 86, 10],
    load: { type: 'bar', at: [76, 80] },
  }),
  // 俯卧撑 / 地面推：手撑地
  pushup_bottom: P({
    head: [48, 176], shoulder: [64, 186], elbow: [78, 206], wrist: [66, 220],
    hip: [112, 190], knee: [142, 202], ankle: [168, 218], heel: [172, 224], toe: [176, 214],
  }),
  pushup_top: P({
    head: [46, 156], shoulder: [64, 166], elbow: [66, 194], wrist: [66, 220],
    hip: [112, 178], knee: [142, 196], ankle: [168, 216], heel: [172, 224], toe: [176, 212],
  }),

  // ── 垂直推 ─────────────────────────────────────────
  ohp_bottom: P({
    head: [98, 38], shoulder: [86, 56], elbow: [72, 76], wrist: [84, 58],
    hip: [84, 112], knee: [84, 150], ankle: [82, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'bar', at: [86, 54] },
  }),
  ohp_top: P({
    head: [98, 44], shoulder: [86, 58], elbow: [86, 38], wrist: [88, 18],
    hip: [84, 112], knee: [84, 150], ankle: [82, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'bar', at: [90, 12] },
  }),

  // ── 水平拉 ─────────────────────────────────────────
  row_start: P({
    head: [116, 100], shoulder: [100, 114], elbow: [98, 152], wrist: [96, 188],
    hip: [58, 148], knee: [90, 158], ankle: [80, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'bar', at: [96, 196] },
  }),
  row_end: P({
    head: [116, 100], shoulder: [100, 114], elbow: [70, 148], wrist: [94, 142],
    hip: [58, 148], knee: [90, 158], ankle: [80, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'bar', at: [96, 140] },
  }),
  // 坐姿 / 器械划船：躯干近直立
  seated_row_start: P({
    head: [78, 110], shoulder: [86, 126], elbow: [112, 140], wrist: [140, 148],
    hip: [84, 182], knee: [130, 188], ankle: [160, 210], heel: [156, 218], toe: [176, 214],
    bench: [60, 190, 44, 8],
    load: { type: 'handle', at: [146, 148] },
  }),
  seated_row_end: P({
    head: [78, 110], shoulder: [86, 126], elbow: [66, 144], wrist: [96, 146],
    hip: [84, 182], knee: [130, 188], ankle: [160, 210], heel: [156, 218], toe: [176, 214],
    bench: [60, 190, 44, 8],
    load: { type: 'handle', at: [102, 146] },
  }),

  // ── 垂直拉 ─────────────────────────────────────────
  pullup_hang: P({
    head: [100, 62], shoulder: [87, 78], elbow: [89, 57], wrist: [90, 36],
    hip: [88, 140], knee: [91, 186], ankle: [93, 218], heel: [87, 224], toe: [107, 220],
    fixed: { type: 'pullup_bar', at: [90, 30] },
  }),
  pullup_top: P({
    head: [102, 46], shoulder: [86, 64], elbow: [70, 60], wrist: [90, 36],
    hip: [88, 122], knee: [92, 168], ankle: [94, 200], heel: [88, 206], toe: [108, 202],
    fixed: { type: 'pullup_bar', at: [90, 30] },
  }),
  // 下拉：坐姿，负荷在上
  pulldown_start: P({
    head: [84, 104], shoulder: [86, 120], elbow: [88, 90], wrist: [90, 58],
    hip: [84, 178], knee: [130, 184], ankle: [158, 208], heel: [154, 216], toe: [174, 212],
    bench: [60, 186, 44, 8],
    load: { type: 'handle', at: [90, 52] },
  }),
  pulldown_end: P({
    head: [84, 104], shoulder: [86, 120], elbow: [66, 112], wrist: [88, 106],
    hip: [84, 178], knee: [130, 184], ankle: [158, 208], heel: [154, 216], toe: [174, 212],
    bench: [60, 186, 44, 8],
    load: { type: 'handle', at: [92, 102] },
  }),

  // ── 搬运 ───────────────────────────────────────────
  carry_stance: P({
    head: [98, 38], shoulder: [86, 56], elbow: [84, 92], wrist: [84, 128],
    hip: [84, 114], knee: [84, 152], ankle: [82, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'hands', at: [84, 140] },
  }),
  carry_front: P({
    head: [98, 38], shoulder: [86, 56], elbow: [96, 82], wrist: [92, 60],
    hip: [84, 114], knee: [84, 152], ankle: [82, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'front', at: [96, 58] },
  }),
  carry_overhead: P({
    head: [98, 44], shoulder: [86, 58], elbow: [86, 38], wrist: [88, 18],
    hip: [84, 114], knee: [84, 152], ankle: [82, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'bar', at: [90, 12] },
  }),

  // ── 核心抗阻 ───────────────────────────────────────
  plank: P({
    head: [48, 180], shoulder: [62, 190], elbow: [60, 216], wrist: [86, 218],
    hip: [112, 186], knee: [142, 200], ankle: [168, 216], heel: [174, 222], toe: [176, 210],
  }),
  deadbug_start: P({
    head: [40, 200], shoulder: [58, 206], elbow: [58, 178], wrist: [58, 152],
    hip: [108, 210], knee: [110, 172], ankle: [136, 166], heel: [142, 170], toe: [146, 158],
  }),
  deadbug_end: P({
    head: [40, 200], shoulder: [58, 206], elbow: [72, 180], wrist: [96, 164],
    hip: [108, 210], knee: [128, 184], ankle: [158, 196], heel: [164, 202], toe: [168, 190],
  }),
  // 抗旋（Pallof）：正视才看得出要点
  pallof_in: P({
    view: 'front',
    head: [100, 44], shoulder: [100, 64], elbow: [84, 86], wrist: [100, 96],
    hip: [100, 126], knee: [84, 172], ankle: [82, 216], heel: [78, 225], toe: [86, 225],
    knee2: [116, 172], ankle2: [118, 216], heel2: [114, 225], toe2: [122, 225],
    load: { type: 'handle', at: [100, 100] },
  }),
  pallof_out: P({
    view: 'front',
    head: [100, 44], shoulder: [100, 64], elbow: [100, 92], wrist: [100, 124],
    hip: [100, 126], knee: [84, 172], ankle: [82, 216], heel: [78, 225], toe: [86, 225],
    knee2: [116, 172], ankle2: [118, 216], heel2: [114, 225], toe2: [122, 225],
    load: { type: 'handle', at: [100, 130] },
  }),

  // ── 单关节 / 正视要点 ─────────────────────────────
  lateral_raise_down: P({
    view: 'front',
    head: [100, 40], shoulder: [100, 62], elbow: [78, 92], wrist: [74, 124],
    hip: [100, 124], knee: [86, 172], ankle: [84, 216], heel: [80, 225], toe: [88, 225],
    knee2: [114, 172], ankle2: [116, 216], heel2: [112, 225], toe2: [120, 225],
    shoulder2: [100, 62], elbow2: [122, 92], wrist2: [126, 124],
    load: { type: 'hands2', at: [74, 130], at2: [126, 130] },
  }),
  lateral_raise_up: P({
    view: 'front',
    head: [100, 40], shoulder: [100, 62], elbow: [66, 64], wrist: [34, 64],
    hip: [100, 124], knee: [86, 172], ankle: [84, 216], heel: [80, 225], toe: [88, 225],
    knee2: [114, 172], ankle2: [116, 216], heel2: [112, 225], toe2: [120, 225],
    shoulder2: [100, 62], elbow2: [134, 64], wrist2: [166, 64],
    load: { type: 'hands2', at: [30, 66], at2: [170, 66] },
  }),
  curl_down: P({
    head: [98, 40], shoulder: [86, 58], elbow: [84, 96], wrist: [84, 132],
    hip: [84, 116], knee: [84, 152], ankle: [82, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'hands', at: [84, 140] },
  }),
  curl_up: P({
    head: [98, 40], shoulder: [86, 58], elbow: [84, 96], wrist: [98, 68],
    hip: [84, 116], knee: [84, 152], ankle: [82, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'hands', at: [102, 62] },
  }),
  triceps_top: P({
    head: [98, 40], shoulder: [86, 58], elbow: [88, 92], wrist: [92, 72],
    hip: [84, 116], knee: [84, 152], ankle: [82, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'handle', at: [94, 68] },
  }),
  triceps_bottom: P({
    head: [98, 40], shoulder: [86, 58], elbow: [88, 92], wrist: [92, 128],
    hip: [84, 116], knee: [84, 152], ankle: [82, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'handle', at: [94, 134] },
  }),
  calf_down: P({
    head: [98, 38], shoulder: [86, 56], elbow: [84, 92], wrist: [84, 126],
    hip: [84, 114], knee: [84, 152], ankle: [82, 214], heel: [72, 225], toe: [108, 225],
    load: { type: 'hands', at: [84, 136] },
  }),
  calf_up: P({
    head: [98, 24], shoulder: [86, 42], elbow: [84, 78], wrist: [84, 112],
    hip: [84, 100], knee: [84, 140], ankle: [82, 202], heel: [74, 210], toe: [108, 225],
    load: { type: 'hands', at: [84, 122] },
  }),
  // ── 坐姿与器械 ─────────────────────────────────────
  leg_press_bottom: P({
    head: [44, 150], shoulder: [60, 158], elbow: [56, 180], wrist: [74, 186],
    hip: [96, 186], knee: [128, 146], ankle: [150, 160], heel: [156, 166], toe: [152, 146],
    bench: [36, 188, 70, 10],
    load: { type: 'sled', at: [158, 152] },
  }),
  leg_press_top: P({
    head: [44, 150], shoulder: [60, 158], elbow: [56, 180], wrist: [74, 186],
    hip: [96, 186], knee: [136, 168], ankle: [174, 150], heel: [180, 156], toe: [176, 136],
    bench: [36, 188, 70, 10],
    load: { type: 'sled', at: [182, 142] },
  }),
  leg_extension_down: P({
    head: [78, 104], shoulder: [86, 122], elbow: [94, 150], wrist: [78, 166],
    hip: [84, 176], knee: [126, 182], ankle: [130, 220], heel: [124, 225], toe: [142, 222],
    bench: [58, 184, 46, 8],
    load: { type: 'pad', at: [134, 218] },
  }),
  leg_extension_up: P({
    head: [78, 104], shoulder: [86, 122], elbow: [94, 150], wrist: [78, 166],
    hip: [84, 176], knee: [126, 182], ankle: [172, 176], heel: [178, 182], toe: [176, 162],
    bench: [58, 184, 46, 8],
    load: { type: 'pad', at: [176, 174] },
  }),
  leg_curl_start: P({
    head: [30, 182], shoulder: [50, 188], elbow: [46, 210], wrist: [68, 214],
    hip: [106, 192], knee: [142, 196], ankle: [146, 226], heel: [152, 230], toe: [150, 214],
    bench: [26, 196, 104, 9],
    load: { type: 'pad', at: [150, 228] },
  }),
  leg_curl_end: P({
    head: [30, 182], shoulder: [50, 188], elbow: [46, 210], wrist: [68, 214],
    hip: [106, 192], knee: [142, 196], ankle: [152, 154], heel: [158, 150], toe: [146, 142],
    bench: [26, 196, 104, 9],
    load: { type: 'pad', at: [156, 150] },
  }),
  seated_calf_down: P({
    head: [72, 110], shoulder: [80, 128], elbow: [88, 156], wrist: [74, 170],
    hip: [80, 180], knee: [124, 184], ankle: [130, 216], heel: [124, 225], toe: [150, 218],
    bench: [54, 188, 46, 8],
    load: { type: 'pad', at: [124, 170] },
  }),
  seated_calf_up: P({
    head: [72, 102], shoulder: [80, 120], elbow: [88, 148], wrist: [74, 162],
    hip: [80, 172], knee: [124, 176], ankle: [130, 204], heel: [124, 210], toe: [150, 218],
    bench: [54, 180, 46, 8],
    load: { type: 'pad', at: [124, 162] },
  }),
  incline_bottom: P({
    head: [54, 118], shoulder: [72, 126], elbow: [80, 108], wrist: [74, 96],
    hip: [112, 160], knee: [134, 182], ankle: [146, 216], heel: [140, 225], toe: [166, 225],
    bench: [46, 128, 84, 10],
    load: { type: 'bar', at: [74, 90] },
  }),
  incline_top: P({
    head: [54, 118], shoulder: [72, 126], elbow: [74, 102], wrist: [72, 80],
    hip: [112, 160], knee: [134, 182], ankle: [146, 216], heel: [140, 225], toe: [166, 225],
    bench: [46, 128, 84, 10],
    load: { type: 'bar', at: [72, 72] },
  }),
  machine_press_start: P({
    head: [76, 106], shoulder: [86, 124], elbow: [66, 142], wrist: [92, 140],
    hip: [84, 180], knee: [128, 186], ankle: [158, 210], heel: [154, 218], toe: [174, 214],
    bench: [60, 188, 44, 8],
    load: { type: 'handle', at: [98, 140] },
  }),
  machine_press_end: P({
    head: [76, 106], shoulder: [86, 124], elbow: [112, 136], wrist: [142, 140],
    hip: [84, 180], knee: [128, 186], ankle: [158, 210], heel: [154, 218], toe: [174, 214],
    bench: [60, 188, 44, 8],
    load: { type: 'handle', at: [148, 140] },
  }),
  seated_press_bottom: P({
    head: [80, 70], shoulder: [86, 90], elbow: [70, 110], wrist: [84, 92],
    hip: [84, 150], knee: [126, 158], ankle: [156, 190], heel: [152, 200], toe: [172, 196],
    bench: [62, 158, 42, 8],
    load: { type: 'hands2', at: [78, 88], at2: [96, 88] },
  }),
  seated_press_top: P({
    head: [80, 76], shoulder: [86, 92], elbow: [86, 70], wrist: [88, 46],
    hip: [84, 150], knee: [126, 158], ankle: [156, 190], heel: [152, 200], toe: [172, 196],
    bench: [62, 158, 42, 8],
    load: { type: 'hands2', at: [78, 40], at2: [98, 40] },
  }),
  knee_pushup_bottom: P({
    head: [48, 178], shoulder: [64, 188], elbow: [78, 206], wrist: [66, 220],
    hip: [110, 194], knee: [140, 216], ankle: [168, 208], heel: [172, 204], toe: [174, 216],
  }),
  knee_pushup_top: P({
    head: [46, 158], shoulder: [64, 168], elbow: [66, 194], wrist: [66, 220],
    hip: [110, 184], knee: [140, 214], ankle: [168, 206], heel: [172, 202], toe: [174, 214],
  }),
  one_arm_row_start: P({
    head: [120, 108], shoulder: [104, 120], elbow: [102, 156], wrist: [100, 192],
    hip: [60, 152], knee: [92, 162], ankle: [82, 216], heel: [74, 225], toe: [110, 225],
    bench: [96, 168, 56, 8],
    load: { type: 'hands', at: [100, 200] },
  }),
  one_arm_row_end: P({
    head: [120, 108], shoulder: [104, 120], elbow: [76, 152], wrist: [98, 146],
    hip: [60, 152], knee: [92, 162], ankle: [82, 216], heel: [74, 225], toe: [110, 225],
    bench: [96, 168, 56, 8],
    load: { type: 'hands', at: [100, 148] },
  }),
  inverted_row_start: P({
    head: [40, 150], shoulder: [58, 156], elbow: [76, 134], wrist: [94, 112],
    hip: [108, 164], knee: [142, 172], ankle: [172, 180], heel: [178, 186], toe: [176, 168],
    fixed: { type: 'low_bar', at: [94, 106] },
  }),
  inverted_row_end: P({
    head: [40, 128], shoulder: [58, 134], elbow: [66, 160], wrist: [94, 112],
    hip: [110, 148], knee: [144, 162], ankle: [174, 176], heel: [180, 182], toe: [178, 164],
    fixed: { type: 'low_bar', at: [94, 106] },
  }),
  face_pull_start: P({
    head: [98, 40], shoulder: [86, 58], elbow: [112, 72], wrist: [142, 70],
    hip: [84, 116], knee: [84, 152], ankle: [82, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'handle', at: [148, 70] },
  }),
  face_pull_end: P({
    head: [98, 40], shoulder: [86, 58], elbow: [64, 56], wrist: [92, 44],
    hip: [84, 116], knee: [84, 152], ankle: [82, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'handle', at: [98, 44] },
  }),
  reverse_fly_start: P({
    view: 'front',
    head: [100, 60], shoulder: [100, 82], elbow: [78, 108], wrist: [74, 136],
    shoulder2: [100, 82], elbow2: [122, 108], wrist2: [126, 136],
    hip: [100, 134], knee: [86, 174], ankle: [84, 216], heel: [80, 225], toe: [88, 225],
    knee2: [114, 174], ankle2: [116, 216], heel2: [112, 225], toe2: [120, 225],
    load: { type: 'hands2', at: [74, 142], at2: [126, 142] },
  }),
  reverse_fly_end: P({
    view: 'front',
    head: [100, 60], shoulder: [100, 82], elbow: [66, 86], wrist: [36, 86],
    shoulder2: [100, 82], elbow2: [134, 86], wrist2: [164, 86],
    hip: [100, 134], knee: [86, 174], ankle: [84, 216], heel: [80, 225], toe: [88, 225],
    knee2: [114, 174], ankle2: [116, 216], heel2: [112, 225], toe2: [120, 225],
    load: { type: 'hands2', at: [32, 88], at2: [168, 88] },
  }),
  back_extension_down: P({
    head: [42, 170], shoulder: [58, 158], elbow: [56, 180], wrist: [48, 164],
    hip: [104, 136], knee: [134, 170], ankle: [146, 212], heel: [140, 222], toe: [166, 220],
    bench: [92, 130, 40, 9],
    load: { type: 'pad', at: [146, 214] },
  }),
  back_extension_up: P({
    head: [48, 104], shoulder: [64, 116], elbow: [62, 140], wrist: [54, 124],
    hip: [104, 136], knee: [134, 170], ankle: [146, 212], heel: [140, 222], toe: [166, 220],
    bench: [92, 130, 40, 9],
    load: { type: 'pad', at: [146, 214] },
  }),
  rollout_start: P({
    head: [54, 178], shoulder: [66, 188], elbow: [74, 206], wrist: [84, 214],
    hip: [104, 202], knee: [130, 218], ankle: [150, 224], heel: [154, 228], toe: [152, 216],
    load: { type: 'wheel', at: [92, 216] },
  }),
  rollout_end: P({
    head: [48, 190], shoulder: [62, 198], elbow: [96, 204], wrist: [132, 206],
    hip: [104, 212], knee: [132, 222], ankle: [152, 226], heel: [156, 230], toe: [154, 218],
    load: { type: 'wheel', at: [140, 212] },
  }),
  sled_push_stance: P({
    head: [78, 86], shoulder: [66, 102], elbow: [92, 116], wrist: [120, 124],
    hip: [44, 140], knee: [78, 176], ankle: [58, 214], heel: [50, 225], toe: [84, 225],
    knee2: [30, 180], ankle2: [16, 218], heel2: [8, 225], toe2: [34, 225],
    load: { type: 'sled', at: [132, 150] },
  }),
};

// ── 骨架归一化 ─────────────────────────────────────────
//
// 姿态是手摆的坐标，手摆就必然带来同一个人在两帧之间"长高"的问题
// （实测：深蹲顶部大腿 38px、底部 64px）。靠逐个调坐标去修，这类错误会一直复发。
// 所以这里只把坐标当作**方向**来用，长度一律换成下面这副固定骨骼——
// 肢体长度于是由构造保证，不再是需要人去守的纪律。
const BONE = {
  thigh: 60, shank: 60, upper_arm: 30, forearm: 29, torso: 80, neck: 17,
};

// 负荷挂在哪个关节上：杠在背上/前架位随肩走，其余随腕走。
const LOAD_ANCHOR = {
  squat_bottom: 'shoulder', squat_top: 'shoulder',
  squat_front_bottom: 'shoulder', squat_front_top: 'shoulder',
  carry_front: 'shoulder', ohp_bottom: 'shoulder',
  // 腿部器械的阻力垫顶在踝上、腿举的踏板被脚蹬着——
  // 默认跟着手腕走会让它们浮在半空，读起来像个没来由的点。
  leg_extension_down: 'ankle', leg_extension_up: 'ankle',
  leg_curl_start: 'ankle', leg_curl_end: 'ankle',
  back_extension_down: 'ankle', back_extension_up: 'ankle',
  leg_press_bottom: 'ankle', leg_press_top: 'ankle',
  seated_calf_down: 'knee', seated_calf_up: 'knee',
};

const dir = (a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const d = Math.hypot(dx, dy) || 1;
  return [dx / d, dy / d];
};
// 方向取自**原始**两点，长度换成标准骨长，再从**新的**父关节起算。
// （用新父关节指向旧子关节算方向是错的：父关节一动，方向就被扭掉了。）
const place = (newFrom, oldFrom, oldTo, len) => {
  const [ux, uy] = dir(oldFrom, oldTo);
  return [newFrom[0] + ux * len, newFrom[1] + uy * len];
};

function normalize(name, p) {
  const q = { ...p };
  q.knee = place(p.hip, p.hip, p.knee, BONE.thigh);
  q.ankle = place(q.knee, p.knee, p.ankle, BONE.shank);
  q.shoulder = place(p.hip, p.hip, p.shoulder, BONE.torso);
  q.elbow = place(q.shoulder, p.shoulder, p.elbow, BONE.upper_arm);
  q.wrist = place(q.elbow, p.elbow, p.wrist, BONE.forearm);
  q.head = place(q.shoulder, p.shoulder, p.head, BONE.neck);
  if (p.knee2) {
    q.knee2 = place(p.hip, p.hip, p.knee2, BONE.thigh);
    q.ankle2 = place(q.knee2, p.knee2, p.ankle2, BONE.shank);
  }
  if (p.elbow2) {
    const os2 = p.shoulder2 ?? p.shoulder;
    q.shoulder2 = p.shoulder2 ? place(p.hip, p.hip, p.shoulder2, BONE.torso) : q.shoulder;
    q.elbow2 = place(q.shoulder2, os2, p.elbow2, BONE.upper_arm);
    q.wrist2 = place(q.elbow2, p.elbow2, p.wrist2, BONE.forearm);
  }
  for (const [f, src] of [['heel', 'ankle'], ['toe', 'ankle'], ['heel2', 'ankle2'], ['toe2', 'ankle2']]) {
    if (p[f] && p[src] && q[src]) {
      q[f] = [p[f][0] + (q[src][0] - p[src][0]), p[f][1] + (q[src][1] - p[src][1])];
    }
  }
  if (p.load) {
    const anchorName = LOAD_ANCHOR[name] ?? 'wrist';
    const off = [p.load.at[0] - p[anchorName][0], p.load.at[1] - p[anchorName][1]];
    q.load = { ...p.load, at: [q[anchorName][0] + off[0], q[anchorName][1] + off[1]] };
    if (p.load.at2 && p.wrist2) {
      const off2 = [p.load.at2[0] - p.wrist2[0], p.load.at2[1] - p.wrist2[1]];
      q.load.at2 = [q.wrist2[0] + off2[0], q.wrist2[1] + off2[1]];
    }
  }
  // 归一化改变了肢体长度，原本贴地的接触点会被推到地下或悬空。
  // 把当初贴地的那几个点重新按回地面——接触关系是姿态的语义，不能被长度调整弄丢。
  const CONTACTS = ['heel', 'toe', 'heel2', 'toe2', 'wrist', 'elbow', 'knee', 'hip', 'shoulder'];
  const wasDown = CONTACTS.filter((k) => p[k] && Math.abs(p[k][1] - GROUND) <= 7);
  if (wasDown.length) {
    const nowLowest = Math.max(...wasDown.map((k) => q[k][1]));
    const dy = GROUND - nowLowest;
    if (Math.abs(dy) > 0.01) {
      for (const k of ['head', 'shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle', 'heel', 'toe',
                       'shoulder2', 'elbow2', 'wrist2', 'knee2', 'ankle2', 'heel2', 'toe2']) {
        if (q[k]) q[k] = [q[k][0], q[k][1] + dy];
      }
      if (q.load) {
        q.load = { ...q.load, at: [q.load.at[0], q.load.at[1] + dy],
          ...(q.load.at2 ? { at2: [q.load.at2[0], q.load.at2[1] + dy] } : {}) };
      }
    }
  }
  // 凳子必须跟着躯干走。归一化改了躯干长度和落位，凳子留在原处的结果是
  // 人悬在凳子外面——器械与身体的接触关系和脚踩地一样，是姿态的语义。
  if (p.bench && q.hip && q.shoulder) {
    const lying = Math.abs(q.shoulder[1] - q.hip[1]) < 26;
    if (lying) {
      // 平/上斜卧推：凳面托住整条躯干
      const x0 = Math.min(q.shoulder[0], q.hip[0]) - 10;
      const x1 = Math.max(q.shoulder[0], q.hip[0]) + 12;
      q.bench = [x0, Math.max(q.shoulder[1], q.hip[1]) + 5, x1 - x0, 9];
    } else {
      // 坐姿器械：凳面是个座位，托在髋下
      q.bench = [q.hip[0] - 24, q.hip[1] + 6, 48, 8];
    }
  }

  // 悬垂：人挂在手上，而单杠的高度本来就由人的身高决定。
  // 所以这里让**杠跟着手走**：先把身体按自然悬垂落位（脚离地一段），
  // 再把杠放到手的位置。反过来做（手够固定高度的杠）会让脚穿过地面——
  // 那不是姿态画错了，是那根杠对这个人来说太矮。
  if (p.fixed?.type === 'pullup_bar' && q.toe) {
    const dy = (GROUND - 26) - q.toe[1];
    for (const k of ['head', 'shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle', 'heel', 'toe',
                     'shoulder2', 'elbow2', 'wrist2', 'knee2', 'ankle2', 'heel2', 'toe2']) {
      if (q[k]) q[k] = [q[k][0], q[k][1] + dy];
    }
    q.fixed = { ...p.fixed, at: [q.wrist[0], q.wrist[1] - 6] };
  } else if (p.fixed && q.wrist) {
    const dx = p.fixed.at[0] - q.wrist[0];
    const dy = p.fixed.at[1] + 6 - q.wrist[1];
    for (const k of ['head', 'shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle', 'heel', 'toe',
                     'shoulder2', 'elbow2', 'wrist2', 'knee2', 'ankle2', 'heel2', 'toe2']) {
      if (q[k]) q[k] = [q[k][0] + dx, q[k][1] + dy];
    }
    if (q.load) {
      q.load = { ...q.load, at: [q.load.at[0] + dx, q.load.at[1] + dy],
        ...(q.load.at2 ? { at2: [q.load.at2[0] + dx, q.load.at2[1] + dy] } : {}) };
    }
  }
  return q;
}

// 站姿持械：整副图横向平移，让负荷铅垂线正好落在足中线上。
// 脚的位置本来就是相对的，平移不改变任何力学关系，却让「杠过足中线」
// 这条判据变成构造事实而不是人工对齐的结果。
const SHIFT_TO_MIDFOOT = new Set([
  'squat_bottom', 'squat_top', 'squat_front_bottom', 'squat_front_top',
  'hinge_bottom', 'hinge_top', 'rdl_bottom',
  'ohp_bottom', 'ohp_top', 'row_start', 'row_end',
  'carry_stance', 'carry_front', 'carry_overhead',
]);

function shiftToMidfoot(p) {
  if (!p.load) return p;
  const dx = MIDFOOT - p.load.at[0];
  if (Math.abs(dx) < 0.01) return p;
  const move = (pt) => (pt ? [pt[0] + dx, pt[1]] : pt);
  const q = { ...p };
  for (const k of ['head', 'shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle', 'heel', 'toe',
                   'shoulder2', 'elbow2', 'wrist2', 'knee2', 'ankle2', 'heel2', 'toe2']) {
    if (q[k]) q[k] = move(q[k]);
  }
  q.load = { ...p.load, at: move(p.load.at), ...(p.load.at2 ? { at2: move(p.load.at2) } : {}) };
  if (p.bench) q.bench = [p.bench[0] + dx, p.bench[1], p.bench[2], p.bench[3]];
  if (p.fixed) q.fixed = { ...p.fixed, at: move(p.fixed.at) };
  return q;
}

for (const [name, p] of Object.entries(POSES)) {
  const n = normalize(name, p);
  POSES[name] = SHIFT_TO_MIDFOOT.has(name) ? shiftToMidfoot(n) : n;
}

export const POSE_NAMES = Object.keys(POSES);

// ── 渲染 ───────────────────────────────────────────────

// 固定 200×240 的画布上，人只占中间一小条，缩到卡片宽度后就糊成一团。
// 按内容算包围盒再留边，同样的显示宽度下人形能大一倍，是可读性最便宜的一次改进。
export function contentBox(p, { plumb = false } = {}) {
  const xs = [], ys = [];
  const add = (pt) => { if (pt) { xs.push(pt[0]); ys.push(pt[1]); } };
  for (const k of ['head','shoulder','elbow','wrist','hip','knee','ankle','heel','toe',
                   'shoulder2','elbow2','wrist2','knee2','ankle2','heel2','toe2']) add(p[k]);
  if (p.load) {
    const [x, y] = p.load.at;
    const half = (p.load.type === 'bar' || p.load.type === 'front') ? 42 : 14;
    xs.push(x - half, x + half); ys.push(y - 16, y + 16);
    if (p.load.at2) { xs.push(p.load.at2[0] - 14, p.load.at2[0] + 14); ys.push(p.load.at2[1] - 10, p.load.at2[1] + 10); }
  }
  if (p.fixed) {
    const [x, y] = p.fixed.at;
    const half = p.fixed.type === 'pullup_bar' ? 48 : 32;
    xs.push(x - half, x + half); ys.push(y - 4, y);
  }
  if (p.bench) { xs.push(p.bench[0], p.bench[0] + p.bench[2]); ys.push(p.bench[1], p.bench[1] + p.bench[3]); }
  // 头是个半径 13 的圆，包围盒要把它整个算进去
  if (p.head) { xs.push(p.head[0] - 14, p.head[0] + 14); ys.push(p.head[1] - 14, p.head[1] + 14); }
  // 地面与足中线标记始终在底
  ys.push(GROUND + (plumb ? 10 : 3));
  const padX = 10, padTop = 22; // 顶部给帧标题留行
  const x0 = Math.min(...xs) - padX, x1 = Math.max(...xs) + padX;
  const y0 = Math.min(...ys) - padTop, y1 = Math.max(...ys) + 6;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
const seg = (a, b, cls = 'sk-limb') => `<line class="${cls}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`;

function load(l) {
  if (!l) return '';
  const [x, y] = l.at;
  switch (l.type) {
    case 'bar':
    case 'front':
      return `<g class="sk-load"><line class="sk-bar" x1="${x - 34}" y1="${y}" x2="${x + 34}" y2="${y}"/>`
        + `<circle class="sk-plate" cx="${x - 30}" cy="${y}" r="11"/>`
        + `<circle class="sk-plate" cx="${x + 30}" cy="${y}" r="11"/></g>`;
    case 'hands':
      return `<g class="sk-load"><rect class="sk-dumbbell" x="${x - 9}" y="${y - 5}" width="18" height="10" rx="3"/></g>`;
    case 'hands2':
      return `<g class="sk-load">`
        + `<rect class="sk-dumbbell" x="${x - 9}" y="${y - 5}" width="18" height="10" rx="3"/>`
        + `<rect class="sk-dumbbell" x="${l.at2[0] - 9}" y="${l.at2[1] - 5}" width="18" height="10" rx="3"/></g>`;
    case 'handle':
      return `<g class="sk-load"><rect class="sk-handle" x="${x - 10}" y="${y - 4}" width="20" height="8" rx="4"/></g>`;
    case 'pad':
      return `<g class="sk-load"><rect class="sk-pad" x="${x - 6}" y="${y - 13}" width="12" height="26" rx="6"/></g>`;
    case 'wheel':
      return `<g class="sk-load"><circle class="sk-wheel" cx="${x}" cy="${y}" r="9"/>`
        + `<line class="sk-bar" x1="${x - 13}" y1="${y}" x2="${x + 13}" y2="${y}"/></g>`;
    case 'sled':
      return `<g class="sk-load"><rect class="sk-sled" x="${x - 10}" y="${y - 16}" width="20" height="32" rx="3"/></g>`;
    default: return '';
  }
}

function fixed(f) {
  if (!f) return '';
  if (f.type === 'pullup_bar') {
    const [x, y] = f.at;
    return `<g class="sk-fixed"><line class="sk-bar" x1="${x - 46}" y1="${y}" x2="${x + 46}" y2="${y}"/>`
      + `<line class="sk-rig" x1="${x - 44}" y1="${y}" x2="${x - 44}" y2="6"/>`
      + `<line class="sk-rig" x1="${x + 44}" y1="${y}" x2="${x + 44}" y2="6"/></g>`;
  }
  if (f.type === 'low_bar') {
    const [x, y] = f.at;
    return `<g class="sk-fixed"><line class="sk-bar" x1="${x - 30}" y1="${y}" x2="${x + 30}" y2="${y}"/>`
      + `<line class="sk-rig" x1="${x - 28}" y1="${y}" x2="${x - 28}" y2="${GROUND}"/>`
      + `<line class="sk-rig" x1="${x + 28}" y1="${y}" x2="${x + 28}" y2="${GROUND}"/></g>`;
  }
  return '';
}

/** 一帧姿态。plumb=true 时画出杠线与足中线（站姿动作的核心判据）。 */
export function renderPose(p, opts = {}) {
  const { plumb = false, caption = '' } = opts;
  const g = [];
  const gb = opts.box;
  g.push(`<line class="sk-ground" x1="${gb ? gb.x + 2 : 8}" y1="${GROUND}" x2="${gb ? gb.x + gb.w - 2 : FIG_W - 8}" y2="${GROUND}"/>`);
  if (p.bench) {
    const [x, y, w, h] = p.bench;
    g.push(`<rect class="sk-bench" x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/>`);
    g.push(`<line class="sk-rig" x1="${x + 8}" y1="${y + h}" x2="${x + 8}" y2="${GROUND}"/>`);
    g.push(`<line class="sk-rig" x1="${x + w - 8}" y1="${y + h}" x2="${x + w - 8}" y2="${GROUND}"/>`);
  }
  g.push(fixed(p.fixed));

  // 远侧肢体先画（浅一档），形成前后关系
  if (p.knee2) {
    g.push(seg(p.hip, p.knee2, 'sk-limb sk-far'));
    g.push(seg(p.knee2, p.ankle2, 'sk-limb sk-far'));
    g.push(seg(p.heel2, p.toe2, 'sk-foot sk-far'));
  }
  if (p.elbow2) {
    g.push(seg(p.shoulder2 ?? p.shoulder, p.elbow2, 'sk-limb sk-far'));
    g.push(seg(p.elbow2, p.wrist2, 'sk-limb sk-far'));
  }

  // 躯干与近侧肢体
  g.push(seg(p.shoulder, p.hip, 'sk-trunk'));
  g.push(seg(p.hip, p.knee));
  g.push(seg(p.knee, p.ankle));
  g.push(seg(p.heel, p.toe, 'sk-foot'));
  g.push(seg(p.shoulder, p.elbow));
  g.push(seg(p.elbow, p.wrist));
  g.push(`<circle class="sk-head" cx="${p.head[0]}" cy="${p.head[1]}" r="12"/>`);
  g.push(seg(p.shoulder, [p.head[0] - 5, p.head[1] + 9], 'sk-neck'));

  for (const j of ['shoulder', 'elbow', 'hip', 'knee', 'ankle']) {
    g.push(`<circle class="sk-joint" cx="${p[j][0]}" cy="${p[j][1]}" r="3.2"/>`);
  }

  g.push(load(p.load));

  if (plumb && p.load && p.heel && p.toe) {
    const bx = p.load.at[0];
    g.push(`<line class="sk-plumb" x1="${bx}" y1="${p.load.at[1]}" x2="${bx}" y2="${GROUND + 8}"/>`);
    g.push(`<line class="sk-midfoot" x1="${MIDFOOT}" y1="${GROUND - 4}" x2="${MIDFOOT}" y2="${GROUND + 8}"/>`);
  }

  const box = opts.box;
  const cap = caption
    ? `<text class="sk-caption" x="${box ? box.x + box.w / 2 : FIG_W / 2}" y="${box ? box.y + 15 : 18}">${caption}</text>`
    : '';
  return cap + g.join('');
}

/** 一个动作的两帧（起止位置）。 */
export function renderSkeleton(fig, nameZh) {
  // 自重动作把模板里的负荷摘掉——照着画一副不存在的杠铃，就是在教错东西
  const strip = (p) => (fig.no_load && p ? { ...p, load: undefined } : p);
  const a = strip(POSES[fig.start]);
  const b = strip(POSES[fig.end ?? fig.start]);
  const plumb = fig.plumb !== false && !fig.no_load;
  const boxes = [contentBox(a, { plumb })];
  if (b && b !== a) boxes.push(contentBox(b, { plumb }));
  const x0 = Math.min(...boxes.map((x) => x.x));
  const y0 = Math.min(...boxes.map((x) => x.y));
  const x1 = Math.max(...boxes.map((x) => x.x + x.w));
  const y1 = Math.max(...boxes.map((x) => x.y + x.h));
  const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  const frame = (p, cap, key) => {
    return `<svg viewBox="${box.x.toFixed(1)} ${box.y.toFixed(1)} ${box.w.toFixed(1)} ${box.h.toFixed(1)}"`
      + ` class="sk-frame" data-pose="${key}" preserveAspectRatio="xMidYMid meet"`
      + ` role="img" aria-label="${nameZh}·${cap}">${renderPose(p, { plumb, caption: cap, box })}</svg>`;
  };
  const two = fig.end && fig.end !== fig.start;
  return `<figure class="skeleton" data-exercise="${nameZh}">`
    + frame(a, fig.cap_start ?? '起始', fig.start)
    + (two ? frame(b, fig.cap_end ?? '结束', fig.end) : '')
    + `<figcaption>${fig.note ?? '示意图：关节位置按本卡自检判据摆放，非写实插画。'}</figcaption>`
    + '</figure>';
}
