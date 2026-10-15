

const CAPACITY = 128;
const RADIUS = 22;
const BOTTOM = -4;
const TOP = 17;
const HAZE_TOP = 6;
const STYLES = Object.freeze({
  forest: { count: 128, color: 0xaed1e6, opacity: 0.50, size: 12, hazeOpacity: 0.08, hazeSize: 120, kind: 0, fall: 21, wind: 1.5 },
  desert: { count: 112, color: 0xd9b16c, opacity: 0.36, size: 7, hazeOpacity: 0.13, hazeSize: 150, kind: 1, fall: 0.35, wind: 3.6 },
  snow: { count: 128, color: 0xf4faff, opacity: 0.74, size: 5, hazeOpacity: 0.10, hazeSize: 120, kind: 2, fall: 2.1, wind: 0.65 },
  volcanic: { count: 96, color: 0xb8a4a2, opacity: 0.54, size: 4, hazeOpacity: 0.11, hazeSize: 135, kind: 3, fall: 1.2, wind: 0.9 },
});

export function createBiomeWeather(THREE) {
  const group = new THREE.Group();
  group.name = 'biome-weather';
  group.visible = false;
  const positions = new Float32Array(CAPACITY * 3);
  const phases = new Float32Array(CAPACITY);


  const haze = new Float32Array(CAPACITY);
  for (let i = 0; i < CAPACITY; i += 16) haze[i] = 1;
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(positions, 3);
  position.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position);
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
      hazeSize: { value: 120 },
      kind: { value: 0 },
    },
    vertexShader: `
      uniform float particleSize;
      uniform float hazeSize;
      attribute float haze;
      varying float visibility;
      varying float isHaze;
      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        float distanceToCamera = -viewPosition.z;
        isHaze = haze;
        // Keep the immediate view clear and fade the edge of the local volume.
        visibility = smoothstep(3.0, 7.0, distanceToCamera)
          * (1.0 - smoothstep(18.0, 22.0, length(position.xz)));
        gl_Position = projectionMatrix * viewPosition;
        gl_PointSize = clamp(mix(particleSize, hazeSize, haze) * 14.0 / max(5.0, distanceToCamera),
          1.0, mix(20.0, 112.0, haze));
      }
    `,
    fragmentShader: `
      uniform vec3 weatherColor;
      uniform float opacity;
      uniform float hazeOpacity;
      uniform float kind;
      varying float visibility;
      varying float isHaze;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float alpha;
        if (isHaze > 0.5) {
          // Gentle wisps reduce distant contrast without hiding road edges.
          alpha = pow(1.0 - smoothstep(0.0, 0.5, length(p)), 2.0);
        } else if (kind < 0.5) {
          // Narrow vertical streaks distinguish rain from falling snow/ash.
          alpha = (1.0 - smoothstep(0.035, 0.10, abs(p.x + p.y * 0.12)))
            * (1.0 - smoothstep(0.25, 0.5, abs(p.y)));
        } else {
          alpha = 1.0 - smoothstep(kind < 1.5 ? 0.05 : 0.22, 0.5, length(p));
        }
        alpha *= mix(opacity, hazeOpacity, isHaze) * visibility;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(weatherColor, alpha);
      }
    `,
  });
  const particles = new THREE.Points(geometry, material);
  particles.name = 'pooled-biome-precipitation';
  particles.frustumCulled = false;
  group.add(particles);
  let currentBiome = null;
  let disposed = false;
  let time = 0;
  let seed = 0x17b10;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function spawn(index, scatterHeight) {
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * RADIUS;
    const offset = index * 3;
    positions[offset] = Math.cos(angle) * radius;
    const ceiling = haze[index] ? HAZE_TOP : TOP;
    positions[offset + 1] = scatterHeight ? BOTTOM + random() * (ceiling - BOTTOM) : ceiling;
    positions[offset + 2] = Math.sin(angle) * radius;
    phases[index] = random() * Math.PI * 2;
  }
  function clear() {
    group.visible = false;
    currentBiome = null;
    time = 0;
    geometry.setDrawRange(0, 0);
    material.uniforms.opacity.value = 0;
    material.uniforms.hazeOpacity.value = 0;
  }
  function update(dt, { biome, x = 0, y = 0, z = 0, active = true } = {}) {
    if (disposed) return;
    const id = typeof biome === 'string' ? biome : biome?.id;
    const style = Object.hasOwn(STYLES, id) ? STYLES[id] : null;
    if (!active || !style || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      clear();
      return;
    }
    const teleport = Math.hypot(x - group.position.x, y - group.position.y, z - group.position.z) > RADIUS * 2;
    if (id !== currentBiome || teleport) {
      for (let i = 0; i < CAPACITY; i++) spawn(i, true);
      currentBiome = id;
      time = 0;
      material.uniforms.weatherColor.value.setHex(style.color);
      material.uniforms.opacity.value = style.opacity;
      material.uniforms.particleSize.value = style.size;
      material.uniforms.hazeOpacity.value = style.hazeOpacity;
      material.uniforms.hazeSize.value = style.hazeSize;
      material.uniforms.kind.value = style.kind;
      geometry.setDrawRange(0, style.count);
    }
    group.position.set(x, y, z);
    group.visible = true;
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
    time += step;
    for (let i = 0; i < style.count; i++) {
      const offset = i * 3;
      const sway = style.kind === 0 ? 0 : Math.sin(time * 0.8 + phases[i]) * 0.8;
      positions[offset] += (style.wind + sway) * step;
      const fall = haze[i] ? Math.min(style.fall, 0.25) : style.fall;
      positions[offset + 1] -= fall * (0.8 + (i % 7) * 0.06) * step;
      positions[offset + 2] += sway * step * 0.6;
      const px = positions[offset], pz = positions[offset + 2];
      if (positions[offset + 1] < BOTTOM || px * px + pz * pz > RADIUS * RADIUS) spawn(i, false);
    }
    position.needsUpdate = true;
  }
  function dispose() {
    if (disposed) return;
    clear();
    disposed = true;
    geometry.dispose();
    material.dispose();
    group.remove(particles);
    group.removeFromParent();
  }
  return { group, update, clear, dispose };
}
