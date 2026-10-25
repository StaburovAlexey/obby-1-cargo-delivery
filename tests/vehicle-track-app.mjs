import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
import {createVehicleLiveryShop} from '../dist/vehicle-livery-shop.js';
import {VEHICLE_TRACK_STYLES,DEFAULT_VEHICLE_TRACK_ID} from '../dist/vehicle-track-catalog.js';

const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
function fixture(search='?dev=1'){
 let hooks,shop;
 const f=createAppDom({startDriving:false,search,
  createLiveryShop(doc,options){hooks=options;shop=createVehicleLiveryShop(doc,options);return shop;},
  createNeonPreview(){throw Error('Static icons must not allocate a neon renderer');},
  createLiveryPreview(){throw Error('Static icons must not allocate a livery renderer');},
 });
 return Object.assign(f,{get hooks(){return hooks;},get shop(){return shop;}});
}

test('dev track choices are independent session cosmetics, survive shop and world changes, and icons allocate no viewers',async()=>{
 const f=fixture();try{
  assert.equal(typeof f.hooks.canUseTracks,'function');
  assert.equal(f.hooks.canUseTracks(),true);
  f.debug.gameplay.state.money=0;
  const before=JSON.stringify(f.debug.gameplay.snapshot());
  f.shop.open();assert.equal(f.shop.setSection('tracks'),true);
  for(const style of VEHICLE_TRACK_STYLES){
   assert.equal(f.shop.previewTrack(style.id),true);
   f.ids.get('vehicle-track-apply').dispatch('click');await flush();
   assert.equal(f.debug.canyon.effects.trackStyleId,style.id);
   assert.equal(f.hooks.getSelectedTrackId(),style.id);
  }
  assert.equal(f.debug.canyon.effects.smokeStyleId,'standard');
  assert.equal(JSON.stringify(f.debug.gameplay.snapshot()),before);
  f.shop.setSection('neon');assert.equal(await f.hooks.onNeonPreview('blue'),true);
  f.shop.setSection('liveries');assert.equal(await f.hooks.onPreview('pickup','anime'),true);
  f.shop.close();f.debug.rebuild(321);f.frame();
  assert.equal(f.debug.canyon.effects.trackStyleId,VEHICLE_TRACK_STYLES.at(-1).id);
  f.shop.open();f.shop.setSection('tracks');
  assert.equal(f.shop.getTrackSelection(),VEHICLE_TRACK_STYLES.at(-1).id);
 }finally{f.dispose();}
});

test('normal mode cannot apply dev tracks or spend coins through the track callback',()=>{
 const normal=fixture('');try{
  assert.equal(typeof normal.hooks.onTrackApply,'function');
  normal.shop.open();const before=JSON.stringify(normal.debug.gameplay.snapshot());
  assert.equal(normal.hooks.canUseTracks(),false);
  assert.equal(normal.shop.setSection('tracks'),false);
  assert.equal(normal.hooks.onTrackApply('fire'),false);
  assert.equal(normal.debug.canyon.effects.trackStyleId,DEFAULT_VEHICLE_TRACK_ID);
  assert.equal(JSON.stringify(normal.debug.gameplay.snapshot()),before);
 }finally{normal.dispose();}
});
