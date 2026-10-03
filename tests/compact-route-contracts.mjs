import assert from 'node:assert/strict';
import {BIOME_DEFINITIONS,CHECKPOINT_PROGRESS,FORK_DEFINITIONS,NETWORK_CONFIG} from '../dist/route-network-config.js';
import {ROUTE_LENGTH,routePointAtProgress,routeDistanceAt} from '../dist/route-network.js';
import {BRIDGES,bridgeSupport} from '../dist/road-bridges.js';
import {VEHICLE_CONFIG,DELIVERY_CHECKPOINTS,ECONOMY_CONFIG} from '../dist/economy-config.js';
import {getVehiclePerformance} from '../dist/vehicle-upgrades.js';
import {freshCareer,sanitizeCareer} from '../dist/career-save.js';

const max={speed:10,handling:10,grip:10,fuel:10};
const ranges=[290,380,496,646,841,1095,1425,1855,2413,3140];
const prices=[0,1300,3200,6500,10000,16000,25000,45000,78000,100000];
const payouts=[110,260,470,730,1080,1550,2180,3020,4090,5350,6780,8460,10510,12910,15680,19460];
assert.equal(BIOME_DEFINITIONS.length,5);
assert.equal(FORK_DEFINITIONS.length,4);
assert.equal(CHECKPOINT_PROGRESS.length,16);
assert.deepEqual(CHECKPOINT_PROGRESS.slice(0,3),[180,440,780]);
assert.deepEqual(CHECKPOINT_PROGRESS.slice(-4),[7520,9390,11830,15830]);
assert(ROUTE_LENGTH>15800&&ROUTE_LENGTH<16100);
assert.equal(NETWORK_CONFIG.halfWidth,15);
assert.equal(BRIDGES.length,25);
assert.deepEqual(DELIVERY_CHECKPOINTS.map(p=>p.reward),payouts,'Payout follows checkpoint identity, not shortened metres');
assert.deepEqual(VEHICLE_CONFIG.map(v=>v.price),prices);
assert.deepEqual(VEHICLE_CONFIG.map(v=>v.range),ranges);
assert.equal(ECONOMY_CONFIG.saveKey,'urban-route-career-v1');
let supports=0;
for(const area of BIOME_DEFINITIONS){
 const bridges=BRIDGES.filter(b=>b.biome===area.id);assert.equal(bridges.length,5);
 for(const b of bridges){
  assert.equal(b.halfWidth,2.5);assert.equal(b.to-b.from,24);
  for(const q of [b.from+3,(b.from+b.to)/2,b.to-3]){
   const p=routePointAtProgress(q),pose={x:p.x+p.right.x*b.offset,z:p.z+p.right.z*b.offset,heading:p.heading};
   assert.equal(bridgeSupport(pose,p).fall,false);supports++;
  }
 }
 for(let suffix=1;suffix<=3;suffix++)assert(BRIDGES.some(b=>b.id===`${area.id}-bridge-${suffix}`),'Published mission ID remains valid');
}
for(let i=0;i<VEHICLE_CONFIG.length;i++){
 const v=VEHICLE_CONFIG[i],p=getVehiclePerformance(v.id,max);
 assert(Math.abs(p.range/v.range-1.3)<1e-12);
 assert(Math.abs(p.capacity/v.capacity-1.3)<1e-12);
 assert(Math.abs(v.consumption-v.capacity/v.range)<1e-12);
 if(i)assert(v.range>getVehiclePerformance(VEHICLE_CONFIG[i-1].id,max).range,'Next stock range exceeds previous maximum');
}
// Existing save identities survive the geometry replacement, with no reward
// reset, duplicate first-visit award or reinterpretation of bought upgrades.
const saved=freshCareer();saved.money=123456;saved.brains=9876.75;
saved.ownedVehicleIds=VEHICLE_CONFIG.map(v=>v.id);saved.completedRuns=63;
saved.upgrades=Object.fromEntries(VEHICLE_CONFIG.map(v=>[v.id,{...max}]));
saved.retention.missionSequence=1;saved.retention.missionProgress=1;
saved.retention.missionBridgeIds=['forest-bridge-2'];
saved.retention.claimedCheckpointIds=DELIVERY_CHECKPOINTS.map(p=>p.id);
const restored=sanitizeCareer(saved);
for(const key of ['money','brains','ownedVehicleIds','completedRuns','upgrades','retention'])assert.deepEqual(restored[key],saved[key]);
const finalGap=routeDistanceAt(CHECKPOINT_PROGRESS.at(-1))-routeDistanceAt(CHECKPOINT_PROGRESS.at(-2));
console.log(JSON.stringify({passed:true,routeLength:ROUTE_LENGTH,bridges:BRIDGES.length,centeredSupports:supports,finalGap,unchangedPayouts:payouts.length,savePreserved:true,scope:'Production data and geometry; actual fuel boundaries are covered by separate journey tests'}));
