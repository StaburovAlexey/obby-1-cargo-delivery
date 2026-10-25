import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import { createVehicleNeonPreview } from '../dist/vehicle-neon-preview.js';
import { createFleetNeon } from '../dist/vehicle-neon.js';
import { VEHICLE_NEON_CATALOG, getVehicleNeon, vehicleNeonName } from '../dist/vehicle-neon-catalog.js';
import { createInputDom } from './fixtures/vehicle-input-dom.mjs';
function fixture() {
  const { doc, win, root } = createInputDom(), Element = root.constructor;
  doc.createElement = tag => {
    const node = new Element(); node.tagName = tag; node.ownerDocument = doc;
    node.remove = () => { if (node.parent) node.parent.children = node.parent.children.filter(item => item !== node); node.parent = null; };
    return node;
  };
  const host = doc.createElement('div'); host.clientWidth = 320; host.clientHeight = 250;
  const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
  const geometry = new THREE.BoxGeometry(1.6, .8, 3.4), material = new THREE.MeshStandardMaterial({ color: 0x999999 });
  body.add(new THREE.Mesh(geometry, material)); group.position.set(30, 2, 80); group.rotation.y = 1; group.visible = false;
  const adapter = { group, body }, frames = new Map(), renderers = []; let frameId = 0;
  const preview = createVehicleNeonPreview(THREE, host, {
    requestFrame: fn => { frames.set(++frameId, fn); return frameId; }, cancelFrame: id => frames.delete(id),
    createRenderer: () => {
      const renderer = { domElement: doc.createElement('canvas'), setPixelRatio() {}, setClearColor(...args) { this.clear = args; }, setSize() {}, render(scene, camera) { this.scene = scene; this.camera = camera; }, dispose() { this.disposed = true; }, forceContextLoss() {} };
      renderers.push(renderer); return renderer;
    },
  });
  const tick = time => { const [id, fn] = frames.entries().next().value; frames.delete(id); fn(time); };
  return { doc, host, adapter, geometry, material, frames, renderers, preview, tick };
}
test('Seven distinct named colors are immutable and have no prices or ownership', () => {
  assert.equal(VEHICLE_NEON_CATALOG.length, 8);
  assert.equal(new Set(VEHICLE_NEON_CATALOG.map(item => item.color)).size, 8);
  for (const item of VEHICLE_NEON_CATALOG) {
    assert.ok(item.name.ru && item.name.en); assert.ok(Object.isFrozen(item));
    assert.equal(item.price,item.currency==='coins'?50000:39); assert.equal('owned' in item, false);
    assert.equal(getVehicleNeon(item.id), item);
  }
  assert.equal(vehicleNeonName('blue', 'en'), 'Blue'); assert.equal(vehicleNeonName('blue'), 'Синий'); assert.equal(getVehicleNeon('bad'), null);
});
test('Eight isolated BMW copies use one context with only soft ground halos and no neon lights', () => {
  const f = fixture(); assert.equal(f.preview.show(f.adapter, 'red'), true);
  const renderer = f.renderers[0], pivot = renderer.scene.children[0];
  assert.equal(pivot.children.length, 8); assert.equal(f.renderers.length, 1); assert.equal(f.host.children.length, 1);
  assert.deepEqual(renderer.clear, [0, 0]);
  const visible = pivot.children.filter(item => item.visible); assert.equal(visible.length, 3);
  const colors = new Set(), textures = new Set(); let pointLights = 0;
  renderer.scene.traverse(node => { if (node.isPointLight) pointLights++; }); assert.equal(pointLights, 0);
  for (const model of pivot.children) {
    const neon = model.children[0].children[1]; assert.equal(neon.children.length, 1);
    assert.equal(neon.children[0].material.transparent, true);
    colors.add(neon.children[0].material.color.getHex()); textures.add(neon.children[0].material.map);
    assert.equal(neon.children[0].material.toneMapped, false);
  }
  assert.equal(colors.size, 8); assert.equal(textures.size, 1);
  assert.deepEqual(f.adapter.group.position.toArray(), [30, 2, 80]); assert.equal(f.adapter.group.rotation.y, 1); assert.equal(f.adapter.group.visible, false);
  for (const color of VEHICLE_NEON_CATALOG) assert.equal(f.preview.show(f.adapter, color.id), true);
  assert.equal(f.renderers.length, 1); assert.equal(f.preview.getSelection(), 'pink'); f.preview.dispose();
});

test('Preview and fleet share the same soft halo footprint, falloff and material settings', () => {
  const f = fixture(), fleet = createFleetNeon(THREE);
  fleet.setColor('red'); fleet.attach(f.adapter);
  f.preview.show(f.adapter, 'red');
  const live = f.adapter.body.getObjectByName('vehicle-underglow').children[0];
  const model = f.renderers[0].scene.children[0].children[0];
  const shown = model.children[0].children[1].children[0];
  const factor = model.children[0].children[0].scale.x;
  assert.deepEqual(Array.from(shown.material.map.image.data), Array.from(live.material.map.image.data));
  assert.equal(shown.material.opacity, live.material.opacity);
  assert.equal(shown.material.blending, live.material.blending);
  assert.equal(shown.material.depthWrite, false);
  assert.ok(Math.abs(shown.scale.x / factor - live.scale.x) < 1e-9);
  assert.ok(Math.abs(shown.scale.y / factor - live.scale.y) < 1e-9);
  assert.ok(Math.abs(shown.position.y / factor - live.position.y) < 1e-9);
  f.preview.dispose(); fleet.dispose();
});

test('Circular swipe, fractional positions and reduced draw cadence preserve source and continuous wrap', () => {
  const f = fixture(); f.preview.show(f.adapter, 'red');
  const pivot = f.renderers[0].scene.children[0];
  f.host.carouselPosition = -.01; f.tick(100); const before = pivot.children[0].position.clone();
  f.host.carouselPosition = 7.99; f.tick(116); assert.ok(before.distanceTo(pivot.children[0].position) < 1e-9);
  f.host.carouselPosition = .5; f.tick(132); assert.ok(pivot.children.filter(item => item.visible).length >= 3);
  assert.equal(f.adapter.group.rotation.y, 1);
  f.preview.dispose();
});
test('Close/dispose release all own glow resources but never shared car resources; can reopen', () => {
  const f = fixture(); let sharedDisposes = 0, ownDisposes = 0;
  f.geometry.addEventListener('dispose', () => sharedDisposes++); f.material.addEventListener('dispose', () => sharedDisposes++);
  f.preview.show(f.adapter, 'cyan'); const resources = new Set();
  f.renderers[0].scene.traverse(node => {
    if (!node.isMesh || node.geometry === f.geometry) return;
    resources.add(node.geometry); resources.add(node.material); if (node.material.map) resources.add(node.material.map);
  });
  for (const resource of resources) resource.addEventListener('dispose', () => ownDisposes++);
  f.doc.hidden = true; f.doc.dispatch('visibilitychange'); assert.equal(f.frames.size, 0);
  f.doc.hidden = false; f.doc.dispatch('visibilitychange'); assert.equal(f.frames.size, 1);
  f.preview.close(); assert.equal(f.frames.size, 0); assert.equal(f.host.children.length, 0);
  assert.equal(ownDisposes, resources.size); assert.equal(sharedDisposes, 0); assert.equal(f.renderers[0].disposed, true);
  assert.equal(f.preview.show(f.adapter, 'blue'), true); assert.equal(f.renderers.length, 2);
  f.preview.dispose(); f.preview.dispose(); assert.equal(f.preview.show(f.adapter, 'red'), false); assert.equal(sharedDisposes, 0);
});
test('Invalid input rejects before allocating WebGL or changing source', () => {
  const f = fixture(); assert.throws(() => f.preview.show(f.adapter, 'fake'), RangeError);
  assert.throws(() => f.preview.show({}, 'red'), TypeError); assert.equal(f.renderers.length, 0);
  f.preview.dispose();
});
test('Real BMW with glow remains framed at mobile widths, rotated and across circular wrap', async () => {
  const fs = await import('node:fs');
  const { loadBMWVehicle } = await import('../dist/bmw-vehicle.js');
  const originalFetch = globalThis.fetch, oldBitmap = globalThis.createImageBitmap, oldSelf = globalThis.self;
  globalThis.self = globalThis;
  globalThis.createImageBitmap = async blob => { const bytes = Buffer.from(await blob.arrayBuffer()); return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), close() {} }; };
  globalThis.fetch = async request => { const url = typeof request === 'string' ? request : request.url; return url.startsWith('blob:') ? originalFetch(request) : new Response(fs.readFileSync(new URL(url)), { status: 200 }); };
  let source;
  const f = fixture(), point = new THREE.Vector3();
  try {
    source = await loadBMWVehicle(THREE);
    for (const [width, height] of [[244,195], [280,230], [320,250], [360,250], [410,230], [640,165]]) {
      f.host.clientWidth = width; f.host.clientHeight = height;
      for (const phase of [0, .5, 1, 3, 6, 6.5, 7, -.5, -1]) {
        f.host.carouselPosition = phase; f.preview.show(source, 'red');
        const { scene, camera } = f.renderers.at(-1); camera.updateMatrixWorld(true);
        for (let angle = 0; angle < 12; angle++) {
          for (const car of scene.children[0].children) car.children[0].rotation.y = angle * Math.PI / 6;
          scene.updateMatrixWorld(true);
          for (const car of scene.children[0].children.filter(item => item.visible)) car.traverse(mesh => {
            if (!mesh.isMesh) return;
            const positions = mesh.geometry.attributes.position;
            for (let index = 0; index < positions.count; index++) {
              point.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld).project(camera);
              assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1, `BMW/glow clips at ${width}×${height} phase ${phase} angle ${angle}`);
            }
          });
        }
      }
    }
  } finally {
    f.preview.dispose(); source?.dispose(); globalThis.fetch = originalFetch; globalThis.createImageBitmap = oldBitmap; globalThis.self = oldSelf;
  }
});
