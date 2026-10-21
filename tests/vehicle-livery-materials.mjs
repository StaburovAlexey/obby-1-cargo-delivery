import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import { COSMO_VEHICLES, loadCosmoVehicle } from '../dist/cosmo-vehicles.js';
import { loadBMWVehicle } from '../dist/bmw-vehicle.js';
import { createVehicleLiveryController, clearVehicleLiveryTextureCache, getVehicleLiveryTextureCacheStats, vehicleLiveryTextureURL, VEHICLE_LIVERY_IDS, VEHICLE_LIVERY_VARIANTS } from '../dist/vehicle-livery-materials.js';
const originalFetch = globalThis.fetch;
globalThis.self = globalThis;
globalThis.createImageBitmap = async blob => {
  const bytes = Buffer.from(await blob.arrayBuffer());
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), close() {} };
};
globalThis.fetch = async request => {
  const url = typeof request === 'string' ? request : request.url;
  return url.startsWith('blob:') ? originalFetch(request) : new Response(fs.readFileSync(new URL(url)), { status: 200 });
};
const requests = new Map();
const textureLoader = async url => {
  assert.ok(fs.statSync(new URL(url)).size > 1000);
  requests.set(url, (requests.get(url) ?? 0) + 1);
  const texture = new THREE.Texture({ width: 1024, height: 1024 });
  return texture;
};
function snapshot(adapter) {
  const result = [];
  adapter.group.traverse(mesh => { if (mesh.isMesh) result.push({ mesh, geometry: mesh.geometry, material: mesh.material,
    position: Array.from(mesh.geometry.attributes.position.array), uv: mesh.geometry.attributes.uv ? Array.from(mesh.geometry.attributes.uv.array) : null }); });
  return result;
}
function restored(before) {
  for (const entry of before) {
    assert.equal(entry.mesh.geometry, entry.geometry, 'base restores exact geometry reference');
    assert.equal(entry.mesh.material, entry.material, 'base restores exact material reference');
    assert.deepEqual(Array.from(entry.geometry.attributes.position.array), entry.position, 'source vertices unchanged');
    if (entry.uv) assert.deepEqual(Array.from(entry.geometry.attributes.uv.array), entry.uv, 'source palette UVs unchanged');
  }
}
assert.equal(VEHICLE_LIVERY_IDS.length, 11);
assert.deepEqual(VEHICLE_LIVERY_VARIANTS, ['base', 'neon', 'anime', 'racing', 'biome']);
assert.throws(() => vehicleLiveryTextureURL('unknown', 'neon'), /Unknown/);
assert.throws(() => vehicleLiveryTextureURL('pickup', 'unknown'), /Unknown/);
const manifest = JSON.parse(fs.readFileSync(new URL('../dist/assets/liveries/manifest.json', import.meta.url)));
assert.equal(manifest.files.length, 44);
assert.deepEqual(manifest.size, [1024, 1024]);
for (const entry of manifest.files) {
  const bytes = fs.readFileSync(new URL(`../dist/assets/liveries/${entry.file}`, import.meta.url));
  assert.equal(bytes.length, entry.bytes);
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  let dimensions;
  for (let offset = 12; offset + 8 < bytes.length;) {
    const kind = bytes.toString('ascii', offset, offset + 4), length = bytes.readUInt32LE(offset + 4), data = offset + 8;
    if (kind === 'VP8 ') dimensions = [bytes.readUInt16LE(data + 6) & 16383, bytes.readUInt16LE(data + 8) & 16383];
    if (kind === 'VP8X') dimensions = [bytes.readUIntLE(data + 4, 3) + 1, bytes.readUIntLE(data + 7, 3) + 1];
    offset = data + length + (length % 2);
  }
  assert.deepEqual(dimensions, [1024, 1024], 'mobile bounded atlas dimensions');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
}
const report = [];
for (const id of VEHICLE_LIVERY_IDS) {
  const adapter = id === 'bmwreward' ? await loadBMWVehicle(THREE) : await loadCosmoVehicle(THREE, id);
  const before = snapshot(adapter), controller = createVehicleLiveryController(THREE, adapter, id, { textureLoader });
  assert.equal(controller.current, 'base'); assert.equal(controller.audit, null);
  assert.equal(requests.has(vehicleLiveryTextureURL(id, 'neon')), false, 'base never loads art');
  await controller.preview('neon');
  assert.ok(controller.audit.paintedFaces > 100, `${id} has meaningful body coverage`);
  let mappedFaces = 0, protectedFaces = 0, sourceDegenerate = 0;
  for (const entry of before) {
    const mesh = entry.mesh;
    if (mesh.geometry === entry.geometry) continue;
    const geometry = mesh.geometry, uv = geometry.attributes.liveryUv, mask = geometry.attributes.liveryMask, source = geometry.attributes.uv;
    assert.ok(!geometry.index, 'per-face split prevents conflicting shared projected vertices');
    assert.equal(mask.count, geometry.attributes.position.count);
    for (let i = 0; i < mask.count; i += 3) {
      assert.ok(mask.getX(i) === 0 || mask.getX(i) === 1);
      assert.equal(mask.getX(i), mask.getX(i+1));assert.equal(mask.getX(i), mask.getX(i+2));
      if (!mask.getX(i)) { protectedFaces++; continue; }
      mappedFaces++;
      const area=(attr)=>Math.abs((attr.getX(i+1)-attr.getX(i))*(attr.getY(i+2)-attr.getY(i))-(attr.getY(i+1)-attr.getY(i))*(attr.getX(i+2)-attr.getX(i)));
      assert.ok(area(uv) > 1e-13, `${id} painted face ${i/3} has non-degenerate projected UV`);
      if (source && area(source) < 1e-12) sourceDegenerate++;
      for (let n=0;n<3;n++) { assert.ok(uv.getX(i+n)>=0&&uv.getX(i+n)<=1); assert.ok(uv.getY(i+n)>=0&&uv.getY(i+n)<=1); }
      const transform = adapter.body.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
      const points = [0,1,2].map(n=>new THREE.Vector3().fromBufferAttribute(geometry.attributes.position,i+n).applyMatrix4(transform));
      const normal = new THREE.Vector3().crossVectors(points[1].clone().sub(points[0]),points[2].clone().sub(points[0])).normalize();
      if (Math.abs(normal.x)>=.45 && Math.abs(normal.x)>=Math.abs(normal.z)) {
        const minV=normal.x<0?0:.25,maxV=normal.x<0?.25:.5;
        for(let n=0;n<3;n++)assert.ok(uv.getY(i+n)>=minV&&uv.getY(i+n)<=maxV,'side bevel stays in same portrait island');
        const sign=normal.x<0?1:-1;
        for(let n=1;n<3;n++) if(Math.abs(points[n].z-points[0].z)>.00001)
          assert.ok((uv.getX(i+n)-uv.getX(i))*sign*(points[n].z-points[0].z)>0,'independent left/right text direction is correct');
      }

    }
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials.filter(material => material.userData.vehicleLivery)) {
      const shader = { uniforms:{}, vertexShader:THREE.ShaderLib.standard.vertexShader, fragmentShader:THREE.ShaderLib.standard.fragmentShader };
      material.onBeforeCompile(shader);
      assert.match(shader.vertexShader,/vLiveryUv = liveryUv/);
      assert.match(shader.fragmentShader,/mix\(diffuseColor.rgb, vehicleLiveryColor, (vLiveryMask|vehicleLiveryCoverage)\)/);
      if (material.name.startsWith('Passenger Body')) {
        assert.match(shader.fragmentShader,/passengerPaintRoughness/,'source ORM mask protects passenger grille/chrome/plastic');
        assert.ok(material.roughnessMap?.isTexture,'source roughness atlas remains available');
      }
      assert.ok(shader.uniforms.vehicleLiveryMap.value.isTexture);
      assert.equal(shader.uniforms.vehicleLiveryMap.value.flipY,false);
      assert.equal(shader.uniforms.vehicleLiveryMap.value.colorSpace,THREE.SRGBColorSpace);
    }
  }
  for (const wheel of adapter.wheels) wheel.node.traverse(mesh => {
    if (!mesh.isMesh) return;
    const original=before.find(entry=>entry.mesh===mesh);
    assert.equal(mesh.geometry,original.geometry,'wheel geometry never touched');assert.equal(mesh.material,original.material,'wheel materials never touched');
  });
  for (const entry of before) {
    const materials=Array.isArray(entry.material)?entry.material:[entry.material];
    if (materials.every(material=>['glass','light','Passenger Glass','Passenger Optics','Passenger Wheel','Passenger Wheel Trim'].includes(material.name) || material.userData.vehicleBrakeLamp) || (id==='citycourier' && materials.every(material=>material.name==='texture'))) {
      assert.equal(entry.mesh.material,entry.material,'window/light material unchanged');assert.equal(entry.mesh.geometry,entry.geometry);
    }
  }
  for (const variant of ['anime','racing','biome']) { assert.equal((await controller.preview(variant)).applied,true);assert.equal(controller.current,variant); }
  controller.restore();restored(before);assert.equal(controller.current,'base');
  await controller.preview('neon');controller.dispose();restored(before);controller.dispose();
  await assert.rejects(controller.preview('anime'),/disposed/);
  report.push({id,paintedFaces:mappedFaces,protectedFaces,sourceDegenerate});adapter.dispose();
}
clearVehicleLiveryTextureCache();assert.equal(getVehicleLiveryTextureCacheStats().entries,0);
// Loads race against restore, later choice, and disposal. No stale load may mutate any mesh.
for (const interruption of ['restore','dispose','newer']) {
 const adapter=await loadCosmoVehicle(THREE,'pickup'),before=snapshot(adapter);let resolve;
 const controller=createVehicleLiveryController(THREE,adapter,'pickup',{textureLoader:async()=>new Promise(done=>{resolve=done;})});
 const pending=controller.preview('neon');
 if(interruption==='newer')await controller.preview('base');else controller[interruption]();
 resolve(new THREE.Texture({width:1024,height:1024}));
 assert.deepEqual(await pending,{applied:false,stale:true,vehicleId:'pickup',liveryId:'neon'});restored(before);
 controller.dispose();adapter.dispose();clearVehicleLiveryTextureCache();
}
// Failure leaves the last committed/base visual intact and permits a clean retry.
{
 const adapter=await loadCosmoVehicle(THREE,'pickup'),before=snapshot(adapter);let calls=0;
 const controller=createVehicleLiveryController(THREE,adapter,'pickup',{textureLoader:async()=>{if(++calls===1)throw new Error('network failed');return new THREE.Texture({width:1024,height:1024});}});
 await assert.rejects(controller.preview('neon'),/network failed/);restored(before);
 await controller.preview('neon');assert.equal(controller.current,'neon');controller.dispose();adapter.dispose();clearVehicleLiveryTextureCache();
}
console.log(JSON.stringify(report,null,2));
console.log('PASS: 44 assets; 11 real GLBs; non-degenerate body UVs; exact base/wheel/glass/light preservation; all variants; shader structure; stale/failed loads; disposal.');
