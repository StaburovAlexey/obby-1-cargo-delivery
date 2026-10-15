


import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import { createBiomeWeather, WEATHER_TRANSITION } from '../dist/biome-weather.js';
import { BIOME_DEFINITIONS, routePointAtProgress } from '../dist/route-network.js';
import { BRIDGES } from '../dist/road-bridges.js';
import { createAppDom } from './fixtures/app-dom.mjs';

const ids = ['forest', 'desert', 'snow', 'volcanic'];
const step = 1 / 60;
const halfBand = WEATHER_TRANSITION.distance / 2;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const close = (a, b, message, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} != ${b}`);
const weights = weather => {
  const result = { forest: 0, desert: 0, snow: 0, volcanic: 0 };
  for (const points of weather.group.children) result[ids[points.material.uniforms.kind.value]] += points.material.uniforms.blendWeight.value;
  return result;
};
const total = weather => Object.values(weights(weather)).reduce((a, b) => a + b, 0);
const settle = (weather, options) => { for (let i = 0; i < 90; i++) weather.update(step, options); };
const camera = new THREE.PerspectiveCamera(53, 390 / 844, .5, 1800);
camera.position.set(123, 12, -30);
camera.lookAt(123, 1.7, -46);
camera.updateMatrixWorld();
const cameraSnapshot = [...camera.position.toArray(), ...camera.quaternion.toArray(), ...camera.projectionMatrix.elements];
const report = {
  scope: 'Offline CPU: production Three.js, actual shader-derived alpha and real app camera/projected road. No browser, GPU, Android or frame-rate claim.',
  settings: WEATHER_TRANSITION,
  boundaries: [], projection: [], stress: {}, app: [],
};



function observer(weather) {
  const resources = weather.group.children.map(points => ({
    points, geometry: points.geometry, material: points.material,
    buffers: ['position', 'life', 'haze'].map(name => points.geometry.getAttribute(name).array),
    kind: points.material.uniforms.kind.value, weight: 0,
  }));
  let maxWeightStep = 0, checks = 0;
  return {
    check(dt = step) {
      assert.equal(weather.group.children.length, 2);
      let drawCount = 0, slots = 0;
      for (const saved of resources) {
        const p = saved.points, u = p.material.uniforms, weight = u.blendWeight.value;
        assert.equal(p.geometry, saved.geometry); assert.equal(p.material, saved.material);
        for (const [i, name] of ['position', 'life', 'haze'].entries()) assert.equal(p.geometry.getAttribute(name).array, saved.buffers[i]);
        if (u.kind.value !== saved.kind) assert.equal(saved.weight, 0, 'a shader kind can only change on an invisible layer');
        assert.ok(weight >= 0 && weight <= 1);
        const delta = Math.abs(weight - saved.weight);
        maxWeightStep = Math.max(maxWeightStep, delta);
        assert.ok(delta <= Math.max(0, Math.min(dt, .1)) / WEATHER_TRANSITION.seconds + 1e-10, 'time-bound fade has no opacity jump');
        assert.equal(p.visible, weight > 0);
        assert.equal(p.geometry.drawRange.count, weight ? 768 : 0);
        if (p.visible) drawCount++;
        slots += p.geometry.drawRange.count;
        saved.kind = u.kind.value; saved.weight = weight;
      }
      assert.ok(drawCount <= 2 && slots <= 1536);
      assert.ok(total(weather) <= 1 + 1e-10);
      if (weather.fog) assert.ok(Number.isFinite(weather.fog.near) && weather.fog.far > weather.fog.near);
      checks++;
    },
    get result() { return { checks, maxWeightStep, residentLayers: resources.length, maxSlots: 1536 }; },
  };
}

for (let index = 1; index < BIOME_DEFINITIONS.length; index++) {
  const oldId = BIOME_DEFINITIONS[index - 1].id, nextId = BIOME_DEFINITIONS[index].id, boundary = BIOME_DEFINITIONS[index].from;
  const weather = createBiomeWeather(THREE), observe = observer(weather), samples = [];

  for (const direction of [1, -1]) {
    for (let n = 0; n <= 360; n++) {
      const progress = boundary + direction * (n / 2 - halfBand);
      weather.update(step, { progress, biome: 'unknown', camera }); observe.check();
      if (n % 90 === 0) samples.push({ direction, progress, ...weights(weather), fogFar: weather.fog?.far ?? 1600 });
    }
    for (let n = 0; n < 90; n++) { weather.update(step, { progress: boundary, camera }); observe.check(); }
    close(weights(weather)[nextId], .5, `${nextId} settles halfway at its boundary`);
    if (oldId !== 'city') close(weights(weather)[oldId], .5, `${oldId} remains a distinct half-strength layer`);
    const midpoint = weights(weather), fog = weather.fog, state = { ...fog };
    for (let n = 0; n < 60; n++) { weather.update(step, { progress: boundary, camera }); observe.check(); }
    assert.deepEqual(weights(weather), midpoint, 'stopping in the band does not finish an unrelated timer');
    assert.equal(weather.fog, fog, 'one fog object is reused'); assert.deepEqual(weather.fog, state);

    for (const p of weather.group.children) assert.ok(p.material.uniforms.blendWeight.value <= .5);
  }
  settle(weather, { progress: boundary + halfBand + 1, camera });
  close(weights(weather)[nextId], 1, 'full storm resumes beyond the blend band');
  assert.equal(weather.group.children.filter(p => p.visible).length, 1);
  assert.equal(weather.group.children.reduce((n, p) => n + p.geometry.drawRange.count, 0), 768);
  if (oldId === 'city') {
    settle(weather, { progress: boundary - halfBand - 1, camera });
    assert.equal(weather.fog, null); assert.equal(weather.group.visible, false);
  }
  report.boundaries.push({ boundary, from: oldId, to: nextId, samples });
  weather.dispose();
}



{
  const expected = {
    forest: { opacity: .78, hazeOpacity: .16, particleSize: 24, far: 220 },
    desert: { opacity: .60, hazeOpacity: .24, particleSize: 8, far: 150 },
    snow: { opacity: .88, hazeOpacity: .18, particleSize: 10, far: 190 },
    volcanic: { opacity: .72, hazeOpacity: .22, particleSize: 8, far: 170 },
  };
  for (const [id, style] of Object.entries(expected)) {
    const weather = createBiomeWeather(THREE);
    weather.update(0, { biome: { id }, camera }); assert.equal(weather.group.visible, false);
    settle(weather, { biome: { id }, camera });
    const active = weather.group.children.filter(p => p.visible);
    assert.equal(active.length, 1); assert.equal(active[0].geometry.drawRange.count, 768);
    for (const key of ['opacity', 'hazeOpacity', 'particleSize']) close(active[0].material.uniforms[key].value, style[key], `${id} retains ${key}`);
    close(active[0].material.uniforms.blendWeight.value, 1, 'settled shader opacity is unattenuated');
    assert.equal(weather.fog.far, style.far);
    assert.equal(active[0].material.depthTest, true); assert.equal(active[0].material.depthWrite, false);
    assert.equal(active[0].geometry.getAttribute('haze').array.reduce((sum, v) => sum + v, 0), 24);
    const fog = weather.fog;
    weather.update(0, { biome: 'toString', camera }); assert.equal(weather.fog, fog, 'unknown label fades out rather than hard-clearing');
    settle(weather, { biome: 'toString', camera }); assert.equal(weather.fog, null);
    settle(weather, { biome: id }); assert.equal(weather.group.visible, true, 'standalone view needs no camera');
    for (const invalid of [{ x: NaN }, { y: Infinity }, { z: -Infinity }]) {
      weather.update(0, { biome: id, ...invalid }); assert.equal(weather.fog, null); assert.equal(total(weather), 0);
    }
    weather.dispose();
  }
}



{
  const weather = createBiomeWeather(THREE), view = camera.clone();
  settle(weather, { progress: 5800, camera: view });
  const saved = weather.group.children.map(p => ({
    position: p.geometry.getAttribute('position').array.slice(),
    life: p.geometry.getAttribute('life').array.slice(),
    kind: p.material.uniforms.kind.value,
  }));
  let recycled = 0, maxSurvivorStep = 0, maxBirthFadeStep = 0;
  for (let frame = 0; frame < 600; frame++) {
    const yaw = frame * .025, pitch = -.45 + Math.sin(frame * .013) * .20;
    view.position.set(123 + Math.sin(yaw) * 20, 12, -30 + Math.cos(yaw) * 20);
    view.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    view.updateMatrixWorld();
    weather.update(step, { progress: 5800 + Math.sin(frame * .02) * 60, camera: view });
    const inverse = view.quaternion.clone().invert(), halfHeight = Math.tan(view.fov * Math.PI / 360) / view.zoom;
    for (const [layerIndex, p] of weather.group.children.entries()) {
      const positions = p.geometry.getAttribute('position').array, life = p.geometry.getAttribute('life').array;
      assert.equal(p.material.uniforms.kind.value, saved[layerIndex].kind, 'reversing within a band never retypes the cloud');
      for (let i = 0; i < p.geometry.drawRange.count; i++) {
        const offset = i * 3, v = new THREE.Vector3().fromArray(positions, offset).applyQuaternion(inverse), depth = -v.z;
        assert.ok(depth >= 2.99998 && depth <= 40.00002);
        assert.ok(Math.abs(v.x) <= depth * halfHeight * view.aspect * 1.80001);
        assert.ok(Math.abs(v.y) <= depth * halfHeight * 1.80001);
        if (life[i] === 0) { recycled++; continue; }
        const delta = Math.hypot(positions[offset] - saved[layerIndex].position[offset], positions[offset + 1] - saved[layerIndex].position[offset + 1], positions[offset + 2] - saved[layerIndex].position[offset + 2]);
        assert.ok(delta < .55, 'crossfade preserves surviving particle trajectories');
        maxSurvivorStep = Math.max(maxSurvivorStep, delta);
        const birthFadeStep = smooth(0, .3, life[i]) - smooth(0, .3, saved[layerIndex].life[i]);
        assert.ok(birthFadeStep <= .084, 'each recycled particle fades in over 300 ms');
        maxBirthFadeStep = Math.max(maxBirthFadeStep, birthFadeStep);
      }
      saved[layerIndex].position.set(positions); saved[layerIndex].life.set(life);
    }
  }
  assert.ok(recycled > 100);
  report.trajectories = { frames: 600, layers: 2, recycled, maxSurvivorStep, maxBirthFadeStep };
  weather.dispose();
}



{
  const weather = createBiomeWeather(THREE), observe = observer(weather);
  const targets = [5800, 8500, 11000, 3000, 9000, 4400, 6500];
  let nonClearHandoverMinimum = 1;
  for (let cycle = 0; cycle < 120; cycle++) {
    const progress = targets[cycle % targets.length];
    for (let i = 0; i < 12; i++) { weather.update(step, { progress, camera }); observe.check(); }
  }
  settle(weather, { progress: 5800, camera });
  for (let i = 0; i < 100; i++) {
    weather.update(step, { progress: 9500, camera });
    nonClearHandoverMinimum = Math.min(nonClearHandoverMinimum, total(weather));
  }
  assert.ok(nonClearHandoverMinimum >= .49, 'third-type handover never flashes all-clear');
  close(weights(weather).snow, 1, 'latest teleport target eventually wins');
  const frozenWeights = weights(weather), fog = { ...weather.fog };
  const buffers = weather.group.children.map(p => p.geometry.getAttribute('position').array.slice());
  for (const dt of [0, -1, NaN, Infinity]) {
    weather.update(dt, { progress: 3400, camera, x: 10000, y: 200, z: -10000 });
    assert.deepEqual(weights(weather), frozenWeights); assert.deepEqual(weather.fog, fog);
    for (const [i, p] of weather.group.children.entries()) {

      if (p.visible) assert.deepEqual(p.geometry.getAttribute('position').array, buffers[i]);
    }
  }
  for (let i = 0; i < 60; i++) weather.update(1, { progress: 3400, camera, paused: true });
  assert.deepEqual(weights(weather), frozenWeights); assert.deepEqual(weather.fog, fog);
  weather.update(0, { progress: 9500, camera }); assert.deepEqual(weights(weather), frozenWeights);
  let geometryDisposals = 0, materialDisposals = 0;
  for (const p of weather.group.children) {
    p.geometry.addEventListener('dispose', () => geometryDisposals++);
    p.material.addEventListener('dispose', () => materialDisposals++);
  }
  weather.update(0, { progress: 9500, camera, active: false });
  assert.equal(weather.fog, null); assert.equal(total(weather), 0); assert.equal(weather.group.visible, false);
  weather.update(0, { progress: 9500, camera }); assert.equal(weather.fog, null, 'clear cannot reveal a full storm at dt=0');
  weather.dispose(); weather.dispose(); weather.update(1, { progress: 9500 });
  assert.equal(geometryDisposals, 2); assert.equal(materialDisposals, 2); assert.equal(weather.group.children.length, 0);
  report.stress = { ...observe.result, teleports: 120, nonClearHandoverMinimum, geometryDisposals, materialDisposals };
}




function shaderAlpha(source) {
  let body = source.slice(source.indexOf('void main() {') + 13, source.lastIndexOf('}'));
  body = body.replace('vec2 p = gl_PointCoord - 0.5;', '')
    .replace('float alpha;', 'let alpha;')
    .replace(/length\(p \* vec2\(([\d.]+), ([\d.]+)\)\)/g, 'Math.hypot(px * $1, py * $2)')
    .replaceAll('length(p)', 'Math.hypot(px, py)').replaceAll('p.x', 'px').replaceAll('p.y', 'py')
    .replace('discard;', 'return 0;').replace('gl_FragColor = vec4(weatherColor, alpha);', 'return alpha;');
  const evaluate = new Function('px', 'py', 'visibility', 'isHaze', 'kind', 'opacity', 'hazeOpacity', 'blendWeight', 'smoothstep', 'mix', 'pow', 'abs', body);
  return (px, py, visibility, haze, u, weight = u.blendWeight.value) => evaluate(px, py, visibility, haze, u.kind.value, u.opacity.value, u.hazeOpacity.value, weight, smooth, (a, b, t) => a * (1 - t) + b * t, Math.pow, Math.abs);
}
function shaderVisibility(source) {
  const expression = source.match(/visibility = ([\s\S]*?);/)[1].replaceAll('edge.x', 'nx').replaceAll('edge.y', 'ny');
  return new Function('life', 'distanceToCamera', 'nx', 'ny', 'smoothstep', `return ${expression};`);
}
function measure(weather, view, plane) {
  weather.group.updateMatrixWorld(true); view.updateMatrixWorld(true);
  const result = [];
  for (const p of weather.group.children.filter(p => p.visible)) {
    const u = p.material.uniforms, alpha = shaderAlpha(p.material.fragmentShader), visibility = shaderVisibility(p.material.vertexShader);
    const position = p.geometry.getAttribute('position'), life = p.geometry.getAttribute('life'), haze = p.geometry.getAttribute('haze');
    let visibleParticles = 0, hazeSprites = 0, alphaSum = 0, groundOccluded = 0;
    for (let i = 0; i < p.geometry.drawRange.count; i++) {
      const world = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(p.matrixWorld);
      const ndc = world.clone().project(view), depth = -world.clone().applyMatrix4(view.matrixWorldInverse).z;
      if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1 || ndc.z < -1 || ndc.z > 1) continue;
      const fade = visibility(life.getX(i), depth, Math.abs(ndc.x), Math.abs(ndc.y), smooth), isHaze = haze.getX(i);
      const center = alpha(0, 0, fade, isHaze, u);
      if (center < .04) continue;
      if (plane.distanceToPoint(world) <= 0) { groundOccluded++; continue; }
      if (isHaze) hazeSprites++; else visibleParticles++;
      alphaSum += center;
      close(alpha(0, 0, 1, isHaze, u, .5), alpha(0, 0, 1, isHaze, u, 1) * .5, 'actual shader scales both drops and haze');
      assert.equal(alpha(0, 0, 1, isHaze, u, 0), 0);
      assert.equal(alpha(0, 0, 0, isHaze, u, 1), 0);
    }
    result.push({ kind: ids[u.kind.value], weight: u.blendWeight.value, visibleParticles, hazeSprites, alphaSum, groundOccluded });
  }
  return result;
}



for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  const app = createAppDom(viewport), d = app.debug;
  try {
    for (let index = 1; index < BIOME_DEFINITIONS.length; index++) {
      const boundary = BIOME_DEFINITIONS[index].from, point = routePointAtProgress(boundary);
      d.model.pause(); Object.assign(d.model.state, { x: point.x, z: point.z, heading: point.heading, routeContext: null });
      d.applyTruckPose(); d.followTruck(1, true); d.camera.updateMatrixWorld();
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(point.normal.x, point.normal.y, point.normal.z), new THREE.Vector3(point.x, point.height + .008, point.z));
      const weather = createBiomeWeather(THREE); settle(weather, { progress: boundary, camera: d.camera });
      const projected = measure(weather, d.camera, plane);
      assert.equal(projected.length, index === 1 ? 1 : 2);
      for (const layer of projected) {
        close(layer.weight, .5, 'boundary shader carries exact half strength');
        assert.ok(layer.visibleParticles >= 35, `${layer.kind}/${viewport.width}: midpoint weather is projected above ground`);
        assert.ok(layer.alphaSum > 4, 'midpoint cloud has nonzero rendered alpha contribution');
      }
      report.projection.push({ viewport, boundary, layers: projected }); weather.dispose();
    }
  } finally { app.dispose(); }
}



{
  const app = createAppDom(), d = app.debug;
  const putAt = progress => {
    const p = routePointAtProgress(progress);
    d.model.pause(); Object.assign(d.model.state, { x: p.x, z: p.z, heading: p.heading, routeContext: null });
    d.applyTruckPose(); d.followTruck(1, true);
  };
  const run = frames => { for (let i = 0; i < frames; i++) app.frame(); };
  try {
    putAt(2970); run(60);
    assert.ok(weights(d.biomeWeather).forest > .2 && weights(d.biomeWeather).forest < .5, 'weather begins before discrete forest entry');
    assert.equal(d.scene.fog.color.getHex(), d.scene.background.getHex());
    assert.equal(d.scene.fog.far, d.biomeWeather.fog.far);
    for (const [name, open, closeModal] of [
      ['biome', () => d.setBiomeMenu(true), () => d.setBiomeMenu(false)],
      ['upgrades', () => d.setUpgradeMenu(true), () => d.setUpgradeMenu(false)],
      ['career', () => app.ids.get('career-goal-button').dispatch('click'), () => app.ids.get('career-close').dispatch('click')],
    ]) {
      const before = weights(d.biomeWeather), fog = { ...d.biomeWeather.fog };
      open(); run(30); assert.deepEqual(weights(d.biomeWeather), before, `${name} freezes weights`); assert.deepEqual(d.biomeWeather.fog, fog);
      closeModal(); app.frame(); assert.deepEqual(weights(d.biomeWeather), before, `${name} zero-time resume does not flash`);
      report.app.push(`${name} modal freezes/resumes`);
    }
    const beforeBlur = weights(d.biomeWeather), fogBeforeBlur = { ...d.biomeWeather.fog };
    app.win.dispatch('blur'); run(10); assert.deepEqual(weights(d.biomeWeather), beforeBlur);
    app.win.dispatch('focus'); app.frame(); assert.deepEqual(weights(d.biomeWeather), beforeBlur); assert.deepEqual(d.biomeWeather.fog, fogBeforeBlur);
    app.doc.hidden = true; app.doc.dispatch('visibilitychange'); run(10);
    app.doc.hidden = false; app.doc.dispatch('visibilitychange'); app.frame(); assert.deepEqual(weights(d.biomeWeather), beforeBlur);
    report.app.push('blur/hidden resume keeps previous weather');
    d.setBiomeMenu(true); assert.equal(d.travelToBiome('snow'), true);
    app.frame(); assert.deepEqual(weights(d.biomeWeather), beforeBlur, 'preview teleport preserves old weather at dt=0');
    run(90); close(weights(d.biomeWeather).snow, 1, 'preview arrives smoothly');
    report.app.push('preview teleport crossfades');
    const bridge = BRIDGES.find(b => b.biome === 'snow'), p = routePointAtProgress((bridge.from + bridge.to) / 2);
    d.model.pause(); Object.assign(d.model.state, { x: p.x + p.right.x * (bridge.offset + 1.3), z: p.z + p.right.z * (bridge.offset + 1.3), heading: p.heading, routeContext: null }); d.applyTruckPose();
    const money = d.gameplay.state.money, brains = d.gameplay.state.brains;
    for (let i = 0; i < 25; i++) { app.frame(); assert.equal(d.driving, true); assert.ok(d.biomeWeather.fog); }
    run(100); assert.equal(d.driving, false); assert.equal(d.biomeWeather.fog, null); assert.equal(d.scene.fog.far, 1600);
    assert.equal(d.gameplay.state.money, money); assert.equal(d.gameplay.state.brains, brains);
    report.app.push('fall retains weather until immediate hangar clear');
  } finally { app.dispose(); }
}
assert.deepEqual([...camera.position.toArray(), ...camera.quaternion.toArray(), ...camera.projectionMatrix.elements], cameraSnapshot, 'module never mutates the camera');
if (process.argv.includes('--write-report')) {
  fs.mkdirSync(new URL('../qa/weather-transitions/', import.meta.url), { recursive: true });
  fs.writeFileSync(new URL('../qa/weather-transitions/report.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ status: 'PASS', ...report }, null, 2));
