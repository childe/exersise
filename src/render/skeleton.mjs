// 出平面手臂的重建与主动肌标注。两者都只影响画法，不改姿态数据本身。
import { rebuildArmFor, OUT_OF_PLANE_ARM, ARM_OVERRIDES } from './arm.mjs';
import { MUSCLE_SEG } from './muscle-segments.mjs';
import { renderFace, facing, PRONE_POSES, FACE_GEOMETRY } from './facing.mjs';
// 循环依赖：interp 需要 POSES/GROUND/MIDFOOT，这里只在 renderSkeleton 运行时调 interpolate，
// 两个模块都求值完毕之后才会用到，函数声明又会提升，所以可以这么引。
import { interpolate } from './interp.mjs';
const HEAD_RADIUS = FACE_GEOMETRY.HEAD_R;
// 弹力带那一段「被手握住的带子」的半宽。握点钳制用同一个数（arm.mjs 的 BAND_GRIP），
// 手才正好落在带子上：±9 会把肘角压到 24°，±24 则让手悬在带子外 8px。
export const BAND_HALF = 17;
/**
 * 负荷**架在身上**的姿态：杠压在斜方肌/后三角/锁骨上，或带子绕过后颈。
 * 这些负荷画在身体之后（被身体挡住是对的），也因此豁免「器械不许撞进头里」。
 * 推举、下拉、划船这些**握在手里**的负荷不在此列——它们本来就该从脸前经过，
 * 该让路的是头，不是断言。
 */
export const RACKED_POSES = new Set([
  'squat_top', 'squat_bottom', 'squat_lowbar_top', 'squat_lowbar_bottom',
  'squat_front_top', 'squat_front_bottom', 'goblet_top', 'goblet_bottom',
  'carry_front', 'gm_top', 'gm_bottom',
]);

/**
 * 其中**画在身体之后**的那几个：杠压在后颈/后三角上，或带子绕过后颈，侧视里被身体挡住。
 * 前架位（锁骨前）虽然也架在身上，但它在身体**前面**，画在身后就成了「杠从背后穿过来」。
 */
export const BEHIND_POSES = new Set([
  'squat_top', 'squat_bottom', 'squat_lowbar_top', 'squat_lowbar_bottom', 'gm_top', 'gm_bottom',
]);   // 头圆半径：画、贴地判定与断言共用同一个数

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
    hip: [44, 160], knee: [108, 152], ankle: [80, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'bar', at: [91.3, 87.8] },
  }),

  // 低杠背蹲自己的一对姿态。
  //
  // 原先它和高杠共用 squat_top/squat_bottom，而图注写着「低杠位杠更靠后、
  // 躯干前倾更多」——声称侧视有差别，却画一模一样的图。两张卡并排放在
  // 参考库里，读者看到的是两张相同的图配两段不同的说明。
  // （对照：窄握卧推也共用姿态，但它的图注老实说明「侧视的躯干与肩位与
  // 平板卧推一致」。共用姿态可以，声称有差别又画一样的不行。）
  //
  // 差别只有两处，都是可量的：
  //   杠位：从斜方肌上缘下移到后三角/肩胛冈，沿躯干约 11px（偏移写在躯干系里，前倾时跟着转）
  //   躯干：底部前倾由 35° 增到约 48°
  // 而「杠必须过足中线」不变——正是这条不变，才逼出低杠的真正特征：
  // 杠位更低、躯干更倾，髋就必须更往后走才能让杠停在足中线上。
  // 所以这张图自己演示了低杠与高杠的力学区别，不用再靠图注断言。
  squat_lowbar_top: P({
    head: [102, 36], shoulder: [90, 54], elbow: [72, 78], wrist: [92, 62],
    hip: [78, 114], knee: [84, 150], ankle: [80, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'bar', at: [83.5, 60.9] },   // 躯干系 (−8, −5)：低杠在后三角/肩胛冈，比高杠沿躯干低 11px、更靠后
  }),
  squat_lowbar_bottom: P({
    head: [112, 86], shoulder: [100, 104], elbow: [80, 128], wrist: [100, 114],
    // 底部：膝前移到踝前 18px、大腿接近水平（与高杠同一口径）。原来膝只在踝前 1.9px、
    // 大腿上翘 39°，躯干与大腿几乎共线——那正是「早安式深蹲」这个错误本身。
    hip: [41.8, 167], knee: [100, 152], ankle: [80, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'bar', at: [90.9, 106.5] },   // 躯干系 (−8, −5)，与顶部同值
  }),

  // 高脚杯深蹲用自己的一对姿态：哑铃抱在**胸前**（躯干系 −18，即肩下 18px 的胸骨中段），
  // 而不是前架位的锁骨高度。原来它与哑铃前蹲共用一对姿态，哑铃中心落在肩之上 2px，
  // 对哑铃前蹲（「靠住肩与锁骨之间」）是对的，对高脚杯（「抱在胸前贴住躯干」）差 22.9px——
  // 正是契约 §7 要防的「两个动作共用一对姿态，只有一个成立」。
  goblet_top: P({
    head: [98, 32], shoulder: [86, 50], elbow: [99, 74], wrist: [92, 54],
    hip: [82, 110], knee: [84, 150], ankle: [80, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'hands', at: [90.8, 68.4] },
  }),
  goblet_bottom: P({
    head: [100, 70], shoulder: [88, 88], elbow: [103, 111], wrist: [96, 92],
    hip: [54, 172], knee: [114, 167], ankle: [80, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'hands', at: [86.8, 106.9] },
  }),

  // 自重深蹲用自己的一套手臂：两臂前伸配重。
  //
  // 不能照搬 squat_top/bottom 再把杠摘掉——那样手会悬在原杠位的半空，
  // 摆着握杠的姿势却没有杠。更要紧的是握杠手臂属于出平面的那一类，
  // 摘掉杠之后 rebuildArm 失去前提（它要靠 load 定握点），会静默回落到
  // 原始坐标，也就是那根 5.7° 的折叠手臂。
  // 前伸的手臂本来就在矢状面内，全长作图即可，不需要重建。
  squat_bw_top: P({
    head: [100, 34], shoulder: [88, 52], elbow: [114, 60], wrist: [142, 58],
    hip: [80, 112], knee: [84, 150], ankle: [80, 216], heel: [72, 225], toe: [108, 225],
  }),
  squat_bw_bottom: P({
    head: [104, 74], shoulder: [92, 92], elbow: [118, 100], wrist: [146, 98],
    hip: [44, 160], knee: [108, 152], ankle: [80, 216], heel: [72, 225], toe: [108, 225],
  }),
  squat_top: P({
    head: [100, 34], shoulder: [88, 52], elbow: [70, 74], wrist: [88, 56],
    hip: [80, 112], knee: [84, 150], ankle: [80, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'bar', at: [85.4, 48.6] },   // 躯干系 (+3, −3)：高杠在斜方肌上缘、略偏后
  }),
  // 前架位（高脚杯蹲 / 前蹲）：负荷在身前，躯干更直
  squat_front_bottom: P({
    // 躯干角由「杠过足中线」反解，唯一的自由量是髋位。原来髋比高杠还靠后 1.9px，
    // 躯干只比高杠直 4.2°，而 cue 写「下蹲时躯干尽量直立」。髋前移 11px → 躯干 22°。
    head: [100, 70], shoulder: [88, 88], elbow: [103, 111], wrist: [96, 92],
    hip: [54, 172], knee: [114, 167], ankle: [80, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'front', at: [94.3, 88.4] },   // 躯干系 (+2, +6)
  }),
  squat_front_top: P({
    head: [98, 32], shoulder: [86, 50], elbow: [99, 74], wrist: [92, 54],
    hip: [82, 110], knee: [84, 150], ankle: [80, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'front', at: [92.1, 48.4] },   // 躯干系 (+2, +6)：前架位在锁骨前
  }),
  // 单腿（分腿蹲 / 保加利亚 / 箭步）：后腿屈膝落后方
  // 凳面原来离地只有 18.9px（全库最矮的凳，比小腿骨短三倍）。后脚踩在这么矮的台阶上，
  // 120px 的后腿够不到，膝只能往前折——后侧髋在下蹲过程中屈了 56.7°，
  // 而发力要点写的是「后侧髋被拉开」。现在凳面抬到离地 54px，后脚两帧钉在同一点。
  split_bottom: P({
    head: [68.9, 42], shoulder: [66.4, 58.8], elbow: [67, 108.8], wrist: [68, 147.8],
    hip: [54.4, 137.9], knee: [111, 158], ankle: [96, 216], heel: [90, 225], toe: [126, 225],
    // heel2/toe2 相对 ankle2 的偏移必须与顶部帧相同——脚是刚体，而它是全程唯一不动的支撑点。
    // 原来两帧 raw heel2/toe2 相同而 ankle2 不同，归一化后偏移一帧 7.97、一帧 11.48，
    // 底部整条脚线落进 8px 厚的凳板里 5.5px。
    knee2: [56.6, 197.9], ankle2: [5.53, 163.52], heel2: [13.97, 171.49], toe2: [-6.03, 169.49],
    bench: [-9, 206, 48, 8], support: ['ankle2'],
    load: { type: 'hands', at: [68, 156] },
  }),
  split_top: P({
    head: [81, 3], shoulder: [81, 20.1], elbow: [82, 70], wrist: [83, 109],
    hip: [81, 100.1], knee: [87, 159.7], ankle: [96, 216], heel: [90, 225], toe: [126, 225],
    knee2: [66, 158.1], ankle2: [5.96, 167.03], heel2: [14.4, 175], toe2: [-5.6, 173],
    bench: [-9, 206, 48, 8], support: ['ankle2'],
    load: { type: 'hands', at: [83, 117] },
  }),

  // ── 髋铰链 ─────────────────────────────────────────
  hinge_bottom: P({
    head: [110, 115], shoulder: [94, 121], elbow: [94, 171], wrist: [94, 210],
    hip: [18.8, 148.4], knee: [78.3, 156], ankle: [80, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'bar', at: [90, 218] },
  }),
  hinge_top: P({
    head: [100, 40], shoulder: [88, 58], elbow: [88, 108], wrist: [90, 147],
    hip: [84, 118], knee: [86, 152], ankle: [80, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'bar', at: [90, 155] },
  }),
  // 罗马尼亚 / 早安：膝角变化小，髋位移大，杠不落地
  rdl_bottom: P({
    // 手臂略后倾（腕在肩后 18px）不是装饰：杠必须过足中线，手臂竖直时解出的躯干角
    // 只到 55°，杠停在膝上 20px、离腿 30px——而 cue 和 mistakes 都在讲「杠贴着腿下行」。
    // 腕后移把解推到 33°，杠降到膝高，缝隙减半。
    head: [104, 33], shoulder: [88, 39.4], elbow: [87, 89.4], wrist: [70, 124.4],
    hip: [41.6, 104.6], knee: [71.6, 156.6], ankle: [80, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'bar', at: [70, 132.4] },
  }),
  // 臀桥 / 髋推：仰卧，肩支撑
  // 臀桥同样按约束构造：上背（肩）贴地、头贴地、脚平放、手臂放在体侧地面。
  // 原来肩离地 67px——那是从髋推（凳上）借来的姿态。
  // 脚跟到髋约一掌半：rigid 60/60 的腿，再近膝角就低于解剖下限 38°。
  bridge_bottom: P({
    head: [42, 213], shoulder: [57.7, 219], elbow: [107.7, 221], wrist: [146.7, 222],
    hip: [137.5, 214], knee: [160.6, 158.5], ankle: [178, 216], heel: [174, 225], toe: [194, 225],
  }),
  bridge_top: P({
    head: [42, 213], shoulder: [57.7, 219], elbow: [107.7, 221], wrist: [146.7, 222],
    hip: [129.2, 183.1], knee: [182.8, 156.2], ankle: [178, 216], heel: [174, 225], toe: [194, 225],
  }),

  // 哑铃臀推借用臀桥姿态时，手躺在地面、哑铃在髋上，两者相距 18–50px——
  // 一只没人扶的哑铃。这里给它自己的一对姿态：肘仍落在地面附近，前臂上举扶住哑铃。
  hipthrust_bottom: P({
    head: [42, 213], shoulder: [57.7, 219], elbow: [99.4, 191.2], wrist: [135, 207],
    hip: [137.5, 214], knee: [160.6, 158.5], ankle: [178, 216], heel: [174, 225], toe: [194, 225],
    load: { type: 'hands', at: [137.5, 206] },
  }),
  hipthrust_top: P({
    head: [42, 213], shoulder: [57.7, 219], elbow: [86, 176], wrist: [124, 178],
    hip: [129.2, 183.1], knee: [182.8, 156.2], ankle: [178, 216], heel: [174, 225], toe: [194, 225],
    load: { type: 'hands', at: [129.2, 175] },
  }),

  // ── 水平推（卧姿）─────────────────────────────────
  // 底部「触胸」：杠停在胸面上，即躯干线上方约 10px（仰卧，上 = −y）。
  // 原来杠在胸上方 42px（归一化后 61px）：矢状面全长手臂 30+29 把手推离了胸——
  // 卧推底部肘向两侧张开，上臂指向读者、投影极短，是出平面手臂，登记进
  // OUT_OF_PLANE_ARM 并用更短的投影比例（见 arm.mjs ARM_OVERRIDES）。
  // 负荷锚在肩（LOAD_ANCHOR），这样杠的位置不随手臂归一化变化。
  bench_bottom: P({
    head: [54, 140], shoulder: [74, 142], elbow: [98, 162], wrist: [98, 134],
    hip: [112, 142], knee: [146, 176], ankle: [150, 216], heel: [142, 225], toe: [170, 225],
    bench: [48, 148, 86, 10],
    load: { type: 'bar', at: [98, 132] },
  }),
  bench_top: P({
    head: [54, 140], shoulder: [74, 142], elbow: [74, 92], wrist: [74, 53],
    hip: [112, 142], knee: [146, 176], ankle: [150, 216], heel: [142, 225], toe: [170, 225],
    bench: [48, 148, 86, 10],
    load: { type: 'bar', at: [74, 51] },
  }),
  // 俯卧撑 / 地面推：手撑地
  // 俯卧撑与平板支撑按约束**构造**，不是手摆：
  //   腕（或肘）在地面、脚尖在地面、肩-髋-膝-踝一条线、手臂竖直在肩正下方。
  // 原来手摆的坐标归一化后手悬空 36px、髋偏离直线 27px——腿被放大 1.8 倍而
  // 贴地修正只按回最低的那一个点。这里直接用 BONE 长度算出坐标，归一化是恒等。
  // 俯卧家族 toe 在地、heel 在上（脚尖撑地），别和站姿的 heel/toe 混。
  pushup_bottom: P({
    head: [37.9, 186.1], shoulder: [54.8, 187.6], elbow: [100.8, 207.3], wrist: [66, 225],
    hip: [134.5, 194.6], knee: [194.2, 199.8], ankle: [254, 205], heel: [252, 211], toe: [262, 225],
  }),
  pushup_top: P({
    head: [50, 130.8], shoulder: [66, 136.6], elbow: [66, 186.6], wrist: [66, 225],
    hip: [141.2, 164], knee: [197.6, 184.5], ankle: [254, 205], heel: [252, 211], toe: [262, 225],
  }),

  // 弹力带早安式：负荷在颈后（锚在肩），带子从脚下拉到肩，手扶在肩上握带。
  // 原来直接借用 RDL 的姿态，画成了一张杠铃 RDL——早安式与 RDL 的唯一区别（负荷位置）被画反。
  gm_top: P({
    head: [100, 40], shoulder: [88, 58], elbow: [70, 78], wrist: [90, 62],
    hip: [84, 118], knee: [86, 152], ankle: [80, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'band', at: [84.4, 51.7], from: [90, 225] },
  }),
  gm_bottom: P({
    head: [104, 33], shoulder: [88, 39.4], elbow: [70, 60], wrist: [90, 44],
    hip: [41.6, 104.6], knee: [71.6, 156.6], ankle: [80, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'band', at: [88.2, 32.2], from: [90, 225] },
  }),

  // ── 垂直推 ─────────────────────────────────────────
  ohp_bottom: P({
    // 推起时头略后让路（cue 原文）：原来头反而前移，杠有 6 帧从头圆正中穿过。
    head: [60, 42], shoulder: [86, 56], elbow: [96, 80], wrist: [90, 58],
    hip: [84, 112], knee: [84, 150], ankle: [82, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'bar', at: [92, 54] },
  }),
  ohp_top: P({
    head: [98, 44], shoulder: [86, 58], elbow: [86, 38], wrist: [88, 18],
    hip: [84, 112], knee: [84, 150], ankle: [82, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'bar', at: [90, 12] },
  }),

  // ── 水平拉 ─────────────────────────────────────────
  // 俯身划船的膝是「微屈」：原来髋被摆到脚跟后 39px，膝角只有 97.6°，
  // 画的是硬拉起始的下肢，而 cue 写「屈髋到躯干与地面 15–45 度，膝微屈」。
  // 现在膝角 ~150°、大腿与水平 ~70°、躯干 39°。
  row_start: P({
    head: [144.9, 39.6], shoulder: [131.7, 50.3], elbow: [131.7, 100.3], wrist: [131.7, 139.3],
    hip: [69.5, 100.6], knee: [90, 158], ankle: [80, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'bar', at: [131.7, 147.3] },
  }),
  row_end: P({
    head: [144.9, 39.6], shoulder: [131.7, 50.3], elbow: [82.4, 58.4], wrist: [103.2, 91.4],
    hip: [69.5, 100.6], knee: [90, 158], ankle: [80, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'bar', at: [103.2, 99.4] },
  }),
  // 坐姿 / 器械划船：躯干近直立
  seated_row_start: P({
    head: [78, 110], shoulder: [86, 126], elbow: [112, 140], wrist: [140, 148],
    hip: [84, 182], knee: [130, 188], ankle: [160, 210], heel: [156, 218], toe: [176, 214],
    bench: [60, 190, 44, 8],
    load: { type: 'handle', at: [146, 148] },
  }),
  // 终点：肘拉到肩后约 40px、手柄贴到腹部。原来肘只在肩后 5.3px、手在肩前上方——
  // 那是弯举的形状，不是划船。
  seated_row_end: P({
    head: [78, 110], shoulder: [86, 126], elbow: [55, 150], wrist: [100, 160],
    hip: [84, 182], knee: [130, 188], ankle: [160, 210], heel: [156, 218], toe: [176, 214],
    bench: [60, 190, 44, 8],
    load: { type: 'handle', at: [106, 160] },
  }),

  // ── 垂直拉 ─────────────────────────────────────────
  pullup_hang: P({
    head: [100, 62], shoulder: [87, 78], elbow: [89, 57], wrist: [90, 36],
    hip: [88, 140], knee: [91, 186], ankle: [93, 198], heel: [87, 204], toe: [107, 200],   // 悬垂：脚离地
    fixed: { type: 'pullup_bar', at: [90, 30] },
  }),
  // 顶部：下巴过杠 → 头心至少在杠上 12px，肩与杠齐平。此时肘在后下方、手在杠上，
  // 侧视里上臂与前臂投影重叠——与背蹲同一类出平面手臂，登记在 OUT_OF_PLANE_ARM。
  // 原来头心在杠下 10px，画出来是"下巴在杠下 35px"。
  // 顶部：手在杠上，肩必然在手**之下**——原来归一化后肩跑到杠上方 8.7px，
  // 等于人悬在自己的手之上，任何视角都不成立。现在肩在杠下 18px。
  // 代价：这副骨架的头颈比例（颈 17、头半径 12）让下巴只能比肩高 5px，
  // 所以「下巴过杠」在图上表现为头心与杠齐平、头顶露出杠上方，图注已改。
  pullup_top: P({
    head: [92, 35], shoulder: [86, 52], elbow: [120.7, 15.8], wrist: [90, 40],
    hip: [88, 132], knee: [92, 178], ankle: [94, 210], heel: [88, 216], toe: [108, 212],
    fixed: { type: 'pullup_bar', at: [90, 30] },
  }),
  // 下拉：坐姿，负荷在上
  pulldown_start: P({
    // 躯干略后倾（cue 原文）：原来肩在髋的朝向侧 2.8px，画出来是前倾 2°。
    head: [76, 104], shoulder: [78, 120], elbow: [76.8, 70], wrist: [96, 36],
    hip: [84, 178], knee: [130, 184], ankle: [158, 216], heel: [154, 225], toe: [174, 221],
    bench: [60, 186, 44, 8],
    // 把手在头前：横杆从脸前拉到锁骨前，不是从头颅里穿过去
    load: { type: 'handle', at: [100, 30] },
  }),
  pulldown_end: P({
    // 终点把手在锁骨前（肩前 10、下 5），不是中胸——cue 与判据都写「拉到锁骨前」。
    // 把手贴到锁骨之后，肩到手只剩约 11px，50+39 的手臂在矢状面内必然折成发卡；
    // 真实下拉的握距比肩宽、肘向两侧下方走，侧视本就是出平面，所以登记进 OUT_OF_PLANE_ARM 重建。
    head: [76, 104], shoulder: [78, 120], elbow: [78, 170], wrist: [102, 160],
    hip: [84, 178], knee: [130, 184], ankle: [158, 216], heel: [154, 225], toe: [174, 221],
    bench: [60, 186, 44, 8],
    load: { type: 'handle', at: [106, 125] },
  }),

  // ── 搬运 ───────────────────────────────────────────
  carry_stance: P({
    head: [98, 38], shoulder: [86, 56], elbow: [84, 92], wrist: [84, 128],
    hip: [84, 114], knee: [84, 152], ankle: [82, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'hands', at: [84, 136] },
  }),
  carry_front: P({
    // 肘抬到与杠齐平：卡片把「肘往下掉→杠往前滚、压住气管」列为常见错误，
    // 原来却把肘画成整条手臂的最低点（低于杠 13.8px）。
    head: [98, 38], shoulder: [86, 56], elbow: [108, 52], wrist: [100, 58],
    hip: [84, 114], knee: [84, 152], ankle: [82, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'front', at: [93.9, 58.3] },
  }),
  carry_overhead: P({
    head: [98, 44], shoulder: [86, 58], elbow: [86, 38], wrist: [88, 18],
    hip: [84, 114], knee: [84, 152], ankle: [82, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'bar', at: [90, 12] },
  }),

  // ── 核心抗阻 ───────────────────────────────────────
  plank: P({
    head: [49.2, 172.4], shoulder: [66, 175], elbow: [66, 225], wrist: [27, 225],
    hip: [145.1, 187], knee: [204.5, 196], ankle: [263.8, 205], heel: [261.8, 211], toe: [271.8, 225],
  }),
  // 死虫是**对侧**手脚同时伸出，另一组保持 90-90。原来图上只有同侧的一只手和一条腿，
  // 两者在动画里一起伸出去，读起来正好是动作要避免的那个样子。
  // 现在近侧手臂与远侧腿一起伸展（深色），远侧手臂与近侧腿保持 90-90（浅色）。
  deadbug_start: P({
    head: [42, 213], shoulder: [57.7, 219], elbow: [57.7, 169], wrist: [57.7, 130],
    shoulder2: [57.7, 219], elbow2: [62, 169], wrist2: [62, 130],
    hip: [137.5, 214], knee: [137.5, 154], ankle: [197.5, 154], heel: [195, 162], toe: [203, 144],
    knee2: [137.5, 158], ankle2: [197.5, 158], heel2: [195, 166], toe2: [203, 148],
    load: { type: 'hands', at: [57.7, 122], at2: [62, 122] },
  }),
  deadbug_end: P({
    head: [42, 213], shoulder: [57.7, 219], elbow: [9.7, 205], wrist: [-28.9, 199.5],
    shoulder2: [57.7, 219], elbow2: [62, 169], wrist2: [62, 130],
    hip: [137.5, 214], knee: [137.5, 154], ankle: [197.5, 154], heel: [195, 162], toe: [203, 144],
    knee2: [196.3, 206], ankle2: [256, 200], heel2: [252, 207], toe2: [266, 204],
    load: { type: 'hands', at: [-28.9, 192], at2: [62, 122] },
  }),
  // 抗旋（Pallof）：正视才看得出要点
  // 帕洛夫是正视图（判据「肩线髋线不转」只有正面看得见）。推出的方向是**朝向读者**，
  // 正面投影里表现为两肘从两侧收向中线，手始终在胸高合握——不是向下伸。
  // 原来 out 帧手垂到小腹（低于胸 39px），是把景深方向画成了向下。
  // 指向读者的手臂投影本来就短，这两帧登记在 FORESHORTENED_ARM，归一化不改手臂长度。
  pallof_in: P({
    view: 'front',
    head: [100, 44], shoulder: [84, 64], elbow: [66, 88], wrist: [100, 80],
    shoulder2: [116, 64], elbow2: [134, 88], wrist2: [100, 80],
    hip: [100, 126], knee: [84, 172], ankle: [82, 216], heel: [78, 225], toe: [86, 225],
    knee2: [116, 172], ankle2: [118, 216], heel2: [114, 225], toe2: [122, 225],
    // 阻力来自画面右侧（正视图里带子水平指向一侧）。抗旋转动作的全部内容就是这个方向，
    // 原来图上只有一个把手，看不出力往哪边拉。
    load: { type: 'band', at: [100, 80], from: [146, 80] },
  }),
  pallof_out: P({
    view: 'front',
    head: [100, 44], shoulder: [84, 64], elbow: [89, 73], wrist: [100, 80],
    shoulder2: [116, 64], elbow2: [111, 73], wrist2: [100, 80],
    hip: [100, 126], knee: [84, 172], ankle: [82, 216], heel: [78, 225], toe: [86, 225],
    knee2: [116, 172], ankle2: [118, 216], heel2: [114, 225], toe2: [122, 225],
    // 阻力来自画面右侧（正视图里带子水平指向一侧）。抗旋转动作的全部内容就是这个方向，
    // 原来图上只有一个把手，看不出力往哪边拉。
    load: { type: 'band', at: [100, 80], from: [146, 80] },
  }),

  // ── 单关节 / 正视要点 ─────────────────────────────
  lateral_raise_down: P({
    view: 'front',
    // 手垂在髋外侧：原来落在肩宽以内，两只 18px 的哑铃只隔 6px，连成一条横杠。
    head: [100, 40], shoulder: [84, 62], elbow: [70, 112], wrist: [77.3, 150.3],
    hip: [100, 124], knee: [86, 172], ankle: [84, 216], heel: [80, 225], toe: [88, 225],
    knee2: [114, 172], ankle2: [116, 216], heel2: [112, 225], toe2: [120, 225],
    shoulder2: [116, 62], elbow2: [130, 112], wrist2: [122.7, 150.3],
    load: { type: 'hands2', at: [77.3, 156.3], at2: [122.7, 156.3] },
  }),
  lateral_raise_up: P({
    view: 'front',
    head: [100, 40], shoulder: [84, 62], elbow: [50, 64], wrist: [22, 80],
    hip: [100, 124], knee: [86, 172], ankle: [84, 216], heel: [80, 225], toe: [88, 225],
    knee2: [114, 172], ankle2: [116, 216], heel2: [112, 225], toe2: [120, 225],
    shoulder2: [116, 62], elbow2: [150, 64], wrist2: [178, 80],
    load: { type: 'hands2', at: [18, 82], at2: [182, 82] },
  }),
  curl_down: P({
    head: [98, 40], shoulder: [86, 58], elbow: [84, 96], wrist: [84, 132],
    hip: [84, 116], knee: [84, 152], ankle: [82, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'hands', at: [84, 140] },
  }),
  // 顶峰肘角 36.3°，确实贴着 35° 下限——但这是弯举顶峰该有的样子：
  // 真人完全屈肘时上臂与前臂的夹角本来就在 30–40°，把手再往外挪只会让它看起来没拉到顶。
  // （第四轮的提交信息写成「抬到 45°」是错的，实际只从 35.1° 抬到 36.3°。）
  curl_up: P({
    head: [98, 40], shoulder: [86, 58], elbow: [84, 96], wrist: [102, 74],
    hip: [84, 116], knee: [84, 152], ankle: [82, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'hands', at: [106, 68] },
  }),
  triceps_top: P({
    head: [98, 40], shoulder: [86, 58], elbow: [88, 92], wrist: [120, 86],
    hip: [84, 116], knee: [84, 152], ankle: [82, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'handle', at: [126, 86] },
  }),
  triceps_bottom: P({
    head: [98, 40], shoulder: [86, 58], elbow: [88, 92], wrist: [92, 128],
    hip: [84, 116], knee: [84, 152], ankle: [82, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'handle', at: [96, 132] },
  }),
  calf_down: P({
    head: [98, 38], shoulder: [86, 56], elbow: [84, 92], wrist: [84, 126],
    hip: [84, 114], knee: [84, 152], ankle: [82, 214], heel: [72, 225], toe: [108, 225],
    load: { type: 'hands', at: [84, 136] },
  }),
  calf_up: P({
    head: [98, 24], shoulder: [86, 42], elbow: [84, 78], wrist: [84, 112],
    // 顶峰的脚 = 起始的脚绕**脚尖**刚体旋转 24.6°。原来三点各自手写，
    // 踝—脚尖拉长 23%、踝—脚跟缩短 25%——而这张图的全部内容就是踝的屈伸，脚不该伸缩。
    hip: [84, 100], knee: [84, 140], ankle: [88.98, 204.2], heel: [75.27, 210], toe: [108, 225],
    load: { type: 'hands', at: [84, 122] },
  }),
  // ── 坐姿与器械 ─────────────────────────────────────
  leg_press_bottom: P({
    head: [44, 150], shoulder: [60, 158], elbow: [70, 174], wrist: [100, 170],
    hip: [96, 186], knee: [128, 146], ankle: [150, 160], heel: [156, 166], toe: [152, 146],
    bench: [36, 188, 70, 10],
    load: { type: 'plate', at: [158, 152] },
  }),
  leg_press_top: P({
    head: [44, 150], shoulder: [60, 158], elbow: [70, 174], wrist: [100, 170],
    hip: [96, 186], knee: [136, 168], ankle: [170, 160], heel: [176, 166], toe: [172, 146],
    bench: [36, 188, 70, 10],
    load: { type: 'plate', at: [178, 152] },
  }),
  leg_extension_down: P({
    // 座位高度要容得下归一化后 60px 的小腿垂下来：原来 knee.y=182，小腿一拉长脚就穿地，
    // 只能靠贴地修正把整个人连座位抬起来，于是两帧座位高度不同。
    head: [78, 76], shoulder: [86, 94], elbow: [94, 122], wrist: [78, 138],
    hip: [84, 148], knee: [126, 154], ankle: [130, 182], heel: [124, 187], toe: [142, 184],
    bench: [58, 156, 46, 8],
    load: { type: 'pad', at: [134.3, 170.1] },
  }),
  leg_extension_up: P({
    head: [78, 76], shoulder: [86, 94], elbow: [94, 122], wrist: [78, 138],
    // 脚相对小腿的偏移与起始帧取同一组：脚不参与屈伸，不该在一次重复里长 16%
    hip: [84, 148], knee: [126, 154], ankle: [172, 148], heel: [176.9, 154.1], toe: [174.1, 136],
    bench: [58, 156, 46, 8],
    load: { type: 'pad', at: [160.1, 143.6] },
  }),
  // 肘不能画进「离地 ≤7」的窗口：那会让 normalize 把肘当成接触点、整副图被下压 5.75px，
  // 画出来是趴在凳上的人把肘杵在地板上。
  leg_curl_start: P({
    head: [30, 186], shoulder: [50, 192], elbow: [12, 210], wrist: [-18, 186],
    // 脚相对小腿的关系与终点帧取同一组：原来脚尖指向天花板（偏中立 169°），
    // 俯卧直腿时足背朝下，脚尖只能朝下或顺着小腿。
    hip: [106, 192], knee: [142, 192], ankle: [178, 194], heel: [181.9, 189], toe: [188, 201.7],
    bench: [26, 196, 104, 9], support: ['shoulder', 'hip', 'knee'],
    load: { type: 'pad', at: [168, 190] },
  }),
  leg_curl_end: P({
    head: [30, 186], shoulder: [50, 192], elbow: [12, 210], wrist: [-18, 186],
    hip: [106, 192], knee: [142, 192], ankle: [130, 150], heel: [124, 148], toe: [134, 138],
    bench: [26, 196, 104, 9], support: ['shoulder', 'hip', 'knee'],
    load: { type: 'pad', at: [129.5, 160.7] },   // 小腿局部 (−10.2, −3.4)：与起始帧同侧（腓肠肌侧）
  }),
  // 坐姿提踵：前脚掌是支点，两帧不动；脚跟、踝、膝（膝垫在膝上）一起升起。
  // 两帧的最低点都正好在地面（下沉=脚跟，顶峰=脚尖），归一化不做贴地平移，座位才不会
  // 在两帧之间跳 4.7px。坐标按 BONE 长度直接构造。
  // 已知局限：手臂 59 与躯干 80 的比例让手够不到膝垫也够不到座位，所以手只能垂着。
  seated_calf_down: P({
    head: [72.6, 56.5], shoulder: [80, 72], elbow: [88, 100], wrist: [84, 128],
    hip: [80, 152], knee: [139.5, 160], ankle: [147.4, 219.5], heel: [142.4, 225], toe: [168, 225],
    bench: [56, 160, 48, 8],
    load: { type: 'pad', at: [129.5, 149.5] },
  }),
  seated_calf_up: P({
    head: [72.6, 56.5], shoulder: [80, 72], elbow: [88, 100], wrist: [84, 128],
    hip: [80, 152], knee: [140, 152.2], ankle: [151.1, 211.2], heel: [143.6, 214.2], toe: [168, 225],
    bench: [56, 160, 48, 8],
    load: { type: 'pad', at: [128.7, 143.1] },   // 与起始帧的大腿局部偏移相同：垫子压的位置不该变
  }),
  // 上斜：躯干倾斜约 40°，凳面随之倾斜（normalize 按躯干方向生成 benchIncline）。
  // 底部杠在胸上（肩沿朝脸方向 10px），上臂指向读者——与平板卧推底部同一类出平面手臂。
  incline_bottom: P({
    // 肘向两侧下方张开（与地面竖直成 ~55°）：前臂竖直时肘角才打得开，
    // 原来肘离竖直只有 21°，解出来的肘角 21.3°。
    head: [28, 111.5], shoulder: [42.7, 120], elbow: [77.4, 156.3], wrist: [60, 130],
    hip: [112, 160], knee: [134, 182], ankle: [146, 216], heel: [140, 225], toe: [166, 225],
    bench: [46, 128, 84, 10],
    // 上斜的触点在胸**上**段（躯干 0.18），平板在胸骨下段（0.30）——
    // 两张卡正是靠这条判据互相区分，原来两者都是 0.300，图上分不出来。
    load: { type: 'bar', at: [60.2, 118.5] },
  }),
  incline_top: P({
    // 锁定：手臂垂直于**地面**。原来垂直于躯干，30° 斜凳上就把负荷推到肩前 48px，
    // 肩上挂着一个端不住的静态力矩，而且与底部帧不在同一条轨迹上。
    head: [28, 111.5], shoulder: [42.7, 120], elbow: [42.7, 70], wrist: [42.7, 31],
    hip: [112, 160], knee: [134, 182], ankle: [146, 216], heel: [140, 225], toe: [166, 225],
    bench: [46, 128, 84, 10],
    load: { type: 'bar', at: [42.7, 29] },
  }),
  machine_press_start: P({
    head: [76, 106], shoulder: [86, 124], elbow: [66, 142], wrist: [92, 140],
    hip: [84, 180], knee: [128, 186], ankle: [158, 214], heel: [154, 225], toe: [174, 225],
    bench: [60, 188, 44, 8],
    load: { type: 'handle', at: [98, 140] },
  }),
  machine_press_end: P({
    head: [76, 106], shoulder: [86, 124], elbow: [112, 136], wrist: [142, 140],
    hip: [84, 180], knee: [128, 186], ankle: [158, 214], heel: [154, 225], toe: [174, 225],
    bench: [60, 188, 44, 8],
    load: { type: 'handle', at: [148, 140] },
  }),
  seated_press_bottom: P({
    head: [80, 70], shoulder: [86, 90], elbow: [110, 100], wrist: [100, 86],
    hip: [84, 150], knee: [126, 158], ankle: [156, 216], heel: [152, 225], toe: [172, 225],
    bench: [62, 158, 42, 8],
    load: { type: 'hands', at: [104, 82] },
  }),
  seated_press_top: P({
    head: [80, 76], shoulder: [86, 92], elbow: [86, 70], wrist: [88, 46],
    hip: [84, 150], knee: [126, 158], ankle: [156, 216], heel: [152, 225], toe: [172, 225],
    bench: [62, 158, 42, 8],
    load: { type: 'hands', at: [88, 38] },
  }),
  // 跪姿俯卧撑整副按 BONE 构造：膝是支点，两帧必须落在同一点。
  // 原来两帧的「膝→髋→肩」跨度 143.6 > 60+80，normalize 够不到就自己改了膝位，
  // 两帧的膝因此差 2px，动画末帧回不到静态帧。现在跨度取 138（身体接近一条直线）。
  knee_pushup_bottom: P({
    // 「胸接近地面」比俯卧撑的「离地一拳」更深，所以跪姿底部的肩必须比俯卧撑**更低**。
    // 第六轮只把行程从 53% 提到 80%，顺序仍然是反的（45.6 vs 37.4），注释却已声称修好。
    head: [39.5, 187.9], shoulder: [56, 192], elbow: [105.5, 198.6], wrist: [76.95, 225.96],
    hip: [131.7, 210.7], knee: [190, 225], ankle: [246.4, 204.5], heel: [240.4, 200.5], toe: [255.4, 213.5],
  }),
  knee_pushup_top: P({
    head: [68.4, 128.9], shoulder: [81.7, 139.4], elbow: [91.45, 188.41], wrist: [81.72, 226.21],
    hip: [142.9, 187.8], knee: [190, 225], ankle: [246.4, 204.5], heel: [240.4, 200.5], toe: [255.4, 213.5],
  }),
  // 单臂划船：凳面原来离地只有 38.9px（约 24cm，实物训练凳 45cm）。
  // 跪腿把髋顶在离地 105px 处，而站立腿有 120px，只能屈到 109.5° 的半蹲。
  // 凳抬高后站立腿接近伸直。
  // 原来「一膝跪凳」和「同一条腿的脚踩地」写在同一条腿上——
  // 小腿因此从凳面里穿过去，而远侧腿和撑凳的手根本没画。
  // 改成：远侧腿（knee2/ankle2）跪在凳上、小腿平放，远侧手（wrist2）撑凳前端，
  // 近侧腿站地。侧视里站腿与凳子投影重叠是对的——脚本来就在凳子外侧，
  // 凳子先画、身体后画，层次读得出来。
  one_arm_row_start: P({
    head: [136, 78], shoulder: [120, 82], elbow: [120, 132], wrist: [120, 171],
    hip: [40, 102], knee: [65.7, 156.3], ankle: [60, 216], heel: [52, 225], toe: [88, 225],
    shoulder2: [120, 82], elbow2: [92.6, 123.8], wrist2: [102, 159],
    knee2: [28, 160.8], ankle2: [-32, 160.8], heel2: [-38, 168.8], toe2: [-24, 168.8],
    support: ['knee2', 'ankle2', 'wrist2'],
    bench: [-56, 167, 180, 8],
    load: { type: 'hands', at: [120, 179] },
  }),
  one_arm_row_end: P({
    head: [136, 78], shoulder: [120, 82], elbow: [72.3, 67.1], wrist: [72, 106],
    hip: [40, 102], knee: [65.7, 156.3], ankle: [60, 216], heel: [52, 225], toe: [88, 225],
    shoulder2: [120, 82], elbow2: [92.6, 123.8], wrist2: [102, 159],
    knee2: [28, 160.8], ankle2: [-32, 160.8], heel2: [-38, 168.8], toe2: [-24, 168.8],
    support: ['knee2', 'ankle2', 'wrist2'],
    bench: [-56, 167, 180, 8],
    load: { type: 'hands', at: [72, 114] },
  }),
  inverted_row_start: P({
    head: [42.3, 177.3], shoulder: [59, 180.3], elbow: [99.9, 151.5], wrist: [105, 113],
    hip: [137.8, 194.1], knee: [196.9, 204.6], ankle: [256, 215], heel: [260, 225], toe: [270, 212],
    fixed: { type: 'low_bar', at: [105, 107] },
  }),
  inverted_row_end: P({
    head: [74, 96.7], shoulder: [88.3, 106], elbow: [108.2, 151.9], wrist: [105, 113],
    hip: [155.4, 149.6], knee: [205.7, 182.3], ankle: [256, 215], heel: [260, 225], toe: [270, 212],
    fixed: { type: 'low_bar', at: [105, 107] },
  }),
  face_pull_start: P({
    // 起始帧手应落在「滑轮—面部」那条线上：原来把手低于头心 35px，读起来像直臂下拉。
    head: [98, 40], shoulder: [86, 58], elbow: [114, 52], wrist: [144, 46],
    hip: [84, 116], knee: [84, 152], ankle: [82, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'handle', at: [150, 46] },
  }),
  face_pull_end: P({
    head: [98, 40], shoulder: [86, 58], elbow: [84, 32], wrist: [116, 46],
    hip: [84, 116], knee: [84, 152], ankle: [82, 216], heel: [72, 225], toe: [108, 225],
    load: { type: 'handle', at: [122, 46] },
  }),
  reverse_fly_start: P({
    view: 'front',
    head: [100, 60], shoulder: [84, 82], elbow: [62, 108], wrist: [58, 136],
    shoulder2: [116, 82], elbow2: [138, 108], wrist2: [142, 136],
    hip: [100, 134], knee: [86, 174], ankle: [84, 216], heel: [80, 225], toe: [88, 225],
    knee2: [114, 174], ankle2: [116, 216], heel2: [112, 225], toe2: [120, 225],
    load: { type: 'hands2', at: [58, 142], at2: [142, 142] },
  }),
  reverse_fly_end: P({
    view: 'front',
    head: [100, 60], shoulder: [84, 82], elbow: [50, 86], wrist: [18.8, 109.4],
    shoulder2: [116, 82], elbow2: [150, 86], wrist2: [181.2, 109.4],
    hip: [100, 134], knee: [86, 174], ankle: [84, 216], heel: [80, 225], toe: [88, 225],
    knee2: [114, 174], ankle2: [116, 216], heel2: [112, 225], toe2: [120, 225],
    load: { type: 'hands2', at: [15, 112], at2: [185, 112] },
  }),
  back_extension_down: P({
    head: [16.7, 177.7], shoulder: [32, 170.4], elbow: [40, 185], wrist: [52, 178],
    // 俯卧：脚尖朝头的那一侧（−x），不是朝后。原来两帧的脚都反了 168°，
    // 画出来是一个俯卧的人长了一双朝后的站立脚。
    hip: [104, 136], knee: [134, 170], ankle: [146, 212], heel: [153.7, 209.8], toe: [121, 219.3],
    bench: [92, 130, 40, 9], support: ['hip'],
    load: { type: 'pad', at: [152, 208] },
  }),
  back_extension_up: P({
    // 肘/腕沿躯干法向推到腹侧 14–16px：原来只有 2.3/6.1px，两段 limb 全压在
    // 11px 宽的躯干笔画里，顶点帧等于没画手臂，动画里手还从胸前扫到背后。
    head: [39.7, 63.3], shoulder: [51, 76], elbow: [53.3, 99.8], wrist: [44.5, 89.8],
    hip: [104, 136], knee: [134, 170], ankle: [146, 212], heel: [153.7, 209.8], toe: [121, 219.3],
    bench: [92, 130, 40, 9], support: ['hip'],
    load: { type: 'pad', at: [152, 208] },
  }),
  // 健腹轮：跪姿，膝是地面上的支点，两帧不动；轮在地上向**头的方向**滚
  // （这组图头朝左，所以是 −x）。原来轮朝膝盖滚、膝和轮都离地 15–40px。
  // 起始：大腿竖直、躯干水平、手臂竖直在肩正下方。最远：膝-髋-肩-手一条直线斜下。
  rollout_start: P({
    head: [85.8, 111.5], shoulder: [100.5, 120], elbow: [100.5, 170], wrist: [100.5, 209],
    hip: [169.8, 160], knee: [174.8, 220], ankle: [234.8, 224], heel: [232, 214], toe: [244, 225],
    load: { type: 'wheel', at: [100.5, 216] },
  }),
  rollout_end: P({
    head: [31.4, 156.2], shoulder: [46.9, 163.1], elbow: [5.5, 191.1], wrist: [-29.3, 209],
    hip: [120, 195.6], knee: [174.8, 220], ankle: [234.8, 224], heel: [232, 214], toe: [244, 225],
    load: { type: 'wheel', at: [-29.3, 216] },
  }),
  sled_push_stance: P({
    head: [78, 86], shoulder: [66, 102], elbow: [92, 116], wrist: [120, 124],
    hip: [44, 140], knee: [78, 176], ankle: [58, 214], heel: [50, 225], toe: [84, 225],
    // 后腿按与前腿相同的作者长度画，否则归一化把两腿各自拉到 60/60 后，
    // 原本更短的那条腿下沉得多，另一只脚就浮起来（之前前脚悬空 12px）。
    // 后脚不能画到地面以下：normalize 的贴地修正只按最低点整体上提，
    // 画到 229.3 的后脚会把前脚一起顶起 5.3px。
    knee2: [15, 171.19], ankle2: [-4.6, 209.19], heel2: [-12.6, 220.19], toe2: [21.4, 220.19],
    load: { type: 'sled', at: [126, 124] },
  }),
};

// ── 骨架归一化 ─────────────────────────────────────────
//
// 姿态是手摆的坐标，手摆就必然带来同一个人在两帧之间"长高"的问题
// （实测：深蹲顶部大腿 38px、底部 64px）。靠逐个调坐标去修，这类错误会一直复发。
// 所以这里只把坐标当作**方向**来用，长度一律换成下面这副固定骨骼——
// 肢体长度于是由构造保证，不再是需要人去守的纪律。
// 单杠的固定位置。悬垂时归一化后的身体从手到脚尖约 259px，杠必须高到脚离地。
const PULLUP_BAR_AT = [90, -92];   // 手臂 89 + 躯干 80 + 腿 120 + 脚 ≈ 299

// 手臂原来是 30+29=59，相对躯干 80 只有 0.74；真人上臂 0.186H、前臂到腕 0.146H、
// 髋到肩 0.30H，手臂/躯干 ≈1.11。短了 35% 的后果遍布全库：硬拉起始杠到不了地、
// RDL 杠停在大腿、坐姿人物够不到座位和膝垫、下压压不到大腿、健腹轮肩角打不开。
const BONE = {
  thigh: 60, shank: 60, upper_arm: 50, forearm: 39, torso: 80, neck: 17,
};

// 负荷挂在哪个关节上：杠在背上/前架位随肩走，其余随腕走。
const LOAD_ANCHOR = {
  squat_bottom: 'shoulder', squat_top: 'shoulder',
  squat_front_bottom: 'shoulder', squat_front_top: 'shoulder',
  goblet_top: 'shoulder', goblet_bottom: 'shoulder',
  squat_lowbar_top: 'shoulder', squat_lowbar_bottom: 'shoulder',
  bench_top: 'shoulder', bench_bottom: 'shoulder',   // 杠的位置不该随手臂归一化漂走
  incline_top: 'shoulder', incline_bottom: 'shoulder',
  gm_top: 'shoulder', gm_bottom: 'shoulder',
  carry_front: 'shoulder', ohp_bottom: 'shoulder',
  // 腿部器械的阻力垫顶在踝上、腿举的踏板被脚蹬着——
  // 默认跟着手腕走会让它们浮在半空，读起来像个没来由的点。
  leg_extension_down: 'ankle', leg_extension_up: 'ankle',
  leg_curl_start: 'ankle', leg_curl_end: 'ankle',
  // 把手的位置由器械与身体决定，不该跟着火柴人的手臂长度漂
  pulldown_start: 'shoulder', pulldown_end: 'shoulder',
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
  // 正视图有肩宽：躯干顶端是两肩的中点，两肩各自从中点横向展开。
  // 原来两肩重合（肩宽 0），于是「肩线保持水平/不转」这条判据在图上没有线可看，
  // 侧平举的手臂也只能从同一点岔开 36° 才不压在躯干上。
  const frontMid = p.view === 'front' && p.shoulder2
    ? [(p.shoulder[0] + p.shoulder2[0]) / 2, (p.shoulder[1] + p.shoulder2[1]) / 2] : null;
  if (frontMid) {
    const M = place(p.hip, p.hip, frontMid, BONE.torso);
    q.shoulderMid = M;
    q.shoulder = [M[0] + (p.shoulder[0] - frontMid[0]), M[1] + (p.shoulder[1] - frontMid[1])];
  }
  if (FORESHORTENED_ARM.has(name)) {
    // 保留作者给的投影长度，只跟着肩平移
    q.elbow = [p.elbow[0] + (q.shoulder[0] - p.shoulder[0]), p.elbow[1] + (q.shoulder[1] - p.shoulder[1])];
    q.wrist = [p.wrist[0] + (q.shoulder[0] - p.shoulder[0]), p.wrist[1] + (q.shoulder[1] - p.shoulder[1])];
  } else {
    q.elbow = place(q.shoulder, p.shoulder, p.elbow, BONE.upper_arm);
    q.wrist = place(q.elbow, p.elbow, p.wrist, BONE.forearm);
  }
  // 正视图的头要长在肩线中点上：原来落点用中点、方向却取自近侧肩，
  // 画出来是个恒定歪向一边的头——而正视图存在的理由正是「看两肩等不等高、有没有侧倾」。
  q.head = place(q.shoulderMid ?? q.shoulder, frontMid ?? p.shoulder, p.head, BONE.neck);
  if (p.knee2) {
    q.knee2 = place(p.hip, p.hip, p.knee2, BONE.thigh);
    q.ankle2 = place(q.knee2, p.knee2, p.ankle2, BONE.shank);
  }
  if (p.elbow2) {
    const os2 = p.shoulder2 ?? p.shoulder;
    q.shoulder2 = frontMid
      ? [q.shoulderMid[0] + (p.shoulder2[0] - frontMid[0]), q.shoulderMid[1] + (p.shoulder2[1] - frontMid[1])]
      : (p.shoulder2 ? place(p.hip, p.hip, p.shoulder2, BONE.torso) : q.shoulder);
    if (FORESHORTENED_ARM.has(name)) {
      q.elbow2 = [p.elbow2[0] + (q.shoulder2[0] - os2[0]), p.elbow2[1] + (q.shoulder2[1] - os2[1])];
      q.wrist2 = [p.wrist2[0] + (q.shoulder2[0] - os2[0]), p.wrist2[1] + (q.shoulder2[1] - os2[1])];
    } else {
      q.elbow2 = place(q.shoulder2, os2, p.elbow2, BONE.upper_arm);
      q.wrist2 = place(q.elbow2, p.elbow2, p.wrist2, BONE.forearm);
    }
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
    // 带子的固定端：踩在脚下的锚点永远留在地面（只跟着横向走），
    // 其余锚点（器械上的滑轮/挂点）相对把手不动，跟着把手一起搬。
    // 踩在脚下的锚点按定义就在足中线的地面上（脚钉在标准位，它也就钉死了）；
    // 器械上的挂点相对把手不动，跟着把手一起搬。
    if (p.load.from && Math.abs(p.load.from[1] - GROUND) <= 2) q.load.from = [MIDFOOT, GROUND];
    if (p.load.from && Math.abs(p.load.from[1] - GROUND) > 2) {
      q.load.from = [q.load.at[0] + (p.load.from[0] - p.load.at[0]),
                     q.load.at[1] + (p.load.from[1] - p.load.at[1])];
    }
    // 压在小腿上的滚轮垫：偏移写在小腿局部坐标里，归一化改了小腿方向它才跟着转。
    // 用世界偏移的后果是腿屈伸顶峰时垫子翻到胫骨侧——那一侧它要穿过小腿才能存在。
    if (p.load.type === 'pad' && anchorName === 'ankle' && p.knee && q.knee) {
      const ru = unit([p.ankle[0] - p.knee[0], p.ankle[1] - p.knee[1]]);
      const rn = [-ru[1], ru[0]];
      const a = off[0] * ru[0] + off[1] * ru[1], b = off[0] * rn[0] + off[1] * rn[1];
      const nu = unit([q.ankle[0] - q.knee[0], q.ankle[1] - q.knee[1]]);
      const nn = [-nu[1], nu[0]];
      q.load.at = [q.ankle[0] + a * nu[0] + b * nn[0], q.ankle[1] + a * nu[1] + b * nn[1]];
      q.load.padAngle = Math.atan2(nu[1], nu[0]);     // 长轴垂直于小腿 → 与小腿同向旋转
    }
    if (p.load.at2 && p.wrist2) {
      const off2 = [p.load.at2[0] - p.wrist2[0], p.load.at2[1] - p.wrist2[1]];
      q.load.at2 = [q.wrist2[0] + off2[0], q.wrist2[1] + off2[1]];
    }
  }
  // 归一化改变了肢体长度，原本贴地的接触点会被推到地下或悬空。
  // 把当初贴地的那几个点重新按回地面——接触关系是姿态的语义，不能被长度调整弄丢。
  const CONTACTS = ['heel', 'toe', 'heel2', 'toe2', 'wrist', 'elbow', 'knee', 'hip', 'shoulder'];
  const wasDown = CONTACTS.filter((k) => p[k] && Math.abs(p[k][1] - GROUND) <= 7);
  // 仰卧时后脑勺也压在地上，而头画成 r=12 的圆——贴地的是圆的下缘，不是圆心。
  // 漏了这条的后果：死虫式的头圆陷进地面 5.9px（关节都在地面上，圆却不是）。
  const headDown = p.head && Math.abs(p.head[1] + HEAD_RADIUS - GROUND) <= 7;
  if (wasDown.length || headDown) {
    const lows = wasDown.map((k) => q[k][1]);
    if (headDown) lows.push(q.head[1] + HEAD_RADIUS);
    const nowLowest = Math.max(...lows);
    const dy = GROUND - nowLowest;
    if (Math.abs(dy) > 0.01) {
      for (const k of ['head', 'shoulder', 'shoulderMid', 'elbow', 'wrist', 'hip', 'knee', 'ankle', 'heel', 'toe',
                       'shoulder2', 'elbow2', 'wrist2', 'knee2', 'ankle2', 'heel2', 'toe2']) {
        if (q[k]) q[k] = [q[k][0], q[k][1] + dy];
      }
      if (q.load) {
        q.load = { ...q.load, at: [q.load.at[0], q.load.at[1] + dy],
          ...(q.load.at2 ? { at2: [q.load.at2[0], q.load.at2[1] + dy] } : {}),
          ...(q.load.from && Math.abs(q.load.from[1] - GROUND) > 2
            ? { from: [q.load.from[0], q.load.from[1] + dy] } : {}) };
      }
    }
  }
  // 凳子必须跟着躯干走。归一化改了躯干长度和落位，凳子留在原处的结果是
  // 人悬在凳子外面——器械与身体的接触关系和脚踩地一样，是姿态的语义。
  if (p.bench && q.hip && q.shoulder) {
    const tilt = Math.abs(Math.atan2(q.shoulder[1] - q.hip[1], q.shoulder[0] - q.hip[0]) * 180 / Math.PI);
    // 作者显式声明了支撑关节（背屈伸的髋垫、单臂划船的膝）就不按躯干倾斜猜——
    // 背屈伸的躯干从下垂到水平，凳子若跟着躯干走，两帧之间会移动 97px。
    const explicit = Array.isArray(p.support);
    const lying = !explicit && (tilt < 60 || tilt > 120);
    const inclined = lying && tilt > 12 && tilt < 168;
    if (inclined) {
      // 上斜凳：凳面沿躯干方向，贴在躯干背侧（脸的反方向）。平凳托不住倾斜的躯干——
      // 原来上斜卧推的肩离平凳 58px。
      q.support = ['shoulder', 'hip'];
      const ux = (q.shoulder[0] - q.hip[0]) / 80, uy = (q.shoulder[1] - q.hip[1]) / 80;
      const f = facing(name, q);
      const nx = -f[0], ny = -f[1];                  // 指向凳子内部
      const from = [q.hip[0] - ux * 12 + nx * 5, q.hip[1] - uy * 12 + ny * 5];
      const to = [q.shoulder[0] + ux * 30 + nx * 5, q.shoulder[1] + uy * 30 + ny * 5];
      q.benchIncline = { from, to, n: [nx, ny], h: 9 };
      delete q.bench;
    } else if (lying) {
      // 平卧：凳面托住整条躯干。凳端要托住头——原来按肩起算，头悬出凳端 19px
      q.support = p.support ?? ['shoulder', 'hip'];
      const sx = q.support.map((j) => q[j][0]);
      const x0 = Math.min(q.head ? q.head[0] - 14 : Infinity, Math.min(...sx) - 10);
      const x1 = Math.max(...sx) + 12;
      q.bench = [x0, Math.max(q.shoulder[1], q.hip[1]) + 5, x1 - x0, 9];
    } else {
      // 坐姿/跪姿器械：凳面托在声明的支撑关节下（默认髋；单臂划船是膝）
      q.support = p.support ?? ['hip'];
      const xs = q.support.map((j) => q[j][0]), ys = q.support.map((j) => q[j][1]);
      // 俯卧的髋垫：前缘在髋骨（cue「髋骨上缘略高于垫子前缘」），垫子只往脚的方向延伸
      const proneHip = PRONE_POSES.has(name) && q.support.length === 1 && q.support[0] === 'hip';
      const x0 = proneHip ? q.hip[0] - 4 : Math.min(...xs) - 24, x1 = proneHip ? q.hip[0] + 44 : Math.max(...xs) + 24;
      q.bench = [x0, Math.max(...ys) + 6, x1 - x0, 8];
    }
  }

  // 悬垂：人挂在手上，而单杠的高度本来就由人的身高决定。
  // 所以这里让**杠跟着手走**：先把身体按自然悬垂落位（脚离地一段），
  // 再把杠放到手的位置。反过来做（手够固定高度的杠）会让脚穿过地面——
  // 那不是姿态画错了，是那根杠对这个人来说太矮。
  if (p.fixed?.type === 'pullup_bar' && q.wrist) {
    // 杠是固定物，两帧必须在同一个位置；动的是人。
    // 之前的做法是先把脚钉到离地 26，再让杠跟着手走——结果从悬垂到顶部，
    // 杠下降了 33px，人没动。这正是"引体向上画成横杆下降"。
    // 杠的高度由悬垂帧决定（归一化后的身体 259px 长，脚要离地），顶部帧把身体抬上去。
    const dx = PULLUP_BAR_AT[0] - q.wrist[0];
    const dy = (PULLUP_BAR_AT[1] + 6) - q.wrist[1];
    for (const k of ['head', 'shoulder', 'elbow', 'wrist', 'hip', 'knee', 'ankle', 'heel', 'toe',
                     'shoulder2', 'elbow2', 'wrist2', 'knee2', 'ankle2', 'heel2', 'toe2']) {
      if (q[k]) q[k] = [q[k][0] + dx, q[k][1] + dy];
    }
    q.fixed = { ...p.fixed, at: [...PULLUP_BAR_AT] };
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

// 站姿持械：脚钉在标准位（脚跟 72、脚尖 108，足中线 90 就是真正的足中点），
// 然后**反解躯干角**让负荷落在足中线上——与补间用的是同一个闭式解。
//
// 之前的做法是平移整副图把杠对到 x=90。那让「杠过足中线」成了同义反复，代价是
// 脚跟着杠走：同一动作两帧脚位差最多 13.5px、低杠底部的足中线标记落在脚长 76% 处、
// 前蹲动画末帧比静态帧多倾 10°、划船动画杠漂离铅垂线。全是同一个机制。
// 现在脚不动，躯干角是解出来的，断言「杠偏离足中线 ≤6」才真的在查东西。
const PLUMB_SOLVED = new Set([
  'squat_bottom', 'squat_top', 'squat_front_bottom', 'squat_front_top',
  'squat_lowbar_top', 'squat_lowbar_bottom', 'goblet_top', 'goblet_bottom',
  'hinge_bottom', 'hinge_top', 'rdl_bottom', 'gm_top', 'gm_bottom',
  'ohp_bottom', 'ohp_top',
  'carry_stance', 'carry_front', 'carry_overhead',
]);
// 杠铃划船不在上面：「杠过足中线」是蹲/硬拉的判据，不是划船的。划船顶部杠拉到腹部、
// 身体前倾支撑，杠在脚跟上方而不是足中线。硬套这条会把起始帧的躯干压到 16°（作者写 39°），
// 两帧差 28°，动画看上去像一边划船一边起身。

const ALL_JOINTS = ['head', 'shoulder', 'shoulderMid', 'elbow', 'wrist', 'hip', 'knee', 'ankle', 'heel', 'toe',
                    'shoulder2', 'elbow2', 'wrist2', 'knee2', 'ankle2', 'heel2', 'toe2'];
const UPPER_JOINTS = ['head', 'shoulder', 'shoulderMid', 'elbow', 'wrist', 'shoulder2', 'elbow2', 'wrist2'];
function shiftAll(p, dx, dy, keys = ALL_JOINTS) {
  const q = { ...p };
  for (const k of keys) if (q[k]) q[k] = [q[k][0] + dx, q[k][1] + dy];
  if (q.load) q.load = { ...q.load, at: [q.load.at[0] + dx, q.load.at[1] + dy],
    ...(q.load.at2 ? { at2: [q.load.at2[0] + dx, q.load.at2[1] + dy] } : {}),
    // 地面锚点不跟着平移：它钉在足中线上
    ...(q.load.from && Math.abs(q.load.from[1] - GROUND) > 2
      ? { from: [q.load.from[0] + dx, q.load.from[1] + dy] } : {}) };
  return q;
}
const unit = (v) => { const L = Math.hypot(v[0], v[1]) || 1; return [v[0] / L, v[1] / L]; };
const CANON_HEEL_X = 72;

// 躯干坐标系：u 沿髋→肩，n 是它的法向。架在肩上的杠必须用这个系描述——
// 它压在斜方肌/后三角上，躯干前倾时跟着一起转，不是在世界坐标里悬在肩下方 9px。
// 用世界偏移的后果：低杠底部躯干倾到 48°，那个「肩下 9px」就转到了躯干**前面** 6px，
// 画出来比前蹲的杠还靠前；高杠动画里杠还会在肩上滑 7px。
export function torsoCoords(hip, shoulder, pt) {
  const d = [shoulder[0] - hip[0], shoulder[1] - hip[1]], L = Math.hypot(d[0], d[1]) || 1;
  const u = [d[0] / L, d[1] / L], n = [-u[1], u[0]];
  const v = [pt[0] - shoulder[0], pt[1] - shoulder[1]];
  return [v[0] * u[0] + v[1] * u[1], v[0] * n[0] + v[1] * n[1]];
}
export const fromTorso = (hip, th, L, a, b) => {
  const u = [Math.cos(th), Math.sin(th)], n = [-u[1], u[0]];
  const S = [hip[0] + u[0] * L, hip[1] + u[1] * L];
  return { S, at: [S[0] + a * u[0] + b * n[0], S[1] + a * u[1] + b * n[1]] };
};
const wrap = (x) => { while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };
/**
 * 解躯干角 th，使肩上 (a,b)（躯干系）的负荷落在 x = MIDFOOT 上：
 *   (L+a)·cos th − b·sin th = MIDFOOT − hip.x   ⟺   R·cos(th+φ) = K
 * 两个解里取离作者原角近的那支。无解回 null，留给杠线断言去报。
 */
export function solveTorsoAngle(hipX, a, b, L, th0) {
  const R = Math.hypot(L + a, b), phi = Math.atan2(b, L + a), K = (MIDFOOT - hipX) / R;
  if (Math.abs(K) > 1) return null;
  const c = Math.acos(K);
  return [-phi + c, -phi - c].sort((x, y) => Math.abs(wrap(x - th0)) - Math.abs(wrap(y - th0)))[0];
}

function pinFeetAndSolve(name, p) {
  if (!p.load || !p.heel) return p;
  // 1. 脚钉标准位
  let q = shiftAll(p, CANON_HEEL_X - p.heel[0], 0);
  if (p.bench) q.bench = [p.bench[0] + (CANON_HEEL_X - p.heel[0]), p.bench[1], p.bench[2], p.bench[3]];
  if (p.fixed) q.fixed = { ...p.fixed, at: [p.fixed.at[0] + (CANON_HEEL_X - p.heel[0]), p.fixed.at[1]] };
  const th0 = Math.atan2(q.shoulder[1] - q.hip[1], q.shoulder[0] - q.hip[0]);
  // 2a. 肩锚：负荷随躯干转，角度用上面的闭式解。
  if (q.loadAnchor === 'shoulder') {
    const [a, b] = torsoCoords(q.hip, q.shoulder, q.load.at);
    const th = solveTorsoAngle(q.hip[0], a, b, BONE.torso, th0);
    if (th === null) return q;
    const { S, at } = fromTorso(q.hip, th, BONE.torso, a, b);
    const moved = shiftAll(q, S[0] - q.shoulder[0], S[1] - q.shoulder[1], UPPER_JOINTS);
    moved.load = { ...moved.load, at };
    return moved;
  }
  // 2b. 腕锚等：负荷相对肩的偏移是世界坐标下的量——手臂方向由作者给定，
  //     躯干绕髋转动时整条手臂平移，偏移不变。于是 shoulder.x 有唯一解。
  const off = [q.load.at[0] - q.shoulder[0], q.load.at[1] - q.shoulder[1]];
  const c = (MIDFOOT - off[0] - q.hip[0]) / BONE.torso;
  if (Math.abs(c) > 1) return q;                       // 解不出来：留给杠线断言去报
  const S = [q.hip[0] + BONE.torso * c, q.hip[1] - BONE.torso * Math.sqrt(1 - c * c)];
  const d = [S[0] - q.shoulder[0], S[1] - q.shoulder[1]];
  const moved = shiftAll(q, d[0], d[1], UPPER_JOINTS);  // 上半身整体随肩走，含负荷
  return moved;
}

// 归一化之前的原始坐标。接触点断言要拿它和归一化结果对照：
// 作者说这个点贴地/贴凳，归一化之后它必须还贴着。
export const RAW_POSES = Object.fromEntries(
  Object.entries(POSES).map(([k, v]) => [k, structuredClone(v)]));

// 指向读者（正视图里朝景深方向伸）的手臂，投影本来就短，归一化不得把它拉到全长。
// 与 OUT_OF_PLANE_ARM 不同：那组是侧视里出平面、靠 rebuildArm 重画；这组是正视里
// 出平面、作者给的投影长度就是真相。
export const FORESHORTENED_ARM = new Set(['pallof_in', 'pallof_out', 'back_extension_down', 'back_extension_up', 'face_pull_end']);

for (const [name, p] of Object.entries(POSES)) {
  const n = normalize(name, p);
  n.loadAnchor = LOAD_ANCHOR[name] ?? 'wrist';       // 补间要知道负荷挂在哪
  if (PLUMB_SOLVED.has(name)) {
    POSES[name] = pinFeetAndSolve(name, n);
  } else if (n.view !== 'front' && !n.bench && !n.benchIncline && !n.fixed
             && n.heel && n.toe && Math.abs(n.heel[1] - GROUND) <= 1 && Math.abs(n.toe[1] - GROUND) <= 1) {
    // 所有站姿都把脚钉在标准位：同一动作两帧的脚位才一致（自重深蹲两帧脚跟曾差 3.3px，
    // 动画末帧因此与静态帧差 3.2px）。正视图保持居中，不钉。
    POSES[name] = shiftAll(n, CANON_HEEL_X - n.heel[0], 0);
  } else {
    POSES[name] = n;
  }
}

export const POSE_NAMES = Object.keys(POSES);

// ── 渲染 ───────────────────────────────────────────────


// 固定 200×240 的画布上，人只占中间一小条，缩到卡片宽度后就糊成一团。
// 按内容算包围盒再留边，同样的显示宽度下人形能大一倍，是可读性最便宜的一次改进。
export function contentBox(p, { plumb = false, loadType } = {}) {
  // 画框要按**画出来的**器械算：高脚杯深蹲借用前蹲姿态，按杠铃的半宽 42 留位，
  // 框比实际内容宽 27%，人形被挤小。
  if (loadType && p.load) p = { ...p, load: { ...p.load, type: loadType } };
  const xs = [], ys = [];
  const add = (pt) => { if (pt) { xs.push(pt[0]); ys.push(pt[1]); } };
  for (const k of ['head','shoulder','elbow','wrist','hip','knee','ankle','heel','toe',
                   'shoulder2','elbow2','wrist2','knee2','ankle2','heel2','toe2']) add(p[k]);
  if (p.load) {
    const [x, y] = p.load.at;
    // 带子的把手半宽是 BAND_HALF，不是默认的 14——框和画必须用同一个数
    const half = (p.load.type === 'bar' || p.load.type === 'front') ? 42
      : p.load.type === 'band' ? BAND_HALF + 2 : 14;
    xs.push(x - half, x + half); ys.push(y - 16, y + 16);
    if (p.load.at2) { xs.push(p.load.at2[0] - 14, p.load.at2[0] + 14); ys.push(p.load.at2[1] - 10, p.load.at2[1] + 10); }
    if (p.load.type === 'band') { const [fx, fy] = p.load.from ?? [MIDFOOT, GROUND]; xs.push(fx - 4, fx + 4); ys.push(fy - 4, fy + 4); }
    if (p.load.type === 'sled') { xs.push(x - 16, x + 18); ys.push(GROUND); }
    if (p.load.type === 'plate') { ys.push(y - 24, y + 24); }
  }
  if (p.fixed) {
    const [x, y] = p.fixed.at;
    const half = p.fixed.type === 'pullup_bar' ? 48 : 32;
    xs.push(x - half, x + half); ys.push(p.fixed.type === 'pullup_bar' ? y - 44 : y - 4, y);
  }
  if (p.bench) { xs.push(p.bench[0], p.bench[0] + p.bench[2]); ys.push(p.bench[1], p.bench[1] + p.bench[3]); }
  if (p.benchIncline) { for (const q of [p.benchIncline.from, p.benchIncline.to]) { xs.push(q[0] - 10, q[0] + 10); ys.push(q[1] - 10, q[1] + 10); } }
  // 头是个半径 13 的圆，包围盒要把它整个算进去
  if (p.head) { xs.push(p.head[0] - 14, p.head[0] + 14); ys.push(p.head[1] - 14, p.head[1] + 14); }
  // 地面与足中线标记始终在底
  ys.push(GROUND + (plumb ? 10 : 3));
  const padX = 10, padTop = 22; // 顶部给帧标题留行
  const x0 = Math.min(...xs) - padX, x1 = Math.max(...xs) + padX;
  const y0 = Math.min(...ys) - padTop, y1 = Math.max(...ys) + 6;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const seg = (a, b, cls = 'sk-limb') => `<line class="${cls}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`;

function load(l) {
  if (!l) return '';
  const [x, y] = l.at;
  switch (l.type) {
    case 'bar':
    case 'front':
      // 杠片半径 11、位置 ±30 时，杠上净空只剩 ±19，握点放不下，手臂被迫画小。
      // 外推画细后净空 ±24 —— 肩部的拥挤来自这两个圆盘，不来自杠的长度，所以杠长不动。
      return `<g class="sk-load"><line class="sk-bar" x1="${x - 34}" y1="${y}" x2="${x + 34}" y2="${y}"/>`
        + `<circle class="sk-plate" cx="${x - 31}" cy="${y}" r="7"/>`
        + `<circle class="sk-plate" cx="${x + 31}" cy="${y}" r="7"/></g>`;
    case 'hands':
      // 有 at2 就画两只：死虫是「双手各持一只轻哑铃」，原来只画了近侧那只，
      // 远侧手空着，读起来像单侧负重。
      return `<g class="sk-load"><rect class="sk-dumbbell" x="${x - 9}" y="${y - 5}" width="18" height="10" rx="3"/>`
        + (l.at2 ? `<rect class="sk-dumbbell" x="${l.at2[0] - 9}" y="${l.at2[1] - 5}" width="18" height="10" rx="3"/>` : '')
        + '</g>';
    case 'hands2':
      if (!l.at2) return `<g class="sk-load"><rect class="sk-dumbbell" x="${x - 9}" y="${y - 5}" width="18" height="10" rx="3"/></g>`;
      return `<g class="sk-load">`
        + `<rect class="sk-dumbbell" x="${x - 9}" y="${y - 5}" width="18" height="10" rx="3"/>`
        + `<rect class="sk-dumbbell" x="${l.at2[0] - 9}" y="${l.at2[1] - 5}" width="18" height="10" rx="3"/></g>`;
    case 'band': {
      // 弹力带：一端固定（默认踩在足中线下），另一端在负荷点
      const [fx, fy] = l.from ?? [MIDFOOT, GROUND];
      return `<g class="sk-load"><line class="sk-band" x1="${fx}" y1="${fy}" x2="${x}" y2="${y}"/>`
        + `<rect class="sk-handle" x="${x - BAND_HALF}" y="${y - 3}" width="${BAND_HALF * 2}" height="6" rx="3"/></g>`;
    }
    case 'plate':
      // 腿举踏板：薄片，画在身体之后，不遮脚
      return `<g class="sk-load"><rect class="sk-sled" x="${x - 3}" y="${y - 22}" width="6" height="44" rx="2"/></g>`;
    case 'handle':
      return `<g class="sk-load"><rect class="sk-handle" x="${x - 10}" y="${y - 4}" width="20" height="8" rx="4"/>`
        + (l.at2 ? `<rect class="sk-handle" x="${l.at2[0] - 10}" y="${l.at2[1] - 4}" width="20" height="8" rx="4"/>` : '')
        + '</g>';
    case 'pad': {
      // 滚轮垫是绕着一根轴的圆柱：它的长轴永远**垂直于**被压的肢体，不是永远竖直。
      // 固定竖直的后果：腿屈伸起始帧小腿水平，垫子像一根立柱横在小腿上。
      const a = (l.padAngle ?? Math.PI / 2) * 180 / Math.PI;
      return `<g class="sk-load"><rect class="sk-pad" x="${x - 6}" y="${y - 13}" width="12" height="26" rx="6"`
        + ` transform="rotate(${a.toFixed(1)} ${x} ${y})"/></g>`;
    }
    case 'wheel':
      return `<g class="sk-load"><circle class="sk-wheel" cx="${x}" cy="${y}" r="9"/>`
        + `<line class="sk-bar" x1="${x - 13}" y1="${y}" x2="${x + 13}" y2="${y}"/></g>`;
    case 'sled':
      // 雪橇在地上推：底座贴地，立柱到手的高度，手握在立柱顶。原来是一只悬在半空的方块。
      return `<g class="sk-load"><rect class="sk-sled" x="${x - 14}" y="${GROUND - 8}" width="30" height="8" rx="2"/>`
        + `<line class="sk-rig" x1="${x}" y1="${y}" x2="${x}" y2="${GROUND - 8}"/>`
        + `<rect class="sk-handle" x="${x - 6}" y="${y - 4}" width="12" height="8" rx="4"/></g>`;
    default: return '';
  }
}

function fixed(f) {
  if (!f) return '';
  if (f.type === 'pullup_bar') {
    const [x, y] = f.at;
    return `<g class="sk-fixed"><line class="sk-bar" x1="${x - 46}" y1="${y}" x2="${x + 46}" y2="${y}"/>`
      + `<line class="sk-rig" x1="${x - 44}" y1="${y}" x2="${x - 44}" y2="${y - 40}"/>`
      + `<line class="sk-rig" x1="${x + 44}" y1="${y}" x2="${x + 44}" y2="${y - 40}"/></g>`;
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
/**
 * 画出来的肘与手。出平面的手臂（杠横架在肩上、哑铃举在两侧）按投影重建，
 * 其余用原坐标。动画不能每帧重解：解有时无解（手臂过顶后射线不与杠线相交）、
 * 有时被握点钳制跳变——改成对两端点各求一次，中间帧在两组肘/手之间插值。
 */
// 握在固定杠上的手不会沿杠滑动。两帧各自解握点的后果：悬垂帧（未重建）落在杠心、
// 顶部帧（重建后被 GRIP_MAX 钳制）落在杠心左 24px，动画里手就沿杠平移 24.7px——
// 和当初要修的「杠在动」是同一类叙事错误。握点对同一根固定杠取常量。
const FIXED_GRIP = [-12, 6];   // 相对杠心：略偏近侧、在杠下缘
const FIXED_TARGET = 62 * Math.PI / 180;   // 与 arm.mjs 的 TARGET_DEG 同口径
/** 两骨 IK（与 interp.mjs 的 ik2 同式，这里本地实现以免形成取值期循环依赖）。 */
function ik2Local(S, H, l1, l2, near) {
  const dx = H[0] - S[0], dy = H[1] - S[1], d = Math.hypot(dx, dy) || 1e-6;
  const dc = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-6), l1 + l2 - 1e-6);
  const a = (l1 * l1 - l2 * l2 + dc * dc) / (2 * dc), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d, uy = dy / d, M = [S[0] + ux * a, S[1] + uy * a];
  const c1 = [M[0] - uy * h, M[1] + ux * h], c2 = [M[0] + uy * h, M[1] - ux * h];
  const dist = (c) => Math.hypot(c[0] - near[0], c[1] - near[1]);
  return dist(c1) <= dist(c2) ? c1 : c2;
}

export function drawnArm(name, p, loadType) {
  if (p.fixed && p.shoulder) {
    // 手钉在杠上的常量握点；肘必须跟着这个握点重解，不能沿用各自为政的那个。
    // 只换手不换肘的后果：反向划船终点画出的肘角 5.2°、前臂 16.8px——
    // 「手不滑」换来了「手臂折成发卡」，而两条肘角断言量的都不是画出来的那只手。
    const H = [p.fixed.at[0] + FIXED_GRIP[0], p.fixed.at[1] + FIXED_GRIP[1]];
    const d = Math.hypot(H[0] - p.shoulder[0], H[1] - p.shoulder[1]);
    // 肩与手之间只有 d：两段等长时张开 TARGET 角需要 L = d / √(2(1−cos θ))。
    // 投影再长也不能超过真骨（50 / 39），够不到就成一条接近伸直的手臂——悬垂正是如此。
    const L = d / Math.sqrt(2 * (1 - Math.cos(FIXED_TARGET)));
    const u = Math.min(L, BONE.upper_arm), f = Math.min(L, BONE.forearm);
    // 选边提示必须是**姿态声明的肘朝向**，不能用链上的肘：链够不到后下方
    // （这正是 ARM_OVERRIDES.elbowDir 存在的理由），拿它当提示会选到镜像的那一支，
    // 引体顶部的肘因此翻到肩的上前方、整个埋进头圆里（肘心离头心 3.4px）。
    const dirHint = ARM_OVERRIDES[name]?.elbowDir;
    const hint = dirHint
      ? [p.shoulder[0] + dirHint[0] * 40, p.shoulder[1] + dirHint[1] * 40]
      : (p.elbow ?? [p.shoulder[0], p.shoulder[1] + 40]);
    return { E: ik2Local(p.shoulder, H, u, f, hint), H, rebuilt: true };
  }
  // 器械类型由 figures.json 覆盖时（高脚杯深蹲借用前蹲姿态但拿的是哑铃），
  // 握点钳制必须按**画出来的**器械算：杠铃 ±24 是沿杠线外移的握距，哑铃只有 ±9。
  const q = loadType && p.load ? { ...p, load: { ...p.load, type: loadType } } : p;
  const arm = OUT_OF_PLANE_ARM.has(name) ? rebuildArmFor(name, q) : null;
  return arm ? { E: arm.elbow, H: arm.hand, rebuilt: true } : { E: p.elbow, H: p.wrist, rebuilt: false };
}

export function renderPose(p, opts = {}) {
  const { plumb = false, caption = '', name = '', prime = [] } = opts;
  const { E: ELBOW, H: HAND } = opts.arm ?? drawnArm(name, p, opts.loadType);
  // 器械类型可由 figures.json 覆盖：哑铃卧推共用杠铃卧推的姿态，但画的得是哑铃
  const LD = p.load && opts.loadType ? { ...p.load, type: opts.loadType } : p.load;
  const g = [];
  const gb = opts.box;
  g.push(`<line class="sk-ground" x1="${gb ? gb.x + 2 : 8}" y1="${GROUND}" x2="${gb ? gb.x + gb.w - 2 : FIG_W - 8}" y2="${GROUND}"/>`);
  if (p.bench) {
    const [x, y, w, h] = p.bench;
    g.push(`<rect class="sk-bench" x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/>`);
    g.push(`<line class="sk-rig" x1="${x + 8}" y1="${y + h}" x2="${x + 8}" y2="${GROUND}"/>`);
    g.push(`<line class="sk-rig" x1="${x + w - 8}" y1="${y + h}" x2="${x + w - 8}" y2="${GROUND}"/>`);
  }
  if (p.benchIncline) {
    const { from, to, n, h } = p.benchIncline;
    const f2 = [from[0] + n[0] * h, from[1] + n[1] * h], t2 = [to[0] + n[0] * h, to[1] + n[1] * h];
    const pts = [from, to, t2, f2].map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');
    g.push(`<polygon class="sk-bench" points="${pts}"/>`);
    for (const c of [f2, t2]) g.push(`<line class="sk-rig" x1="${c[0].toFixed(1)}" y1="${c[1].toFixed(1)}" x2="${c[0].toFixed(1)}" y2="${GROUND}"/>`);
  }
  g.push(fixed(p.fixed));

  // 主动肌：骨架之下的一层"荧光笔"。火柴人没有体积，肌肉只能标在它附着的骨头上，
  // 所以 MUSCLE_SEG 把每块肌肉映射成某根骨头的一段（比例区间）。
  if (prime.length) {
    const J = { shoulder: p.shoulder, hip: p.hip, knee: p.knee, ankle: p.ankle,
                elbow: ELBOW, wrist: HAND };
    const at = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    for (const m of prime) {
      for (const [a, b, t0, t1] of MUSCLE_SEG[m] ?? []) {
        if (!J[a] || !J[b]) continue;
        g.push(seg(at(J[a], J[b], t0), at(J[a], J[b], t1), 'sk-muscle'));
      }
    }
  }

  // 架在肩上的杠画在身体**之后**：侧视里它在头颈后方。画在前面的话，
  // 杠心到头心 14.2px 而头半径 12.5px、杠线宽 3.4px，杠必然从头颅穿过去。
  // 其余负荷（哑铃、把手、阻力垫）握在手上或顶在肢体上，仍画在前面。
  // 画在身体之后还是之前，取决于负荷**架在身上还是握在手里**，不是取决于它画成什么形状。
  // 按类型枚举的后果：figures.json 的 load_type 覆盖会悄悄改变前后关系——
  // 高脚杯深蹲把 front 覆盖成 hands，哑铃就从头后翻到头前，矩形盖在下巴上。
  const barBehind = LD && (BEHIND_POSES.has(name) || ['sled', 'plate', 'band'].includes(LD.type));
  if (barBehind) g.push(load(LD));

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
  const trunkTop = p.shoulderMid ?? p.shoulder;
  g.push(seg(trunkTop, p.hip, 'sk-trunk'));
  if (p.shoulderMid && p.shoulder2) g.push(seg(p.shoulder, p.shoulder2, 'sk-trunk'));
  g.push(seg(p.hip, p.knee));
  g.push(seg(p.knee, p.ankle));
  g.push(seg(p.heel, p.toe, 'sk-foot'));
  g.push(seg(p.shoulder, ELBOW));
  g.push(seg(ELBOW, HAND));
  g.push(`<circle class="sk-head" cx="${p.head[0]}" cy="${p.head[1]}" r="${HEAD_RADIUS}"/>`);
  // 面部标记。没有它，实心圆的头不带任何朝向信息，读者判断不了人面向哪边——
  // 站姿还能靠脚的形状反推，坐姿和卧姿里脚被器械挡着就完全看不出来。
  g.push(renderFace(name, p));
  g.push(seg(trunkTop, [p.head[0] - 5, p.head[1] + 9], 'sk-neck'));

  for (const j of ['shoulder', 'hip', 'knee', 'ankle']) {
    g.push(`<circle class="sk-joint" cx="${p[j][0]}" cy="${p[j][1]}" r="3.2"/>`);
  }
  g.push(`<circle class="sk-joint" cx="${ELBOW[0]}" cy="${ELBOW[1]}" r="3.2"/>`);
  g.push(`<circle class="sk-hand" cx="${HAND[0]}" cy="${HAND[1]}" r="4"/>`);

  if (!barBehind) g.push(load(LD));

  if (plumb && LD && p.heel && p.toe) {
    const bx = LD.at[0];
    g.push(`<line class="sk-plumb" x1="${bx}" y1="${LD.at[1]}" x2="${bx}" y2="${GROUND + 8}"/>`);
    g.push(`<line class="sk-midfoot" x1="${MIDFOOT}" y1="${GROUND - 4}" x2="${MIDFOOT}" y2="${GROUND + 8}"/>`);
  }

  const box = opts.box;
  const cap = caption
    ? `<text class="sk-caption" x="${box ? box.x + box.w / 2 : FIG_W / 2}" y="${box ? box.y + 15 : 18}">${caption}</text>`
    : '';
  return cap + g.join('');
}

/** 一个动作的两帧（起止位置）。 */
export function renderSkeleton(fig, nameZh, prime = [], slug = '') {
  // 自重动作把模板里的负荷摘掉——照着画一副不存在的杠铃，就是在教错东西
  const strip = (p) => (fig.no_load && p ? { ...p, load: undefined } : p);
  const a = strip(POSES[fig.start]);
  const b = strip(POSES[fig.end ?? fig.start]);
  const plumb = fig.plumb !== false && !fig.no_load;
  const boxes = [contentBox(a, { plumb, loadType: fig.load_type })];
  if (b && b !== a) boxes.push(contentBox(b, { plumb, loadType: fig.load_type }));
  const x0 = Math.min(...boxes.map((x) => x.x));
  const y0 = Math.min(...boxes.map((x) => x.y));
  const x1 = Math.max(...boxes.map((x) => x.x + x.w));
  const y1 = Math.max(...boxes.map((x) => x.y + x.h));
  const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  // 动画格的框不等于两张静态图的并集：中间帧的肢体会摆到两端点之外（弧在弦之外）。
  // 用静态并集当 viewBox 的结果是中间帧被裁——实测 49 个动画里 20 个被裁，
  // 下拉最多 23px。所以动画框另算一遍，把若干中间帧也并进去。
  let animBox = box;
  if (fig.end && fig.end !== fig.start) {
    const ab = [box];
    // i 取到 16（含）：补间的 t=1 与静态结束帧可以差一两像素（俯撑家族末帧还要绕支点转一下），
    // 只并静态帧会把这点差额漏掉。
    for (let i = 1; i <= 16; i++) {
      const q = interpolate(a, b, i / 16, { plumb: fig.plumb, handPath: !!fig.hand_path });
      ab.push(contentBox(q, { plumb, loadType: fig.load_type }));
    }
    const ax0 = Math.min(...ab.map((x) => x.x)), ay0 = Math.min(...ab.map((x) => x.y));
    const ax1 = Math.max(...ab.map((x) => x.x + x.w)), ay1 = Math.max(...ab.map((x) => x.y + x.h));
    animBox = { x: ax0, y: ay0, w: ax1 - ax0, h: ay1 - ay0 };
  }
  const frame = (p, cap, key) => {
    // 横向姿态（平板、俯卧撑、臀桥、健腹轮）的包围盒宽高比接近 5:1，塞进 168px 的格子里
    // 只剩一条小横线。给宽图一个更宽的格子，不然几何对了也读不出来。
    const wide = box.w / box.h > 1.6 ? ' sk-wide' : '';
    return `<svg viewBox="${box.x.toFixed(1)} ${box.y.toFixed(1)} ${box.w.toFixed(1)} ${box.h.toFixed(1)}"`
      + ` class="sk-frame${wide}" data-pose="${key}" preserveAspectRatio="xMidYMid meet"`
      + ` role="img" aria-label="${nameZh}·${cap}">`
      + `${renderPose(p, { plumb, caption: cap, box, name: key, prime, loadType: fig.load_type })}</svg>`;
  };
  const two = fig.end && fig.end !== fig.start;
  // 动画是渐进增强：没有 JS 时这两帧静态图本身就是完整的图示。
  // data-anim 只登记"用哪两个姿态、画在哪个框里"，补间在客户端算。
  const anim = two
    ? ` data-anim="${escapeAttr(JSON.stringify({ slug, a: fig.start, b: fig.end, plumb,
        no_load: !!fig.no_load, handPath: !!fig.hand_path, box: [+animBox.x.toFixed(1), +animBox.y.toFixed(1), +animBox.w.toFixed(1), +animBox.h.toFixed(1)],
        prime, load_type: fig.load_type ?? null }))}"`
    : '';
  return `<figure class="skeleton" data-exercise="${nameZh}"${anim}>`
    + frame(a, fig.cap_start ?? '起始', fig.start)
    + (two ? frame(b, fig.cap_end ?? '结束', fig.end) : '')
    + `<figcaption>${fig.note ?? '示意图：关节位置按本卡自检判据摆放，非写实插画。'}</figcaption>`
    + '</figure>';
}
