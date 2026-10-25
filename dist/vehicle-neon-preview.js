import { cloneVehicleForLiveryPreview } from './vehicle-livery-preview.js';
import { VEHICLE_NEON_CATALOG, getVehicleNeon } from './vehicle-neon-catalog.js';
import { createVehicleNeonGlowResources, vehicleNeonFootprint } from './vehicle-neon-glow.js';

/** Isolated neon carousel. Cars share source geometry, and the same soft
 * ground halos as gameplay need no bloom or neon lights.
 */
export function createVehicleNeonPreview(THREE, host, options = {}) {
  const doc = host.ownerDocument, win = doc.defaultView || globalThis;
  const requestFrame = options.requestFrame || (fn => win.requestAnimationFrame(fn));
  const cancelFrame = options.cancelFrame || (id => win.cancelAnimationFrame(id));
  const reducedMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  let renderer = null, scene = null, camera = null, pivot = null, source = null;
  let models = [], frame = null, observer = null, disposed = false;
  let width = 0, height = 0, lastFrame = 0, selectedIndex = 0, spin = -.5, lastPosition = NaN;
  const right = new THREE.Vector3(), back = new THREE.Vector3();
  let glowResources = null;
  const position = () => Number.isFinite(host.carouselPosition) ? host.carouselPosition : selectedIndex;
  function resize() {
    if (!renderer) return;
    const w = Math.max(1, host.clientWidth || 320), h = Math.max(1, host.clientHeight || 250);
    if (w === width && h === height) return;
    width = w; height = h; renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Include the wider ground halo through fractional swipes and a full turn.
    const distance = Math.max(2.7, 5.4 / camera.aspect) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.set(distance * .65, distance * .36, distance * .67);
    camera.lookAt(0, -.08, 0); camera.updateProjectionMatrix();
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    back.set(0, 0, 1).applyQuaternion(camera.quaternion);
  }
  function layout(value = position()) {
    const count = models.length;
    for (const entry of models) {
      let offset = ((entry.index - value) % count + count) % count;
      if (offset > count / 2) offset -= count;
      // A fixed visible arc keeps three cars readable even though there are 7 colors.
      const angle = offset * Math.PI * .4;
      const fade = 1 - THREE.MathUtils.smoothstep(Math.abs(offset), 1.25, 1.9);
      const depth = Math.cos(angle);
      entry.model.position.copy(right).multiplyScalar(Math.sin(angle) * 3.9)
        .addScaledVector(back, (depth - 1) * 3.6);
      entry.model.scale.setScalar(Math.max(.001, (.25 + .75 * Math.max(0, depth)) * fade));
      entry.model.visible = fade > .0001;
      entry.turntable.rotation.y = spin;
    }
    lastPosition = value;
  }
  function render() {
    if (!renderer || doc.hidden || (options.shouldDraw && !options.shouldDraw())) return;
    resize(); layout(); renderer.render(scene, camera);
  }
  function draw(time) {
    frame = null;
    if (!renderer || disposed || doc.hidden) return;
    if (!options.shouldDraw || options.shouldDraw()) {
      const p = position();
      if (!lastFrame || time - lastFrame >= 1000 / 30 || p !== lastPosition) {
        const dt = lastFrame ? Math.min((time - lastFrame) / 1000, .1) : 0;
        lastFrame = time;
        if (!reducedMotion?.matches) spin += dt * .32;
        render();
      }
    } else lastFrame = 0;
    frame = requestFrame(draw);
  }
  function start() { if (renderer && frame === null && !doc.hidden) frame = requestFrame(draw); }
  function visibility() { if (frame !== null) cancelFrame(frame); frame = null; lastFrame = 0; start(); }
  function ensureRenderer() {
    if (renderer) return;
    const next = options.createRenderer ? options.createRenderer() : new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    next.setPixelRatio(Math.min(win.devicePixelRatio || 1, 1.5));
    next.outputColorSpace = THREE.SRGBColorSpace;
    next.toneMapping = THREE.ACESFilmicToneMapping; next.toneMappingExposure = 1.15;
    next.setClearColor(0, 0); next.domElement.setAttribute('aria-hidden', 'true'); host.append(next.domElement);
    renderer = next; scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(36, 1, .1, 100);
    pivot = new THREE.Group(); scene.add(pivot);
    // Normal model lighting only: neon itself is unlit and never adds dynamic lights.
    scene.add(new THREE.HemisphereLight(0xe7f5ff, 0x405070, 2.4));
    const key = new THREE.DirectionalLight(0xfff0d7, 3); key.position.set(4, 6, 5); scene.add(key);
    const Resize = win.ResizeObserver || globalThis.ResizeObserver;
    if (Resize) { observer = new Resize(resize); observer.observe(host); }
    doc.addEventListener('visibilitychange', visibility); resize(); start();
  }
  function releaseModels() {
    for (const entry of models) pivot?.remove(entry.model);
    models = []; source = null; lastPosition = NaN;
    glowResources?.dispose(); glowResources = null;
  }
  function loadModels(adapter) {
    releaseModels(); source = adapter; spin = -.5;
    const reference = cloneVehicleForLiveryPreview(adapter);
    const box = new THREE.Box3().setFromObject(reference.group, true);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const factor = 4.4 / Math.max(size.length(), .001);
    const footprint = vehicleNeonFootprint(THREE, reference);
    glowResources = createVehicleNeonGlowResources(THREE);
    models = VEHICLE_NEON_CATALOG.map((color, index) => {
      const clone = index ? cloneVehicleForLiveryPreview(adapter) : reference;
      clone.group.position.sub(center);
      const normalized = new THREE.Group(); normalized.scale.setScalar(factor); normalized.add(clone.group);
      const turntable = new THREE.Group(), model = new THREE.Group(); turntable.add(normalized); model.add(turntable); pivot.add(model);
      const material = glowResources.createMaterial(color.color);
      const halo = glowResources.createGlow(footprint, material, factor, center);
      halo.userData.neonColorId = color.id; turntable.add(halo);
      model.userData.vehicleNeonPreview = { colorId: color.id, index };
      return { model, turntable, index };
    });
    layout();
  }
  function close() {
    if (frame !== null) cancelFrame(frame); frame = null; lastFrame = 0;
    observer?.disconnect(); observer = null; doc.removeEventListener('visibilitychange', visibility);
    releaseModels();
    if (renderer) { renderer.domElement.remove(); renderer.dispose(); renderer.forceContextLoss?.(); }
    renderer = scene = camera = pivot = null; width = height = 0;
  }
  return {
    show(adapter, colorId = 'cyan') {
      if (disposed) return false;
      if (!getVehicleNeon(colorId)) throw new RangeError(`Unknown neon color: ${colorId}`);
      if (!adapter?.group?.isObject3D || !adapter?.body?.isObject3D) throw new TypeError('Preview requires a loaded vehicle adapter.');
      selectedIndex = VEHICLE_NEON_CATALOG.findIndex(item => item.id === colorId);
      try { ensureRenderer(); if (source !== adapter) loadModels(adapter); render(); return true; }
      catch (error) { close(); throw error; }
    },
    getSelection: () => VEHICLE_NEON_CATALOG[selectedIndex].id,
    close,
    dispose() { if (!disposed) { close(); disposed = true; } },
  };
}
