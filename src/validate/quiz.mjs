const CATEGORIES = ['选动作', '调计划', '停滞分析', '指导边界'];

export function validateQuiz(quiz, { chapters }) {
  const errs = [];
  if (!Array.isArray(quiz)) return ['data/quiz.json: 顶层必须是数组'];
  const seen = new Set();
  quiz.forEach((q, i) => {
    const at = `data/quiz.json[${i}] (${q?.id ?? '无 id'})`;
    if (!/^q-[a-z0-9-]+$/.test(q?.id ?? '')) errs.push(`${at}: id 必须是 q-<slug>`);
    else if (seen.has(q.id)) errs.push(`${at}: id 重复`);
    else seen.add(q.id);
    if (!CATEGORIES.includes(q?.category)) errs.push(`${at}: category 必须是 ${CATEGORIES.join('/')}`);
    if (!q?.scenario || q.scenario.length < 20) errs.push(`${at}: scenario 必须给足情境信息`);
    if (!q?.model_answer) errs.push(`${at}: model_answer 必填（参考答案）`);
    if (!(q?.judging_points ?? []).length) errs.push(`${at}: judging_points 必填（判断要点）`);
    const refs = q?.reasoning_chapters ?? [];
    if (!refs.length) errs.push(`${at}: reasoning_chapters 必填——答案必须能从某章原理推出`);
    refs.forEach((r) => { if (!chapters.has(r)) errs.push(`${at}: reasoning_chapters 指向不存在的章节 ${r}`); });
  });
  if (quiz.length < 12) errs.push(`data/quiz.json: 至少 12 道，当前 ${quiz.length}`);
  for (const c of CATEGORIES) {
    const n = quiz.filter((q) => q.category === c).length;
    if (n < 3) errs.push(`data/quiz.json: 类别「${c}」至少 3 道，当前 ${n}`);
  }
  return errs;
}
