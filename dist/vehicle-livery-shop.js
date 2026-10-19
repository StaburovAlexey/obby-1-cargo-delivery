import { BASE_VEHICLE_LIVERY_ID, VEHICLE_LIVERY_CATALOG, getVehicleLivery, vehicleLiveryName } from './vehicle-livery-catalog.js';

const copy = Object.freeze({
  ru: {
    title: 'Расцветки', close: 'Закрыть магазин расцветок', eyebrow: 'МАГАЗИН АНГАРА',
    description: 'Листайте машины вниз, расцветки — влево и вправо.',
    previewNote: 'Примерка видна на машине в ангаре.',
    unavailable: 'Покупка пока недоступна. Цены и валюта ещё не выбраны.',
    resetNote: 'При закрытии все машины вернутся к базовой расцветке.',
    base: 'Базовая · установлена', preview: 'Примерка · не куплено', loading: 'Загружаем примерку…',
    failed: 'Не удалось загрузить. Нажмите на расцветку ещё раз.',
    purchase: 'Покупка недоступна', owned: 'В наличии', locked: 'Закрыто',
    show: 'Показать в ангаре', choose: 'Выбрать расцветку для', selected: 'Выбрано для примерки',
    count: '11 машин · 44 новые расцветки', reward: 'Наградная машина',
  },
  en: {
    title: 'Liveries', close: 'Close livery shop', eyebrow: 'HANGAR SHOP',
    description: 'Scroll down for cars. Swipe sideways for liveries.',
    previewNote: 'See your preview on the car in the hangar.',
    unavailable: 'Purchases are unavailable. Prices and currency are not set yet.',
    resetNote: 'Closing restores the base finish on every car.',
    base: 'Base · equipped', preview: 'Preview · not owned', loading: 'Loading preview…',
    failed: 'Preview could not load. Tap the livery to retry.',
    purchase: 'Purchase unavailable', owned: 'Owned', locked: 'Locked',
    show: 'Show in hangar', choose: 'Choose a livery for', selected: 'Selected for preview',
    count: '11 cars · 44 new liveries', reward: 'Reward car',
  },
});

/**
 * Creates a preview-only shop and appends its dialog to document.body.
 * onPreview(vehicleId, liveryId) is called immediately, including for locked cars.
 * It may return a Promise; throw/reject/return false to report a failed preview.
 * The host must make requests latest-wins and restore actual cars in onClose.
 * No selection, ownership, money, or equipment is saved or modified here.
 */
export function createVehicleLiveryShop(doc, {
  language = () => 'ru', canOpen = () => true, button = null,
  onPreview = () => true, onClose = () => {}, onOpenChange = () => {},
} = {}) {
  let opened = false, disposed = false, closing = false, visible = true, epoch = 0, returnFocus = null;
  let background = [], languageOverride = null;
  const listeners = [], rows = new Map();
  const lang = () => (languageOverride ?? (typeof language === 'function' ? language() : language)) === 'en' ? 'en' : 'ru';
  const words = () => copy[lang()];
  const listen = (node, type, fn, options) => {
    node.addEventListener(type, fn, options);
    listeners.push(() => node.removeEventListener(type, fn, options));
  };
  const make = (tag, className, parent, attributes = {}) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    if (parent) parent.append(node);
    return node;
  };
  const contains = (parent, child) => {
    if (parent.contains) return parent.contains(child);
    for (let node = child; node; node = node.parentNode || node.parent) if (node === parent) return true;
    return false;
  };
  const menu = make('div', 'vehicle-livery-menu', doc.body, { id: 'vehicle-livery-menu', 'data-i18n-skip': '' });
  menu.hidden = true;
  const panel = make('section', 'vehicle-livery-panel', menu, {
    id: 'vehicle-livery-panel', role: 'dialog', 'aria-modal': 'true',
    'aria-labelledby': 'vehicle-livery-title', 'aria-describedby': 'vehicle-livery-description', tabindex: '-1',
  });
  const heading = make('header', 'vehicle-livery-heading', panel);
  const headingText = make('div', 'vehicle-livery-heading-text', heading);
  const eyebrow = make('span', 'vehicle-livery-eyebrow', headingText);
  const title = make('h2', '', headingText, { id: 'vehicle-livery-title' });
  const closeButton = make('button', 'vehicle-livery-close', heading, { id: 'vehicle-livery-close', type: 'button' });
  closeButton.textContent = '×';
  const intro = make('div', 'vehicle-livery-intro', panel);
  const description = make('p', '', intro, { id: 'vehicle-livery-description' });
  const previewNote = make('p', 'vehicle-livery-preview-note', intro);
  const count = make('p', 'vehicle-livery-count', intro);
  const scroll = make('div', 'vehicle-livery-scroll', panel, { id: 'vehicle-livery-list', role: 'list' });
  const footer = make('footer', 'vehicle-livery-footer', panel);
  const unavailable = make('p', '', footer, { id: 'vehicle-livery-purchase-note' });
  const resetNote = make('p', 'vehicle-livery-reset-note', footer);

  function updateRow(row) {
    const text = words(), selected = getVehicleLivery(row.vehicle.id, row.selected);
    row.name.textContent = row.vehicle.name[lang()];
    row.show.title = `${text.show}: ${row.vehicle.name[lang()]}`;
    row.show.setAttribute('aria-label', row.show.title);
    row.rail.setAttribute('aria-label', `${text.choose} ${row.vehicle.name[lang()]}`);
    row.root.setAttribute('aria-busy', String(row.loading));
    row.root.setAttribute('data-active', String(row.active));
    row.status.textContent = row.loading ? text.loading : row.error ? text.failed : row.selected === BASE_VEHICLE_LIVERY_ID ? text.base : text.preview;
    row.status.setAttribute('data-state', row.error ? 'error' : row.loading ? 'loading' : selected.owned ? 'owned' : 'preview');
    row.purchase.textContent = text.purchase;
    row.purchase.title = text.unavailable;
    row.purchase.hidden = row.selected === BASE_VEHICLE_LIVERY_ID;
    row.purchase.disabled = true;
    for (const [id, entry] of row.options) {
      const variant = getVehicleLivery(row.vehicle.id, id), checked = id === row.selected;
      const name = vehicleLiveryName(row.vehicle.id, id, lang());
      entry.name.textContent = name;
      entry.button.setAttribute('aria-checked', String(checked));
      entry.button.setAttribute('aria-label', `${variant.code === '0' ? '' : variant.code + ' · '}${name} · ${variant.owned ? text.owned : text.locked}`);
      entry.button.tabIndex = checked ? 0 : -1;
      entry.button.title = `${name} · ${variant.owned ? text.owned : text.locked}`;
      entry.lock.hidden = variant.owned;
    }
  }

  function refresh() {
    if (disposed) return;
    const text = words();
    menu.setAttribute('lang', lang());
    title.textContent = text.title;
    eyebrow.textContent = text.eyebrow;
    closeButton.setAttribute('aria-label', text.close);
    description.textContent = text.description;
    previewNote.textContent = text.previewNote;
    count.textContent = text.count;
    unavailable.textContent = text.unavailable;
    resetNote.textContent = text.resetNote;
    if (button) {
      button.setAttribute('aria-label', text.title);
      button.setAttribute('title', text.title);
    }
    for (const row of rows.values()) updateRow(row);
  }

  function select(vehicleId, liveryId, { focus = false } = {}) {
    if (disposed || !opened || !canOpen() || !getVehicleLivery(vehicleId, liveryId)) return false;
    const row = rows.get(vehicleId), token = ++row.token, openEpoch = epoch;
    row.selected = liveryId;
    row.error = false;
    row.loading = true;
    for (const other of rows.values()) {
      other.active = other === row;
      updateRow(other);
    }
    if (focus) row.options.get(liveryId).button.focus?.({ preventScroll: true });
    const settle = success => {
      if (disposed || !opened || epoch !== openEpoch || row.token !== token) return;
      row.loading = false;
      row.error = !success;
      if (success) row.applied = liveryId;
      updateRow(row);
    };
    try {
      const result = onPreview(vehicleId, liveryId);
      if (result && typeof result.then === 'function') Promise.resolve(result).then(value => settle(value !== false), () => settle(false));
      else settle(result !== false);
    } catch {
      settle(false);
    }
    return true;
  }

  function resetGesture(row) {
    const gesture = row.gesture;
    row.gesture = null;
    row.rail.classList.remove('is-swiping');
    if (gesture && row.rail.hasPointerCapture?.(gesture.id)) {
      try { row.rail.releasePointerCapture(gesture.id); } catch { /* Pointer already cancelled by the browser. */ }
    }
  }

  for (const [index, vehicle] of VEHICLE_LIVERY_CATALOG.entries()) {
    const root = make('article', 'vehicle-livery-card', scroll, { role: 'listitem', 'data-vehicle-id': vehicle.id, 'data-biome': vehicle.biome });
    const head = make('h3', 'vehicle-livery-card-heading', root, { id: `vehicle-livery-car-${vehicle.id}` });
    root.setAttribute('aria-labelledby', `vehicle-livery-car-${vehicle.id}`);
    const show = make('button', 'vehicle-livery-show', head, { type: 'button', 'data-show-vehicle': vehicle.id });
    const number = make('span', 'vehicle-livery-number', show, { 'aria-hidden': 'true' });
    number.textContent = String(index + 1).padStart(2, '0');
    const name = make('span', 'vehicle-livery-car-name', show);
    const eye = make('span', 'vehicle-livery-eye', show, { 'aria-hidden': 'true' });
    eye.textContent = '↗';
    const rail = make('div', 'vehicle-livery-variants', root, { role: 'radiogroup', 'data-vehicle-options': vehicle.id });
    const row = { vehicle, root, show, name, rail, options: new Map(), selected: BASE_VEHICLE_LIVERY_ID,
      applied: BASE_VEHICLE_LIVERY_ID, token: 0, loading: false, error: false, active: false, gesture: null, suppressClick: false };
    for (const variant of vehicle.variants) {
      const option = make('button', 'vehicle-livery-option', rail, {
        type: 'button', role: 'radio', 'data-livery-id': variant.id, 'aria-checked': String(variant.owned),
      });
      const swatch = make('span', 'vehicle-livery-swatch', option, { 'aria-hidden': 'true' });
      const code = make('span', 'vehicle-livery-code', swatch);
      code.textContent = variant.code === '0' ? '✓' : variant.code;
      const lock = make('span', 'vehicle-livery-lock', swatch);
      // A CSS-drawn padlock avoids platform-dependent coloured emoji.
      const optionName = make('span', 'vehicle-livery-option-name', option);
      row.options.set(variant.id, { button: option, name: optionName, lock });
      listen(option, 'click', event => {
        if (row.suppressClick && event.detail !== 0) { row.suppressClick = false; event.preventDefault(); return; }
        row.suppressClick = false;
        select(vehicle.id, variant.id);
      });
    }
    const bottom = make('div', 'vehicle-livery-card-bottom', root);
    row.status = make('p', 'vehicle-livery-status', bottom, { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    row.purchase = make('button', 'vehicle-livery-purchase', bottom, { type: 'button', disabled: '', 'aria-describedby': 'vehicle-livery-purchase-note' });
    row.purchase.disabled = true;
    rows.set(vehicle.id, row);
    listen(show, 'click', () => select(vehicle.id, row.selected));
    listen(rail, 'keydown', event => {
      const last = vehicle.variants.length - 1, current = vehicle.variants.findIndex(item => item.id === row.selected);
      const next = event.key === 'ArrowRight' ? Math.min(last, current + 1) : event.key === 'ArrowLeft' ? Math.max(0, current - 1) : event.key === 'Home' ? 0 : event.key === 'End' ? last : null;
      if (next === null) return;
      event.preventDefault(); event.stopPropagation();
      select(vehicle.id, vehicle.variants[next].id, { focus: true });
    });
    listen(rail, 'pointerdown', event => {
      if (!opened || row.gesture || event.isPrimary === false || (event.button != null && event.button !== 0)) return;
      row.suppressClick = false;
      row.gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, axis: null };
    });
    listen(rail, 'pointermove', event => {
      const gesture = row.gesture;
      if (!gesture || gesture.id !== event.pointerId) return;
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      gesture.dx = dx;
      if (!gesture.axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 9) {
        if (Math.abs(dx) > Math.abs(dy) * 1.2) {
          gesture.axis = 'x'; row.suppressClick = true;
          row.rail.classList.add('is-swiping');
          try { rail.setPointerCapture?.(gesture.id); } catch { /* Capture is optional. */ }
        } else if (Math.abs(dy) > Math.abs(dx) * 1.2) gesture.axis = 'y';
      }
      if (gesture.axis === 'x') event.preventDefault();
    }, { passive: false });
    listen(rail, 'pointerup', event => {
      const gesture = row.gesture;
      if (!gesture || gesture.id !== event.pointerId) return;
      const moved = gesture.axis === 'x' && Math.abs(gesture.dx) >= 32;
      const direction = gesture.dx < 0 ? 1 : -1;
      resetGesture(row);
      if (!moved) return;
      event.preventDefault();
      const current = vehicle.variants.findIndex(item => item.id === row.selected);
      const next = Math.max(0, Math.min(vehicle.variants.length - 1, current + direction));
      if (next !== current) select(vehicle.id, vehicle.variants[next].id);
    });
    for (const type of ['pointercancel', 'lostpointercapture']) listen(rail, type, event => {
      if (row.gesture?.id === event.pointerId) resetGesture(row);
    });
  }

  function releaseBackground() {
    for (const [node, inert] of background) node.inert = inert;
    background = [];
  }
  function resetRows() {
    for (const row of rows.values()) {
      resetGesture(row);
      row.token++;
      row.selected = row.applied = BASE_VEHICLE_LIVERY_ID;
      row.loading = row.error = row.active = row.suppressClick = false;
      updateRow(row);
    }
  }
  function close({ restoreFocus = true } = {}) {
    if (!opened || closing) return false;
    closing = true;
    opened = false;
    epoch++;
    menu.hidden = true;
    button?.setAttribute('aria-expanded', 'false');
    doc.body.classList.remove('vehicle-livery-shop-open');
    releaseBackground();
    resetRows();
    const target = returnFocus;
    returnFocus = null;
    try {
      // Unpause/sync the host first; onClose then restores its camera and materials.
      onOpenChange(false);
    } finally {
      try { onClose(); } finally { closing = false; }
    }
    if (restoreFocus && !opened && !disposed) {
      const eligible = node => node && !node.hidden && !node.disabled && !node.inert && node.isConnected !== false;
      if (eligible(target)) target.focus?.();
      else if (eligible(button)) button.focus?.();
    }
    return true;
  }
  function show() {
    if (disposed || closing || !visible || !canOpen()) return false;
    if (opened) return true;
    opened = true;
    epoch++;
    returnFocus = button || doc.activeElement;
    resetRows();
    menu.hidden = false;
    button?.setAttribute('aria-expanded', 'true');
    doc.body.classList.add('vehicle-livery-shop-open');
    background = Array.from(doc.body.children || []).filter(node => node !== menu && !contains(node, menu)).map(node => [node, node.inert]);
    for (const [node] of background) node.inert = true;
    scroll.scrollTop = 0;
    refresh();
    onOpenChange(true);
    if (!opened || disposed) return false;
    closeButton.focus?.();
    return true;
  }
  const focusable = () => [closeButton, ...[...rows.values()].flatMap(row => [row.show, row.options.get(row.selected).button])];
  function onKeyDown(event) {
    if (!opened) return;
    event.stopPropagation();
    if (event.key === 'Escape' || event.code === 'Escape') {
      event.preventDefault(); close();
    } else if (event.key === 'Tab') {
      const controls = focusable(), active = doc.activeElement, first = controls[0], last = controls.at(-1);
      if (!controls.includes(active) || (event.shiftKey && active === first) || (!event.shiftKey && active === last)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus?.();
      }
    }
  }
  if (button) {
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', 'vehicle-livery-panel');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('data-i18n-skip', '');
    listen(button, 'click', event => { event.stopPropagation(); if (opened) close(); else show(); });
    listen(button, 'keydown', event => event.stopPropagation());
  }
  listen(closeButton, 'click', () => close());
  listen(menu, 'click', event => { if (event.target === menu) close(); });
  listen(menu, 'keydown', onKeyDown);
  listen(doc, 'keydown', onKeyDown);
  listen(doc, 'focusin', event => { if (opened && !contains(menu, event.target)) closeButton.focus?.(); });
  listen(doc.defaultView || doc, 'blur', () => { for (const row of rows.values()) resetGesture(row); });
  for (const node of [menu, button].filter(Boolean)) {
    for (const type of ['keyup', 'click', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'touchstart', 'touchmove', 'touchend', 'touchcancel', 'wheel']) {
      listen(node, type, event => event.stopPropagation());
    }
  }
  refresh();
  function destroy() {
    if (disposed) return;
    disposed = true;
    try { close({ restoreFocus: false }); }
    finally {
      for (const remove of listeners.splice(0)) remove();
      releaseBackground();
      menu.remove();
    }
  }
  return {
    show, open: show, close,
    setVisible(next) {
      visible = !!next;
      if (button) button.hidden = !visible;
      if (!visible) close({ restoreFocus: false });
      return visible;
    },
    isOpen: () => opened, refresh,
    setLanguage(next) { languageOverride = next === 'en' ? 'en' : 'ru'; refresh(); return lang(); },
    preview: select,
    getSelection: vehicleId => rows.get(vehicleId)?.selected ?? null,
    destroy, dispose: destroy,
  };
}
