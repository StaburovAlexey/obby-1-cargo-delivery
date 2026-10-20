import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createInputDom } from './fixtures/vehicle-input-dom.mjs';
import { createVehicleLiveryShop } from '../dist/vehicle-livery-shop.js';
import { VEHICLE_LIVERY_CATALOG } from '../dist/vehicle-livery-catalog.js';

function fixture(options = {}) {
  const { doc, win, root } = createInputDom(), Element = root.constructor;
  doc.parent = win;
  const make = tag => {
    const node = new Element(); node.tagName = tag.toUpperCase(); node.ownerDocument = doc;
    node.focus = () => { doc.activeElement = node; };
    node.contains = target => { for (let current = target; current; current = current.parent) if (current === node) return true; return false; };
    node.remove = () => { node.parent.children = node.parent.children.filter(child => child !== node); node.parent = null; };
    return node;
  };
  doc.createElement = make;
  doc.body = make('body'); doc.body.parent = doc;
  doc.getElementById = id => doc.body.all().find(node => node.getAttribute('id') === id) ?? null;
  const button = doc.body.append(make('button')); button.setAttribute('id', 'vehicle-livery-button');
  const world = doc.body.append(make('main')); world.inert = false;
  const alreadyInert = doc.body.append(make('aside')); alreadyInert.inert = true;
  doc.activeElement = button;
  const previews = [], closes = [], changes = [], order = [];
  const ui = createVehicleLiveryShop(doc, {
    button,
    onPreview: (vehicleId, liveryId) => { previews.push([vehicleId, liveryId]); return true; },
    onClose: () => { closes.push(true); order.push('close'); },
    onOpenChange: open => { changes.push(open); order.push(open ? 'open' : 'sync-closed'); },
    ...options,
  });
  const get = id => doc.getElementById(`vehicle-livery-${id}`);
  const row = id => get('list').children.find(node => node.getAttribute('data-vehicle-id') === id);
  const rail = id => ui.getPreviewHost(id);
  const status = id => row(id).all().find(node => node.getAttribute('role') === 'status');
  const apply = id => row(id).all().find(node => node.getAttribute('data-apply-vehicle') === id);
  return { doc, win, button, world, alreadyInert, ui, previews, closes, changes, order, get, row, rail, status, apply };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('Constructor creates all 11 minimal rows with only carousel and Select button without callback or persistence side effects', () => {
  const f = fixture();
  assert.equal(f.ui.isOpen(), false);
  assert.equal(f.get('menu').hidden, true);
  assert.equal(f.get('list').children.length, 11);
  assert.equal(f.doc.body.all().filter(node => node.getAttribute('role') === 'radio').length, 0);
  assert.deepEqual(f.previews, []); assert.deepEqual(f.closes, []); assert.deepEqual(f.changes, []);
  for (const vehicle of VEHICLE_LIVERY_CATALOG) {
    assert.equal(f.ui.getSelection(vehicle.id), 'base');
    assert.equal(f.rail(vehicle.id).tabIndex, 0);
    assert.equal(f.apply(vehicle.id).textContent, 'Выбрать');
    assert.equal(f.row(vehicle.id).all().filter(node => node.tagName === 'BUTTON').length, 1);
    assert.equal(f.row(vehicle.id).children.length, 3, 'Carousel, Select button, screen-reader status only');
  }
  f.ui.destroy();
});

test('All cars including locked vehicles preview immediately; base stays owned and purchasing never activates', () => {
  const f = fixture(); f.ui.show(); f.ui.setSection('liveries');
  for (const vehicle of VEHICLE_LIVERY_CATALOG) for (const variant of vehicle.variants) {
    f.ui.preview(vehicle.id, variant.id);
    assert.deepEqual(f.previews.at(-1), [vehicle.id, variant.id]);
    assert.equal(f.ui.getSelection(vehicle.id), variant.id);
    assert.equal(f.apply(vehicle.id).disabled, variant.id !== 'base');
    assert.equal(f.status(vehicle.id).getAttribute('data-state'), variant.id === 'base' ? 'owned' : 'preview');
    assert.equal(vehicle.variants[0].equipped, true);
    assert.ok(vehicle.variants.slice(1).every(item => !item.owned && !item.equipped));
  }
  const before = f.previews.length; f.rail('bmwreward').dispatch('click');
  assert.equal(f.previews.length, before);
  assert.equal(f.ui.preview('unknown', 'base'), false);
  assert.equal(f.ui.preview('pickup', 'made-up'), false);
  f.ui.close();
  assert.equal(f.ui.preview('pickup', 'neon'), false);
  assert.equal(f.previews.length, before);
  f.ui.destroy();
});

test('Close, Escape, backdrop, leave, and repeated opens reset every selection, release input, and restore focus', () => {
  const f = fixture();
  for (const method of ['close', 'escape', 'backdrop', 'leave']) {
    f.button.focus(); f.button.dispatch('click'); f.ui.setSection('liveries');
    assert.equal(f.ui.isOpen(), true); assert.equal(f.get('menu').hidden, false);
    assert.equal(f.get('panel').getAttribute('aria-modal'), 'true');
    assert.equal(f.world.inert, true); assert.equal(f.alreadyInert.inert, true);
    assert.ok(f.doc.activeElement === f.get('close') || f.doc.activeElement === f.doc.getElementById('vehicle-shop-back'));
    assert.equal(f.button.getAttribute('aria-expanded'), 'true');
    const opens = f.changes.length; f.ui.show(); f.ui.setSection('liveries'); assert.equal(f.changes.length, opens);
    f.ui.preview('pickup', 'neon'); f.ui.preview('bmwreward', 'biome');
    f.get('panel').dispatch('click'); assert.equal(f.ui.isOpen(), true);
    if (method === 'close') f.get('close').dispatch('click');
    if (method === 'escape') f.doc.dispatch('keydown', { key: 'Escape' });
    if (method === 'backdrop') f.get('menu').dispatch('click');
    if (method === 'leave') f.ui.setVisible(false);
    assert.equal(f.ui.isOpen(), false); assert.equal(f.get('menu').hidden, true);
    assert.equal(f.button.getAttribute('aria-expanded'), 'false');
    assert.equal(f.world.inert, false); assert.equal(f.alreadyInert.inert, true);
    assert.equal(f.doc.body.classList.contains('vehicle-livery-shop-open'), false);
    assert.deepEqual(f.order.slice(-2), ['sync-closed', 'close'], 'Host sync runs before camera/material restoration');
    for (const vehicle of VEHICLE_LIVERY_CATALOG) assert.equal(f.ui.getSelection(vehicle.id), 'base');
    if (method !== 'leave') assert.equal(f.doc.activeElement, f.button);
    const closes = f.closes.length; f.ui.close(); assert.equal(f.closes.length, closes);
  }
  assert.deepEqual(f.changes, [true, false, true, false, true, false, true, false]);
  f.ui.destroy();
});

test('Visibility controls only the hangar trigger and never opens or reopens the shop', () => {
  const f = fixture();
  f.ui.setVisible(false); assert.equal(f.button.hidden, true); assert.equal(f.ui.show(), false);
  f.ui.setVisible(true); assert.equal(f.button.hidden, false); assert.equal(f.ui.isOpen(), false);
  f.ui.show(); f.ui.setSection('liveries'); f.ui.setVisible(true); assert.equal(f.ui.isOpen(), true); assert.deepEqual(f.changes, [true]);
  f.ui.close(); f.ui.setVisible(true); assert.equal(f.ui.isOpen(), false);
  f.ui.show(); f.ui.setSection('liveries'); f.ui.preview('pickup', 'neon'); f.ui.setVisible(false);
  assert.equal(f.ui.isOpen(), false); assert.equal(f.ui.getSelection('pickup'), 'base');
  assert.equal(f.closes.length, 2); f.ui.destroy();
});

test('Keyboard arrows, Home/End and focus trapping work without exposing background controls', () => {
  const f = fixture(); f.ui.open(); f.ui.setSection('liveries');
  let event = f.rail('pickup').dispatch('keydown', { key: 'ArrowRight' });
  assert.equal(event.defaultPrevented, true);
  assert.equal(f.ui.getSelection('pickup'), 'neon');
  assert.equal(f.doc.activeElement, f.rail('pickup'));
  f.rail('pickup').dispatch('keydown', { key: 'End' }); assert.equal(f.ui.getSelection('pickup'), 'biome');
  f.rail('pickup').dispatch('keydown', { key: 'ArrowLeft' }); assert.equal(f.ui.getSelection('pickup'), 'racing');
  f.rail('pickup').dispatch('keydown', { key: 'Home' }); assert.equal(f.ui.getSelection('pickup'), 'base');
  f.get('close').focus();
  event = f.get('close').dispatch('keydown', { key: 'Tab', shiftKey: true });
  assert.equal(event.defaultPrevented, true); assert.equal(f.doc.activeElement.getAttribute('data-apply-vehicle'), 'bmwreward');
  event = f.doc.activeElement.dispatch('keydown', { key: 'Tab' });
  assert.equal(event.defaultPrevented, true); assert.ok(f.doc.activeElement === f.get('close') || f.doc.activeElement === f.doc.getElementById('vehicle-shop-back'));
  f.world.dispatch('focusin'); assert.ok(f.doc.activeElement === f.get('close') || f.doc.activeElement === f.doc.getElementById('vehicle-shop-back'));
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'touchstart', 'touchmove', 'touchend', 'touchcancel', 'wheel', 'keyup']) {
    assert.equal(f.get('close').dispatch(type).stopped, true, type);
  }
  f.ui.destroy();
});

function pointer(rail, type, x, y, extra = {}) {
  return rail.dispatch(type, { pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y, ...extra });
}

test('Horizontal swipes select one finish, release capture, and suppress their synthetic click', () => {
  const f = fixture(); f.ui.open(); f.ui.setSection('liveries'); const rail = f.rail('pickup');
  pointer(rail, 'pointerdown', 100, 20);
  assert.equal(rail.hasPointerCapture(1), false, 'Do not capture before horizontal intent is known');
  assert.equal(pointer(rail, 'pointermove', 40, 24).defaultPrevented, true);
  assert.equal(rail.hasPointerCapture(1), true);
  pointer(rail, 'pointerup', 40, 24);
  assert.equal(f.ui.getSelection('pickup'), 'neon'); assert.equal(rail.hasPointerCapture(1), false);
  f.rail('pickup').dispatch('click', { detail: 1 });
  assert.equal(f.ui.getSelection('pickup'), 'neon');
  pointer(rail, 'pointerdown', 100, 20); pointer(rail, 'pointermove', 150, 21); pointer(rail, 'pointerup', 150, 21);
  assert.equal(f.ui.getSelection('pickup'), 'base');
  // Keyboard navigation stays available without click targets.
  f.rail('pickup').dispatch('keydown', { key: 'ArrowRight' }); f.rail('pickup').dispatch('keydown', { key: 'ArrowRight' }); assert.equal(f.ui.getSelection('pickup'), 'anime');
  f.ui.destroy();
});

test('Vertical gestures keep native scrolling; cancelled, tiny, secondary, and interrupted gestures never preview', () => {
  const f = fixture(); f.ui.open(); f.ui.setSection('liveries'); const rail = f.rail('snowrunner');
  pointer(rail, 'pointerdown', 100, 20);
  assert.equal(pointer(rail, 'pointermove', 105, 65).defaultPrevented, false);
  assert.equal(pointer(rail, 'pointermove', 10, 80).defaultPrevented, false, 'Vertical axis remains locked after diagonal movement');
  pointer(rail, 'pointerup', 10, 80);
  assert.equal(f.previews.length, 0); assert.equal(rail.hasPointerCapture(1), false);
  pointer(rail, 'pointerdown', 100, 20); pointer(rail, 'pointermove', 40, 21); pointer(rail, 'pointercancel', 40, 21);
  assert.equal(f.previews.length, 0); assert.equal(rail.hasPointerCapture(1), false);
  pointer(rail, 'pointerdown', 100, 20); pointer(rail, 'pointermove', 78, 21); pointer(rail, 'pointerup', 78, 21);
  assert.equal(f.previews.length, 0);
  pointer(rail, 'pointerdown', 100, 20, { isPrimary: false, pointerId: 2 });
  pointer(rail, 'pointermove', 30, 20, { pointerId: 2 }); pointer(rail, 'pointerup', 30, 20, { pointerId: 2 });
  assert.equal(f.previews.length, 0);
  pointer(rail, 'pointerdown', 100, 20); pointer(rail, 'pointermove', 20, 21); f.win.dispatch('blur');
  assert.equal(rail.hasPointerCapture(1), false); pointer(rail, 'pointerup', 20, 21); assert.equal(f.previews.length, 0);
  pointer(rail, 'pointerdown', 100, 20); pointer(rail, 'pointermove', 20, 21); f.ui.close();
  assert.equal(rail.hasPointerCapture(1), false); f.ui.open(); f.ui.setSection('liveries'); pointer(rail, 'pointerup', 20, 21);
  assert.equal(f.previews.length, 0);
  f.ui.destroy();
});

test('Preview promises show loading/error truthfully and ignore older finish results', async () => {
  const pending = []; const f = fixture({ onPreview: (...args) => new Promise((resolve, reject) => pending.push({ args, resolve, reject })) });
  f.ui.open(); f.ui.setSection('liveries'); f.ui.preview('pickup', 'neon');
  assert.equal(pending.length, 1, 'Callback fires synchronously');
  assert.equal(f.status('pickup').getAttribute('data-state'), 'loading');
  f.ui.preview('pickup', 'anime');
  pending[0].reject(new Error('old failure')); await flush();
  assert.equal(f.ui.getSelection('pickup'), 'anime'); assert.equal(f.status('pickup').getAttribute('data-state'), 'loading');
  pending[1].resolve(true); await flush(); assert.equal(f.status('pickup').getAttribute('data-state'), 'preview');
  f.ui.preview('pickup', 'racing'); pending[2].resolve(false); await flush();
  assert.equal(f.status('pickup').getAttribute('data-state'), 'error');
  assert.match(f.status('pickup').textContent, /Не удалось/);
  f.ui.preview('pickup', 'racing'); assert.equal(pending.length, 4, 'Same finish can be retried');
  pending[3].resolve(true); await flush(); assert.equal(f.status('pickup').getAttribute('data-state'), 'preview');
  f.ui.destroy();
});

test('Switching cars, closing, reopening and destroying isolate asynchronous preview sessions', async () => {
  const pending = []; const f = fixture({ onPreview: (...args) => new Promise((resolve, reject) => pending.push({ args, resolve, reject })) });
  f.ui.open(); f.ui.setSection('liveries'); f.ui.preview('pickup', 'neon'); f.ui.preview('bmwreward', 'biome');
  assert.equal(f.row('pickup').getAttribute('data-active'), 'false'); assert.equal(f.row('bmwreward').getAttribute('data-active'), 'true');
  pending[0].resolve(true); await flush();
  assert.equal(f.status('pickup').getAttribute('data-state'), 'preview'); assert.equal(f.status('bmwreward').getAttribute('data-state'), 'loading');
  f.ui.close(); f.ui.open(); f.ui.setSection('liveries'); f.ui.preview('bmwreward', 'racing');
  pending[1].resolve(true); await flush();
  assert.equal(f.ui.getSelection('bmwreward'), 'racing'); assert.equal(f.status('bmwreward').getAttribute('data-state'), 'loading');
  pending[2].reject(new Error('current failure')); await flush(); assert.equal(f.status('bmwreward').getAttribute('data-state'), 'error');
  f.ui.preview('bmwreward', 'anime'); f.ui.destroy(); pending[3].resolve(true); await flush();
  assert.equal(f.ui.isOpen(), false); assert.equal(f.get('menu'), null); assert.equal(f.world.inert, false);
  assert.equal(f.ui.show(), false); assert.equal(f.ui.preview('pickup', 'neon'), false);
});

test('Language can follow host or switch explicitly; access gate blocks opening and off-hangar previews', () => {
  let language = 'ru', allowed = false;
  const f = fixture({ language: () => language, canOpen: () => allowed });
  assert.equal(f.get('title').textContent, 'Магазин'); assert.equal(f.ui.open(), false);
  assert.equal(f.world.inert, false); assert.equal(f.previews.length, 0);
  allowed = true; f.ui.open(); f.ui.setSection('liveries'); language = 'en'; f.ui.refresh();
  assert.equal(f.get('title').textContent, 'Liveries'); assert.equal(f.button.getAttribute('aria-label'), 'Shop');
  assert.equal(f.get('menu').getAttribute('lang'), 'en');
  assert.equal(f.apply('bmwreward').textContent, 'Select');
  f.ui.preview('bmwreward', 'biome'); assert.match(f.status('bmwreward').textContent, /Preview only/);
  f.ui.setLanguage('ru'); assert.equal(f.get('title').textContent, 'Расцветки');
  allowed = false; assert.equal(f.ui.preview('pickup', 'neon'), false); f.ui.setVisible(false);
  assert.equal(f.ui.isOpen(), false); f.ui.destroy();
});

test('Disposal is idempotent, removes all listeners and handles reentrant close safely', () => {
  let ui; const f = fixture({ onOpenChange: open => { if (!open) ui.close(); } }); ui = f.ui;
  ui.show(); ui.setSection('liveries'); ui.preview('rover', 'anime');
  const nodes = [f.doc, f.win, f.button, ...f.get('menu').all(), f.get('menu')];
  ui.destroy(); ui.destroy();
  assert.equal(f.closes.length, 1); assert.equal(f.world.inert, false); assert.equal(f.get('menu'), null);
  for (const node of nodes) for (const listeners of node.listeners.values()) assert.equal(listeners.size, 0);
  f.button.dispatch('click'); assert.equal(ui.isOpen(), false);
});

test('Styling preserves visible actual-car preview, vertical scroll, touch targets, and reduced motion', () => {
  const css = fs.readFileSync(new URL('../dist/vehicle-livery-shop.css', import.meta.url), 'utf8');
  const js = fs.readFileSync(new URL('../dist/vehicle-livery-shop.js', import.meta.url), 'utf8');
  assert.match(css, /width:min\(100%,440px\)/);
  assert.match(css, /max-height:92dvh/);
  assert.match(css, /\.vehicle-livery-scroll\{[^}]*overflow-y:auto[^}]*min-height:0/);
  assert.match(css, /\.item-carousel\{[^}]*touch-action:pan-y/);
  assert.match(css, /\.vehicle-livery-close\{[^}]*width:44px;height:44px/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(js, /localStorage|sessionStorage|saveCareer|purchaseVehicle|spendMoney|fetch\(/);
});


test('A vertical mouse drag released outside the carousel cannot strand the next swipe', () => {
  const f = fixture(); f.ui.open(); f.ui.setSection('liveries'); const rail = f.rail('pickup');
  pointer(rail, 'pointerdown', 100, 20);
  pointer(rail, 'pointermove', 105, 90);
  // Emulate window capture before the sibling/menu stops bubbling.
  f.win.dispatch('pointerup', { target: f.get('close'), pointerId: 1, clientX: 200, clientY: 400 });
  f.get('close').dispatch('pointerup', { pointerId: 1 });
  pointer(rail, 'pointerdown', 100, 20);
  pointer(rail, 'pointermove', 30, 22);
  pointer(rail, 'pointerup', 30, 22);
  assert.equal(f.ui.getSelection('pickup'), 'neon');
  f.ui.dispose();
});


test('Looping swipe wraps both directions without click-to-select behavior or hangar mutation', () => {
  const f = fixture(); f.ui.open(); f.ui.setSection('liveries'); const view = f.rail('pickup');
  pointer(view, 'pointerdown', 100, 20); pointer(view, 'pointermove', 170, 20); pointer(view, 'pointerup', 170, 20);
  assert.equal(f.ui.getSelection('pickup'), 'biome');
  assert.equal(f.apply('pickup').disabled, true);
  view.dispatch('click'); assert.equal(f.ui.getSelection('pickup'), 'biome');
  pointer(view, 'pointerdown', 100, 20); pointer(view, 'pointermove', 20, 20); pointer(view, 'pointerup', 20, 20);
  assert.equal(f.ui.getSelection('pickup'), 'base');
  assert.equal(f.apply('pickup').disabled, false);
  f.ui.destroy();
});

test('Dragging drives fractional model position and release eases continuously across the wrap', () => {
  const f = fixture(), frames = new Map(); let serial = 0;
  f.win.requestAnimationFrame = fn => { frames.set(++serial, fn); return serial; };
  f.win.cancelAnimationFrame = id => frames.delete(id);
  const tick = time => { const work = [...frames.values()]; frames.clear(); work.forEach(fn => fn(time)); };
  f.ui.open(); f.ui.setSection('liveries'); const view = f.rail('pickup');
  pointer(view, 'pointerdown', 100, 20); pointer(view, 'pointermove', 170, 20);
  assert.ok(view.carouselPosition < 0 && view.carouselPosition > -1);
  const dragged = view.carouselPosition;
  pointer(view, 'pointerup', 170, 20);
  assert.equal(view.carouselPosition, dragged, 'Release must not jump to an integer');
  tick(100); tick(230);
  assert.ok(view.carouselPosition < dragged && view.carouselPosition > -1);
  tick(400); assert.equal(view.carouselPosition, -1, 'Last item wraps backward instead of traversing all five');
  view.dispatch('keydown', { key: 'ArrowRight' }); tick(500); tick(800);
  assert.equal(view.carouselPosition, 0);
  assert.equal(f.ui.getSelection('pickup'), 'base');
  f.ui.close(); assert.equal(view.carouselPosition, 0); assert.equal(frames.size, 0);
  f.ui.destroy(); assert.equal(frames.size, 0);
});

test('Select is the only commit action and locked finishes are rejected even after DOM tampering', async () => {
  const applied = []; const f = fixture({ onApply: (car, finish) => { applied.push([car, finish]); return true; } });
  f.ui.open(); f.ui.setSection('liveries'); const view = f.rail('pickup');
  view.dispatch('click'); assert.deepEqual(applied, []);
  f.ui.preview('pickup', 'neon'); f.apply('pickup').disabled = false; f.apply('pickup').dispatch('click');
  assert.deepEqual(applied, []);
  f.ui.preview('pickup', 'base'); f.apply('pickup').dispatch('click'); await flush();
  assert.deepEqual(applied, [['pickup', 'base']]);
  assert.equal(f.apply('pickup').textContent, 'Выбрать', 'No extra applied/error caption is introduced');
  f.ui.destroy();
});

test('Interrupting a settle animation starts the next drag from its visible fractional position', () => {
  const f = fixture(), frames = new Map(); let serial = 0;
  f.win.requestAnimationFrame = fn => { frames.set(++serial, fn); return serial; };
  f.win.cancelAnimationFrame = id => frames.delete(id);
  const tick = time => { const work = [...frames.values()]; frames.clear(); work.forEach(fn => fn(time)); };
  f.ui.open(); f.ui.setSection('liveries'); const view = f.rail('pickup');
  view.dispatch('keydown', { key: 'ArrowRight' }); tick(100); tick(120);
  const before = view.carouselPosition;
  assert.ok(before > 0 && before < .5);
  pointer(view, 'pointerdown', 100, 20); pointer(view, 'pointermove', 90, 20);
  assert.ok(view.carouselPosition > before && view.carouselPosition < before + .11, 'No jump toward the previous target');
  pointer(view, 'pointercancel', 90, 20); tick(200); tick(500);
  assert.equal(view.carouselPosition, 1);
  f.ui.destroy();
});

test('Shop opens category artwork with live translated labels and no renderer until a category is selected', async () => {
 const calls=[],sections=[], f=fixture({autoPreview:true,onNeonPreview:id=>{calls.push(id);return true;},onSectionChange:id=>sections.push(id)});
 f.ui.open(); assert.equal(f.ui.getSection(),'categories'); assert.equal(f.previews.length,0);
 const entries=f.doc.body.all().filter(n=>n.getAttribute('data-shop-category'));
 assert.equal(entries.length,2); assert.equal(entries[0].children[1].textContent,'Новый внешний вид!');
 assert.ok(entries.every(n=>n.children[0].tagName==='IMG'&&n.children[0].src.endsWith('.webp')));
 entries[1].dispatch('click');await flush();assert.equal(f.ui.getSection(),'neon');assert.deepEqual(calls,['red']);
 const host=f.ui.getNeonPreviewHost();host.dispatch('keydown',{key:'ArrowRight'});await flush();assert.equal(f.ui.getNeonSelection(),'orange');
 f.ui.setLanguage('en');assert.equal(f.doc.getElementById('vehicle-neon-color').textContent,'Orange');assert.equal(entries[0].children[1].textContent,'New look!');
 assert.equal(f.ui.preview('pickup','anime'),false);assert.equal(f.previews.length,0);
 f.doc.getElementById('vehicle-shop-back').dispatch('click'); assert.equal(f.ui.getSection(),'categories');
 entries[0].dispatch('click');assert.equal(f.previews.length,11);assert.equal(f.ui.previewNeon('blue'),false);
 f.ui.close();f.ui.open();assert.equal(f.ui.getSection(),'categories');assert.equal(f.ui.getNeonSelection(),'red');
 assert.deepEqual(sections,['neon','categories','liveries']);f.ui.destroy();
});

test('Shop action and car purchase buttons share the exact green appearance rule',()=>{
 const css=fs.readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');
 assert.match(css,/\.buy-button, \.vehicle-livery-card \.vehicle-livery-apply \{[^}]*background: #20ac47;[^}]*text-shadow: var\(--hud-shadow\)/);
 assert.match(css,/\.buy-button\[data-affordable="false"\], \.vehicle-livery-card \.vehicle-livery-apply:disabled/);
});
