// src/safety-canon.mjs —— docs/safety-canon.md 的机器可读镜像，是校验侧的唯一事实源
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const norm = (s) => s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim(); // 展示用：保留词间单空格
const key = (s) => s.replace(/\*\*/g, '').replace(/\s+/g, ''); // 比对用：空白全剔

/** 解析 docs/safety-canon.md，返回 { C1: '…', C2: '…', C3: '…', C4: '…', C5: '…' } */
export async function loadSafetyCanon(root) {
  const md = await readFile(path.join(root, 'docs/safety-canon.md'), 'utf8');
  const map = {};
  // JS 没有 \Z，末尾用 $(?![\s\S]) 断言真正的字符串结尾，否则最后一条（C5）会漏解析
  for (const m of md.matchAll(/^##[ \t]*(C[1-5])[^\n]*\n([\s\S]*?)(?=^##[ \t]|$(?![\s\S]))/gm)) {
    map[m[1]] = norm(m[2]);
  }
  for (const k of ['C1', 'C2', 'C3', 'C4', 'C5']) {
    if (!map[k]) throw new Error(`docs/safety-canon.md 缺少 ${k} 小节`);
  }
  return map;
}

/** 校验一段文本是不是对某条口径的合法引用 */
export function isCanonRef(text, canon, id) {
  if (typeof text !== 'string' || !text.trim()) return false;
  if (text.trim() === `canon:${id}`) return true;
  return key(text) === key(canon[id]);
}

/** 渲染期把 `canon:Cx` 展开为原句；非引用形式原样返回 */
export function expandCanon(text, canon) {
  const m = /^canon:(C[1-5])$/.exec(String(text).trim());
  return m ? canon[m[1]] : text;
}
