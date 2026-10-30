

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSettingsMenu} from '../dist/settings-menu.js';
import {createInputDom} from './fixtures/vehicle-input-dom.mjs';
import {CHARACTER_CATALOG} from '../dist/character-catalog.js';

const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../dist/settings-menu.css', import.meta.url), 'utf8');
const menuHtml = html.slice(html.indexOf('    <div id="settings-menu"'), html.indexOf('    <button id="vehicle-funds-button"'));
assert.match(menuHtml, /^    <div id="settings-menu"[^>]*\bhidden>/);
assert.match(menuHtml, /class="game-modal"/);
assert.match(html, /href="\.\/settings-menu\.css"/);
const allIds = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(allIds).size, allIds.length, 'No duplicate IDs');
assert.match(html, /id="career-mission-button"[^]*?<\/button>\s*<button id="settings-button"/);
const buttonTag = html.match(/<button id="settings-button"[^]*?<\/button>/)[0];
for (const attr of ['class="hud-menu-button"', 'aria-label="Настройки"', 'aria-haspopup="dialog"', 'aria-controls="settings-panel"', 'aria-expanded="false"']) assert.ok(buttonTag.includes(attr));
assert.ok(!/^<button[^>]*\bhidden\b/.test(buttonTag), 'Settings is visible in normal and developer modes');
assert.equal(buttonTag.replace(/<[^>]+>/g, '').trim(), '', 'HUD button is icon-only');
const loaderHtml = html.slice(html.indexOf('<div id="loading"'), html.indexOf('<section id="error"'));
assert.match(loaderHtml, /Загрузка мира и сервера/);
assert.doesNotMatch(loaderHtml, /<a\b|CC BY|Kenney|SharkyStudios/);
assert.match(menuHtml, /role="dialog" aria-modal="true" aria-labelledby="settings-title"/);
assert.match(menuHtml, /id="settings-volume" type="range" min="0" max="100" step="1"/);
assert.match(css, /#settings-menu\{[^}]*z-index:110[^}]*place-items:center/);
assert.match(css, /\.settings-scroll\{[^}]*overflow-y:auto[^}]*min-height:0/);
assert.match(css, /100dvh - max\(12px,env\(safe-area-inset-top\)\) - max\(12px,env\(safe-area-inset-bottom\)\)/);

// Attribution and license URLs come from the bundled credits, not guesses.
for (const path of ['audio/CREDITS.txt', 'audio/Kenney-License.txt', 'vehicles/cosmo/License.txt', 'vehicles/cosmo/README.md', 'vehicles/bmw/License.txt']) {
  assert.ok(menuHtml.includes(`href="./assets/${path}"`), `Linked attribution: ${path}`);
  assert.ok(fs.existsSync(new URL(`../dist/assets/${path}`, import.meta.url)));
}
const audioCredits = fs.readFileSync(new URL('../dist/assets/audio/CREDITS.txt', import.meta.url), 'utf8');
for (const name of ['qubodup', 'audible-edge (Tom Haigh)', 'Kenney']) assert.ok(menuHtml.includes(name));
for (const url of audioCredits.match(/https:\/\/[^\s]+/g)) assert.ok(menuHtml.includes(url), `Actual audio source/license link ${url}`);
const bmwCredits = fs.readFileSync(new URL('../dist/assets/vehicles/bmw/License.txt', import.meta.url), 'utf8');
for (const name of ['Low Poly BMW G80 M3', 'SharkyStudios', 'https://sketchfab.com/sharkycat109', 'https://creativecommons.org/licenses/by/4.0/']) {
  assert.ok(bmwCredits.includes(name)); assert.ok(menuHtml.includes(name));
}
const cosmoManifest = JSON.parse(fs.readFileSync(new URL('../dist/assets/vehicles/cosmo/manifest.json', import.meta.url), 'utf8'));
assert.equal(cosmoManifest.license, 'CC0-1.0');
for (const file of fs.readdirSync(new URL('../dist/assets/vehicles/cosmo/', import.meta.url)).filter(file => file.endsWith('.glb'))) assert.ok(menuHtml.includes(file.replace('.glb', '')));
assert.equal(CHARACTER_CATALOG.length, 17);
assert.ok(!menuHtml.includes('settings-characters-readme'));
assert.ok(!menuHtml.includes('Лицензия на повторное использование'));
for (const tag of menuHtml.match(/<a\b[^>]*>/g)) assert.match(tag, /target="_blank" rel="noopener noreferrer"/);

function fixture(options = {}) {
  const dom = createInputDom(), Element = dom.root.constructor;
  const {doc, win} = dom;
  doc.parent = win;
  doc.body = new Element(); doc.body.ownerDocument = doc; doc.body.parent = doc;
  const ids = new Map();
  const make = (tag, attrs = '') => {
    const node = new Element(); node.tagName = tag.toUpperCase(); node.ownerDocument = doc;
    for (const [, name, quoted, bare] of attrs.matchAll(/([\w:-]+)(?:="([^"]*)"|=([^\s]+))?/g)) {
      const value = quoted ?? bare ?? '';
      node.setAttribute(name, value);
      if (name === 'id') {node.id = value; ids.set(value, node);}
      if (name === 'value') node.value = value;
      if (name === 'hidden') node.hidden = true;
      if (name === 'tabindex') node.tabIndex = Number(value);
    }
    node.focus = () => {doc.activeElement = node;};
    node.contains = other => {for (let current = other; current; current = current.parent) if (current === node) return true; return false;};
    node.querySelectorAll = () => node.all().filter(child => ['BUTTON', 'INPUT', 'SELECT'].includes(child.tagName) || (child.tagName === 'A' && child.getAttribute('href')) || child.tabIndex === 0);
    return node;
  };
  const header = doc.body.append(make('header'));
  const button = header.append(make('button', 'id="settings-button"'));
  const other = doc.body.append(make('main', 'id="gameplay"')); other.inert = false;
  const preInert = doc.body.append(make('aside', 'id="pre-inert"')); preInert.inert = true;
  const stack = [doc.body];
  for (const match of menuHtml.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*)>/g)) {
    const [, closing, tag, attrs] = match;
    if (closing) {stack.pop(); continue;}
    const node = stack.at(-1).append(make(tag, attrs));
    if (!['input', 'br', 'img', 'hr', 'meta', 'link'].includes(tag) && !attrs.endsWith('/')) stack.push(node);
  }
  assert.equal(stack.length, 1, 'Balanced static menu HTML');
  doc.getElementById = id => ids.get(id) || null;
  const callbacks = {open: [], volume: [], language: []};
  const menu = createSettingsMenu(doc, {
    onOpenChange: next => callbacks.open.push(next),
    onVolumeChange: next => callbacks.volume.push(next),
    onLanguageChange: next => callbacks.language.push(next),
    ...options,
  });
  return {doc, win, ids, menu, callbacks, button, header, other, preInert};
}

{
  const f = fixture({volume: .42, language: 'en'}), {ids, menu, callbacks, doc} = f;
  assert.equal(menu.isOpen(), false); assert.equal(ids.get('settings-menu').hidden, true);
  assert.equal(ids.get('settings-volume').value, '42'); assert.equal(ids.get('settings-volume-value').textContent, '42%');
  assert.equal(ids.get('settings-volume').getAttribute('aria-valuetext'), '42%');
  assert.equal(ids.get('settings-language').value, 'en');
  assert.deepEqual(callbacks, {open: [], volume: [], language: []}, 'Constructor must not invoke callbacks before app initialization');
  f.button.dispatch('click');
  assert.equal(menu.isOpen(), true); assert.equal(ids.get('settings-menu').hidden, false);
  assert.equal(f.button.getAttribute('aria-expanded'), 'true'); assert.equal(doc.body.classList.contains('settings-menu-open'), true);
  assert.equal(doc.activeElement, ids.get('settings-close'));
  assert.equal(f.header.inert, true); assert.equal(f.other.inert, true); assert.equal(f.preInert.inert, true);
  assert.equal(ids.get('settings-menu').inert, undefined);
  menu.open(); assert.deepEqual(callbacks.open, [true], 'Repeated open does not resnapshot inert or duplicate notifications');
  const slider = ids.get('settings-volume');
  slider.value = '0'; slider.dispatch('input'); assert.deepEqual(callbacks.volume, [0]);
  slider.dispatch('input'); assert.deepEqual(callbacks.volume, [0]);
  slider.value = '73'; slider.dispatch('input'); assert.deepEqual(callbacks.volume, [0, .73]);
  slider.value = 'invalid'; slider.dispatch('input'); assert.deepEqual(callbacks.volume, [0, .73]);
  menu.setVolume(.21); assert.equal(slider.value, '21'); assert.deepEqual(callbacks.volume, [0, .73]);
  assert.equal(menu.setVolume(-5), 0); assert.equal(menu.setVolume(5), 1); assert.equal(menu.setVolume(NaN), 1);
  const select = ids.get('settings-language');
  select.value = 'ru'; select.dispatch('change'); assert.deepEqual(callbacks.language, ['ru']);
  select.value = 'fr'; select.dispatch('change'); assert.deepEqual(callbacks.language, ['ru']);
  menu.setLanguage('en'); assert.equal(select.value, 'en'); assert.deepEqual(callbacks.language, ['ru']);
  assert.equal(menu.setLanguage('bad'), 'ru');

  const first = ids.get('settings-close'), last = ids.get('settings-panel').querySelectorAll().at(-1);
  first.focus(); assert.equal(first.dispatch('keydown', {key: 'Tab', shiftKey: true}).defaultPrevented, true); assert.equal(doc.activeElement, last);
  last.dispatch('keydown', {key: 'Tab'}); assert.equal(doc.activeElement, first);
  slider.focus(); assert.equal(slider.dispatch('keydown', {key: 'Tab'}).defaultPrevented, false, 'Native interior tab order');
  assert.equal(slider.dispatch('keydown', {key: 'ArrowRight'}).defaultPrevented, false, 'Native slider keyboard controls retained');
  assert.equal(select.dispatch('keydown', {key: 'ArrowDown'}).defaultPrevented, false, 'Native language controls retained');
  f.other.focus(); f.other.dispatch('focusin'); assert.equal(doc.activeElement, first, 'Focus cannot leave open modal');
  let escaped = 0;
  for (const type of ['keydown', 'keyup', 'click', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'touchstart', 'touchmove', 'touchend', 'wheel']) {
    f.win.addEventListener(type, () => escaped++);
    slider.dispatch(type, {key: 'w', code: 'KeyW'});
  }
  assert.equal(escaped, 0, 'Modal events never reach gameplay handlers');
  ids.get('settings-panel').dispatch('click'); assert.equal(menu.isOpen(), true, 'Inner clicks do not dismiss');
  slider.dispatch('keydown', {key: 'Escape'}); assert.equal(menu.isOpen(), false);
  assert.equal(doc.activeElement, f.button); assert.equal(f.other.inert, false); assert.equal(f.preInert.inert, true);
  assert.deepEqual(callbacks.open, [true, false]);
  menu.close(); assert.deepEqual(callbacks.open, [true, false]);
  slider.value = '90'; slider.dispatch('input'); select.value = 'en'; select.dispatch('change');
  assert.deepEqual(callbacks.volume, [0, .73]); assert.deepEqual(callbacks.language, ['ru'], 'Closed controls cannot mutate settings');
  menu.open(); ids.get('settings-menu').dispatch('click'); assert.equal(menu.isOpen(), false, 'Backdrop dismisses');
  menu.open(); ids.get('settings-close').dispatch('click'); assert.equal(menu.isOpen(), false, 'Visible close dismisses');
  for (let i = 0; i < 8; i++) {menu.open(); menu.close();}
  assert.equal(f.other.inert, false); assert.equal(f.preInert.inert, true);
  menu.open(); const count = callbacks.open.length; menu.dispose();
  assert.equal(menu.isOpen(), false); assert.equal(ids.get('settings-menu').hidden, true);
  assert.equal(f.other.inert, false); assert.equal(f.preInert.inert, true);
  assert.equal(callbacks.open.length, count + 1);
  f.button.dispatch('click'); menu.open(); menu.dispose();
  assert.equal(menu.isOpen(), false); assert.equal(callbacks.open.length, count + 1);
  assert.equal([...doc.listeners.values()].reduce((n, handlers) => n + handlers.size, 0), 0, 'Document listeners removed on dispose');
}


{
  let f;
  f = fixture({onOpenChange(open) {if (open) f.other.inert = false;}});
  f.other.inert = true;
  f.menu.open(); assert.equal(f.other.inert, true);
  f.menu.close(); assert.equal(f.other.inert, false);
  f.menu.dispose();
}

{
  let f;
  f = fixture({onOpenChange(open) {if (open) f.menu.close({restoreFocus: false});}});
  f.menu.open(); assert.equal(f.menu.isOpen(), false); assert.equal(f.other.inert, false);
  f.menu.dispose();
}


{
  const f = fixture(), scroll = f.ids.get('settings-scroll');
  for(const id of ['settings-how-to-play','settings-icon-guide','settings-jump-play','settings-jump-icons','settings-jump-credits'])assert.equal(f.ids.has(id),false);
  f.menu.open();scroll.scrollTop=170;
  assert.equal(scroll.dispatch('keydown',{key:'ArrowDown'}).defaultPrevented,false);
  scroll.dispatch('keydown',{key:'Escape'});assert.equal(f.menu.isOpen(),false);
  f.menu.open(); assert.equal(scroll.scrollTop, 0, 'Reopening starts at volume and language');
  f.menu.dispose();
}
console.log('PASS settings: markup/credits, callback contracts, volume/language controls, inert/focus/Escape, input isolation, repeated flows and disposal. CPU/mock DOM only.');
