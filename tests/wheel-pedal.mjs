#!/usr/bin/env node
// Renderer-free tests of the actual input module, independent fake event DOM,
// production driving model and static HUD layout. No browser or touch-device claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createVehicleInput, STEERING_MAX_ANGLE, shortestAngleDegrees, fingerAngleAt } from '../dist/vehicle-input.js';
import { createLookInput } from '../dist/look-input.js';
import { createDrivingModel } from '../dist/driving-model.js';

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
function setup() {
  const win = new Target(), doc = new Target(); doc.defaultView = win; doc.parent = win; doc.hidden = false;
  win.getComputedStyle = element => ({ transform: element.renderedTransform ??
    (element.classList.contains('steering-wheel') ? `rotate(${element.style['--steering-angle'] || '0deg'})` : 'none') });
  const body = new Element(); body.ownerDocument = doc; body.parent = doc; doc.body = body;
  const root = body.append(new Element()), wheel = root.append(new Element(['steering-wheel'], 'BUTTON'));
  const image = wheel.append(new Element(['steering-wheel-image'], 'IMG'));
  const pedal = root.append(new Element(['gas-pedal'], 'BUTTON')), canvas = body.append(new Element([], 'CANVAS'));
  const inputs = []; let starts = 0, safety = 0, gearCalls = 0;
  const api = createVehicleInput({ root, onInput: input => inputs.push(input), onStart: () => starts++, onSafetyReset: () => safety++, onGear: () => gearCalls++ });
  const point = (degrees = 0, radius = 80) => {
    const b = wheel.bounds, radians = degrees * Math.PI / 180;
    return { clientX: b.left + b.width / 2 + Math.cos(radians) * radius, clientY: b.top + b.height / 2 + Math.sin(radians) * radius };
  };
  const pointer = (target, type, id = 1, degrees = 0, extra = {}) => target.dispatch(type, { ...point(degrees), button: 0, pointerId: id, pointerType: 'touch', isPrimary: id === 1, ...extra });
  const key = (type, code, extra = {}) => body.dispatch(type, { code, key: code.startsWith('Key') ? code.at(-1).toLowerCase() : code === 'Space' ? ' ' : code, repeat: false, ...extra });
  return { win, doc, body, root, wheel, image, pedal, canvas, inputs, api, pointer, key, point,
    get starts() { return starts; }, get safety() { return safety; }, get gearCalls() { return gearCalls; } };
}
const near = (actual, expected, message = '') => assert.ok(Math.abs(actual - expected) < 1e-10, `${message}: ${actual} != ${expected}`);
const neutral = h => {
  assert.deepEqual(h.inputs.at(-1), { steering: 0, active: false });
  assert.equal(h.api.state.wheelPointerId, undefined); assert.equal(h.api.state.pedalPointerId, undefined);
  assert.equal(h.root.dataset.throttle, 'false'); assert.equal(h.pedal.getAttribute('aria-pressed'), 'false');
  assert.equal(h.wheel.style['--steering-angle'], '0deg');
  for (const element of [h.wheel, h.pedal]) assert.equal(element.captures.size, 0);
};
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
function withInput(fn) { const h = setup(); try { fn(h); } finally { h.api.destroy(); } }

test('initial legacy coast sample omits speedDemand; setGear is a no-op', () => withInput(h => {
  neutral(h); assert.equal(STEERING_MAX_ANGLE, 135); assert.equal(h.gearCalls, 0);
  const n = h.inputs.length; h.api.setGear('R'); h.api.setGear('D'); h.api.setGear('invalid');
  assert.equal(h.inputs.length, n); assert.equal(h.gearCalls, 0); assert.equal(h.api.state.gear, undefined);
  assert.throws(() => createVehicleInput({ root: h.canvas }), /Driving controls need/);
  assert.throws(() => createVehicleInput(), /Driving controls need/);
}));
test('original angular helper wraps correctly and ignores dead center/nonfinite coordinates', () => {
  near(shortestAngleDegrees(358 * Math.PI / 180), -2);
  near(shortestAngleDegrees(-358 * Math.PI / 180), 2);
  const bounds = { left: 20, top: 30, width: 200, height: 200 };
  assert.equal(fingerAngleAt({ clientX: 120, clientY: 130 }, bounds, 200), undefined);
  assert.equal(fingerAngleAt({ clientX: 139, clientY: 130 }, bounds, 200), undefined);
  near(fingerAngleAt({ clientX: 140, clientY: 130 }, bounds, 200), 0);
  near(fingerAngleAt({ clientX: 120, clientY: 210 }, bounds, 200), Math.PI / 2);
  assert.equal(fingerAngleAt({ clientX: NaN, clientY: Infinity }, bounds, 200), undefined);
});
test('wheel alone rotates ±135 degrees without throttle; release returns to center', () => withInput(h => {
  const down = h.pointer(h.wheel, 'pointerdown'); assert.equal(down.defaultPrevented, true);
  assert.equal(h.api.state.active, false); assert.equal(h.starts, 0); assert.ok(h.wheel.hasPointerCapture(1));
  h.pointer(h.wheel, 'pointermove', 1, 90); near(h.api.state.steering, 2 / 3);
  h.pointer(h.wheel, 'pointermove', 1, 170); near(h.api.state.steering, 1);
  h.pointer(h.wheel, 'pointermove', 1, 80); near(h.api.state.steering, 1 / 3);
  h.pointer(h.wheel, 'pointermove', 1, -90); near(h.api.state.steering, -125 / 135);
  h.pointer(h.wheel, 'pointermove', 1, -170); near(h.api.state.steering, -1);
  assert.equal(h.wheel.style['--steering-angle'], '-135deg'); assert.equal(h.api.state.active, false);
  const n = h.inputs.length; h.pointer(h.wheel, 'pointerup'); neutral(h);
  assert.equal(h.inputs.length, n + 1); assert.ok(h.wheel.classList.contains('is-returning'));
}));
test('angular wrap and dead-center traversal never jump the steering', () => withInput(h => {
  h.pointer(h.wheel, 'pointerdown', 1, 179);
  h.pointer(h.wheel, 'pointermove', 1, -179); near(h.api.state.steering, 2 / 135);
  h.pointer(h.wheel, 'pointermove', 1, 0, h.point(0, 0)); near(h.api.state.steering, 2 / 135);
  h.pointer(h.wheel, 'pointermove', 1, 90); near(h.api.state.steering, 2 / 135);
  h.pointer(h.wheel, 'pointermove', 1, 135); near(h.api.state.steering, 47 / 135);
  h.pointer(h.wheel, 'pointerup');
  h.pointer(h.wheel, 'pointerdown', 2, 0, h.point(0, 0));
  h.pointer(h.wheel, 'pointermove', 2, -90); near(h.api.state.steering, 0);
  h.pointer(h.wheel, 'pointermove', 2, -135); near(h.api.state.steering, -1 / 3);
}));
test('regrab uses the rendered returning angle plus any image transform', () => withInput(h => {
  h.pointer(h.wheel, 'pointerdown'); h.pointer(h.wheel, 'pointermove', 1, 90); h.pointer(h.wheel, 'pointerup');
  h.wheel.renderedTransform = 'rotate(45deg)'; h.image.renderedTransform = 'rotate(15deg)';
  h.pointer(h.wheel, 'pointerdown', 2, -90); near(h.api.state.steering, 60 / 135);
  assert.equal(h.wheel.classList.contains('is-returning'), false);
  h.pointer(h.wheel, 'pointermove', 2, -45); near(h.api.state.steering, 105 / 135);
  h.pointer(h.wheel, 'pointerup', 2);
  h.wheel.renderedTransform = 'matrix(0, -1, 1, 0, 0, 0)'; h.image.renderedTransform = 'none';
  h.pointer(h.wheel, 'pointerdown', 3); near(h.api.state.steering, -2 / 3);
}));
test('DOMMatrix rendered-angle path and invalid serialized transform fallback remain safe', () => withInput(h => {
  h.win.DOMMatrixReadOnly = class { constructor() { this.a = 0; this.b = 1; } };
  h.wheel.renderedTransform = 'matrix3d(...)'; h.pointer(h.wheel, 'pointerdown'); near(h.api.state.steering, 2 / 3);
  h.pointer(h.wheel, 'pointerup');
  h.win.DOMMatrixReadOnly = class { constructor() { throw Error('Unsupported matrix'); } };
  h.wheel.renderedTransform = 'matrix(NaN, NaN, 0, 0, 0, 0)';
  h.pointer(h.wheel, 'pointerdown', 2); near(h.api.state.steering, 0);
}));
test('gas alone accelerates forward while its click and wheel do not latch throttle', () => withInput(h => {
  h.pedal.dispatch('click'); neutral(h);
  assert.equal(h.pointer(h.pedal, 'pointerdown', 2).defaultPrevented, true);
  assert.deepEqual(h.inputs.at(-1), { steering: 0, active: true }); assert.equal(h.starts, 1);
  assert.equal(h.pedal.getAttribute('aria-pressed'), 'true'); assert.ok(h.pedal.classList.contains('is-active'));
  h.pointer(h.pedal, 'pointermove', 2, 180); assert.equal(h.api.state.active, true);
  const n = h.inputs.length; h.pointer(h.pedal, 'pointerup', 2); neutral(h); assert.equal(h.inputs.length, n + 1);
  h.pedal.dispatch('click'); neutral(h);
  assert.ok(h.inputs.every(input => !Object.hasOwn(input, 'speedDemand')));
}));
test('wheel and pedal have independent captures in both start orders and both release orders', () => {
  for (const pedalFirst of [false, true]) for (const releasePedalFirst of [false, true]) withInput(h => {
    const beginWheel = () => { h.pointer(h.wheel, 'pointerdown', 11, 0, { isPrimary: false }); h.pointer(h.wheel, 'pointermove', 11, 90); };
    const beginPedal = () => h.pointer(h.pedal, 'pointerdown', 12, 0, { isPrimary: false });
    if (pedalFirst) { beginPedal(); beginWheel(); } else { beginWheel(); beginPedal(); }
    assert.equal(h.api.state.active, true); near(h.api.state.steering, 2 / 3);
    assert.equal(h.api.state.wheelPointerId, 11); assert.equal(h.api.state.pedalPointerId, 12);
    if (releasePedalFirst) {
      h.pointer(h.pedal, 'pointerup', 12); assert.equal(h.api.state.active, false); near(h.api.state.steering, 2 / 3);
      assert.equal(h.api.state.wheelPointerId, 11); h.pointer(h.wheel, 'pointerup', 11);
    } else {
      h.pointer(h.wheel, 'pointerup', 11); near(h.api.state.steering, 0); assert.equal(h.api.state.active, true);
      assert.equal(h.api.state.pedalPointerId, 12); h.pointer(h.pedal, 'pointerup', 12);
    }
    neutral(h); assert.equal(h.starts, 1);
  });
});
test('third camera finger works concurrently in every start order without control cross-talk', () => {
  for (const order of [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]]) withInput(h => {
    let looks = 0; const look = createLookInput({ canvas: h.canvas, onDelta: () => looks++ });
    try {
      for (const id of order) h.pointer(id === 1 ? h.wheel : id === 2 ? h.pedal : h.canvas, 'pointerdown', id);
      h.pointer(h.wheel, 'pointermove', 1, 90); h.pointer(h.canvas, 'pointermove', 3, 45);
      near(h.api.state.steering, 2 / 3); assert.equal(h.api.state.active, true); assert.ok(looks > 0);
      assert.equal(look.pointerId, 3);
      const count = h.inputs.length;
      h.pointer(h.wheel, 'pointerdown', 4); h.pointer(h.wheel, 'pointermove', 4, 180); h.pointer(h.wheel, 'pointerup', 4);
      h.pointer(h.pedal, 'pointerdown', 5); h.pointer(h.pedal, 'pointerup', 5);
      assert.equal(h.inputs.length, count);
      h.pointer(h.pedal, 'pointercancel', 2); assert.equal(h.api.state.active, false); assert.equal(look.active, true);
      h.pointer(h.wheel, 'pointerup', 1); assert.equal(look.active, true);
      h.pointer(h.canvas, 'pointerup', 3); assert.equal(look.active, false); neutral(h);
    } finally { look.destroy(); }
  });
});
test('capture failure uses window move/release; capture release errors are harmless', () => withInput(h => {
  for (const element of [h.wheel, h.pedal]) element.captureFails = true;
  h.pointer(h.wheel, 'pointerdown', 1); h.pointer(h.pedal, 'pointerdown', 2);
  h.pointer(h.win, 'pointermove', 1, 90); near(h.api.state.steering, 2 / 3);
  h.pointer(h.win, 'pointerup', 2); assert.equal(h.api.state.active, false);
  h.pointer(h.win, 'pointerup', 1); neutral(h);
  for (const element of [h.wheel, h.pedal]) { element.captureFails = false; element.releaseFails = true; }
  h.pointer(h.wheel, 'pointerdown', 3); h.pointer(h.pedal, 'pointerdown', 4); h.api.reset(); neutral(h);
}));
test('cancel and capture loss release only their own control', () => {
  for (const type of ['pointercancel', 'lostpointercapture']) withInput(h => {
    h.pointer(h.wheel, 'pointerdown', 1); h.pointer(h.wheel, 'pointermove', 1, 45); h.pointer(h.pedal, 'pointerdown', 2);
    h.pointer(h.pedal, type, 2); assert.equal(h.api.state.active, false); near(h.api.state.steering, 1 / 3);
    h.pointer(h.pedal, 'pointerdown', 3); h.pointer(h.wheel, type, 1);
    assert.equal(h.api.state.active, true); near(h.api.state.steering, 0);
    h.pointer(h.pedal, type, 3); neutral(h);
  });
});
test('blur, pagehide, resize, hidden tab and editable focus reset both pointers and keyboard', () => withInput(h => {
  for (const type of ['blur', 'pagehide', 'resize']) {
    h.pointer(h.wheel, 'pointerdown', 1); h.pointer(h.wheel, 'pointermove', 1, 45); h.pointer(h.pedal, 'pointerdown', 2);
    const n = h.safety; h.win.dispatch(type); neutral(h); assert.equal(h.safety, n + 1);
    h.key('keydown', 'KeyW'); h.key('keydown', 'KeyA'); h.win.dispatch(type); neutral(h);
    h.key('keydown', 'KeyW', { repeat: true }); neutral(h);
  }
  h.pointer(h.wheel, 'pointerdown', 1); h.pointer(h.pedal, 'pointerdown', 2);
  h.doc.dispatch('visibilitychange'); assert.equal(h.api.state.active, true);
  h.doc.hidden = true; h.doc.dispatch('visibilitychange'); neutral(h);
  h.key('keydown', 'Space'); h.doc.dispatch('focusin', { target: new Element([], 'TEXTAREA') }); neutral(h);
}));
test('disable blocks both controls and keyboard; re-enable is neutral and repeat cannot restart', () => withInput(h => {
  h.key('keydown', 'KeyW'); h.pointer(h.wheel, 'pointerdown'); h.api.setEnabled(false); neutral(h);
  assert.equal(h.root.hidden, true);
  for (const element of [h.wheel, h.pedal]) assert.equal(element.getAttribute('aria-disabled'), 'true');
  h.pointer(h.pedal, 'pointerdown', 2); h.key('keydown', 'KeyW'); neutral(h);
  const n = h.inputs.length; h.api.setEnabled(true); assert.equal(h.inputs.length, n + 1); neutral(h);
  h.api.setEnabled(true); assert.equal(h.inputs.length, n + 1);
  h.key('keydown', 'KeyW', { repeat: true }); neutral(h);
  h.key('keydown', 'KeyW'); assert.equal(h.api.state.active, true);
}));
test('W/up/Space give forward gas; A/D/arrows steer with independent release and opposing keys', () => withInput(h => {
  for (const code of ['KeyW', 'ArrowUp', 'Space']) {
    assert.ok(h.key('keydown', code).defaultPrevented); assert.equal(h.api.state.active, true); near(h.api.state.steering, 0);
    h.key('keyup', code); neutral(h);
  }
  for (const [code, steering] of [['KeyA', -1], ['ArrowLeft', -1], ['KeyD', 1], ['ArrowRight', 1]]) {
    h.key('keydown', code); near(h.api.state.steering, steering); assert.equal(h.api.state.active, false); h.key('keyup', code); neutral(h);
  }
  h.key('keydown', 'KeyW'); h.key('keydown', 'KeyD'); near(h.api.state.steering, 1); assert.equal(h.api.state.active, true);
  h.key('keydown', 'KeyA'); near(h.api.state.steering, 0);
  h.key('keyup', 'KeyA'); near(h.api.state.steering, 1);
  h.key('keyup', 'KeyW'); assert.equal(h.api.state.active, false); near(h.api.state.steering, 1);
  h.key('keyup', 'KeyD'); neutral(h);
  h.key('keydown', 'KeyW'); h.key('keydown', 'ArrowUp'); h.key('keydown', 'Space');
  h.key('keyup', 'KeyW'); h.key('keyup', 'Space'); assert.equal(h.api.state.active, true);
  h.key('keyup', 'ArrowUp'); neutral(h);
  for (const key of ['W', 'w', ' ', 'Spacebar']) { h.body.dispatch('keydown', { key }); assert.equal(h.api.state.active, true); h.body.dispatch('keyup', { key }); neutral(h); }
}));
test('keyboard reverse keys, shortcuts, editable fields and secondary mouse buttons are untouched', () => withInput(h => {
  for (const code of ['KeyS', 'ArrowDown', 'KeyR', 'Enter', 'KeyX']) {
    const n = h.inputs.length; assert.equal(h.key('keydown', code).defaultPrevented, false); assert.equal(h.inputs.length, n);
  }
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) assert.equal(h.key('keydown', 'KeyW', { [modifier]: true }).defaultPrevented, false);
  for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) assert.equal(h.key('keydown', 'KeyW', { target: new Element([], tag) }).defaultPrevented, false);
  const editable = new Element(); editable.isContentEditable = true;
  assert.equal(h.key('keydown', 'Space', { target: editable }).defaultPrevented, false);
  for (const element of [h.wheel, h.pedal]) assert.equal(h.pointer(element, 'pointerdown', 1, 0, { button: 2 }).defaultPrevented, false);
  neutral(h);
}));
test('mixed keyboard/touch preserves the other axis without latent throttle after pedal release', () => withInput(h => {
  h.key('keydown', 'KeyW'); h.pointer(h.wheel, 'pointerdown', 1); h.pointer(h.wheel, 'pointermove', 1, 90);
  assert.equal(h.api.state.active, true); near(h.api.state.steering, 2 / 3);
  h.key('keydown', 'KeyA'); near(h.api.state.steering, 2 / 3);
  h.pointer(h.wheel, 'pointerup', 1); assert.equal(h.api.state.active, true); near(h.api.state.steering, 0);
  h.key('keyup', 'KeyW'); neutral(h);
  h.key('keydown', 'KeyA'); h.pointer(h.pedal, 'pointerdown', 2); near(h.api.state.steering, -1);
  h.key('keydown', 'KeyW'); h.pointer(h.pedal, 'pointerup', 2); assert.equal(h.api.state.active, false); near(h.api.state.steering, -1);
  h.key('keyup', 'KeyA'); neutral(h);
  h.key('keydown', 'KeyW'); h.pointer(h.pedal, 'pointerdown', 3); h.pointer(h.pedal, 'pointerup', 3); neutral(h);
  h.key('keydown', 'KeyW', { repeat: true }); neutral(h); h.key('keyup', 'KeyW'); neutral(h);
}));
test('synthetic clicks do not drive; gesture protections and destroy remove all owned listeners', () => {
  const h = setup();
  for (const type of ['dblclick', 'contextmenu', 'selectstart', 'dragstart', 'gesturestart', 'gesturechange', 'gestureend']) assert.ok(h.root.dispatch(type).defaultPrevented);
  assert.equal(h.root.dispatch('click').defaultPrevented, false);
  h.pointer(h.wheel, 'pointerdown', 1); h.pointer(h.pedal, 'pointerdown', 2); h.api.destroy(); neutral(h);
  const n = h.inputs.length, s = h.safety;
  h.api.destroy(); h.api.reset(); h.api.setEnabled(true); h.pointer(h.pedal, 'pointerdown', 2); h.key('keydown', 'Space'); h.win.dispatch('blur');
  assert.equal(h.inputs.length, n); assert.equal(h.safety, s); assert.equal(h.api.state.enabled, false);
  for (const node of [h.root, h.wheel, h.pedal, h.win, h.doc]) for (const handlers of node.listeners.values()) assert.equal(handlers.length, 0);
});
test('actual production model receives forward throttle and release exactly matches legacy coast', () => withInput(h => {
  const model = createDrivingModel({ x: 0, z: 0 }), coast = createDrivingModel({ x: 0, z: 0 });
  h.pointer(h.wheel, 'pointerdown', 1); h.pointer(h.wheel, 'pointermove', 1, 45);
  model.setInput(h.inputs.at(-1)); coast.setInput({ steering: 1 / 3, active: false });
  for (let i = 0; i < 120; i++) { model.step(1 / 120); coast.step(1 / 120); }
  near(model.state.speed, 0); assert.equal(model.state.speedDemand, null);
  h.pointer(h.wheel, 'pointerup', 1); h.pointer(h.pedal, 'pointerdown', 2);
  model.setInput(h.inputs.at(-1)); coast.setInput({ steering: 0, active: true });
  for (let i = 0; i < 240; i++) { model.step(1 / 120); coast.step(1 / 120); }
  assert.ok(model.state.speed > 0); assert.equal(model.state.gear, 'D'); assert.equal(model.state.speedDemand, null);
  const speed = model.state.speed; h.pointer(h.pedal, 'pointerup', 2); model.setInput(h.inputs.at(-1));
  assert.equal(model.state.active, false); assert.equal(model.state.speedDemand, null); near(model.state.speed, speed);
  coast.setInput({ steering: 0, active: false });
  for (let i = 0; i < 120; i++) { model.step(1 / 120); coast.step(1 / 120); assert.deepEqual(model.state, coast.state); }
  assert.ok(model.state.speed > 0 && model.state.speed < speed, 'Release coasts forward rather than applying an analog brake');
}));
test('HTML retains walking stick and exposes described wheel/pedal with no gear or drive stick', () => {
  const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  const driving = html.slice(html.indexOf('id="drive-ui"'), html.indexOf('<div id="loading"'));
  for (const id of ['steering-wheel', 'gas-pedal', 'drive-tip', 'fuel-hud', 'speed-value', 'drive-status']) assert.equal([...driving.matchAll(new RegExp(`id="${id}"`, 'g'))].length, 1);
  assert.equal([...driving.matchAll(/<button\b/g)].length, 3);
  assert.equal([...driving.matchAll(/aria-describedby="drive-tip"/g)].length, 3);
  assert.match(driving, /aria-keyshortcuts="A D ArrowLeft ArrowRight"/);
  assert.match(driving, /aria-keyshortcuts="W ArrowUp Space"/);
  assert.match(driving, /aria-pressed="false"/); assert.match(driving, /role="slider"/);
  assert.match(driving, /src="\.\/assets\/hud-steering\.svg"/);
  assert.ok(fs.existsSync(new URL('../dist/assets/hud-steering.svg', import.meta.url)));
  for (const text of ['Поворачивайте руль пальцем', 'Удерживайте газ', 'Отпустите газ — накат']) assert.ok(driving.includes(text));
  assert.doesNotMatch(driving, /drive-stick|drive-thumb|gear-control|gear-note|gear-panel|data-gear|вниз — назад|удерживайте руль/i);
  assert.match(driving, /id="drive-status"[^>]*><\/span>/);
  for (const id of ['walk-stick', 'walk-thumb', 'jump-button']) assert.equal([...html.matchAll(new RegExp(`id="${id}"`, 'g'))].length, 1);
});
test('CSS separates hit targets, keeps fuel/speed row and supports focus/reduced motion', () => {
  const css = fs.readFileSync(new URL('../dist/vehicle-controls.css', import.meta.url), 'utf8');
  assert.match(css, /\.vehicle-controls \{[^}]*pointer-events: none;/s);
  for (const selector of ['steering-wheel', 'gas-pedal']) assert.match(css, new RegExp(`\\.${selector} \\{[^}]*pointer-events: auto;[^}]*touch-action: none;`, 's'));
  assert.match(css, /transform: rotate\(var\(--steering-angle, 0deg\)\)/);
  assert.match(css, /\.steering-wheel\.is-returning \{ transition: transform 260ms/);
  assert.match(css, /\.gas-pedal\.is-active \{/); assert.match(css, /:focus-visible/); assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.drive-bottom-row \{[^}]*flex-wrap: nowrap;[^}]*align-items: center;[^}]*height: 44px/);
  assert.match(css, /max-width: 424px/); assert.match(css, /flex-basis: 100px/); assert.match(css, /#drive-status:empty \{ display: none; \}/);
  assert.doesNotMatch(css, /drive-stick|drive-thumb|gear-control|gear-handle|gear-note/);
  assert.equal([...css].filter(c => c === '{').length, [...css].filter(c => c === '}').length);
});
test('static visual footprints keep wheel/pedal apart, above fuel/speed and below top actions', () => {
  const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  for (const [w, h] of [[320, 480], [320, 568], [360, 640], [390, 844], [540, 960], [760, 1024], [501, 320], [568, 320], [844, 390], [1366, 768]]) {
    for (const [bottom, left, right] of [[0, 0, 0], [34, 44, 44], [21, 44, 0], [21, 0, 44]]) {
      let size = Math.max(120, Math.min(185, .35 * w, .4 * h)), gap = Math.max(108, .1 * h + 18);
      let pedalWidth = 92, pedalHeight = 132;
      if (w <= 500) { size = 132; gap = 158; pedalWidth = 78; pedalHeight = 116; }
      if (h <= 540) { pedalWidth = 72; pedalHeight = 100; }
      if (h <= 650 && w <= 500) gap = 150;
      if (h <= 540 && w <= 500) { size = 112; gap = 128; }
      if (h <= 500 && w >= 501) { size = 112; gap = 96; }
      if (h >= 501 && w >= 501 && w <= 760) gap = 158;
      if (h <= 420 && w >= 501) { size = Math.min(112, .2875 * h); pedalHeight = Math.min(100, .2875 * h); gap = 82; }
      const wheel = { x: w <= 500 ? Math.max(20, left + 10) : Math.max(25, left + 14), y: h - bottom - gap - size, w: size, h: size };
      const pedal = { x: w - (w <= 500 ? Math.max(20, right + 10) : Math.max(25, right + 14)) - pedalWidth, y: h - bottom - gap - pedalHeight, w: pedalWidth, h: pedalHeight + 3 };
      assert.ok(!intersects(wheel, pedal), `${w}x${h}: controls overlap`);
      const available = w - left - right - 24, width = Math.min(424, available);
      const row = { x: left + 12 + (available - width) / 2, y: h - bottom - 56, w: width, h: 44 };
      const top = { x: Math.max(13, left + 8), y: 25, w: 86, h: h <= 420 ? 64 : 108 };
      for (const control of [wheel, pedal]) {
        assert.ok(!intersects(control, row), `${w}x${h}: control overlaps fuel/speed`);
        assert.ok(control.x >= left && control.x + control.w <= w - right && control.y >= 0, `${w}x${h}: control clipped`);
        assert.ok(!intersects(control, top), `${w}x${h}: control overlaps top action`);
      }
      const speedWidth = w <= 540 ? 100 : 128, rowGap = w <= 540 ? 8 : 12;
      assert.ok(width - speedWidth - rowGap >= 100, `${w}x${h}: fuel number too narrow`);
    }
  }
});
console.log(`Wheel and gas pedal: ${passed} checks passed. Fake DOM, production model and static layout only; browser rendering/physical touch unverified.`);
