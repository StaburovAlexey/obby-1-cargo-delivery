
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {brainDisplay,brainRateDisplay,updateProgressionHud} from '../dist/progression-hud.js';
import {PROGRESSION_CONFIG,SCHOOL_CONFIG} from '../dist/progression-config.js';
import {createAppDom} from './fixtures/app-dom.mjs';

const balances=[[0,'0'],[.9,'0'],[1.9,'1'],[9,'9'],[10,'10'],[999,'999'],[1000,'1000'],[PROGRESSION_CONFIG.maxBrains,'1000000000']];
for(const [value,expected] of balances){
  assert.equal(brainDisplay(value),expected);
  assert.match(brainDisplay(value),/^\d+$/);
}
for(const value of [-1,NaN,Infinity,-Infinity])assert.equal(brainDisplay(value),'0');
assert.equal(brainDisplay(1e30),'1000000000');
assert.equal(brainRateDisplay(SCHOOL_CONFIG[0].rate),'1,5');
assert.equal(brainRateDisplay(SCHOOL_CONFIG[3].rate),'2,6');
console.log('PASS whole brain balances floor without punctuation; school rates retain decimals');

const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
assert.match(html, /<div id="brain-hud"[^>]*><svg[^>]*><use href="#hud-brain" \/><\/svg><strong id="brain-value">0<\/strong><\/div>/);
console.log('PASS brain HUD visual order: icon on the left, integer on the right');

const css=fs.readFileSync(new URL('../dist/progression-ui.css',import.meta.url),'utf8');
const baseCss=fs.readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');
const block=selector=>{
  const escaped=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const found=css.match(new RegExp(escaped+'\\{([^}]+)\\}'));
  assert.ok(found,selector);return found[1];
};
const hud=block('#brain-hud'),icon=block('#brain-hud .hud-art'),value=block('#brain-value');
assert.match(hud,/right:0;/);
assert.match(hud,/display:flex;flex-direction:row;/);
assert.match(icon,/width:var\(--top-icon-size\);height:var\(--top-icon-size\);flex:0 0 var\(--top-icon-size\)/);
assert.doesNotMatch(icon,/brain-digits|scale|transform/);
assert.match(value,/font-variant-numeric:tabular-nums/);
assert.match(value,/min-width:0;overflow:hidden;text-align:right/);
assert.match(value,/font-size:min\(calc\(var\(--top-icon-size\)\*\.56\),calc\(\(100cqw - 115px - var\(--top-icon-size\) - 12px\)\/\(var\(--brain-digits,1\)\*\.68\)\)\)/);
assert.match(baseCss,/\.topbar \{ container-type: inline-size; \}/);


for(const [container,iconSize] of [[288,52],[364,65],[804,48],[1326,82]]){
  const valueRight=container;
  for(const [,text]of balances){
    const font=Math.min(iconSize*.56,(container-115-iconSize-12)/(text.length*.68));
    const estimatedTextWidth=text.length*.68*font;
    assert.ok(font>0);
    assert.ok(estimatedTextWidth+6+iconSize<=container-115);
    const valueLeft=valueRight-estimatedTextWidth;
    const iconRight=valueLeft-6,iconLeft=iconRight-iconSize;
    assert.equal(valueRight,container);
    assert.ok(Math.abs(iconRight-iconLeft-iconSize)<1e-9);
    assert.ok(iconLeft>=115);
  }
}
console.log('PASS responsive CSS contracts: right-anchored number and constant-size icon, tabular digits, bounded maximum balance');

for(const [width,height] of [[320,568],[390,844],[844,390],[1366,900]]){
  const f=createAppDom({width,height,startDriving:false});
  try{
    const g=f.debug.gameplay;
    for(const [value,expected] of balances){
      g.state.brains=value;
      updateProgressionHud(f.doc,{gameplay:g,playing:true,driving:false,upgradeMenuOpen:false});
      assert.equal(f.ids.get('brain-value').textContent,expected);
      assert.equal(f.ids.get('brain-hud').getAttribute('aria-label'),`Мозги: ${expected}`);
      assert.equal(f.ids.get('brain-hud').style.getPropertyValue('--brain-digits'),String(expected.length));
      assert.equal(g.state.brains,value,'Rendering must not discard fractional accrual');
    }
    g.state.brains=.9;
    g.state.seatedId='desk-01';g.state.seatedSchoolId='school-1';
    for(let i=0;i<8;i++)f.frame();
    assert.ok(g.state.brains>1 && g.state.brains<2,'Fractional study income crosses one whole brain');
    assert.equal(f.ids.get('brain-value').textContent,'1');
    assert.match(f.ids.get('study-status').textContent,/1,5 мозга\/сек/);
    console.log(`PASS app HUD ${width}×${height}: zero, decimals, digit boundaries, cap, fractional accrual`);
  }finally{f.dispose();}
}

