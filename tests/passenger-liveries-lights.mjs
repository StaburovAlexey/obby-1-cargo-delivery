import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import { GLTFLoader } from '../dist/vendor/GLTFLoader.js';
import { attachVehicleBrakeLights } from '../dist/vehicle-brake-lights.js';
import { createVehicleLiveryController, clearVehicleLiveryTextureCache } from '../dist/vehicle-livery-materials.js';

function surfaces() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -1, 0, -2, 1, 0, -2, 1, 1, -2,
    -1, 0, 2, 1, 1, 2, 1, 0, 2,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    .4, .1, .7, .1, .7, .3, .4, .7, .7, .9, .7, .7,
  ], 2));
  geometry.computeVertexNormals();
  return geometry;
}

// A canonical passenger body is paintable without the old Cosmo palette; its
// original ORM channel must continue protecting plastic/chrome inside that mesh.
{
  const group = new THREE.Group(), body = new THREE.Group();
  group.add(body);
  const sourceMaterial = new THREE.MeshStandardMaterial({ roughnessMap: new THREE.Texture() });
  sourceMaterial.name = 'Passenger Body';
  const mesh = new THREE.Mesh(surfaces(), sourceMaterial);
  body.add(mesh);
  const sourceGeometry = mesh.geometry;
  const protectedMeshes = ['Passenger Glass', 'Passenger Optics', 'Passenger Wheel Trim'].map(name => {
    const material = new THREE.MeshStandardMaterial(); material.name = name;
    const node = new THREE.Mesh(surfaces(), material); body.add(node); return node;
  });
  const protectedReferences = protectedMeshes.map(node => [node.geometry, node.material]);
  const adapter = { group, body, metadata: { id: 'pickup' } };
  const controller = createVehicleLiveryController(THREE, adapter, 'pickup', {
    textureLoader: async () => new THREE.Texture(),
  });
  await controller.preview('anime');
  assert.equal(controller.audit.paintedFaces, 2, 'new passenger material is a paint candidate');
  assert.equal(mesh.material.roughnessMap, sourceMaterial.roughnessMap, 'original trim mask stays shared');
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  mesh.material.onBeforeCompile(shader);
  assert.match(shader.fragmentShader, /texture2D\( roughnessMap, vRoughnessMapUv \)\.g/);
  assert.match(shader.fragmentShader, /vehicleLiveryCoverage/, 'all livery effects use source paint coverage');
  assert.match(shader.fragmentShader, /smoothstep\(0\.05, 0\.08, passengerPaintRoughness\)/);
  assert.match(shader.fragmentShader, /smoothstep\(0\.13, 0\.2, passengerPaintRoughness\)/);
  for (let i = 0; i < protectedMeshes.length; i++) {
    assert.equal(protectedMeshes[i].geometry, protectedReferences[i][0]);
    assert.equal(protectedMeshes[i].material, protectedReferences[i][1]);
  }
  controller.dispose();
  assert.equal(mesh.geometry, sourceGeometry);
  assert.equal(mesh.material, sourceMaterial);
  clearVehicleLiveryTextureCache();
}

// Front and rear can share one optics mesh and arbitrary source UVs. Braking
// needs its own material only on the rear; its shader retains non-red lenses.
{
  const normalized = new THREE.Group(), scene = new THREE.Group();
  normalized.add(scene);
  normalized.rotation.y = Math.PI;
  const originalMaterial = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
  originalMaterial.name = 'Passenger Optics';
  const originalGeometry = surfaces();
  const mesh = new THREE.Mesh(originalGeometry, originalMaterial); scene.add(mesh);
  normalized.updateWorldMatrix(true, true);
  const resources = { materials: new Set([originalMaterial]), geometries: new Set([originalGeometry]) };
  const controller = attachVehicleBrakeLights(THREE, { scene, normalized, model: 'pickup', resources });
  assert.equal(controller.metadata.triangles, 1, 'rear optics selected independently of palette UV');
  const brakeMaterial = mesh.material.find(material => material.userData.vehicleBrakeLamp);
  assert.ok(brakeMaterial);
  assert.equal(mesh.material[0], originalMaterial, 'front uses exact original material');
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  brakeMaterial.onBeforeCompile(shader);
  assert.match(shader.fragmentShader, /passengerBrakeLens/, 'red source pixels gate brake emission');
  assert.match(shader.fragmentShader, /passengerBrakeSource\.r/);
  assert.match(shader.fragmentShader, /step\(passengerBrakeSource\.g \* 0\.8, passengerBrakeSource\.b\)/,
    'amber lenses are excluded even when their red channel is dominant');
  const originalColor = originalMaterial.color.clone();
  controller.set(true);
  assert.equal(brakeMaterial.emissiveIntensity, 3);
  assert.ok(brakeMaterial.color.equals(originalColor), 'white/amber lens diffuse colors are not tinted red');
  assert.ok(originalMaterial.color.equals(originalColor));
  assert.equal(originalMaterial.emissiveIntensity, 1);
  controller.set(false);
  assert.equal(brakeMaterial.emissiveIntensity, originalMaterial.emissiveIntensity);
  let materialDisposals = 0, geometryDisposals = 0;
  const brakeGeometry = mesh.geometry;
  brakeMaterial.addEventListener('dispose', () => materialDisposals++);
  brakeGeometry.addEventListener('dispose', () => geometryDisposals++);
  controller.dispose(); controller.dispose();
  assert.equal(mesh.geometry, originalGeometry, 'standalone brake cleanup restores source geometry');
  assert.equal(mesh.material, originalMaterial, 'standalone brake cleanup restores source material');
  assert.equal(materialDisposals, 1); assert.equal(geometryDisposals, 1);
  assert.ok(!resources.materials.has(brakeMaterial));
  assert.ok(!resources.geometries.has(brakeGeometry));
}

// The retained Cosmo assets still exercise the original palette candidates,
// Kamaro's separate lamp swatch, and Lamb's additional physical brake lenses.
globalThis.self = globalThis;
globalThis.createImageBitmap = async blob => {
  const bytes = Buffer.from(await blob.arrayBuffer());
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), close() {} };
};
for (const [id, model] of Object.entries({ pickup: 'coupe', citycourier: 'police', rover: 'jeep',
  foresthauler: 'van', van: 'kamaro', desertscout: 'ghini', snowgrip: 'rally',
  snowrunner: 'armor', lavacrawler: 'lamb', ashhauler: 'fenyr' })) {
  const bytes = fs.readFileSync(new URL(`../dist/assets/vehicles/cosmo/${model}.glb`, import.meta.url));
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const group = new THREE.Group(), body = new THREE.Group(), normalized = new THREE.Group();
  group.add(body); body.add(normalized); normalized.add(scene); normalized.rotation.y = Math.PI;
  group.updateWorldMatrix(true, true);
  const resources = { materials: new Set(), geometries: new Set(), textures: new Set() };
  scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    resources.geometries.add(mesh.geometry);
    for (const material of [].concat(mesh.material)) {
      resources.materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.textures.add(value);
    }
  });
  const brakes = attachVehicleBrakeLights(THREE, { scene, normalized, model, resources });
  assert.ok(brakes.metadata.triangles > 0, `${model}: retained palette rear lamps work`);
  if (model === 'lamb') assert.equal(brakes.metadata.addedTriangles, 24);
  brakes.set(true); brakes.set(false);
  const controller = createVehicleLiveryController(THREE, { group, body, metadata: { id } }, id, {
    textureLoader: async () => new THREE.Texture(),
  });
  await controller.preview('neon');
  assert.ok(controller.audit.paintedFaces > 100, `${model}: retained palette body mask works`);
  controller.dispose(); brakes.dispose();
  for (const resource of [...resources.geometries, ...resources.materials, ...resources.textures]) resource.dispose();
  clearVehicleLiveryTextureCache();
}

console.log('PASS passenger body paint/trim mask; rear-only optics, lens colors and standalone disposal; all 10 retained Cosmo palette paths.');
