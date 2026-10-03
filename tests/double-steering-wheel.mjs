#!/usr/bin/env node
// Structural CSS arithmetic and real input events. No browser/GPU/touch claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createInputDom } from './fixtures/vehicle-input-dom.mjs';
import { createVehicleInput } from '../dist/vehicle-input.js';
import { createLookInput } from '../dist/look-input.js';
const css = fs.readFileSync(new URL('../dist/vehicle-controls.css', import.meta.url), 'utf8');
const rules = [];
function parse(source, media = []) {
  let offset = 0;
  while (offset < source.length) {
    const open = source.indexOf('{', offset); if (open < 0) break;
    const selector = source.slice(offset, open).trim(); let end = open + 1, depth = 1;
    while (depth) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; end++; }
    const body = source.slice(open + 1, end - 1);
    if (selector.startsWith('@media')) parse(body, [...media, selector]);
    else for (const s of selector.split(',')) {
      const properties = Object.fromEntries(body.split(';').filter(p => p.includes(':')).map(p => {
        const at = p.indexOf(':'); return [p.slice(0, at).trim(), p.slice(at + 1).trim()];
      }));
      rules.push({ selector: s.trim(), media, properties,
        specificity: (s.match(/\.[\w-]+|:[\w-]+/g) || []).length + (s.match(/#[\w-]+/g) || []).length * 100 });
    }
    offset = end;
  }
}
parse(css.replace(/\/\*[\s\S]*?\*\//g, ''));
function matchesMedia(media, w, h) {
  return media.every(m => !m.includes('prefers-reduced-motion') && [...m.matchAll(/(min|max)-(width|height):\s*(\d+)px/g)].every(([, op, axis, n]) => op === 'min' ? (axis === 'width' ? w : h) >= +n : (axis === 'width' ? w : h) <= +n));
}
function cascade(selectors, w, h) {
  return Object.assign({}, ...rules.filter(r => selectors.includes(r.selector) && matchesMedia(r.media, w, h)).sort((a,b) => a.specificity - b.specificity).map(r => r.properties));
}
function value(expression, vars, w, h, safe) {
  let source = expression.replace(/var\((--[\w-]+)\)/g, (_, name) => `(${value(vars[name], vars, w, h, safe)})`)
    .replace(/env\(safe-area-inset-(\w+)(?:,\s*0px)?\)/g, (_, edge) => safe[edge] || 0)
    .replace(/([\d.]+)(cqw|cqh|px)/g, (_, n, unit) => +n * (unit === 'cqw' ? w / 100 : unit === 'cqh' ? h / 100 : 1));
  source = source.replace(/\bcalc\(/g, '(').replace(/\bmin\(/g, 'Math.min(').replace(/\bmax\(/g, 'Math.max(').replace(/\bclamp\(/g, 'clamp(');
  assert.match(source, /^[\d\s.+*/(),a-zA-Z-]+$/, expression);
  return Function('clamp', `return (${source})`)((min, x, max) => Math.max(min, Math.min(x, max)));
}
const overlaps = (a,b) => a.x < b.x+b.w-1e-8 && a.x+a.w > b.x+1e-8 && a.y < b.y+b.h-1e-8 && a.y+a.h > b.y+1e-8;
const reports = [];
for (const [w,h] of [[320,480],[320,568],[360,640],[375,667],[390,844],[500,700],[540,960],[760,600],[844,390],[568,320],[501,320],[1366,768]]) {
  for (const safe of [{top:0,right:0,bottom:0,left:0},{top:21,right:44,bottom:34,left:44},{top:0,right:0,bottom:21,left:44},{top:47,right:0,bottom:34,left:0}]) {
    const root = cascade(['.vehicle-controls'], w, h), get = expression => value(expression, root, w, h, safe);
    const box = selectors => {
      const style = cascade(selectors, w, h), width = get(style.width), height = get(style.height);
      return { x: style.left ? get(style.left) : w - get(style.right) - width, y: h-get(style.bottom)-height, w: width, h: height };
    };
    const wheel = box(['.steering-wheel']);
    const gas = box(['.gas-pedal','.vehicle-controls:has(.reverse-pedal) .gas-pedal','.vehicle-controls:has(.reverse-pedal) .gas-pedal:not(.reverse-pedal)']);
    const reverse = box(['.gas-pedal','.reverse-pedal','.vehicle-controls:has(.reverse-pedal) .gas-pedal']);
    const row = {x:safe.left+12,y:h-safe.bottom-56,w:w-safe.left-safe.right-24,h:44};
    // Full wallet/brain height is reserved, not just the clickable top icons.
    const top = {x:safe.left,y:safe.top,w:w-safe.left-safe.right,h:get(root['--wheel-top-clearance'])-safe.top};
    const target = get(root['--steering-requested']);
    assert.equal(target, get(root['--steering-base']) * 2);
    assert.equal(wheel.w, wheel.h); assert.ok(wheel.w > 44);
    assert.equal(wheel.w, Math.min(target, get(root['--wheel-width-limit']), h-get(root['--wheel-bottom'])-get(root['--wheel-top-clearance'])));
    assert.ok(!overlaps(wheel, top), `${w}×${h}: top HUD`);
    for (const [name,b] of [['wheel',wheel],['gas',gas],['reverse',reverse]]) {
      assert.ok(b.x >= safe.left && b.x+b.w <= w-safe.right && b.y >= safe.top && b.y+b.h <= h-safe.bottom, `${w}×${h} ${name}: safe area ${JSON.stringify(b)}`);
      assert.ok(!overlaps(b,row), `${w}×${h} ${name}: fuel/speed`);
    }
    assert.ok(!overlaps(wheel,gas) && !overlaps(wheel,reverse) && !overlaps(gas,reverse), `${w}×${h}: separate controls`);
    assert.ok(gas.h >= 44 && reverse.h >= 44);
    if (w <= 500 && h >= 541) {
      const biome = box(['.is-driving #biome-button']);
      for (const b of [wheel,gas,reverse,row]) assert.ok(!overlaps(biome,b), `${w}×${h}: portrait biome control`);
    }
    if (w >= 501 && h <= 420) {
      const biome={x:w/2+4,y:h-safe.bottom-188,w:48,h:48};
      assert.ok(!overlaps(wheel,biome), `${w}×${h}: landscape biome control`);
    }
    if (!Object.values(safe).some(Boolean) && [[360,640],[375,667],[390,844],[540,960],[1366,768]].some(([x,y])=>x===w&&y===h)) assert.equal(wheel.w,target,'full 2× whenever it fits');
    reports.push({viewport:`${w}×${h}`,safe,requested:target,actual:wheel.w});
  }
}
assert.equal(cascade(['.steering-wheel'],390,844).transform,'none');
assert.equal(cascade(['.steering-wheel-image'],390,844).transform,'rotate(var(--steering-angle, 0deg))');
assert.equal(cascade(['.steering-wheel-image'],390,844)['pointer-events'],'none');
assert.doesNotMatch(css, /#walk-stick|#walk-thumb/);
console.log(`PASS actual CSS declarations: ${reports.length} portrait/landscape/safe-area cases; 2× target and explicit collision caps, fuel, D/R, biome and HUD clearance.`);
for (const r of reports.filter(r=>!Object.values(r.safe).some(Boolean))) console.log(`${r.viewport}: ${r.actual}px / requested ${r.requested}px${r.actual<r.requested?' (fit cap)':''}`);

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
for (const diameter of [224,264,370]) {
  const dom=createInputDom(), {win,doc,root,wheel,image,pedal}=dom, Element=wheel.constructor;
  const reverse=root.append(new Element(['gas-pedal','reverse-pedal'])), canvas=new Element(); canvas.ownerDocument=doc;
  wheel.bounds={left:8,top:150,width:diameter,height:diameter};wheel.clientWidth=diameter;
  win.getComputedStyle=e=>({transform:e.computedTransform??(e===image?`rotate(${wheel.style.getPropertyValue('--steering-angle')||'0deg'})`:'none')});
  const gears=[],api=createVehicleInput({root,onGear:g=>gears.push(g)});let looks=0;
  const look=createLookInput({canvas,onDelta:()=>looks++});
  const p=(target,type,id,degrees=0,radius=diameter*.45)=>{const b=wheel.bounds,r=degrees*Math.PI/180;return target.dispatch(type,{pointerId:id,button:0,clientX:b.left+b.width/2+radius*Math.cos(r),clientY:b.top+b.height/2+radius*Math.sin(r)});};
  try {
    p(wheel,'pointerdown',1,0);p(wheel,'pointermove',1,90);near(api.state.steering,2/3);assert.equal(api.state.active,false);
    p(pedal,'pointerdown',2);p(canvas,'pointerdown',3);p(canvas,'pointermove',3,45);assert.ok(looks>0);assert.equal(look.pointerId,3);assert.equal(api.state.active,true);
    p(reverse,'pointerdown',4);assert.equal(gears.at(-1),'R');p(reverse,'pointerup',4);assert.equal(gears.at(-1),'D');
    p(wheel,'pointerup',1);near(api.state.steering,0);assert.equal(api.state.active,true);
    image.computedTransform='rotate(45deg)';p(wheel,'pointerdown',5,0);near(api.state.steering,1/3);image.computedTransform=undefined;
    p(wheel,'pointermove',5,45);near(api.state.steering,2/3);
    // Orientation/resize clears all ownership; stale events cannot restart it.
    p(reverse,'pointerdown',4);win.dispatch('resize');near(api.state.steering,0);assert.equal(api.state.active,false);
    for(const e of [wheel,pedal,reverse])assert.equal(e.captures.size,0);
    wheel.bounds={left:25,top:124,width:202,height:202};wheel.clientWidth=202;
    p(wheel,'pointermove',5,-135);assert.equal(api.state.active,false);near(api.state.steering,0);
    p(wheel,'pointerdown',6,179,90);p(wheel,'pointermove',6,-179,90);near(api.state.steering,2/135);
    p(wheel,'pointermove',6,0,0);p(wheel,'pointermove',6,90,90);near(api.state.steering,2/135);
    p(wheel,'pointermove',6,135,90);near(api.state.steering,47/135);
  } finally { look.destroy();api.destroy(); }
}
console.log('PASS real angular input at 224/264/370 px: ±135° sensitivity, image-only regrab, gas/reverse/camera pointers, dead center/wrap, resize cancellation and regrab. No browser or GPU rendering claim.');
