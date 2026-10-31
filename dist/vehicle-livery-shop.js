import { createItemCarousel } from './item-carousel.js';
import { VEHICLE_NEON_COLORS } from './vehicle-neon-catalog.js';
import { DEFAULT_VEHICLE_SMOKE_ID, VEHICLE_SMOKE_STYLES, getVehicleSmokeStyle } from './vehicle-smoke-catalog.js';
import { DEFAULT_VEHICLE_TRACK_ID, VEHICLE_TRACK_STYLES, getVehicleTrackStyle } from './vehicle-track-catalog.js';
import { getVehicleLiveryIcon, getVehicleNeonIcon, getVehicleSmokeIcon, getVehicleCosmeticCategoryIcon } from './vehicle-cosmetic-icons.js';
import { modalPart } from './modal-ui.js';
import { BASE_VEHICLE_LIVERY_ID, VEHICLE_LIVERY_CATALOG, getVehicleLivery, vehicleLiveryName } from './vehicle-livery-catalog.js';

const copy = Object.freeze({
  ru: { shop: 'Магазин', newLook: 'Новый внешний вид!', neon: 'Неоновая подсветка', smoke: 'Дым из-под колёс', tracks: 'Следы от шин', trackNote: 'Один эффект для всех машин.', smokeNote: 'Один эффект для всех машин.', soon: 'Скоро', selected: 'Выбрано', smokeFailed: 'Не удалось выбрать эффект. Попробуйте ещё раз.', back: 'Назад', neonPreview: 'Предпросмотр', title: 'Расцветки', close: 'Закрыть магазин расцветок', apply: 'Выбрать', choose: 'Расцветки машины', loading: 'Загрузка', failed: 'Не удалось загрузить', base: 'Стандартная', preview: 'Только просмотр' },
  en: { shop: 'Shop', newLook: 'New look!', neon: 'Neon lighting', smoke: 'Tire smoke', tracks: 'Tire tracks', trackNote: 'One effect for every car.', smokeNote: 'One effect for every car.', soon: 'Coming soon', selected: 'Selected', smokeFailed: 'Could not select effect. Please try again.', back: 'Back', neonPreview: 'Preview', title: 'Liveries', close: 'Close livery shop', apply: 'Select', choose: 'Car liveries', loading: 'Loading', failed: 'Could not load', base: 'Standard', preview: 'Preview only' },
});

/**
 * Creates a preview-only shop and appends its dialog to document.body.
 * onPreview(vehicleId, liveryId) is called immediately, including for locked cars.
 * It may return a Promise; throw/reject/return false to report a failed preview.
 * These callbacks validate static artwork; this dialog creates no renderer.
 * Only explicit onApply may change the hangar car. Developer access is opt-in.
 * Neon ownership and purchases are delegated to the host callbacks.
 */
export function createVehicleLiveryShop(doc, {
  language = () => 'ru', canOpen = () => true, button = null,
  autoPreview = false, onApply = () => true,
  canUseLiveries = () => false, getSelectedLiveryId = () => BASE_VEHICLE_LIVERY_ID, getSelectedNeonId = () => null,
  getCosmeticOffer = () => null,
  canUseTracks = () => false, getSelectedTrackId = () => DEFAULT_VEHICLE_TRACK_ID, onTrackApply = () => false,
  canUseSmoke = () => false, getSelectedSmokeId = () => DEFAULT_VEHICLE_SMOKE_ID, onSmokeApply = () => false,
  onPreview = () => true, onNeonPreview = () => true, getNeonOffer = () => null, onNeonApply = () => false, onNeonDisable = () => false, onSectionChange = () => {}, onClose = () => {}, onOpenChange = () => {},
} = {}) {
  let opened = false, disposed = false, closing = false, visible = true, epoch = 0, returnFocus = null;
  let background = [], languageOverride = null, section = 'categories', neonSelected = VEHICLE_NEON_COLORS[0].id, neonToken = 0, neonLoading = false, neonError = false, neonBuying = false, neonPurchaseError = false;
  let smokeSelected = DEFAULT_VEHICLE_SMOKE_ID, smokeApplying = false, smokeApplyError = false;
  let trackSelected = DEFAULT_VEHICLE_TRACK_ID, trackApplying = false, trackApplyError = false, trackToken = 0;
  const appliedTrackId = () => getVehicleTrackStyle(getSelectedTrackId())?.id ?? DEFAULT_VEHICLE_TRACK_ID;
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
  function coinIcon(node,xp=false){
    const icon=doc.createElement('img');icon.src=xp?new URL('./assets/ui-icons/xp.webp',import.meta.url).href:new URL('./assets/ui-icons/money.webp',import.meta.url).href;
    icon.alt=xp?'XP':lang()==='ru'?'Игровая валюта':'Coins';icon.width=24;icon.height=24;node.append(icon);
  }
  function purchaseLabel(node,fallback,offer){
    const purchase=offer&&!offer.owned;
    node.textContent=purchase?`${lang()==='ru'?'Купить':'Buy'} · ${offer.label||(offer.premium?'39 ₽':offer.price.toLocaleString(lang()==='en'?'en-US':'ru-RU'))}`:fallback;
    node.setAttribute('data-purchase',String(!!purchase));
    if(purchase&&!offer.premium)coinIcon(node,offer.xp);
    else if(purchase&&offer.currencyImage){const icon=doc.createElement('img');icon.src=offer.currencyImage;icon.alt='';icon.width=24;icon.height=24;node.append(icon);}
  }
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
  for (const id of ['liveries', 'neon', 'smoke', 'tracks']) {
    const entry = make('button', 'vehicle-shop-category', categories, { type: 'button', 'data-shop-category': id });
    const picture = make('img', '', entry, { alt: '', draggable: 'false', loading: 'lazy', decoding: 'async' });
    const pictureUrl = getVehicleCosmeticCategoryIcon(id);
    const label = make('span', 'vehicle-shop-category-title', entry);
    categoryButtons[id] = { entry, label, picture, pictureUrl };
    listen(entry, 'click', () => setSection(id));
  }
  const smokeSoon = make('span', 'vehicle-smoke-soon', categoryButtons.smoke.entry);
  const trackSoon = make('span', 'vehicle-smoke-soon', categoryButtons.tracks.entry);

  // Every section shares static slides and the same continuous swipe controller.
  // Loading is restricted to the visible center and neighboring slides.
  function createImageCarousel({ parent, items, sectionId, classPrefix, hostId, imageUrl, caption, onSelect }) {
    const slides = [];
    function render(position) {
      for (let index = 0; index < slides.length; index++) {
        const item = slides[index];
        let offset = ((index - position) % slides.length + slides.length) % slides.length;
        if (offset > slides.length / 2) offset -= slides.length;
        const distance = Math.abs(offset), angle = offset * Math.PI / 3;
        const front = Math.max(0, Math.cos(angle)), depth = 1 - front;
        const scale = .32 + .68 * front ** 3;
        const fade = Math.max(0, Math.min(1, (1.15 - distance) / .15));
        item.slide.hidden = distance >= 1.15;
        // Project the front arc of a ring. Side items rise and recede before
        // fading around the edge, leaving room for the incoming center item.
        item.slide.style.left = `${50 + Math.sin(angle) * 37.8}%`;
        item.slide.style.top = `${-depth * 16}%`;
        item.slide.style.transform = `translateX(-50%) scale(${scale}) rotateY(${-offset * 21}deg)`;
        item.slide.style.opacity = String((1 - depth * .5) * fade);
        item.slide.style.zIndex = String(10 - Math.round(depth * 6));
        item.label.style.visibility = distance < .5 ? 'visible' : 'hidden';
        if (opened && section === sectionId && !item.slide.hidden && !item.image.src) {
          const url = imageUrl(item.style);
          if (url) item.image.src = url;
        }
      }
    }
    const carousel = createItemCarousel(doc, { parent, items, onSelect, onPositionChange: render });
    const host = carousel.viewport;
    host.className += ` vehicle-cosmetic-preview-host ${classPrefix}-preview-host`;
    host.setAttribute('id', hostId);
    for (const style of items) {
      const slide = make('div', `vehicle-cosmetic-slide ${classPrefix}-slide`, host, { 'aria-hidden': 'true', 'data-cosmetic-id': style.id });
      const image = make('img', `vehicle-cosmetic-image ${classPrefix}-image`, slide, { alt: '', draggable: 'false', loading: 'lazy', decoding: 'async' });
      const fallback = make('span', `vehicle-cosmetic-image-fallback ${classPrefix}-image-fallback`, slide);
      const label = make('span', 'vehicle-cosmetic-caption', slide);
      fallback.hidden = true;
      listen(image, 'error', () => { image.hidden = true; fallback.hidden = false; label.hidden = true; });
      slides.push({ style, slide, image, fallback, label });
    }
    return { ...carousel, refreshImages() {
      for (const item of slides) item.fallback.textContent = item.label.textContent = caption(item.style);
      render(host.carouselPosition);
    } };
  }
  const smokePanel = make('div', 'vehicle-smoke-panel', panel, { id: 'vehicle-smoke-panel' });
  const smokeCarousel = createImageCarousel({ parent: smokePanel, items: VEHICLE_SMOKE_STYLES, sectionId: 'smoke',
    classPrefix: 'vehicle-smoke', hostId: 'vehicle-smoke-preview', imageUrl: style => getVehicleSmokeIcon(style.id),
    caption: style => style.name[lang()], onSelect: (id, options) => selectSmoke(id, options) });
  const smokeHost = smokeCarousel.viewport;
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
  const trackPanel = make('div', 'vehicle-track-panel', panel, { id: 'vehicle-track-panel' });
  const trackCarousel = createImageCarousel({ parent: trackPanel, items: VEHICLE_TRACK_STYLES, sectionId: 'tracks',
    classPrefix: 'vehicle-track', hostId: 'vehicle-track-preview', imageUrl: style => style.iconUrl,
    caption: style => style.name[lang()], onSelect: (id, options) => selectTrack(id, options) });
  const trackHost = trackCarousel.viewport;
  const trackName = make('p', 'vehicle-track-name', trackPanel, { id: 'vehicle-track-name', role: 'status', 'aria-live': 'polite' });
  const trackNote = make('p', 'vehicle-track-note', trackPanel, { id: 'vehicle-track-note' });
  const trackApply = make('button', modalPart('button', 'vehicle-track-apply'), trackPanel, { id: 'vehicle-track-apply', type: 'button' });
  listen(trackApply, 'click', () => {
    if (disposed || !opened || section !== 'tracks' || !canOpen() || !canUseTracks() || trackApply.disabled || trackApplying || trackSelected === appliedTrackId()) return;
    const id = trackSelected, token = ++trackToken, openEpoch = epoch;
    trackApplying = true; trackApplyError = false; refresh();
    const settle = success => {
      if (disposed || !opened || section !== 'tracks' || epoch !== openEpoch || token !== trackToken) return;
      trackApplying = false; trackApplyError = !success; refresh();
    };
    try {
      const result = onTrackApply(id);
      if (result && typeof result.then === 'function') Promise.resolve(result).then(value => settle(value !== false), () => settle(false));
      else settle(result !== false);
    } catch { settle(false); }
  });
  const neonPanel = make('div', 'vehicle-neon-panel', panel, { id: 'vehicle-neon-panel' });
  const neonCarousel = createImageCarousel({ parent: neonPanel, items: VEHICLE_NEON_COLORS, sectionId: 'neon',
    classPrefix: 'vehicle-neon', hostId: 'vehicle-neon-preview', imageUrl: style => getVehicleNeonIcon(style.id),
    caption: style => style.name[lang()], onSelect: (id, options) => selectNeon(id, options) });
  const neonHost = neonCarousel.viewport;
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
    const canChoose = !!canUseLiveries(), equipped = canChoose && getSelectedLiveryId(row.vehicle.id) === row.selected;
    row.root.setAttribute('aria-label', row.vehicle.name[lang()]);
    row.root.setAttribute('aria-busy', String(row.loading));
    row.root.setAttribute('data-active', String(row.active));
    row.status.textContent = row.loading ? text.loading : row.error ? text.failed : equipped ? text.selected : canChoose ? text.apply : row.selected === BASE_VEHICLE_LIVERY_ID ? text.base : text.preview;
    row.status.setAttribute('data-state', row.error ? 'error' : row.loading ? 'loading' : selected.owned ? 'owned' : 'preview');
    const caption = `${row.vehicle.name[lang()]} · ${vehicleLiveryName(row.vehicle.id, row.selected, lang())}`;
    row.previewHost.setAttribute('aria-label', caption);
    row.carousel.update(row.selected);
    row.carousel.setLabels({ title: `${text.choose} ${row.vehicle.name[lang()]}` });
    row.carousel.refreshImages();
    const offer=getCosmeticOffer('livery',row.selected,row.vehicle.id);
    row.apply.disabled = !!offer?.disabled || (!canChoose && row.selected !== BASE_VEHICLE_LIVERY_ID) || row.loading || row.error || row.applying;
    row.apply.setAttribute('data-selected', String(equipped));
    purchaseLabel(row.apply,equipped ? text.selected : text.apply,offer);
    row.apply.setAttribute('aria-label', `${row.apply.textContent}: ${caption}`);
  }

  function refresh() {
    if (disposed) return;
    const text = words();
    menu.setAttribute('lang', lang());
    title.textContent = section === 'categories' ? text.shop : section === 'neon' ? text.neon : section === 'smoke' ? text.smoke : section === 'tracks' ? text.tracks : text.title;
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
    const tracksAllowed = !!canUseTracks();
    categoryButtons.tracks.label.textContent = text.tracks;
    categoryButtons.tracks.entry.disabled = !tracksAllowed;
    categoryButtons.tracks.entry.setAttribute('aria-disabled', String(!tracksAllowed));
    categoryButtons.tracks.entry.setAttribute('aria-label', tracksAllowed ? text.tracks : `${text.tracks} · ${text.soon}`);
    trackSoon.textContent = text.soon; trackSoon.hidden = tracksAllowed;
    categories.hidden = section !== 'categories';
    scroll.hidden = section !== 'liveries';
    neonPanel.hidden = section !== 'neon';
    smokePanel.hidden = section !== 'smoke';
    trackPanel.hidden = section !== 'tracks';
    const smokeStyle = getVehicleSmokeStyle(smokeSelected);
    smokeName.textContent = smokeStyle.name[lang()];
    smokeNote.textContent = smokeApplyError ? text.smokeFailed : text.smokeNote;
    const smokeIsSelected = smokeSelected === appliedSmokeId();
    const smokeOffer=getCosmeticOffer('smoke',smokeSelected);
    smokeApply.disabled = !!smokeOffer?.disabled || !smokeAllowed || smokeApplying || smokeIsSelected;
    smokeApply.setAttribute('data-selected', String(smokeIsSelected));
    purchaseLabel(smokeApply,smokeIsSelected ? text.selected : text.apply,smokeOffer);
    smokeApply.setAttribute('aria-label', `${smokeApply.textContent}: ${smokeStyle.name[lang()]}`);
    smokeHost.setAttribute('aria-label', `${text.smoke}: ${smokeStyle.name[lang()]}`);
    smokeCarousel.setLabels({ title: text.smoke });
    smokeCarousel.refreshImages();
    const trackStyle = getVehicleTrackStyle(trackSelected), trackIsSelected = trackSelected === appliedTrackId();
    trackName.textContent = trackStyle.name[lang()];
    trackNote.textContent = trackApplyError ? text.smokeFailed : text.trackNote;
    const trackOffer=getCosmeticOffer('tracks',trackSelected);
    trackApply.disabled = !!trackOffer?.disabled || !tracksAllowed || trackApplying || trackIsSelected;
    trackApply.setAttribute('data-selected', String(trackIsSelected));
    purchaseLabel(trackApply,trackApplying ? text.loading : trackIsSelected ? text.selected : text.apply,trackApplying?null:trackOffer);
    trackApply.setAttribute('aria-label', `${trackApply.textContent}: ${trackStyle.name[lang()]}`);
    trackHost.setAttribute('aria-label', `${text.tracks}: ${trackStyle.name[lang()]}`);
    trackHost.setAttribute('aria-busy', String(trackApplying));
    trackCarousel.setLabels({ title: text.tracks });
    trackCarousel.refreshImages();
    const neonColor = VEHICLE_NEON_COLORS.find(item => item.id === neonSelected);
    neonLabel.textContent = neonLoading ? text.loading : neonError ? text.failed : neonColor.name[lang()];
    const offer=section === 'neon' ? getNeonOffer(neonSelected) : null;
    neonNote.textContent = neonPurchaseError ? (lang()==='ru'?'Покупка не завершена. Попробуйте ещё раз.':'Purchase not completed. Please try again.') : offer?.sessionOnly ? (lang()==='ru'?'Один цвет для всех машин. Выбор на время сессии.':'One color for every car. Selected for this session.') : offer ? (lang()==='ru'?'Один цвет для всех машин. Покупка навсегда.':'One color for every car. Permanent unlock.') : text.neonPreview;
    neonApply.hidden=!offer;neonDisable.hidden=!offer;
    neonApply.disabled=!offer||offer.disabled||neonBuying||neonLoading||neonError||offer.selected;
    neonApply.setAttribute('data-selected', String(!!offer?.selected));
    neonApply.setAttribute('data-purchase', String(!!offer && !offer.owned));
    neonApply.textContent=neonBuying?text.loading:offer?.selected?(lang()==='ru'?'Выбрано':'Selected'):offer?.owned?text.apply:`${lang()==='ru'?'Купить':'Buy'} · ${offer?.label||'—'}`;
    if(offer?.coins&&!offer.owned&&!neonBuying)coinIcon(neonApply);
    if(offer?.currencyImage&&!offer.owned&&!neonBuying){const icon=doc.createElement('img');icon.src=offer.currencyImage;icon.alt='';icon.width=20;icon.height=20;neonApply.append(icon);}
    neonDisable.textContent=lang()==='ru'?'Без подсветки':'No underglow';neonDisable.disabled=neonBuying;
    neonHost.setAttribute('aria-label', `${text.neon}: ${neonColor.name[lang()]}`);
    neonHost.setAttribute('aria-busy', String(neonLoading));
    neonCarousel.setLabels({ title: text.neon });
    neonCarousel.refreshImages();
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
    row.carousel = createImageCarousel({ parent: root, items: vehicle.variants, sectionId: 'liveries',
      classPrefix: 'vehicle-livery', hostId: `vehicle-livery-preview-${vehicle.id}`,
      imageUrl: style => getVehicleLiveryIcon(vehicle.id, style.id),
      caption: style => `${vehicle.name[lang()]} · ${vehicleLiveryName(vehicle.id, style.id, lang())}`,
      onSelect: (id, options) => select(vehicle.id, id, options) });
    row.previewHost = row.carousel.viewport;
    row.previewHost.className += ' vehicle-livery-preview-host';
    row.previewHost.setAttribute('id', `vehicle-livery-preview-${vehicle.id}`);
    row.apply = make('button', modalPart('button', 'vehicle-livery-apply'), root, { type: 'button', 'data-apply-vehicle': vehicle.id });
    listen(row.apply, 'click', () => {
      if (!opened || section !== 'liveries' || row.apply.disabled || row.loading || row.error || row.applying || (!canUseLiveries() && row.selected !== BASE_VEHICLE_LIVERY_ID) || !canOpen()) return;
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

  function selectNeon(id, { focus = false } = {}) {
    if (disposed || !opened || section !== 'neon' || !canOpen() || !VEHICLE_NEON_COLORS.some(item => item.id === id)) return false;
    const token = ++neonToken, openEpoch = epoch;
    neonSelected = id; neonLoading = true; neonError = false; neonPurchaseError = false;
    neonCarousel.update(id, { focus }); refresh();
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
  function selectTrack(id, { focus = false } = {}) {
    if (disposed || !opened || section !== 'tracks' || !canOpen() || !canUseTracks() || !getVehicleTrackStyle(id)) return false;
    trackSelected = id; trackApplyError = false;
    trackCarousel.update(id, { focus }); refresh();
    return true;
  }
  function setSection(next) {
    if (!opened || disposed || !canOpen() || !['categories', 'liveries', 'neon', 'smoke', 'tracks'].includes(next) || (next === 'smoke' && !canUseSmoke()) || (next === 'tracks' && !canUseTracks())) return false;
    if (section === next) return true;
    epoch++; neonToken++; trackToken++; trackApplying = false;
    section = next;
    neonCarousel.resetGesture(); neonCarousel.setEnabled(next === 'neon');
    smokeCarousel.setEnabled(next === 'smoke');
    trackCarousel.setEnabled(next === 'tracks');
    if (next === 'smoke') {
      smokeSelected = appliedSmokeId(); smokeApplyError = false;
      smokeCarousel.update(smokeSelected, { immediate: true });
    }
    if (next === 'tracks') {
      trackSelected = appliedTrackId(); trackApplyError = false;
      trackCarousel.update(trackSelected, { immediate: true });
    }
    resetRows();
    for (const row of rows.values()) row.carousel.setEnabled(next === 'liveries');
    onSectionChange(next);
    scroll.scrollTop = 0; refresh();
    if (next === 'liveries' && autoPreview) for (const row of rows.values()) select(row.vehicle.id, row.selected);
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
      const selected = canUseLiveries() ? getSelectedLiveryId(row.vehicle.id) : BASE_VEHICLE_LIVERY_ID;
      const applied = getVehicleLivery(row.vehicle.id, selected) ? selected : BASE_VEHICLE_LIVERY_ID;
      row.selected = row.applied = applied;
      row.loading = row.error = row.active = row.applying = false; row.applyResult = null;
      row.carousel.update(applied, { immediate: true });
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
    trackToken++; trackApplying = false; trackCarousel.setEnabled(false);
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
    const appliedNeon = getSelectedNeonId();
    section = 'categories'; neonSelected = VEHICLE_NEON_COLORS.some(item => item.id === appliedNeon) ? appliedNeon : VEHICLE_NEON_COLORS[0].id; neonLoading = neonError = false;
    neonCarousel.update(neonSelected, { immediate: true }); neonCarousel.setEnabled(false);
    smokeSelected = appliedSmokeId(); smokeApplyError = false;
    smokeCarousel.update(smokeSelected, { immediate: true }); smokeCarousel.setEnabled(false);
    trackSelected = appliedTrackId(); trackApplyError = trackApplying = false; trackToken++;
    trackCarousel.update(trackSelected, { immediate: true }); trackCarousel.setEnabled(false);
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
  const focusable = () => [closeButton, ...(section === 'categories' ? Object.values(categoryButtons).map(item => item.entry).filter(node => !node.disabled&&!node.hidden) : section === 'tracks' ? [backButton, trackHost, ...[trackApply].filter(node => !node.disabled)] : section === 'smoke' ? [backButton, smokeHost, ...[smokeApply].filter(node => !node.disabled)] : section === 'neon' ? [backButton, neonHost, ...[neonApply,neonDisable].filter(node=>!node.hidden&&!node.disabled)] : [backButton, ...[...rows.values()].flatMap(row => [row.previewHost, row.apply].filter(node => !node.disabled))])];
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
  listen(doc.defaultView || doc, 'blur', () => { for (const row of rows.values()) resetGesture(row); neonCarousel.resetGesture(); smokeCarousel.resetGesture(); trackCarousel.resetGesture(); });
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
      trackCarousel.destroy();
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
    getTrackPreviewHost: () => trackHost, previewTrack: selectTrack, getTrackSelection: () => trackSelected,
    getSmokePreviewHost: () => smokeHost, previewSmoke: selectSmoke, getSmokeSelection: () => smokeSelected,
    getPreviewHost: vehicleId => rows.get(vehicleId || VEHICLE_LIVERY_CATALOG[0].id)?.previewHost,
    setLanguage(next) { languageOverride = next === 'en' ? 'en' : 'ru'; refresh(); return lang(); },
    preview: select,
    getSelection: vehicleId => rows.get(vehicleId)?.selected ?? null,
    destroy, dispose: destroy,
  };
}
