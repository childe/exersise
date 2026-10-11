import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from '../src/build.mjs';

const root = path.resolve(import.meta.dirname, '..');

test('每个动作的 chapter_refs 在产物中都是可点回链', async () => {
  const html = await build(root);
  const exercises = JSON.parse(await readFile(path.join(root, 'data/exercises.json'), 'utf8'));
  for (const e of exercises) {
    const card = html.match(new RegExp(`<article class="ex-card" id="ex-${e.slug}"[\\s\\S]*?</article>`))?.[0];
    assert.ok(card, `产物缺少 ${e.slug} 的卡`);
    for (const ref of e.chapter_refs) assert.ok(card.includes(`href="#${ref}"`), `${e.slug} 缺到 ${ref} 的回链`);
  }
});

test('第 4 章正链到动作库、第 5 章正链到计划模板', async () => {
  const ch4 = await readFile(path.join(root, 'content/ch4.html'), 'utf8');
  const ch5 = await readFile(path.join(root, 'content/ch5.html'), 'utf8');
  for (const p of ['推', '拉', '蹲', '髋铰链', '搬运', '核心抗阻']) {
    assert.ok(ch4.includes(p), `第 4 章未覆盖模式「${p}」`);
  }
  assert.ok((ch4.match(/\{\{ex:/g) ?? []).length >= 6, '第 4 章应为六大模式各举至少一个动作链接');
  assert.ok((ch5.match(/\{\{plan:/g) ?? []).length >= 5, '第 5 章应链到全部五套模板');
});

test('第 3 章使用 SRA 概念图', async () => {
  const ch3 = await readFile(path.join(root, 'content/ch3.html'), 'utf8');
  assert.ok(ch3.includes('{{fig:sra-curve}}'));
});
