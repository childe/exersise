import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateClaims } from './validate/claims.mjs';
import { validateExercises, validateCoverage } from './validate/exercises.mjs';
import { validatePlans } from './validate/plans.mjs';
import { loadSafetyCanon } from './safety-canon.mjs';

async function readJson(root, rel) {
  const file = path.join(root, rel);
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    throw new Error(`${rel}: 无法读取 (${err.code})`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${rel}: JSON 解析失败 — ${err.message}`);
  }
}

export async function loadData(root) {
  const [claims, exercises, plans, demos, quiz, chapters] = await Promise.all([
    readJson(root, 'data/claims.json'),
    readJson(root, 'data/exercises.json'),
    readJson(root, 'data/plans.json'),
    readJson(root, 'data/demos.json'),
    readJson(root, 'data/quiz.json'),
    readJson(root, 'content/chapters.json'),
  ]);
  const errs = [...validateClaims(claims)];
  const ctx = {
    claims: new Set(claims.map((c) => c.id)),
    demos: new Set(demos.map((d) => d.id)),
    chapters: new Set(chapters.map((c) => c.id)),
    exercises: new Set(exercises.map((e) => e.slug)),
  };
  errs.push(...validateExercises(exercises, ctx));
  if (process.env.SKIP_COVERAGE !== '1') errs.push(...validateCoverage(exercises));
  const safetyCanon = await loadSafetyCanon(root); // 缺小节直接抛错，构建失败
  errs.push(...validatePlans(plans, {
    ...ctx,
    exercises: new Set(exercises.map((e) => e.slug)),
    plans: new Set(plans.map((p) => p.slug)),
    safetyCanon,
  }));
  if (errs.length) throw new Error(`数据校验失败:\n- ${errs.join('\n- ')}`);
  return { claims, exercises, plans, demos, quiz, chapters, safetyCanon };
}
