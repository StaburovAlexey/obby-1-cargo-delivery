import assert from 'node:assert/strict';
import test from 'node:test';
import {createGameplay} from '../dist/gameplay.js';
import {SCHOOL_CONFIG,SKIN_CONFIG} from '../dist/progression-config.js';
import {updateProgressionHud,updateProgressionWorldLabels} from '../dist/progression-hud.js';
import * as projection from '../dist/world-label-projection.js';
import {createInputDom} from './fixtures/vehicle-input-dom.mjs';

function budgetDom(){
 const dom=createInputDom(),Element=dom.wheel.constructor,nodes=new Map(),count={reads:0,writes:0};
 const element=()=>{
  const node=new Element();
  for(const property of ['hidden','textContent','disabled']){let value=node[property];Object.defineProperty(node,property,{get:()=>value,set:next=>{count.writes++;value=next;},configurable:true});}
  node.dataset=new Proxy(node.dataset,{set:(target,key,value)=>{count.writes++;target[key]=value;return true;}});
  const setProperty=node.style.setProperty;node.style.setProperty=(...args)=>{count.writes++;setProperty(...args);};
  const setAttribute=node.setAttribute.bind(node);node.setAttribute=(...args)=>{count.writes++;setAttribute(...args);};
  const toggle=node.classList.toggle;node.classList.toggle=(...args)=>{count.writes++;return toggle(...args);};
  return node;
 };
 dom.doc.body=element();dom.doc.getElementById=id=>{count.reads++;if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
 return {...dom,nodes,count,reset:()=>{count.reads=count.writes=0;}};
}
const garage={classroomEntries:SCHOOL_CONFIG.map((s,i)=>({id:s.id,labelAnchor:{x:i*8,y:5,z:20}})),stands:SKIN_CONFIG.map((_,i)=>({x:i*6,y:.16,z:10}))};

test('unchanged progression HUD avoids repeated element queries and content writes while purchase availability stays immediate',()=>{
 const f=budgetDom(),gameplay=createGameplay(),options={gameplay,playing:true,driving:false,upgradeMenuOpen:false};
 gameplay.state.skinPurchaseCandidateId=SKIN_CONFIG[1].id;gameplay.state.money=1000;
 updateProgressionHud(f.doc,options);f.reset();
 for(let frame=0;frame<60;frame++)updateProgressionHud(f.doc,options);
 assert.equal(f.count.reads,0,'stable HUD must reuse element references');
 assert.equal(f.count.writes,0,'stable HUD must not rewrite unchanged persistent content');
 gameplay.state.jump.airborne=true;updateProgressionHud(f.doc,options);
 assert.equal(f.nodes.get('buy-skin').hidden,true,'purchase prompt hides immediately on jump');
 gameplay.state.jump.airborne=false;gameplay.state.skinPurchaseCandidateId=null;updateProgressionHud(f.doc,options);
 assert.equal(f.nodes.get('buy-skin').hidden,true,'leaving purchase range hides prompt immediately');
 gameplay.state.skinPurchaseCandidateId=SKIN_CONFIG[1].id;updateProgressionHud(f.doc,options);
 assert.equal(f.nodes.get('buy-skin').hidden,false,'re-entering range shows prompt immediately');
 gameplay.state.money=0;updateProgressionHud(f.doc,options);
 assert.equal(f.nodes.get('buy-skin').dataset.affordable,'false');
});

test('world labels project moving views every frame without repeating persistent label content',()=>{
 const f=budgetDom(),gameplay=createGameplay();let projected=0,depth=0;
 const project=(element)=>{projected++;return depth;};
 const options={gameplay,garage,playing:true,project};
 updateProgressionWorldLabels(f.doc,options);f.reset();projected=0;
 for(let frame=0;frame<60;frame++){depth+=.001;updateProgressionWorldLabels(f.doc,options);}
 assert.ok(projected>=60*5,'camera-dependent visible labels keep per-frame projection');
 assert.equal(f.count.reads,0,'stable world labels must reuse element references');
 assert.equal(f.count.writes,0,'rates, prices, ownership and layer styles do not change with camera motion');
 gameplay.state.ownedSchoolIds.push('school-2');updateProgressionWorldLabels(f.doc,options);
 assert.equal(f.nodes.get('school-access-2').hidden,true,'ownership change refreshes without waiting for a timer');
 assert.equal(f.nodes.get('school-price-2').textContent,'');
});

test('hidden walking label categories skip projection and restore after mode and garage changes',()=>{
 const f=budgetDom(),gameplay=createGameplay();let projected=0;
 const project=element=>{projected++;if(element.hidden)element.hidden=false;return 0;};
 const options={gameplay,garage,playing:true,project};updateProgressionWorldLabels(f.doc,options);
 gameplay.state.mode='driving';projected=0;updateProgressionWorldLabels(f.doc,options);
 assert.equal(projected,0,'hidden school/skin categories do not project');
 assert.equal(f.nodes.get('school-label-1').hidden,true);
 gameplay.state.mode='walking';updateProgressionWorldLabels(f.doc,{...options,garage:{...garage}});
 assert.ok(projected>0);assert.equal(f.nodes.get('school-label-1').hidden,false);
});

test('viewport rectangles reuse layout reads until resize, scroll and explicit layout invalidation',()=>{
 assert.equal(typeof projection.createViewportRectCache,'function','viewport layout cache is available');
 const dom=createInputDom(),Element=dom.wheel.constructor;
 const viewport=new Element(),canvas=new Element(),layer=new Element();let reads=0;
 for(const [element,rect]of [[viewport,{left:24,top:37,width:720,height:360}],[canvas,{left:24,top:37,width:720,height:360}],[layer,{left:7,top:13,width:850,height:900}]]){
  element.bounds=rect;element.getBoundingClientRect=()=>{reads++;return element.bounds;};
 }
 const cache=projection.createViewportRectCache({viewport,canvas,layer,window:dom.win,document:dom.doc,fallback:()=>({left:0,top:0,width:390,height:844})});
 assert.deepEqual(projection.projectLabelPixel({x:.5,y:.2},cache.read().canvas,cache.read().layer),{x:557,y:168});
 for(let i=0;i<120;i++)cache.read();assert.equal(reads,3,'stable frames perform only the initial three layout reads');
 canvas.bounds={left:24,top:37,width:360,height:720};viewport.bounds=canvas.bounds;dom.win.dispatch('resize');
 assert.equal(cache.read().canvas.width,360);assert.equal(reads,6);
 layer.bounds={left:17,top:23,width:850,height:900};dom.win.dispatch('scroll');
 assert.deepEqual(projection.projectLabelPixel({x:.5,y:.2},cache.read().canvas,cache.read().layer),{x:277,y:302});assert.equal(reads,9);
 canvas.bounds={left:54,top:37,width:360,height:720};cache.invalidate();assert.equal(cache.read().canvas.left,54);assert.equal(reads,12);
 cache.dispose();
});

test('app stable frames read no label layout rectangles while camera motion still updates visible positions',async()=>{
 const {createAppDom}=await import('./fixtures/app-dom.mjs');const f=createAppDom({startDriving:false});
 try{
  Object.assign(f.debug.gameplay.state.player,{x:-41,z:78,heading:0});f.debug.followCharacter(1,true);f.frame();
  let layoutReads=0;
  for(const node of [f.ids.get('viewport'),f.debug.renderer.domElement,f.ids.get('world-labels')]){
   const read=node.getBoundingClientRect.bind(node);node.getBoundingClientRect=()=>{layoutReads++;return read();};
  }
  const label=f.ids.get('school-label-3'),left=label.style.left;
  assert.equal(label.hidden,false,'the camera starts with the centre school sign visible');
  f.debug.gameplay.state.player.x+=2;f.debug.followCharacter(1,true);
  for(let i=0;i<6;i++)f.frame();
  assert.equal(layoutReads,0,'camera movement does not invalidate DOM layout rectangles');
  assert.notEqual(label.style.left,left,'world labels move with the camera on rendered frames');
  f.ids.get('viewport').bounds={left:20,top:30,width:640,height:360};f.ids.get('world-labels').bounds={left:7,top:13,width:640,height:360};
  f.win.dispatch('resize');f.frame();assert.ok(layoutReads>=3);assert.equal(f.debug.camera.aspect,640/360);
 }finally{f.dispose();}
});

test('walking app skips hidden delivery availability work and stable vehicle label writes',async()=>{
 const {createAppDom}=await import('./fixtures/app-dom.mjs');const f=createAppDom({startDriving:false});
 try{
  f.frame();let availabilityReads=0,hiddenWrites=0;
  const gameplay=f.debug.gameplay,available=gameplay.getDeliveryAvailability;
  gameplay.getDeliveryAvailability=(...args)=>{availabilityReads++;return available(...args);};
  for(let i=1;i<=f.debug.garage.vehicles.length;i++){
   const label=f.ids.get('vehicle-price-'+i);let hidden=label.hidden;
   Object.defineProperty(label,'hidden',{get:()=>hidden,set:value=>{hiddenWrites++;hidden=value;}});
  }
  for(let i=0;i<6;i++)f.frame();
  assert.equal(availabilityReads,0,'walking does not recompute hidden delivery text');
  assert.equal(hiddenWrites,0,'economy polling does not toggle culled vehicle labels each frame');
 }finally{f.dispose();}
});

test('modal and release restrictions are applied before persistent HUD visibility writes',()=>{
 const f=budgetDom(),gameplay=createGameplay();gameplay.state.skinPurchaseCandidateId=SKIN_CONFIG[1].id;
 const options={gameplay,playing:true,driving:false,upgradeMenuOpen:false,purchaseMenuOpen:true,vehicleFundsAvailable:false};
 updateProgressionHud(f.doc,options);
 assert.equal(f.nodes.get('buy-skin').hidden,true,'purchase prompt stays hidden behind an open modal');
 assert.equal(f.nodes.get('vehicle-funds-button').hidden,true,'developer funds control stays hidden in release mode');
 f.reset();updateProgressionHud(f.doc,options);assert.equal(f.count.writes,0);
});
