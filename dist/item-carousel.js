/** Reusable item carousel. Rendering is supplied by the caller; no WebGL or shop logic. */
export function createItemCarousel(doc, { parent, items, renderItem, onSelect, label = '' }) {
  const listeners = [];
  const make = (tag, className, target) => {
    const node = doc.createElement(tag); node.className = className; target?.append(node); return node;
  };
  const listen = (node, event, fn, options) => {
    node.addEventListener(event, fn, options);
    listeners.push(() => node.removeEventListener(event, fn, options));
  };
  const root = make('div', 'item-carousel', parent);
  root.setAttribute('role', 'region'); root.setAttribute('aria-roledescription', 'carousel');
  const viewport = make('div', 'item-carousel-viewport', root);
  viewport.setAttribute('role', 'img');
  const previous = make('button', 'item-carousel-arrow item-carousel-previous', root);
  previous.type = 'button'; previous.textContent = '‹';
  const next = make('button', 'item-carousel-arrow item-carousel-next', root);
  next.type = 'button'; next.textContent = '›';
  const rail = make('div', 'item-carousel-pagination', root);
  rail.setAttribute('role', 'radiogroup');
  const options = new Map();
  let selected = items[0]?.id, gesture = null, suppressClick = false, enabled = true;
  const resetGesture = () => {
    const old = gesture; gesture = null;
    root.classList.remove('is-swiping'); rail.classList.remove('is-swiping');
    if (old?.target.hasPointerCapture?.(old.id)) {
      try { old.target.releasePointerCapture(old.id); } catch { /* Optional capture has ended. */ }
    }
  };
  function update(id, { focus = false } = {}) {
    if (!options.has(id)) return false;
    selected = id;
    const index = items.findIndex(item => item.id === id);
    previous.disabled = index === 0; next.disabled = index === items.length - 1;
    for (const [key, entry] of options) {
      entry.button.setAttribute('aria-checked', String(key === id));
      entry.button.tabIndex = key === id ? 0 : -1;
    }
    viewport.setAttribute('data-item-id', id);
    if (focus) options.get(id).button.focus?.({ preventScroll: true });
    return true;
  }
  function choose(index, focus = false) {
    if (!enabled) return;
    const item = items[Math.max(0, Math.min(items.length - 1, index))];
    if (item) onSelect(item.id, { focus });
  }
  function step(delta, focus = false) { choose(items.findIndex(item => item.id === selected) + delta, focus); }
  for (const item of items) {
    const button = make('button', 'item-carousel-option', rail);
    button.setAttribute('type', 'button'); button.setAttribute('role', 'radio'); button.setAttribute('data-item-id', item.id);
    const content = renderItem?.(item, button) || {};
    options.set(item.id, { button, ...content });
    listen(button, 'click', event => {
      if (suppressClick && event.detail !== 0) { suppressClick = false; event.preventDefault(); return; }
      suppressClick = false;
      if (enabled) onSelect(item.id, { focus: false });
    });
  }
  listen(previous, 'click', () => step(-1)); listen(next, 'click', () => step(1));
  listen(root, 'keydown', event => {
    const last = items.length - 1, index = items.findIndex(item => item.id === selected);
    const target = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? last : null;
    if (target === null || !enabled) return;
    event.preventDefault(); event.stopPropagation(); choose(target, true);
  });
  for (const target of [viewport, rail]) {
    listen(target, 'pointerdown', event => {
      if (!enabled || gesture || event.isPrimary === false || (event.button != null && event.button !== 0)) return;
      suppressClick = false;
      gesture = { target, id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, axis: null };
    });
    listen(target, 'pointermove', event => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y; gesture.dx = dx;
      if (!gesture.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 9) {
        if (Math.abs(dx) > Math.abs(dy) * 1.2) {
          gesture.axis = 'x'; suppressClick = true; root.classList.add('is-swiping'); rail.classList.add('is-swiping');
          try { target.setPointerCapture?.(gesture.id); } catch { /* Capture is optional. */ }
        } else if (Math.abs(dy) > Math.abs(dx) * 1.2) gesture.axis = 'y';
      }
      if (gesture.axis === 'x') event.preventDefault();
    }, { passive: false });
    listen(target, 'pointerup', event => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const moved = gesture.axis === 'x' && Math.abs(gesture.dx) >= 32, direction = gesture.dx < 0 ? 1 : -1;
      resetGesture();
      if (moved) { event.preventDefault(); step(direction); }
    });
    for (const type of ['pointercancel', 'lostpointercapture']) listen(target, type, resetGesture);
  }
  listen(doc.defaultView || doc, 'blur', resetGesture);
  for (const type of ['pointerup', 'pointercancel']) listen(doc.defaultView || doc, type, event => {
    if (gesture?.id !== event.pointerId) return;
    // Capture-phase cleanup must not erase a swipe before its own target handles it.
    for (let node = event.target; node; node = node.parentNode || node.parent) if (node === gesture.target) return;
    resetGesture();
  }, { capture: true });
  update(selected);
  return {
    root, viewport, rail, previous, next, options, update, resetGesture,
    setLabels({ title = label, previous: back = 'Previous', next: forward = 'Next' } = {}) {
      root.setAttribute('aria-label', title); rail.setAttribute('aria-label', title);
      previous.setAttribute('aria-label', back); next.setAttribute('aria-label', forward);
    },
    setEnabled(value) { enabled = !!value; if (!enabled) resetGesture(); },
    destroy() { resetGesture(); for (const remove of listeners.splice(0)) remove(); root.remove(); },
  };
}
