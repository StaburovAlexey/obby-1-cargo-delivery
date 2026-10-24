import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {buildCity} from '../dist/network-scene.js';
import {createGarageScene} from '../dist/garage-scene.js';

const city=buildCity(THREE);
after(()=>city.dispose());
const pose=station=>({position:station.canister.position.toArray(),rotation:station.canister.rotation.toArray()});

test('only visible fuel and delivery decorations animate and hidden decorations catch up when visible',()=>{
 const garage=createGarageScene(THREE,city,{document:null});
 try{
  const checkpoints=[...garage.stations,...garage.deliveries],before=checkpoints.map(pose);
  const visible=new Set([garage.stations[0].group,garage.deliveries[0].group]);
  garage.animate(2,{isVisible:group=>visible.has(group)});
  for(const [i,station] of checkpoints.entries()){
   if(visible.has(station.group))assert.equal(station.canister.rotation.y,1.36);
   else assert.deepEqual(pose(station),before[i],station.id);
  }
  const hiddenFuel=garage.stations[1],hiddenDelivery=garage.deliveries[1];
  visible.add(hiddenFuel.group);visible.add(hiddenDelivery.group);
  garage.animate(1000,{isVisible:group=>visible.has(group)});
  for(const station of [hiddenFuel,hiddenDelivery])assert.equal(station.canister.rotation.y,680.91);
 }finally{garage.dispose();}
});

test('calling animate without visibility options retains all checkpoint animations',()=>{
 const garage=createGarageScene(THREE,city,{document:null});
 try{
  const checkpoints=[...garage.stations,...garage.deliveries],before=checkpoints.map(pose);
  garage.animate(2);
  for(const [i,station] of checkpoints.entries())assert.notDeepEqual(pose(station),before[i],station.id);
 }finally{garage.dispose();}
});
