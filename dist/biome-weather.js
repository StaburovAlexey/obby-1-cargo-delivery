import { BIOME_DEFINITIONS } from './route-network-config.js';





const CAPACITY = 768;
const NEAR = 3;
const FAR = 40;
const VIEW_MARGIN = 1.8;
export const WEATHER_TRANSITION = Object.freeze({ distance: 180, seconds: 0.7 });
const CLEAR_FOG = Object.freeze({ color: 0x329dff, near: 500, far: 1600 });
const STYLES = Object.freeze({
  forest: { count: 768, color: 0xbcdbea, opacity: 0.78, size: 24, hazeOpacity: 0.16, hazeSize: 170, kind: 0, fall: 24, wind: 2.4, fog: Object.freeze({ color: 0x97b1be, near: 46, far: 220 }) },
  desert: { count: 768, color: 0xe1b679, opacity: 0.60, size: 8, hazeOpacity: 0.24, hazeSize: 210, kind: 1, fall: 0.5, wind: 8.5, fog: Object.freeze({ color: 0xc7a16c, near: 36, far: 150 }) },
  snow: { count: 768, color: 0xf4faff, opacity: 0.88, size: 10, hazeOpacity: 0.18, hazeSize: 180, kind: 2, fall: 3.1, wind: 1.8, fog: Object.freeze({ color: 0xd8e5ec, near: 42, far: 190 }) },
  volcanic: { count: 768, color: 0xc5b5b2, opacity: 0.72, size: 8, hazeOpacity: 0.22, hazeSize: 200, kind: 3, fall: 1.8, wind: 2.8, fog: Object.freeze({ color: 0x8c7d7c, near: 38, far: 170 }) },
});

function createWeatherLayer(THREE, seedOffset = 0) {
  const positions = new Float32Array(CAPACITY * 3);
  const phases = new Float32Array(CAPACITY);
  const life = new Float32Array(CAPACITY);


  const haze = new Float32Array(CAPACITY);
  for (let i = 0; i < CAPACITY; i += 32) haze[i] = 1;
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(positions, 3);
  position.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position);
  const lifeAttribute = new THREE.BufferAttribute(life, 1);
  lifeAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('life', lifeAttribute);
  geometry.setAttribute('haze', new THREE.BufferAttribute(haze, 1));
  geometry.setDrawRange(0, 0);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    uniforms: {
      weatherColor: { value: new THREE.Color() },
      opacity: { value: 0 },
      particleSize: { value: 4 },
      hazeOpacity: { value: 0 },
      hazeSize: { value: 170 },
      kind: { value: 0 },
      blendWeight: { value: 0 },
    },
    vertexShader: `
      uniform float particleSize;
      uniform float hazeSize;
      attribute float haze;
      attribute float life;
      varying float visibility;
      varying float isHaze;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        float distanceToCamera = -viewPosition.z;
        gl_Position = projectionMatrix * viewPosition;
        vec2 edge = abs(gl_Position.xy / max(0.001, gl_Position.w));
        isHaze = haze;
        // Clear the immediate view and soften recycling at the volume edges.
        visibility = smoothstep(0.0, 0.3, life)
          * smoothstep(3.0, 6.0, distanceToCamera)
          * (1.0 - smoothstep(30.0, 40.0, distanceToCamera))
          * (1.0 - smoothstep(1.25, 1.8, edge.x))
          * (1.0 - smoothstep(1.25, 1.8, edge.y));
        gl_PointSize = clamp(mix(particleSize, hazeSize, haze) * 22.0 / max(5.0, distanceToCamera),
          2.0, mix(52.0, 180.0, haze));
      }
    `,
    fragmentShader: `
      uniform vec3 weatherColor;
      uniform float opacity;
      uniform float hazeOpacity;
      uniform float kind;
      uniform float blendWeight;
      varying float visibility;
      varying float isHaze;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float alpha;
        if (isHaze > 0.5) {
          alpha = pow(1.0 - smoothstep(0.0, 0.5, length(p)), 2.0);
        } else if (kind < 0.5) {
          // Long, wind-slanted drops read as a downpour rather than dots.
          alpha = (1.0 - smoothstep(0.035, 0.085, abs(p.x + p.y * 0.22)))
            * (1.0 - smoothstep(0.30, 0.5, abs(p.y)));
        } else if (kind < 1.5) {
          // Windblown sand has a stretched profile distinct from snow/ash.
          alpha = 1.0 - smoothstep(0.06, 0.5, length(p * vec2(0.85, 1.8)));
        } else {
          alpha = 1.0 - smoothstep(kind < 2.5 ? 0.24 : 0.14, 0.5, length(p));
        }
        alpha *= mix(opacity, hazeOpacity, isHaze) * visibility * blendWeight;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(weatherColor, alpha);
      }
    `,
  });
  const particles = new THREE.Points(geometry, material);
  particles.name = 'pooled-biome-precipitation';
  particles.frustumCulled = false;
  particles.visible = false;
  const rotation = new THREE.Quaternion();
  const previousRotation = new THREE.Quaternion();
  const inverseRotation = new THREE.Quaternion();
  const vector = new THREE.Vector3();
  const velocityInView = new THREE.Vector3();
  let halfHeight = Math.tan(53 * Math.PI / 360);
  let halfWidth = halfHeight;
  let style = null;
  let changedView = false;
  let time = 0;
  let seed = 0x17b10 + seedOffset;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function spawn(index, scatter, count, upstream = false) {
    let depth = NEAR + random() ** 2 * (FAR - NEAR);



    let nx = ((index % 16 + random()) / 16 * 2 - 1) * VIEW_MARGIN;
    let ny = ((Math.floor(index / 16) + random()) / Math.ceil(count / 16) * 2 - 1) * VIEW_MARGIN;
    if (!scatter) {
      nx = (random() * 2 - 1) * VIEW_MARGIN;
      ny = (random() * 2 - 1) * VIEW_MARGIN;
    }


    nx = Math.sign(nx) * (Math.abs(nx) / VIEW_MARGIN) ** 1.4 * VIEW_MARGIN;
    ny = Math.sign(ny) * (Math.abs(ny) / VIEW_MARGIN) ** 1.4 * VIEW_MARGIN;
    if (upstream) {



      const horizontal = Math.abs(velocityInView.x) / halfWidth;
      const vertical = Math.abs(velocityInView.y) / halfHeight;
      if (Math.abs(velocityInView.z) > Math.max(horizontal, vertical)) depth = velocityInView.z > 0 ? FAR : NEAR;
      else if (horizontal > vertical) nx = -Math.sign(velocityInView.x || 1) * VIEW_MARGIN;
      else ny = -Math.sign(velocityInView.y || -1) * VIEW_MARGIN;
    }
    life[index] = scatter ? 0.3 : 0;
    vector.set(nx * depth * halfWidth, ny * depth * halfHeight, -depth).applyQuaternion(rotation);
    vector.toArray(positions, index * 3);
    phases[index] = random() * Math.PI * 2;
  }
  function updateView(camera) {
    previousRotation.copy(rotation);
    if (camera?.isPerspectiveCamera) {
      rotation.copy(camera.quaternion);
      halfHeight = Math.tan(camera.fov * Math.PI / 360) / camera.zoom;
      halfWidth = halfHeight * camera.aspect;
    } else {
      rotation.setFromAxisAngle(vector.set(1, 0, 0), -Math.atan2(8.3, 13));
      halfHeight = Math.tan(53 * Math.PI / 360);
      halfWidth = halfHeight;
    }
    inverseRotation.copy(rotation).invert();
    changedView = Math.abs(previousRotation.dot(rotation)) < 0.999999;
  }
  function configure(id) {

    style = STYLES[id];
    layer.id = id;
    time = 0;
    for (let i = 0; i < style.count; i++) spawn(i, true, style.count);
    material.uniforms.weatherColor.value.setHex(style.color);
    material.uniforms.opacity.value = style.opacity;
    material.uniforms.particleSize.value = style.size;
    material.uniforms.hazeOpacity.value = style.hazeOpacity;
    material.uniforms.hazeSize.value = style.hazeSize;
    material.uniforms.kind.value = style.kind;
    position.needsUpdate = true;
    lifeAttribute.needsUpdate = true;
  }
  function setWeight(weight) {
    layer.weight = weight;
    material.uniforms.blendWeight.value = weight;
    particles.visible = weight > 0;
    geometry.setDrawRange(0, particles.visible ? style.count : 0);
  }
  function advance(step) {
    if (!style || !step || !layer.weight) return;
    velocityInView.set(style.wind, -style.fall, 0).applyQuaternion(inverseRotation);
    time += step;
    for (let i = 0; i < style.count; i++) {
      const offset = i * 3;
      life[i] = Math.min(0.3, life[i] + step);
      const sway = style.kind === 0 ? 0 : Math.sin(time * 0.8 + phases[i]) * 1.1;
      positions[offset] += (style.wind + sway) * step;
      const fall = haze[i] ? Math.min(style.fall, 0.35) : style.fall;
      positions[offset + 1] -= fall * (0.8 + (i % 7) * 0.06) * step;
      positions[offset + 2] += sway * step * 0.7;
      vector.fromArray(positions, offset).applyQuaternion(inverseRotation);
      const depth = -vector.z;


      if (depth < NEAR || depth > FAR || Math.abs(vector.x) > depth * halfWidth * VIEW_MARGIN
        || Math.abs(vector.y) > depth * halfHeight * VIEW_MARGIN) spawn(i, false, style.count, style.kind === 0 && !haze[i] && !changedView);
    }
    position.needsUpdate = true;
    lifeAttribute.needsUpdate = true;
  }
  function clear() {
    setWeight(0);
    layer.id = null;
    style = null;
    time = 0;
    material.uniforms.opacity.value = 0;
    material.uniforms.hazeOpacity.value = 0;
  }
  function dispose() {
    clear();
    geometry.dispose();
    material.dispose();
    particles.removeFromParent();
  }
  const layer = { particles, id: null, weight: 0, updateView, configure, setWeight, advance, clear, dispose };
  return layer;
}

export function createBiomeWeather(THREE) {
  const group = new THREE.Group();
  group.name = 'biome-weather';
  group.visible = false;
  const layers = [createWeatherLayer(THREE), createWeatherLayer(THREE, 0x49f3)];
  for (const layer of layers) group.add(layer.particles);
  const ids = Object.keys(STYLES);
  const targets = new Float64Array(ids.length);
  const clearColor = new THREE.Color(CLEAR_FOG.color);
  const colors = ids.map(id => new THREE.Color(STYLES[id].fog.color));
  const fogColor = new THREE.Color();
  const fog = { ...CLEAR_FOG };
  let disposed = false;
  function setTarget(id, weight) {
    const index = ids.indexOf(id);
    if (index >= 0) targets[index] = weight;
  }
  function findTargets(progress, biome) {
    targets.fill(0);
    if (Number.isFinite(progress)) {
      const halfBand = WEATHER_TRANSITION.distance / 2;
      for (let i = 1; i < BIOME_DEFINITIONS.length; i++) {
        const boundary = BIOME_DEFINITIONS[i].from;
        if (progress >= boundary - halfBand && progress <= boundary + halfBand) {
          const t = (progress - boundary + halfBand) / WEATHER_TRANSITION.distance;
          const blend = t * t * (3 - 2 * t);
          setTarget(BIOME_DEFINITIONS[i - 1].id, 1 - blend);
          setTarget(BIOME_DEFINITIONS[i].id, blend);
          return;
        }
      }
      const current = BIOME_DEFINITIONS.find(item => progress < item.to) || BIOME_DEFINITIONS.at(-1);
      setTarget(current.id, 1);
    } else {


      setTarget(typeof biome === 'string' ? biome : biome?.id, 1);
    }
  }
  function updateFog() {
    const total = layers[0].weight + layers[1].weight;
    const clearWeight = Math.max(0, 1 - total);
    fogColor.copy(clearColor).multiplyScalar(clearWeight);
    fog.near = CLEAR_FOG.near * clearWeight;
    fog.far = CLEAR_FOG.far * clearWeight;
    for (const layer of layers) {
      if (!layer.weight) continue;
      const color = colors[ids.indexOf(layer.id)];
      fogColor.r += color.r * layer.weight;
      fogColor.g += color.g * layer.weight;
      fogColor.b += color.b * layer.weight;
      fog.near += STYLES[layer.id].fog.near * layer.weight;
      fog.far += STYLES[layer.id].fog.far * layer.weight;
    }


    fog.color = fogColor.getHex();
    group.visible = total > 0;
  }
  function clear() {
    for (const layer of layers) layer.clear();
    group.visible = false;
    Object.assign(fog, CLEAR_FOG);
  }
  function update(dt, { biome, progress, camera, x = camera?.position.x ?? 0, y = camera?.position.y ?? 0, z = camera?.position.z ?? 0, active = true, paused = false } = {}) {
    if (disposed) return;
    if (!active || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      clear();
      return;
    }

    if (paused) return;
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
    findTargets(progress, biome);
    for (const layer of layers) layer.updateView(camera);



    for (let i = 0; i < ids.length; i++) {
      if (!targets[i] || layers.some(layer => layer.id === ids[i])) continue;
      const free = layers.find(layer => layer.weight === 0 && !targets[ids.indexOf(layer.id)]);
      if (free) free.configure(ids[i]);
    }



    const waiting = ids.some((id, i) => targets[i] && !layers.some(layer => layer.id === id));
    const hold = waiting && layers.every(layer => layer.weight > 0 && !targets[ids.indexOf(layer.id)])
      ? (layers[0].weight >= layers[1].weight ? layers[0] : layers[1]) : null;
    for (const layer of layers) {
      const target = layer === hold ? layer.weight : targets[ids.indexOf(layer.id)] || 0;
      const difference = target - layer.weight;
      const amount = Math.min(Math.abs(difference), step / WEATHER_TRANSITION.seconds);
      layer.setWeight(amount === Math.abs(difference) ? target : layer.weight + Math.sign(difference) * amount);
      layer.advance(step);
    }


    group.position.set(x, y, z);
    updateFog();
  }
  function dispose() {
    if (disposed) return;
    clear();
    disposed = true;
    for (const layer of layers) layer.dispose();
    group.removeFromParent();
  }
  return { group, update, clear, dispose, get fog() { return group.visible ? fog : null; } };
}
