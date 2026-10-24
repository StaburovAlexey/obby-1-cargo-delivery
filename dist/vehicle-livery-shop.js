import { createItemCarousel } from './item-carousel.js';
import { VEHICLE_NEON_COLORS } from './vehicle-neon-catalog.js';
import { DEFAULT_VEHICLE_SMOKE_ID, VEHICLE_SMOKE_STYLES, getVehicleSmokeStyle } from './vehicle-smoke-catalog.js';
import { modalPart } from './modal-ui.js';
import { BASE_VEHICLE_LIVERY_ID, VEHICLE_LIVERY_CATALOG, getVehicleLivery, vehicleLiveryName } from './vehicle-livery-catalog.js';

const copy = Object.freeze({
  ru: { shop: 'Магазин', newLook: 'Новый внешний вид!', neon: 'Неоновая подсветка', smoke: 'Дым из-под колёс', smokeNote: 'Один эффект для всех машин.', soon: 'Скоро', selected: 'Выбрано', smokeFailed: 'Не удалось выбрать эффект. Попробуйте ещё раз.', back: 'Назад', neonPreview: 'Предпросмотр', title: 'Расцветки', close: 'Закрыть магазин расцветок', apply: 'Выбрать', choose: 'Расцветки машины', loading: 'Загрузка', failed: 'Не удалось загрузить', base: 'Стандартная', preview: 'Только просмотр' },
  en: { shop: 'Shop', newLook: 'New look!', neon: 'Neon lighting', smoke: 'Tire smoke', smokeNote: 'One effect for every car.', soon: 'Coming soon', selected: 'Selected', smokeFailed: 'Could not select effect. Please try again.', back: 'Back', neonPreview: 'Preview', title: 'Liveries', close: 'Close livery shop', apply: 'Select', choose: 'Car liveries', loading: 'Loading', failed: 'Could not load', base: 'Standard', preview: 'Preview only' },
});

/**
 * Creates a preview-only shop and appends its dialog to document.body.
 * onPreview(vehicleId, liveryId) is called immediately, including for locked cars.
 * It may return a Promise; throw/reject/return false to report a failed preview.
 * The host must make requests latest-wins and release its isolated preview in onClose.
 * Only explicit onApply may change the hangar car; locked finishes cannot apply.
 * Neon ownership and purchases are delegated to the host callbacks.
 */
export function createVehicleLiveryShop(doc, {
  language = () => 'ru', canOpen = () => true, button = null,
  autoPreview = false, onApply = () => true,
  canUseSmoke = () => false, getSelectedSmokeId = () => DEFAULT_VEHICLE_SMOKE_ID, onSmokeApply = () => false,
  onPreview = () => true, onNeonPreview = () => true, getNeonOffer = () => null, onNeonApply = () => false, onNeonDisable = () => false, onSectionChange = () => {}, onClose = () => {}, onOpenChange = () => {},
} = {}) {
  let opened = false, disposed = false, closing = false, visible = true, epoch = 0, returnFocus = null;
  let background = [], languageOverride = null, section = 'categories', neonSelected = VEHICLE_NEON_COLORS[0].id, neonToken = 0, neonLoading = false, neonError = false, neonBuying = false, neonPurchaseError = false;
  let smokeSelected = DEFAULT_VEHICLE_SMOKE_ID, smokeApplying = false, smokeApplyError = false;
  const appliedSmokeId = () => getVehicleSmokeStyle(getSelectedSmokeId())?.id ?? DEFAULT_VEHICLE_SMOKE_ID;
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
  const backButton = make('button', modalPart('close', 'vehicle-shop-back'), heading, { id: 'vehicle-shop-back', type: 'button' });
  backButton.textContent = '‹';
  const headingText = make('div', 'vehicle-livery-heading-text', heading);
  const title = make('h2', '', headingText, { id: 'vehicle-livery-title' });
  const closeButton = make('button', modalPart('close', 'vehicle-livery-close'), heading, { id: 'vehicle-livery-close', type: 'button' });
  closeButton.textContent = '×';
  const categories = make('div', 'vehicle-shop-categories', panel, { id: 'vehicle-shop-categories' });
  const categoryButtons = {};
  for (const id of ['liveries', 'neon', 'smoke']) {
    const entry = make('button', 'vehicle-shop-category', categories, { type: 'button', 'data-shop-category': id });
    const picture = make('img', '', entry, { alt: '', draggable: 'false', decoding: 'async' });
    // Literal URLs are required by the production bundler.
    const pictureUrl = id === 'liveries' ? new URL('./assets/shop/new-look.webp', import.meta.url).href : id === 'neon' ? new URL('./assets/shop/neon.webp', import.meta.url).href : new URL('./assets/shop/tire-smoke.webp', import.meta.url).href;
    const label = make('span', 'vehicle-shop-category-title', entry);
    categoryButtons[id] = { entry, label, picture, pictureUrl };
    listen(entry, 'click', () => setSection(id));
  }
  const smokeSoon = make('span', 'vehicle-smoke-soon', categoryButtons.smoke.entry);
  const smokePanel = make('div', 'vehicle-smoke-panel', panel, { id: 'vehicle-smoke-panel' });
  const smokeSlides = [];
  function renderSmoke(position) {
    for (let index = 0; index < smokeSlides.length; index++) {
      const item = smokeSlides[index];
      // Nearest wrapped position allows a single image per style to loop continuously.
      let offset = ((index - position) % smokeSlides.length + smokeSlides.length) % smokeSlides.length;
      if (offset > smokeSlides.length / 2) offset -= smokeSlides.length;
      item.slide.hidden = Math.abs(offset) > 1.4;
      item.slide.style.transform = `translateX(${offset * 112 - 50}%) scale(${1 - Math.min(1, Math.abs(offset)) * .12})`;
      item.slide.style.opacity = String(1 - Math.min(1, Math.abs(offset)) * .45);
      if (opened && section === 'smoke' && !item.slide.hidden && !item.image.src) item.image.src = item.style.iconUrl;
    }
  }
  const smokeCarousel = createItemCarousel(doc, { parent: smokePanel, items: VEHICLE_SMOKE_STYLES, onSelect: (id, options) => selectSmoke(id, options), onPositionChange: renderSmoke });
  const smokeHost = smokeCarousel.viewport;
  smokeHost.className += ' vehicle-smoke-preview-host';
  smokeHost.setAttribute('id', 'vehicle-smoke-preview');
  for (const style of VEHICLE_SMOKE_STYLES) {
    const slide = make('div', 'vehicle-smoke-slide', smokeHost, { 'aria-hidden': 'true' });
    const image = make('img', 'vehicle-smoke-image', slide, { alt: '', draggable: 'false', loading: 'lazy', decoding: 'async' });
    const fallback = make('span', 'vehicle-smoke-image-fallback', slide);
    fallback.hidden = true;
    listen(image, 'error', () => { image.hidden = true; fallback.hidden = false; });
    smokeSlides.push({ style, slide, image, fallback });
  }
  const smokeName = make('p', 'vehicle-smoke-name', smokePanel, { id: 'vehicle-smoke-name', role: 'status', 'aria-live': 'polite' });
  const smokeNote = make('p', 'vehicle-smoke-note', smokePanel);
  const smokeApply = make('button', modalPart('button', 'vehicle-smoke-apply'), smokePanel, { id: 'vehicle-smoke-apply', type: 'button' });
  listen(smokeApply, 'click', () => {
    if (disposed || !opened || section !== 'smoke' || !canOpen() || !canUseSmoke() || smokeApply.disabled || smokeApplying || smokeSelected === appliedSmokeId()) return;
    smokeApplying = true; smokeApplyError = false;
    try { smokeApplyError = onSmokeApply(smokeSelected) === false; }
    catch { smokeApplyError = true; }
    finally { smokeApplying = false; refresh(); }
  });
  const neonPanel = make('div', 'vehicle-neon-panel', panel, { id: 'vehicle-neon-panel' });
  const neonCarousel = createItemCarousel(doc, { parent: neonPanel, items: VEHICLE_NEON_COLORS, onSelect: id => selectNeon(id) });
  const neonHost = neonCarousel.viewport;
  neonHost.className += ' vehicle-neon-preview-host';
  neonHost.setAttribute('id', 'vehicle-neon-preview');
  const neonLabel = make('p', 'vehicle-neon-color', neonPanel, { id: 'vehicle-neon-color', role: 'status', 'aria-live': 'polite' });
  const neonNote = make('p', 'vehicle-neon-note', neonPanel);
  const neonApply = make('button', modalPart('button', 'vehicle-neon-apply'), neonPanel, {id:'vehicle-neon-apply',type:'button'});
  const neonDisable = make('button', modalPart('button', 'vehicle-neon-disable'), neonPanel, {id:'vehicle-neon-disable',type:'button'});
  listen(neonApply,'click',async()=>{
    if(neonBuying||neonApply.disabled||!opened||section!=='neon'||!canOpen())return;
    const id=neonSelected;neonBuying=true;neonPurchaseError=false;refresh();
    try{neonPurchaseError=(await onNeonApply(id))===false;}catch{neonPurchaseError=true;}
    finally{neonBuying=false;refresh();}
  });
  listen(neonDisable,'click',()=>{if(!neonBuying){onNeonDisable();refresh();}});
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
    title.textContent = section === 'categories' ? text.shop : section === 'neon' ? text.neon : section === 'smoke' ? text.smoke : text.title;
    backButton.hidden = section === 'categories';
    backButton.setAttribute('aria-label', text.back);
    categoryButtons.liveries.label.textContent = text.newLook;
    categoryButtons.neon.label.textContent = text.neon;
    categoryButtons.liveries.entry.setAttribute('aria-label', text.newLook);
    categoryButtons.neon.entry.setAttribute('aria-label', text.neon);
    const smokeAllowed = !!canUseSmoke();
    categoryButtons.smoke.label.textContent = text.smoke;
    categoryButtons.smoke.entry.disabled = !smokeAllowed;
    categoryButtons.smoke.entry.setAttribute('aria-disabled', String(!smokeAllowed));
    categoryButtons.smoke.entry.setAttribute('aria-label', smokeAllowed ? text.smoke : `${text.smoke} · ${text.soon}`);
    smokeSoon.textContent = text.soon; smokeSoon.hidden = smokeAllowed;
    categories.hidden = section !== 'categories';
    scroll.hidden = section !== 'liveries';
    neonPanel.hidden = section !== 'neon';
    smokePanel.hidden = section !== 'smoke';
    const smokeStyle = getVehicleSmokeStyle(smokeSelected);
    smokeName.textContent = smokeStyle.name[lang()];
    smokeNote.textContent = smokeApplyError ? text.smokeFailed : text.smokeNote;
    const smokeIsSelected = smokeSelected === appliedSmokeId();
    smokeApply.disabled = !smokeAllowed || smokeApplying || smokeIsSelected;
    smokeApply.textContent = smokeIsSelected ? text.selected : text.apply;
    smokeApply.setAttribute('aria-label', `${smokeApply.textContent}: ${smokeStyle.name[lang()]}`);
    smokeHost.setAttribute('aria-label', `${text.smoke}: ${smokeStyle.name[lang()]}`);
    smokeCarousel.setLabels({ title: text.smoke });
    for (const item of smokeSlides) item.fallback.textContent = item.style.name[lang()];
    renderSmoke(smokeHost.carouselPosition);
    const neonColor = VEHICLE_NEON_COLORS.find(item => item.id === neonSelected);
    neonLabel.textContent = neonLoading ? text.loading : neonError ? text.failed : neonColor.name[lang()];
    const offer=section === 'neon' ? getNeonOffer(neonSelected) : null;
    neonNote.textContent = neonPurchaseError ? (lang()==='ru'?'Покупка не завершена. Попробуйте ещё раз.':'Purchase not completed. Please try again.') : offer ? (lang()==='ru'?'Один цвет для всех машин. Покупка навсегда.':'One color for every car. Permanent unlock.') : text.neonPreview;
    neonApply.hidden=!offer;neonDisable.hidden=!offer;
    neonApply.disabled=!offer||offer.disabled||neonBuying||neonLoading||neonError||offer.selected;
    neonApply.textContent=neonBuying?text.loading:offer?.selected?(lang()==='ru'?'Выбрано':'Selected'):offer?.owned?text.apply:`${lang()==='ru'?'Купить':'Buy'} · ${offer?.label||'—'}`;
    if(offer?.currencyImage&&!offer.owned&&!neonBuying){const icon=doc.createElement('img');icon.src=offer.currencyImage;icon.alt='';icon.width=20;icon.height=20;neonApply.append(icon);}
    neonDisable.textContent=lang()==='ru'?'Без подсветки':'No underglow';neonDisable.disabled=neonBuying;
    neonHost.setAttribute('aria-label', `${text.neon}: ${neonColor.name[lang()]}`);
    neonHost.setAttribute('aria-busy', String(neonLoading));
    neonCarousel.setLabels({ title: text.neon });
    closeButton.setAttribute('aria-label', text.close);
    if (button) {
      button.setAttribute('aria-label', text.shop);
      button.setAttribute('title', text.shop);
    }
    for (const row of rows.values()) updateRow(row);
  }

  function select(vehicleId, liveryId, { focus = false } = {}) {
    if (disposed || !opened || section !== 'liveries' || !canOpen() || !getVehicleLivery(vehicleId, liveryId)) return false;
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
      if (!opened || section !== 'liveries' || row.apply.disabled || row.applying || row.selected !== BASE_VEHICLE_LIVERY_ID || !canOpen()) return;
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

  function selectNeon(id) {
    if (disposed || !opened || section !== 'neon' || !canOpen() || !VEHICLE_NEON_COLORS.some(item => item.id === id)) return false;
    const token = ++neonToken, openEpoch = epoch;
    neonSelected = id; neonLoading = true; neonError = false; neonPurchaseError = false;
    neonCarousel.update(id); refresh();
    const settle = success => {
      if (disposed || !opened || section !== 'neon' || epoch !== openEpoch || token !== neonToken) return;
      neonLoading = false; neonError = !success; refresh();
    };
    try { Promise.resolve(onNeonPreview(id)).then(result => settle(result !== false), () => settle(false)); }
    catch { settle(false); }
    return true;
  }
  function selectSmoke(id, { focus = false } = {}) {
    if (disposed || !opened || section !== 'smoke' || !canOpen() || !canUseSmoke() || !getVehicleSmokeStyle(id)) return false;
    smokeSelected = id; smokeApplyError = false;
    smokeCarousel.update(id, { focus });
    refresh();
    return true;
  }
  function setSection(next) {
    if (!opened || disposed || !canOpen() || !['categories', 'liveries', 'neon', 'smoke'].includes(next) || (next === 'smoke' && !canUseSmoke())) return false;
    if (section === next) return true;
    epoch++; neonToken++;
    section = next;
    neonCarousel.resetGesture(); neonCarousel.setEnabled(next === 'neon');
    smokeCarousel.setEnabled(next === 'smoke');
    if (next === 'smoke') {
      smokeSelected = appliedSmokeId(); smokeApplyError = false;
      smokeCarousel.update(smokeSelected, { immediate: true });
    }
    resetRows();
    for (const row of rows.values()) row.carousel.setEnabled(next === 'liveries');
    onSectionChange(next);
    scroll.scrollTop = 0; refresh();
    if (next === 'liveries' && autoPreview) for (const vehicle of VEHICLE_LIVERY_CATALOG) select(vehicle.id, BASE_VEHICLE_LIVERY_ID);
    if (next === 'neon') selectNeon(neonSelected);
    if (next === 'categories') categoryButtons.liveries.entry.focus?.();
    else backButton.focus?.();
    return true;
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
      row.carousel.setEnabled(opened && section === 'liveries');
      updateRow(row);
    }
  }
  function close({ restoreFocus = true } = {}) {
    if (!opened || closing) return false;
    closing = true;
    opened = false;
    epoch++;
    menu.hidden = true;
    neonToken++; neonCarousel.resetGesture(); neonCarousel.setEnabled(false);
    smokeCarousel.setEnabled(false);
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
    for (const {picture,pictureUrl} of Object.values(categoryButtons)) if(!picture.src)picture.src=pictureUrl;
    opened = true;
    section = 'categories'; neonSelected = VEHICLE_NEON_COLORS[0].id; neonLoading = neonError = false;
    neonCarousel.update(neonSelected, { immediate: true }); neonCarousel.setEnabled(false);
    smokeSelected = appliedSmokeId(); smokeApplyError = false;
    smokeCarousel.update(smokeSelected, { immediate: true }); smokeCarousel.setEnabled(false);
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
  const focusable = () => [closeButton, ...(section === 'categories' ? Object.values(categoryButtons).map(item => item.entry).filter(node => !node.disabled) : section === 'smoke' ? [backButton, smokeHost, ...[smokeApply].filter(node => !node.disabled)] : section === 'neon' ? [backButton, neonHost, ...[neonApply,neonDisable].filter(node=>!node.hidden&&!node.disabled)] : [backButton, ...[...rows.values()].flatMap(row => [row.previewHost, row.apply].filter(node => !node.disabled))])];
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
  listen(backButton, 'click', () => setSection('categories'));
  listen(closeButton, 'click', () => close());
  listen(menu, 'click', event => { if (event.target === menu) close(); });
  listen(menu, 'keydown', onKeyDown);
  listen(doc, 'keydown', onKeyDown);
  listen(doc, 'focusin', event => { if (opened && !contains(menu, event.target)) closeButton.focus?.(); });
  listen(doc.defaultView || doc, 'blur', () => { for (const row of rows.values()) resetGesture(row); neonCarousel.resetGesture(); smokeCarousel.resetGesture(); });
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
      neonCarousel.destroy();
      smokeCarousel.destroy();
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
    isOpen: () => opened, refresh, setSection, getSection: () => section,
    getNeonPreviewHost: () => neonHost, previewNeon: selectNeon, getNeonSelection: () => neonSelected,
    getSmokePreviewHost: () => smokeHost, previewSmoke: selectSmoke, getSmokeSelection: () => smokeSelected,
    getPreviewHost: vehicleId => rows.get(vehicleId || VEHICLE_LIVERY_CATALOG[0].id)?.previewHost,
    setLanguage(next) { languageOverride = next === 'en' ? 'en' : 'ru'; refresh(); return lang(); },
    preview: select,
    getSelection: vehicleId => rows.get(vehicleId)?.selected ?? null,
    destroy, dispose: destroy,
  };
}
