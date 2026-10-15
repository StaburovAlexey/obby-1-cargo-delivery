
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {translateGameText} from '../dist/localization.js';
import {UPGRADE_MAX_LEVEL, UPGRADE_STATS} from '../dist/vehicle-upgrades.js';
import {SCHOOL_CONFIG} from '../dist/progression-config.js';
const read = path => fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html = read('dist/index.html'), css = read('dist/settings-menu.css');
const help = html.slice(html.indexOf('<section id="settings-how-to-play"'), html.indexOf('<section id="settings-credits"'));
const rest = html.replace(help,'');
assert(help.includes('Как играть')); assert(help.includes('Значки и управление'));
assert.equal((help.match(/<li>/g)||[]).length,30, 'Seven steps and 23 real-interface examples');
assert.equal((help.match(/class="settings-icon-example"/g)||[]).length,23);
assert.equal((help.match(/<h5>/g)||[]).length,23, 'Every example has a visible name');
assert.equal(new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1])).size,[...html.matchAll(/\bid="([^"]+)"/g)].length);
for(const [,id] of help.matchAll(/<use href="#([^"]+)"/g)) {
  assert(rest.includes(`<symbol id="${id}"`),`Existing shared SVG symbol: ${id}`);
  assert(rest.includes(`<use href="#${id}"`),`Same symbol used in live UI: ${id}`);
}
for(const [,asset] of help.matchAll(/<img[^>]*src="([^"]+)"/g)) {
  assert(rest.includes(`src="${asset}"`)); assert(fs.existsSync(new URL('../dist/'+asset,import.meta.url)));
}
const speaker = rest.match(/<button id="audio-toggle"[^>]*>(<svg[\s\S]*?<\/svg>)<\/button>/)[1];
assert(help.includes(speaker),'Speaker sample uses the exact live SVG');
for(const symbol of ['hud-overview','hud-biome','hud-refresh','hud-grid'])assert(!help.includes(`#${symbol}`),'Developer icons do not leak into player guide');
assert(!help.includes('career-goal'),'Removed savings launcher is not advertised');
assert(help.includes('бесплатно заполнится'));assert(help.includes('Отдельной клавиши заднего хода нет.'));
assert(help.includes('Столкновение само по себе не отнимает груз'));assert(help.includes('последней точке после финиша'));
assert(help.includes('Покупка сама по себе не доливает топливо'));
assert.equal(UPGRADE_MAX_LEVEL,10);assert.equal(UPGRADE_STATS.length,4);assert.equal(SCHOOL_CONFIG.length,5);assert.equal(SCHOOL_CONFIG[0].price,0);
for(const text of help.replace(/<[^>]*>/g,'\n').split('\n').map(s=>s.trim()).filter(Boolean)) {
  if(!/[А-Яа-яЁё]/u.test(text))continue;
  const translated = translateGameText(text,'en');
  assert(!/[А-Яа-яЁё]/u.test(translated),'Every guide text is translated: '+text);
  assert.equal(translateGameText(text,'ru'),text);
}
assert.match(html,/id="settings-scroll"[^>]*tabindex="0"[^>]*role="region"/);
assert.match(css,/\.settings-scroll\{[^}]*overflow-y:auto;overscroll-behavior:contain/);
assert.match(css,/body\.settings-menu-open\{overflow:hidden;overscroll-behavior:none/);
assert.match(css,/grid-template-columns:62px minmax\(0,1fr\)/);
assert.match(css,/@media\(max-width:360px\)[^]*grid-template-columns:48px minmax\(0,1fr\)/);
assert.match(css,/\.settings-icon-example\{[^}]*pointer-events:none/);
assert.match(css,/\.settings-jump-nav\{[^}]*flex-wrap:wrap/);
assert(!help.includes('<button'),'Examples are decorative, not duplicate live controls');
console.log('PASS settings help: verified gameplay copy, 23 actual-UI examples, RU/EN, no developer controls, unique IDs, responsive/scroll/input contracts. CPU only.');
