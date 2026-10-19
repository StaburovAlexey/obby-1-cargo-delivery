import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import {createAppDom} from './fixtures/app-dom.mjs';
import {createVehicleLiveryShop} from '../dist/vehicle-livery-shop.js';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';
import {getVehiclePerformance} from '../dist/vehicle-upgrades.js';

// The real app and shop run against actual Three.js geometry and simulated DOM.
// Material spies isolate app lifetime/ownership semantics from image decoding.
function make(options={}) {
 const state={shop:null,controllers:[],calls:[],defer:false,pending:[]};
 const app=createAppDom({startDriving:false,...options,
  attachVehicleVisuals(THREE,garage){
   for(const vehicle of garage.vehicles){
    const group=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(4.65,3.5,8.64),new THREE.MeshStandardMaterial({color:0x334455}));
    mesh.position.y=1.8;group.add(mesh);vehicle.root.add(group);
    vehicle.visual={group,mesh,metadata:{bounds:{min:[-2.325,.05,-4.32],max:[2.325,3.55,4.32]},groundClearance:.05}};
   }
  },
  createLiveryShop(doc,callbacks){state.shop=createVehicleLiveryShop(doc,callbacks);return state.shop;},
  createLiveryController(THREE,visual,id){
   const base=visual.mesh.material;
   const controller={visual,id,base,restores:0,disposed:false,epoch:0,
    preview(liveryId){
     state.calls.push({id,liveryId,visual});const token=++this.epoch;
     const apply=()=>{if(this.disposed||token!==this.epoch)return false;visual.mesh.material=liveryId==='base'?base:new THREE.MeshStandardMaterial({color:0xff00ff});return true;};
     return state.defer?new Promise(resolve=>state.pending.push(()=>resolve(apply()))):apply();
    },
    restore(){this.epoch++;this.restores++;visual.mesh.material=base;},
    dispose(){this.restore();this.disposed=true;},
   };state.controllers.push(controller);return controller;
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
  d.gameplay.state.purchaseCandidateId='rover';assert.equal(shop.open(),true);
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

test('all 11 parked cars receive previews without changing ownership, progression, fuel or performance',async()=>{
 const f=make();try{
  const d=f.debug,shop=f.livery.shop;
  const before=JSON.stringify(d.gameplay.snapshot()),state=JSON.stringify({money:d.gameplay.state.money,fuels:d.gameplay.state.fuels,selectedId:d.gameplay.state.selectedId,mode:d.gameplay.state.mode});
  const performance=VEHICLE_CONFIG.map(v=>getVehiclePerformance(v.id,d.gameplay.state.upgrades[v.id]));
  assert.equal(shop.open(),true);
  for(const v of d.garage.vehicles)for(const id of ['neon','anime','racing','biome','base']){
   assert.equal(shop.preview(v.id,id),true);await settle();
   const call=f.livery.calls.at(-1);assert.equal(call.visual,v.visual);assert.equal(call.id,v.id);assert.equal(call.liveryId,id);
   const controller=f.livery.controllers.find(c=>c.id===v.id);
   assert.equal(v.visual.mesh.material===controller.base,id==='base');
  }
  assert.equal(f.livery.controllers.length,11);assert.equal(f.livery.calls.length,55);
  assert.equal(JSON.stringify(d.gameplay.snapshot()),before);
  assert.equal(JSON.stringify({money:d.gameplay.state.money,fuels:d.gameplay.state.fuels,selectedId:d.gameplay.state.selectedId,mode:d.gameplay.state.mode}),state);
  assert.deepEqual(VEHICLE_CONFIG.map(v=>getVehiclePerformance(v.id,d.gameplay.state.upgrades[v.id])),performance);
  shop.close();assert.equal(shop.isOpen(),false);
 }finally{f.dispose();}
});

test('closing restores exact camera and every material before the next render',async()=>{
 const f=make();try{
  const before=pose(f),shop=f.livery.shop;shop.open();
  shop.preview('pickup','neon');shop.preview('bmwreward','anime');await settle();
  assert.notDeepEqual(pose(f),before);
  shop.close();assert.deepEqual(pose(f),before);
  for(const controller of f.livery.controllers)assert.equal(controller.visual.mesh.material,controller.base);
  assert.equal(shop.isOpen(),false);f.frame();assert.equal(shop.isOpen(),false);
 }finally{f.dispose();}
});

test('returning, driving and rebuilding cannot retain preview materials or disposed visual references',async()=>{
 const f=make();try{
  const shop=f.livery.shop;shop.open();shop.preview('pickup','neon');await settle();
  const first=f.livery.controllers[0];f.debug.returnToGarage();
  assert.equal(shop.isOpen(),false);assert.equal(first.visual.mesh.material,first.base);
  f.debug.gameplay.state.cooldown=0;assert.equal(f.debug.enterVehicle('pickup'),true);assert.equal(first.visual.mesh.material,first.base);
  f.debug.returnToGarage();shop.open();shop.preview('pickup','anime');await settle();
  f.debug.rebuild(43);assert.equal(shop.isOpen(),false);assert.equal(first.disposed,true);
  const nextVisual=f.debug.garage.vehicles.find(v=>v.id==='pickup').visual;
  assert.notEqual(nextVisual,first.visual);
  shop.open();shop.preview('pickup','racing');await settle();
  const latest=f.livery.controllers.at(-1);assert.notEqual(latest,first);assert.equal(latest.visual,nextVisual);
 }finally{f.dispose();}
});

test('late preview completion is cancelled on close, rebuild and page exit',async()=>{
 for(const exit of ['close','rebuild','pagehide']){
  const f=make();try{
   f.livery.defer=true;f.livery.shop.open();f.livery.shop.preview('pickup','neon');
   const c=f.livery.controllers[0];
   if(exit==='close')f.livery.shop.close();else if(exit==='rebuild')f.debug.rebuild(44);else f.win.dispatch('pagehide');
   for(const finish of f.livery.pending)finish();await settle();
   assert.equal(c.visual.mesh.material,c.base,exit);assert.ok(c.restores>0,exit);
   assert.equal(f.livery.shop.isOpen(),false,exit);
  }finally{f.dispose();}
 }
});

test('graphics loss closes the shop and restores base',async()=>{
 const f=make();try{
  f.livery.shop.open();f.livery.shop.preview('pickup','biome');await settle();const c=f.livery.controllers[0];
  f.debug.renderer.domElement.dispatch('webglcontextlost');
  assert.equal(f.livery.shop.isOpen(),false);assert.equal(c.visual.mesh.material,c.base);
 }finally{f.dispose();}
});

test('preview camera fits parked car bounds inside the clear phone and desktop area',async()=>{
 for(const [width,height]of [[320,800],[390,844],[844,390],[1440,900]]){
  const f=make({width,height});try{
   f.livery.shop.open();
   for(const id of ['pickup','bmwreward']){
    f.livery.shop.preview(id,'neon');await settle();
    const visual=f.debug.garage.vehicles.find(v=>v.id===id).visual;
    const box=new THREE.Box3().setFromObject(visual.group),panel=f.ids.get('vehicle-livery-panel').bounds;
    const maxX=width<=600?width:panel.left-12,maxY=width<=600?panel.top-12:height;
    for(const x of [box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z]){
     const ndc=new THREE.Vector3(x,y,z).project(f.debug.camera),px=(ndc.x+1)*width/2,py=(1-ndc.y)*height/2;
     assert.ok(px>=0&&px<=maxX,`${id} at ${width}×${height}: x=${px}, visible right edge=${maxX}`);
     assert.ok(py>=0&&py<=maxY,`${id} at ${width}×${height}: y=${py}, visible bottom edge=${maxY}`);
     assert.ok(ndc.z>=-1&&ndc.z<=1,'inside near/far camera planes');
    }
   }
   f.livery.shop.close();assert.equal(f.debug.camera.view,null,'projection restored');
  }finally{f.dispose();}
 }
});

test('preview remains framed after resizing and throughout reward pedestal rotation',async()=>{
 const f=make({width:390,height:844});try{
  const shop=f.livery.shop;shop.open();shop.preview('bmwreward','anime');await settle();
  const reward=f.debug.garage.vehicles.find(v=>v.id==='bmwreward');
  for(const [width,height]of [[390,844],[844,390],[320,800]]){
   f.ids.get('viewport').bounds={left:0,top:0,width,height};
   const panel=f.ids.get('vehicle-livery-panel');
   panel.bounds=width<=600?{left:8,top:height*.45-8,width:width-16,height:height*.55}:{left:width-394,top:14,width:380,height:height-28};
   f.win.dispatch('resize');
   const maxX=width<=600?width:panel.bounds.left-12,maxY=width<=600?panel.bounds.top-12:height;
   for(let i=0;i<=12;i++){
    f.frame(1000+i*(Math.PI*2/.14)*1000/12);
    const bounds=new THREE.Box3().setFromObject(reward.visual.group);
    for(const x of[bounds.min.x,bounds.max.x])for(const y of[bounds.min.y,bounds.max.y])for(const z of[bounds.min.z,bounds.max.z]){
     const p=new THREE.Vector3(x,y,z).project(f.debug.camera),px=(p.x+1)*width/2,py=(1-p.y)*height/2;
     assert.ok(px>=0&&px<=maxX&&py>=0&&py<=maxY,`rotation ${i} at ${width}×${height}: (${px}, ${py}) not inside (${maxX}, ${maxY})`);
    }
   }
  }
  shop.close();assert.equal(f.debug.camera.view,null);assert.equal(f.debug.camera.aspect,320/800);
 }finally{f.dispose();}
});
