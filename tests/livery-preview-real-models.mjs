import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import { loadCosmoVehicle } from '../dist/cosmo-vehicles.js';
import { loadBMWVehicle } from '../dist/bmw-vehicle.js';
import { cloneVehicleForLiveryPreview, createVehicleLiveryPreview } from '../dist/vehicle-livery-preview.js';
import { createVehicleLiveryController, VEHICLE_LIVERY_IDS, clearVehicleLiveryTextureCache } from '../dist/vehicle-livery-materials.js';
const originalFetch = globalThis.fetch;
globalThis.self = globalThis;
globalThis.createImageBitmap = async blob => { const bytes = Buffer.from(await blob.arrayBuffer()); return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), close() {} }; };
globalThis.fetch = async request => { const url = typeof request === 'string' ? request : request.url; return url.startsWith('blob:') ? originalFetch(request) : new Response(fs.readFileSync(new URL(url)), { status: 200 }); };
for (const id of VEHICLE_LIVERY_IDS) {
  const source = id === 'bmwreward' ? await loadBMWVehicle(THREE) : await loadCosmoVehicle(THREE, id);
  const originals = []; let sharedDisposals = 0;
  source.group.traverse(node => { if (node.isMesh) {
    originals.push([node, node.geometry, node.material]);
    node.geometry.addEventListener('dispose', () => sharedDisposals++);
    for (const material of [node.material].flat()) material.addEventListener('dispose', () => sharedDisposals++);
  } });
  const clone = cloneVehicleForLiveryPreview(source);
  const controller = createVehicleLiveryController(THREE, clone, id, { textureLoader: async () => new THREE.Texture() });
  for (const livery of ['neon', 'anime', 'racing', 'biome']) {
    assert.equal((await controller.preview(livery)).applied, true, `${id}/${livery}`);
    assert.ok(controller.audit.paintedFaces > 100, `${id} clone has real audited painted body geometry`);
    for (const [node, geometry, material] of originals) { assert.equal(node.geometry, geometry); assert.equal(node.material, material); }
  }
  controller.dispose(); assert.equal(sharedDisposals, 0, `${id} source remains owned by hangar`);
  const host = { clientWidth: 360, clientHeight: 240, carouselPosition: 0, append() {},
    ownerDocument: { hidden: false, defaultView: { requestAnimationFrame: () => 1, cancelAnimationFrame() {} }, addEventListener() {}, removeEventListener() {} } };
  let scene, camera;
  const preview = createVehicleLiveryPreview(THREE, host, {
    textureLoader: async () => new THREE.Texture(),
    createRenderer: () => ({ domElement: { setAttribute() {}, remove() {} }, setPixelRatio() {}, setSize() {}, setClearColor() {},
      render(nextScene, nextCamera) { scene = nextScene; camera = nextCamera; }, dispose() {} }),
  });
  await preview.show(source, id);
  for (let n = 0; n < 10; n++) await Promise.resolve();
  scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
  const cars = scene.children[0].children, point = new THREE.Vector3();
  const projected = car => {
    const bounds = { left: Infinity, right: -Infinity, top: -Infinity, bottom: Infinity };
    car.traverse(mesh => {
      if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
      const positions = mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).project(camera);
        bounds.left = Math.min(bounds.left, point.x); bounds.right = Math.max(bounds.right, point.x);
        bounds.top = Math.max(bounds.top, point.y); bounds.bottom = Math.min(bounds.bottom, point.y);
      }
    });
    return bounds;
  };
  for (const [width, height] of [[320, 240], [360, 240], [640, 240]]) {
    host.clientWidth = width; host.clientHeight = height;
    for (const selected of [0, 1, 2, 3, 4, 5, -1]) {
      host.carouselPosition = selected;
      const current = ((selected % 5) + 5) % 5;
      await preview.show(source, id, ['base', 'neon', 'anime', 'racing', 'biome'][current]);
      scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
      const leftIndex = (current + 4) % 5, rightIndex = (current + 1) % 5;
      const [left, center, right] = [leftIndex, current, rightIndex].map(index => projected(cars[index]));
      assert.equal(cars.filter(car => car.visible).length, 3, `${id} shows the three real textured models`);
      for (const bounds of [left, center, right]) {
        assert.ok(bounds.left > -1 && bounds.right < 1 && bounds.bottom > -1 && bounds.top < 1, `${id} stays entirely in the ${width}px frame`);
      }
      assert.ok(left.right < center.left && center.right < right.left, `${id} neighbors are visibly separate on both sides at ${width}px`);
      assert.ok(center.right - center.left > right.right - right.left, `${id} selected car is larger in screen space`);
      const cameraBack = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
      assert.ok(cars[leftIndex].position.dot(cameraBack) < cars[current].position.dot(cameraBack), `${id} previous car is behind`);
      assert.ok(cars[rightIndex].position.dot(cameraBack) < cars[current].position.dot(cameraBack), `${id} next car is behind`);
      for (const [node, geometry, material] of originals) { assert.equal(node.geometry, geometry); assert.equal(node.material, material); }
    }
  }
  preview.dispose(); assert.equal(sharedDisposals, 0);
  source.dispose();
}
clearVehicleLiveryTextureCache();
console.log('All 11 real vehicles and 44 liveries preserve source resources; three-car orbit stays framed, separated, and depth-ordered at 320/360/640px and both wrap directions.');
