// 主动肌 → 骨架线段的映射。
//
// 火柴人没有体积，肌肉只能标在它附着的那根骨头上。每项是
// [起点关节, 终点关节, 起始比例, 结束比例]——比例把一根线截出一段，
// 例如臀标在躯干末段加大腿首段，正好夹住髋关节。
export const MUSCLE_SEG = {
  股四头: [['hip', 'knee', 0, 1]],
  腘绳:   [['hip', 'knee', 0, 1]],
  臀:     [['shoulder', 'hip', 0.82, 1], ['hip', 'knee', 0, 0.22]],
  小腿:   [['knee', 'ankle', 0, 1]],
  核心:   [['shoulder', 'hip', 0.3, 1]],
  下背:   [['shoulder', 'hip', 0.58, 1]],
  上背:   [['shoulder', 'hip', 0, 0.46]],
  胸:     [['shoulder', 'hip', 0, 0.4]],
  肱二头: [['shoulder', 'elbow', 0, 1]],
  肱三头: [['shoulder', 'elbow', 0, 1]],
  前束:   [['shoulder', 'elbow', 0, 0.38]],
  中束:   [['shoulder', 'elbow', 0, 0.38]],
  后束:   [['shoulder', 'elbow', 0, 0.38]],
};
export const MUSCLE_SEG_NAMES = Object.keys(MUSCLE_SEG);
