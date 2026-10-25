/** Body-only livery UVs. Original palettes, glass, lamps, wheels and GLBs remain untouched. */
const VARIANTS = Object.freeze(['base', 'neon', 'anime', 'racing', 'biome']);
const VEHICLES = Object.freeze({
  pickup: { model: 'coupe', cells: [[24, 10]] },
  citycourier: { model: 'police', cells: [[24, 10], [24, 0]], materialNames: ['metallic'] },
  rover: { model: 'jeep', cells: [[2, 6], [2, 7]] },
  foresthauler: { model: 'van', cells: [[0, 15]] },
  van: { model: 'kamaro', cells: [[3, 7], [3, 8]] },
  desertscout: { model: 'ghini', cells: [[24, 9]] },
  snowgrip: { model: 'rally', cells: [[1, 6], [1, 7]] },
  snowrunner: { model: 'armor', cells: [[24, 10]] },
  lavacrawler: { model: 'lamb', cells: [[0, 8], [0, 9]] },
  ashhauler: { model: 'fenyr', cells: [[16, 6]] },
  bmwreward: { model: 'bmw-g80-m3', material: 'Material.015' },
});
export const VEHICLE_LIVERY_VARIANTS = VARIANTS;
export const VEHICLE_LIVERY_IDS = Object.freeze(Object.keys(VEHICLES));
const textureEntries = new Map();
const liverySources = new WeakMap();
const MAX_IDLE_TEXTURES = 4;
let usedClock = 0;

/** Preview clones share source-owned base assets, never another controller's paint. */
export function getVehicleLiverySource(mesh) {
  return liverySources.get(mesh) ?? { geometry: mesh.geometry, material: mesh.material };
}

export function vehicleLiveryTextureURL(vehicleId, liveryId) {
  if (!VEHICLES[vehicleId]) throw new RangeError(`Unknown livery vehicle: ${vehicleId}`);
  if (!VARIANTS.includes(liveryId)) throw new RangeError(`Unknown livery: ${liveryId}`);
  return liveryId === 'base' ? null : String(new URL(`./assets/liveries/${vehicleId}/${liveryId}.webp`, import.meta.url));
}

function evictIdleTextures() {
  const idle = [...textureEntries.values()].filter(entry => !entry.users && entry.texture)
    .sort((a, b) => a.used - b.used);
  while (idle.length > MAX_IDLE_TEXTURES) {
    const entry = idle.shift();
    entry.texture.dispose();
    textureEntries.delete(entry.url);
  }
}

async function acquireTexture(THREE, url, textureLoader) {
  let entry = textureEntries.get(url);
  if (!entry) {
    entry = { url, users: 0, used: ++usedClock, texture: null, pending: null };
    entry.pending = (textureLoader ? textureLoader(url) : new THREE.TextureLoader().loadAsync(url)).then(texture => {
      texture.name = `Vehicle livery · ${url.split('/').slice(-2).join('/')}`;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false;
      texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = 2;
      texture.needsUpdate = true;
      entry.texture = texture;
      return texture;
    });
    textureEntries.set(url, entry);
    entry.pending.catch(() => { if (textureEntries.get(url) === entry) textureEntries.delete(url); });
  }
  // Reserve while loading, so two concurrent previews cannot evict one another's texture.
  entry.users++;
  entry.used = ++usedClock;
  try { await entry.pending; }
  catch (error) { entry.users--; throw error; }
  let released = false;
  return { texture: entry.texture, release() {
    if (released) return;
    released = true;
    entry.users--;
    entry.used = ++usedClock;
    evictIdleTextures();
  } };
}

export function clearVehicleLiveryTextureCache() {
  for (const [url, entry] of textureEntries) if (!entry.users && entry.texture) {
    entry.texture.dispose();
    textureEntries.delete(url);
  }
}

export function getVehicleLiveryTextureCacheStats() {
  return Object.freeze({ entries: textureEntries.size,
    loaded: [...textureEntries.values()].filter(entry => entry.texture).length,
    active: [...textureEntries.values()].filter(entry => entry.users).length,
    users: [...textureEntries.values()].reduce((sum, entry) => sum + entry.users, 0) });
}

const materialList = mesh => Array.isArray(mesh.material) ? mesh.material : [mesh.material];
const isPassengerBody = material => material?.name === 'Passenger Body';
function isCandidate(material, spec) {
  return material && (isPassengerBody(material) || (spec.material ? material.name === spec.material :
    (spec.materialNames ?? ['metallic', 'texture']).includes(material.name) && material.map?.name === 'texture-palette'));
}
function isPaintFace(geometry, face, material, spec) {
  if (!isCandidate(material, spec)) return false;
  if (isPassengerBody(material) || spec.material) return true;
  const uv = geometry.attributes.uv;
  if (!uv) return false;
  let u = 0, v = 0;
  for (let n = 0; n < 3; n++) { u += uv.getX(face + n); v += uv.getY(face + n); }
  const x = Math.min(24, Math.floor(u / 3 * 25));
  const y = Math.min(17, Math.floor(v / 3 * 18));
  return spec.cells.some(cell => cell[0] === x && cell[1] === y);
}
function triangleMaterial(geometry, face, materials) {
  if (materials.length === 1) return materials[0];
  const group = geometry.groups.find(group => face >= group.start && face < group.start + group.count);
  return materials[group?.materialIndex ?? 0];
}

// Atlas panels are separately authored, including text: neither side ever mirrors its lettering.
// Top-left: left 1024x256; middle-left: right 1024x256.
// Bottom-left: top 512x512; bottom-right: front/rear, each 512x256.
function projectedUV(point, normal, bounds) {
  const size = bounds.getSize(bounds.min.clone());
  const x = (point.x - bounds.min.x) / Math.max(size.x, .0001);
  const y = (point.y - bounds.min.y) / Math.max(size.y, .0001);
  const z = (point.z - bounds.min.z) / Math.max(size.z, .0001);
  const ax = Math.abs(normal.x), ay = Math.abs(normal.y), az = Math.abs(normal.z);
  // Two-pixel padding in each island prevents mip bleed from neighboring panels.
  const pad = 2 / 1024;
  const rect = (u, v, ox, oy, w, h) => [ox + pad + u * (w - 2 * pad), oy + pad + v * (h - 2 * pad)];
  // Keep beveled side panels in the side island. Dominant-axis-only mapping split the
  // van's horizontal side crease through its portrait (normal .56 X / .83 Y).
  if (ax >= .45 && ax >= az) return normal.x < 0 ? rect(z, 1 - y, 0, 0, 1, .25) : rect(1 - z, 1 - y, 0, .25, 1, .25);
  if (ay >= ax && ay >= az) return rect(1 - x, 1 - z, 0, .5, .5, .5);
  if (ax >= az) return normal.x < 0 ? rect(z, 1 - y, 0, 0, 1, .25) : rect(1 - z, 1 - y, 0, .25, 1, .25);
  return normal.z < 0 ? rect(1 - x, 1 - y, .5, .5, .5, .25) : rect(x, 1 - y, .5, .75, .5, .25);
}

function prepareMeshes(THREE, adapter, spec) {
  adapter.group.updateWorldMatrix(true, true);
  const inverseBody = adapter.body.matrixWorld.clone().invert();
  const entries = [], bounds = new THREE.Box3();
  const points = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), normal = new THREE.Vector3();
  adapter.body.traverse(mesh => {
    if (!mesh.isMesh || mesh.userData.vehicleLivery || !mesh.geometry?.attributes.position) return;
    const originals = materialList(mesh);
    if (!originals.some(material => isCandidate(material, spec))) return;
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    const transform = inverseBody.clone().multiply(mesh.matrixWorld);
    const position = geometry.attributes.position;
    const masks = new Float32Array(position.count), faceNormals = [];
    let paintedFaces = 0;
    for (let face = 0; face < position.count; face += 3) {
      for (let n = 0; n < 3; n++) points[n].fromBufferAttribute(position, face + n).applyMatrix4(transform);
      normal.crossVectors(a.subVectors(points[1], points[0]), b.subVectors(points[2], points[0])).normalize();
      faceNormals.push(normal.clone());
      const paint = isPaintFace(geometry, face, triangleMaterial(geometry, face, originals), spec) && normal.y > -.65;
      if (!paint) continue;
      paintedFaces++;
      for (let n = 0; n < 3; n++) { masks[face + n] = 1; bounds.expandByPoint(points[n]); }
    }
    if (!paintedFaces) { geometry.dispose(); return; }
    entries.push({ mesh, originalGeometry: mesh.geometry, originalMaterial: mesh.material,
      geometry, transform, masks, faceNormals, paintedFaces, materials: [] });
  });
  if (!entries.length || bounds.isEmpty()) throw new Error(`No audited paint geometry found for ${adapter.metadata?.id ?? spec.model}`);
  for (const entry of entries) {
    const position = entry.geometry.attributes.position;
    const uv = new Float32Array(position.count * 2);
    for (let i = 0; i < position.count; i++) {
      points[0].fromBufferAttribute(position, i).applyMatrix4(entry.transform);
      const projected = projectedUV(points[0], entry.faceNormals[Math.floor(i / 3)], bounds);
      uv[i * 2] = projected[0]; uv[i * 2 + 1] = projected[1];
    }
    entry.geometry.setAttribute('liveryUv', new THREE.BufferAttribute(uv, 2));
    entry.geometry.setAttribute('liveryMask', new THREE.BufferAttribute(entry.masks, 1));
    entry.geometry.userData.vehicleLiveryUV = true;
    delete entry.faceNormals;
  }
  return { entries, bounds };
}

function makePaintMaterial(THREE, original, uniformState, spec) {
  if (!isCandidate(original, spec)) return original;
  const material = original.clone();
  material.name = `${original.name} · body livery`;
  material.userData.vehicleLivery = true;
  const baseHook = original.onBeforeCompile;
  const baseKey = original.customProgramCacheKey();
  const passenger = isPassengerBody(original);
  const mask = passenger ? 'vehicleLiveryCoverage' : 'vLiveryMask';
  material.customProgramCacheKey = () => `${baseKey}|vehicle-livery-uv-v1${passenger ? '|passenger-roughness-mask-v1' : ''}`;
  // The pack's original ORM atlas identifies painted panels with roughness 27/255.
  // Chrome is 0 and rubber/plastic is > 150/255. Unlike a color threshold this
  // also covers the black SUV and keeps grille/trim detail in every body atlas.
  const coverage = passenger ? '\nfloat vehicleLiveryCoverage = 0.0;\n#ifdef USE_ROUGHNESSMAP\nfloat passengerPaintRoughness = texture2D( roughnessMap, vRoughnessMapUv ).g;\nvehicleLiveryCoverage = vLiveryMask * smoothstep(0.05, 0.08, passengerPaintRoughness) * (1.0 - smoothstep(0.13, 0.2, passengerPaintRoughness));\n#endif' : '';
  material.onBeforeCompile = shader => {
    // Preserve the source vehicle's own biome/body-paint hook before adding our masked artwork.
    baseHook.call(original, shader);
    shader.uniforms.vehicleLiveryMap = uniformState.map;
    shader.uniforms.vehicleLiveryGlow = uniformState.glow;
    shader.uniforms.vehicleLiveryMetalness = uniformState.metalness;
    shader.uniforms.vehicleLiveryRoughness = uniformState.roughness;
    shader.vertexShader = `attribute vec2 liveryUv;\nattribute float liveryMask;\nvarying vec2 vLiveryUv;\nvarying float vLiveryMask;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLiveryUv = liveryUv;\nvLiveryMask = liveryMask;');
    shader.fragmentShader = `uniform sampler2D vehicleLiveryMap;\nuniform float vehicleLiveryGlow;\nuniform float vehicleLiveryMetalness;\nuniform float vehicleLiveryRoughness;\nvarying vec2 vLiveryUv;\nvarying float vLiveryMask;\n${shader.fragmentShader}`
      .replace('#include <color_fragment>', `#include <color_fragment>${coverage}\nvec3 vehicleLiveryColor = texture2D(vehicleLiveryMap, vLiveryUv).rgb;\ndiffuseColor.rgb = mix(diffuseColor.rgb, vehicleLiveryColor, ${mask});`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, vehicleLiveryRoughness, ${mask});`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, vehicleLiveryMetalness, ${mask});`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance = mix(totalEmissiveRadiance, vehicleLiveryColor * vehicleLiveryGlow, ${mask});`);
  };
  return material;
}

/**
 * Preview is transactional and latest-request-wins. restore() immediately restores exact base references.
 * Call dispose() before the adapter's own dispose(). Optional textureLoader is for tests/engine integration.
 */
export function createVehicleLiveryController(THREE, adapter, vehicleId = adapter?.metadata?.id, options = {}) {
  const spec = VEHICLES[vehicleId];
  if (!spec) throw new RangeError(`Unknown livery vehicle: ${vehicleId}`);
  if (!adapter?.group?.isObject3D || !adapter?.body?.isObject3D) throw new TypeError('Livery needs a loaded vehicle adapter with group and body.');
  let prepared = null, activeLease = null, activeId = 'base', revision = 0, disposed = false;
  const uniforms = { map: { value: null }, glow: { value: 0 }, metalness: { value: .22 }, roughness: { value: .38 } };
  const detach = () => {
    if (prepared) for (const entry of prepared.entries) {
      entry.mesh.geometry = entry.originalGeometry;
      entry.mesh.material = entry.originalMaterial;
    }
    if (activeLease) activeLease.release();
    activeLease = null;
    uniforms.map.value = null;
    activeId = 'base';
    adapter.group.userData.vehicleLivery = { vehicleId, liveryId: 'base' };
  };
  return {
    get vehicleId() { return vehicleId; },
    get current() { return activeId; },
    get disposed() { return disposed; },
    get audit() { return prepared ? Object.freeze({
      paintedFaces: prepared.entries.reduce((sum, entry) => sum + entry.paintedFaces, 0),
      meshCount: prepared.entries.length, projection: 'independent six-sided body-local UV',
      bounds: { min: prepared.bounds.min.toArray(), max: prepared.bounds.max.toArray() },
    }) : null; },
    async preview(liveryId) {
      if (disposed || adapter.disposed) throw new Error('Vehicle livery controller is disposed.');
      const url = vehicleLiveryTextureURL(vehicleId, liveryId);
      const request = ++revision;
      if (liveryId === 'base') { detach(); return { applied: true, vehicleId, liveryId }; }
      if (activeId === liveryId) return { applied: true, vehicleId, liveryId };
      const lease = await acquireTexture(THREE, url, options.textureLoader);
      if (request !== revision || disposed || adapter.disposed) { lease.release(); return { applied: false, stale: true, vehicleId, liveryId }; }
      try {
        if (!prepared) {
          // Restore render-quality material substitutions at the point of use,
          // since a texture load may span several display-quality updates.
          options.beforePrepare?.();
          prepared = prepareMeshes(THREE, adapter, spec);
          for (const entry of prepared.entries) {
            entry.source = { geometry: entry.originalGeometry, material: entry.originalMaterial };
            liverySources.set(entry.mesh, entry.source);
            const source = Array.isArray(entry.originalMaterial) ? entry.originalMaterial : [entry.originalMaterial];
            entry.materials = source.map(material => makePaintMaterial(THREE, material, uniforms, spec));
          }
        }
        uniforms.map.value = lease.texture;
        uniforms.glow.value = liveryId === 'neon' ? .16 : liveryId === 'biome' && ['lavacrawler', 'ashhauler'].includes(vehicleId) ? .08 : 0;
        uniforms.metalness.value = liveryId === 'biome' && vehicleId === 'bmwreward' ? .7 : .2;
        uniforms.roughness.value = liveryId === 'biome' && vehicleId === 'bmwreward' ? .27 : .38;
        for (const entry of prepared.entries) {
          entry.mesh.geometry = entry.geometry;
          entry.mesh.material = Array.isArray(entry.originalMaterial) ? entry.materials : entry.materials[0];
        }
        if (activeLease) activeLease.release();
        activeLease = lease;
        activeId = liveryId;
        adapter.group.userData.vehicleLivery = { vehicleId, liveryId };
        return { applied: true, vehicleId, liveryId };
      } catch (error) { lease.release(); throw error; }
    },
    restore() { ++revision; if (!disposed) detach(); },
    dispose() {
      if (disposed) return;
      ++revision;
      detach();
      disposed = true;
      if (prepared) for (const entry of prepared.entries) {
        if (liverySources.get(entry.mesh) === entry.source) liverySources.delete(entry.mesh);
        entry.geometry.dispose();
        for (const material of entry.materials) if (material.userData.vehicleLivery) material.dispose();
      }
      prepared = null;
    },
  };
}
