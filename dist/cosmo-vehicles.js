import {makeVehicleWindowsOpaque} from './vehicle-window-materials.js';
import {updateVisualSuspension} from './wheel-contact-visuals.js';




import {createModelLoader} from './model-loader.js';
import { attachVehicleBrakeLights } from './vehicle-brake-lights.js';

const TAU = Math.PI * 2;
const SOURCE_WHEEL_RADIUS = 0.68;
const GROUND_CLEARANCE = 0.05;



export const COSMO_VEHICLE_SCALE = 1.5;
// Keep a walkable gap between adjacent bays, including the wider compact/SUV bodies.
const MAX_WIDTH = 4.1;
const MAX_LENGTH = 5.76 * COSMO_VEHICLE_SCALE;
const byteCache = new Map();
const adoptedScenes = new WeakSet();
const paletteTextures = new Map();
const passengerTextures = new Map();
const passengerImages = new Map();
let paletteSource = null;
let paletteUsers = 0;




function acquirePalette(scene) {
  const sourceTextures = new Set(), sourceImages = new Set(), materials = new Set();
  scene.traverse(node => {
    for (const material of (Array.isArray(node.material) ? node.material : node.material ? [node.material] : [])) {
      materials.add(material);
      for (const texture of Object.values(material))
        if (texture?.isTexture && texture.name === 'texture-palette' &&
            texture.image?.width === 1000 && texture.image?.height === 720) {
          sourceTextures.add(texture);
          sourceImages.add(texture.source.data);
        }
    }
  });
  const replacements = new Map(), entries = new Set();
  for (const original of sourceTextures) {
    const key = JSON.stringify([
      original.wrapS, original.wrapT, original.magFilter, original.minFilter,
      original.anisotropy, original.format, original.type, original.colorSpace,
      original.flipY, original.premultiplyAlpha, original.unpackAlignment,
      original.generateMipmaps, original.offset.toArray(), original.repeat.toArray(),
      original.center.toArray(), original.rotation, original.channel,
    ]);
    if (!paletteSource) paletteSource = original.source;
    let entry = paletteTextures.get(key);
    if (!entry) {
      original.source = paletteSource;
      entry = { key, texture: original, users: 0 };
      paletteTextures.set(key, entry);
    }
    replacements.set(original, entry.texture);
    if (!entries.has(entry)) { entries.add(entry); entry.users++; }
  }
  for (const material of materials) for (const [key, value] of Object.entries(material))
    if (replacements.has(value)) material[key] = replacements.get(value);
  const retained = new Set([...entries].map(entry => entry.texture));
  for (const texture of sourceTextures) if (!retained.has(texture)) texture.dispose();
  for (const image of sourceImages)
    if (image !== paletteSource?.data && typeof image.close === 'function') image.close();
  if (entries.size) paletteUsers++;
  let released = false;
  return {
    textures: retained, image: entries.size ? paletteSource.data : null,
    release() {
      if (released) return;
      released = true;
      for (const entry of entries) if (--entry.users === 0) {
        entry.texture.dispose();
        paletteTextures.delete(entry.key);
      }
      if (entries.size && --paletteUsers === 0) {
        if (typeof paletteSource.data.close === 'function') paletteSource.data.close();
        paletteSource = null;
      }
    },
  };
}

// Reuse identical embedded textures across the independently loaded cars.
// Hashes are written by the asset preparation script, before GLB packaging.
function acquirePassengerTextures(scene) {
  const originals = new Set(), materials = new Set();
  scene.traverse(node => {
    for (const material of [].concat(node.material ?? [])) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) originals.add(value);
    }
  });
  const replacements = new Map(), entries = new Set(), images = new Set();
  const originalImages = new Set();
  for (const texture of originals) {
    const hash = texture.userData.passengerTextureHash ?? /^Passenger texture ([a-f0-9]{64})$/.exec(texture.name)?.[1];
    if (!hash) continue;
    originalImages.add(texture.source.data);
    let image = passengerImages.get(hash);
    if (!image) {
      image = { source: texture.source, users: 0 };
      passengerImages.set(hash, image);
    }
    const key = JSON.stringify([hash, texture.wrapS, texture.wrapT, texture.magFilter, texture.minFilter,
      texture.anisotropy, texture.format, texture.type, texture.colorSpace, texture.flipY,
      texture.premultiplyAlpha, texture.unpackAlignment, texture.generateMipmaps,
      texture.offset.toArray(), texture.repeat.toArray(), texture.center.toArray(), texture.rotation, texture.channel]);
    let entry = passengerTextures.get(key);
    if (!entry) {
      texture.source = image.source;
      entry = { key, texture, users: 0 };
      passengerTextures.set(key, entry);
    }
    replacements.set(texture, entry.texture);
    entries.add(entry);
    images.add(image);
  }
  for (const entry of entries) entry.users++;
  for (const image of images) image.users++;
  for (const material of materials) for (const [key, value] of Object.entries(material))
    if (replacements.has(value)) material[key] = replacements.get(value);
  const retained = new Set([...entries].map(entry => entry.texture));
  const retainedImages = new Set([...images].map(image => image.source.data));
  for (const texture of originals) if (replacements.has(texture) && !retained.has(texture)) texture.dispose();
  for (const image of originalImages)
    if (!retainedImages.has(image) && typeof image?.close === 'function') image.close();
  let released = false;
  return {
    textures: retained, images: retainedImages,
    release() {
      if (released) return;
      released = true;
      for (const entry of entries) if (--entry.users === 0) {
        entry.texture.dispose();
        passengerTextures.delete(entry.key);
      }
      for (const image of images) if (--image.users === 0) {
        for (const [hash, entry] of passengerImages) if (entry === image) passengerImages.delete(hash);
        image.source.data?.close?.();
      }
    },
  };
}

export const COSMO_VEHICLES = Object.freeze([

  { id: 'pickup', model: 'pickup', url: new URL('./assets/optimized/vehicles/passenger/pickup.glb', import.meta.url).href, biome: 'city', cargoZ: 0.55 },
  { id: 'citycourier', model: 'compact', url: new URL('./assets/optimized/vehicles/passenger/compact.glb', import.meta.url).href, biome: 'city', cargoZ: 0.95 },
  { id: 'rover', model: 'offroad', url: new URL('./assets/optimized/vehicles/passenger/offroad.glb', import.meta.url).href, biome: 'forest', cargoZ: 0.3 },
  { id: 'van', model: 'minivan', url: new URL('./assets/optimized/vehicles/passenger/minivan.glb', import.meta.url).href, biome: 'desert', cargoZ: 0.3 },
  { id: 'desertscout', model: 'hatchback', url: new URL('./assets/optimized/vehicles/passenger/hatchback.glb', import.meta.url).href, biome: 'desert', cargoZ: 0.075 },
  { id: 'snowrunner', model: 'suv', url: new URL('./assets/optimized/vehicles/passenger/suv.glb', import.meta.url).href, biome: 'snow', cargoZ: 0.1 },
  { id: 'lavacrawler', model: 'coupe', url: new URL('./assets/optimized/vehicles/passenger/coupe.glb', import.meta.url).href, biome: 'lava', cargoZ: 0.15 },
  { id: 'ashhauler', model: 'sport', url: new URL('./assets/optimized/vehicles/passenger/sport.glb', import.meta.url).href, biome: 'lava', cargoZ: 0.275 },
].map(spec => Object.freeze({
  ...spec, assetFamily: 'passenger', paint: Object.freeze((spec.paint ?? []).map(pair => Object.freeze(pair))),
})));

function vehicleSpec(id) {
  const spec = COSMO_VEHICLES.find(entry => entry.id === id);
  if (!spec) throw new RangeError(`Unknown Cosmo vehicle ID: ${id}`);
  return spec;
}

function resourcesOf(scene, palette) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), images = new Set();
  scene.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    const list = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
    for (const material of list) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const texture of textures) if (texture.source?.data) images.add(texture.source.data);
  let disposed = false;
  return {
    geometries, materials, textures,
    dispose() {
      if (disposed) return;
      disposed = true;
      geometries.forEach(value => value.dispose());
      materials.forEach(value => value.dispose());
      textures.forEach(value => { if (!palette.textures.has(value)) value.dispose(); });

      images.forEach(value => { if (value !== palette.image && !palette.images?.has(value) && typeof value.close === 'function') value.close(); });
      palette.release();
    },
  };
}

async function sourceBytes(url) {
  if (!byteCache.has(url)) {
    const pending = fetch(url).then(response => {
      if (!response.ok) throw new Error(`Cosmo vehicle download failed (${response.status}): ${url}`);
      return response.arrayBuffer();
    });
    byteCache.set(url, pending);
    pending.catch(() => { if (byteCache.get(url) === pending) byteCache.delete(url); });
  }
  return byteCache.get(url);
}





function applyBodyPaint(THREE, body, spec, resources) {
  const clones = new Map();
  const recolor = original => {
    if (!['metallic', 'texture'].includes(original.name) || !original.map) return original;
    if (clones.has(original)) return clones.get(original);
    const material = original.clone();
    clones.set(original, material);
    resources.materials.add(material);


    material.metalness = Math.min(material.metalness, 0.22);
    material.roughness = Math.max(material.roughness, 0.32);
    material.userData.cosmoBodyFinish = true;
    if (!spec.paint.length) return material;
    material.userData.cosmoPaintSwatches = spec.paint;
    material.customProgramCacheKey = () => `cosmo-palette-${spec.model}-${JSON.stringify(spec.paint)}`;
    material.onBeforeCompile = shader => {
      let declarations = '', replacements = '';
      spec.paint.forEach(([source, target], index) => {
        const from = `cosmoPaintSource${index}`, to = `cosmoPaintTarget${index}`;
        shader.uniforms[from] = { value: new THREE.Color(source) };
        shader.uniforms[to] = { value: new THREE.Color(target) };
        declarations += `uniform vec3 ${from};\nuniform vec3 ${to};\n`;
        replacements += `sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, ${to}, 1.0 - smoothstep(0.0005, 0.003, distance(sampledDiffuseColor.rgb, ${from})));\n`;
      });
      const mapFragment = THREE.ShaderChunk.map_fragment.replace(
        'diffuseColor *= sampledDiffuseColor;', `${replacements}diffuseColor *= sampledDiffuseColor;`,
      );
      shader.fragmentShader = declarations + shader.fragmentShader.replace('#include <map_fragment>', mapFragment);
    };
    return material;
  };
  body.traverse(node => {
    if (!node.material) return;
    node.material = Array.isArray(node.material) ? node.material.map(recolor) : recolor(node.material);
  });
}





export async function loadCosmoVehicle(THREE, vehicleId) {
  const spec = vehicleSpec(vehicleId);
  const bytes = await sourceBytes(spec.url);
  const gltf = await createModelLoader().parseAsync(bytes, new URL('.', spec.url).href);
  return createCosmoVehicleAdapter(THREE, vehicleId, gltf);
}


export function clearCosmoVehicleCache() { byteCache.clear(); }





export function createCosmoVehicleAdapter(THREE, vehicleId, gltf) {
  const spec = vehicleSpec(vehicleId);
  const cargoZ = spec.cargoZ * COSMO_VEHICLE_SCALE;
  const scene = gltf?.scene;
  if (!scene?.isObject3D) throw new TypeError('Cosmo visual requires a parsed GLTF scene.');
  if (adoptedScenes.has(scene)) throw new Error('This GLTF scene already belongs to a Cosmo adapter.');
  adoptedScenes.add(scene);
  const resources = resourcesOf(scene, spec.assetFamily === 'passenger' ? acquirePassengerTextures(scene) : acquirePalette(scene));
  const group = new THREE.Group();
  group.name = `Cosmo vehicle visual · ${vehicleId}`;
  const body = new THREE.Group();
  body.name = 'Cosmo suspended body';
  group.add(body);
  const normalized = new THREE.Group();
  normalized.name = 'Cosmo uniform scale and source-axis correction';

  normalized.rotation.y = Math.PI;
  normalized.add(scene);
  body.add(normalized);

  try {
    group.updateWorldMatrix(true, true);
    const sourceBounds = new THREE.Box3().setFromObject(normalized, true);
    const sourceSize = sourceBounds.getSize(new THREE.Vector3());
    if (![sourceSize.x, sourceSize.y, sourceSize.z].every(v => Number.isFinite(v) && v > 0))
      throw new Error(`Cosmo ${spec.model} has invalid bounds.`);
    const scale = Math.min(MAX_WIDTH / sourceSize.x, MAX_LENGTH / sourceSize.z);
    const center = sourceBounds.getCenter(new THREE.Vector3());
    normalized.scale.setScalar(scale);
    normalized.position.set(-center.x * scale, GROUND_CLEARANCE - sourceBounds.min.y * scale, -center.z * scale);
    group.updateWorldMatrix(true, true);
    const restBounds = new THREE.Box3().setFromObject(group, true);
    const wheelNodes = [];
    scene.traverse(node => {
      if (!/^wheels?\d*(?:\.\d+)?$/i.test(node.name)) return;
      if (/^wheels?\d*(?:\.\d+)?$/i.test(node.parent?.name ?? '')) return;
      wheelNodes.push(node);
    });
    if (wheelNodes.length !== 4) throw new Error(`Cosmo ${spec.model} expected four wheels; found ${wheelNodes.length}.`);

    const vertex = new THREE.Vector3();
    const wheels = wheelNodes.map(node => {
      const bounds = new THREE.Box3().setFromObject(node, true);


      const localPosition = bounds.getCenter(new THREE.Vector3());
      const front = localPosition.z < 0;
      const side = localPosition.x < 0 ? 'left' : 'right';
      let radius = 0, halfWidth = 0;
      const contactVertices = [], uniqueVertices = new Set();
      node.traverse(mesh => {
        const position = mesh.geometry?.attributes?.position;
        if (!position) return;
        for (let i = 0; i < position.count; i++) {
          vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).sub(localPosition);
          radius = Math.max(radius, Math.hypot(vertex.y, vertex.z));
          halfWidth = Math.max(halfWidth, Math.abs(vertex.x));
          const key = `${vertex.x.toFixed(6)},${vertex.y.toFixed(6)},${vertex.z.toFixed(6)}`;
          if (!uniqueVertices.has(key)) {
            uniqueVertices.add(key);
            contactVertices.push(Object.freeze(vertex.toArray()));
          }
        }
      });
      if (!Number.isFinite(radius) || radius <= 0) throw new Error(`Invalid Cosmo wheel radius: ${node.name}`);
      const pivot = new THREE.Group();
      pivot.name = `Cosmo ${front ? 'front' : 'rear'}-${side} steering pivot`;
      pivot.position.copy(localPosition);
      group.add(pivot);
      const spin = new THREE.Group();
      spin.name = 'Cosmo wheel roll about local -X';
      pivot.add(spin);


      spin.attach(node);
      return {
        name: `${front ? 'front' : 'rear'}-${side}`, front, side, localPosition,
        radius, halfWidth, contactVertices: Object.freeze(contactVertices),
        pivot, spin, node, steerAngle: 0, wheelSpin: 0,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
    if (new Set(wheels.map(wheel => wheel.name)).size !== 4)
      throw new Error(`Cosmo ${spec.model} has an ambiguous axle layout.`);

    let triangles = 0, primitives = 0;
    scene.traverse(node => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = false;
    });

    group.traverse(node => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = false;
      triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
      primitives += Array.isArray(node.material) ? node.material.length : 1;
    });
    makeVehicleWindowsOpaque(resources.materials);
    for (const material of resources.materials) {



      if (material.side === THREE.DoubleSide && !material.transparent &&
          material.opacity === 1 && material.alphaTest === 0)
        material.shadowSide = THREE.BackSide;
      if (typeof material.emissiveIntensity === 'number')
        material.emissiveIntensity = Math.min(material.emissiveIntensity, 0.65);
      // These source materials expect a studio environment map. Match the game's
      // diffuse daylight while retaining their original metal/roughness detail.
      if (material.name === 'Passenger Body' || material.name === 'Passenger Wheel Trim')
        material.metalness = Math.min(material.metalness, .22);
      if (material.name === 'Passenger Wheel') material.metalness = Math.min(material.metalness, .35);
      if (typeof material.roughness === 'number' && material.name !== 'glass')
        material.roughness = Math.max(material.roughness, 0.24);
    }

    applyBodyPaint(THREE, body, spec, resources);
    const brakeLights = attachVehicleBrakeLights(THREE, { scene, normalized, model: spec.model, resources });




    group.updateWorldMatrix(true, true);
    let supportY = -Infinity;
    const clip = (polygon, axis, edge, sign) => {
      const output = [];
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length];
        const da = sign * (a[axis] - edge), db = sign * (b[axis] - edge);
        if (da >= 0) output.push(a);
        if ((da < 0) !== (db < 0)) {
          const t = da / (da - db);
          output.push(a.map((value, index) => value + (b[index] - value) * t));
        }
      }
      return output;
    };
    body.traverse(mesh => {
      const positions = mesh.geometry?.attributes?.position;
      if (!positions) return;
      const index = mesh.geometry.index;
      for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
        let polygon = [0, 1, 2].map(offset => vertex.fromBufferAttribute(positions, index ? index.getX(i + offset) : i + offset).applyMatrix4(mesh.matrixWorld).toArray());
        for (const [axis, edge, sign] of [[0, -.59, 1], [0, .59, -1], [2, cargoZ - .59, 1], [2, cargoZ + .59, -1]]) {
          polygon = clip(polygon, axis, edge, sign);
          if (!polygon.length) break;
        }
        for (const point of polygon) supportY = Math.max(supportY, point[1]);
      }
    });
    if (!Number.isFinite(supportY)) supportY = restBounds.max.y;
    const cargoPosition = new THREE.Vector3(0, supportY + 0.55 + 0.025, cargoZ);
    const dimensions = restBounds.getSize(new THREE.Vector3());
    const wheelContacts = Object.freeze(wheels.map(wheel => Object.freeze({
      name: wheel.name, front: wheel.front, side: wheel.side,
      position: Object.freeze({ x: wheel.localPosition.x, y: wheel.localPosition.y, z: wheel.localPosition.z }),
      center: Object.freeze(wheel.localPosition.toArray()), radius: wheel.radius,
      halfWidth: wheel.halfWidth, vertices: wheel.contactVertices,
    })));
    const metadata = Object.freeze({
      id: vehicleId, model: spec.model, biome: spec.biome, url: spec.url,
      sourceForward: '+Z', forward: '-Z', up: '+Y', uniformScale: scale,
      sizeMultiplier: COSMO_VEHICLE_SCALE,
      sourceSize: Object.freeze(sourceSize.toArray()),
      dimensions: Object.freeze(dimensions.toArray()),
      bounds: Object.freeze({ min: Object.freeze(restBounds.min.toArray()), max: Object.freeze(restBounds.max.toArray()) }),
      footprint: Object.freeze({ width: MAX_WIDTH, length: MAX_LENGTH }),
      groundClearance: GROUND_CLEARANCE, sourceWheelRadius: SOURCE_WHEEL_RADIUS,
      wheels: wheelContacts, wheelContacts,
      wheelRadii: Object.freeze(wheels.map(wheel => wheel.radius)),
      wheelCenters: Object.freeze(wheels.map(wheel => Object.freeze(wheel.localPosition.toArray()))),
      wheelHalfWidth: Math.max(...wheels.map(wheel => Math.abs(wheel.localPosition.x))),
      bodyHalfWidth: dimensions.x / 2,
      triangles, primitives, materialCount: resources.materials.size,
      textureCount: resources.textures.size, sharedPalette: false, sharedTextures: true,
      assetFamily: spec.assetFamily, cargoPosition: Object.freeze(cargoPosition.toArray()),
      palette: 'Optimized source textures retained; identical maps shared across vehicles.',
      paintSwatches: spec.paint,
      brakeLights: brakeLights.metadata,
    });
    group.userData.cosmoVehicle = metadata;
    const originalMaterials = new Map();
    group.traverse(mesh => { if (mesh.isMesh) originalMaterials.set(mesh, mesh.material); });
    const black = new THREE.MeshBasicMaterial({color:0x000000,side:THREE.DoubleSide,toneMapped:false});
    resources.materials.add(black);
    let disposed = false, locked = false;
    const state = { steerAngle: 0, wheelSpin: 0, bodyPitch: 0, bodyRoll: 0, bodyBob: 0 };
    const adapter = {
      group, body, wheels, cargoPosition, metadata,
      get disposed() { return disposed; },
      get locked() { return locked; },
      setLocked(value) {
        if (disposed || locked === !!value) return adapter;
        locked = !!value;
        if (locked) brakeLights.set(false);
        for (const [mesh,material] of originalMaterials) mesh.material = locked ? black : material;
        group.userData.locked = locked;
        return adapter;
      },
      setBrakeLights(active) { brakeLights.set(locked ? false : active); return adapter; },
      update(pose = {}) {
        if (disposed) return adapter;
        if (!pose || typeof pose !== 'object') throw new TypeError('Cosmo update requires a pose object.');


        for (const key of Object.keys(state))
          if (pose[key] !== undefined && !Number.isFinite(pose[key]))
            throw new TypeError(`Cosmo ${key} must be finite.`);
        for (const key of Object.keys(state)) if (pose[key] !== undefined) state[key] = pose[key];
        updateVisualSuspension(wheels,pose);
        body.position.y = state.bodyBob;
        body.rotation.set(state.bodyPitch % TAU, 0, state.bodyRoll % TAU, 'XYZ');
        for (const wheel of wheels) {
          wheel.steerAngle = wheel.front ? state.steerAngle : 0;


          wheel.wheelSpin = state.wheelSpin * SOURCE_WHEEL_RADIUS / wheel.radius;
          wheel.pivot.rotation.y = wheel.steerAngle % TAU;
          wheel.spin.rotation.x = -(wheel.wheelSpin % TAU);
        }
        group.updateWorldMatrix(true, true);
        return adapter;
      },
      reset() {
        brakeLights.set(false);
        return adapter.update({ steerAngle: 0, wheelSpin: 0, bodyPitch: 0, bodyRoll: 0, bodyBob: 0 });
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        brakeLights.dispose();
        group.removeFromParent();
        resources.dispose();
      },
    };
    return adapter;
  } catch (error) {
    group.removeFromParent();
    resources.dispose();
    throw error;
  }
}
