/** One captured look pointer, accepted only when it starts on the renderer
 * canvas. HUD/joystick/wheel/jump touches never enter this pointer's ownership.
 * The callbacks use yaw/pitch radians; no timer, zoom or camera is owned here.
 */
export function createLookInput({
  canvas,
  onBegin = () => {},
  onDelta = () => {},
  onEnd = () => {},
  onSafetyReset = () => {},
  sensitivity = 0.006,
} = {}) {
  if (!canvas?.ownerDocument?.defaultView) throw new Error('Look input needs a renderer canvas with a document/window.');
  const doc = canvas.ownerDocument, win = doc.defaultView, removers = [];
  const radiansPerPixel = Number.isFinite(sensitivity) && sensitivity > 0 ? sensitivity : 0.006;
  const previousTouchAction = canvas.style.touchAction;
  let enabled = true, destroyed = false, pointer;
  let lastX = 0, lastY = 0;
  canvas.style.touchAction = 'none';
  const listen = (target, type, fn, options) => {
    target.addEventListener(type, fn, options);
    removers.push(() => target.removeEventListener(type, fn, options));
  };
  function reset(reason = 'reset') {
    if (pointer === undefined) return;
    const previous = pointer;
    pointer = undefined;
    if (canvas.hasPointerCapture?.(previous)) {
      try { canvas.releasePointerCapture(previous); } catch { /* The browser may have cancelled first. */ }
    }
    onEnd({ reason, cancelled: reason !== 'pointerup', pointerId: previous });
  }
  function safetyReset(reason) {
    reset(reason);
    onSafetyReset(reason);
  }
  listen(canvas, 'pointerdown', (event) => {
    if (!enabled || destroyed || pointer !== undefined || event.button !== 0) return;
    // Do not test isPrimary: a joystick can already own the primary touch.
    pointer = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    event.preventDefault();
    event.stopPropagation();
    try { canvas.setPointerCapture?.(pointer); } catch { /* Window listeners are the interruption fallback. */ }
    onBegin(event);
  });
  function move(event) {
    if (pointer === undefined || event.pointerId !== pointer) return;
    event.preventDefault();
    const dx = event.clientX - lastX, dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    if (Number.isFinite(dx) && Number.isFinite(dy) && (dx || dy)) {
      onDelta(-dx * radiansPerPixel, dy * radiansPerPixel);
    }
  }
  function release(event) {
    if (pointer === undefined || event.pointerId !== pointer) return;
    reset(event.type);
  }
  listen(canvas, 'pointermove', move);
  // Capture-phase completion also works if a HUD stops bubbling. These window
  // handlers never acquire a pointer or consume another control's pointer.
  listen(win, 'pointermove', move, { capture: true, passive: false });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    listen(canvas, type, release);
    listen(win, type, release, true);
  }
  listen(win, 'blur', () => safetyReset('blur'));
  listen(win, 'resize', () => safetyReset('resize'));
  listen(win, 'pagehide', () => safetyReset('pagehide'));
  listen(doc, 'visibilitychange', () => { if (doc.hidden) safetyReset('hidden'); });
  return {
    get active() { return pointer !== undefined; },
    get pointerId() { return pointer; },
    reset,
    setEnabled(value) {
      enabled = Boolean(value) && !destroyed;
      canvas.style.touchAction = enabled ? 'none' : previousTouchAction;
      if (!enabled) reset('disabled');
    },
    destroy() {
      if (destroyed) return;
      enabled = false;
      reset('destroyed');
      destroyed = true;
      for (const remove of removers) remove();
      canvas.style.touchAction = previousTouchAction;
    },
  };
}
