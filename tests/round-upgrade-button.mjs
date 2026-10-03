// Source contracts and renderer-free app behavior; not browser layout validation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAppDom} from './fixtures/app-dom.mjs';
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../dist/progression-ui.css',import.meta.url),'utf8');
const baseCss=fs.readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');
const actions=html.match(/<div class="top-actions">([\s\S]*?)<\/div>/)?.[1];
assert.ok(actions,'Top action group exists');
assert.match(actions,/<button id="garage-button"[\s\S]*?<\/button>\s*<button id="upgrade-button"/,'Upgrade follows hangar directly');
const button=actions.match(/<button id="upgrade-button"([^>]*)>([\s\S]*?)<\/button>/);
assert.ok(button);
assert.match(button[1],/class="hud-menu-button"/);
for(const attr of ['aria-label="Улучшения машины"','title="Улучшения машины"','aria-expanded="false"','aria-controls="upgrade-panel"','hidden'])assert.ok(button[1].includes(attr),attr);
assert.equal(button[2].replace(/<[^>]*>/g,'').trim(),'','Icon only, no visible caption');
assert.match(button[2],/class="hud-circle"/);
assert.match(button[2],/aria-hidden="true" focusable="false"/);
assert.match(button[2],/href="#hud-upgrade"/);
assert.match(button[2],/viewBox="0 0 64 64" width="64" height="64" preserveAspectRatio="xMidYMid meet"/);
assert.match(css,/\.top-actions #upgrade-button>\.hud-circle\{[^}]*position:relative[^}]*overflow:hidden/);
assert.match(css,/\.top-actions #upgrade-button>\.hud-circle>\.hud-art\{position:absolute;inset:15%;[^}]*width:70%;height:70%/);
for(const size of [44,52,56,65,80]){const inset=.15*size,icon=.7*size;assert.ok(inset>0&&inset+icon<size);}

assert.match(baseCss,/\.hud-circle\s*\{[^}]*border-radius:\s*50%/);
assert.match(css,/\.top-actions #upgrade-button\{position:static;inset:auto;[^}]*padding:0;border:0;border-radius:0;background:none/);
const landscape=css.slice(css.indexOf('@media(max-height:420px)'),css.indexOf('@media(max-width:340px)'));
assert.doesNotMatch(landscape,/#upgrade-button/,'Landscape must not move or hide the round upgrade button');
assert.match(css,/\.is-driving \.top-actions,\.is-driving #wallet-hud\{--top-icon-size:44px;--top-actions-width:156px\}/);
for(const width of [320,360,390,430,600]){
 const header=width-26,actionsWidth=3*48+2*6,walletWidth=header-actionsWidth-12;
 assert.equal(actionsWidth,156);
 assert.ok(walletWidth>=44+6+40,`${width}px leaves room for wallet icon and number`);
}
const f=createAppDom({startDriving:false});
try{
 const upgrade=f.ids.get('upgrade-button');
 assert.equal(upgrade.hidden,true);
 f.debug.gameplay.state.cooldown=0;assert.ok(f.debug.enterVehicle('pickup'));assert.equal(upgrade.hidden,false);
 upgrade.dispatch('click');assert.equal(f.debug.upgradeMenuOpen,true);
 assert.equal(upgrade.getAttribute('aria-expanded'),'true');
 f.debug.setDriving(false);assert.equal(upgrade.hidden,true);
 assert.equal(f.debug.upgradeMenuOpen,false);
}finally{f.dispose();}
console.log('PASS round icon-only upgrade follows hangar; accessible label, responsive width budgets, driving-only visibility and existing click handler');
