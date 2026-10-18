import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDrivingModel} from '../dist/driving-model.js';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';
import {surfaceForBiome} from '../dist/biome-surfaces.js';
import {getUpgradeModifiers,getVehiclePerformance,UPGRADE_STATS} from '../dist/vehicle-upgrades.js';
const biomes=['city','forest','desert','snow','volcanic'],dt=1/120;
const run=(m,t)=>{for(let i=0;i<Math.round(t/dt);i++)m.step(dt);};
const slip=s=>Math.atan2(Math.cos(s.heading)*s.velocityX-Math.sin(s.heading)*s.velocityZ,Math.max(.001,Math.abs(s.speed)))*180/Math.PI;
const make=(v,b,l={})=>createDrivingModel({x:0,z:0,vehicleId:v.id,maxSpeed:v.maxSpeed,getUpgrades:()=>l,groundSurface:()=>surfaceForBiome(b,v.id)});
assert.equal(VEHICLE_CONFIG.length,11);assert.equal(VEHICLE_CONFIG.filter(v=>!v.rewardOnly).length,10);
assert.deepEqual(UPGRADE_STATS.map(x=>x.step),[.01,.03,.02,.03]);
assert.deepEqual(getUpgradeModifiers({speed:10,handling:10,grip:10,fuel:10}),{speed:1.1,engine:1.1,handling:1.3,grip:1.2,fuel:1.3});
const rows=[];
for(const v of VEHICLE_CONFIG)for(const b of biomes){
 const sets={stock:{},handling:{handling:10},grip:{grip:10},max:{speed:10,handling:10,grip:10,fuel:10}};
 const measures={};
 for(const [label,levels]of Object.entries(sets)){
  const m=make(v,b,levels);m.setInput({active:true});run(m,25);const top=m.state.speed;
  m.setInput({active:true,steering:.7});let peakSlip=0,reverse=false;
  for(let i=0;i<360;i++){m.step(dt);peakSlip=Math.max(peakSlip,Math.abs(slip(m.state)));reverse ||=m.state.speed<0;for(const n of Object.values(m.state))if(typeof n==='number')assert.ok(Number.isFinite(n),`${v.id}/${b}/${label} finite`);}
  const cornerSpeed=m.state.speed; m.setInput({active:false,steering:0});run(m,6);const releaseSlip=Math.abs(slip(m.state));
  if(b===v.specialty&&!v.rewardOnly){assert.ok(!reverse,`${v.id}/${label} no own-biome spin`);assert.ok(peakSlip<30,`${v.id}/${label} bounded slip ${peakSlip}`);assert.ok(releaseSlip<2,`${v.id}/${label} recovers ${releaseSlip}`);}
  const brake=make(v,b,levels);brake.state.velocityZ=-10;brake.setInput({brake:1});let brakingDistance=0,brakingTime=0;
  for(let i=0;i<1200 && (i===0 || brake.state.linearSpeed>.1);i++){brake.step(dt);brakingDistance+=brake.state.pathDistance;brakingTime+=dt;}
  assert.ok(brakingTime<10,`${v.id}/${b}/${label} brake stops`);
  const lateral=make(v,b,levels);lateral.state.velocityX=3;lateral.state.velocityZ=-10;let recovery=0;
  do{lateral.step(dt);recovery+=dt;}while(Math.abs(Math.cos(lateral.state.heading)*lateral.state.velocityX-Math.sin(lateral.state.heading)*lateral.state.velocityZ)>.1&&recovery<10);
  const rack=make(v,b,levels);rack.setInput({steering:1});run(rack,.1);
  measures[label]={top,peakSlip,cornerSpeed,releaseSlip,brakingDistance,brakingTime,recovery,rack100ms:Math.abs(rack.state.frontWheelAngle)};
 }
 assert.ok(measures.grip.brakingDistance<measures.stock.brakingDistance*.9,`${v.id}/${b}: meaningful grip braking`);
 assert.ok(measures.grip.recovery<measures.stock.recovery,`${v.id}/${b}: grip recovery`);
 assert.ok(measures.handling.rack100ms>measures.stock.rack100ms,`${v.id}/${b}: live handling`);
 const stock=getVehiclePerformance(v.id,{}),max=getVehiclePerformance(v.id,{handling:10});assert.ok(max.steeringResponseSeconds<stock.steeringResponseSeconds*.71);
 rows.push({vehicle:v.id,biome:b,measures});
}
let levelCases=0;
for(const v of VEHICLE_CONFIG)for(const b of biomes)for(const stat of ['speed','handling','grip']){
 let previous;
 for(let level=0;level<=10;level++){
  const m=make(v,b,{[stat]:level});m.setInput({active:true,steering:.8});run(m,1);
  for(const n of Object.values(m.state))if(typeof n==='number')assert.ok(Number.isFinite(n));
  if(previous)assert.ok(Math.abs(m.state.x-previous.x)+Math.abs(m.state.z-previous.z)+Math.abs(m.state.frontWheelAngle-previous.wheel)>1e-10,`${v.id}/${b}/${stat}${level} live level`);
  previous={x:m.state.x,z:m.state.z,wheel:m.state.frontWheelAngle};levelCases++;
 }
}
fs.mkdirSync(new URL('../qa/handling-grip/',import.meta.url),{recursive:true});
fs.writeFileSync(new URL('../qa/handling-grip/metrics.json',import.meta.url),JSON.stringify({scope:'CPU production solver; not visual/browser/device playtesting',levelCases,rows},null,2)+'\n');
console.log(`PASS ${rows.length} vehicle/biome profiles, ${rows.length*4} long maneuvers, ${levelCases} live-level cases; grip braking/recovery, handling response, finite stock/max steering, no own-biome spins.`);
