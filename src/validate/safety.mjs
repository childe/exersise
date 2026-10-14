// 自由文本的正则扫描**不能证明内容安全**——它分不清"做法"与"禁令／引用／纠错"。
// 因此扫描分两层：
//   hard：确定性规则，命中即构建失败。只放无论语境都不该出现的东西。
//   soft：语境敏感的关键词命中，产出待复核提示，由人工安全验收逐条判定；
//         它不让构建失败，也不作为"内容安全"的证据。
// 真正起确定性作用的是结构化字段校验（safety.collars / pain_path / failure_rules / substitutions.scope）。

// 否定／引用／纠错语境：命中点所在句子里出现这些词时，不计为"建议这么做"
const NEGATION_RE = /(禁止|严禁|不得|不要|不可|不应|不能|绝不|切勿|无例外|反例|错误(示范|做法|说法)|常见误区|有人说|不是|并非|不含|不包含|不涉及|不走|未(使用|采用|包含))/;

// 取命中点所在的整句（以 。！？；\n 和 HTML 标签边界切分）用于否定判定
function sentenceAround(text, index) {
  const start = Math.max(0, text.lastIndexOf('。', index), text.lastIndexOf('；', index),
                         text.lastIndexOf('\n', index), text.lastIndexOf('>', index));
  const tail = text.slice(index).search(/[。；！？\n<]/);
  return text.slice(start, tail === -1 ? text.length : index + tail);
}

const HARD_RULES = [
  { re: /<img[^>]+src="data:image\/(png|jpe?g|webp)/g,
    msg: '内嵌 data: 位图（§9.1-9）：动作示范走外部核验链接，概念图走内联 SVG，肌肉分布图托管 OSS 并在 data/anatomy.json 登记（§7.5）' },
  { re: /(待撰写|待补充|TODO|TBD|lorem ipsum)/gi,
    msg: '存在未完成的占位内容' },
];

const SOFT_RULES = [
  { re: /(不上|免|不用|无需|可不|没必要上)\s*卡扣/g,
    msg: '出现"不上卡扣"字样（§5.1 / §9.3-11d）——确认是禁令／纠错而不是建议' },
  // 「换动作」的写法很多（换一个动作／换个同模式动作／换别的动作），用有界通配而不是穷举
  { re: /(疼痛|疼|痛)[^。；\n]{0,24}(deload|减量|降(重|重量)|减(重|重量)|换[^。；\n]{0,6}动作)[^。；\n]{0,16}(继续|接着|再练|练)/g,
    msg: '疼痛与疲劳调整规则同句出现（§9.3-11e）——确认疼痛仍导向停止该动作与第 9 章就医判断' },
  { re: /(deload|减量|降重)[^。；\n]{0,16}(来|以)?(处理|应对|缓解)[^。；\n]{0,8}(疼痛|疼|痛)/g,
    msg: '把 deload／减量与疼痛处理并提（§9.3-11e）——确认是否定句' },
  { re: /(AI\s*生成|由\s*AI\s*绘制|gpt-image|midjourney|stable\s*diffusion)/gi,
    msg: '出现 AI 生成图字样（§7.2.1 / §7.5）——动作图不得使用；肌肉分布图须已在 data/anatomy.json 登记' },
  { re: /占位/g, msg: '出现"占位"字样——确认是在讲占位符机制而不是遗留未写内容' },
];

function hits(html, rules, { skipNegated }) {
  const out = [];
  for (const { re, msg } of rules) {
    for (const m of html.matchAll(re)) {
      if (skipNegated && NEGATION_RE.test(sentenceAround(html, m.index))) continue;
      const start = Math.max(0, m.index - 40);
      out.push(`${msg} —— 命中「${html.slice(start, m.index + m[0].length + 40).replace(/\s+/g, ' ')}」`);
    }
  }
  return out;
}

/** 构建闸门：只有 hard 规则。 */
export function scanSafety(html) {
  return hits(html, HARD_RULES, { skipNegated: false });
}

/** 人工安全验收的待复核清单：soft 规则，且已剔除明确的否定／引用／纠错语境。 */
export function scanSafetyReview(html) {
  // 已登记的肌肉分布图（spec §7.5）如实写着「AI 生成」。它们是否合规由 validateImages
  // 对登记表做确定性校验，不需要再进人工待复核——否则每张图每次构建都冒一条噪音。
  // 只剔除我们自己渲染出来的 <figure class="anat">，正文里别处出现的字样照扫不误。
  // 图谱开头那句如实交代「AI 生成底图」的声明（<p class="atlas-note">）同理。
  const scanned = html
    .replace(/<figure class="anat(?: tall)?">[\s\S]*?<\/figure>/g, '')
    .replace(/<p class="atlas-note">[\s\S]*?<\/p>/g, '');
  return hits(scanned, SOFT_RULES, { skipNegated: true });
}
