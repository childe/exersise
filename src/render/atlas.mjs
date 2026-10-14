import { anatFigure } from './tokens.mjs';

// 参考库「肌肉图谱」：全局图在前（在哪），部位图在后（分几束、起止在哪）。
// 动作模式图不在这里——它们配在第 4 章 4.2 正文里，这里只给一个入口。
const ORDER = ['全局', '部位'];

export function renderAtlas(anatomy) {
  const groups = ORDER.map((kind) => anatomy.filter((a) => a.kind === kind));
  if (!groups.flat().length) return '';
  const [global, parts] = groups;
  return `<section id="atlas"><h2>肌肉图谱</h2>
<p class="atlas-lede">先看全身两张：哪块肌肉在哪。再看部位图：每块肌肉分几束、在教程里被哪些动作当作主动肌来练。
按动作看发力，见<a class="xref" href="#ch4">第 4 章</a> 4.2 的 8 张动作模式图。</p>
<p class="atlas-note">部位图里的颜色只用来区分不同肌肉与分束，不表示发力程度；
所有图都是 AI 生成底图、中文标注人工撰写，仅供看分布，起止点与层次以正文为准。</p>
${global.map(anatFigure).join('\n')}
<h3>部位</h3>
${parts.map(anatFigure).join('\n')}
</section>`;
}
