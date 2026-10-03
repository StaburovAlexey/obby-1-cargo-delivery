import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
import {BIOME_DESTINATIONS} from '../dist/biome-travel.js';
for(const search of ['', '?dev=0','?dev=true','?dev=1']){
 const f=createAppDom({search});try{
 const d=f.debug,dev=search==='?dev=1';
 assert.equal(d.developerMode,dev);assert.equal(f.ids.get('mode-toggle').hidden,!dev);assert.equal(f.ids.get('biome-button').hidden,!dev);
 const before={x:d.model.state.x,z:d.model.state.z,money:d.gameplay.state.money,brains:d.gameplay.state.brains,proof:d.gameplay.state.routeCompletion};
 if(!dev){
  f.ids.get('mode-toggle').dispatch('click');assert(d.playing);d.setDriving(false);assert(d.playing);
  for(const destination of BIOME_DESTINATIONS){assert.equal(d.setBiomeMenu(true),false);assert.equal(d.travelToBiome(destination.id),false);f.ids.get('biome-go-'+destination.id).dispatch('click');}
  assert(!d.biomeMenuOpen);assert.equal(d.model.state.x,before.x);assert.equal(d.model.state.z,before.z);
 }else{
  f.ids.get('mode-toggle').dispatch('click');assert(!d.playing);f.ids.get('mode-toggle').dispatch('click');assert(d.playing);
  for(const destination of BIOME_DESTINATIONS){assert(d.setBiomeMenu(true));assert(d.travelToBiome(destination.id));assert(d.gameplay.state.testMode);}
 }
 assert.equal(d.gameplay.state.money,before.money);assert.equal(d.gameplay.state.brains,before.brains);assert.equal(d.gameplay.state.routeCompletion,before.proof);
 d.returnToGarage();assert.equal(f.ids.get('mode-toggle').hidden,!dev);assert(f.ids.get('biome-button').hidden);assert(!d.setBiomeMenu(true));
 }finally{f.dispose();}
}
console.log('PASS dev-only overview and all six travel destinations: hidden/guarded production, explicit dev=1, garage, toggles, no reward/proof changes.');
