import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
import {freshCareer} from '../dist/career-save.js';
import {buildBridges,BRIDGES,bridgeSupport} from '../dist/road-bridges.js';
import {routePointAtProgress} from '../dist/route-network.js';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';
assert.deepEqual(buildBridges(42),BRIDGES);assert.notDeepEqual(buildBridges(43),BRIDGES);
for(const biome of new Set(BRIDGES.map(b=>b.biome))){const rows=BRIDGES.filter(b=>b.biome===biome);assert.equal(rows.length,3);assert.ok(rows.some(b=>b.offset<0)&&rows.some(b=>b.offset===0)&&rows.some(b=>b.offset>0));}
for(const b of BRIDGES){assert.ok(Math.abs(b.offset)+b.halfWidth<15);const p=routePointAtProgress((b.from+b.to)/2);for(const delta of [0,-.7,.7,-1.3,1.3]){const s={x:p.x+p.right.x*(b.offset+delta),z:p.z+p.right.z*(b.offset+delta),heading:p.heading};assert.equal(bridgeSupport(s,p).fall,Math.abs(delta)>1);}}
const app=createAppDom({career:{...freshCareer(),money:9876,brains:500,ownedVehicleIds:VEHICLE_CONFIG.map(v=>v.id)}}),d=app.debug;let transitions=0;
try{
 const weather=d.biomeWeather,geometry=weather.group.children[0].geometry,buffer=geometry.attributes.position.array;
 assert.equal(weather.group.visible,false);d.gameplay.state.cooldown=0;d.enterVehicle('ashhauler');
 for(let cycle=0;cycle<4;cycle++)for(const biome of ['city','forest','desert','snow','volcanic']){
  assert.equal(d.setBiomeMenu(true),true);assert.equal(d.travelToBiome(biome),true);app.frame();app.frame();
  assert.equal(weather.group.visible,biome!=='city');assert.equal(d.scene.fog.far,biome==='city'?1600:weather.fog.far);if(biome!=='city')assert.ok(d.scene.fog.far<=300);assert.equal(weather.group.children.length,1);assert.equal(geometry.attributes.position.array,buffer);
  assert.ok(geometry.drawRange.count<=768);assert.equal(d.gameplay.state.money,9876);assert.equal(d.gameplay.state.brains,500);transitions++;
 }
 d.setUpgradeMenu(true);app.frame();assert.equal(weather.group.visible,false);d.setUpgradeMenu(false);app.frame();assert.equal(weather.group.visible,true);
 app.win.dispatch('blur');assert.equal(weather.group.visible,false);app.win.dispatch('focus');app.frame();
 const snapshots=JSON.stringify(d.roadHazards.rocks);assert.ok(d.roadHazards.rocks.every(r=>r.phase==='landed'&&r.altitude===0&&r.rockVisible&&!r.shadowVisible));
 for(let i=0;i<100;i++)d.roadHazards.update(.1,d.model.state,true);d.roadHazards.reset();assert.equal(JSON.stringify(d.roadHazards.rocks),snapshots);
 for(const h of d.roadHazards.hazards.filter(h=>h.type==='rock'))assert.ok(d.roadHazards.contact(h.x,h.z,h.heading));
 assert.equal(d.roadHazardsScene.stats.visibleWarnings,0);assert.equal(d.roadHazardsScene.stats.visibleRocks,d.roadHazards.rocks.length);assert.ok(!d.roadHazardsScene.group.getObjectByName('Rock impact shadow'));assert.ok(!d.roadHazardsScene.group.getObjectByName('Rock warning perimeter'));
 d.returnToGarage();assert.equal(weather.group.visible,false);app.frame();assert.equal(weather.group.visible,false);assert.equal(d.scene.fog.far,1600);
 d.rebuild(42);assert.equal(d.biomeWeather.group.children.length,1);assert.equal(weather.group.children.length,0);
 console.log(JSON.stringify({status:'PASS',transitions,bridges:BRIDGES.length,weatherPool:768,staticRocks:d.roadHazards.rocks.length,scope:'Actual app/Three CPU; mock renderer, not browser/GPU'}));
}finally{app.dispose();}
