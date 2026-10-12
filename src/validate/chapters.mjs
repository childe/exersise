/**
 * 逐章校验结构。**不在这里查"共 11 章"**——本函数要能校验任意子集（单章、几章），
 * 章数齐备是 `validateChapterList` 的职责，由 build 对 content/chapters.json 调用。
 */
export function validateChapters(loaded) {
  const errs = [];
  loaded.forEach((c) => {
    const at = `content/${c.file ?? c.id}`;
    if (!new RegExp(`<section class="chapter" id="${c.id}"`).test(c.html)) {
      errs.push(`${at}: 根元素必须是 <section class="chapter" id="${c.id}">`);
    }
    if (!/<section class="selfcheck">[\s\S]*?这章让你能回答的问题/.test(c.html)) {
      errs.push(`${at}: 缺少 selfcheck 小节（"这章让你能回答的问题"自测清单）`);
    } else {
      const items = (c.html.match(/<section class="selfcheck">([\s\S]*?)<\/section>/)?.[1].match(/<li>/g) ?? []).length;
      if (items < 3) errs.push(`${at}: selfcheck 自测清单至少 3 条，当前 ${items}`);
    }
    const task = c.html.match(/<section class="exercise-task">([\s\S]*?)<\/section>\s*<\/section>/)?.[1];
    if (!task) errs.push(`${at}: 缺少 exercise-task 小节（练习任务）`);
    else if (!/<details class="model-answer">[\s\S]*?判断要点/.test(task)) {
      errs.push(`${at}: exercise-task 缺少 model-answer（参考答案与判断要点）`);
    }
  });
  return errs;
}

/** 章节清单本身的完整性：第 0–10 章齐备、编号连续、id 与编号一致（§9.1-1）。 */
export function validateChapterList(chapters) {
  const errs = [];
  if (chapters.length !== 11) {
    errs.push(`content/chapters.json: 必须是第 0–10 章共 11 章，当前 ${chapters.length}`);
  }
  chapters.forEach((c, i) => {
    if (c.num !== i) errs.push(`content/chapters.json[${i}]: num 必须按 0–10 顺序排列，当前 ${c.num}`);
    if (c.id !== `ch${c.num}`) errs.push(`content/chapters.json[${i}]: id 必须是 ch${c.num}`);
  });
  return errs;
}
