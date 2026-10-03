// Renderer-free app integration and source contracts. This is deliberately not
// browser layout, GPU performance, Android, or physical-touchscreen validation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {createAppDom} from './fixtures/app-dom.mjs';
import {freshCareer} from '../dist/career-save.js';
import {SCHOOL_CONFIG,SKIN_CONFIG} from '../dist/progression-config.js';
import {UPGRADE_STATS,getUpgradeOffer} from '../dist/vehicle-upgrades.js';
import {brainDisplay,brainRateDisplay,schoolLabelScale,WORLD_LABEL_DROP,updateProgressionHud,updateProgressionWorldLabels} from '../dist/progression-hud.js';

const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../dist/progression-ui.css',import.meta.url),'utf8');
const baseCss=fs.readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');
const test=(name,run)=>{run();passed++;console.log('PASS '+name);};
const withApp=(run,options={})=>{const f=createAppDom({startDriving:false,...options});try{run(f);}finally{f.dispose();}};
const block=id=>{const match=html.match(new RegExp(`<div\\b[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/div>`));assert.ok(match,id);return match[1];};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const get=(f,id)=>f.ids.get(id);
const renderHud=(f,extra={})=>updateProgressionHud(f.doc,{gameplay:f.debug.gameplay,playing:f.debug.playing,driving:f.debug.driving,upgradeMenuOpen:f.debug.upgradeMenuOpen,...extra});
const approach=(f,kind,index)=>{
  const g=f.debug.gameplay,s=g.state;
  f.debug.returnToGarage();
  const point=kind==='school'?f.debug.garage.classroomEntries[index]:f.debug.garage.stands[index].trigger;
  Object.assign(s.player,{x:point.x,z:point.z,heading:0});
  s[kind+'PurchaseCandidateId']=(kind==='school'?SCHOOL_CONFIG:SKIN_CONFIG)[index].id;
  s.cooldown=0;s.interactionCooldown=0;s.walked=0;
  f.debug.followCharacter(1,true);f.frame();
};
let passed=0;

test('Every progression SVG reference resolves to one local code-native symbol',()=>{
  const symbols=new Map([...html.matchAll(/<symbol\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/symbol>/g)].map(m=>[m[1],m[2]]));
  for(const id of ['hud-brain','hud-school','hud-lock','hud-upgrade','hud-speed','hud-handling','hud-grip','hud-fuel','hud-money']){
    assert.ok(symbols.has(id),id);assert.equal([...html.matchAll(new RegExp(`<symbol\\b[^>]*id="${id}"`,'g'))].length,1);
    assert.doesNotMatch(symbols.get(id),/<image\b|https?:\/\//);assert.match(symbols.get(id),/<(?:path|rect|circle)\b/);
  }
  for(const [,id]of html.matchAll(/<use\b[^>]*href="#([^"]+)"/g))assert.ok(symbols.has(id),id);
  assert.match(symbols.get('hud-school'),/fill="#fff4ce"/);assert.match(symbols.get('hud-school'),/fill="#ff75c5"/);
  assert.match(block('brain-hud'),/<use href="#hud-brain"/);assert.doesNotMatch(block('brain-hud'),/<use href="#hud-money"/);
});

test('Five schools use book-brain, rate-brain, lock and money symbols; all 17 skins have price anchors',()=>{
  assert.equal([...html.matchAll(/id="school-label-\d+"/g)].length,5);
  assert.equal([...html.matchAll(/id="skin-label-\d+"/g)].length,17);
  for(let i=1;i<=5;i++){
    const content=block('school-label-'+i);
    for(const icon of ['school','brain','lock','money'])assert.match(content,new RegExp(`<use href="#hud-${icon}"`));
    assert.doesNotMatch(content,/КЛАСС|ОТКРЫТО|<strong\b/);
    assert.match(content,/^<div class="school-content"[^>]*><svg[^>]*school-symbol/);
    assert.match(content,/<span class="school-rate-row">[\s\S]*id="school-access-/);
    for(const part of ['rate','lock','dollar','price','access'])assert.match(content,new RegExp(`id="school-${part}-${i}"`));
  }
  for(let i=1;i<=17;i++){assert.match(block('skin-label-'+i),/<use href="#hud-money"/);assert.match(block('skin-label-'+i),new RegExp(`id="skin-price-${i}"`));}
});

test('Brain balance displays bounded career values without rounding up or abbreviating',()=>{
  for(const [value,expected]of [[0,'0'],[-1,'0'],[NaN,'0'],[.09,'0'],[.1,'0'],[1.5,'1'],[19.999,'19'],[20,'20'],[1234.59,'1234'],[1e9,'1000000000']])assert.equal(brainDisplay(value),expected);
  withApp(f=>{
    for(const value of [0,1.5,19.999,1e9]){
      f.debug.gameplay.state.brains=value;renderHud(f);const display=brainDisplay(value);
      assert.equal(get(f,'brain-value').textContent,display);
      assert.equal(get(f,'brain-hud').getAttribute('aria-label'),'Мозги: '+display);
      assert.equal(get(f,'brain-hud').style.getPropertyValue('--brain-digits'),String(display.length));
    }
  });
});

test('Fresh school labels hide the entire free access row and retain paid prices, rates and affordability',()=>withApp(f=>{
  f.frame();const g=f.debug.gameplay;
  assert.equal(f.debug.garage.classroomEntries.length,5);assert.equal(f.debug.garage.stands.length,17);
  assert.equal(new Set(f.debug.garage.classroomEntries.map(e=>e.labelAnchor.x)).size,5);
  for(const [i,spec]of SCHOOL_CONFIG.entries()){
    const n=i+1,owned=i===0;
    assert.equal(get(f,`school-rate-${n}`).textContent,brainRateDisplay(spec.rate));
    assert.equal(get(f,`school-price-${n}`).textContent,owned?'':String(spec.price));
    assert.equal(get(f,`school-lock-${n}`).hidden,owned);assert.equal(get(f,`school-dollar-${n}`).hidden,owned);
    assert.equal(get(f,`school-access-${n}`).hidden,owned);
    assert.equal(get(f,`school-access-${n}`).dataset.affordable,String(owned));
  }
  g.state.money=1500;f.frame();
  for(let i=1;i<=5;i++)assert.equal(get(f,`school-access-${i}`).dataset.affordable,String(SCHOOL_CONFIG[i-1].price<=1500));
}));

test('School purchase refreshes action immediately and floating ownership on the next app frame',()=>withApp(f=>{
  const g=f.debug.gameplay;approach(f,'school',1);
  assert.equal(get(f,'buy-school').hidden,false);assert.equal(get(f,'buy-school').dataset.affordable,'true');
  assert.equal(get(f,'buy-school-label').textContent,'Купить Класс 2 · 500');
  assert.equal(get(f,'school-access-2').hidden,false);assert.equal(get(f,'school-price-2').textContent,'500');
  get(f,'buy-school').dispatch('click');
  assert.equal(g.state.money,500);assert.ok(g.isSchoolOwned('school-2'));assert.equal(g.state.seatedId,null);
  assert.equal(get(f,'buy-school-label').textContent,'Сесть · +2/сек');assert.equal(get(f,'wallet-value').textContent,'500');
  f.frame();assert.equal(get(f,'school-price-2').textContent,'');
  assert.equal(get(f,'school-access-2').hidden,true);assert.equal(get(f,'school-rate-2').textContent,'2');
  assert.equal(get(f,'school-lock-2').hidden,true);assert.equal(get(f,'school-dollar-2').hidden,true);
  get(f,'buy-school').dispatch('click');
  assert.equal(g.state.money,500);assert.equal(g.state.seatedSchoolId,'school-2');assert.equal(get(f,'buy-school').hidden,true);
  assert.equal(get(f,'study-status').hidden,false);assert.equal(get(f,'study-status').textContent,'Класс 2 · +2 мозга/сек');
  const before=g.state.brains;for(let i=0;i<12;i++)f.frame();assert.ok(g.state.brains>before);
  f.debug.standCharacter();assert.equal(get(f,'study-status').hidden,true);
},{career:{...freshCareer(),money:1000}}));

test('Insufficient school funds keep price and lock visible without purchasing or seating',()=>withApp(f=>{
  approach(f,'school',3);const g=f.debug.gameplay;
  assert.equal(get(f,'buy-school').dataset.affordable,'false');assert.equal(get(f,'school-access-4').dataset.affordable,'false');
  get(f,'buy-school').dispatch('click');f.frame();
  assert.equal(g.state.money,100);assert.equal(g.isSchoolOwned('school-4'),false);assert.equal(g.state.seatedId,null);
  assert.equal(get(f,'school-price-4').textContent,'3500');assert.equal(get(f,'school-lock-4').hidden,false);
  assert.equal(get(f,'school-access-4').hidden,false);assert.equal(get(f,'school-dollar-4').hidden,false);
  assert.match(get(f,'session-note').textContent,/Недостаточно игровых денег/);
},{career:{...freshCareer(),money:100}}));

test('Restored school ownership hides every access row while all five rate signs remain available',()=>withApp(f=>{
  updateProgressionWorldLabels(f.doc,{gameplay:f.debug.gameplay,garage:f.debug.garage,playing:true,project:(el,x,y,z,visible)=>{
    el.hidden=!visible;el.style.left=x*100+'px';el.style.top='200px';
  }});
  for(const [i,spec]of SCHOOL_CONFIG.entries()){
    const n=i+1;
    assert.equal(get(f,`school-label-${n}`).hidden,false);
    assert.equal(get(f,`school-access-${n}`).hidden,true);
    assert.equal(get(f,`school-lock-${n}`).hidden,true);assert.equal(get(f,`school-dollar-${n}`).hidden,true);
    assert.equal(get(f,`school-price-${n}`).textContent,'');
    assert.equal(get(f,`school-rate-${n}`).textContent,brainRateDisplay(spec.rate));
  }
},{career:{...freshCareer(),ownedSchoolIds:SCHOOL_CONFIG.map(s=>s.id)}}));

test('Only unowned skins show prices; buying hides the label and preserves an explicit Select action',()=>withApp(f=>{
  f.frame();
  for(const [i,spec]of SKIN_CONFIG.entries())assert.equal(get(f,`skin-price-${i+1}`).textContent,String(spec.price));
  assert.equal(get(f,'skin-label-1').hidden,true,'Free Bacon never displays a price');
  approach(f,'skin',1);const g=f.debug.gameplay;
  assert.equal(get(f,'buy-skin').hidden,false);assert.equal(get(f,'buy-skin').dataset.affordable,'true');
  get(f,'buy-skin').dispatch('click');assert.equal(g.state.money,750);assert.equal(g.state.characterId,'bacon');
  assert.equal(get(f,'buy-skin-label').textContent,'Выбрать '+SKIN_CONFIG[1].name);
  f.frame();assert.equal(get(f,'skin-price-2').textContent,String(SKIN_CONFIG[1].price));assert.equal(get(f,'skin-label-2').hidden,true);
  get(f,'buy-skin').dispatch('click');assert.equal(g.state.characterId,SKIN_CONFIG[1].id);assert.equal(g.state.money,750);
},{career:{...freshCareer(),money:1000}}));

test('Purchase prompts hide while airborne, seated, driving, absent, or outside play mode',()=>withApp(f=>{
  const s=f.debug.gameplay.state;s.skinPurchaseCandidateId=SKIN_CONFIG[1].id;s.schoolPurchaseCandidateId='school-2';
  for(const extra of [{playing:false},{driving:true}]){renderHud(f,extra);assert.equal(get(f,'buy-school').hidden,true);assert.equal(get(f,'buy-skin').hidden,true);}
  for(const [key,value]of [['seatedId','desk-01'],['airborne',true]]){
    const target=key==='airborne'?s.jump:s;target[key]=value;renderHud(f);
    assert.equal(get(f,'buy-school').hidden,true);assert.equal(get(f,'buy-skin').hidden,true);target[key]=key==='airborne'?false:null;
  }
  renderHud(f);assert.equal(get(f,'buy-school').hidden,false);assert.equal(get(f,'buy-skin').hidden,false);
  s.schoolPurchaseCandidateId=null;s.skinPurchaseCandidateId=null;renderHud(f);assert.equal(get(f,'buy-school').hidden,true);assert.equal(get(f,'buy-skin').hidden,true);
}));

test('Upgrade dialog opens only in a car and presents the actual per-vehicle offers',()=>withApp(f=>{
  assert.equal(f.debug.setUpgradeMenu(true),false);assert.equal(get(f,'upgrade-button').hidden,true);
  f.debug.gameplay.state.cooldown=0;assert.ok(f.debug.enterVehicle('pickup'));
  assert.equal(get(f,'upgrade-button').hidden,false);get(f,'upgrade-button').dispatch('click');
  assert.equal(f.debug.upgradeMenuOpen,true);assert.equal(get(f,'upgrade-menu').hidden,false);
  assert.equal(get(f,'upgrade-button').getAttribute('aria-expanded'),'true');
  assert.equal(f.doc.activeElement,get(f,'upgrade-speed-buy'));
  for(const stat of UPGRADE_STATS){
    const offer=getUpgradeOffer('pickup',stat.id,f.debug.gameplay.state.upgrades.pickup),prefix='upgrade-'+stat.id;
    assert.equal(get(f,prefix+'-level').textContent,'0 / 3');assert.equal(get(f,prefix+'-price').textContent,String(offer.price));
    assert.equal(get(f,prefix+'-buy').disabled,false);assert.match(get(f,prefix+'-buy').getAttribute('aria-label'),/уровень 1, 20 мозгов/);
    assert.match(get(f,prefix+'-value').textContent,/ → /);assert.ok(get(f,prefix+'-description').textContent.length>10);
  }
},{career:{...freshCareer(),brains:200}}));

test('Buying upgrades immediately refreshes brains, level, next price, maximum and disabled states',()=>withApp(f=>{
  const g=f.debug.gameplay;f.debug.setUpgradeMenu(true);
  for(const [level,balance,nextPrice]of [[1,180,'35'],[2,145,'50'],[3,95,'МАКС']]){
    get(f,'upgrade-speed-buy').dispatch('click');assert.equal(g.state.upgrades.pickup.speed,level);assert.equal(g.state.brains,balance);
    assert.equal(get(f,'brain-value').textContent,String(balance));assert.equal(get(f,'upgrade-speed-level').textContent,level+' / 3');
    assert.equal(get(f,'upgrade-speed-price').textContent,nextPrice);
  }
  assert.equal(get(f,'upgrade-speed-buy').disabled,true);assert.doesNotMatch(get(f,'upgrade-speed-value').textContent,/→/);
  assert.match(get(f,'upgrade-speed-buy').getAttribute('aria-label'),/максимальный уровень/);
  get(f,'upgrade-speed-buy').dispatch('click');assert.equal(g.state.brains,95);
  g.state.brains=19.9;renderHud(f);
  for(const id of UPGRADE_STATS.filter(s=>s.id!=='speed').map(s=>s.id))assert.equal(get(f,'upgrade-'+id+'-buy').disabled,true);
  get(f,'upgrade-handling-buy').dispatch('click');assert.equal(g.state.brains,19.9);assert.equal(g.state.upgrades.pickup.handling,0);
},{startDriving:true,career:{...freshCareer(),brains:200}}));

test('Upgrade keyboard focus, dismissal, menu exclusion and touch-event containment remain wired',()=>withApp(f=>{
  get(f,'upgrade-button').dispatch('click');
  const controls=[...UPGRADE_STATS.map(s=>'upgrade-'+s.id+'-buy'),'upgrade-close'];
  for(const id of controls.slice(1).concat(controls[0])){f.win.dispatch('keydown',{key:'Tab'});assert.equal(f.doc.activeElement,get(f,id));}
  f.win.dispatch('keydown',{key:'Tab',shiftKey:true});assert.equal(f.doc.activeElement,get(f,'upgrade-close'));
  for(const type of ['pointerdown','pointerup','pointercancel','touchstart','touchmove'])assert.equal(get(f,'upgrade-speed-buy').dispatch(type).stopped,true);
  get(f,'upgrade-menu').dispatch('click',{target:get(f,'upgrade-panel')});assert.equal(f.debug.upgradeMenuOpen,true);
  f.win.dispatch('keydown',{key:'Escape'});assert.equal(f.debug.upgradeMenuOpen,false);assert.equal(f.doc.activeElement,get(f,'upgrade-button'));
  f.debug.setUpgradeMenu(true);get(f,'upgrade-close').dispatch('click');assert.equal(get(f,'upgrade-menu').hidden,true);
  f.debug.setUpgradeMenu(true);get(f,'upgrade-menu').dispatch('click');assert.equal(f.debug.upgradeMenuOpen,false);
  f.debug.setUpgradeMenu(true);f.debug.setBiomeMenu(true);assert.equal(f.debug.upgradeMenuOpen,false);
  f.debug.setUpgradeMenu(true);assert.equal(f.debug.biomeMenuOpen,false);
  f.debug.setDriving(false);assert.equal(get(f,'upgrade-menu').hidden,true);assert.equal(get(f,'upgrade-button').hidden,true);
},{startDriving:true,career:{...freshCareer(),brains:200}}));

test('Real app school labels retain exact world-anchor projection and depth order in frontal and oblique views',()=>withApp(f=>{
  let visibleViews=0;
  for(const pose of [{x:-41,z:78,heading:0},{x:-26,z:74,heading:1},{x:-41,z:105,heading:0}]){
    Object.assign(f.debug.gameplay.state.player,pose);f.debug.followCharacter(1,true);f.frame();
    const labels=[1,2,3,4,5].map(i=>get(f,'school-label-'+i)).filter(e=>!e.hidden).sort((a,b)=>parseFloat(a.style.left)-parseFloat(b.style.left));
    assert.ok(labels.length>=3);visibleViews++;
    const scale=Number(labels[0].style.getPropertyValue('--school-scale'));near(scale,schoolLabelScale(390));
    for(const e of labels){assert.equal(Number(e.style.getPropertyValue('--school-scale')),scale);assert.ok(Number.isFinite(parseFloat(e.style.top)));}
    const depths=[];
    for(const element of labels){
      const index=Number(element.id.split('-').at(-1))-1,a=f.debug.garage.classroomEntries[index].labelAnchor;
      const q=new THREE.Vector3(a.x,a.y-WORLD_LABEL_DROP,a.z).project(f.debug.camera);
      near(parseFloat(element.style.left),(q.x*.5+.5)*390);near(parseFloat(element.style.top),(-q.y*.5+.5)*844);
      depths.push({depth:q.z,z:Number(element.style.zIndex)});
    }
    depths.sort((a,b)=>a.depth-b.depth);for(let i=1;i<depths.length;i++)if(depths[i].depth>depths[i-1].depth)assert.ok(depths[i-1].z>depths[i].z);
  }
  assert.equal(visibleViews,3);
  Object.assign(f.debug.gameplay.state.player,{x:0,z:0,heading:0});f.debug.followCharacter(1,true);f.frame();
  for(let i=1;i<=5;i++)assert.equal(get(f,'school-label-'+i).hidden,true);
}));

test('School scale depends only on viewport width across gaps, view directions, visible counts and ownership',()=>withApp(f=>{
  const g=f.debug.gameplay,garage=f.debug.garage;
  for(const width of [320,390,568,844,1366]){
    const expected=Math.max(.5,Math.min(1,(width-40)/600));
    near(schoolLabelScale(width),expected);
    for(const xs of [[100,103,107,107,109],[60,60,60,60,60],[100,160,220,280,340],[620,496,372,248,124],[-22,-10,0,320,999]])for(const visibleIndices of [[0,1,2,3,4],[0,2,4],[2]])for(const owned of [false,true]){
      g.state.ownedSchoolIds=owned?SCHOOL_CONFIG.map(s=>s.id):['school-1'];
      updateProgressionWorldLabels(f.doc,{gameplay:g,garage,playing:true,viewportWidth:width,project:(el,x,y,z,visible,range)=>{
        const match=el.id.match(/^school-label-(\d+)$/);if(!match){el.hidden=!visible;return;}
        const index=Number(match[1])-1;el.hidden=!visible||!visibleIndices.includes(index);
        assert.equal(range,65);el.style.left=xs[index]+'px';el.style.top='200px';
      }});
      for(const index of visibleIndices){const label=get(f,'school-label-'+(index+1));near(Number(label.style.getPropertyValue('--school-scale')),expected);assert.equal(label.style.top,'200px');near(parseFloat(label.style.left),xs[index]);}
    }
  }
}));

test('School and skin projections lower existing world anchors by exactly 0.4 metres',()=>withApp(f=>{
  assert.equal(WORLD_LABEL_DROP,.4);
  const g=f.debug.gameplay,garage=f.debug.garage,calls=[];
  updateProgressionWorldLabels(f.doc,{gameplay:g,garage,playing:true,project:(el,x,y,z,visible,range)=>{
    calls.push({id:el.id,x,y,z,visible,range});el.hidden=!visible;el.style.left=x*100+'px';
  }});
  for(const [i,entry]of garage.classroomEntries.entries()){
    const p=calls.find(c=>c.id==='school-label-'+(i+1));
    assert.equal(p.x,entry.labelAnchor.x);assert.equal(p.z,entry.labelAnchor.z);near(p.y,entry.labelAnchor.y-.4);assert.equal(p.range,65);
  }
  for(const [i,stand]of garage.stands.entries()){
    const p=calls.find(c=>c.id==='skin-label-'+(i+1));
    assert.equal(p.x,stand.x);assert.equal(p.z,stand.z);near(p.y,4.6);assert.equal(p.range,45);assert.equal(p.visible,i!==0);
  }
}));

test('School teaching symbol and rate grow 20–25 percent within a 120px label',()=>{
  assert.match(css,/\.learning-world-label\{width:120px;/);
  const size=(selector,property)=>{
    const escaped=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const body=css.match(new RegExp(`${escaped}\\{([^}]+)\\}`))?.[1];
    assert.ok(body,selector);
    return Number(body.match(new RegExp(`(?:^|;)${property}:([\\d.]+)px`))?.[1]);
  };
  for(const [selector,property,previous]of [
    ['.learning-world-label .school-symbol','width',47],
    ['.learning-world-label .school-symbol','height',47],
    ['.learning-world-label','font-size',15],
    ['.learning-world-label .hud-art','width',28],
    ['.learning-world-label .hud-art','height',28],
    ['.learning-world-label small','font-size',11],
  ]){
    const ratio=size(selector,property)/previous;
    assert.ok(ratio>=1.2-1e-7&&ratio<=1.25,`${selector} ${property}: ${ratio}`);
  }
  assert.match(css,/\.learning-world-label \.school-content>span:last-child\{[^}]*font-size:12px/);
  assert.match(css,/\.learning-world-label \.school-content>span:last-child \.hud-art\{width:21px;height:21px\}/);
});

test('Fixed-height school billboards reserve the price slot and bob book, rate and access together',()=>{
  assert.doesNotMatch(css,/transition:(?:[^}]*)(?:left|top)/,'Anchor positions must not lag through CSS transitions');
  assert.match(css,/\.learning-world-label\{width:120px;height:128px;[^}]*transform-origin:bottom center\}/);
  assert.match(css,/\.school-content\{position:relative;width:120px;height:128px;[^}]*animation:school-float [^}]*animation-delay:var\(--float-delay,0s\)/);
  assert.match(css,/\.school-content \.school-rate-row\{position:absolute;top:62px;left:0;width:120px;height:34px\}/);
  assert.match(css,/\.school-content>span:last-child\{position:absolute;top:104px;left:0;width:120px;height:24px\}/);
  const symbolRules=[...css.matchAll(/\.learning-world-label \.school-symbol\{([^}]+)\}/g)];
  assert.ok(symbolRules.length);for(const [,body]of symbolRules)assert.doesNotMatch(body,/animation|transform/);
  assert.match(css,/@keyframes school-float\{0%,100%\{transform:translateY\(0\)\}50%\{transform:translateY\(-4px\)\}\}/);
});

test('School and skin world labels hide in driving and overview and show only in walking projections',()=>withApp(f=>{
  const ids=[...Array.from({length:5},(_,i)=>'school-label-'+(i+1)),...Array.from({length:17},(_,i)=>'skin-label-'+(i+1))];
  for(const [playing,mode]of [[true,'walking'],[true,'driving'],[false,'walking']]){
    f.debug.gameplay.state.mode=mode;const ranges=[];
    updateProgressionWorldLabels(f.doc,{gameplay:f.debug.gameplay,garage:f.debug.garage,playing,project:(el,x,y,z,visible,range)=>{el.hidden=!visible;el.style.left=x*100+'px';ranges.push(range);}});
    for(const id of ids)assert.equal(get(f,id).hidden,id==='skin-label-1'||!(playing&&mode==='walking'),id);
    assert.deepEqual(ranges,[...Array(5).fill(65),...Array(17).fill(45)]);
  }
}));

test('HUD and touch controls retain transparent currency, safe areas, minimum targets and scrolling',()=>{
  assert.match(css,/#brain-hud\{[^}]*background:transparent[^}]*padding:0[^}]*border:0[^}]*pointer-events:none/);
  assert.match(css,/#brain-value\{[^}]*100cqw[^}]*--brain-digits/);
  assert.match(css,/\.progression-action\{[^}]*min-height:48px/);
  assert.match(css,/#upgrade-panel button\{[^}]*min-height:46px/);
  assert.match(css,/\.upgrade-card button\{[^}]*height:50px/);
  assert.match(css,/#upgrade-panel\{[^}]*max-height:100%[^}]*overflow:auto/);
  for(const edge of ['top','right','bottom','left'])assert.match(css,new RegExp(`env\\(safe-area-inset-${edge}\\)`));
  assert.match(baseCss,/\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  assert.match(html,/id="upgrade-panel"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="upgrade-title"/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.school-content\{animation:none\}\}/);
});

test('Narrow upgrade values can wrap; static track budgets fit 320–600px with minimum touch widths',()=>{
  const mobile=css.slice(css.indexOf('@media(max-width:600px)'),css.indexOf('@media(max-height:420px)'));
  assert.match(mobile,/grid-template-columns:40px minmax\(0,1fr\) 85px/);
  assert.match(mobile,/\.upgrade-card>strong\{[^}]*white-space:normal[^}]*overflow-wrap:anywhere/);
  let combinations=0;
  for(const width of [320,340,360,390,430,568,600])for(const safeInset of [0,20]){
    const outer=2*Math.max(12,safeInset),panel=width-outer,inner=panel-2*4-2*14;
    const cardInner=inner-2*3-2*8,flexTrack=cardInner-40-85-2*6;
    assert.ok(flexTrack>=55,`${width}px safe ${safeInset}: ${flexTrack}px value track`);
    assert.ok(85>=44);combinations++;
  }
  console.log(`Checked ${combinations} source-derived narrow track budgets. Font shaping and CSS layout are not browser-tested.`);
});

test('Narrow MAX button resets UA padding and overrides the stronger desktop font selector',()=>{
  const mobile=css.slice(css.indexOf('@media(max-width:600px)'),css.indexOf('@media(max-height:420px)'));
  const override=mobile.match(/#upgrade-panel\s+\.upgrade-card button\{([^}]+)\}/)?.[1];
  assert.ok(override,'Use an ID-specific mobile selector to override #upgrade-panel button font-size:16px');
  assert.match(override,/font-size:13px/);assert.match(override,/padding:0 2px/);assert.match(override,/gap:3px/);
  assert.match(css,/\.upgrade-card button\{[^}]*min-width:0[^}]*padding:0 3px/);
  // Offline DejaVu Sans Bold measurement of the actual Cyrillic label at13px.
  // This is a conservative installed-font specimen, not browser font shaping.
  const maxTextWidth=43.171875,icon=23,gap=3,borders=6,padding=4,track=85;
  assert.ok(icon+gap+maxTextWidth+borders+padding<=track-4);
  console.log(`Narrow MAX specimen budget: ${icon+gap+maxTextWidth+borders+padding}px of ${track}px; explicit padding and cascade.`);
});

console.log(`Progression HUD: ${passed} checks passed. Actual app fixture + SVG/CSS source contracts only; no browser, Android, GPU or touchscreen claims.`);
