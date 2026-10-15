const MOVEMENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
const RUN_KEYS = new Set(['ShiftLeft', 'ShiftRight']);
const DEAD_ZONE = 0.12;




export function cameraRelativeAxes(x, forward, cameraForward = { x: 0, z: -1 }) {
  const length = Math.hypot(x, forward);
  const divisor = Math.max(1, length);
  const horizontal = x / divisor, vertical = forward / divisor;
  let fx = Number.isFinite(cameraForward?.x) ? cameraForward.x : 0;
  let fz = Number.isFinite(cameraForward?.z) ? cameraForward.z : -1;
  const cameraLength = Math.hypot(fx, fz);
  if (cameraLength < 1e-5) { fx = 0; fz = -1; }
  else { fx /= cameraLength; fz /= cameraLength; }
  return { x: -fz * horizontal + fx * vertical, z: fx * horizontal + fz * vertical, magnitude: Math.min(1, length) };
}

export function createWalkInput({
  root,
  joystick = root?.querySelector('#walk-stick'),
  thumb = root?.querySelector('#walk-thumb'),
  getCameraForward = () => ({ x: 0, z: -1 }),
  onInput = () => {},
  onSafetyReset = () => {},
} = {}) {
  if (!root || !joystick || !thumb) throw new Error('Walking controls need root, joystick and thumb elements.');
  const doc = root.ownerDocument, win = doc.defaultView;
  const keys = new Set(), removers = [];
  let enabled = true, destroyed = false, pointer;
  let stickX = 0, stickY = 0, mobileRunning = false;
  const previousTouchAction = joystick.style.touchAction;
  joystick.style.touchAction = 'none';
  const listen = (element, type, fn, options) => {
    element.addEventListener(type, fn, options);
    removers.push(() => element.removeEventListener(type, fn, options));
  };
  const isEditable = (target) => !!target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
  function sample() {
    if (!enabled || destroyed) return { x: 0, z: 0, magnitude: 0, running: false, active: false };
    const x = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
    const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
    const axes = cameraRelativeAxes(x + stickX, forward + stickY, getCameraForward());
    return { ...axes, running: keys.has('ShiftLeft') || keys.has('ShiftRight') || mobileRunning, active: axes.magnitude > 0 };
  }
  const emit = () => onInput(sample());
  const positionThumb = (x, y) => {
    thumb.style.transform = `translate(${x}px, ${y}px)`;
    root.dataset.walking = String(Math.hypot(stickX, stickY) > 0);
  };
  function reset(notify = true) {
    const previous = pointer;
    pointer = undefined;
    stickX = stickY = 0; mobileRunning = false;
    keys.clear();
    if (previous !== undefined && joystick.hasPointerCapture?.(previous)) {
      try { joystick.releasePointerCapture(previous); } catch {                                                   }
    }
    positionThumb(0, 0);
    if (notify) emit();
  }
  function safetyReset() { reset(); onSafetyReset(); }
  function move(event) {
    const bounds = joystick.getBoundingClientRect();
    const radius = Math.max(1, Math.min(bounds.width, bounds.height) * 0.34);
    const dx = event.clientX - (bounds.left + bounds.width / 2);
    const dy = event.clientY - (bounds.top + bounds.height / 2);
    const distance = Math.hypot(dx, dy);
    const limited = Math.min(distance, radius);
    const strength = Math.max(0, (limited / radius - DEAD_ZONE) / (1 - DEAD_ZONE));
    stickX = distance > 0 ? dx / distance * strength : 0;
    stickY = distance > 0 ? -dy / distance * strength : 0;
    if(strength>=.9)mobileRunning=true;else if(strength<=.75)mobileRunning=false;
    positionThumb(distance > 0 ? dx / distance * limited : 0, distance > 0 ? dy / distance * limited : 0);
    emit();
  }
  listen(joystick, 'pointerdown', (event) => {
    event.stopPropagation();
    event.preventDefault();
    if (!enabled || destroyed || pointer !== undefined || event.button !== 0) return;
    pointer = event.pointerId;
    try { joystick.setPointerCapture?.(pointer); } catch {                                                    }
    move(event);
  });
  listen(joystick, 'pointermove', (event) => {
    if (event.pointerId !== pointer) return;
    event.stopPropagation();
    event.preventDefault();
    move(event);
  });
  function release(event) {
    if (event.pointerId !== pointer) return;
    event.stopPropagation();
    const previous = pointer;
    pointer = undefined;
    stickX = stickY = 0; mobileRunning = false;
    if (joystick.hasPointerCapture?.(previous)) {
      try { joystick.releasePointerCapture(previous); } catch {                                        }
    }
    positionThumb(0, 0);
    emit();
  }
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(joystick, event, release);
  for (const event of ['pointerup', 'pointercancel']) listen(win, event, release);

  for (const event of ['pointerdown', 'pointermove', 'pointerup', 'click', 'dblclick', 'wheel']) {
    listen(root, event, (e) => e.stopPropagation());
  }
  listen(win, 'keydown', (event) => {
    if (!enabled || destroyed || event.ctrlKey || event.metaKey || event.altKey || isEditable(event.target)) return;
    if (!MOVEMENT_KEYS.has(event.code) && !RUN_KEYS.has(event.code)) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    if (event.repeat) return;
    keys.add(event.code);
    emit();
  }, true);
  listen(win, 'keyup', (event) => {
    if (!keys.has(event.code)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    keys.delete(event.code);
    emit();
  }, true);
  listen(win, 'blur', safetyReset);
  listen(win, 'resize', safetyReset);
  listen(win, 'pagehide', safetyReset);
  listen(doc, 'visibilitychange', () => { if (doc.hidden) safetyReset(); });
  listen(doc, 'focusin', (event) => { if (isEditable(event.target)) safetyReset(); });
  return {
    sample,
    reset,
    setEnabled(value) {
      enabled = Boolean(value) && !destroyed;
      root.dataset.enabled = String(enabled);
      joystick.setAttribute('aria-disabled', String(!enabled));
      if (!enabled) reset();
    },
    destroy() {
      if (destroyed) return;
      enabled = false;
      reset();
      destroyed = true;
      for (const remove of removers) remove();
      joystick.style.touchAction = previousTouchAction;
    },
  };
}
