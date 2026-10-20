import { createItemCarousel } from './item-carousel.js';
import { modalPart } from './modal-ui.js';
import { BASE_VEHICLE_LIVERY_ID, VEHICLE_LIVERY_CATALOG, getVehicleLivery, vehicleLiveryName } from './vehicle-livery-catalog.js';

const copy = Object.freeze({
  ru: { title: 'Расцветки', close: 'Закрыть магазин расцветок', apply: 'Выбрать', choose: 'Расцветки машины', loading: 'Загрузка', failed: 'Не удалось загрузить', base: 'Стандартная', preview: 'Только просмотр' },
  en: { title: 'Liveries', close: 'Close livery shop', apply: 'Select', choose: 'Car liveries', loading: 'Loading', failed: 'Could not load', base: 'Standard', preview: 'Preview only' },
});

/**
 * Creates a preview-only shop and appends its dialog to document.body.
 * onPreview(vehicleId, liveryId) is called immediately, including for locked cars.
 * It may return a Promise; throw/reject/return false to report a failed preview.
 * The host must make requests latest-wins and release its isolated preview in onClose.
 * Only explicit onApply may change the hangar car; locked finishes cannot apply.
 * No selection, ownership, money, or equipment is saved or modified here.
 */
export function createVehicleLiveryShop(doc, {
  language = () => 'ru', canOpen = () => true, button = null,
  autoPreview = false, onApply = () => true,
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
  const menu = make('div', modalPart('overlay', 'vehicle-livery-menu'), doc.body, { id: 'vehicle-livery-menu', 'data-i18n-skip': '' });
  menu.hidden = true;
  const panel = make('section', modalPart('panel', 'vehicle-livery-panel'), menu, {
    id: 'vehicle-livery-panel', role: 'dialog', 'aria-modal': 'true',
    'aria-labelledby': 'vehicle-livery-title', tabindex: '-1',
  });
  const heading = make('header', modalPart('heading', 'vehicle-livery-heading'), panel);
  const headingText = make('div', 'vehicle-livery-heading-text', heading);
  const title = make('h2', '', headingText, { id: 'vehicle-livery-title' });
  const closeButton = make('button', modalPart('close', 'vehicle-livery-close'), heading, { id: 'vehicle-livery-close', type: 'button' });
  closeButton.textContent = '×';
  const scroll = make('div', 'vehicle-livery-scroll', panel, { id: 'vehicle-livery-list', role: 'list' });

  function updateRow(row) {
    const text = words(), selected = getVehicleLivery(row.vehicle.id, row.selected);
    row.root.setAttribute('aria-label', row.vehicle.name[lang()]);
    row.root.setAttribute('aria-busy', String(row.loading));
    row.root.setAttribute('data-active', String(row.active));
    row.status.textContent = row.loading ? text.loading : row.error ? text.failed : row.selected === BASE_VEHICLE_LIVERY_ID ? text.base : text.preview;
    row.status.setAttribute('data-state', row.error ? 'error' : row.loading ? 'loading' : selected.owned ? 'owned' : 'preview');
    const caption = `${row.vehicle.name[lang()]} · ${vehicleLiveryName(row.vehicle.id, row.selected, lang())}`;
    row.previewHost.setAttribute('aria-label', caption);
    row.carousel.update(row.selected);
    row.carousel.setLabels({ title: `${text.choose} ${row.vehicle.name[lang()]}` });
    row.apply.disabled = row.selected !== BASE_VEHICLE_LIVERY_ID || row.loading || row.error || row.applying;
    row.apply.textContent = text.apply;
    row.apply.setAttribute('aria-label', `${text.apply}: ${caption}`);
  }

  function refresh() {
    if (disposed) return;
    const text = words();
    menu.setAttribute('lang', lang());
    title.textContent = text.title;
    closeButton.setAttribute('aria-label', text.close);
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
    row.applyResult = null; row.applying = false;
    for (const other of rows.values()) {
      other.active = other === row;
      updateRow(other);
    }
    if (focus) row.previewHost.focus?.({ preventScroll: true });
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

  const resetGesture = row => row.carousel.resetGesture();

  for (const vehicle of VEHICLE_LIVERY_CATALOG) {
    const root = make('article', 'vehicle-livery-card', scroll, { role: 'listitem', 'data-vehicle-id': vehicle.id, 'data-biome': vehicle.biome });
    const row = { vehicle, root, selected: BASE_VEHICLE_LIVERY_ID,
      applied: BASE_VEHICLE_LIVERY_ID, token: 0, loading: false, error: false, active: false,
      applying: false, applyResult: null };
    row.carousel = createItemCarousel(doc, {
      parent: root, items: vehicle.variants,
      onSelect: (id, options) => select(vehicle.id, id, options),
    });
    row.previewHost = row.carousel.viewport;
    row.previewHost.className += ' vehicle-livery-preview-host';
    row.previewHost.setAttribute('id', `vehicle-livery-preview-${vehicle.id}`);
    row.apply = make('button', modalPart('button', 'vehicle-livery-apply'), root, { type: 'button', 'data-apply-vehicle': vehicle.id });
    listen(row.apply, 'click', () => {
      if (!opened || row.apply.disabled || row.applying || row.selected !== BASE_VEHICLE_LIVERY_ID || !canOpen()) return;
      const token = row.token, openEpoch = epoch;
      row.applying = true; row.applyResult = null; updateRow(row);
      const settle = success => {
        if (!opened || disposed || epoch !== openEpoch || row.token !== token) return;
        row.applying = false; row.applyResult = success; updateRow(row);
      };
      try { Promise.resolve(onApply(vehicle.id, row.selected)).then(result => settle(result !== false), () => settle(false)); }
      catch { settle(false); }
    });
    row.status = make('p', 'vehicle-livery-status sr-only', root, { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    rows.set(vehicle.id, row);
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
      row.loading = row.error = row.active = row.applying = false; row.applyResult = null;
      row.carousel.update(BASE_VEHICLE_LIVERY_ID, { immediate: true });
      row.carousel.setEnabled(opened);
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
    if (autoPreview) for (const vehicle of VEHICLE_LIVERY_CATALOG) select(vehicle.id, BASE_VEHICLE_LIVERY_ID);
    closeButton.focus?.();
    return true;
  }
  const focusable = () => [closeButton, ...[...rows.values()].flatMap(row => [row.previewHost, row.apply].filter(node => !node.disabled))];
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
      for (const row of rows.values()) row.carousel.destroy();
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
    getPreviewHost: vehicleId => rows.get(vehicleId || VEHICLE_LIVERY_CATALOG[0].id)?.previewHost,
    setLanguage(next) { languageOverride = next === 'en' ? 'en' : 'ru'; refresh(); return lang(); },
    preview: select,
    getSelection: vehicleId => rows.get(vehicleId)?.selected ?? null,
    destroy, dispose: destroy,
  };
}
