#!/usr/bin/env node
// Production controls and app, with modeled DOM capture/targets and CSS math.
// These are renderer-free checks, not a browser or physical touchscreen test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createVehicleInput, STEERING_MAX_ANGLE } from '../dist/vehicle-input.js';
import { createLookInput } from '../dist/look-input.js';
import { createAppDom } from './fixtures/app-dom.mjs';
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
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-9, `${a} != ${b}`);
function layout(w,h,safe={top:0,right:0,bottom:0,left:0}) {
  const root=cascade(['.vehicle-controls'],w,h), get=x=>value(x,root,w,h,safe);
  const box=selectors=>{
    const style=cascade(selectors,w,h),width=get(style.width),height=get(style.height);
    return {x:style.left?get(style.left):w-get(style.right)-width,y:h-get(style.bottom)-height,w:width,h:height,style};
  };
  return {
    root,w,h,safe,padding:get(root['--steering-hit-padding']),
    wheel:box(['.steering-wheel']),
    gas:box(['.gas-pedal','.vehicle-controls:has(.reverse-pedal) .gas-pedal','.vehicle-controls:has(.reverse-pedal) .gas-pedal:not(.reverse-pedal)']),
    reverse:box(['.gas-pedal','.reverse-pedal','.vehicle-controls:has(.reverse-pedal) .gas-pedal']),
  };
}
const contains=(b,x,y)=>x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h;
const insideWheel=(l,x,y)=>Math.hypot(x-l.wheel.x-l.wheel.w/2,y-l.wheel.y-l.wheel.h/2)<=l.wheel.w/2+l.padding;
// Browser pseudo-element hits target its originating button. Pedals are sibling
// stacking contexts at z-index 1, above the wheel's filter/transform context (0).
function hit(l,x,y) {
  if(x<0||y<0||x>l.w||y>l.h) return 'outside';
  if(contains(l.reverse,x,y)) return 'reverse';
  if(contains(l.gas,x,y)) return 'pedal';
  return insideWheel(l,x,y)?'wheel':'canvas';
}
const baseCss=fs.readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');
const progressionCss=fs.readFileSync(new URL('../dist/progression-ui.css',import.meta.url),'utf8');
const pseudo=cascade(['.steering-wheel::before'],390,844);
assert.equal(pseudo.content,'""');assert.equal(pseudo.position,'absolute');
assert.equal(pseudo.inset,'calc(0px - var(--steering-hit-padding))');
assert.equal(pseudo['border-radius'],'50%');assert.equal(pseudo.background,'transparent');
assert.equal(pseudo['pointer-events'],'auto');assert.equal(pseudo['touch-action'],'none');
assert.equal(cascade(['.steering-wheel'],390,844).overflow,'visible');
assert.equal(cascade(['.steering-wheel-image'],390,844)['pointer-events'],'none');
assert.equal(cascade(['.steering-wheel'],390,844).transform,'rotate(var(--steering-angle, 0deg))');
assert.equal(cascade(['.steering-wheel-image'],390,844).transform,undefined);
assert.doesNotMatch(css,/--steering-requested|--steering-base|#walk-stick|#walk-thumb/);
// Interactive HUD and full-screen dialogs remain above the entire controls layer.
assert.match(baseCss,/\.topbar\s*\{[^}]*z-index:\s*7/s);
assert.match(baseCss,/#biome-button\s*\{[^}]*z-index:\s*8/s);
assert.match(baseCss,/#biome-menu\s*\{[^}]*z-index:\s*30/s);
assert.match(progressionCss,/#upgrade-menu\s*\{[^}]*z-index:\s*32/s);
assert.match(progressionCss,/#delivery-receipt-menu\s*\{[^}]*z-index:\s*100/s);
let cases=0;
for(const [w,h] of [[320,480],[320,568],[360,640],[375,667],[390,844],[500,700],[540,960],[760,600],[844,390],[568,320],[501,320],[1366,768]]) {
  for(const safe of [{top:0,right:0,bottom:0,left:0},{top:21,right:44,bottom:34,left:44},{top:0,right:0,bottom:21,left:44},{top:47,right:0,bottom:34,left:0}]) {
    const l=layout(w,h,safe),b=l.wheel;
    const originalDiameter=w<=500?(h<=540?112:132):h<=420?Math.min(112,h*.2875):h<=500?112:Math.max(120,Math.min(w*.35,h*.4,185));
    near(b.w,originalDiameter);near(b.h,originalDiameter);
    assert.ok(l.padding>=24&&l.padding<=40);assert.equal(l.root['pointer-events'],'none');assert.equal(l.root['z-index'],'3');
    assert.equal(l.gas.style['z-index'],'1');assert.equal(l.reverse.style['z-index'],'1');
    // Even the padded rim's lowest point stays above the fuel/speed band's top.
    assert.ok(b.y+b.h+l.padding<=h-safe.bottom-56,`${w}x${h} rim clears fuel/speed`);
    for(const [name,p] of [['pedal',l.gas],['reverse',l.reverse]]) {
      for(const dx of [.25,.5,.75])for(const dy of [.25,.5,.75]) {
        assert.equal(hit(l,p.x+p.w*dx,p.y+p.h*dy),name,`${w}x${h} ${name} remains independently tappable`);
      }
    }
    // Test available top/side/bottom rim points and the untouched canvas beyond.
    let rimPoints=0;
    for(let angle=0;angle<360;angle+=15) {
      const radians=angle*Math.PI/180,r=b.w/2+l.padding-2;
      const x=b.x+b.w/2+Math.cos(radians)*r,y=b.y+b.h/2+Math.sin(radians)*r;
      if(x>=0&&x<w&&y>=0&&y<h&&!contains(l.gas,x,y)&&!contains(l.reverse,x,y)) {
        assert.equal(hit(l,x,y),'wheel');rimPoints++;
      }
    }
    assert.ok(rimPoints>=12,`${w}x${h}: useful invisible rim`);cases++;
  }
}
console.log(`PASS ${cases} CSS layout cases: original 112/132/185 px wheel rules, 24–32 px transparent rim, fuel clearance, pedal/HUD hit priority.`);

class Target {
  constructor(){this.listeners=new Map();this.parent=null;}
  addEventListener(type,fn,options){const list=this.listeners.get(type)||[];list.push({fn,capture:options===true||!!options?.capture});this.listeners.set(type,list);}
  removeEventListener(type,fn,options){const capture=options===true||!!options?.capture;this.listeners.set(type,(this.listeners.get(type)||[]).filter(x=>x.fn!==fn||x.capture!==capture));}
  dispatch(type,values={}) {
    const event={type,target:this,cancelable:true,defaultPrevented:false,stopped:false,immediate:false,
      preventDefault(){if(this.cancelable)this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},stopImmediatePropagation(){this.stopped=this.immediate=true;},...values};
    const path=[];for(let node=this;node;node=node.parent)path.push(node);
    const call=(node,capture)=>{event.currentTarget=node;for(const h of [...(node.listeners.get(type)||[])]){if(h.capture===capture)h.fn(event);if(event.immediate)break;}};
    for(const node of [...path].reverse()){call(node,true);if(event.stopped)return event;}
    for(const node of path){call(node,false);if(event.stopped)break;}
    return event;
  }
}
class Element extends Target {
  constructor(classes=[]){
    super();this.children=[];this.dataset={};this.attributes={};this.captures=new Set();this.style={setProperty(key,value){this[key]=value;}};
    const names=new Set(classes);this.classList={contains:x=>names.has(x),add:x=>names.add(x),remove:x=>names.delete(x),toggle(x,force){const wanted=force??!names.has(x);if(wanted)names.add(x);else names.delete(x);return wanted;}};
  }
  append(child){this.children.push(child);child.parent=this;child.ownerDocument=this.ownerDocument;return child;}
  querySelector(selector){for(const child of this.children){if(child.classList.contains(selector.slice(1)))return child;const nested=child.querySelector(selector);if(nested)return nested;}return null;}
  setAttribute(k,v){this.attributes[k]=String(v);}
  getAttribute(k){return this.attributes[k]??null;}
  getBoundingClientRect(){
    const b=this.bounds;if(!this.classList.contains('steering-wheel'))return b;
    const radians=parseFloat(this.style['--steering-angle']||0)*Math.PI/180;
    const size=this.clientWidth*(Math.abs(Math.cos(radians))+Math.abs(Math.sin(radians)));
    return {left:b.left+(b.width-size)/2,top:b.top+(b.height-size)/2,width:size,height:size};
  }
  setPointerCapture(id){if(this.captureFails)throw Error('Capture unavailable');this.captures.add(id);this.ownerDocument.captures.set(id,this);}
  hasPointerCapture(id){return this.captures.has(id);}
  releasePointerCapture(id){this.captures.delete(id);this.ownerDocument.captures.delete(id);this.dispatch('lostpointercapture',{pointerId:id});}
  closest(){return this.isContentEditable?this:this.parent?.closest?.()??null;}
}
function setup({width=390,height=844,captureFails=false,lookFirst=false}={}) {
  const l=layout(width,height),win=new Target(),doc=new Target();doc.defaultView=win;doc.parent=win;doc.captures=new Map();doc.hidden=false;
  const body=new Element();body.ownerDocument=doc;body.parent=doc;doc.body=body;
  const canvas=body.append(new Element()),root=body.append(new Element());
  const wheel=root.append(new Element(['steering-wheel'])),image=wheel.append(new Element(['steering-wheel-image']));
  const pedal=root.append(new Element(['gas-pedal'])),reverse=root.append(new Element(['gas-pedal','reverse-pedal']));
  wheel.bounds={left:l.wheel.x,top:l.wheel.y,width:l.wheel.w,height:l.wheel.h};wheel.clientWidth=l.wheel.w;wheel.captureFails=captureFails;
  win.getComputedStyle=e=>({transform:e.renderedTransform??(e===wheel?`rotate(${wheel.style['--steering-angle']||'0deg'})`:'none')});
  let lookChanges=0;const gears=[],samples=[];
  const newLook=()=>createLookInput({canvas,onDelta:()=>lookChanges++});
  let look;if(lookFirst)look=newLook();
  const api=createVehicleInput({root,onInput:s=>samples.push(s),onGear:g=>gears.push(g)});if(!look)look=newLook();
  const point=(degrees=0,r=l.wheel.w/2+l.padding-2)=>{const a=degrees*Math.PI/180;return {clientX:l.wheel.x+l.wheel.w/2+Math.cos(a)*r,clientY:l.wheel.y+l.wheel.h/2+Math.sin(a)*r};};
  const elements={wheel,pedal,reverse,canvas};
  const pointer=(type,id,coords=point(),target)=>{
    const node=doc.captures.get(id)||target||elements[hit(l,coords.clientX,coords.clientY)]||canvas;
    return node.dispatch(type,{pointerId:id,pointerType:'touch',button:0,isPrimary:id===1,...coords});
  };
  return {l,win,doc,body,root,wheel,image,pedal,reverse,canvas,api,look,gears,samples,point,pointer,get lookChanges(){return lookChanges;},dispose(){api.destroy();look.destroy();}};
}
function neutral(h){near(h.api.state.steering,0);assert.equal(h.api.state.active,false);for(const key of ['wheelPointerId','pedalPointerId','reversePointerId'])assert.equal(h.api.state[key],undefined);assert.equal(h.doc.captures.size,0);}
assert.equal(STEERING_MAX_ANGLE,135);
for(const [width,height] of [[320,480],[390,844],[1366,768],[844,390]])for(const captureFails of [false,true])for(const lookFirst of [false,true]) {
  const h=setup({width,height,captureFails,lookFirst});
  try {
    const start=h.point(0);assert.equal(hit(h.l,start.clientX,start.clientY),'wheel');
    const down=h.pointer('pointerdown',1,start);assert.ok(down.defaultPrevented&&down.stopped);assert.equal(h.api.state.wheelPointerId,1);assert.equal(h.look.active,false);
    assert.equal(h.wheel.hasPointerCapture(1),!captureFails);
    // Far outside the rim, even over canvas: original owner keeps steering.
    const move=h.pointer('pointermove',1,h.point(90,300),h.canvas);near(h.api.state.steering,2/3);assert.ok(move.defaultPrevented&&move.stopped);assert.equal(h.lookChanges,0);
    h.pointer('pointerdown',2,{clientX:width-5,clientY:height-5},h.canvas);
    h.pointer('pointermove',2,{clientX:width-35,clientY:height-25},h.canvas);assert.equal(h.look.pointerId,2);assert.ok(h.lookChanges>0);
    h.pointer('pointerdown',3,{clientX:0,clientY:0},h.pedal);assert.equal(h.api.state.active,true);
    h.pointer('pointerdown',4,{clientX:0,clientY:0},h.reverse);assert.equal(h.gears.at(-1),'R');
    const before=h.lookChanges;h.pointer('pointermove',1,h.point(135,350),h.canvas);near(h.api.state.steering,1);assert.equal(h.lookChanges,before);
    h.pointer('pointerup',1,h.point(135,350),h.canvas);near(h.api.state.steering,0);assert.equal(h.api.state.active,true);assert.equal(h.look.pointerId,2);
    h.pointer('pointerup',4,{clientX:0,clientY:0},h.canvas);assert.equal(h.gears.at(-1),'D');
    h.pointer('pointerup',3,{clientX:0,clientY:0},h.canvas);h.pointer('pointerup',2,{clientX:0,clientY:0},h.canvas);neutral(h);
    // A pointer originating on canvas remains a look pointer when crossing the rim.
    h.pointer('pointerdown',5,{clientX:width-5,clientY:height-5},h.canvas);h.pointer('pointermove',5,h.point());assert.equal(h.look.pointerId,5);assert.equal(h.api.state.wheelPointerId,undefined);h.pointer('pointerup',5,h.point());
    // Regrab the current rendered angle, wrap ±180°, and preserve dead-center behavior.
    h.wheel.renderedTransform='rotate(45deg)';h.pointer('pointerdown',6,h.point(179),h.wheel);near(h.api.state.steering,1/3);h.wheel.renderedTransform=undefined;
    h.pointer('pointermove',6,h.point(-179,300),h.canvas);near(h.api.state.steering,47/135);
    h.pointer('pointermove',6,h.point(0,0),h.canvas);h.pointer('pointermove',6,h.point(90,300),h.canvas);near(h.api.state.steering,47/135);
    h.pointer('pointermove',6,h.point(135,300),h.canvas);near(h.api.state.steering,92/135);h.pointer('pointercancel',6,h.point(),h.canvas);neutral(h);
  } finally {h.dispose();}
}
console.log('PASS real vehicle/look handlers: rim starts, outside drags, capture and failed-capture fallback, both listener orders, independent camera/D/R fingers, actual center, wrap/dead-center/regrab.');
for(const end of ['pointerup','pointercancel','lostpointercapture','reset','disabled','blur','resize','pagehide','hidden','editable','destroy']) {
  const h=setup();
  try {
    h.pointer('pointerdown',1,h.point());h.pointer('pointermove',1,h.point(60,250),h.canvas);
    if(['pointerup','pointercancel','lostpointercapture'].includes(end))h.pointer(end,1,h.point(),h.canvas);
    else if(end==='reset')h.api.reset();
    else if(end==='disabled')h.api.setEnabled(false);
    else if(end==='destroy')h.api.destroy();
    else if(end==='hidden'){h.doc.hidden=true;h.doc.dispatch('visibilitychange');}
    else if(end==='editable'){const field=h.body.append(new Element());field.isContentEditable=true;field.dispatch('focusin');}
    else h.win.dispatch(end);
    neutral(h);h.pointer('pointermove',1,h.point(-90,300),h.canvas);h.pointer('pointerup',1,h.point(-90,300),h.canvas);neutral(h);assert.equal(h.lookChanges,0);
    if(end!=='destroy'){
      h.doc.hidden=false;h.api.setEnabled(true);h.pointer('pointerdown',7,h.point());h.pointer('pointermove',7,h.point(45,250));near(h.api.state.steering,1/3);h.pointer('pointerup',7,h.point());neutral(h);
    }
  } finally {h.dispose();}
}
console.log('PASS wheel ownership is cleared on up/cancel/lost capture, reset/disable/destroy, blur/pagehide/resize, hidden tab and editable focus; stale moves never reacquire camera.');

// Actual app wiring; its fixture is intentionally layout-free, so the static
// pseudo-element contract above determines the original button target here.
const app=createAppDom(),d=app.debug,canvas=d.renderer.domElement,reverse=app.ids.get('reverse-pedal');
const touch=(target,type,id,x,y)=>target.dispatch(type,{pointerId:id,button:0,clientX:x,clientY:y,isPrimary:id===1});
const b=app.wheel.bounds,cx=b.left+b.width/2,cy=b.top+b.height/2,r=b.width/2+30;
const start=()=>{touch(app.wheel,'pointerdown',1,cx+r,cy);touch(app.win,'pointermove',1,cx,cy+r+160);touch(app.pedal,'pointerdown',2,0,0);touch(canvas,'pointerdown',3,250,100);};
const idle=()=>{assert.equal(d.input.state.wheelPointerId,undefined);assert.equal(d.input.state.active,false);assert.equal(d.model.state.steering,0);assert.equal(d.model.state.active,false);assert.equal(d.lookInput.active,false);for(const element of [app.wheel,app.pedal,reverse,canvas])assert.equal(element.captures.size,0);};
try {
  start();near(d.model.state.steering,2/3);assert.equal(d.model.state.active,true);assert.equal(d.lookInput.pointerId,3);
  touch(app.win,'pointermove',1,cx-r-300,cy);near(d.model.state.steering,1);assert.equal(d.lookInput.pointerId,3);
  touch(canvas,'pointermove',3,280,110);assert.equal(d.input.state.wheelPointerId,1);
  for(const [open,close] of [[()=>d.setUpgradeMenu(true),()=>d.setUpgradeMenu(false)],[()=>d.setBiomeMenu(true),()=>d.setBiomeMenu(false)]]) {
    open();idle();touch(app.wheel,'pointerdown',8,cx+r,cy);touch(canvas,'pointerdown',9,250,100);idle();close();idle();start();
  }
  for(const type of ['resize','blur','pagehide']){app.win.dispatch(type);idle();app.win.dispatch('focus');start();}
  app.doc.hidden=true;app.doc.dispatch('visibilitychange');idle();app.doc.hidden=false;app.doc.dispatch('visibilitychange');app.win.dispatch('focus');start();
  // Receipt opening resets held rim/gas/look pointers through the real app path.
  const delivery=d.garage.deliveries[0];d.gameplay.drive(0,delivery.x,delivery.z);app.frame();idle();assert.equal(d.careerMenuOpen,true);assert.equal(app.ids.get('delivery-receipt-menu').hidden,false);
  touch(app.wheel,'pointerdown',10,cx+r,cy);touch(canvas,'pointerdown',11,250,100);idle();
  app.ids.get('delivery-receipt-close').dispatch('click');idle();assert.equal(app.root.hidden,true);assert.equal(app.ids.get('career-goal-button').hidden,true);
  app.ids.get('career-mission-button').dispatch('click');assert.equal(d.careerMenuOpen,true);touch(app.wheel,'pointerdown',12,cx+r,cy);idle();app.ids.get('career-close').dispatch('click');idle();
  d.gameplay.state.cooldown=0;assert.equal(d.enterVehicle('pickup'),true);start();assert.equal(d.input.state.wheelPointerId,1);d.returnToGarage();idle();
  console.log('PASS actual app: padded-button target -> steering, separate camera, upgrade/biome/career/receipt dialogs, blur/resize/pagehide/visibility, garage and fresh driving reset.');
} finally {app.dispose();}
