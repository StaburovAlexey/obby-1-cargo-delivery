import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import {createAppDom} from './fixtures/app-dom.mjs';
import {createVehicleLiveryShop} from '../dist/vehicle-livery-shop.js';
import {createVehicleLiveryController,clearVehicleLiveryTextureCache} from '../dist/vehicle-livery-materials.js';
import {VEHICLE_LIVERY_CATALOG} from '../dist/vehicle-livery-catalog.js';
import {cloneVehicleForLiveryPreview} from '../dist/vehicle-livery-preview.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(search='?dev=1') {
 clearVehicleLiveryTextureCache();
 const state={shop:null,controllers:[],waitEnsure:false,ensurePending:[],waitTextures:false,textures:[]};
 const app=createAppDom({search,startDriving:false,
  attachVehicleVisuals(Three,garage){
   for(const vehicle of garage.vehicles){
    const group=new Three.Group(),material=new Three.MeshStandardMaterial({color:0x334455});material.name='Passenger Body';
    const mesh=new Three.Mesh(new Three.BoxGeometry(4.65,3.5,8.64),material);mesh.position.y=1.8;group.add(mesh);vehicle.root.add(group);
    vehicle.visual={group,body:group,mesh,metadata:{id:vehicle.id,bounds:{min:[-2.325,.05,-4.32],max:[2.325,3.55,4.32]},groundClearance:.05}};
   }
   garage.vehicleVisuals={request(){},status:()=> 'loaded',ensure(id){
    const visual=garage.vehicles.find(vehicle=>vehicle.id===id)?.visual;
    return state.waitEnsure?new Promise(resolve=>state.ensurePending.push(()=>resolve(visual))):Promise.resolve(visual);
   }};
  },
  createLiveryShop(doc,options){state.shop=createVehicleLiveryShop(doc,options);return state.shop;},
  createLiveryController(Three,visual,id,options){
   const controller=createVehicleLiveryController(Three,visual,id,{...options,textureLoader:url=>{
    const texture=new Three.DataTexture(new Uint8Array([255,128,64,255]),1,1);
    return state.waitTextures?new Promise(resolve=>state.textures.push({url,resolve:()=>resolve(texture)})):Promise.resolve(texture);
   }});
   state.controllers.push({visual,id,controller});return controller;
  },
 });
 app.frame();
 const vehicle=id=>app.debug.garage.vehicles.find(item=>item.id===id);
 const apply=id=>app.ids.get('vehicle-livery-panel').all().find(node=>node.getAttribute('data-apply-vehicle')===id);
 return {...app,cosmetics:state,vehicle,apply,dispose(){app.dispose();clearVehicleLiveryTextureCache();}};
}
async function selectLivery(f,id,livery) {
 assert.equal(f.cosmetics.shop.preview(id,livery),true);await flush();
 assert.equal(f.apply(id).disabled,false,`${id}/${livery} is selectable in dev`);
 f.apply(id).dispatch('click');await flush();
}

test('dev selects all eight neon colors with no money or payment catalog without granting ownership or saving',async()=>{
 const f=fixture();try{
  const d=f.debug,shop=f.cosmetics.shop;d.gameplay.state.money=0;
  d.gameplay.state.ownedNeonIds=['blue'];d.gameplay.state.selectedNeonId='blue';
  const before=JSON.stringify(d.gameplay.snapshot());shop.open();shop.setSection('neon');
  for(const [id,color]of [['red',0xff254b],['orange',0xff7a18],['yellow',0xffe600],['green',0x39ff64],['cyan',0x00eaff],['blue',0x3575ff],['purple',0xc23cff],['pink',0xff42ba]]){
   shop.previewNeon(id);await flush();assert.equal(f.ids.get('vehicle-neon-apply').disabled,false,id);
   f.ids.get('vehicle-neon-apply').dispatch('click');await flush();f.frame();
   const neon=f.vehicle('pickup').visual.body.getObjectByName('vehicle-underglow');
   assert.equal(neon.visible,true,id);assert.equal(neon.children[0].material.color.getHex(),color,id);
   assert.equal(JSON.stringify(d.gameplay.snapshot()),before,'Dev selections never enter the career');
  }
  shop.close();shop.open();shop.setSection('neon');await flush();
  assert.equal(shop.getNeonSelection(),'pink');assert.equal(f.ids.get('vehicle-neon-apply').disabled,true);
  f.ids.get('vehicle-neon-disable').dispatch('click');f.frame();
  assert.equal(f.vehicle('pickup').visual.body.getObjectByName('vehicle-underglow').visible,false);
  assert.equal(JSON.stringify(d.gameplay.snapshot()),before);
 }finally{f.dispose();}
});

test('dev applies each existing livery to each real car and base restores exact material references',async()=>{
 const f=fixture();try{
  const shop=f.cosmetics.shop,before=JSON.stringify(f.debug.gameplay.snapshot());
  const originals=new Map(VEHICLE_LIVERY_CATALOG.map(item=>[item.id,f.vehicle(item.id).visual.mesh.material]));
  shop.open();shop.setSection('liveries');await flush();
  for(const vehicle of VEHICLE_LIVERY_CATALOG)for(const id of ['neon','anime','racing','biome','base']){
   await selectLivery(f,vehicle.id,id);
   const visual=f.vehicle(vehicle.id).visual;
   assert.deepEqual(visual.group.userData.vehicleLivery,{vehicleId:vehicle.id,liveryId:id});
   if(id==='base')assert.equal(visual.mesh.material,originals.get(vehicle.id));
   else assert.equal(visual.mesh.material.userData.vehicleLivery,true);
  }
  assert.equal(JSON.stringify(f.debug.gameplay.snapshot()),before);
 }finally{f.dispose();}
});

test('committed dev choices survive shop reopen, driving, return to garage and a world rebuild',async()=>{
 const f=fixture();try{
  const shop=f.cosmetics.shop;shop.open();shop.setSection('liveries');await flush();await selectLivery(f,'pickup','anime');
  const first=f.vehicle('pickup').visual,material=first.mesh.material;
  shop.close();assert.equal(first.mesh.material,material);
  shop.open();shop.setSection('liveries');await flush();assert.equal(shop.getSelection('pickup'),'anime');shop.close();
  f.debug.gameplay.state.cooldown=0;assert.equal(f.debug.enterVehicle('pickup'),true);f.frame();assert.equal(first.mesh.material,material);
  f.debug.returnToGarage();f.debug.rebuild(123);f.frame();await flush();
  const next=f.vehicle('pickup').visual;assert.notEqual(next,first);
  assert.deepEqual(next.group.userData.vehicleLivery,{vehicleId:'pickup',liveryId:'anime'});
  assert.equal(f.cosmetics.controllers.find(entry=>entry.visual===first).controller.disposed,true);
  shop.open();shop.setSection('neon');shop.previewNeon('orange');await flush();f.ids.get('vehicle-neon-apply').dispatch('click');await flush();
  shop.close();f.debug.rebuild(124);f.frame();await flush();
  assert.equal(f.vehicle('pickup').visual.body.getObjectByName('vehicle-underglow').visible,true);
 }finally{f.dispose();}
});

test('production keeps nonbase liveries locked and preserves neon payment and coin ownership gates',async()=>{
 const f=fixture('');try{
  const shop=f.cosmetics.shop;f.debug.gameplay.state.money=0;const before=JSON.stringify(f.debug.gameplay.snapshot());
  shop.open();shop.setSection('liveries');await flush();shop.preview('pickup','anime');await flush();
  assert.equal(f.apply('pickup').disabled,true);f.apply('pickup').dispatch('click');await flush();assert.equal(f.cosmetics.controllers.length,0);
  shop.setSection('neon');
  for(const id of ['orange','blue']){shop.previewNeon(id);await flush();assert.equal(f.ids.get('vehicle-neon-apply').disabled,true);f.ids.get('vehicle-neon-apply').dispatch('click');}
  assert.equal(JSON.stringify(f.debug.gameplay.snapshot()),before);
  f.debug.gameplay.state.money=100000;shop.refresh();f.ids.get('vehicle-neon-apply').dispatch('click');await flush();f.frame();
  assert.equal(f.debug.gameplay.state.money,50000);assert.equal(f.debug.gameplay.state.selectedNeonId,'blue');
  assert.deepEqual(f.debug.gameplay.state.ownedNeonIds,['blue']);
 }finally{f.dispose();}
});

test('closing or rebuilding cancels an outstanding dev livery model ensure',async()=>{
 for(const action of ['close','rebuild']){
  const f=fixture();try{
   const shop=f.cosmetics.shop;shop.open();shop.setSection('liveries');await flush();shop.preview('pickup','anime');await flush();
   const original=f.vehicle('pickup').visual.mesh.material;assert.equal(f.apply('pickup').disabled,false);f.cosmetics.waitEnsure=true;f.apply('pickup').dispatch('click');await flush();assert.equal(f.cosmetics.ensurePending.length,1);
   if(action==='close')shop.close();else f.debug.rebuild(125);
   f.cosmetics.waitEnsure=false;for(const finish of f.cosmetics.ensurePending)finish();await flush();
   assert.equal(f.cosmetics.controllers.length,0,action);
   if(action==='close')assert.equal(f.vehicle('pickup').visual.mesh.material,original);
  }finally{f.dispose();}
 }
});

test('late dev livery textures cannot overwrite a newer choice or revive after close and disposal',async()=>{
 const f=fixture();try{
  const shop=f.cosmetics.shop;shop.open();shop.setSection('liveries');await flush();f.cosmetics.waitTextures=true;
  await selectLivery(f,'pickup','anime');await selectLivery(f,'pickup','racing');
  const requests=f.cosmetics.textures;requests.find(item=>item.url.endsWith('/racing.webp')).resolve();await flush();
  assert.equal(f.vehicle('pickup').visual.group.userData.vehicleLivery.liveryId,'racing');
  requests.find(item=>item.url.endsWith('/anime.webp')).resolve();await flush();
  assert.equal(f.vehicle('pickup').visual.group.userData.vehicleLivery.liveryId,'racing');
  await selectLivery(f,'pickup','biome');shop.close();requests.find(item=>item.url.endsWith('/biome.webp')).resolve();await flush();
  assert.equal(f.vehicle('pickup').visual.group.userData.vehicleLivery.liveryId,'racing');
  shop.open();shop.setSection('liveries');await flush();await selectLivery(f,'pickup','neon');
  const visual=f.vehicle('pickup').visual;f.win.dispatch('pagehide',{persisted:false});requests.find(item=>item.url.endsWith('/neon.webp')).resolve();await flush();
  assert.equal(visual.group.userData.vehicleLivery.liveryId,'base');
 }finally{f.dispose();}
});

test('dev livery preparation restores source materials after a texture wait while display quality simplifies the car',async()=>{
 const f=fixture();try{
  const shop=f.cosmetics.shop,vehicle=f.vehicle('pickup'),original=vehicle.visual.mesh.material;
  shop.open();shop.setSection('liveries');await flush();f.cosmetics.waitTextures=true;
  const simplify=()=>f.debug.displayQuality.update({vehicles:[vehicle],camera:f.debug.camera,profile:{materialDistance:0}});
  simplify();assert.equal(vehicle.visual.mesh.material.isMeshLambertMaterial,true);
  await selectLivery(f,'pickup','anime');simplify();assert.equal(vehicle.visual.mesh.material.isMeshLambertMaterial,true);
  f.cosmetics.textures[0].resolve();await flush();
  assert.equal(vehicle.visual.mesh.material.userData.vehicleLivery,true);
  f.cosmetics.waitTextures=false;await selectLivery(f,'pickup','base');assert.equal(vehicle.visual.mesh.material,original);
 }finally{f.dispose();}
});

test('previewing an equipped dev livery clones source materials and leaves the real car equipped',async()=>{
 const f=fixture();let previewController;try{
  const shop=f.cosmetics.shop,visual=f.vehicle('pickup').visual,sourceMaterial=visual.mesh.material,sourceGeometry=visual.mesh.geometry;
  shop.open();shop.setSection('liveries');await flush();await selectLivery(f,'pickup','anime');
  const equippedMaterial=visual.mesh.material,equippedGeometry=visual.mesh.geometry;
  const clone=cloneVehicleForLiveryPreview(visual),mesh=clone.body.children.find(node=>node.isMesh);
  assert.equal(mesh.material,sourceMaterial);assert.equal(mesh.geometry,sourceGeometry);
  previewController=createVehicleLiveryController(THREE,clone,'pickup',{textureLoader:async()=>new THREE.Texture()});
  await previewController.preview('racing');
  assert.equal(previewController.current,'racing');assert.equal(visual.mesh.material,equippedMaterial);assert.equal(visual.mesh.geometry,equippedGeometry);
  assert.deepEqual(visual.group.userData.vehicleLivery,{vehicleId:'pickup',liveryId:'anime'});
 }finally{previewController?.dispose();f.dispose();}
});

test('a newer dev Apply invalidates the previous texture while its model ensure is still pending',async()=>{
 const f=fixture();try{
  const shop=f.cosmetics.shop,visual=f.vehicle('pickup').visual,original=visual.mesh.material;
  shop.open();shop.setSection('liveries');await flush();f.cosmetics.waitTextures=true;await selectLivery(f,'pickup','anime');
  shop.preview('pickup','racing');await flush();f.cosmetics.waitEnsure=true;f.apply('pickup').dispatch('click');await flush();
  assert.equal(f.cosmetics.ensurePending.length,1);f.cosmetics.textures[0].resolve();await flush();
  assert.equal(visual.mesh.material,original,'The superseded texture never reaches the real car');
  f.cosmetics.waitEnsure=false;f.cosmetics.ensurePending[0]();await flush();
  f.cosmetics.textures.find(item=>item.url.endsWith('/racing.webp')).resolve();await flush();
  assert.deepEqual(visual.group.userData.vehicleLivery,{vehicleId:'pickup',liveryId:'racing'});
 }finally{f.dispose();}
});
