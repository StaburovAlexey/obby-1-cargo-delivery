import { createVehicleLiveryController } from './vehicle-livery-materials.js';
import { VEHICLE_LIVERY_CATALOG } from './vehicle-livery-catalog.js';

/** Clone transforms only. Geometry, textures and original materials remain source-owned. */
export function cloneVehicleForLiveryPreview(adapter) {
  if (!adapter?.group?.isObject3D || !adapter?.body?.isObject3D) throw new TypeError('Preview requires a loaded vehicle adapter.');
  const group = adapter.group.clone(true), mapping = new Map();
  const pair = (source, clone) => {
    mapping.set(source, clone);
    source.children.forEach((child, index) => pair(child, clone.children[index]));
  };
  pair(adapter.group, group);
  // World underglow is previewed separately; never duplicate its shared materials.
  for(const [original,clone]of mapping)if(original.name==='vehicle-underglow')clone.removeFromParent();
  const body = mapping.get(adapter.body);
  if (!body) throw new TypeError('Vehicle body must belong to its group.');
  group.position.set(0, 0, 0);
  group.quaternion.identity();
  group.visible = true;
  return { group, body, metadata: adapter.metadata };
}

/** One lazily-created canvas, five isolated finishes, and a continuous circular carousel. */
export function createVehicleLiveryPreview(THREE, host, options = {}) {
  const doc = host.ownerDocument, win = doc.defaultView || globalThis;
  const requestFrame = options.requestFrame || (fn => win.requestAnimationFrame(fn));
  const cancelFrame = options.cancelFrame || (id => win.cancelAnimationFrame(id));
  let renderer = null, scene = null, camera = null, pivot = null;
  let source = null, vehicle = null, models = [], frame = null, observer = null;
  let revision = 0, disposed = false, lastFrame = 0, width = 0, height = 0;
  let selectedIndex = 0, drawnPosition = NaN, spinAngle = -.5;
  const right = new THREE.Vector3(), back = new THREE.Vector3();
  const reducedMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const position = () => Number.isFinite(host.carouselPosition) ? host.carouselPosition : selectedIndex;
  function resize() {
    if (!renderer) return;
    const w = Math.max(1, host.clientWidth || 320), h = Math.max(1, host.clientHeight || 210);
    if (w === width && h === height) return;
    width = w; height = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Frame the focused car about 27% larger; a tighter orbit and smaller rear
    // neighbors keep all three models inside narrow SHOP rows through a full turn.
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const distance = Math.max(2.2, 4.25 / camera.aspect) / Math.tan(halfFov);
    camera.position.set(distance * .65, distance * .36, distance * .67);
    camera.lookAt(0, .15, 0);
    camera.updateProjectionMatrix();
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    back.set(0, 0, 1).applyQuaternion(camera.quaternion);
  }
  function layout(carouselPosition = position()) {
    const count = models.length;
    if (!count) return;
    const step = Math.PI * 2 / count;
    // Wider rows can spread the rear cars a little more instead of shrinking them.
    const radius = 3.9 + Math.min(.3, Math.max(0, camera.aspect - 1.5) * .5);
    for (const entry of models) {
      // Wrapping the phase, not the index, keeps the last/first transition continuous.
      const phase = ((entry.index - carouselPosition) % count + count) % count;
      const angle = (phase > count / 2 ? phase - count : phase) * step;
      const depth = Math.cos(angle);
      // Far-back cars disappear at the back of the orbit, never at the side. Scale
      // this transition instead of changing any of the source-owned materials.
      const rear = 1 - THREE.MathUtils.smoothstep(Math.abs(angle), step * 1.25, step * 1.9);
      entry.model.position.copy(right).multiplyScalar(Math.sin(angle) * radius)
        .addScaledVector(back, (depth - 1) * 3.6);
      // Keep hidden matrices invertible while an asynchronous controller prepares UVs.
      entry.model.scale.setScalar(Math.max(.001, (.25 + .75 * Math.max(0, depth)) * rear));
      entry.model.visible = entry.ready && rear > .0001;
      entry.turntable.rotation.y = spinAngle;
    }
    drawnPosition = carouselPosition;
  }
  function render() {
    if (!renderer || doc.hidden || (options.shouldDraw && !options.shouldDraw())) return;
    resize(); layout(); renderer.render(scene, camera);
  }
  function draw(time) {
    frame = null;
    if (!renderer || disposed || doc.hidden) return;
    if (options.shouldDraw && !options.shouldDraw()) { frame = requestFrame(draw); lastFrame = 0; return; }
    const nextPosition = position();
    // Idle rotation is 30 fps; direct manipulation follows every animation frame.
    if (!lastFrame || time - lastFrame >= 1000 / 30 || nextPosition !== drawnPosition) {
      const dt = lastFrame ? Math.min((time - lastFrame) / 1000, .1) : 0;
      lastFrame = time;
      resize();
      if (!reducedMotion?.matches) spinAngle += dt * .32;
      layout(nextPosition);
      renderer.render(scene, camera);
    }
    frame = requestFrame(draw);
  }
  function start() { if (renderer && frame === null && !doc.hidden) frame = requestFrame(draw); }
  function visibility() {
    if (frame !== null) cancelFrame(frame);
    frame = null; lastFrame = 0;
    start();
  }
  function ensureRenderer() {
    if (renderer) return;
    const next = options.createRenderer ? options.createRenderer() : new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    next.setPixelRatio(Math.min(win.devicePixelRatio || 1, 1.5));
    next.outputColorSpace = THREE.SRGBColorSpace;
    next.toneMapping = THREE.ACESFilmicToneMapping;
    next.toneMappingExposure = 1.3;
    next.setClearColor(0x000000, 0);
    next.domElement.setAttribute('aria-hidden', 'true');
    host.append(next.domElement);
    renderer = next;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(36, 1, .1, 100);
    pivot = new THREE.Group(); scene.add(pivot);
    scene.add(new THREE.HemisphereLight(0xe7f5ff, 0x607080, 2.8));
    const key = new THREE.DirectionalLight(0xfff0d7, 3.5); key.position.set(4, 6, 5); scene.add(key);
    const rim = new THREE.DirectionalLight(0x91dfff, 2.5); rim.position.set(-4, 3, -5); scene.add(rim);
    const Resize = win.ResizeObserver || globalThis.ResizeObserver;
    if (Resize) { observer = new Resize(resize); observer.observe(host); }
    doc.addEventListener('visibilitychange', visibility);
    resize(); start();
  }
  function releaseModels() {
    for (const entry of models) {
      entry.controller.dispose();
      pivot?.remove(entry.model);
    }
    // Only controllers own paint clones; source geometry/materials/textures stay untouched.
    models = []; source = vehicle = null;
    drawnPosition = NaN;
  }
  function loadFinish(entry) {
    entry.failed = false;
    entry.pending = entry.controller.preview(entry.id).then(result => {
      entry.ready = result.applied !== false && !entry.controller.disposed;
      entry.failed = !entry.ready && !entry.controller.disposed;
      if (entry.ready && models.includes(entry)) render();
      return entry.ready;
    }, () => { entry.failed = !entry.controller.disposed; return false; });
    return entry.pending;
  }
  function loadModels(adapter, vehicleId, variants) {
    releaseModels();
    spinAngle = -.5;
    source = adapter; vehicle = vehicleId;
    // Normalize once, before any carousel transform can influence body-local UVs.
    const reference = cloneVehicleForLiveryPreview(adapter);
    const box = new THREE.Box3().setFromObject(reference.group, true);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const factor = 4.4 / Math.max(size.length(), .001);
    models = variants.map((variant, index) => {
      const clone = index === 0 ? reference : cloneVehicleForLiveryPreview(adapter);
      const model = new THREE.Group(), turntable = new THREE.Group(), normalized = new THREE.Group();
      clone.group.position.sub(center);
      normalized.scale.setScalar(factor); normalized.add(clone.group);
      turntable.add(normalized); model.add(turntable); pivot.add(model);
      model.userData.vehicleLiveryPreview = { vehicleId, liveryId: variant.id, index };
      const controller = createVehicleLiveryController(THREE, clone, vehicleId, options);
      const entry = { index, id: variant.id, model, turntable, controller, ready: false, failed: false, pending: null };
      model.visible = false;
      // Each finish gets its own controller. A pending neighboring texture can never
      // paint the focused car or restore somebody else's materials after a swipe.
      loadFinish(entry);
      return entry;
    });
    layout();
  }
  function close() {
    ++revision;
    if (frame !== null) cancelFrame(frame);
    frame = null; lastFrame = 0;
    observer?.disconnect(); observer = null;
    doc.removeEventListener('visibilitychange', visibility);
    releaseModels();
    if (renderer) {
      renderer.domElement.remove();
      renderer.dispose(); renderer.forceContextLoss?.();
    }
    renderer = scene = camera = pivot = null;
    width = height = 0;
  }
  return {
    async show(adapter, vehicleId, liveryId = 'base') {
      if (disposed) return false;
      const variants = VEHICLE_LIVERY_CATALOG.find(item => item.id === vehicleId)?.variants;
      const index = variants?.findIndex(item => item.id === liveryId) ?? -1;
      if (index < 0) throw new RangeError(`Unknown livery: ${vehicleId}/${liveryId}`);
      const token = ++revision;
      ensureRenderer();
      selectedIndex = index;
      if (source !== adapter || vehicle !== vehicleId) loadModels(adapter, vehicleId, variants);
      const selected = models[index];
      if (selected.failed) loadFinish(selected);
      render();
      const applied = await selected.pending;
      if (disposed || token !== revision || !renderer) return false;
      render();
      return applied;
    },
    close,
    dispose() { if (!disposed) { close(); disposed = true; } },
  };
}


/** Multiple visible car cards, one shared WebGL context; each card receives a 2D frame. */
export function createVehicleLiveryGallery(THREE, getHost, options = {}) {
  const slots = new Map();
  let shared = null, disposed = false, scheduler = null, win = null;
  let bufferWidth = 0, bufferHeight = 0, bufferRatio = 0;
  const visible = host => {
    if (!host?.isConnected || host.ownerDocument.hidden) return false;
    const rect = host.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    let top = 0, bottom = win.innerHeight || 10000;
    for (let parent = host.parentElement; parent; parent = parent.parentElement) {
      if (parent.classList?.contains('vehicle-livery-scroll')) {
        const bounds = parent.getBoundingClientRect(); top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); break;
      }
    }
    return rect.bottom > top && rect.top < bottom;
  };
  function rendererFor(host) {
    if (!shared) shared = options.createRenderer ? options.createRenderer() : new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    const canvas = host.ownerDocument.createElement('canvas'), context = canvas.getContext('2d');
    if (!context) throw new Error('Car preview needs a 2D canvas.');
    let width = 1, height = 1, ratio = 1;
    // The offscreen WebGL canvas is never attached to or moved between cards.
    return {
      domElement: canvas,
      setPixelRatio(value) { ratio = value; },
      setSize(w, h) { width = w; height = h; canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio); },
      setClearColor(...args) { shared.setClearColor(...args); },
      set outputColorSpace(value) { shared.outputColorSpace = value; },
      set toneMapping(value) { shared.toneMapping = value; },
      set toneMappingExposure(value) { shared.toneMappingExposure = value; },
      render(scene, camera) {
        if (width !== bufferWidth || height !== bufferHeight || ratio !== bufferRatio) {
          if (shared.setDrawingBufferSize) shared.setDrawingBufferSize(width, height, ratio);
          else {
            if (ratio !== bufferRatio) shared.setPixelRatio(ratio);
            shared.setSize(width, height, false);
          }
          bufferWidth = width; bufferHeight = height; bufferRatio = ratio;
        }
        shared.render(scene, camera);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(shared.domElement, 0, 0, canvas.width, canvas.height);
      },
      dispose() {},
    };
  }
  function pump() {
    scheduler = null;
    if (disposed || !slots.size) return;
    for (const slot of slots.values()) {
      if (!visible(slot.host)) {
        // Retain only the source + latest selection offscreen, not five paint clones
        // and their texture leases. Pending user requests resume when visible again.
        slot.running = null;
        slot.preview?.dispose(); slot.preview = null;
        slot.failed = false;
        continue;
      }
      const pending = slot.pending;
      if (slot.preview && (!pending || slot.running?.pending === pending)) continue;
      if (!slot.preview && slot.failed && !pending) continue;
      try {
        if (!slot.preview) slot.preview = createVehicleLiveryPreview(THREE, slot.host, {
          ...options, createRenderer: () => rendererFor(slot.host), shouldDraw: () => visible(slot.host),
        });
        slot.failed = false;
        const running = { pending, preview: slot.preview }; slot.running = running;
        const settle = value => {
          if (slot.running !== running) return;
          slot.running = null;
          if (pending && slot.pending === pending) { slot.pending = null; pending.resolve(value); }
        };
        slot.preview.show(...(pending?.args || slot.args)).then(settle, () => settle(false));
      } catch {
        slot.running = null; slot.failed = true;
        slot.preview?.dispose(); slot.preview = null;
        if (pending && slot.pending === pending) { slot.pending = null; pending.resolve(false); }
      }
    }
    scheduler = win.requestAnimationFrame(pump);
  }
  function close() {
    if (scheduler !== null) win.cancelAnimationFrame(scheduler);
    scheduler = null;
    for (const slot of slots.values()) {
      slot.running = null;
      slot.pending?.resolve(false); slot.pending = null;
      slot.preview?.dispose();
    }
    slots.clear();
    shared?.dispose(); shared?.forceContextLoss?.(); shared = null;
    bufferWidth = bufferHeight = bufferRatio = 0;
  }
  return {
    show(adapter, vehicleId, liveryId = 'base') {
      if (disposed) return Promise.resolve(false);
      const host = getHost(vehicleId);
      if (!host) return Promise.resolve(false);
      win = host.ownerDocument.defaultView || globalThis;
      let slot = slots.get(vehicleId);
      if (!slot) { slot = { host, preview: null, pending: null, running: null, args: null, failed: false }; slots.set(vehicleId, slot); }
      slot.pending?.resolve(false);
      slot.args = [adapter, vehicleId, liveryId];
      const result = new Promise(resolve => { slot.pending = { args: slot.args, resolve }; });
      if (scheduler === null) scheduler = win.requestAnimationFrame(pump);
      return result;
    },
    close,
    dispose() { close(); disposed = true; },
  };
}
