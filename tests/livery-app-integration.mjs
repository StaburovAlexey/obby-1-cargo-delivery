import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import {createAppDom} from './fixtures/app-dom.mjs';
import {createVehicleLiveryShop} from '../dist/vehicle-livery-shop.js';
import {VEHICLE_CONFIG,ECONOMY_CONFIG} from '../dist/economy-config.js';
import {getVehiclePerformance} from '../dist/vehicle-upgrades.js';

// The real app and shop run against actual Three.js geometry and simulated DOM.
// Material spies isolate app lifetime/ownership semantics from image decoding.
function make(options={}) {
 const state={shop:null,controllers:[],neons:[],neonCalls:[],calls:[],defer:false,pending:[]};
 const app=createAppDom({startDriving:false,...options,
  attachVehicleVisuals(THREE,garage){
   for(const vehicle of garage.vehicles){
    const group=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(4.65,3.5,8.64),new THREE.MeshStandardMaterial({color:0x334455}));
    mesh.position.y=1.8;group.add(mesh);vehicle.root.add(group);
    vehicle.visual={group,body:group,mesh,metadata:{bounds:{min:[-2.325,.05,-4.32],max:[2.325,3.55,4.32]},groundClearance:.05}};
   }
  },
  createLiveryShop(doc,callbacks){state.shop=createVehicleLiveryShop(doc,callbacks);return state.shop;},
  createNeonPreview(THREE,host){const preview={host,closed:0,disposed:false,show(visual,id){state.neonCalls.push({visual,id});return true;},close(){this.closed++;},dispose(){this.disposed=true;}};state.neons.push(preview);return preview;},
  createLiveryController(){throw new Error('Preview must never create a hangar livery controller');},
  createLiveryPreview(THREE,host){
   const preview={host,closed:0,disposed:false,epoch:0,current:null,
    show(visual,id,liveryId){
     state.calls.push({id,liveryId,visual});const token=++this.epoch;
     const apply=()=>{if(this.disposed||token!==this.epoch)return false;this.current={visual,id,liveryId};return true;};
     return state.defer?new Promise(resolve=>state.pending.push(()=>resolve(apply()))):apply();
    },
    close(){this.epoch++;this.closed++;this.current=null;},
    dispose(){this.close();this.disposed=true;},
   };state.controllers.push(preview);return preview;
  },
 });
 const width=options.width??390,height=options.height??844;
 const panel=app.ids.get('vehicle-livery-panel');
 panel.bounds=width<=600?{left:8,top:height*.45-8,width:width-16,height:height*.55}:{left:width-394,top:14,width:380,height:height-28};
 app.frame();return {...app,livery:state};
}
const settle=async()=>{await Promise.resolve();await Promise.resolve();};
const pose=app=>({position:app.debug.camera.position.toArray(),quaternion:app.debug.camera.quaternion.toArray(),target:app.debug.controls.target.toArray(),view:app.debug.camera.view?{...app.debug.camera.view}:null});

// UI presence must not itself open or pause the game.
test('livery shop opens only on request and is hangar-only',()=>{
 const f=make();try{
  const shop=f.livery.shop,button=f.ids.get('livery-shop-button');
  assert.equal(shop.isOpen(),false);assert.equal(button.hidden,false);
  button.dispatch('click');assert.equal(shop.isOpen(),true);
  f.doc.dispatch('keydown',{key:'Escape'});assert.equal(shop.isOpen(),false);assert.equal(f.doc.activeElement,button);
  f.frame();assert.equal(shop.isOpen(),false,'HUD refresh must not reopen the shop');
  f.debug.gameplay.state.player.x=500;f.debug.gameplay.state.player.z=500;f.frame();
  assert.equal(button.hidden,true);assert.equal(shop.open(),false);
  f.debug.returnToGarage();assert.equal(button.hidden,false);f.debug.gameplay.state.cooldown=0;
  assert.equal(f.debug.enterVehicle('pickup'),true);assert.equal(button.hidden,true);assert.equal(shop.open(),false);
 }finally{f.dispose();}
});

test('preview pauses gameplay and gates controls, purchases, other modals and developer views',async()=>{
 const f=make({search:'?dev=1'});try{
  const d=f.debug,shop=f.livery.shop;
  d.gameplay.state.purchaseCandidateId='rover';assert.equal(shop.open(),true);shop.setSection('liveries');
  assert.equal(f.ids.get('buy-vehicle').hidden,true);assert.equal(f.ids.get('hangar-drift-button').hidden,true);
  const before=JSON.stringify(d.gameplay.snapshot()),player={...d.gameplay.state.player},camera=pose(f),hazards=d.roadHazards.elapsed;
  f.win.dispatch('keydown',{code:'KeyW',key:'w',target:{tagName:'BODY'}});
  f.win.dispatch('keydown',{code:'Digit1',key:'1',target:{tagName:'BODY'}});
  for(let i=0;i<12;i++)f.frame();
  assert.deepEqual(d.gameplay.state.player,player);assert.equal(d.roadHazards.elapsed,hazards);assert.deepEqual(pose(f),camera);
  assert.equal(d.enterVehicle('pickup'),false);assert.equal(d.requestJump(),false);assert.equal(d.setDriving(false),false);
  assert.equal(d.setUpgradeMenu(true),false);assert.equal(d.setBiomeMenu(true),false);
  assert.equal(await d.hangarLeaderboardUi.open(),false);
  for(const id of ['buy-vehicle','buy-skin','buy-school','vehicle-funds-button'])f.ids.get(id).dispatch('click');
  assert.equal(JSON.stringify(d.gameplay.snapshot()),before);
  const canvas=d.renderer.domElement;canvas.dispatch('pointerdown',{pointerId:1,button:0,clientX:0,clientY:0});
  assert.equal(d.lookInput.active,false);assert.equal(d.controls.enabled,false);
  d.settingsUi.open();assert.equal(shop.isOpen(),false);assert.equal(d.settingsMenuOpen,true);
  assert.equal(shop.open(),false);d.settingsUi.close();
 }finally{f.dispose();}
});

test('all 11 cars preview in an isolated viewer without changing hangar, ownership, progression, fuel or performance',async()=>{
 const f=make();try{
  const d=f.debug,shop=f.livery.shop;
  const before=JSON.stringify(d.gameplay.snapshot()),state=JSON.stringify({money:d.gameplay.state.money,fuels:d.gameplay.state.fuels,selectedId:d.gameplay.state.selectedId,mode:d.gameplay.state.mode});
  const performance=VEHICLE_CONFIG.map(v=>getVehiclePerformance(v.id,d.gameplay.state.upgrades[v.id]));
  const materials=d.garage.vehicles.map(v=>v.visual.mesh.material),camera=pose(f);
  assert.equal(shop.open(),true);shop.setSection('liveries');
  for(const v of d.garage.vehicles)for(const id of ['neon','anime','racing','biome','base']){
   assert.equal(shop.preview(v.id,id),true);await settle();
   const call=f.livery.calls.at(-1);assert.equal(call.visual,v.visual);assert.equal(call.id,v.id);assert.equal(call.liveryId,id);
   assert.deepEqual(d.garage.vehicles.map(v=>v.visual.mesh.material),materials);
   assert.deepEqual(pose(f),camera);
  }
  assert.equal(f.livery.controllers.length,1);assert.equal(f.livery.calls.length,66);
  assert.equal(f.livery.controllers[0].host('pickup'),shop.getPreviewHost('pickup'));
  assert.equal(JSON.stringify(d.gameplay.snapshot()),before);
  assert.equal(JSON.stringify({money:d.gameplay.state.money,fuels:d.gameplay.state.fuels,selectedId:d.gameplay.state.selectedId,mode:d.gameplay.state.mode}),state);
  assert.deepEqual(VEHICLE_CONFIG.map(v=>getVehiclePerformance(v.id,d.gameplay.state.upgrades[v.id])),performance);
  shop.close();assert.equal(shop.isOpen(),false);
 }finally{f.dispose();}
});

test('closing clears the dedicated preview without moving the gameplay camera or materials',async()=>{
 const f=make();try{
  const before=pose(f),materials=f.debug.garage.vehicles.map(v=>v.visual.mesh.material),shop=f.livery.shop;shop.open();shop.setSection('liveries');
  shop.preview('pickup','neon');shop.preview('bmwreward','anime');await settle();
  assert.deepEqual(pose(f),before);
  assert.equal(f.livery.controllers[0].current.id,'bmwreward');
  shop.close();assert.deepEqual(pose(f),before);
  assert.equal(f.livery.controllers[0].current,null);
  assert.deepEqual(f.debug.garage.vehicles.map(v=>v.visual.mesh.material),materials);
  f.frame();assert.equal(shop.isOpen(),false);
 }finally{f.dispose();}
});

test('returning, driving and rebuilding release preview and use only current visual references',async()=>{
 const f=make();try{
  const shop=f.livery.shop;shop.open();shop.setSection('liveries');shop.preview('pickup','neon');await settle();
  const preview=f.livery.controllers[0],first=preview.current.visual;
  f.debug.returnToGarage();assert.equal(shop.isOpen(),false);assert.equal(preview.current,null);
  f.debug.gameplay.state.cooldown=0;assert.equal(f.debug.enterVehicle('pickup'),true);
  f.debug.returnToGarage();shop.open();shop.setSection('liveries');shop.preview('pickup','anime');await settle();
  f.debug.rebuild(43);assert.equal(shop.isOpen(),false);assert.equal(preview.current,null);
  const nextVisual=f.debug.garage.vehicles.find(v=>v.id==='pickup').visual;
  assert.notEqual(nextVisual,first);
  shop.open();shop.setSection('liveries');shop.preview('pickup','racing');await settle();
  assert.equal(f.livery.controllers.at(-1).current.visual,nextVisual);
 }finally{f.dispose();}
});

test('late preview completion is cancelled on close, rebuild and page exit',async()=>{
 for(const exit of ['close','rebuild','pagehide']){
  const f=make();try{
   const materials=f.debug.garage.vehicles.map(v=>v.visual.mesh.material);
   f.livery.defer=true;f.livery.shop.open();f.livery.shop.setSection('liveries');f.livery.shop.preview('pickup','neon');
   const preview=f.livery.controllers[0];
   if(exit==='close')f.livery.shop.close();else if(exit==='rebuild')f.debug.rebuild(44);else f.win.dispatch('pagehide');
   for(const finish of f.livery.pending)finish();await settle();
   assert.equal(preview.current,null,exit);assert.ok(preview.closed>0,exit);
   assert.equal(f.livery.shop.isOpen(),false,exit);
   if(exit!=='rebuild')assert.deepEqual(f.debug.garage.vehicles.map(v=>v.visual.mesh.material),materials);
   if(exit==='pagehide')assert.equal(preview.disposed,true);
  }finally{f.dispose();}
 }
});

test('graphics loss closes shop and releases isolated preview',async()=>{
 const f=make();try{
  f.livery.shop.open();f.livery.shop.setSection('liveries');f.livery.shop.preview('pickup','biome');await settle();const preview=f.livery.controllers[0];
  f.debug.renderer.domElement.dispatch('webglcontextlost');
  assert.equal(f.livery.shop.isOpen(),false);assert.equal(preview.current,null);
 }finally{f.dispose();}
});

test('resizing never transfers preview framing to the gameplay camera',async()=>{
 const f=make();try{
  f.livery.shop.open();f.livery.shop.setSection('liveries');f.livery.shop.preview('bmwreward','anime');await settle();
  const before=pose(f);
  for(const [width,height]of [[844,390],[320,800],[1440,900]]){
   f.ids.get('viewport').bounds={left:0,top:0,width,height};f.win.dispatch('resize');f.frame();
   const after=pose(f);assert.deepEqual(after.position,before.position);assert.deepEqual(after.quaternion,before.quaternion);
   assert.equal(after.view,null);assert.equal(f.debug.camera.aspect,width/height);
  }
 }finally{f.dispose();}
});

test('Apply is restricted to the owned base finish and never changes ownership or saves',async()=>{
 const f=make();try{
  const shop=f.livery.shop,before=JSON.stringify(f.debug.gameplay.snapshot());
  const stored=f.storage.getItem(ECONOMY_CONFIG.saveKey);
  const apply=f.ids.get('vehicle-livery-panel').all().find(el=>el.getAttribute('data-apply-vehicle')==='pickup');
  shop.open();shop.setSection('liveries');await settle();assert.equal(apply.disabled,false);
  apply.dispatch('click');await settle();assert.equal(apply.disabled,false);
  assert.equal(JSON.stringify(f.debug.gameplay.snapshot()),before);
  for(const skin of ['neon','anime','racing','biome']){
   shop.preview('pickup',skin);await settle();assert.equal(apply.disabled,true);
   apply.dispatch('click');await settle();assert.equal(JSON.stringify(f.debug.gameplay.snapshot()),before);
  }
  assert.equal(f.storage.getItem(ECONOMY_CONFIG.saveKey),stored);
 }finally{f.dispose();}
});

test('closing and reopening cannot revive a stale deferred skin selection',async()=>{
 const f=make();try{
  const shop=f.livery.shop;f.livery.defer=true;
  shop.open();shop.setSection('liveries');shop.preview('pickup','anime');shop.close();shop.open();shop.setSection('liveries');
  const preview=f.livery.controllers[0],pending=[...f.livery.pending];
  pending.at(-1)();await settle();assert.equal(preview.current.liveryId,'base');
  for(const finish of pending.slice(0,-1))finish();await settle();
  assert.equal(preview.current.liveryId,'base');assert.equal(shop.getSelection('pickup'),'base');
 }finally{f.dispose();}
});


test('category navigation routes seven neon colors to isolated BMW preview and cleans up without saving',async()=>{
 const f=make();try{
  const shop=f.livery.shop,before=JSON.stringify(f.debug.gameplay.state),camera=pose(f);
  shop.open();assert.equal(shop.getSection(),'categories');assert.equal(f.livery.calls.length,0);
  shop.setSection('neon');await settle();
  for(const id of ['red','orange','yellow','green','cyan','blue','purple']){assert.equal(shop.previewNeon(id),true);await settle();}
  assert.equal(f.livery.neons.length,1);assert.equal(f.livery.neonCalls.length,8);
  assert.ok(f.livery.neonCalls.every(call=>call.visual===f.debug.garage.vehicles.find(v=>v.id==='bmwreward').visual));
  assert.equal(JSON.stringify(f.debug.gameplay.state),before);assert.deepEqual(pose(f),camera);
  shop.setSection('categories');assert.equal(f.livery.neons[0].closed,1);
  shop.setSection('liveries');await settle();assert.equal(f.livery.calls.length,11);
  shop.setSection('neon');await settle();assert.ok(f.livery.controllers[0].closed>0);
  shop.close();assert.ok(f.livery.neons[0].closed>1);
  f.win.dispatch('pagehide',{persisted:false});assert.equal(f.livery.neons[0].disposed,true);
 }finally{f.dispose();}
});

// Missing host wiring would leave this button inert or apply only to the preview.
test('a neon bought in the real shop equips every hangar car and can be disabled',async()=>{
 const f=make();try{
  f.debug.gameplay.state.money=100000;
  const shop=f.livery.shop;shop.open();shop.setSection('neon');shop.previewNeon('blue');await settle();
  f.ids.get('vehicle-neon-apply').dispatch('click');await settle();f.frame();
  assert.equal(f.debug.gameplay.state.money,50000);assert.equal(f.debug.gameplay.state.selectedNeonId,'blue');
  for(const car of f.debug.garage.vehicles){const neon=car.visual.body.getObjectByName('vehicle-underglow');assert.ok(neon?.visible,car.id);assert.equal(neon.children[0].material.color.getHex(),0x3575ff);}
  f.ids.get('vehicle-neon-disable').dispatch('click');f.frame();assert.equal(f.debug.gameplay.state.selectedNeonId,null);
  for(const car of f.debug.garage.vehicles)assert.equal(car.visual.body.getObjectByName('vehicle-underglow').visible,false);
 }finally{f.dispose();}
});
