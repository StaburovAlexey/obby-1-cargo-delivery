#!/usr/bin/env node


import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createVehicleInput, driveStickAxes, DRIVE_STICK_DEAD_ZONE, DRIVE_STICK_TRAVEL } from '../dist/vehicle-input.js';
import { createLookInput } from '../dist/look-input.js';

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
    this.bounds = { left: 20, top: 30, width: 142, height: 142 }; this.captures = new Set(); this.released = [];
    this.style = {}; const names = new Set(classes);
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
function setup() {
  const win = new Target(), doc = new Target(); doc.defaultView = win; doc.parent = win; doc.hidden = false;
  const body = new Element(); body.ownerDocument = doc; body.parent = doc; doc.body = body;
  const root = body.append(new Element()), stick = root.append(new Element(['drive-stick'], 'BUTTON'));
  const thumb = stick.append(new Element(['drive-thumb'])), canvas = body.append(new Element([], 'CANVAS'));
  const inputs = []; let starts = 0, safety = 0, gearCalls = 0;
  const api = createVehicleInput({ root, onInput: input => inputs.push(input), onStart: () => starts++, onSafetyReset: () => safety++, onGear: () => gearCalls++ });
  const point = (x, y) => { const b = stick.bounds, r = Math.min(b.width, b.height) * DRIVE_STICK_TRAVEL; return { clientX: b.left + b.width / 2 + x * r, clientY: b.top + b.height / 2 - y * r }; };
  const pointer = (type, x = 0, y = 0, id = 1, target = stick, extra = {}) => target.dispatch(type, { ...point(x, y), button: 0, pointerId: id, pointerType: 'touch', isPrimary: id === 1, ...extra });
  const key = (type, code, extra = {}) => body.dispatch(type, { code, key: code.startsWith('Key') ? code.at(-1).toLowerCase() : code, repeat: false, ...extra });
  return { win, doc, body, root, stick, thumb, canvas, inputs, api, pointer, key, point,
    get starts() { return starts; }, get safety() { return safety; }, get gearCalls() { return gearCalls; } };
}
const near = (actual, expected, message = '') => assert.ok(Math.abs(actual - expected) < 1e-10, `${message}: ${actual} != ${expected}`);
const neutral = h => {
  assert.deepEqual(h.inputs.at(-1), { steering: 0, speedDemand: 0, active: false });
  assert.equal(h.api.state.pointerId, undefined); assert.equal(h.thumb.style.transform, 'translate(0px, 0px)');
  assert.equal(h.root.dataset.throttle, 'false'); assert.equal(h.stick.captures.size, 0);
};
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
function withInput(fn) { const h = setup(); try { fn(h); } finally { h.api.destroy(); } }

test('initial sample is centered, explicit signed speed API, compatibility gear method has no effect', () => withInput(h => {
  neutral(h); assert.equal(h.gearCalls, 0); assert.equal(h.api.state.enabled, true);
  const n = h.inputs.length; h.api.setGear('R'); h.api.setGear('D'); assert.equal(h.inputs.length, n); assert.equal(h.gearCalls, 0);
  assert.throws(() => createVehicleInput({ root: h.canvas }), /Driving controls need/);
}));
test('up/down distance maps monotonically to signed speed with a quiet center and circular clamp', () => {
  const bounds = { left: 10, top: 20, width: 200, height: 200 }, r = 200 * DRIVE_STICK_TRAVEL;
  const sample = (x, y) => driveStickAxes({ clientX: 110 + x * r, clientY: 120 - y * r }, bounds);
  for (const y of [0, .04, DRIVE_STICK_DEAD_ZONE, .25, .5, .75, 1, 2]) {
    const expected = Math.max(0, (Math.min(1, y) - DRIVE_STICK_DEAD_ZONE) / (1 - DRIVE_STICK_DEAD_ZONE));
    near(sample(0, y).speedDemand, expected); near(sample(0, -y).speedDemand, -expected);
  }
  for (const x of [-3, -1, -.5, .5, 1, 3]) near(sample(x, .01).speedDemand, 0, 'side motion does not accelerate');
  for (const [x, y] of [[3, 4], [-8, -6], [0, 20]]) { const s = sample(x, y); assert.ok(Math.abs(s.steering) <= 1 && Math.abs(s.speedDemand) <= 1); near(Math.hypot(s.thumbX, s.thumbY), r); }
  assert.deepEqual(driveStickAxes({ clientX: NaN, clientY: Infinity }, bounds), { steering: 0, speedDemand: 0, thumbX: 0, thumbY: 0 });
});
test('one pointer controls both axes and release recenters immediately with no duplicate capture-loss emission', () => withInput(h => {
  const down = h.pointer('pointerdown'); assert.equal(down.defaultPrevented, true); assert.equal(h.starts, 1);
  assert.equal(h.api.state.active, true); near(h.api.state.speedDemand, 0); assert.ok(h.stick.hasPointerCapture(1));
  h.pointer('pointermove', 0, .54); near(h.api.state.speedDemand, .5); near(h.api.state.steering, 0);
  h.pointer('pointermove', 1, 0); near(h.api.state.steering, 1); near(h.api.state.speedDemand, 0);
  h.pointer('pointermove', 0, -1); near(h.api.state.speedDemand, -1);
  const n = h.inputs.length; h.pointer('pointerup', 0, -1); neutral(h); assert.equal(h.inputs.length, n + 1);
  assert.ok(h.stick.classList.contains('is-returning')); assert.equal(h.starts, 1);
}));
test('secondary finger never changes the stick, while camera and stick work in either start order', () => {
  for (const cameraFirst of [false, true]) withInput(h => {
    let looks = 0; const look = createLookInput({ canvas: h.canvas, onDelta: () => looks++ });
    try {
      if (cameraFirst) h.pointer('pointerdown', 0, 0, 7, h.canvas);
      h.pointer('pointerdown', 0, 1, 2, h.stick, { isPrimary: false });
      if (!cameraFirst) h.pointer('pointerdown', 0, 0, 7, h.canvas);
      h.pointer('pointerdown', -1, -1, 3); h.pointer('pointermove', -1, -1, 3); h.pointer('pointerup', -1, -1, 3);
      assert.equal(h.api.state.pointerId, 2); near(h.api.state.speedDemand, 1);
      h.pointer('pointermove', .5, .5, 7, h.canvas); assert.ok(looks > 0); assert.equal(look.pointerId, 7);
      h.pointer('pointerup', .5, .5, 7, h.canvas); assert.equal(look.active, false); assert.equal(h.api.state.active, true);
      h.pointer('pointerup', 0, 1, 2); neutral(h);
    } finally { look.destroy(); }
  });
});
test('capture failure still permits window motion and completion; unexpected release errors are harmless', () => withInput(h => {
  h.stick.captureFails = true; h.pointer('pointerdown', 0, 1); h.pointer('pointermove', 0, .54, 1, h.win); near(h.api.state.speedDemand, .5);
  h.pointer('pointerup', 0, .54, 1, h.win); neutral(h);
  h.stick.captureFails = false; h.stick.releaseFails = true; h.pointer('pointerdown', 0, -1); h.pointer('pointercancel'); neutral(h);
}));
test('cancel, capture loss, blur, pagehide, resize, hidden tab and editable focus clear all input', () => withInput(h => {
  for (const type of ['pointercancel', 'lostpointercapture']) { h.pointer('pointerdown', .5, .5); h.pointer(type); neutral(h); }
  for (const type of ['blur', 'pagehide', 'resize']) { h.key('keydown', 'KeyW'); const n = h.safety; h.win.dispatch(type); neutral(h); assert.equal(h.safety, n + 1); }
  h.pointer('pointerdown', 0, 1); h.doc.dispatch('visibilitychange'); assert.equal(h.api.state.active, true);
  h.doc.hidden = true; h.doc.dispatch('visibilitychange'); neutral(h);
  h.key('keydown', 'ArrowUp'); h.doc.dispatch('focusin', { target: new Element([], 'TEXTAREA') }); neutral(h);
}));
test('disable blocks controls, enabling republishes neutral once, held-key repeats cannot restart', () => withInput(h => {
  h.key('keydown', 'KeyW'); h.api.setEnabled(false); neutral(h); assert.equal(h.root.hidden, true); assert.equal(h.stick.getAttribute('aria-disabled'), 'true');
  h.pointer('pointerdown', 0, 1); h.key('keydown', 'KeyW'); neutral(h);
  const n = h.inputs.length; h.api.setEnabled(true); assert.equal(h.inputs.length, n + 1); neutral(h); h.api.setEnabled(true); assert.equal(h.inputs.length, n + 1);
  h.key('keydown', 'KeyW', { repeat: true }); neutral(h); h.key('keydown', 'KeyW'); near(h.api.state.speedDemand, 1);
  h.api.reset(); h.key('keydown', 'KeyW', { repeat: true }); neutral(h);
}));
test('WASD and arrow keys provide axis endpoints, opposing keys cancel and aliases release independently', () => withInput(h => {
  for (const [code, steering, speed] of [['KeyW', 0, 1], ['ArrowUp', 0, 1], ['KeyS', 0, -1], ['ArrowDown', 0, -1], ['KeyA', -1, 0], ['ArrowLeft', -1, 0], ['KeyD', 1, 0], ['ArrowRight', 1, 0]]) {
    assert.ok(h.key('keydown', code).defaultPrevented); near(h.api.state.steering, steering); near(h.api.state.speedDemand, speed); h.key('keyup', code); neutral(h);
  }
  h.key('keydown', 'KeyW'); h.key('keydown', 'KeyD'); near(h.api.state.speedDemand, 1); near(h.api.state.steering, 1);
  h.key('keydown', 'KeyS'); h.key('keydown', 'KeyA'); near(h.api.state.speedDemand, 0); near(h.api.state.steering, 0);
  h.api.reset(); h.key('keydown', 'KeyW'); h.key('keydown', 'ArrowUp'); h.key('keyup', 'KeyW'); near(h.api.state.speedDemand, 1); h.key('keyup', 'ArrowUp'); neutral(h);
  h.body.dispatch('keydown', { key: 'W' }); near(h.api.state.speedDemand, 1); h.body.dispatch('keyup', { key: 'W' }); neutral(h);
}));
test('mouse secondary buttons, typing, modifier shortcuts and unrelated keys do not drive', () => withInput(h => {
  h.pointer('pointerdown', 0, 1, 1, h.stick, { button: 2 }); neutral(h);
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) { h.key('keydown', 'KeyW', { target: new Element([], tag) }); neutral(h); }
  const editable = new Element(); editable.isContentEditable = true; h.key('keydown', 'KeyW', { target: editable }); neutral(h);
  for (const flag of ['ctrlKey', 'metaKey', 'altKey']) { h.key('keydown', 'KeyW', { [flag]: true }); neutral(h); }
  assert.equal(h.key('keydown', 'Space').defaultPrevented, false); neutral(h);
}));
test('pointer takeover clears old keys and held keyboard cannot create hidden throttle after release', () => withInput(h => {
  h.key('keydown', 'KeyW'); h.pointer('pointerdown', 0, -.54); near(h.api.state.speedDemand, -.5);
  h.key('keydown', 'KeyW'); h.key('keydown', 'ArrowUp'); near(h.api.state.speedDemand, -.5);
  h.pointer('pointerup'); neutral(h); h.key('keydown', 'KeyW', { repeat: true }); neutral(h);
  h.key('keyup', 'KeyW'); h.key('keydown', 'KeyW'); near(h.api.state.speedDemand, 1);
}));
test('gesture protection preserves normal clicks and destroying removes every listener idempotently', () => {
  const h = setup();
  for (const type of ['dblclick', 'contextmenu', 'selectstart', 'dragstart', 'gesturestart', 'gesturechange', 'gestureend']) assert.ok(h.root.dispatch(type).defaultPrevented);
  assert.equal(h.root.dispatch('click').defaultPrevented, false);
  h.pointer('pointerdown', 0, 1); h.api.destroy(); neutral(h); const n = h.inputs.length, s = h.safety;
  h.api.destroy(); h.pointer('pointerdown', 0, 1); h.key('keydown', 'KeyW'); h.win.dispatch('blur');
  assert.equal(h.inputs.length, n); assert.equal(h.safety, s);
  for (const node of [h.root, h.stick, h.win, h.doc]) for (const handlers of node.listeners.values()) assert.equal(handlers.length, 0);
});

test('HTML exposes one described driving stick, clear speed/release instructions and no gear or wheel UI', () => {
  const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  const driving = html.slice(html.indexOf('id="drive-ui"'), html.indexOf('<div id="loading"'));
  for (const id of ['drive-stick', 'drive-thumb', 'drive-tip', 'fuel-hud', 'speed-value', 'drive-status']) assert.equal([...driving.matchAll(new RegExp(`id="${id}"`, 'g'))].length, 1);
  assert.equal([...driving.matchAll(/<button\b/g)].length, 1);
  assert.match(driving, /aria-describedby="drive-tip"/); assert.match(driving, /aria-keyshortcuts="W A S D ArrowUp ArrowDown ArrowLeft ArrowRight"/);
  for (const text of ['Вверх — вперёд', 'вниз — назад', 'Дальше от центра — быстрее', 'Отпустите стик — торможение']) assert.ok(driving.includes(text));
  assert.doesNotMatch(driving, /steering-wheel|gear-control|gear-note|gear-panel|data-gear|hud-steering|удерживайте руль/i);
  assert.match(driving, /id="drive-status"[^>]*><\/span>/);
});
test('CSS uses the walking ring/thumb visual, focus support, safe areas and unchanged fuel/speed row', () => {
  const css = fs.readFileSync(new URL('../dist/vehicle-controls.css', import.meta.url), 'utf8');
  const style = fs.readFileSync(new URL('../dist/style.css', import.meta.url), 'utf8');
  assert.match(css, /\.drive-stick \{[^}]*border: 3px solid #fffdf3ee;[^}]*border-radius: 50%;[^}]*background: #fffdf316;/s);
  assert.match(css, /\.drive-thumb \{[^}]*border: 3px solid #fffdf3;[^}]*border-radius: 50%;[^}]*background: #51d7ffdb;[^}]*pointer-events: none;/s);
  assert.match(style, /button:focus-visible/); assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.drive-bottom-row \{[^}]*flex-wrap: nowrap;[^}]*align-items: center;[^}]*height: 44px/);
  assert.match(css, /max-width: 424px/); assert.match(css, /flex-basis: 100px/);
  assert.match(css, /#drive-status:empty \{ display: none; \}/);
  assert.doesNotMatch(css, /steering-wheel|gear-control|gear-handle|gear-note|steering-angle/);
  assert.equal([...css].filter(c => c === '{').length, [...css].filter(c => c === '}').length);
});
test('static layout arithmetic keeps the circular stick above fuel/speed and below top actions', () => {
  const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  for (const [w, h] of [[320, 480], [320, 568], [360, 640], [390, 844], [540, 960], [760, 1024], [501, 320], [568, 320], [844, 390], [1366, 768]]) {
    for (const [bottom, left, right] of [[0, 0, 0], [34, 44, 44], [21, 44, 0], [21, 0, 44]]) {
      let size = 142, gap = Math.max(108, .1 * h + 18);
      if (w <= 500) { size = 132; gap = 158; }
      if (h <= 650 && w <= 500) gap = 150;
      if (h <= 540 && w <= 500) { size = 112; gap = 128; }
      if (h <= 500 && w >= 501) { size = 112; gap = 96; }
      if (h >= 501 && w >= 501 && w <= 760) gap = 158;
      if (h <= 420 && w >= 501) { size = Math.min(112, .2875 * h); gap = 82; }
      const stick = { x: w <= 500 ? Math.max(20, left + 10) : Math.max(25, left + 14), y: h - bottom - gap - size, w: size, h: size };
      const available = w - left - right - 24, width = Math.min(424, available);
      const row = { x: left + 12 + (available - width) / 2, y: h - bottom - 56, w: width, h: 44 };
      assert.ok(!intersects(stick, row), `${w}x${h}: stick overlaps fuel/speed`);
      assert.ok(stick.x >= left && stick.x + size <= w - right && stick.y >= 0, `${w}x${h}: stick clipped`);
      const top = { x: Math.max(13, left + 8), y: 25, w: 86, h: h <= 420 ? 64 : 108 };
      assert.ok(!intersects(stick, top), `${w}x${h}: stick overlaps top action`);
      const speedWidth = w <= 540 ? 100 : 128, rowGap = w <= 540 ? 8 : 12;
      assert.ok(width - speedWidth - rowGap >= 100, `${w}x${h}: fuel number too narrow`);
    }
  }
});
console.log(`Analog driving stick: ${passed} checks passed. Fake DOM and static layout only; browser rendering/physical touch are unverified.`);
