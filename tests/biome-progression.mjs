import assert from 'node:assert/strict';
import test from 'node:test';
import {createGameplay} from '../dist/gameplay.js';
import {freshCareer,sanitizeCareer,createCareerStore} from '../dist/career-save.js';
import {VEHICLE_CONFIG,DELIVERY_CHECKPOINTS} from '../dist/economy-config.js';
import {createCareerRouteTracker} from '../dist/career-route-tracker.js';
import {routePointAtProgress} from '../dist/route-network.js';
import {rewardRoutePose} from './fixtures/reward-career.mjs';

const vehicles=VEHICLE_CONFIG.map((v,i)=>({id:v.id,park:{x:40,z:40+i*20}}));
const checkpoint=DELIVERY_CHECKPOINTS[7],point=routePointAtProgress(checkpoint.progress);
const delivery={...checkpoint,id:'delivery-'+checkpoint.id,x:point.x-8*point.right.x,z:point.z-8*point.right.z,radius:4.4};
const make=(options={})=>createGameplay({vehicles,deliveries:[delivery],...options});
const cityCareer=()=>({...freshCareer(),ownedVehicleIds:['pickup','citycourier']});
function feed(game,end,{from=-6,tracker=createCareerRouteTracker()}={}){
 for(let q=from;q<end;q+=2){tracker.update(game,rewardRoutePose(q),.05);assert.ok(game.state.run?.loaded,'valid road telemetry at '+q);}
 tracker.update(game,rewardRoutePose(end),.05);assert.ok(game.state.run?.loaded);return tracker;
}

// Catches future cars being purchasable using only money, before any real visit.
test('money alone cannot buy a future biome car, while the city upgrade remains available',()=>{
 const game=make({career:{...freshCareer(),money:1_000_000}});
 assert.equal(game.getVehicleAvailability('citycourier').purchasable,true);
 const availability=game.getVehicleAvailability('rover');assert.equal(availability.purchasable,false);assert.equal(availability.reason,'discover-biome');assert.equal(availability.biomeId,'forest');
 game.state.player={...vehicles[2].park};assert.equal(game.buy('rover'),false);assert.equal(game.state.money,1_000_000);assert.equal(game.events().at(-1).reason,'discover-biome');
});

// Catches first-visit progress not being recorded or being lost when an unpaid run ends.
test('a continuous old-car visit opens the biome once and survives garage return and reload',()=>{
 let raw=null;const storage={getItem:()=>raw,setItem:(key,value)=>{raw=value;}},store=createCareerStore({storage});
 const game=make({career:cityCareer(),persistence:store});assert.ok(game.enter('citycourier'));
 const tracker=feed(game,3000);assert.deepEqual(game.state.discoveredBiomeIds,['city']);
 feed(game,3026,{from:3002,tracker});assert.deepEqual(game.state.discoveredBiomeIds,['city','forest']);
 assert.equal(game.getVehicleAvailability('rover').purchasable,true);assert.equal(game.state.money,0);assert.equal(game.state.completedRuns,0);
 feed(game,3050,{from:3028,tracker});assert.equal(game.events().filter(e=>e.type==='biome-discovered').length,1);
 game.returnToGarage('fall');const reload=make({persistence:store});assert.deepEqual(reload.state.discoveredBiomeIds,['city','forest']);assert.equal(reload.isOwned('rover'),false);assert.equal(reload.state.run,null);
});

// Catches teleport, preview and walking paths granting a biome without a continuous trip.
test('teleports, walking, stale runs and biome previews cannot open a biome',()=>{
 for(const mode of ['drive-teleport','sample-teleport','walking','preview','stale']){
  const game=make({career:cityCareer()});if(mode!=='walking')game.enter('citycourier');const pose=routePointAtProgress(3050),runId=game.state.run?.id;
  if(mode==='preview')game.beginBiomeTest('forest');
  if(mode==='drive-teleport')game.drive(0,pose.x,pose.z);
  else game.recordRouteSample({runId:mode==='stale'?'old-id':runId,x:pose.x,z:pose.z,dt:.05});
  assert.deepEqual(game.state.discoveredBiomeIds,['city'],mode);assert.equal(game.getVehicleAvailability('rover').purchasable,false,mode);
 }
});

// Catches save sanitization dropping discoveries or trusting pre-migration checkpoint claims.
test('migration preserves owned tiers and currency without treating old first-claim history as visits',()=>{
 const old={...freshCareer(),money:555,brains:123.5,ownedVehicleIds:['pickup','van']};delete old.discoveredBiomeIds;
 const migrated=sanitizeCareer(old);assert.deepEqual(migrated.discoveredBiomeIds,['city','forest','desert']);assert.equal(migrated.money,555);assert.equal(migrated.brains,123.5);assert.deepEqual(migrated.ownedVehicleIds,['pickup','van']);
 const legacy={version:2,money:999,ownedVehicleIds:['pickup'],completedRuns:100};
 const noVisits=sanitizeCareer(legacy);assert.equal(noVisits.retention.claimedCheckpointIds.length,16);assert.deepEqual(noVisits.discoveredBiomeIds,['city']);
 const discovered=sanitizeCareer({...cityCareer(),discoveredBiomeIds:['city','forest','forest','unknown','volcanic']});assert.deepEqual(discovered.discoveredBiomeIds,['city','forest']);assert.deepEqual(sanitizeCareer(discovered),discovered);
});

// Catches accidental getter execution and malformed lists unlocking future purchases.
test('malformed discovery lists are bounded and never invoke array getters',()=>{
 let calls=0;const ids=['city'];Object.defineProperty(ids,0,{get(){calls++;return 'volcanic';}});
 for(const value of [null,{},['volcanic'],ids,new Array(2000)]){
  const safe=sanitizeCareer({...freshCareer(),discoveredBiomeIds:value});assert.deepEqual(safe.discoveredBiomeIds,['city']);
 }
 assert.equal(calls,0);
});

// Catches a reachable checkpoint silently refusing an old-car delivery after discovery.
test('a discovered biome accepts a loaded old-car delivery once',()=>{
 const game=make({career:{...cityCareer(),discoveredBiomeIds:['city','forest']}});game.enter('citycourier');game.events();const run=game.state.run;
 game.drive(0,delivery.x,delivery.z);game.drive(0,delivery.x,delivery.z);
 assert.equal(game.state.money,3775);assert.equal(game.state.completedRuns,1);assert.equal(game.state.run,null);assert.equal(run.loaded,false);assert.equal(game.getCareerMission().progress,1);
 const events=game.events();assert.equal(events.filter(e=>e.type==='delivery').length,1);assert.equal(events.filter(e=>e.type==='delivery-denied').length,0);
});

// Catches delivery gating breaking appropriate local and later-tier cars.
test('local and later-tier cars can deliver in the biome and earn one endpoint payout',()=>{
 for(const id of ['rover','foresthauler','van']){
  const game=make({career:{...freshCareer(),ownedVehicleIds:['pickup',id]}});game.enter(id);game.events();game.drive(0,delivery.x,delivery.z);
  assert.equal(game.state.money,3775,id);assert.equal(game.state.completedRuns,1);assert.equal(game.events().filter(e=>e.type==='delivery').length,1);
 }
});

// Catches failed discovery saves not being retried, or an already valid visit being revoked.
test('discovery save failure is visible and retry preserves the visit after an invalid later sample',()=>{
 let raw=null,blocked=true;const store=createCareerStore({storage:{getItem:()=>raw,setItem:(key,value)=>{if(blocked)throw Error('offline');raw=value;}}});
 const game=make({career:cityCareer(),persistence:store});game.enter('citycourier');feed(game,3026);assert.equal(game.state.saveFailed,true);
 const runId=game.state.run.id;assert.equal(game.recordRouteSample({runId,x:99999,z:99999,dt:.05}),false);assert.deepEqual(game.state.discoveredBiomeIds,['city','forest']);
 blocked=false;assert.ok(game.flushProgress());assert.deepEqual(make({persistence:store}).state.discoveredBiomeIds,['city','forest']);
});

// Catches prices not reaching the real purchase operation or accidentally granting ownership.
test('approved late prices are paid in full only after the biome is discovered',()=>{
 for(const [id,price] of [['snowrunner',30000],['lavacrawler',50000],['ashhauler',85000]]){
  const game=make({career:{...freshCareer(),money:price,discoveredBiomeIds:['city','forest','desert','snow','volcanic']}});
  game.state.player={...vehicles.find(v=>v.id===id).park};assert.ok(game.buy(id),id);assert.equal(game.state.money,0,id);assert.equal(game.isOwned(id),true);
 }
});
