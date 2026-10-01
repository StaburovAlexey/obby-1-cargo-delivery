/** Settings UI only. The application owns audio, translation, persistence and
 * pause/exclusivity. Programmatic setters never echo user-change callbacks. */
export function createSettingsMenu(doc, {
  onOpenChange = () => {}, onVolumeChange = () => {}, onLanguageChange = () => {},
  volume = 1, language = 'ru',
} = {}) {
  const el = id => doc.getElementById(id);
  const menu = el('settings-menu'), panel = el('settings-panel');
  const button = el('settings-button'), closeButton = el('settings-close');
  const slider = el('settings-volume'), value = el('settings-volume-value');
  const select = el('settings-language'), scroll = el('settings-scroll');
  if (![menu, panel, button, closeButton, slider, value, select].every(Boolean)) {
    throw new Error('Settings menu markup is missing');
  }
  let opened = false, disposed = false, returnFocus = null;
  let currentVolume = 1, currentLanguage = 'ru', background = [];
  const listeners = [];
  const listen = (node, type, callback) => {
    node.addEventListener(type, callback);
    listeners.push([node, type, callback]);
  };
  const contains = (parent, node) => {
    if (parent.contains) return parent.contains(node);
    for (let current = node; current; current = current.parentNode || current.parent) {
      if (current === parent) return true;
    }
    return false;
  };
  const renderOpen = () => {
    menu.hidden = !opened;
    button.setAttribute('aria-expanded', String(opened));
    doc.body.classList.toggle('settings-menu-open', opened);
  };
  const releaseBackground = () => {
    for (const [node, inert] of background) node.inert = inert;
    background = [];
  };
  const setVolume = next => {
    const number = Number(next);
    if (!Number.isFinite(number)) return currentVolume;
    currentVolume = Math.max(0, Math.min(1, number));
    const percent = Math.round(currentVolume * 100);
    slider.value = String(percent);
    value.textContent = `${percent}%`;
    slider.setAttribute('aria-valuetext', `${percent}%`);
    return currentVolume;
  };
  const setLanguage = next => {
    currentLanguage = next === 'en' ? 'en' : 'ru';
    select.value = currentLanguage;
    return currentLanguage;
  };
  const open = () => {
    if (disposed || opened) return;
    returnFocus = button;
    opened = true;
    renderOpen();
    // Close other application modals before capturing their restored inert state.
    onOpenChange(true);
    if (!opened || disposed) return;
    background = Array.from(doc.body.children || [])
      .filter(node => node !== menu && !contains(node, menu))
      .map(node => [node, node.inert]);
    for (const [node] of background) node.inert = true;
    if (scroll) scroll.scrollTop = 0;
    closeButton.focus?.();
  };
  const close = ({restoreFocus = true} = {}) => {
    if (!opened) return;
    opened = false;
    releaseBackground();
    renderOpen();
    const target = returnFocus;
    returnFocus = null;
    onOpenChange(false);
    if (restoreFocus && !opened) {
      const canFocus = node => node && !node.hidden && !node.disabled && !node.inert && node.isConnected !== false;
      if (canFocus(target)) target.focus?.();
      else if (canFocus(button)) button.focus?.();
    }
  };
  const focusable = () => {
    const controls = Array.from(panel.querySelectorAll?.('button, input, select, a[href], [tabindex="0"]') || []);
    // The game's renderer-free fixture only resolves IDs, without a selector engine.
    return (controls.length ? controls : [closeButton, slider, select])
      .filter(node => !node.hidden && !node.disabled && !node.inert && node.tabIndex !== -1);
  };
  const onKeyDown = event => {
    if (!opened) return;
    event.stopPropagation();
    if (event.key === 'Escape' || event.code === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      const controls = focusable(), first = controls[0] || closeButton, last = controls.at(-1) || first;
      const active = doc.activeElement;
      if (!controls.includes(active) || (!event.shiftKey && active === last) || (event.shiftKey && active === first)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus?.();
      }
    }
    // Preserve native range/select keyboard behavior: only Escape/Tab are canceled.
  };
  // In-panel navigation changes only this scroll container, never the game or
  // page position. Keep focus in its keyboard-scrollable region after jumping.
  for (const [name, targetId] of [['play', 'settings-how-to-play'], ['icons', 'settings-icon-guide'], ['credits', 'settings-credits']]) {
    const jump = el(`settings-jump-${name}`), target = el(targetId);
    if (!jump || !target || !scroll) continue;
    listen(jump, 'click', () => {
      if (!opened || disposed) return;
      const bounds = target.getBoundingClientRect?.(), viewport = scroll.getBoundingClientRect?.();
      const top = bounds && viewport ? scroll.scrollTop + bounds.top - viewport.top : target.offsetTop || 0;
      scroll.scrollTop = Math.max(0, top);
      scroll.focus?.({preventScroll: true});
    });
  }
  listen(button, 'click', event => { event.stopPropagation(); if (opened) close(); else open(); });
  listen(closeButton, 'click', () => close());
  listen(menu, 'click', event => { if (opened && event.target === menu) close(); });
  listen(slider, 'input', () => {
    if (!opened || disposed) return;
    const next = Number(slider.value) / 100;
    if (!Number.isFinite(next)) return;
    const previous = currentVolume;
    setVolume(next);
    if (currentVolume !== previous) onVolumeChange(currentVolume);
  });
  listen(select, 'change', () => {
    if (!opened || disposed || !['ru', 'en'].includes(select.value)) return;
    const previous = currentLanguage;
    setLanguage(select.value);
    if (currentLanguage !== previous) onLanguageChange(currentLanguage);
  });
  listen(menu, 'keydown', onKeyDown);
  listen(doc, 'keydown', onKeyDown);
  listen(doc, 'focusin', event => {
    if (opened && !contains(menu, event.target)) closeButton.focus?.();
  });
  for (const node of [menu, button]) {
    for (const type of ['keyup', 'click', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'touchstart', 'touchmove', 'touchend', 'wheel']) {
      listen(node, type, event => event.stopPropagation());
    }
  }
  listen(button, 'keydown', event => event.stopPropagation());
  setVolume(volume);
  setLanguage(language);
  renderOpen();
  return {
    open, close, isOpen: () => opened, setVolume, setLanguage,
    dispose() {
      if (disposed) return;
      disposed = true;
      close({restoreFocus: false});
      for (const [node, type, callback] of listeners) node.removeEventListener(type, callback);
      listeners.length = 0;
      releaseBackground();
    },
  };
}
