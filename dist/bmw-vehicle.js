/** Real BMW G80 M3 reward visual, CC BY 4.0 by SharkyStudios.
 * See ./assets/vehicles/bmw/README.md for attribution and the source audit.
 * Adapter-owned resources; identity root, metres, +Y up and -Z forward.
 */
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { attachVehicleBrakeLights } from './vehicle-brake-lights.js';

const TAU = Math.PI * 2;
const SOURCE_WHEEL_RADIUS = .68; // The existing simulation's distance/spin unit.
const GROUND_CLEARANCE = .05;
const MAX_WIDTH = 4.65;
export const BMW_VEHICLE_LENGTH = 8;
export const BMW_VEHICLE = Object.freeze({
  id: 'bmwreward', model: 'bmw-g80-m3', biome: 'reward',
  url: new URL('./assets/vehicles/bmw/low-poly-bmw-g80-m3.glb', import.meta.url).href,
});
const byteCache = new Map();
const adoptedScenes = new WeakSet();

function vehicleSpec(id) {
  if (id !== BMW_VEHICLE.id) throw new RangeError(`Unknown BMW vehicle ID: ${id}`);
  return BMW_VEHICLE;
}

async function sourceBytes(url) {
  if (!byteCache.has(url)) {
    const pending = fetch(url).then(response => {
      if (!response.ok) throw new Error(`BMW vehicle download failed (${response.status}): ${url}`);
      return response.arrayBuffer();
    });
    byteCache.set(url, pending);
    pending.catch(() => { if (byteCache.get(url) === pending) byteCache.delete(url); });
  }
  return byteCache.get(url);
}

function resourcesOf(scene) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  scene.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    for (const material of materialList(node)) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  let disposed = false;
  return { geometries, materials, textures, dispose() {
    if (disposed) return;
    disposed = true;
    const images = new Set([...textures].map(texture => texture.source?.data));
    geometries.forEach(value => value.dispose());
    materials.forEach(value => value.dispose());
    textures.forEach(value => value.dispose());
    images.forEach(value => { if (typeof value?.close === 'function') value.close(); });
  } };
}

function materialList(node) {
  return Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
}

/** Tiny local IBL, generated entirely on the CPU. No HDR download, canvas,
 * renderer or PMREM setup is needed to create the adapter. The renderer handles
 * ordinary equirectangular envMap filtering when it first draws the gold paint.
 * It belongs only to this adapter's paint, never to scene.environment or glass.
 */
function createGoldReflectionEnvironment(THREE) {
  const width = 128, height = 64, data = new Uint8Array(width * height * 4);
  const direction = new THREE.Vector3();
  const softboxA = new THREE.Vector3(-.65, .55, -.52).normalize();
  const softboxB = new THREE.Vector3(.75, .25, .6).normalize();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const longitude = ((x + .5) / width - .5) * TAU;
    const latitude = ((y + .5) / height - .5) * Math.PI;
    const elevation = Math.sin(latitude), ring = Math.cos(latitude);
    direction.set(ring * Math.cos(longitude), elevation, ring * Math.sin(longitude));
    const sky = Math.max(0, elevation), ground = Math.max(0, -elevation);
    const horizon = Math.exp(-elevation * elevation * 26);
    const boxA = Math.pow(Math.max(0, direction.dot(softboxA)), 30);
    const boxB = Math.pow(Math.max(0, direction.dot(softboxB)), 45);
    const light = .8 * boxA + .65 * boxB;
    const rgb = [
      .22 + .23 * sky + .08 * ground + .18 * horizon + light,
      .25 + .34 * sky + .04 * ground + .16 * horizon + light,
      .29 + .48 * sky + .02 * ground + .13 * horizon + light,
    ];
    const i = (y * width + x) * 4;
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(Math.min(1, rgb[c]) * 255);
    data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = 'BMW gold paint · local sky and softbox reflections';
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function applyGoldPaint(THREE, body, resources) {
  const paints = new Map();
  let environment;
  body.traverse(node => {
    if (!node.material) return;
    const recolor = original => {
      // This is the source's green exterior ONLY. Material.016 is shared by
      // black body trim and tires; windows are Material.020 and remain intact.
      if (original.name !== 'Material.015') return original;
      if (paints.has(original)) return paints.get(original);
      if (!environment) {
        environment = createGoldReflectionEnvironment(THREE);
        resources.textures.add(environment);
      }
      const material = original.clone();
      material.color.setHex(0xffc52e);
      material.metalness = .9;
      material.roughness = .22;
      material.emissive.setHex(0xffbd20);
      material.emissiveIntensity = .12;
      material.envMap = environment;
      material.envMapIntensity = 1.15;
      material.userData.bmwGoldBodyFinish = true;
      resources.materials.add(material);
      paints.set(original, material);
      return material;
    };
    node.material = Array.isArray(node.material) ? node.material.map(recolor) : recolor(node.material);
  });
  if (paints.size !== 1) throw new Error('BMW source must contain one audited Material.015 body paint.');
}

export async function loadBMWVehicle(THREE, vehicleId = BMW_VEHICLE.id) {
  const spec = vehicleSpec(vehicleId);
  const bytes = await sourceBytes(spec.url);
  const gltf = await new GLTFLoader().parseAsync(bytes, new URL('.', spec.url).href);
  return createBMWVehicleAdapter(THREE, vehicleId, gltf);
}

/** Cached source bytes are immutable; active adapters own separate GPU resources. */
export function clearBMWVehicleCache() { byteCache.clear(); }

/** Adopt one fresh real GLTF parse. Call update(lastPose) before revealing it.
 * The caller owns attachment and must dispose stale asynchronous results.
 */
export function createBMWVehicleAdapter(THREE, vehicleId, gltf) {
  const spec = vehicleSpec(vehicleId);
  const scene = gltf?.scene;
  if (!scene?.isObject3D) throw new TypeError('BMW visual requires a parsed GLTF scene.');
  if (adoptedScenes.has(scene)) throw new Error('This GLTF scene already belongs to a BMW adapter.');
  adoptedScenes.add(scene);
  const resources = resourcesOf(scene);
  const group = new THREE.Group();
  group.name = 'BMW gold reward vehicle visual';
  const body = new THREE.Group();
  body.name = 'BMW suspended body';
  group.add(body);
  const normalized = new THREE.Group();
  normalized.name = 'BMW uniform scale and +Z to -Z source correction';
  normalized.rotation.y = Math.PI;
  normalized.add(scene);
  body.add(normalized);

  try {
    group.updateWorldMatrix(true, true);
    const sourceBounds = new THREE.Box3().setFromObject(normalized, true);
    const sourceSize = sourceBounds.getSize(new THREE.Vector3());
    if (![sourceSize.x, sourceSize.y, sourceSize.z].every(v => Number.isFinite(v) && v > 0))
      throw new Error('BMW source has invalid bounds.');
    const scale = Math.min(MAX_WIDTH / sourceSize.x, BMW_VEHICLE_LENGTH / sourceSize.z);
    const center = sourceBounds.getCenter(new THREE.Vector3());
    normalized.scale.setScalar(scale);
    normalized.position.set(-center.x * scale, GROUND_CLEARANCE - sourceBounds.min.y * scale, -center.z * scale);
    group.updateWorldMatrix(true, true);
    const restBounds = new THREE.Box3().setFromObject(group, true);
    const wheelNodes = [];
    scene.traverse(node => {
      // GLTFLoader sanitizes dots from node names; retain original-name support
      // for a direct parser that preserves the authoring names.
      if (/^Plane\.?00[3-6]$/.test(node.name)) wheelNodes.push(node);
    });
    if (wheelNodes.length !== 4) throw new Error(`BMW expected four wheels; found ${wheelNodes.length}.`);
    const vertex = new THREE.Vector3();
    const wheels = wheelNodes.map(node => {
      const bounds = new THREE.Box3().setFromObject(node, true);
      const localPosition = bounds.getCenter(new THREE.Vector3());
      const front = localPosition.z < 0, side = localPosition.x < 0 ? 'left' : 'right';
      let radius = 0, halfWidth = 0;
      const contactVertices = [], unique = new Set();
      node.traverse(mesh => {
        const positions = mesh.geometry?.attributes?.position;
        if (!positions) return;
        for (let i = 0; i < positions.count; i++) {
          vertex.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).sub(localPosition);
          radius = Math.max(radius, Math.hypot(vertex.y, vertex.z));
          halfWidth = Math.max(halfWidth, Math.abs(vertex.x));
          const key = vertex.toArray().map(v => v.toFixed(6)).join(',');
          if (!unique.has(key)) { unique.add(key); contactVertices.push(Object.freeze(vertex.toArray())); }
        }
      });
      if (!Number.isFinite(radius) || radius <= 0) throw new Error(`Invalid BMW wheel radius: ${node.name}`);
      const pivot = new THREE.Group();
      pivot.name = `BMW ${front ? 'front' : 'rear'}-${side} steering pivot`;
      pivot.position.copy(localPosition);
      group.add(pivot);
      const spin = new THREE.Group();
      spin.name = 'BMW wheel roll about local -X';
      pivot.add(spin);
      // All original wheel origins coincide with the body origin. Reparent
      // beneath their measured geometry centers, retaining the whole transform.
      spin.attach(node);
      return { name: `${front ? 'front' : 'rear'}-${side}`, front, side, localPosition,
        radius, halfWidth, contactVertices: Object.freeze(contactVertices),
        pivot, spin, node, steerAngle: 0, wheelSpin: 0 };
    }).sort((a, b) => a.name.localeCompare(b.name));
    if (new Set(wheels.map(wheel => wheel.name)).size !== 4)
      throw new Error('BMW source has an ambiguous axle layout.');

    let triangles = 0, primitives = 0;
    group.traverse(mesh => {
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
      primitives += materialList(mesh).length;
    });
    for (const material of resources.materials) {
      // Match the existing solid-vehicle shadow fix without changing viewing
      // sidedness, glass/trim colors, tire roughness or original material maps.
      if (material.side === THREE.DoubleSide && !material.transparent &&
          material.opacity === 1 && material.alphaTest === 0) material.shadowSide = THREE.BackSide;
      if (typeof material.emissiveIntensity === 'number')
        material.emissiveIntensity = Math.min(material.emissiveIntensity, .65);
    }
    applyGoldPaint(THREE, body, resources);
    const brakeLights = attachVehicleBrakeLights(THREE, { scene, normalized, model: spec.model, resources });
    const dimensions = restBounds.getSize(new THREE.Vector3());
    // Cargo is currently hidden. A conservative roof-safe position preserves
    // the shared adapter contract if an external caller attaches a crate.
    const cargoPosition = new THREE.Vector3(0, restBounds.max.y + .55 + .025, 0);
    const wheelContacts = Object.freeze(wheels.map(wheel => Object.freeze({
      name: wheel.name, front: wheel.front, side: wheel.side,
      position: Object.freeze({ x: wheel.localPosition.x, y: wheel.localPosition.y, z: wheel.localPosition.z }),
      center: Object.freeze(wheel.localPosition.toArray()), radius: wheel.radius,
      halfWidth: wheel.halfWidth, vertices: wheel.contactVertices,
    })));
    const metadata = Object.freeze({
      id: vehicleId, model: spec.model, biome: spec.biome, url: spec.url,
      sourceForward: '+Z', forward: '-Z', up: '+Y', uniformScale: scale,
      sizeMultiplier: 1, sourceSize: Object.freeze(sourceSize.toArray()),
      dimensions: Object.freeze(dimensions.toArray()),
      bounds: Object.freeze({ min: Object.freeze(restBounds.min.toArray()), max: Object.freeze(restBounds.max.toArray()) }),
      footprint: Object.freeze({ width: dimensions.x, length: dimensions.z }),
      groundClearance: GROUND_CLEARANCE, sourceWheelRadius: SOURCE_WHEEL_RADIUS,
      wheels: wheelContacts, wheelContacts,
      wheelRadii: Object.freeze(wheels.map(wheel => wheel.radius)),
      wheelCenters: Object.freeze(wheels.map(wheel => Object.freeze(wheel.localPosition.toArray()))),
      wheelHalfWidth: Math.max(...wheels.map(wheel => Math.abs(wheel.localPosition.x))),
      bodyHalfWidth: dimensions.x / 2,
      triangles, primitives, materialCount: resources.materials.size, textureCount: resources.textures.size,
      cargoPosition: Object.freeze(cargoPosition.toArray()), goldBodyMaterial: 'Material.015',
      reflectionEnvironment: '128x64 local linear RGBA8 equirectangular sky and softboxes; body only',
      brakeLights: brakeLights.metadata,
    });
    group.userData.bmwVehicle = metadata;
    let disposed = false;
    const state = { steerAngle: 0, wheelSpin: 0, bodyPitch: 0, bodyRoll: 0, bodyBob: 0 };
    const adapter = {
      group, body, wheels, cargoPosition, metadata,
      get disposed() { return disposed; },
      setBrakeLights(active) { brakeLights.set(active); return adapter; },
      update(pose = {}) {
        if (disposed) return adapter;
        if (!pose || typeof pose !== 'object') throw new TypeError('BMW update requires a pose object.');
        for (const key of Object.keys(state)) if (pose[key] !== undefined && !Number.isFinite(pose[key]))
          throw new TypeError(`BMW ${key} must be finite.`);
        for (const key of Object.keys(state)) if (pose[key] !== undefined) state[key] = pose[key];
        // The authoritative game rig owns world pose and movement.
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
