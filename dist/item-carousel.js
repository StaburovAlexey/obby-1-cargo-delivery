/** Reusable continuous, looping carousel. The caller renders items from viewport.carouselPosition. */
export function createItemCarousel(doc, { parent, items, onSelect, onPositionChange = () => {}, label = '' }) {
  const listeners = [], win = doc.defaultView || globalThis;
  const root = doc.createElement('div'); root.className = 'item-carousel'; parent?.append(root);
  root.setAttribute('role', 'region'); root.setAttribute('aria-roledescription', 'carousel');
  const viewport = doc.createElement('div'); viewport.className = 'item-carousel-viewport'; root.append(viewport);
  viewport.setAttribute('role', 'group'); viewport.tabIndex = 0; viewport.carouselPosition = 0;
  let selected = items[0]?.id, gesture = null, enabled = true, frame = null, target = 0;
  const modulo = value => (value % items.length + items.length) % items.length;
  const listen = (node, name, fn, options) => { node.addEventListener(name, fn, options); listeners.push(() => node.removeEventListener(name, fn, options)); };
  const stop = () => { if (frame !== null) win.cancelAnimationFrame?.(frame); frame = null; };
  const setPosition = value => { viewport.carouselPosition = value; onPositionChange(value); };
  function animate(to) {
    stop(); target = to;
    const from = viewport.carouselPosition, duration = 260;
    if (from === to || !win.requestAnimationFrame || win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setPosition(to); return; }
    let started;
    const tick = time => {
      started ??= time;
      const t = Math.min(1, (time - started) / duration);
      setPosition(from + (to - from) * (1 - (1 - t) ** 3));
      frame = t < 1 ? win.requestAnimationFrame(tick) : null;
    };
    frame = win.requestAnimationFrame(tick);
  }
  function resetGesture() {
    const old = gesture; gesture = null; root.classList.remove('is-swiping');
    if (old && viewport.hasPointerCapture?.(old.id)) { try { viewport.releasePointerCapture(old.id); } catch {} }
    animate(target);
  }
  function update(id, { focus = false, immediate = false } = {}) {
    const index = items.findIndex(item => item.id === id); if (index < 0) return false;
    if (id !== selected || immediate) {
      selected = id;
      const current = viewport.carouselPosition;
      let delta = modulo(index - modulo(Math.round(current)));
      if (delta > items.length / 2) delta -= items.length;
      const next = Math.round(current) + delta;
      if (immediate) { stop(); target = index; setPosition(index); }
      else animate(next);
    }
    viewport.setAttribute('data-item-id', id);
    if (focus) viewport.focus?.({ preventScroll: true });
    return true;
  }
  function choose(index, focus = false) { if (enabled && items.length) onSelect(items[modulo(index)].id, { focus }); }
  function step(delta, focus = false) { choose(items.findIndex(item => item.id === selected) + delta, focus); }
  listen(root, 'keydown', event => {
    const index = items.findIndex(item => item.id === selected);
    const next = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : null;
    if (next === null || !enabled) return;
    event.preventDefault(); event.stopPropagation(); choose(next, true);
  });
  listen(viewport, 'pointerdown', event => {
    if (!enabled || gesture || event.isPrimary === false || (event.button != null && event.button !== 0)) return;
    stop(); gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, start: viewport.carouselPosition, axis: null };
  });
  listen(viewport, 'pointermove', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y; gesture.dx = dx;
    if (!gesture.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 9) {
      if (Math.abs(dx) > Math.abs(dy) * 1.2) {
        gesture.axis = 'x'; root.classList.add('is-swiping');
        try { viewport.setPointerCapture?.(gesture.id); } catch {}
      } else if (Math.abs(dy) > Math.abs(dx) * 1.2) gesture.axis = 'y';
    }
    if (gesture.axis === 'x') {
      event.preventDefault();
      setPosition(gesture.start - Math.max(-.95, Math.min(.95, dx / Math.max(100, (viewport.clientWidth || 320) * .65))));
    }
  }, { passive: false });
  listen(viewport, 'pointerup', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const moved = gesture.axis === 'x' && Math.abs(gesture.dx) >= 32, direction = gesture.dx < 0 ? 1 : -1;
    // Select before restoring the gesture so the transition uses its current fractional position.
    if (moved) { event.preventDefault(); step(direction); }
    resetGesture();
  });
  for (const type of ['pointercancel', 'lostpointercapture']) listen(viewport, type, event => { if (gesture?.id === event.pointerId) resetGesture(); });
  listen(win, 'blur', resetGesture);
  for (const type of ['pointerup', 'pointercancel']) listen(win, type, event => {
    if (gesture?.id !== event.pointerId) return;
    for (let node = event.target; node; node = node.parentNode || node.parent) if (node === viewport) return;
    resetGesture();
  }, { capture: true });
  update(selected);
  return { root, viewport, update, resetGesture,
    setLabels({ title = label } = {}) { root.setAttribute('aria-label', title); },
    setEnabled(value) { enabled = !!value; if (!enabled) { resetGesture(); stop(); setPosition(target); } },
    destroy() { resetGesture(); stop(); for (const remove of listeners.splice(0)) remove(); root.remove(); },
  };
}
