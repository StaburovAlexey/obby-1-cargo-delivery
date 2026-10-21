import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
import {createVehicleLiveryShop} from '../dist/vehicle-livery-shop.js';
const settle=async()=>{await Promise.resolve();await Promise.resolve();};
function make(options={}){
 let shop,callbacks;
 const f=createAppDom({startDriving:false,devServer:true,...options,createLiveryShop(doc,host){callbacks=host;shop=createVehicleLiveryShop(doc,host);return shop;}});
 f.frame();return {...f,get shop(){return shop;},get callbacks(){return callbacks;}};
}
test('dev smoke choice equips every car, survives rebuilding and never writes normal progress',async()=>{
 let writes=0;const f=make({storage:{getItem:()=>null,setItem(){writes++;}}});
 try{
  await settle();assert.equal(f.shop.open(),true);assert.equal(f.shop.setSection('smoke'),true);
  const apply=f.ids.get('vehicle-smoke-apply');
  for(const id of ['flowers','hearts','skulls','coins','smileys','standard']){
   assert.equal(f.shop.previewSmoke(id),true);apply.dispatch('click');
   assert.equal(f.debug.canyon.effects.smokeStyleId,id);
  }
  f.shop.previewSmoke('hearts');apply.dispatch('click');f.shop.close();
  const effects=f.debug.canyon.effects;
  for(const car of f.debug.garage.vehicles){
   f.debug.gameplay.state.cooldown=0;assert.equal(f.debug.enterVehicle(car.id),true,car.id);
   assert.equal(f.debug.canyon.effects,effects,'all cars share the selected effects pool');
   assert.equal(effects.smokeStyleId,'hearts',car.id);f.debug.returnToGarage();
  }
  f.debug.rebuild(43);await settle();assert.equal(f.debug.canyon.effects.smokeStyleId,'hearts');
  f.shop.open();f.shop.setSection('smoke');assert.equal(f.shop.getSmokeSelection(),'hearts');
  f.shop.previewSmoke('skulls');f.shop.close();assert.equal(f.debug.canyon.effects.smokeStyleId,'hearts','unapplied preview changes nothing');
  assert.equal(writes,0);
 }finally{f.dispose();}
});
test('ordinary mode keeps standard smoke and rejects direct cosmetic equip requests',async()=>{
 const f=make({search:'?dev=0'});
 try{
  await settle();assert.equal(f.debug.developerMode,false);assert.equal(f.shop.open(),true);
  assert.equal(f.shop.setSection('smoke'),false);
  assert.equal(f.callbacks.onSmokeApply('hearts'),false,'host rechecks mode independently of the DOM');
  assert.equal(f.debug.canyon.effects.smokeStyleId,'standard');
 }finally{f.dispose();}
});

test('lazy carousel icons without a source cannot block the real startup gate',async()=>{
 const decoded=[];const f=make({realStartup:true,decodeImage:image=>{
  decoded.push(image);
  return image.src?Promise.resolve():Promise.reject(new Error('The source image cannot be decoded.'));
 }});
 try{
  for(let i=0;i<12;i++){await new Promise(resolve=>setImmediate(resolve));f.frame();}
  assert.equal(f.debug.startup.ready,true,'initial loading must ignore unopened lazy carousel images');
  assert.ok(decoded.every(image=>image.src&&image.getAttribute('loading')!=='lazy'));
 }finally{f.dispose();}
});
