
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createInputDom} from './fixtures/vehicle-input-dom.mjs';
import {createRetentionUi,careerNumber} from '../dist/retention-ui.js';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';
import {UPGRADE_STATS,getUpgradeOffer,getVehiclePerformance,UPGRADE_MAX_LEVEL} from '../dist/vehicle-upgrades.js';
import {updateProgressionHud,upgradeValuePresentation} from '../dist/progression-hud.js';
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../dist/progression-ui.css',import.meta.url),'utf8');
let passed=0;const test=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
function fixture({reentrant=false}={}){
  const dom=createInputDom(),Element=dom.root.constructor,ids=new Map();let time=0;
  dom.doc.body=new Element();dom.doc.body.ownerDocument=dom.doc;dom.doc.body.parent=dom.doc;
  for(const [,id]of html.matchAll(/\bid="([^"]+)"/g)){const node=new Element();node.id=id;node.ownerDocument=dom.doc;node.focus=()=>{dom.doc.activeElement=node;};ids.set(id,node);dom.doc.body.append(node);}
  dom.doc.getElementById=id=>ids.get(id)||null;const get=id=>ids.get(id);
  const attach=(parent,child)=>{const node=get(child);if(node.parent)node.parent.children=node.parent.children.filter(item=>item!==node);get(parent).append(node);};
  attach('career-menu','career-panel');attach('delivery-receipt-menu','delivery-receipt');
  for(const id of ['career-title','career-close','career-goal-section','career-mission-section'])attach('career-panel',id);
  for(const id of ['career-goal-content','career-goal-complete'])attach('career-goal-section',id);
  for(const id of ['career-goal-select','career-goal-amount','career-goal-progress','career-goal-remaining'])attach('career-goal-content',id);
  for(const id of [...ids.keys()].filter(id=>id.startsWith('career-goal-option-')||id==='career-goal-placeholder'))attach('career-goal-select',id);
  for(const id of ['career-mission-details','career-mission-empty'])attach('career-mission-section',id);
  for(const id of ['career-mission-name','career-mission-description','career-mission-skip','career-mission-count','career-mission-progress','career-mission-reward'])attach('career-mission-details',id);
  for(const id of [...ids.keys()].filter(id=>id.startsWith('receipt-')||id==='delivery-receipt-close'||id==='delivery-receipt-title'))attach('delivery-receipt',id);
  let owned=new Set(['pickup']),selected=null,money=123,sequence=0,hasMission=true;
  const missions=[{name:'Три доставки',description:'Доставьте три груза.',progress:1,target:3,cash:100,brains:30},{name:'Мосты без аварий',description:'Пройдите два моста без аварий и доставьте груз.',progress:0,target:2,cash:150,brains:40}];
  const gameplay={state:{mode:'walking'},isOwned:id=>owned.has(id),getVehicleGoal:()=>{let v=VEHICLE_CONFIG.find(v=>v.id===selected&&!owned.has(v.id));if(!v)return null;selected=v.id;return {...v,money,remaining:Math.max(0,v.price-money),progress:Math.min(1,money/v.price)};},getCareerMission:()=>hasMission?missions[sequence%2]:null};
  const selections=[],openChanges=[];let skips=0;
  const view={gameplay,playing:true,driving:false,inGarage:true,menuOpen:false};
  const ui=createRetentionUi(dom.doc,{now:()=>time,onSelectGoal:id=>{selected=id;selections.push(id);},onSkipMission:()=>{sequence++;skips++;},onOpenChange:open=>{openChanges.push(open);if(reentrant)ui.update(view);}});
  const update=extra=>{Object.assign(view,extra);ui.update(view);};
  const open=kind=>get('career-'+kind+'-button').dispatch('click');
  return {...dom,ids,get,gameplay,ui,view,update,open,selections,openChanges,setMission:value=>{hasMission=value;},setMoney:n=>{money=n;},setOwned:values=>{owned=new Set(values);},advance:n=>{time+=n;update();},get skips(){return skips;}};
}
const sample={base:120,clean:40,hard:60,first:80,mission:150,brains:{clean:5,hard:10,first:15,mission:40,total:70},totalCash:450};

test('The mission launcher starts closed; retired savings stay hidden and inert',()=>{
  const f=fixture();assert.equal(f.ui.isOpen(),false);
  for(const id of ['career-panel','career-menu','delivery-receipt-menu','career-goal-button','career-mission-button'])assert.equal(f.get(id).hidden,true,id);
  f.open('goal');assert.equal(f.ui.isOpen(),false);
  for(let i=0;i<20;i++)f.update();
  assert.equal(f.get('career-mission-button').hidden,false);assert.equal(f.get('career-goal-button').hidden,true);assert.equal(f.get('career-goal-button').disabled,true);
  for(const id of ['career-panel','career-menu','career-goal-section','career-mission-section'])assert.equal(f.get(id).hidden,true,id);
  f.open('goal');f.get('career-mission-skip').dispatch('click');f.get('career-goal-select').value='citycourier';f.get('career-goal-select').dispatch('change');
  assert.equal(f.ui.isOpen(),false);assert.equal(f.skips,0);assert.equal(f.selections.length,0);assert.deepEqual(f.openChanges,[]);
});
test('Repeated mission open/close and reentrant callbacks remain stable',()=>{
  const f=fixture({reentrant:true});f.update();
  for(let i=0;i<8;i++){
    f.open('mission');assert.equal(f.ui.isOpen(),true);assert.equal(f.get('career-mission-section').hidden,false);assert.equal(f.get('career-goal-section').hidden,true);
    assert.equal(f.get('career-mission-button').getAttribute('aria-expanded'),'true');assert.equal(f.get('career-goal-button').getAttribute('aria-expanded'),'false');
    f.open('goal');assert.equal(f.get('career-goal-section').hidden,true);assert.equal(f.ui.isOpen(),true);
    f.open('mission');assert.equal(f.ui.isOpen(),false);
  }
  assert.deepEqual(f.openChanges,Array.from({length:8},()=>[true,false]).flat());
  f.ui.close();assert.equal(f.openChanges.length,16);assert.equal(f.doc.activeElement,f.get('career-mission-button'));
  for(let i=0;i<10;i++)f.update();assert.equal(f.ui.isOpen(),false);
});
test('Mission modal traps focus, restores inert states and closes via close/Escape/backdrop',()=>{
  const f=fixture();f.update();f.get('viewport').inert=true;
  f.open('mission');assert.equal(f.doc.activeElement,f.get('career-close'));assert.equal(f.get('garage-button').inert,true);assert.notEqual(f.get('career-menu').inert,true);
  const close=f.get('career-close'),skip=f.get('career-mission-skip');
  const reverse=close.dispatch('keydown',{key:'Tab',shiftKey:true});assert.equal(reverse.defaultPrevented,true);assert.equal(f.doc.activeElement,skip);
  const forward=skip.dispatch('keydown',{key:'Tab'});assert.equal(forward.defaultPrevented,true);assert.equal(f.doc.activeElement,close);
  f.get('garage-button').dispatch('focusin');assert.equal(f.doc.activeElement,close);
  f.get('career-panel').dispatch('click');assert.equal(f.ui.isOpen(),true);
  f.get('career-menu').dispatch('click');assert.equal(f.ui.isOpen(),false);assert.notEqual(f.get('garage-button').inert,true);assert.equal(f.get('viewport').inert,true);assert.equal(f.doc.activeElement,f.get('career-mission-button'));
  f.open('mission');close.dispatch('click');assert.equal(f.ui.isOpen(),false);
  f.open('mission');const esc=f.get('career-panel').dispatch('keydown',{key:'Escape'});assert.equal(esc.defaultPrevented,true);assert.equal(esc.stopped,true);assert.equal(f.ui.isOpen(),false);
  f.open('mission');f.doc.dispatch('keydown',{key:'Escape'});assert.equal(f.ui.isOpen(),false);
  f.setMission(false);f.open('mission');close.dispatch('keydown',{key:'Tab'});assert.equal(f.doc.activeElement,close);
});
test('Driving, outdoors, overview, other modals and background close missions without reopening',()=>{
  const f=fixture();f.update();
  for(const extra of [{playing:false},{driving:true},{inGarage:false},{menuOpen:true}]){
    f.open('mission');f.update(extra);assert.equal(f.ui.isOpen(),false);
    for(const id of ['career-panel','career-menu','career-goal-button','career-mission-button'])assert.equal(f.get(id).hidden,true,id);
    f.open('mission');assert.equal(f.ui.isOpen(),false);f.update({playing:true,driving:false,inGarage:true,menuOpen:false});assert.equal(f.ui.isOpen(),false);
  }
  f.open('mission');f.gameplay.state.mode='driving';f.update();assert.equal(f.ui.isOpen(),false);f.gameplay.state.mode='walking';f.update();assert.equal(f.ui.isOpen(),false);
  f.open('mission');f.doc.hidden=true;f.doc.dispatch('visibilitychange');assert.equal(f.ui.isOpen(),false);f.doc.hidden=false;f.doc.dispatch('visibilitychange');assert.equal(f.ui.isOpen(),false);
});
test('Panel events do not bubble; hidden and retired controls cannot mutate the saved goal',()=>{
  const f=fixture();f.update();f.open('mission');
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel','touchstart','touchmove','touchend','wheel','keydown','keyup'])assert.equal(f.get('career-mission-skip').dispatch(type).stopped,true,type);
  f.get('career-mission-skip').dispatch('click');assert.equal(f.skips,1);assert.equal(f.get('career-mission-name').textContent,'Мосты без аварий');assert.equal(f.get('career-mission-count').textContent,'0 / 2');assert.equal(f.get('career-mission-cash').textContent,'+150');
  f.get('career-goal-select').value='citycourier';f.get('career-goal-select').dispatch('change');assert.equal(f.selections.length,0);
  f.ui.close();f.get('career-mission-skip').dispatch('click');assert.equal(f.skips,1);
  f.setMission(false);f.open('mission');assert.equal(f.get('career-mission-empty').hidden,false);f.get('career-mission-skip').dispatch('click');assert.equal(f.skips,1);
});
test('Ownership updates leave savings hidden and do not select or erase goals',()=>{
  const f=fixture();f.update();assert.equal(f.get('career-goal-option-pickup').disabled,true);
  f.setOwned(['pickup','ashhauler']);f.update();assert.equal(f.get('career-goal-option-ashhauler').disabled,true);
  f.setOwned(VEHICLE_CONFIG.map(v=>v.id));f.update();assert.equal(f.get('career-goal-content').hidden,true);assert.equal(f.get('career-goal-complete').hidden,false);assert.equal(f.get('career-goal-select').disabled,true);
  f.open('goal');assert.equal(f.ui.isOpen(),false);assert.equal(f.get('career-goal-button').hidden,true);assert.equal(f.selections.length,0);
});
test('Receipt waits for the hangar, preserves every reward category and pauses game input',()=>{
  const f=fixture({reentrant:true});f.update({driving:true,inGarage:false});f.ui.showDelivery(sample);assert.equal(f.get('delivery-receipt').hidden,true);assert.equal(f.ui.isOpen(),false);
  f.update({driving:false,inGarage:true});assert.equal(f.get('delivery-receipt').hidden,false);assert.equal(f.get('delivery-receipt-menu').hidden,false);assert.equal(f.get('career-panel').hidden,true);assert.equal(f.ui.isOpen(),true);assert.deepEqual(f.openChanges,[true]);
  assert.equal(f.doc.activeElement,f.get('delivery-receipt-close'));assert.equal(f.get('garage-button').inert,true);assert.notEqual(f.get('delivery-receipt-menu').inert,true);
  for(const key of ['base','clean','hard','first','mission']){assert.equal(f.get('receipt-'+key+'-cash').textContent,'+'+sample[key]);assert.equal(f.get('receipt-'+key+'-brains').textContent,sample.brains[key]?'+'+sample.brains[key]:'—');}
  assert.equal(f.get('receipt-total-cash').textContent,'+450');assert.equal(f.get('receipt-total-brains').textContent,'+70');
  f.open('mission');assert.equal(f.get('career-menu').hidden,true,'Receipt cannot overlap a mission');
  f.get('delivery-receipt-close').dispatch('click');assert.equal(f.get('delivery-receipt').hidden,true);assert.equal(f.ui.isOpen(),false);f.update();assert.equal(f.get('delivery-receipt').hidden,true);assert.deepEqual(f.openChanges,[true,false]);
  f.ui.showDelivery({base:0,totalCash:0,brains:{total:15,first:15}});assert.equal(f.get('receipt-total-cash').textContent,'+0');assert.equal(f.get('receipt-total-brains').textContent,'+15');assert.equal(f.ui.isOpen(),true);
});
test('Receipt has no expiry and resumes after background or an interrupting external modal',()=>{
  const f=fixture({reentrant:true});f.update();f.ui.showDelivery(sample);
  for(let i=0;i<100;i++)f.advance(1000);f.advance(60*60*1000);assert.equal(f.get('delivery-receipt').hidden,false);
  for(const extra of [{menuOpen:true},{playing:false},{driving:true},{inGarage:false}]){
    f.update(extra);assert.equal(f.get('delivery-receipt').hidden,true);assert.equal(f.ui.isOpen(),false);f.advance(60000);
    f.update({menuOpen:false,playing:true,driving:false,inGarage:true});assert.equal(f.get('delivery-receipt').hidden,false);assert.equal(f.ui.isOpen(),true);
  }
  f.doc.hidden=true;f.doc.dispatch('visibilitychange');assert.equal(f.ui.isOpen(),false);f.doc.hidden=false;f.doc.dispatch('visibilitychange');assert.equal(f.ui.isOpen(),true);
  f.ui.close();f.advance(60000);assert.equal(f.ui.isOpen(),false);assert.equal(f.get('delivery-receipt').hidden,true);
});
test('Queued receipt waits for task dismissal and switches without a transient input resume',()=>{
  const f=fixture({reentrant:true});f.update();f.open('mission');f.ui.showDelivery(sample);
  assert.equal(f.get('delivery-receipt').hidden,true);assert.equal(f.get('career-menu').hidden,false);assert.deepEqual(f.openChanges,[true]);
  f.get('career-close').dispatch('click');assert.equal(f.get('delivery-receipt').hidden,false);assert.equal(f.get('career-menu').hidden,true);assert.deepEqual(f.openChanges,[true]);
  assert.equal(f.get('career-menu').inert,true);assert.notEqual(f.get('delivery-receipt-menu').inert,true);assert.equal(f.doc.activeElement,f.get('delivery-receipt-close'));
  f.get('delivery-receipt-close').dispatch('click');assert.deepEqual(f.openChanges,[true,false]);assert.notEqual(f.get('career-menu').inert,true);
});
test('Receipt focus trap and pointer blocking allow close, Escape and backdrop dismissal',()=>{
  const f=fixture();f.update();f.get('viewport').inert=true;
  for(const how of ['close','escape','backdrop']){
    f.ui.showDelivery(sample);const close=f.get('delivery-receipt-close');
    for(const shiftKey of [false,true]){const tab=close.dispatch('keydown',{key:'Tab',shiftKey});assert.equal(tab.defaultPrevented,true);assert.equal(f.doc.activeElement,close);}
    f.get('garage-button').dispatch('focusin');assert.equal(f.doc.activeElement,close);
    for(const type of ['pointerdown','pointermove','pointerup','pointercancel','touchstart','touchmove','touchend','wheel','keyup'])assert.equal(close.dispatch(type).stopped,true,type);
    f.get('delivery-receipt').dispatch('click');assert.equal(f.ui.isOpen(),true);
    if(how==='close')close.dispatch('click');else if(how==='escape')f.doc.dispatch('keydown',{key:'Escape'});else f.get('delivery-receipt-menu').dispatch('click');
    assert.equal(f.ui.isOpen(),false);assert.equal(f.doc.activeElement,f.get('career-mission-button'));assert.equal(f.get('viewport').inert,true);assert.notEqual(f.get('garage-button').inert,true);
  }
});
test('Dispose closes exactly once, restores background and removes all listeners',()=>{
  const f=fixture({reentrant:true});f.update();f.open('mission');f.ui.showDelivery(sample);f.ui.dispose();f.ui.dispose();
  assert.deepEqual(f.openChanges,[true,false]);assert.equal(f.ui.isOpen(),false);assert.notEqual(f.get('garage-button').inert,true);
  f.update();f.open('goal');f.ui.showDelivery(sample);f.get('career-mission-skip').dispatch('click');
  for(const id of ['career-panel','career-menu','delivery-receipt','career-goal-button','career-mission-button'])assert.equal(f.get(id).hidden,true,id);
  assert.equal(f.skips,0);for(const node of [f.doc,...f.ids.values()])for(const listeners of node.listeners.values())assert.equal(listeners.size,0);
});
test('Long counters remain exact; markup is icon-only with accessible independent modal and receipt',()=>{
  const f=fixture();f.update();f.ui.showDelivery({...sample,totalCash:1e9,mission:1e9,brains:{total:1e9,mission:1e9}});
  assert.equal(f.get('receipt-total-cash').textContent,'+1\u202f000\u202f000\u202f000');assert.equal(f.get('receipt-mission-brains').textContent,'+1\u202f000\u202f000\u202f000');
  assert.equal(careerNumber(NaN),'0');assert.equal(careerNumber(-9),'0');assert.equal(careerNumber(1999.999),'1\u202f999');
  assert.match(html,/id="career-panel"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="career-title"[^>]*hidden/);assert.match(html,/id="career-goal-select"[^>]*aria-describedby=/);assert.match(html,/id="delivery-receipt"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="delivery-receipt-title"/);
  assert.match(html,/<\/section>\s*<\/div>\s*<div id="delivery-receipt-menu" hidden>\s*<section id="delivery-receipt"/,'Receipt has a dedicated backdrop outside the career modal');
  const actions=html.match(/<div class="top-actions">([\s\S]*?)<\/div>/)[1];
  for(const kind of ['goal','mission']){const button=actions.match(new RegExp(`<button id="career-${kind}-button"([^>]*)>([\\s\\S]*?)<\\/button>`));assert.ok(button);assert.match(button[1],/aria-haspopup="dialog"[^>]*aria-expanded="false"/);assert.match(button[1],/aria-label=/);assert.match(button[1],/title=/);assert.match(button[1],/hidden/);assert.match(button[2],/class="hud-circle"/);assert.equal(button[2].replace(/<[^>]*>/g,'').trim(),'');}
  assert.doesNotMatch(html,/career-mission-toggle|career-chevron/);
  assert.match(css,/#career-panel\{[^}]*max-height:100%;overflow:auto/);assert.match(css,/#career-goal-select\{[^}]*min-height:48px/);assert.match(css,/#career-close\{[^}]*min-height:44px/);assert.match(css,/#delivery-receipt-close\{[^}]*min-height:44px/);assert.match(css,/#career-mission-skip\{[^}]*min-height:44px/);
  assert.match(css,/#delivery-receipt\{[^}]*overflow:auto[^}]*pointer-events:auto/);assert.match(css,/#delivery-receipt table\{[^}]*table-layout:fixed/);assert.match(css,/#delivery-receipt th,#delivery-receipt td\{[^}]*overflow-wrap:anywhere[^}]*white-space:normal/);assert.match(css,/#career-goal-select:focus-visible/);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size,'All IDs unique');
});
test('Portrait/landscape CSS budgets keep round launchers clear of exact balances and walking controls',()=>{
  assert.match(css,/\.career-actions-visible \.top-actions\{display:grid;grid-template-columns:repeat\(2,48px\);gap:6px;width:102px/);
  assert.match(css,/\.career-actions-visible \.top-actions\{display:flex;gap:8px;width:100%;--top-actions-width:268px;--top-icon-size:56px/);
  assert.match(css,/#career-menu\{[^}]*inset:0;display:grid;place-items:center;[^}]*env\(safe-area-inset-bottom\)/);
  const baseCss=fs.readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');assert.match(baseCss,/\.hud-circle\s*\{[^}]*border-radius:\s*50%/);
  for(const width of [320,360,390,430,600])for(const safe of [0,20]){
    const header=width-2*Math.max(13,safe+8),actions=102,icon=44;
    const walletDigits=header-actions-icon-5-12,brainDigits=header-115-icon-12;
    assert.ok(walletDigits/(10*.68)>=13,`Ten exact wallet digits remain readable at ${width}/${safe}`);
    assert.ok(brainDigits/(10*.68)>=13,`Ten exact brain digits remain readable at ${width}/${safe}`);
    const actionsBottom=Math.max(12,safe+7)+64+6+44,stickTop=320-Math.max(20,safe)-112;
    assert.ok(actionsBottom<stickTop,`Narrow-phone 2×2 group clears walking controls at ${width}/${safe}`);
  }
  for(const width of [501,568,667,844])for(const height of [320,360,500])for(const safe of [0,20]){
    const header=width-2*Math.max(13,safe+8),actions=4*61+3*8,icon=height<=420?48:56;
    assert.equal(actions,268);assert.ok((header-actions-icon-6-12)/(10*.68)>=13,`Landscape exact wallet fits at ${width}×${height}/${safe}`);
    assert.ok(Math.max(9,safe+4)+78<height-Math.max(20,safe)-112,'Landscape icons stay above walking controls');
  }
  for(const biome of ['forest','desert','snow','volcanic'])assert.match(html,new RegExp(`id="hard-route-${biome}-fork"[^>]*class="world-price hard-route-price"`));
});
test('All 440 real upgrade presentations match physics and show max without a false next level',()=>{
  let count=0;
  for(const car of VEHICLE_CONFIG)for(const stat of UPGRADE_STATS)for(let level=0;level<=UPGRADE_MAX_LEVEL;level++){
    const levels={[stat.id]:level},offer=getUpgradeOffer(car.id,stat.id,levels),p=upgradeValuePresentation(stat.id,offer),physical=getVehiclePerformance(car.id,levels);
    assert.deepEqual(offer.currentPerformance,physical);
    assert.equal(p.value.includes('→'),level<UPGRADE_MAX_LEVEL);assert.ok(p.detail.length>10);
    if(stat.id==='speed')assert.ok(p.value.startsWith((physical.maxSpeed*3.6).toFixed(1).replace('.',',')));
    if(stat.id==='handling'){assert.ok(p.value.startsWith(String(Math.round(physical.steeringResponseSeconds*1000))));assert.match(p.value,/мс$/);}
    if(stat.id==='grip')assert.ok(p.value.startsWith(physical.grip.toFixed(3).replace('.',',')));
    if(stat.id==='fuel'){assert.ok(p.detail.includes(physical.range.toFixed(1).replace('.',',').replace(/,0$/,'')));assert.match(p.detail,/Заправка отдельно/);if(!offer.maxed)assert.ok(p.detail.includes(`(+${(offer.nextPerformance.range-physical.range).toFixed(1).replace('.',',').replace(/,0$/,'')} м)`));}
    count++;
  }
  assert.equal(count,440);
});
test('Upgrade purchase refreshes visible before/after, remaining brains, next price and max state',()=>{
  const f=fixture(),state={...f.gameplay.state,brains:1e9,money:0,selectedId:'pickup',upgrades:{pickup:{}},jump:{airborne:false},vehicleGrantClaimed:true};
  const gameplay={state,isSkinOwned:()=>true,isSchoolOwned:()=>true};
  for(let level=0;level<=UPGRADE_MAX_LEVEL;level++){
    state.upgrades.pickup={speed:level,handling:level,grip:level,fuel:level};
    updateProgressionHud(f.doc,{gameplay,playing:true,driving:true,upgradeMenuOpen:true});
    for(const stat of UPGRADE_STATS){const offer=getUpgradeOffer('pickup',stat.id,state.upgrades.pickup),p=upgradeValuePresentation(stat.id,offer),prefix='upgrade-'+stat.id;assert.equal(f.get(prefix+'-value').textContent,p.value);assert.equal(f.get(prefix+'-description').textContent,p.detail);assert.equal(f.get(prefix+'-level').textContent,`${level} / ${UPGRADE_MAX_LEVEL}`);assert.equal(f.get(prefix+'-price').textContent,offer.maxed?'МАКС':String(offer.price));assert.equal(f.get(prefix+'-buy').disabled,offer.maxed);}
  }
  state.brains=0;state.upgrades.pickup={};updateProgressionHud(f.doc,{gameplay,playing:true,driving:true,upgradeMenuOpen:true});for(const stat of UPGRADE_STATS)assert.equal(f.get('upgrade-'+stat.id+'-buy').disabled,true);assert.equal(f.get('brain-value').textContent,'0');
});
console.log(`Retention UI: ${passed} checks passed; deterministic DOM/events and CSS contracts, no browser layout claims.`);
