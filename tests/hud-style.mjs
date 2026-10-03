import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');
const controls=fs.readFileSync(new URL('../dist/vehicle-controls.css',import.meta.url),'utf8');
let count=0; const test=(name,fn)=>{fn();count++;console.log('PASS '+name)};
test('HUD retains named controls and ARIA/hidden state contracts',()=>{
 for(const id of ['mode-toggle','mode-label','garage-button','walk-ui','walk-stick','walk-thumb','jump-button','stand-up','fuel-hud','fuel-value','fuel-meter','fuel-fill','drive-ui','gear-note','speed-value','drive-status']) assert.equal([...html.matchAll(new RegExp(`id="${id}"`,'g'))].length,1,id);
 assert.match(html, /id="jump-button"[^>]*aria-label="Прыжок"/);
 assert.match(html, /id="fuel-meter"[^>]*role="progressbar"[^>]*aria-valuemin="0"[^>]*aria-valuemax="100"/);
 assert.match(html, /id="stand-up"[^>]*hidden/);
 assert.match(html, /id="mode-label" class="button-label"/);
});
test('Only the top icon-only Garage action remains; info and roadside exit controls are removed',()=>{
 for(const id of ['info-toggle','info-panel','info-close','exit-car','reset-truck']) assert.doesNotMatch(html,new RegExp(`id="${id}"`),id);
 const garage=html.match(/<button\b[^>]*id="garage-button"[^>]*>[\s\S]*?<\/button>/)?.[0];
 assert.ok(garage); assert.match(garage,/aria-label="[^"]+"/);
 assert.match(garage,/<use href="#hud-garage"/); assert.doesNotMatch(garage,/button-label/);
 assert.equal(garage.replace(/<[^>]+>/g,'').trim(),'','Garage must have no visible label');
 assert.equal([...html.matchAll(/<use href="#hud-garage"/g)].length,1,'No duplicate Garage icon');
 const fuel=html.match(/<section\b[^>]*id="fuel-hud"[^>]*>[\s\S]*?<\/section>/)?.[0];
 assert.ok(fuel); assert.match(fuel,/<use href="#hud-fuel"/);
 assert.match(fuel,/id="fuel-value"[^>]*>\s*<span id="fuel-current">100<\/span>\s*<span class="fuel-separator"[^>]*>\/<\/span>\s*<span id="fuel-capacity">100<\/span>/);
 assert.equal(fuel.replace(/<[^>]+>/g,'').replace(/\s/g,''),'100/100','Fuel only shows the current/max number');
});
test('Every SVG use has a local symbol; new artwork is native code-drawn SVG',()=>{
 const defs=new Set([...html.matchAll(/<symbol id="([^"]+)"/g)].map(m=>m[1]));
 for(const m of html.matchAll(/<use href="#([^"]+)"/g)) assert.ok(defs.has(m[1]),m[1]);
 for(const file of ['hud-steering.svg','hud-gear-panel.svg']){const svg=fs.readFileSync(new URL('../dist/assets/'+file,import.meta.url),'utf8');assert.match(svg,/<svg[^>]*viewBox=/);assert.doesNotMatch(svg,/<image|https?:\/\/(?!www.w3.org)/);}
 assert.match(html,/class="steering-wheel-image"\s+src="\.\/assets\/hud-steering.svg"/);
 assert.match(html,/class="gear-panel-image"\s+src="\.\/assets\/hud-gear-panel.svg"/);
});
test('Bright action colors, white outlined jump and red fuel canister are explicit',()=>{
 assert.match(css,/\.hud-circle\s*\{[^}]*border-radius: 50%;[^}]*background: var\(--action-color, #147ce5\)/s);
 for(const [id,color] of [['mode-toggle','#147ce5'],['garage-button','#f47d19']])assert.ok(css.includes(`#${id} { --action-color: ${color}`));
 assert.match(css,/\.jump-button\s*\{[^}]*border: 3px solid #fff;[^}]*background: #24b83be6/s);
 assert.match(html,/<symbol id="hud-fuel"[^]*?fill="#e74830"/);
 assert.match(css,/\.stand-button\s*\{[^}]*background: #04aaa5ed/s);
 for(const source of [css,controls])assert.doesNotMatch(source,/#(?:765335|694a30|b77b3f)/i);
 assert.match(css, /paint-order: stroke fill/);
 assert.doesNotMatch(html,/[\u{1F300}-\u{1FAFF}]/u);
});
test('Decoration does not steal pointers; wheel/gear preserve input hooks',()=>{
 assert.match(css,/\.hud-art, \.hud-art \*, \.hud-circle, \.button-label \{ pointer-events: none/);
 assert.match(controls,/\.steering-wheel-image\s*\{[^}]*pointer-events: none/);
 assert.match(controls,/\.gear-panel-image\s*\{[^}]*pointer-events: none/);
 assert.match(controls,/rotate\(var\(--steering-angle, 0deg\)\)/);
 assert.match(controls,/var\(--gear-progress, -1\)/);
 for(const name of ['gear-position-d','gear-position-r','gear-track','gear-handle'])assert.ok(html.includes(name));
});
test('Narrow, short portrait and 320px-high landscape rules retain safe-area and focus treatment',()=>{
 for(const rule of ['(max-width: 480px)','(max-height: 500px) and (min-width: 501px)','(max-height: 380px) and (min-width: 501px)'])assert.ok(css.includes(rule),rule);
 assert.match(controls, /\(max-height: 540px\) and \(max-width: 500px\)/);
 assert.match(css,/env\(safe-area-inset-bottom/);
 assert.match(controls,/env\(safe-area-inset-bottom/);
 assert.match(css, /button:focus-visible, input:focus-visible, \[role="button"\]:focus-visible/);
 for(const source of [css,controls])assert.equal([...source].filter(c=>c==='{').length,[...source].filter(c=>c==='}').length);
});
console.log(`HUD source contracts: ${count} checks passed. Static source checks only, not browser layout verification.`);
