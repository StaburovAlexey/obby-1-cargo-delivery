import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { cloneVehicleForLiveryPreview, createVehicleLiveryPreview } from '../dist/vehicle-livery-preview.js';
import { createVehicleLiveryShop } from '../dist/vehicle-livery-shop.js';
import { createInputDom } from './fixtures/vehicle-input-dom.mjs';

function dom() {
  const { doc, win, root } = createInputDom(), Element = root.constructor;
  doc.parent = win;
  doc.createElement = tag => {
    const node = new Element(); node.tagName = tag; node.ownerDocument = doc;
    node.focus = () => { doc.activeElement = node; };
    node.remove = () => { if (node.parent) node.parent.children = node.parent.children.filter(item => item !== node); node.parent = null; };
    return node;
  };
  doc.body = doc.createElement('body'); doc.body.parent = doc;
  return { doc, win };
}
function vehicle() {
  const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
  const geometry = new THREE.BoxGeometry(1, 1, 2), material = new THREE.MeshStandardMaterial();
  material.name = 'Material.015'; body.add(new THREE.Mesh(geometry, material));
  group.position.set(100, 10, 30); group.rotation.y = 1; group.visible = false;
  return { group, body, metadata: { id: 'bmwreward' } };
}
test('Clone maps the actual body, exposes the hidden source, and preserves shared resources', () => {
  const original = vehicle(), clone = cloneVehicleForLiveryPreview(original);
  assert.notEqual(clone.body, original.body); assert.equal(clone.group.children[0], clone.body);
  assert.equal(clone.body.children[0].material, original.body.children[0].material);
  assert.equal(clone.body.children[0].geometry, original.body.children[0].geometry);
  assert.equal(clone.group.visible, true); assert.equal(original.group.visible, false);
  assert.deepEqual(clone.group.position.toArray(), [0, 0, 0]);
  assert.deepEqual(original.group.position.toArray(), [100, 10, 30]);
});
test('Renderer rotates only its clone, cancels closed requests, disposes only owned resources, and reopens', async () => {
  const { doc } = dom(), host = doc.createElement('div'); host.clientWidth = 400; host.clientHeight = 220;
  const frames = new Map(), renders = [], renderers = []; let next = 0, resolveTexture;
  const original = vehicle(), sourceMesh = original.body.children[0]; let disposedShared = 0;
  sourceMesh.geometry.addEventListener('dispose', () => disposedShared++);
  sourceMesh.material.addEventListener('dispose', () => disposedShared++);
  const preview = createVehicleLiveryPreview(THREE, host, {
    requestFrame: fn => { frames.set(++next, fn); return next; }, cancelFrame: id => frames.delete(id),
    textureLoader: () => new Promise(resolve => { resolveTexture = resolve; }),
    createRenderer: () => { const renderer = { domElement: doc.createElement('canvas'), setPixelRatio() {}, setClearColor() {}, setSize() {}, render: (scene, camera) => renders.push([scene, camera]), dispose() { this.disposed = true; }, forceContextLoss() {} }; renderers.push(renderer); return renderer; },
  });
  assert.equal(await preview.show(original, 'bmwreward', 'base'), true);
  assert.equal(host.children.length, 1); assert.equal(frames.size, 1);
  const scene = renders.at(-1)[0], pivot = scene.children[0], initialAngle = pivot.rotation.y;
  const tick = time => { const [id, fn] = frames.entries().next().value; frames.delete(id); fn(time); };
  tick(100); tick(150);
  assert.ok(pivot.rotation.y > initialAngle); assert.equal(original.group.rotation.y, 1);
  const pending = preview.show(original, 'bmwreward', 'anime');
  preview.close(); resolveTexture(new THREE.Texture());
  assert.equal(await pending, false); assert.equal(host.children.length, 0); assert.equal(frames.size, 0);
  assert.equal(disposedShared, 0); assert.equal(renderers[0].disposed, true);
  assert.equal(await preview.show(original, 'bmwreward', 'base'), true);
  assert.equal(renderers.length, 2); assert.equal(host.children.length, 1);
  doc.hidden = true; doc.dispatch('visibilitychange'); assert.equal(frames.size, 0);
  doc.hidden = false; doc.dispatch('visibilitychange'); assert.equal(frames.size, 1);
  preview.dispose(); preview.dispose(); assert.equal(await preview.show(original, 'bmwreward', 'base'), false);
  assert.equal(disposedShared, 0); assert.equal(frames.size, 0);
});
test('Shop viewport swipes preview, only owned base applies, and close does not apply', async () => {
  const { doc } = dom(), previews = [], applied = [];
  const shop = createVehicleLiveryShop(doc, { autoPreview: true, onPreview: (...args) => previews.push(args), onApply: (...args) => applied.push(args) });
  shop.open(); assert.equal(previews.length, 11); assert.deepEqual(previews[0], ['pickup', 'base']);
  const host = shop.getPreviewHost(), apply = doc.body.all().find(node => node.getAttribute('data-apply-vehicle') === 'pickup');
  assert.equal(apply.disabled, false); apply.dispatch('click'); await Promise.resolve();
  assert.deepEqual(applied, [['pickup', 'base']]);
  host.dispatch('pointerdown', { pointerId: 1, clientX: 150, clientY: 50 });
  host.dispatch('pointermove', { pointerId: 1, clientX: 80, clientY: 52 });
  host.dispatch('pointerup', { pointerId: 1, clientX: 80, clientY: 52 });
  assert.deepEqual(previews.at(-1), ['pickup', 'neon']); assert.equal(apply.disabled, true);
  apply.dispatch('click'); assert.equal(applied.length, 1);
  shop.close(); assert.equal(applied.length, 1); shop.dispose();
});

test('Every vehicle has its own carousel and independent Apply, with no locked finish bypass', async () => {
  const { doc } = dom(), applied = [];
  const shop = createVehicleLiveryShop(doc, { autoPreview: true, onApply: (...args) => applied.push(args) });
  shop.open();
  const buttons = doc.body.all().filter(node => node.getAttribute('data-apply-vehicle'));
  assert.equal(buttons.length, 11);
  assert.notEqual(shop.getPreviewHost('pickup'), shop.getPreviewHost('bmwreward'));
  shop.preview('pickup', 'anime');
  const pickup = buttons.find(node => node.getAttribute('data-apply-vehicle') === 'pickup');
  const bmw = buttons.find(node => node.getAttribute('data-apply-vehicle') === 'bmwreward');
  assert.equal(pickup.disabled, true); assert.equal(bmw.disabled, false);
  pickup.disabled = false; pickup.dispatch('click'); // DOM mutation cannot bypass ownership policy.
  assert.equal(applied.length, 0);
  bmw.dispatch('click'); bmw.dispatch('click'); await Promise.resolve();
  assert.deepEqual(applied, [['bmwreward', 'base']], 'Double clicks cannot apply twice');
  shop.close(); bmw.dispatch('click'); assert.equal(applied.length, 1);
  shop.dispose();
});
