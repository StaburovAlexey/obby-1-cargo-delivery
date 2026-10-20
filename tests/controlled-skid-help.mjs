import assert from 'node:assert/strict';
import fs from 'node:fs';
import {translateGameText} from '../dist/localization.js';
import {upgradeValuePresentation} from '../dist/progression-hud.js';
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
for (const text of [
 'Ускоряет отклик руля и помогает удерживать и выравнивать машину в заносе.',
 'Повышает устойчивость к срыву в занос, улучшает восстановление сцепления и торможение.',
]) {
 assert(html.includes(text));
 assert(!/[А-Яа-яЁё]/u.test(translateGameText(text,'en')));
 assert.equal(translateGameText(text,'ru'),text);
}
assert(html.includes('Перед мостом заранее сбросьте скорость.'));
assert(html.includes('по мере выравнивания возвращайте руль к центру'));
const p=upgradeValuePresentation('grip',{maxed:false,currentPerformance:{grip:.5},nextPerformance:{grip:.51}});
assert(p.detail.includes('срыв в занос'));
assert(!/[А-Яа-яЁё]/u.test(translateGameText(p.detail,'en')));
const h=upgradeValuePresentation('handling',{maxed:false,currentPerformance:{steeringResponseSeconds:.3,handling:1},nextPerformance:{steeringResponseSeconds:.29,handling:1.03}});
assert(h.detail.includes('Контроль заноса'));
assert(!/[А-Яа-яЁё]/u.test(translateGameText(h.detail,'en')));
console.log('PASS controlled-skid help: grip, countersteering, bridge approach, RU/EN.');
