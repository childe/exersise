import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { loadChapters } from '../src/render/chapters.mjs';
import { validateChapters, validateChapterList } from '../src/validate/chapters.mjs';

const root = path.resolve(import.meta.dirname, '..');

const good = [{ num: 2, id: 'ch2', title: '训练变量', html: `
<section class="chapter" id="ch2"><h2>第 2 章 训练变量</h2><p>正文</p>
<section class="selfcheck"><h3>这章让你能回答的问题</h3><ul><li>a</li><li>b</li><li>c</li></ul></section>
<section class="exercise-task"><h3>练习任务</h3><p>记录一次训练的七个变量</p>
<details class="model-answer"><summary>参考答案与判断要点</summary><p>合格回答</p><ul><li>判断要点：逐项给出数值</li></ul></details>
</section></section>` }];

test('合规章节通过', () => {
  assert.deepEqual(validateChapters(good), []);
});

test('缺自测清单被拒', () => {
  const bad = [{ ...good[0], html: good[0].html.replace(/<section class="selfcheck">[\s\S]*?<\/section>/, '') }];
  assert.ok(validateChapters(bad).some((e) => e.includes('selfcheck')));
});

test('缺练习任务被拒', () => {
  const bad = [{ ...good[0], html: good[0].html.replace(/<section class="exercise-task">[\s\S]*?$/, '</section>') }];
  assert.ok(validateChapters(bad).some((e) => e.includes('exercise-task')));
});

test('练习任务缺参考答案被拒', () => {
  const bad = [{ ...good[0], html: good[0].html.replace(/<details class="model-answer">[\s\S]*?<\/details>/, '') }];
  assert.ok(validateChapters(bad).some((e) => e.includes('model-answer')));
});

test('章节根元素 id 必须与清单一致', () => {
  const bad = [{ ...good[0], html: good[0].html.replace('id="ch2"', 'id="chapter-2"') }];
  assert.ok(validateChapters(bad).some((e) => e.includes('ch2')));
});

test('仓库内 11 章全部存在且合规（内容任务完成后必须为空）', async () => {
  const chapters = JSON.parse(await readFile(path.join(root, 'content/chapters.json'), 'utf8'));
  assert.equal(chapters.length, 11);
  assert.deepEqual(validateChapterList(chapters), []);
  if (process.env.CHAPTERS_WIP === '1') return;
  const loaded = await loadChapters(root, chapters);
  assert.deepEqual(validateChapters(loaded), []);
});
