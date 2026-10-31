import assert from 'node:assert/strict';
import {createGameplay} from '../dist/gameplay.js';
import {freshCareer,createCareerStore} from '../dist/career-save.js';
import {VEHICLE_CONFIG,DELIVERY_CHECKPOINTS,REWARD_VEHICLE_ID} from '../dist/economy-config.js';
import {createCareerRouteTracker} from '../dist/career-route-tracker.js';
import {earnedRewardCareer,rewardRoutePose} from './fixtures/reward-career.mjs';
const vehicles=VEHICLE_CONFIG.map((v,i)=>({id:v.id,park:{x:24,z:44+11*i}}));
const deliveries=DELIVERY_CHECKPOINTS.map(d=>({...d,...rewardRoutePose(d.progress),radius:4.4}));
const make=options=>createGameplay({vehicles,deliveries,...options});
let writes=0;const baseline={...freshCareer(),money:2345,brains:123};let raw=JSON.stringify(baseline);
const persistence=createCareerStore({storage:{getItem:()=>raw,setItem:(key,value)=>{writes++;raw=value;}}});
for(const developerMode of [undefined,false,'true',1]){
  const g=make({developerMode,career:baseline});assert.equal(g.isOwned(REWARD_VEHICLE_ID),false);assert.equal(g.enter(REWARD_VEHICLE_ID),false);
}
const g=make({developerMode:true,persistence});assert.equal(g.state.developerMode,true);
assert.equal(g.isOwned(REWARD_VEHICLE_ID),true);assert.equal(g.getVehicleAvailability(REWARD_VEHICLE_ID).status,'owned');
assert.equal(g.state.ownedVehicleIds.includes(REWARD_VEHICLE_ID),false);assert.deepEqual(g.snapshot(),baseline);
assert.equal(g.enter(REWARD_VEHICLE_ID),true);assert.equal(g.state.testMode,true);assert.equal(g.state.run,null);
const enter=g.events().find(e=>e.type==='enter');assert.equal(enter.developerPreview,true);assert.equal(enter.runId,null);
const tracker=createCareerRouteTracker();
for(const d of deliveries){tracker.update(g,d,.05);g.drive(0,d.x,d.z);g.tickProgress(.05,{active:true,distance:1});}
const previewCareer={...baseline,brains:baseline.brains+deliveries.length*.05*16};
assert.deepEqual(g.snapshot(),previewCareer);assert.equal(g.events().some(e=>e.type==='delivery'||e.type==='vehicle-unlocked'),false);
assert.equal(g.recordRouteSample({runId:'fake',x:0,z:6,dt:.05}),false);
assert.equal(g.recordBridgeCrossing({runId:'fake',bridgeId:'city-bridge-1'}),false);
g.returnToGarage();g.state.cooldown=0;assert.equal(g.enter(REWARD_VEHICLE_ID),true);assert.equal(g.state.run,null);
g.state.fuels[REWARD_VEHICLE_ID]=0;g.drive(1,0,6);assert.equal(g.state.mode,'walking');
assert.equal(g.isOwned(REWARD_VEHICLE_ID),true);assert.deepEqual(g.snapshot(),previewCareer);


g.claimVehicleFunds();assert.equal(g.claimCareerMission('first-delivery'),false);g.state.player={...vehicles[1].park};g.buy('citycourier');g.flushProgress();
assert.equal(writes,0);assert.equal(raw,JSON.stringify(baseline));
const normal=make({persistence});assert.equal(normal.isOwned(REWARD_VEHICLE_ID),false);assert.deepEqual(normal.snapshot(),baseline);


const earned=make({developerMode:true,career:earnedRewardCareer(),persistence});
assert.equal(earned.enter(REWARD_VEHICLE_ID),true);assert.equal(earned.state.testMode,false);assert.equal(earned.state.run.loaded,true);
earned.returnToGarage();earned.flushProgress();assert.equal(writes,0);
console.log('PASS explicit developer BMW: session-only access and driving XP, no cargo/proof/payout, repeated enter/failure, no save writes and unchanged normal reward lock.');
