// 关节角报表：每个动作在 u=0/0.5/1 取渲染用的 3D 关节，输出可与资料范围对表的角度。
// 用法：node tools/audit-angles.mjs。方法论见 docs/methodology/figure-correctness.md §3.2。
// fore⊥ = 前臂（腕→肘）侧视相对竖直向上的带符号角 / 3D 总夹角；推类手在肘上方时 180 即竖直。
// elb 肘角、armTor 上臂与躯干、tor 躯干侧视相对竖直、shin 小腿侧视相对竖直、knee 膝角、hip 髋角。
import { POSES } from '../src/render/skeleton.mjs';
import { orbitLift, ORBIT_PARAMS } from '../src/render/orbit.mjs';
import { interpolate } from '../src/render/interp.mjs';
import fs from 'fs';
const figs = JSON.parse(fs.readFileSync(new URL('../data/figures.json', import.meta.url)));
const sub=(a,b)=>a.map((x,i)=>x-(b[i]??0)); const L=(v)=>Math.hypot(...v);
const ang=(a,b)=>Math.acos(Math.max(-1,Math.min(1,a.reduce((s,x,i)=>s+x*b[i],0)/L(a)/L(b))))*180/Math.PI;
const vert=(v)=>ang(v,[0,-1,0]); // 0 = 指向上
const sagV=(v)=>Math.atan2(v[0],-v[1])*180/Math.PI; // 侧视相对竖直（向上为0），带符号
const r=(x)=>Math.round(x);
for (const [slug,f] of Object.entries(figs)) {
  if (ORBIT_PARAMS[slug]?.view) continue;
  const strip=(p)=>(f.no_load&&p?{...p,load:undefined}:p);
  const a=strip(POSES[f.start]), b=strip(POSES[f.end??f.start]);
  const out=[];
  for (const u of (f.end&&f.end!==f.start)?[0,0.5,1]:[0]) {
    const p=interpolate(a,b,u,{plumb:f.plumb,handPath:!!f.hand_path});
    const J=orbitLift(slug,{a:f.start,b:f.end??f.start},p,u,f.load_type);
    const N=(k)=>J[k+'N'];
    const fore=sub(N('elbow'),N('wrist')), up=sub(N('elbow'),N('shoulder')), tor=sub(J.neck,J.pelvis);
    const shin=sub(N('knee'),N('ankle')), thigh=sub(N('hip'),N('knee'));
    const elbow=ang(sub(N('shoulder'),N('elbow')),sub(N('wrist'),N('elbow')));
    const knee=ang(sub(N('hip'),N('knee')),sub(N('ankle'),N('knee')));
    const hip=ang(sub(J.neck,J.pelvis),sub(N('knee'),N('hip')));
    const armTorso=ang(up,sub(J.pelvis,J.neck));
    out.push(`u${u}: fore⊥${r(sagV(fore))}/${r(vert(fore))} elb${r(elbow)} armTor${r(armTorso)} tor${r(sagV(tor))} shin${r(sagV(shin))} knee${r(knee)} hip${r(hip)}`);
  }
  console.log(slug.padEnd(32), out.join(' | '));
}
