

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createLocalization, translateGameText} from '../dist/localization.js';
import {updateProgressionHud, upgradeValuePresentation} from '../dist/progression-hud.js';
import {createRetentionUi, careerNumber} from '../dist/retention-ui.js';
import {UPGRADE_STATS, getUpgradeOffer} from '../dist/vehicle-upgrades.js';
import {CAREER_MISSIONS} from '../dist/career-missions.js';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';
import {CHARACTER_CATALOG} from '../dist/character-catalog.js';
import {createInputDom} from './fixtures/vehicle-input-dom.mjs';

let count = 0;
const test = async (name, fn) => { await fn(); count++; console.log('PASS ' + name); };
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
class Node {
  constructor(doc, type, tag = '') {
    this.ownerDocument = doc; this.nodeType = type; this.tagName = tag.toUpperCase();
    this.parentNode = null; this.childNodes = []; this.attrs = new Map(); this.listeners = new Map();
    this._value = ''; this.hidden = false; this.inert = false; this.disabled = false;
    const classes = new Set(); this.classList = {add: (...n) => n.forEach(x => classes.add(x)), remove: (...n) => n.forEach(x => classes.delete(x)), toggle: (n, value) => { const on = value ?? !classes.has(n); on ? classes.add(n) : classes.delete(n); return on; }};
    this.style = {setProperty() {}}; this.dataset = {};
  }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get id() { return this.getAttribute('id'); }
  get nodeValue() { return this._value; }
  set nodeValue(value) { this._value = String(value); this.ownerDocument.record({type: 'characterData', target: this}); }
  get textContent() { return this.nodeType === 3 ? this.nodeValue : this.childNodes.map(n => n.textContent).join(''); }
  set textContent(value) {
    if (this.nodeType === 3) { this.nodeValue = value; return; }
    const removedNodes = [...this.childNodes]; removedNodes.forEach(n => n.parentNode = null); this.childNodes = [];
    const addedNodes = [];
    if (String(value)) { const node = this.ownerDocument.createTextNode(value); node.parentNode = this; this.childNodes.push(node); addedNodes.push(node); }
    this.ownerDocument.record({type: 'childList', target: this, addedNodes, removedNodes});
  }
  get isConnected() { return this.ownerDocument.documentElement?.contains(this) ?? false; }
  contains(other) { for (let n = other; n; n = n.parentNode) if (n === this) return true; return false; }
  appendChild(node) { if (node.parentNode) node.parentNode.childNodes = node.parentNode.childNodes.filter(n => n !== node); node.parentNode = this; this.childNodes.push(node); this.ownerDocument.record({type: 'childList', target: this, addedNodes: [node], removedNodes: []}); return node; }
  append(...nodes) { nodes.forEach(n => this.appendChild(typeof n === 'string' ? this.ownerDocument.createTextNode(n) : n)); }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  hasAttribute(name) { return this.attrs.has(name); }
  setAttribute(name, value) { this.attrs.set(name, String(value)); this.ownerDocument.record({type: 'attributes', target: this, attributeName: name}); }
  removeAttribute(name) { this.attrs.delete(name); this.ownerDocument.record({type: 'attributes', target: this, attributeName: name}); }
  addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(callback); }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  focus() { this.ownerDocument.activeElement = this; }
}
function fixture(html = '') {
  const observers = new Set(); let deliveries = 0;
  const doc = {
    record(record) {
      for (const observer of observers) {
        const options = observer.options;
        if (!observer.root.contains(record.target) || !options[record.type] || record.type === 'attributes' && !options.attributeFilter.includes(record.attributeName)) continue;
        observer.records.push(record);
        if (!observer.scheduled) { observer.scheduled = true; queueMicrotask(() => { observer.scheduled = false; const records = observer.takeRecords(); if (records.length) { deliveries++; observer.callback(records); } }); }
      }
    },
    createElement: tag => new Node(doc, 1, tag),
    createTextNode: text => { const n = new Node(doc, 3); n._value = String(text); return n; },
    getElementById(id) { const walk = n => n.id === id ? n : n.childNodes.map(walk).find(Boolean); return walk(doc.documentElement) || null; },
    addEventListener() {}, removeEventListener() {},
  };
  doc.defaultView = {MutationObserver: class {
    constructor(callback) { this.callback = callback; this.records = []; }
    observe(root, options) { this.root = root; this.options = options; observers.add(this); }
    disconnect() { observers.delete(this); this.records = []; }
    takeRecords() { const records = this.records; this.records = []; return records; }
  }};
  doc.documentElement = doc.createElement('html'); doc.documentElement.lang = 'ru';
  if (html) {
    const stack = [doc.documentElement], voids = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
    const source = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    for (const match of source.matchAll(/<([^>]+)>|([^<]+)/g)) {
      if (match[2]) { stack.at(-1).appendChild(doc.createTextNode(match[2])); continue; }
      const tag = match[1]; if (tag.startsWith('!') || /^\/?html\b/i.test(tag)) continue;
      if (tag.startsWith('/')) { if (stack.length > 1) stack.pop(); continue; }
      const name = tag.match(/^\S+/)?.[0]; if (!name) continue;
      const node = doc.createElement(name);
      for (const [,key,value] of tag.slice(name.length).matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) node.setAttribute(key, value ?? '');
      stack.at(-1).appendChild(node);
      if (!voids.has(name.toLowerCase()) && !tag.endsWith('/')) stack.push(node);
    }
  }
  doc.body = (() => { const walk = n => n.tagName === 'BODY' ? n : n.childNodes.map(walk).find(Boolean); return walk(doc.documentElement); })() || doc.documentElement.appendChild(doc.createElement('body'));
  return {doc, observers, get deliveries() { return deliveries; }, add(text, tag = 'p') { const n = doc.createElement(tag); n.textContent = text; doc.body.appendChild(n); return n; }};
}
const html = fs.readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const attrs = ['aria-label','aria-valuetext','title','alt','placeholder','content'];
const entries = node => {
  if (node.getAttribute('translate') === 'no' || node.hasAttribute('data-i18n-skip') || ['SCRIPT','STYLE','NOSCRIPT','CODE','PRE'].includes(node.tagName)) return [];
  return [...(node.nodeType === 3 ? [{node, value: node.nodeValue}] : attrs.filter(a => node.getAttribute(a) != null).map(a => ({node, attr: a, value: node.getAttribute(a)}))), ...node.childNodes.flatMap(entries)];
};

await test('All existing static HTML labels and accessibility prose translate and restore exactly', () => {
  const f = fixture(html), original = entries(f.doc.documentElement).filter(({value}) => /[А-Яа-яЁё]/u.test(value));
  const l = createLocalization(f.doc, {language: 'en'});
  assert.equal(f.doc.documentElement.lang, 'en'); assert(original.length > 130);
  for (const item of original) {
    const now = item.attr ? item.node.getAttribute(item.attr) : item.node.nodeValue;
    assert.notEqual(now, item.value, 'Untranslated HTML: ' + item.value.trim());
    assert(!/[А-Яа-яЁё]/u.test(now.replace('Обби: Побег +1 Крылья', '')), 'Unexpected RU in EN: ' + now);
  }
  for (let i = 0; i < 5; i++) {
    l.setLanguage('ru'); assert.equal(f.doc.documentElement.lang, 'ru');
    for (const item of original) assert.equal(item.attr ? item.node.getAttribute(item.attr) : item.node.nodeValue, item.value);
    l.setLanguage('en');
  }
  l.dispose();
});

await test('Real dynamic currency, purchases, classes, steering, prompts and failure phrases', () => {
  const pairs = [
    ['Купить 100000', 'Buy 100000'],
    ['Купить Городской курьер за 1300. Средств достаточно', 'Buy City courier for 1300. Enough money'],
    ['Купить BMW — награда за 0. Недостаточно денег', 'Buy BMW — reward for 0. Not enough money'],
    ['Купить Jeff the Killer за 1\u202f300 игровых денег', 'Buy Jeff the Killer for 1\u202f300 game money'],
    ['Заработанные деньги: 1\u202f000\u202f000', 'Money earned: 1\u202f000\u202f000'],
    ['Осталось 1  300', '1  300 remaining'],
    ['Мозги: 20', 'Brains: 20'], ['12,5 из 100', '12,5 of 100'],
    ['Накопления на Внедорожник: 1\u202f300 из 3\u202f200', 'Savings for Off-roader: 1\u202f300 of 3\u202f200'],
    ['Сесть · +1,5/сек', 'Sit down · +1,5/s'], ['Класс 3 · +2,2 мозга/сек', 'Class 3 · +2,2 brains/s'],
    ['Вправо 47%', 'Right 47%'], ['Влево 100%', 'Left 100%'],
    ['Груз доставлен! +100 · Всего 200', 'Cargo delivered! +100 · Total 200'],
    ['Бак заправлен · 100/100. Груз сохранён.', 'Tank refilled · 100/100. Cargo retained.'],
    ['Bacon · 250. Покупка только кнопкой.', 'Bacon · 250. Use the button to purchase.'],
    ['Класс 3 · 4000. Доступ покупается один раз.', 'Class 3 · 4000. One-time access purchase.'],
    ['Пикап куплен. Отойдите и подойдите снова, чтобы сесть.', 'Pickup purchased. Step away and approach again to get in.'],
    ['Улучшение куплено · уровень 8', 'Upgrade purchased · level 8'],
    ['Добавлено 1000 игровых денег. Одноразовая выдача использована.', 'Added 1000 game money. One-time grant used.'],
    ['Пикап · груз загружен. Слева выгрузка, справа заправка.', 'Pickup · cargo loaded. Unloading on the left, fuel on the right.'],
    ['Снег · тестовая поездка без оплаты груза. Новый рейс — из ангара.', 'Snow · test drive without cargo payment. Start a new delivery from the hangar.'],
    ['Загружаем Spyder Sammy…', 'Loading Spyder Sammy…'], ['Bacon уже выбран', 'Bacon already selected'],
    ['Bacon выбран', 'Bacon selected'], ['Bacon / КЛАСС ПДД', 'Bacon / DRIVING SCHOOL'],
    ['42K + ГАРАЖ / 5 БИОМОВ', '42K + GARAGE / 5 BIOMES'],
    ['Не удалось загрузить сцену. Проверьте поддержку WebGL 2 и откройте страницу через HTTP-сервер. NetworkError: source.glb', 'Unable to load the scene. Check WebGL 2 support and open the page through an HTTP server. NetworkError: source.glb'],
  ];
  for (const [ru, en] of pairs) { assert.equal(translateGameText(ru), en); assert.equal(translateGameText(ru, 'ru'), ru); }
});

await test('All real upgrade presentations translate at every tier without changing numerical values', () => {
  for (const vehicle of VEHICLE_CONFIG) for (const stat of UPGRADE_STATS) for (let level = 0; level <= 10; level++) {
    const offer = getUpgradeOffer(vehicle.id, stat.id, {[stat.id]: level}), p = upgradeValuePresentation(stat.id, offer);
    const aria = offer.maxed ? `${stat.name}: максимальный уровень` : `${stat.name}: уровень ${offer.nextLevel}, ${offer.price} мозгов. ${p.value}. ${p.detail}`;
    for (const value of [p.value, p.detail, aria]) {
      const translated = translateGameText(value);
      assert(!/[А-Яа-яЁё]/u.test(translated), translated);
      assert.deepEqual(translated.match(/\d+(?:[,.]\d+)*/g), value.match(/\d+(?:[,.]\d+)*/g));
    }
  }
});

await test('Dynamic Text-node replacement and attribute updates translate automatically without loops', async () => {
  const f = fixture(), node = f.add('Купить 1300'), l = createLocalization(f.doc, {language: 'en'});
  assert.equal(node.textContent, 'Buy 1300');
  node.textContent = 'Купить 3200'; node.setAttribute('aria-label', 'Купить Внедорожник за 3200. Недостаточно денег');
  await tick(); assert.equal(node.textContent, 'Buy 3200'); assert.equal(node.getAttribute('aria-label'), 'Buy Off-roader for 3200. Not enough money');
  const deliveries = f.deliveries; await tick(); assert.equal(f.deliveries, deliveries, 'Translations must not feed back into the observer');
  node.childNodes[0].nodeValue = 'Купить 6500'; l.refresh(); assert.equal(node.textContent, 'Buy 6500');
  await tick(); assert.equal(f.deliveries, deliveries, 'refresh consumes pending records instead of leaving redundant work');
  for (let i = 0; i < 6; i++) { l.setLanguage('ru'); assert.equal(node.textContent, 'Купить 6500'); l.setLanguage('en'); assert.equal(node.textContent, 'Buy 6500'); }
  const later = f.add('Сохранение сброшено'); later.setAttribute('title', 'Не сохранено'); await tick();
  assert.equal(later.textContent, 'Save reset'); assert.equal(later.getAttribute('title'), 'Not saved');
  const before = f.deliveries; for (let i = 0; i < 20; i++) l.refresh(); await tick(); assert.equal(f.deliveries, before);
  assert.equal(l.setLanguage('de'), 'en'); l.dispose(); l.dispose(); assert.equal(f.observers.size, 0);
  node.textContent = 'Купить 10000'; await tick(); l.refresh(); l.setLanguage('ru'); assert.equal(node.textContent, 'Купить 10000'); assert.equal(l.language, 'en');
});

await test('Authors, model names, URLs, input values, numbers and explicit exclusions are preserved', async () => {
  const f = fixture();
  const protectedNodes = CHARACTER_CATALOG.map(({name}) => f.add(name));
  for (const text of ['SharkyStudios','qubodup','audible-edge (Tom Haigh)','Kenney','Cosmo','BMW G80 M3','+1\u202f000\u202f000','$19.95','€20,50','0 / 10','100%']) protectedNodes.push(f.add(text));
  for (const tag of ['script','style','code','pre','noscript']) protectedNodes.push(f.add('Купить', tag));
  const named = f.add('Купить'); named.setAttribute('translate', 'no'); protectedNodes.push(named);
  const skipped = f.add('Город'); skipped.setAttribute('data-i18n-skip', ''); protectedNodes.push(skipped);
  const a = f.add('Источник', 'a'); a.setAttribute('href', 'https://example.test/Город?price=1300');
  const input = f.add('', 'input'); input.value = 'Город'; input.setAttribute('placeholder','Выбери следующую машину');
  const original = protectedNodes.map(n => n.textContent), l = createLocalization(f.doc, {language:'en'});
  assert.deepEqual(protectedNodes.map(n => n.textContent), original);
  assert.equal(a.getAttribute('href'), 'https://example.test/Город?price=1300'); assert.equal(input.value, 'Город');
  assert.equal(input.getAttribute('placeholder'), 'Choose your next vehicle');
  const child = f.doc.createElement('span'); child.textContent = 'Задания'; named.appendChild(child); await tick(); assert.equal(child.textContent, 'Задания');
  assert.equal(translateGameText('Дизайнер Городской курьер: неизвестен'), 'Дизайнер Городской курьер: неизвестен', 'No global substring replacement');
  l.setLanguage('ru'); assert.equal(input.getAttribute('placeholder'), 'Выбери следующую машину'); l.dispose();
});

await test('Real mission and delivery renderers remain localized after repeated open/close and numeric updates', async () => {
  const f = fixture(html), {doc} = f, get = id => doc.getElementById(id), l = createLocalization(doc, {language:'en'});
  let mission = {...CAREER_MISSIONS[0], progress:1};
  const gameplay = {state:{mode:'walking'}, isOwned:id => id === 'pickup', getVehicleGoal:() => ({name:'Городской курьер',id:'citycourier',price:1300,money:123,remaining:1177}), getCareerMission:() => mission};
  const ui = createRetentionUi(doc), view = {gameplay,playing:true,driving:false,inGarage:true,menuOpen:false};
  for (const entry of CAREER_MISSIONS) {
    mission = {...entry, progress:1}; ui.update(view); ui.close(); ui.update(view); await tick();
    assert.equal(get('career-mission-name').textContent, translateGameText(entry.name));
    assert(!/[А-Яа-яЁё]/u.test(get('career-mission-description').textContent));
    assert.equal(get('career-mission-count').textContent, `1 / ${entry.target}`);
    assert(!/[А-Яа-яЁё]/u.test(get('career-mission-button').getAttribute('aria-label')));
    assert.equal(get('career-goal-option-citycourier').textContent, 'City courier · 1\u202f300');
  }
  ui.showDelivery({base:1e9,clean:40,hard:60,first:80,mission:150,totalCash:1e9+330,brains:{total:70,clean:5,hard:10,first:15,mission:40},unlockedVehicleId:'bmwreward'}); await tick();
  assert.equal(get('receipt-total-cash').textContent,'+'+careerNumber(1e9+330));
  assert.equal(get('receipt-base').getAttribute('aria-label'),'Delivery: 1\u202f000\u202f000\u202f000 game money, 0 brains');
  assert.equal(get('delivery-receipt').getAttribute('aria-label'),'Cargo delivered: 1\u202f000\u202f000\u202f330 game money and 70 brains');
  assert.equal(get('receipt-vehicle-unlock').textContent,'Golden BMW unlocked! It is waiting on the pedestal in the hangar.');
  for (let i=0;i<4;i++) {l.setLanguage('ru'); ui.update(view); await tick(); assert.equal(get('career-mission-name').textContent,mission.name); l.setLanguage('en'); ui.update(view); await tick(); assert.equal(get('career-mission-name').textContent,translateGameText(mission.name));}
  ui.dispose(); l.dispose();
});

await test('Real progression renderer and minimal fixture DOM both support RU/EN refresh', async () => {
  const f = fixture(html), {doc} = f, l = createLocalization(doc, {language:'en'}), get=id=>doc.getElementById(id);
  const gameplay={state:{brains:1234,money:5000,selectedId:'pickup',upgrades:{pickup:{}},jump:{},skinPurchaseCandidateId:'bacon',schoolPurchaseCandidateId:'school-2',seatedSchoolId:'school-1'},isSkinOwned:()=>true,isSchoolOwned:id=>id==='school-1'};
  updateProgressionHud(doc,{gameplay,playing:true,driving:true,upgradeMenuOpen:true}); await tick();
  assert.equal(get('brain-hud').getAttribute('aria-label'),'Brains: 1234'); assert.equal(get('buy-school-label').textContent,'Buy 1000');
  assert.equal(get('study-status').textContent,'Class 1 · +1,5 brains/s'); assert.equal(get('upgrade-car-name').textContent,'Pickup');
  for(const stat of UPGRADE_STATS)assert(!/[А-Яа-яЁё]/u.test(get('upgrade-'+stat.id+'-buy').getAttribute('aria-label')));
  l.setLanguage('ru'); assert.equal(get('study-status').textContent,'Класс 1 · +1,5 мозга/сек'); l.dispose();
  const minimal=createInputDom(); minimal.doc.body=minimal.root; minimal.wheel.textContent='Задания'; minimal.wheel.setAttribute('title','Закрыть');
  const fallback=createLocalization(minimal.doc,{language:'en'}); assert.equal(minimal.wheel.textContent,'Missions'); assert.equal(minimal.wheel.getAttribute('title'),'Close');
  minimal.wheel.textContent='Купить 3000'; fallback.refresh(); assert.equal(minimal.wheel.textContent,'Buy 3000'); fallback.setLanguage('ru'); assert.equal(minimal.wheel.textContent,'Купить 3000'); fallback.dispose();
});
console.log(`PASS ${count} localization groups: static inventory, all upgrade tiers, dynamic dialogs, accessibility, exact RU restoration and observer lifecycle.`);
