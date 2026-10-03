import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
import {BRIDGES} from '../dist/road-bridges.js';
import {routePointAtProgress} from '../dist/route-network.js';
const app=createAppDom(),d=app.debug;
try{
 for(const biome of ['forest','desert','snow','volcanic']){
  if(!d.driving){d.gameplay.state.cooldown=0;d.enterVehicle('pickup');}
  d.setBiomeMenu(true);assert.equal(d.travelToBiome(biome),true);
  // Resume has a deliberate zero-dt frame; let the gradual storm begin.
  for(let warm=0;warm<45;warm++)app.frame();
  const b=BRIDGES.find(b=>b.biome===biome),p=routePointAtProgress((b.from+b.to)/2);
  d.model.pause();Object.assign(d.model.state,{x:p.x+p.right.x*(b.offset+1.3),z:p.z+p.right.z*(b.offset+1.3),heading:p.heading});d.applyTruckPose();
  const money=d.gameplay.state.money,brains=d.gameplay.state.brains;
  for(let i=0;i<25;i++){app.frame();assert.equal(d.driving,true);assert.equal(d.biomeWeather.group.visible,true);assert.ok(d.biomeWeather.fog);assert.equal(d.scene.fog.far,d.biomeWeather.fog.far);assert.equal(d.gameplay.state.money,money);assert.equal(d.gameplay.state.brains,brains);}
  for(let i=0;i<100;i++)app.frame();assert.equal(d.driving,false);assert.equal(d.biomeWeather.group.visible,false);assert.equal(d.scene.fog.far,1600);assert.equal(d.gameplay.state.money,money);assert.equal(d.gameplay.state.brains,brains);
 }
 console.log('PASS weather and biome fog persist throughout four-biome falls; garage clears both; no rewards during fall. Actual app CPU, mocked renderer.');
}finally{app.dispose();}
