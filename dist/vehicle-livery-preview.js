import { createVehicleLiveryController } from './vehicle-livery-materials.js';

/** Clone transforms only. Geometry, textures and original materials remain source-owned. */
export function cloneVehicleForLiveryPreview(adapter) {
  if (!adapter?.group?.isObject3D || !adapter?.body?.isObject3D) throw new TypeError('Preview requires a loaded vehicle adapter.');
  const group = adapter.group.clone(true), mapping = new Map();
  const pair = (source, clone) => {
    mapping.set(source, clone);
    source.children.forEach((child, index) => pair(child, clone.children[index]));
  };
  pair(adapter.group, group);
  const body = mapping.get(adapter.body);
  if (!body) throw new TypeError('Vehicle body must belong to its group.');
  group.position.set(0, 0, 0);
  group.quaternion.identity();
  group.visible = true;
  return { group, body, metadata: adapter.metadata };
}

/** One lazily-created canvas for the selected car. Call close() on dialog close. */
export function createVehicleLiveryPreview(THREE, host, options = {}) {
  const doc = host.ownerDocument, win = doc.defaultView || globalThis;
  const requestFrame = options.requestFrame || (fn => win.requestAnimationFrame(fn));
  const cancelFrame = options.cancelFrame || (id => win.cancelAnimationFrame(id));
  let renderer = null, scene = null, camera = null, pivot = null, controller = null;
  let source = null, vehicle = null, model = null, frame = null, observer = null;
  let revision = 0, disposed = false, lastFrame = 0, width = 0, height = 0;
  const reducedMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  function resize() {
    if (!renderer) return;
    const w = Math.max(1, host.clientWidth || 320), h = Math.max(1, host.clientHeight || 210);
    if (w === width && h === height) return;
    width = w; height = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Fit the entire spinning bounding sphere, including portrait screens.
    const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
    const distance = 2.65 / Math.sin(Math.min(halfFov, Math.atan(Math.tan(halfFov) * camera.aspect)));
    camera.position.set(distance * .65, distance * .36, distance * .67);
    camera.lookAt(0, .15, 0);
    camera.updateProjectionMatrix();
  }
  function draw(time) {
    frame = null;
    if (!renderer || disposed || doc.hidden) return;
    if (options.shouldDraw && !options.shouldDraw()) { frame = requestFrame(draw); lastFrame = 0; return; }
    if (!lastFrame || time - lastFrame >= 1000 / 30) {
      const dt = lastFrame ? Math.min((time - lastFrame) / 1000, .1) : 0;
      lastFrame = time;
      resize();
      if (pivot && !reducedMotion?.matches) pivot.rotation.y += dt * .32;
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
    next.setClearColor(0x0c223c, 0);
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
  function releaseModel() {
    controller?.dispose(); controller = null;
    if (model) pivot?.remove(model);
    // Shared source geometry/materials/textures must never be disposed here.
    source = vehicle = model = null;
  }
  function close() {
    ++revision;
    if (frame !== null) cancelFrame(frame);
    frame = null; lastFrame = 0;
    observer?.disconnect(); observer = null;
    doc.removeEventListener('visibilitychange', visibility);
    releaseModel();
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
      const token = ++revision;
      ensureRenderer();
      if (source !== adapter || vehicle !== vehicleId) {
        releaseModel();
        const clone = cloneVehicleForLiveryPreview(adapter);
        model = new THREE.Group(); model.add(clone.group);
        const box = new THREE.Box3().setFromObject(clone.group, true);
        const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
        const factor = 4.4 / Math.max(size.length(), .001);
        clone.group.position.sub(center);
        model.scale.setScalar(factor);
        pivot.rotation.y = -.5;
        pivot.add(model);
        controller = createVehicleLiveryController(THREE, clone, vehicleId, options);
        source = adapter; vehicle = vehicleId;
      }
      const result = await controller.preview(liveryId);
      if (disposed || token !== revision || !renderer) return false;
      renderer.render(scene, camera);
      return result.applied !== false;
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
      if (!slot.pending || !visible(slot.host)) continue;
      const pending = slot.pending; slot.pending = null;
      try {
        if (!slot.preview) slot.preview = createVehicleLiveryPreview(THREE, slot.host, {
          ...options, createRenderer: () => rendererFor(slot.host), shouldDraw: () => visible(slot.host),
        });
        slot.preview.show(...pending.args).then(pending.resolve, () => pending.resolve(false));
      } catch { pending.resolve(false); }
    }
    scheduler = win.requestAnimationFrame(pump);
  }
  function close() {
    if (scheduler !== null) win.cancelAnimationFrame(scheduler);
    scheduler = null;
    for (const slot of slots.values()) { slot.pending?.resolve(false); slot.preview?.dispose(); }
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
      if (!slot) { slot = { host, preview: null, pending: null }; slots.set(vehicleId, slot); }
      slot.pending?.resolve(false);
      const result = new Promise(resolve => { slot.pending = { args: [adapter, vehicleId, liveryId], resolve }; });
      if (scheduler === null) scheduler = win.requestAnimationFrame(pump);
      return result;
    },
    close,
    dispose() { close(); disposed = true; },
  };
}
