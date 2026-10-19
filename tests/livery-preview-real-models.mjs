import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import { loadCosmoVehicle } from '../dist/cosmo-vehicles.js';
import { loadBMWVehicle } from '../dist/bmw-vehicle.js';
import { cloneVehicleForLiveryPreview } from '../dist/vehicle-livery-preview.js';
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
  source.dispose();
}
clearVehicleLiveryTextureCache();
console.log('All 11 real adapter clones preview all 44 liveries without mutating or disposing hangar resources.');
