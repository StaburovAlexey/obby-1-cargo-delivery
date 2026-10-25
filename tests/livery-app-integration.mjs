import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import {createAppDom} from './fixtures/app-dom.mjs';
import {createVehicleLiveryShop} from '../dist/vehicle-livery-shop.js';
import {VEHICLE_CONFIG,ECONOMY_CONFIG} from '../dist/economy-config.js';
import {getVehiclePerformance} from '../dist/vehicle-upgrades.js';
import {VEHICLE_LIVERY_CATALOG} from '../dist/vehicle-livery-catalog.js';

// The real app and shop run against actual Three.js geometry and simulated DOM.
// Static previews must never instantiate a Three.js viewer or edit gameplay materials.
function make(options={}) {
 const state={shop:null,previewFactoryCalls:[]};
 const previewFactory=name=>()=>{state.previewFactoryCalls.push(name);throw new Error(`Static shop must not allocate ${name}`);};
 const app=createAppDom({startDriving:false,...options,
  attachVehicleVisuals(THREE,garage){
   for(const vehicle of garage.vehicles){
    const group=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(4.65,3.5,8.64),new THREE.MeshStandardMaterial({color:0x334455}));
    mesh.position.y=1.8;group.add(mesh);vehicle.root.add(group);
    vehicle.visual={group,body:group,mesh,metadata:{bounds:{min:[-2.325,.05,-4.32],max:[2.325,3.55,4.32]},groundClearance:.05}};
   }
   // Mirror the shared app fixture contract: these visuals are already available.
   garage.vehicleVisuals={request(){},ensure:id=>Promise.resolve(garage.vehicles.find(vehicle=>vehicle.id===id)?.visual),status:()=> 'loaded'};
  },
  createLiveryShop(doc,callbacks){state.shop=createVehicleLiveryShop(doc,callbacks);return state.shop;},
  createNeonPreview:previewFactory('neon viewer'),
  createLiveryController:previewFactory('hangar livery controller'),
  createLiveryPreview:previewFactory('livery gallery'),
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

test('all 11 catalog cars use static livery images without changing hangar, ownership, progression, fuel or performance',async()=>{
 const f=make();try{
  const d=f.debug,shop=f.livery.shop;
  const before=JSON.stringify(d.gameplay.snapshot()),state=JSON.stringify({money:d.gameplay.state.money,fuels:d.gameplay.state.fuels,selectedId:d.gameplay.state.selectedId,mode:d.gameplay.state.mode});
  const performance=VEHICLE_CONFIG.map(v=>getVehiclePerformance(v.id,d.gameplay.state.upgrades[v.id]));
  const materials=d.garage.vehicles.map(v=>v.visual.mesh.material),camera=pose(f);
  assert.equal(VEHICLE_LIVERY_CATALOG.length,11);assert.equal(shop.open(),true);shop.setSection('liveries');
  for(const v of VEHICLE_LIVERY_CATALOG)for(const id of ['neon','anime','racing','biome','base']){
   assert.equal(shop.preview(v.id,id),true);await settle();
   assert.equal(shop.getSelection(v.id),id);
   const slide=shop.getPreviewHost(v.id).children.find(node=>node.getAttribute('data-cosmetic-id')===id);
   const image=slide.children.find(node=>node.tagName==='IMG');
   assert.ok(image.src.endsWith(`/shop-previews/liveries/${v.id}/${id}.webp`),`${v.id}/${id} uses its static car image`);
   assert.equal(image.getAttribute('loading'),'lazy');
   assert.deepEqual(d.garage.vehicles.map(v=>v.visual.mesh.material),materials);assert.deepEqual(pose(f),camera);
  }
  assert.equal(shop.preview('bmwe30','base'),false,'Extra developer cars have no livery catalogue entries');
  assert.equal(f.ids.get('vehicle-livery-panel').all().filter(node=>node.tagName==='CANVAS').length,0);
  assert.deepEqual(f.livery.previewFactoryCalls,[]);
  assert.equal(JSON.stringify(d.gameplay.snapshot()),before);
  assert.equal(JSON.stringify({money:d.gameplay.state.money,fuels:d.gameplay.state.fuels,selectedId:d.gameplay.state.selectedId,mode:d.gameplay.state.mode}),state);
  assert.deepEqual(VEHICLE_CONFIG.map(v=>getVehiclePerformance(v.id,d.gameplay.state.upgrades[v.id])),performance);
  shop.close();assert.equal(shop.isOpen(),false);
 }finally{f.dispose();}
});

test('closing resets uncommitted static choices without moving the gameplay camera or materials',async()=>{
 const f=make();try{
  const before=pose(f),materials=f.debug.garage.vehicles.map(v=>v.visual.mesh.material),shop=f.livery.shop;shop.open();shop.setSection('liveries');
  shop.preview('pickup','neon');shop.preview('bmwreward','anime');await settle();assert.deepEqual(pose(f),before);
  assert.equal(shop.getSelection('bmwreward'),'anime');shop.close();assert.deepEqual(pose(f),before);
  for(const vehicle of VEHICLE_LIVERY_CATALOG)assert.equal(shop.getSelection(vehicle.id),'base');
  assert.deepEqual(f.debug.garage.vehicles.map(v=>v.visual.mesh.material),materials);assert.deepEqual(f.livery.previewFactoryCalls,[]);
  f.frame();assert.equal(shop.isOpen(),false);
 }finally{f.dispose();}
});

test('returning, driving and rebuilding close static previews and preserve new garage visual references',async()=>{
 const f=make();try{
  const shop=f.livery.shop,first=f.debug.garage.vehicles.find(v=>v.id==='pickup').visual;
  shop.open();shop.setSection('liveries');shop.preview('pickup','neon');await settle();
  f.debug.returnToGarage();assert.equal(shop.isOpen(),false);assert.equal(shop.getSelection('pickup'),'base');
  f.debug.gameplay.state.cooldown=0;assert.equal(f.debug.enterVehicle('pickup'),true);
  f.debug.returnToGarage();shop.open();shop.setSection('liveries');shop.preview('pickup','anime');await settle();
  f.debug.rebuild(43);assert.equal(shop.isOpen(),false);assert.equal(shop.getSelection('pickup'),'base');
  const nextVisual=f.debug.garage.vehicles.find(v=>v.id==='pickup').visual;assert.notEqual(nextVisual,first);
  const material=nextVisual.mesh.material;
  shop.open();shop.setSection('liveries');assert.equal(shop.preview('pickup','racing'),true);await settle();
  assert.equal(nextVisual.mesh.material,material);assert.deepEqual(f.livery.previewFactoryCalls,[]);
  assert.ok(shop.getPreviewHost('pickup').all().some(node=>node.tagName==='IMG'&&node.src?.endsWith('/pickup/racing.webp')));
 }finally{f.dispose();}
});

test('late image failure after close, rebuild or page exit cannot revive a preview or mutate gameplay',async()=>{
 for(const exit of ['close','rebuild','pagehide']){
  const f=make();try{
   const materials=f.debug.garage.vehicles.map(v=>v.visual.mesh.material),before=JSON.stringify(f.debug.gameplay.snapshot()),shop=f.livery.shop;
   shop.open();shop.setSection('liveries');shop.preview('pickup','anime');
   const image=shop.getPreviewHost('pickup').all().find(node=>node.tagName==='IMG'&&node.src?.endsWith('/anime.webp'));assert.ok(image);
   if(exit==='close')shop.close();else if(exit==='rebuild')f.debug.rebuild(44);else f.win.dispatch('pagehide');
   image.dispatch('error');await settle();
   assert.equal(shop.isOpen(),false,exit);assert.equal(shop.getSelection('pickup'),'base',exit);assert.deepEqual(f.livery.previewFactoryCalls,[]);
   if(exit!=='rebuild'){
    assert.deepEqual(f.debug.garage.vehicles.map(v=>v.visual.mesh.material),materials);
    assert.equal(JSON.stringify(f.debug.gameplay.snapshot()),before);
   }
   if(exit==='pagehide')assert.equal(f.ids.get('vehicle-livery-menu'),undefined,'Page exit removes the static dialog');
  }finally{f.dispose();}
 }
});

test('graphics loss closes the static shop and leaves hangar materials intact',async()=>{
 const f=make();try{
  const shop=f.livery.shop,materials=f.debug.garage.vehicles.map(v=>v.visual.mesh.material);
  shop.open();shop.setSection('liveries');shop.preview('pickup','biome');await settle();
  f.debug.renderer.domElement.dispatch('webglcontextlost');
  assert.equal(shop.isOpen(),false);assert.equal(shop.getSelection('pickup'),'base');
  assert.deepEqual(f.debug.garage.vehicles.map(v=>v.visual.mesh.material),materials);assert.deepEqual(f.livery.previewFactoryCalls,[]);
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

test('closing and reopening cannot revive an uncommitted choice when its old image fails',async()=>{
 const f=make();try{
  const shop=f.livery.shop;shop.open();shop.setSection('liveries');shop.preview('pickup','anime');
  const image=shop.getPreviewHost('pickup').all().find(node=>node.tagName==='IMG'&&node.src?.endsWith('/anime.webp'));assert.ok(image);
  shop.close();shop.open();shop.setSection('liveries');assert.equal(shop.getSelection('pickup'),'base');
  image.dispatch('error');await settle();assert.equal(shop.getSelection('pickup'),'base');
  const apply=f.ids.get('vehicle-livery-panel').all().find(node=>node.getAttribute('data-apply-vehicle')==='pickup');
  assert.equal(apply.disabled,false,'An unrelated failed image never disables the standard selection');assert.deepEqual(f.livery.previewFactoryCalls,[]);
 }finally{f.dispose();}
});

test('category navigation uses all eight static neon images and never creates a preview renderer or saves',async()=>{
 const f=make();try{
  const shop=f.livery.shop,before=JSON.stringify(f.debug.gameplay.state),camera=pose(f);
  shop.open();assert.equal(shop.getSection(),'categories');assert.deepEqual(f.livery.previewFactoryCalls,[]);
  shop.setSection('neon');await settle();
  for(const id of ['red','orange','yellow','green','cyan','blue','purple','pink']){
   assert.equal(shop.previewNeon(id),true);await settle();assert.equal(shop.getNeonSelection(),id);
   const image=shop.getNeonPreviewHost().all().find(node=>node.tagName==='IMG'&&node.src?.endsWith(`/shop-previews/neon/${id}.webp`));assert.ok(image,id);
  }
  assert.equal(JSON.stringify(f.debug.gameplay.state),before);assert.deepEqual(pose(f),camera);
  assert.equal(shop.setSection('categories'),true);assert.equal(shop.previewNeon('red'),false);
  shop.setSection('liveries');await settle();assert.equal(shop.getSelection('pickup'),'base');
  assert.equal(shop.previewNeon('blue'),false);shop.setSection('neon');await settle();
  shop.close();assert.equal(shop.previewNeon('blue'),false);assert.deepEqual(f.livery.previewFactoryCalls,[]);
  assert.equal(f.ids.get('vehicle-livery-panel').all().filter(node=>node.tagName==='CANVAS').length,0);
  f.win.dispatch('pagehide',{persisted:false});assert.equal(f.ids.get('vehicle-livery-menu'),undefined);
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
