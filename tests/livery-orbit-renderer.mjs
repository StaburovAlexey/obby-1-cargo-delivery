import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { createVehicleLiveryPreview } from '../dist/vehicle-livery-preview.js';
import { clearVehicleLiveryTextureCache, getVehicleLiveryTextureCacheStats } from '../dist/vehicle-livery-materials.js';
import { VEHICLE_LIVERY_VARIANTS } from '../dist/vehicle-livery-catalog.js';
import { createInputDom } from './fixtures/vehicle-input-dom.mjs';

const flush = async () => { for (let n = 0; n < 10; n++) await Promise.resolve(); };
function setup({ deferred = false, reduced = false, failOnce = false } = {}) {
  clearVehicleLiveryTextureCache();
  const { doc, win, root } = createInputDom(), Element = root.constructor;
  doc.createElement = tag => {
    const node = new Element(); node.ownerDocument = doc; node.tagName = tag;
    node.remove = () => { if (node.parent) node.parent.children = node.parent.children.filter(item => item !== node); node.parent = null; };
    return node;
  };
  win.matchMedia = () => ({ matches: reduced });
  const host = doc.createElement('div'); host.clientWidth = 360; host.clientHeight = 240; host.carouselPosition = 0;
  const frames = new Map(), captures = [], loads = [], pending = new Map(); let next = 0, didFail = false;
  const renderer = { domElement: doc.createElement('canvas'), disposed: 0, losses: 0,
    setPixelRatio() {}, setClearColor(color, alpha) { this.clearAlpha = alpha; }, setSize() {},
    render(scene, camera) { captures.push({ scene, camera }); },
    dispose() { this.disposed++; }, forceContextLoss() { this.losses++; },
  };
  const preview = createVehicleLiveryPreview(THREE, host, {
    createRenderer: () => renderer,
    requestFrame: fn => { frames.set(++next, fn); return next; }, cancelFrame: id => frames.delete(id),
    textureLoader: url => { loads.push(url); if (failOnce && !didFail && url.endsWith('/anime.webp')) { didFail = true; return Promise.reject(new Error('Temporary texture failure')); } return deferred ? new Promise(resolve => pending.set(url, resolve)) : Promise.resolve(new THREE.Texture()); },
  });
  const makeSource = () => {
    const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
    const geometry = new THREE.BoxGeometry(1, 1, 2), material = new THREE.MeshStandardMaterial(); material.name = 'Material.015';
    const mesh = new THREE.Mesh(geometry, material); body.add(mesh);
    group.position.set(18, 3, -10); group.rotation.y = .8; group.visible = false;
    return { group, body, mesh, metadata: { id: 'bmwreward' } };
  };
  const tick = time => { const work = [...frames]; frames.clear(); for (const [, fn] of work) fn(time); };
  const orbit = () => captures.at(-1).scene.children[0].children;
  const axes = () => ({ right: new THREE.Vector3(1, 0, 0).applyQuaternion(captures.at(-1).camera.quaternion), back: new THREE.Vector3(0, 0, 1).applyQuaternion(captures.at(-1).camera.quaternion) });
  const resolveLoads = () => { for (const resolve of pending.values()) resolve(new THREE.Texture()); pending.clear(); };
  return { host, frames, captures, loads, pending, renderer, preview, makeSource, tick, orbit, axes, resolveLoads };
}

test('Five catalog variants share an orbit, with the selected car in front and both neighbors behind', async () => {
  const f = setup(), original = f.makeSource();
  const geometry = original.mesh.geometry, material = original.mesh.material; let sharedDisposals = 0;
  geometry.addEventListener('dispose', () => sharedDisposals++); material.addEventListener('dispose', () => sharedDisposals++);
  assert.equal(await f.preview.show(original, 'bmwreward'), true); await flush();
  const cars = f.orbit(), { right, back } = f.axes();
  assert.equal(cars.length, 5); assert.equal(f.loads.length, 4); assert.equal(f.renderer.clearAlpha, 0);
  assert.deepEqual(cars.map(car => car.userData.vehicleLiveryPreview.liveryId), VEHICLE_LIVERY_VARIANTS.map(item => item.id));
  assert.equal(cars.filter(car => car.visible).length, 3);
  assert.deepEqual(cars[0].position.toArray(), [0, 0, 0]); assert.equal(cars[0].scale.x, 1);
  for (const [index, sign] of [[1, 1], [4, -1]]) {
    assert.ok(cars[index].position.dot(right) * sign > 3, 'Adjacent car sits on its expected side');
    assert.ok(cars[index].position.dot(back) < -2, 'Adjacent car sits behind the focused car');
    assert.ok(cars[index].scale.x < 1 && cars[index].scale.x > .7, 'Adjacent car is slightly smaller');
  }
  assert.equal(original.mesh.geometry, geometry); assert.equal(original.mesh.material, material);
  assert.deepEqual(original.group.position.toArray(), [18, 3, -10]); assert.equal(original.group.rotation.y, .8); assert.equal(original.group.visible, false);
  f.preview.dispose(); await flush();
  assert.equal(sharedDisposals, 0); assert.equal(f.renderer.disposed, 1); assert.equal(f.renderer.losses, 1);
  assert.equal(f.frames.size, 0); assert.equal(getVehicleLiveryTextureCacheStats().users, 0); clearVehicleLiveryTextureCache();
});

test('Continuous drag positions render at frame rate and wrap smoothly without rebuilding or repainting cars', async () => {
  const f = setup(), original = f.makeSource();
  await f.preview.show(original, 'bmwreward'); await flush(); f.tick(100);
  const cars = [...f.orbit()], { right } = f.axes(), draws = f.captures.length;
  f.host.carouselPosition = .5; f.tick(116);
  assert.equal(f.captures.length, draws + 1, 'Drag updates are not held to the idle 30 fps limit');
  assert.ok(cars[0].position.dot(right) < -2); assert.ok(cars[1].position.dot(right) > 2);
  assert.ok(Math.abs(cars[0].scale.x - cars[1].scale.x) < 1e-8);
  f.host.carouselPosition = 1; f.tick(132);
  assert.ok(cars[1].position.length() < 1e-8); assert.equal(cars[1].scale.x, 1);
  f.host.carouselPosition = 4.999; f.tick(148); const before = cars.map(car => car.position.clone());
  f.host.carouselPosition = 5.001; f.tick(164);
  for (let i = 0; i < cars.length; i++) assert.ok(cars[i].position.distanceTo(before[i]) < .02, 'Last-to-first movement remains continuous');
  f.host.carouselPosition = -1; f.tick(180);
  assert.ok(cars[4].position.length() < 1e-8); assert.equal(cars[4].scale.x, 1);
  assert.deepEqual(f.orbit(), cars); assert.equal(f.loads.length, 4, 'Swiping reuses the same five prepared variants');
  f.preview.dispose(); clearVehicleLiveryTextureCache();
});

test('Reduced motion stops automatic spin but still follows direct carousel movement', async () => {
  const f = setup({ reduced: true }); await f.preview.show(f.makeSource(), 'bmwreward'); await flush();
  const cars = f.orbit(), angle = cars[0].children[0].rotation.y;
  f.tick(100); f.tick(180); assert.equal(cars[0].children[0].rotation.y, angle);
  f.host.carouselPosition = 2; f.tick(196); assert.ok(cars[2].position.length() < 1e-8);
  f.preview.dispose(); clearVehicleLiveryTextureCache();
});

test('Pending neighbors do not block base, late textures cannot repaint a replaced or closed source, and latest selection wins', async () => {
  const f = setup({ deferred: true }), first = f.makeSource();
  assert.equal(await f.preview.show(first, 'bmwreward', 'base'), true);
  assert.equal(f.pending.size, 4); assert.equal(f.orbit().filter(car => car.visible).length, 1);
  const oldModels = [...f.orbit()];
  const oldSelection = f.preview.show(first, 'bmwreward', 'anime');
  const second = f.makeSource(), geometry = second.mesh.geometry, material = second.mesh.material;
  const newSelection = f.preview.show(second, 'bmwreward', 'racing');
  const currentModels = [...f.orbit()]; assert.notEqual(oldModels[0], currentModels[0]);
  f.resolveLoads(); await flush();
  assert.equal(await oldSelection, false); assert.equal(await newSelection, true);
  assert.equal(oldModels.every(car => car.parent === null), true); assert.deepEqual(f.orbit(), currentModels);
  assert.equal(second.mesh.geometry, geometry); assert.equal(second.mesh.material, material);
  f.preview.close(); await flush(); assert.equal(getVehicleLiveryTextureCacheStats().users, 0);
  assert.equal(f.host.children.length, 0); assert.equal(f.frames.size, 0);
  clearVehicleLiveryTextureCache();
  const closed = f.preview.show(first, 'bmwreward', 'biome'); f.preview.close(); f.resolveLoads();
  assert.equal(await closed, false); await flush(); assert.equal(getVehicleLiveryTextureCacheStats().users, 0);
  f.preview.dispose(); clearVehicleLiveryTextureCache();
});


test('A failed finish retries on a later selection without rebuilding the orbit', async () => {
  const f = setup({ failOnce: true }), source = f.makeSource();
  assert.equal(await f.preview.show(source, 'bmwreward', 'anime'), false);
  const cars = [...f.orbit()];
  assert.equal(await f.preview.show(source, 'bmwreward', 'base'), true);
  assert.equal(await f.preview.show(source, 'bmwreward', 'anime'), true);
  assert.equal(f.loads.filter(url => url.endsWith('/anime.webp')).length, 2);
  assert.deepEqual(f.orbit(), cars);
  f.host.carouselPosition = 2; f.tick(100); assert.equal(cars[2].visible, true);
  f.preview.dispose(); clearVehicleLiveryTextureCache();
});
