import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const ch0 = await readFile(path.join(root, 'content/ch0.html'), 'utf8');

test('导读含红旗征速查，覆盖 §5.1 列出的全部征象', () => {
  assert.match(ch0, /<section class="red-flags"/);
  for (const s of ['胸痛', '晕厥', '静息呼吸困难', '夜间痛醒', '外伤后', '鞍区麻木', '体重骤降']) {
    assert.ok(ch0.includes(s), `红旗征缺少「${s}」`);
  }
  assert.match(ch0, /立即停(止|练).*就医|立即就医/);
});

test('导读含「第一次训练前必读」七项', () => {
  const sec = ch0.match(/<section class="first-session">([\s\S]*?)<\/section>/)?.[1];
  assert.ok(sec, '缺少 first-session 小节');
  for (const [k, re] of [
    ['先做什么', /体检|咨询/],
    ['器械设置通则', /卡扣必上|卡扣必须上紧/],
    ['保护杆高度', /空杆实测/],
    ['失败退出方式', /没练过退出方式[^。]*不做/],
    ['卧推硬性前置', /保护杆[\s\S]{0,80}保护者[\s\S]{0,120}(都没有|两者都没)[\s\S]{0,40}不做/],
    ['首次负荷', /第一次不测极限/],
    ['练中不适', /疼痛不是("|「)?减量继续/],
  ]) {
    assert.match(sec, re, `「第一次训练前必读」缺少：${k}`);
  }
});

test('导读说明证据分级是两维且三种方向', () => {
  for (const s of ['支持', '反对', '未定', '高', '中', '低']) assert.ok(ch0.includes(s));
  assert.match(ch0, /absence of evidence|没有证据.*不等于/);
});

test('导读给出术语地图与两轨使用说明', () => {
  assert.match(ch0, /<section class="glossary"|术语/);
  assert.match(ch0, /学习路径[\s\S]{0,200}参考库/);
});

test('导读不含任何免卡扣表述与疼痛减量说法', () => {
  assert.doesNotMatch(ch0, /(不上|免|不用|无需|可不)\s*卡扣/);
  // 注意：这条必须放过"疼痛不是减量继续的信号"这类**否定句**——否则它会和上面
  //「练中不适」那一条（要求出现这句否定）直接冲突。用否定前瞻把denial语境排除掉，
  // 留下真正要禁的"痛了就减量继续练"。
  assert.doesNotMatch(ch0, /(疼痛|痛)(?!不是)[^。]{0,20}(减量|降重|deload)[^。]{0,20}继续/);
});
