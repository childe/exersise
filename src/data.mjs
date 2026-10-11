import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateClaims } from './validate/claims.mjs';

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
  if (errs.length) throw new Error(`数据校验失败:\n- ${errs.join('\n- ')}`);
  return { claims, exercises, plans, demos, quiz, chapters };
}
