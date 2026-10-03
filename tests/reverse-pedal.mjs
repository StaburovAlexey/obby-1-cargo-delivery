#!/usr/bin/env node
// Renderer-free reverse pedal regressions using production input/model.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const pedalMarkup=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8').match(/<button id="reverse-pedal"[\s\S]*?<\/button>/)[0];
assert(!pedalMarkup.includes('↓'));assert(pedalMarkup.includes('>R</span>'));assert(pedalMarkup.includes('aria-label='));
import { createVehicleInput } from '../dist/vehicle-input.js';
import { createLookInput } from '../dist/look-input.js';
import { createDrivingModel } from '../dist/driving-model.js';
import { VEHICLE_CONFIG } from '../dist/economy-config.js';
class Target {
  constructor() { this.listeners = new Map(); this.parent = null; }
  addEventListener(type, fn, options) {
    const handlers = this.listeners.get(type) || [];
    handlers.push({ fn, capture: options === true || !!options?.capture });
    this.listeners.set(type, handlers);
  }
  removeEventListener(type, fn, options) {
    const capture = options === true || !!options?.capture;
    this.listeners.set(type, (this.listeners.get(type) || []).filter(h => h.fn !== fn || h.capture !== capture));
  }
  dispatch(type, values = {}) {
    const event = { type, target: this, cancelable: true, defaultPrevented: false, stopped: false, immediate: false,
      preventDefault() { if (this.cancelable) this.defaultPrevented = true; },
      stopPropagation() { this.stopped = true; },
      stopImmediatePropagation() { this.stopped = this.immediate = true; }, ...values };
    const path = []; for (let node = this; node; node = node.parent) path.push(node);
    const call = (node, capture) => {
      event.currentTarget = node;
      for (const h of [...(node.listeners.get(type) || [])]) {
        if (h.capture === capture) h.fn(event);
        if (event.immediate) break;
      }
    };
    for (const node of [...path].reverse()) { call(node, true); if (event.stopped) return event; }
    for (const node of path) { call(node, false); if (event.stopped) break; }
    return event;
  }
}
class Element extends Target {
  constructor(classes = [], tagName = 'DIV') {
    super(); this.children = []; this.tagName = tagName; this.dataset = {}; this.attributes = {}; this.hidden = false;
    this.bounds = { left: 20, top: 30, width: 200, height: 200 }; this.clientWidth = 200;
    this.captures = new Set(); this.released = [];
    this.style = { setProperty(name, value) { this[name] = String(value); } };
    const names = new Set(classes);
    this.classList = { contains: name => names.has(name), add: name => names.add(name), remove: name => names.delete(name),
      toggle(name, force) { const wanted = force ?? !names.has(name); if (wanted) names.add(name); else names.delete(name); return wanted; } };
  }
  append(child) { child.parent = this; child.ownerDocument = this.ownerDocument; this.children.push(child); return child; }
  querySelector(selector) { for (const child of this.children) { if (selector[0] === '.' && child.classList.contains(selector.slice(1))) return child; const nested = child.querySelector(selector); if (nested) return nested; } return null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  getBoundingClientRect() { return this.bounds; }
  setPointerCapture(id) { if (this.captureFails) throw Error('capture unavailable'); this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) { this.captures.delete(id); this.released.push(id); if (this.releaseFails) throw Error('already cancelled'); this.dispatch('lostpointercapture', { pointerId: id }); }
  closest() { return ['INPUT', 'TEXTAREA', 'SELECT'].includes(this.tagName) || this.isContentEditable ? this : this.parent?.closest?.() ?? null; }
}
function setup(model) {
  const win = new Target(), doc = new Target(); doc.defaultView = win; doc.parent = win; doc.hidden = false;
  win.getComputedStyle = element => ({ transform: element.renderedTransform ??
    (element.classList.contains('steering-wheel') ? `rotate(${element.style['--steering-angle'] || '0deg'})` : 'none') });
  const body = new Element(); body.ownerDocument = doc; body.parent = doc; doc.body = body;
  const root = body.append(new Element()), wheel = root.append(new Element(['steering-wheel'], 'BUTTON'));
  const image = wheel.append(new Element(['steering-wheel-image'], 'IMG'));
  const pedal = root.append(new Element(['gas-pedal'], 'BUTTON')), canvas = body.append(new Element([], 'CANVAS'));
  const reverse = root.append(new Element(['gas-pedal', 'reverse-pedal'], 'BUTTON'));
  const gears = [];
  const inputs = []; let starts = 0, safety = 0, gearCalls = 0;
  const api = createVehicleInput({ root, onInput: input => { inputs.push(input); model?.setInput(input); }, onStart: () => starts++, onSafetyReset: () => safety++, onGear: gear => { gearCalls++; gears.push(gear); model?.setGear(gear); } });
  const point = (degrees = 0, radius = 80) => {
    const b = wheel.bounds, radians = degrees * Math.PI / 180;
    return { clientX: b.left + b.width / 2 + Math.cos(radians) * radius, clientY: b.top + b.height / 2 + Math.sin(radians) * radius };
  };
  const pointer = (target, type, id = 1, degrees = 0, extra = {}) => target.dispatch(type, { ...point(degrees), button: 0, pointerId: id, pointerType: 'touch', isPrimary: id === 1, ...extra });
  const key = (type, code, extra = {}) => body.dispatch(type, { code, key: code.startsWith('Key') ? code.at(-1).toLowerCase() : code === 'Space' ? ' ' : code, repeat: false, ...extra });
  return { win, doc, body, root, wheel, image, pedal, reverse, gears, canvas, inputs, api, pointer, key, point,
    get starts() { return starts; }, get safety() { return safety; }, get gearCalls() { return gearCalls; } };
}

const neutral = h => {
  assert.equal(h.api.state.active, false);
  for (const control of [h.wheel, h.pedal, h.reverse]) assert.equal(control.captures.size, 0);
  assert.equal(h.api.state.reversePointerId, undefined);
  assert.equal(h.reverse.getAttribute('aria-pressed'), 'false');
};
const step = (m, seconds) => { for(let i=0;i<seconds*120;i++) m.step(1/120); };
const h = setup();
try {
  h.pointer(h.reverse, 'pointerdown', 2);
  assert.equal(h.gears.at(-1), 'R'); assert.equal(h.api.state.active, true);
  assert.equal(h.reverse.getAttribute('aria-pressed'), 'true');
  assert.equal(h.pedal.getAttribute('aria-pressed'), 'false');
  h.pointer(h.pedal, 'pointerdown', 3);
  assert.equal(h.gears.at(-1), 'R', 'reverse wins both-held regardless of start order');
  h.pointer(h.reverse, 'pointerup', 2); assert.equal(h.gears.at(-1), 'D');
  h.pointer(h.pedal, 'pointerup', 3); neutral(h);
  h.pointer(h.pedal, 'pointerdown', 3); h.pointer(h.reverse, 'pointerdown', 2);
  assert.equal(h.gears.at(-1), 'R');
  h.pointer(h.pedal, 'pointerup', 3); assert.equal(h.gears.at(-1), 'R');
  h.pointer(h.reverse, 'pointerup', 2); neutral(h);
  for(const type of ['pointerup','pointercancel','lostpointercapture']) {
    h.pointer(h.reverse,'pointerdown',2); h.pointer(h.win,type,2); neutral(h);
  }
  for(const type of ['blur','pagehide','resize']) {
    h.pointer(h.reverse,'pointerdown',2); h.win.dispatch(type); neutral(h);
    h.pointer(h.reverse,'pointermove',2); neutral(h);
  }
  h.pointer(h.reverse,'pointerdown',2); h.doc.hidden=true; h.doc.dispatch('visibilitychange'); neutral(h); h.doc.hidden=false;
  h.pointer(h.reverse,'pointerdown',2); h.api.setEnabled(false); neutral(h);
  assert.equal(h.reverse.getAttribute('aria-disabled'),'true');
  h.api.setEnabled(true); neutral(h);
  h.pointer(h.reverse,'pointerdown',2); h.api.reset(); neutral(h);
  h.key('keydown','KeyW'); h.pointer(h.reverse,'pointerdown',2); h.pointer(h.reverse,'pointerup',2); neutral(h);
  h.key('keydown','KeyW',{repeat:true}); neutral(h);
  h.reverse.captureFails=true; h.pointer(h.reverse,'pointerdown',2); h.pointer(h.win,'pointerup',2); neutral(h);
  let looks=0; const look=createLookInput({canvas:h.canvas,onDelta:()=>looks++});
  h.pointer(h.wheel,'pointerdown',1); h.pointer(h.reverse,'pointerdown',2); h.pointer(h.canvas,'pointerdown',3);
  h.pointer(h.wheel,'pointermove',1,90); h.pointer(h.canvas,'pointermove',3,45);
  assert.ok(looks>0); assert.equal(look.pointerId,3); assert.equal(h.api.state.steering,2/3);
  h.pointer(h.reverse,'pointercancel',2); assert.equal(h.api.state.active,false); assert.equal(look.active,true);
  h.pointer(h.wheel,'pointerup',1); look.destroy(); neutral(h);
  h.pointer(h.reverse,'pointerdown',2); h.api.destroy(); neutral(h);
} finally { h.api.destroy(); }
console.log('PASS reverse ownership, arbitration, cancellation, keyboard suppression and camera independence');
for(const spec of VEHICLE_CONFIG) {
  const m=createDrivingModel({vehicleId:spec.id,maxSpeed:spec.maxSpeed,x:0,z:0});
  const input=setup(m);
  try {
    input.pointer(input.pedal,'pointerdown',1); step(m,2);
    assert.ok(m.state.speed>1); const forward=m.state.speed;
    input.pointer(input.pedal,'pointerup',1); input.pointer(input.reverse,'pointerdown',2);
    assert.equal(m.state.gear,'R'); assert.equal(m.state.speed,forward, 'no instant reversal');
    m.step(1/120); assert.ok(m.state.speed>0 && m.state.speed<forward, 'brake before reversing');
    let stopped=false;
    for(let i=0;i<2400;i++) { m.step(1/120); if(Math.abs(m.state.speed)<.08) stopped=true; if(m.state.speed<-.3) break; }
    assert.ok(stopped, spec.id+' passes zero'); assert.ok(m.state.speed<-.3, spec.id+' reaches reverse');
    step(m,1); const reverseSpeed=m.state.speed;
    const reference=createDrivingModel({vehicleId:spec.id,maxSpeed:spec.maxSpeed,x:0,z:0});
    // Straight-line force state is identical for a reference legacy coast.
    Object.assign(reference.state,m.state); reference.setInput({active:false,steering:0});
    input.pointer(input.reverse,'pointerup',2);
    assert.equal(m.state.gear,'R'); assert.equal(m.state.active,false); assert.equal(m.state.speedDemand,null);
    m.step(1/120); reference.step(1/120);
    assert.ok(m.state.speed<0 && m.state.speed>reverseSpeed, spec.id+' release coasts');
    assert.ok(Math.abs(m.state.speed-reference.state.speed)<1e-9, spec.id+' exact legacy coast force');
    input.pointer(input.reverse,'pointerdown',2); input.pointer(input.wheel,'pointerdown',3);
    input.pointer(input.wheel,'pointermove',3,45); const heading=m.state.heading; step(m,.5);
    assert.ok(m.state.heading>heading, spec.id+' reverse steering uses opposite yaw direction');
    input.pointer(input.wheel,'pointerup',3); input.pointer(input.reverse,'pointerup',2);
    input.pointer(input.pedal,'pointerdown',1); assert.equal(m.state.gear,'D');
    step(m,10); assert.ok(m.state.speed>0,spec.id+' returns to forward');
    console.log('PASS '+spec.id+' forward → brake → reverse → coast → reverse steering → forward');
  } finally {input.api.destroy();}
}
console.log('Reverse pedal: production input and all ten vehicle models verified; no browser/touch claim.');
const intersects=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
for(const [w,h] of [[320,480],[320,568],[360,640],[390,844],[540,960],[760,1024],[501,320],[568,320],[844,390],[1366,768]]) {
  for(const [bottom,left,right] of [[0,0,0],[34,44,44],[21,44,0],[21,0,44]]) {
    let size=Math.max(120,Math.min(185,.35*w,.4*h)),gap=Math.max(108,.1*h+18),pw=92,ph=132;
    if(w<=500){size=132;gap=158;pw=78;ph=116;}
    if(h<=540){pw=72;ph=100;}
    if(h<=650&&w<=500)gap=150;
    if(h<=540&&w<=500){size=112;gap=128;}
    if(h<=500&&w>=501){size=112;gap=96;}
    if(h>=501&&w>=501&&w<=760)gap=158;
    if(h<=420&&w>=501){size=Math.min(112,.2875*h);ph=Math.min(100,.2875*h);gap=82;}
    let inset=w<=500?Math.max(20,right+10):Math.max(25,right+14);
    if(h<=420&&w>=501)inset=Math.max(120,right+110);
    let gasBottom=bottom+Math.max(gap,142);
    if(h<=420&&w>=501){gasBottom=bottom+114;ph=Math.max(44,Math.min(h-238-bottom,ph));}
    const gas={x:w-inset-pw,y:h-gasBottom-ph,w:pw,h:ph+3};
    const rw=Math.max(64,pw-12),reverse={x:w-inset-rw,y:h-gasBottom+10,w:rw,h:47};
    const wheel={x:w<=500?Math.max(20,left+10):Math.max(25,left+14),y:h-bottom-gap-size,w:size,h:size};
    const readout={x:left+12,y:h-bottom-(h<=420&&w>=501?56:84),w:w-left-right-24,h:h<=420&&w>=501?44:72};
    for(const p of [gas,reverse]){
      assert.ok(p.y>=0&&p.x>=left&&p.x+p.w<=w-right,`${w}x${h}: pedal stays inside safe area`);
      assert.ok(!intersects(p,wheel)&&!intersects(p,readout),`${w}x${h}: no wheel/readout overlap`);
    }
    assert.ok(!intersects(gas,reverse));assert.ok(reverse.y>gas.y+gas.h);
    if(h<=420&&w>=501){
      const currencyIcons={x:w-Math.max(13,right+8)-48,y:15,w:48,h:101};
      assert.ok(!intersects(gas,currencyIcons)&&!intersects(reverse,currencyIcons),`${w}x${h}: avoids top-right currency icons`);
      assert.ok(gas.y>=currencyIcons.y+currencyIcons.h,`${w}x${h}: below entire currency row including long numbers`);
    }
    assert.ok(reverse.w>=44&&reverse.h>=44&&reverse.w<gas.w);
  }
}
console.log('PASS small reverse footprint below gas across 10 portrait/landscape sizes × 4 safe-area configurations');
