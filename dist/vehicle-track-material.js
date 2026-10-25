const vertexShader = `
attribute float opacity;
varying float fade;
varying vec2 trackUv;
void main() {
  fade = opacity;
  trackUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// The longitudinal coordinate is travelled metres, shared by adjoining ribbon
// corners. Patterns stay on the road and keep their scale when the car turns.
const fragmentShader = `
uniform float pattern;
uniform vec3 trackColor;
varying float fade;
varying vec2 trackUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 spectrum(float hue) {
  return clamp(abs(fract(hue + vec3(0.0, 0.666667, 0.333333)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
}
float zigzag(float along) {
  float cell = floor(along);
  return mix(hash(vec2(cell, 2.7)), hash(vec2(cell + 1.0, 2.7)), fract(along)) * 1.25 - 0.625;
}
void main() {
  float x = trackUv.x * 2.0 - 1.0;
  float y = trackUv.y;
  float edge = 1.0 - smoothstep(0.65, 1.0, abs(x));
  float alpha = edge;
  vec3 color = trackColor;
  if (pattern < 1.5) {
    float core = exp(-x * x * 26.0);
    color = mix(trackColor, vec3(1.0), core * 0.72);
    alpha = edge * (0.27 + 0.73 * exp(-x * x * 3.2));
  } else if (pattern < 2.5) {
    color = mix(spectrum(y * 0.18), vec3(1.0), 0.10);
    alpha = edge * (0.62 + 0.35 * exp(-x * x * 7.0));
  } else if (pattern < 3.5) {
    float t = fract(y * 0.72);
    float tongue = abs(x + sin(y * 7.4) * 0.16 + sin(y * 13.0 + x * 5.0) * 0.055);
    float width = 0.15 + (1.0 - t) * 0.68;
    float flame = 1.0 - smoothstep(width * 0.6, width, tongue);
    float heat = flame * (0.38 + (1.0 - t) * 0.62);
    color = mix(vec3(0.7, 0.018, 0.002), vec3(1.0, 0.22, 0.006), flame);
    color = mix(color, vec3(1.0, 0.93, 0.40), heat * heat);
    alpha = edge * (0.30 + flame * 0.70);
  } else if (pattern < 4.5) {
    float crackA = abs(x - (sin(y * 5.3) * 0.31 + sin(y * 12.7) * 0.12));
    float crackB = abs(x + sin(y * 7.1 + 2.0) * 0.48);
    float cracks = max(1.0 - smoothstep(0.016, 0.055, crackA), 1.0 - smoothstep(0.013, 0.037, crackB));
    float frost = hash(floor(vec2(trackUv.x * 35.0, y * 24.0)));
    color = mix(vec3(0.09, 0.42, 0.75), vec3(0.53, 0.91, 1.0), 0.35 + frost * 0.34);
    color = mix(color, vec3(0.94, 1.0, 1.0), cracks);
    alpha = edge * (0.52 + frost * 0.16 + cracks * 0.30);
  } else {
    float bolt = abs(x - zigzag(y * 4.0));
    float branch = abs(x - zigzag(y * 6.0 + 13.0) * 0.55 - 0.30);
    float core = 1.0 - smoothstep(0.025, 0.075, bolt);
    float forks = (1.0 - smoothstep(0.012, 0.043, branch)) * (1.0 - smoothstep(0.25, 0.75, fract(y * 1.3)));
    float glow = exp(-bolt * bolt * 25.0);
    color = mix(vec3(0.07, 0.15, 0.70), vec3(0.38, 0.68, 1.0), glow);
    color = mix(color, vec3(0.94, 0.98, 1.0), max(core, forks));
    alpha = edge * (0.15 + glow * 0.42 + max(core, forks) * 0.65);
  }
  alpha = min(1.0, alpha) * fade;
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(color, alpha);
  #include <colorspace_fragment>
}`;

export function createVehicleTrackMaterial(THREE) {
  return new THREE.ShaderMaterial({
    uniforms: {pattern: {value: 1}, trackColor: {value: new THREE.Color(0xb84dff)}},
    vertexShader, fragmentShader, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
}

export function configureVehicleTrackMaterial(material, style) {
  material.uniforms.pattern.value = {neon: 1, rainbow: 2, fire: 3, ice: 4, lightning: 5}[style.effect];
  material.uniforms.trackColor.value.set(style.color);
}
