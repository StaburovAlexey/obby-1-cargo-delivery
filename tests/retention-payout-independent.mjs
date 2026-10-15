#!/usr/bin/env node

import assert from 'node:assert/strict';
import {createGameplay} from '../dist/gameplay.js';
import {freshCareer,sanitizeCareer,createCareerStore} from '../dist/career-save.js';
import {ECONOMY_CONFIG,VEHICLE_CONFIG,DELIVERY_CHECKPOINTS} from '../dist/economy-config.js';
import {PROGRESSION_CONFIG,SCHOOL_CONFIG,SKIN_CONFIG} from '../dist/progression-config.js';
import {UPGRADE_STATS} from '../dist/vehicle-upgrades.js';
import {MAX_MISSION_SEQUENCE} from '../dist/career-missions.js';
import {createCareerRouteTracker,HARD_BRANCHES} from '../dist/career-route-tracker.js';
import {FORK_DEFINITIONS} from '../dist/route-network-config.js';
import {BRIDGES} from '../dist/road-bridges.js';
import {routePointAtProgress} from '../dist/route-network.js';

const vehicles=VEHICLE_CONFIG.map((v,i)=>({id:v.id,park:{x:24,z:44+11*i,heading:Math.PI/2}}));
const deliveries=DELIVERY_CHECKPOINTS.map(d=>{const p=routePointAtProgress(d.progress);return {...d,x:p.x+p.right.x*8,z:p.z+p.right.z*8,radius:4.4};});
const make=(options={})=>createGameplay({vehicles,deliveries,hardBranches:HARD_BRANCHES,...options});
const storage=(career)=>{let raw=career===undefined?null:JSON.stringify(career),writes=0;return {getItem:()=>raw,setItem(key,value){assert.equal(key,ECONOMY_CONFIG.saveKey);raw=value;writes++;},get raw(){return raw;},get writes(){return writes;}};};
const begin=(g,id='pickup')=>{g.state.cooldown=0;assert.equal(g.enter(id),true);g.events();return g.state.run.id;};
const deliver=(g,d=deliveries[0])=>{g.drive(0,d.x,d.z);const event=g.events().find(e=>e.type==='delivery');assert.ok(event,'delivery event');return event;};
const snapshot=g=>JSON.stringify(g.snapshot());
const tagged=(g,extra={})=>({runId:g.state.run?.id,...extra});
let passed=0;
const check=(name,fn)=>{try{fn();passed++;console.log('PASS',name);}catch(error){console.error('FAIL',name);throw error;}};

check('v1 and pre-retention v2 migrations preserve legitimate wallets, purchases, skins, and all ten upgrade levels',()=>{
  const v1={version:1,money:123456,ownedVehicleIds:['pickup','rover','van'],characterId:SKIN_CONFIG[3].id,completedRuns:42};
  const migrated=sanitizeCareer(v1);
  for(const key of ['money','ownedVehicleIds','characterId','completedRuns'])assert.deepEqual(migrated[key],v1[key]);
  assert.ok(migrated.ownedSkinIds.includes(v1.characterId));
  const old={...freshCareer(),money:765432,brains:12345.678901,ownedVehicleIds:VEHICLE_CONFIG.map(v=>v.id),ownedSkinIds:SKIN_CONFIG.map(s=>s.id),ownedSchoolIds:SCHOOL_CONFIG.map(s=>s.id),characterId:SKIN_CONFIG.at(-1).id,completedRuns:77,vehicleGrantClaimed:true};
  for(const v of VEHICLE_CONFIG)for(const stat of UPGRADE_STATS)old.upgrades[v.id][stat.id]=10;
  delete old.retention;
  const next=sanitizeCareer(old);
  for(const key of Object.keys(old))assert.deepEqual(next[key],old[key],key);
  assert.deepEqual(next.retention.claimedCheckpointIds,DELIVERY_CHECKPOINTS.map(d=>d.id));
  assert.deepEqual(sanitizeCareer(next),next,'sanitization is idempotent');
  const mem=storage(old),store=createCareerStore({storage:mem});assert.equal(store.save(store.load()),true);assert.deepEqual(store.load(),next);
});

check('legacy saves never receive a first-visit award at any of the sixteen gates',()=>{
  const old={...freshCareer(),money:937};delete old.retention;const g=make({career:old});
  for(const d of deliveries){begin(g);const receipt=deliver(g,d);assert.equal(receipt.first,false);assert.equal(receipt.breakdown.first,0);assert.equal(receipt.breakdown.brains.first,0);}
  assert.equal(g.state.retention.claimedCheckpointIds.length,16);
});

check('fresh first visits and repeat delivery frames credit once, survive reload, and save no live trip',()=>{
  const mem=storage(),g=make({persistence:createCareerStore({storage:mem})});begin(g);const live=g.state.run;
  const d=deliveries[0],receipt=deliver(g,d),base=d.reward;
  assert.equal(receipt.reward,base+Math.floor(base*.20)+Math.floor(base*.05));
  assert.equal(receipt.breakdown.brains.total,Math.floor(base*.04)+Math.floor(base*.01));
  assert.equal(live.loaded,false);assert.equal(g.state.run,null);
  assert.deepEqual(g.state.retention.claimedCheckpointIds,[d.id]);
  const saved=snapshot(g);for(let i=0;i<1000;i++)g.drive(0,d.x,d.z);assert.equal(snapshot(g),saved);assert.equal(g.events().length,0);
  const serialized=JSON.parse(mem.raw);assert.equal(serialized.run,undefined);assert.equal(serialized.runProgress,undefined);assert.equal(serialized.testMode,undefined);
  const reload=make({persistence:createCareerStore({storage:mem})});assert.equal(snapshot(reload),saved);assert.equal(reload.state.run,null);reload.drive(0,d.x,d.z);assert.equal(snapshot(reload),saved);
  begin(reload);const second=deliver(reload,d);assert.equal(second.first,false);assert.equal(second.breakdown.first,0);assert.equal(second.breakdown.brains.first,0);
});

check('overlapping gates and re-entrant persistence observers cannot double-pay',()=>{
  const d=deliveries[0];let g,observations=0;
  const persistence={save(){observations++;g.drive(0,d.x,d.z);return true;}};
  g=make({deliveries:[d,{...d,id:'overlap',reward:999999}],persistence});begin(g);const receipt=deliver(g,d);
  assert.equal(g.state.money,receipt.reward);assert.equal(g.state.completedRuns,1);assert.equal(g.state.retention.missionProgress,1);assert.equal(observations,1);
});

check('collision, bridge and hard telemetry require the current loaded owned run and deduplicate',()=>{
  const g=make();assert.equal(g.recordRunCollision({runId:'missing'}),false);const old=begin(g);
  for(const input of [null,{}, {runId:'wrong'}])assert.equal(g.recordRunCollision(input),false);
  assert.equal(g.recordBridgeCrossing(tagged(g,{bridgeId:'made-up'})),false);
  assert.equal(g.recordHardBranch(tagged(g,{forkId:FORK_DEFINITIONS[0].id,branch:'alternate'})),false);
  assert.equal(g.recordHardBranch(tagged(g,{forkId:'made-up',branch:'main'})),false);
  assert.equal(g.recordBridgeCrossing(tagged(g,{bridgeId:BRIDGES[0].id})),true);
  assert.equal(g.recordBridgeCrossing(tagged(g,{bridgeId:BRIDGES[0].id})),false);
  assert.equal(g.recordHardBranch(tagged(g,{forkId:FORK_DEFINITIONS[0].id,branch:'main'})),true);
  assert.equal(g.recordHardBranch(tagged(g,{forkId:FORK_DEFINITIONS[0].id,branch:'main'})),false);
  assert.equal(g.recordRunCollision(tagged(g)),true);
  const receipt=deliver(g);assert.equal(receipt.clean,false);assert.equal(receipt.hard,true);
  assert.equal(receipt.breakdown.clean,0);assert.equal(receipt.breakdown.brains.clean,0);
  const next=begin(g);assert.notEqual(next,old);
  assert.equal(g.recordRunCollision({runId:old}),false);
  assert.equal(g.recordBridgeCrossing({runId:old,bridgeId:BRIDGES[1].id}),false);
  assert.equal(g.recordHardBranch({runId:old,forkId:FORK_DEFINITIONS[1].id,branch:'main'}),false);
  const receipt2=deliver(g);assert.equal(receipt2.clean,true);assert.equal(receipt2.hard,false);
});

check('failed, aborted and preview trips never retain mission progress, checkpoint claims, or payouts',()=>{
  for(const action of ['garage','bridge','empty','preview']){
    const career=freshCareer();career.retention.missionSequence=1;const g=make({career});begin(g);
    g.recordBridgeCrossing(tagged(g,{bridgeId:BRIDGES[0].id}));g.recordBridgeCrossing(tagged(g,{bridgeId:BRIDGES[1].id}));g.recordHardBranch(tagged(g,{forkId:FORK_DEFINITIONS[0].id,branch:'main'}));
    const before=snapshot(g);
    if(action==='preview'){assert.equal(g.beginBiomeTest('snow'),true);for(let i=0;i<10;i++)g.beginBiomeTest('volcanic');}
    else if(action==='empty'){g.state.fuels.pickup=0;g.drive(0,deliveries[0].x,deliveries[0].z);}
    else g.returnToGarage(action);
    for(const d of deliveries)g.drive(0,d.x,d.z);
    assert.equal(snapshot(g),before,action);assert.equal(g.state.run,null);assert.equal(g.events().some(e=>e.type==='delivery'),false);
    if(action==='preview')g.returnToGarage();begin(g);const receipt=deliver(g);assert.equal(receipt.missionCompleted,null);assert.equal(receipt.hard,false);assert.equal(g.state.retention.missionProgress,0);
  }
});

check('bridge mission requires distinct crossings across deliveries/reloads and only the active mission advances',()=>{
  const career=freshCareer();career.retention.missionSequence=1;const mem=storage(career),g=make({persistence:createCareerStore({storage:mem})});
  begin(g);g.recordBridgeCrossing(tagged(g,{bridgeId:BRIDGES[0].id}));for(let i=0;i<50;i++)assert.equal(g.recordBridgeCrossing(tagged(g,{bridgeId:BRIDGES[0].id})),false);
  assert.equal(deliver(g).missionCompleted,null);assert.equal(g.state.retention.missionProgress,1);
  const reload=make({persistence:createCareerStore({storage:mem})});assert.equal(reload.state.retention.missionProgress,1);begin(reload);
  reload.recordBridgeCrossing(tagged(reload,{bridgeId:BRIDGES[0].id}));
  assert.equal(deliver(reload).missionCompleted,null,'revisiting the same bridge in a second trip cannot complete a two-bridge mission');
  assert.equal(reload.state.retention.missionProgress,1);
  assert.deepEqual(reload.state.retention.missionBridgeIds,[BRIDGES[0].id]);
  begin(reload);reload.recordBridgeCrossing(tagged(reload,{bridgeId:BRIDGES[1].id}));reload.returnToGarage('bridge');
  assert.deepEqual(reload.state.retention.missionBridgeIds,[BRIDGES[0].id],'failed crossing does not extend saved distinct history');
  const afterFailure=make({persistence:createCareerStore({storage:mem})});assert.deepEqual(afterFailure.state.retention.missionBridgeIds,[BRIDGES[0].id]);
  begin(reload);reload.recordBridgeCrossing(tagged(reload,{bridgeId:BRIDGES[1].id}));reload.recordRunCollision(tagged(reload));
  assert.equal(deliver(reload).missionCompleted,null,'a collision disqualifies the second bridge');assert.deepEqual(reload.state.retention.missionBridgeIds,[BRIDGES[0].id]);
  begin(reload);reload.recordBridgeCrossing(tagged(reload,{bridgeId:BRIDGES[1].id}));reload.recordHardBranch(tagged(reload,{forkId:FORK_DEFINITIONS[0].id,branch:'main'}));
  const receipt=deliver(reload);assert.equal(receipt.missionCompleted.id,'clean-bridges');assert.equal(receipt.breakdown.mission,120);assert.equal(receipt.breakdown.brains.mission,30);
  assert.equal(reload.state.retention.missionSequence,2);assert.equal(reload.state.retention.missionProgress,0,'hard crossing cannot carry into the next mission');
  assert.deepEqual(reload.state.retention.missionBridgeIds,[],'completed mission drops old bridge IDs');
  begin(reload);const next=deliver(reload);assert.equal(next.missionCompleted,null);assert.equal(next.hard,false);
});

check('mission rerolls never pay, reset partial progress, persist, and reject active/preview trips',()=>{
  const career=freshCareer();career.money=567;career.brains=89;career.retention.missionProgress=2;
  const mem=storage(career),g=make({persistence:createCareerStore({storage:mem})});
  for(let i=0;i<50;i++)assert.equal(g.skipMission(),true);
  assert.equal(g.state.money,567);assert.equal(g.state.brains,89);assert.equal(g.state.completedRuns,0);assert.equal(g.state.retention.careerCashEarned,0);assert.equal(g.state.retention.missionProgress,0);
  const reload=make({persistence:createCareerStore({storage:mem})});assert.equal(reload.state.retention.missionSequence,50);begin(reload);const before=snapshot(reload);assert.equal(reload.skipMission(),false);assert.equal(snapshot(reload),before);
  reload.beginBiomeTest('city');assert.equal(reload.skipMission(),false);reload.returnToGarage();reload.state.retention.missionSequence=MAX_MISSION_SEQUENCE;assert.equal(reload.skipMission(),false);
});

check('vehicle goals reject invalid/free/owned IDs, persist without money changes, and clear after purchase',()=>{
  const mem=storage({...freshCareer(),money:2000}),g=make({persistence:createCareerStore({storage:mem})});
  for(const id of [null,undefined,'','pickup','missing','__proto__'])assert.equal(g.setVehicleGoal(id),false);
  assert.equal(g.setVehicleGoal('citycourier'),true);assert.equal(g.state.money,2000);assert.equal(g.getVehicleGoal().remaining,0);assert.equal(g.getVehicleGoal().progress,1);
  const reload=make({persistence:createCareerStore({storage:mem})});assert.equal(reload.getVehicleGoal().id,'citycourier');reload.state.player={...vehicles.find(v=>v.id==='citycourier').park};assert.equal(reload.buy('citycourier'),true);assert.equal(reload.getVehicleGoal(),null);assert.equal(reload.state.retention.goalVehicleId,null);
  const bought=make({persistence:createCareerStore({storage:mem})});assert.equal(bought.setVehicleGoal('citycourier'),false);assert.equal(bought.getVehicleGoal(),null);
  const malformed=freshCareer();malformed.retention.goalVehicleId='pickup';assert.equal(sanitizeCareer(malformed).retention.goalVehicleId,null);
});

check('one-time test grant remains separate from career earnings across purchase and reload',()=>{
  const mem=storage(),g=make({persistence:createCareerStore({storage:mem})});assert.equal(g.claimVehicleFunds(),true);
  const amount=VEHICLE_CONFIG.reduce((n,v)=>n+v.price,0);assert.equal(g.state.money,amount);assert.equal(g.state.retention.testCashGranted,amount);assert.equal(g.state.retention.careerCashEarned,0);
  assert.equal(g.claimVehicleFunds(),false);const reload=make({persistence:createCareerStore({storage:mem})});assert.equal(reload.claimVehicleFunds(),false);assert.equal(reload.state.retention.careerCashEarned,0);
  begin(reload);const receipt=deliver(reload);assert.equal(reload.state.retention.careerCashEarned,receipt.reward);assert.equal(reload.state.retention.testCashGranted,amount);
});

check('save failure cannot duplicate a receipt and a later flush preserves the complete atomic state',()=>{
  for(const mode of ['false','throw','write-then-throw']){
    let fail=true,writes=0,raw=null;
    const persistence={save(value){writes++;if(mode==='write-then-throw'||!fail)raw=JSON.stringify(value);if(fail){if(mode==='false')return false;throw Error('storage failure');}return true;}};
    const g=make({persistence});begin(g);const receipt=deliver(g);assert.equal(receipt.saved,false);const before=snapshot(g);
    for(let i=0;i<100;i++)g.drive(0,deliveries[0].x,deliveries[0].z);assert.equal(snapshot(g),before);assert.ok(writes<=2,'bounded failure attempts');
    fail=false;assert.equal(g.flushProgress(),true);assert.deepEqual(JSON.parse(raw),g.snapshot());const reload=make({career:JSON.parse(raw)});assert.equal(snapshot(reload),before);assert.equal(reload.state.run,null);
    begin(reload);const next=deliver(reload);assert.equal(next.first,false);assert.equal(next.breakdown.first,0);
  }
});

check('currency caps describe actual credited amounts and never create negative or excess payouts',()=>{
  const career=freshCareer();career.money=ECONOMY_CONFIG.maxSavedMoney-1;career.brains=PROGRESSION_CONFIG.maxBrains-.5;career.retention.missionProgress=2;
  const g=make({career});begin(g);g.recordHardBranch(tagged(g,{forkId:FORK_DEFINITIONS[0].id,branch:'main'}));const receipt=deliver(g);
  assert.equal(receipt.reward,1);assert.equal(receipt.breakdown.base,1);assert.equal(receipt.breakdown.clean,0);assert.equal(receipt.breakdown.hard,0);assert.equal(receipt.breakdown.first,0);assert.equal(receipt.breakdown.mission,0);assert.equal(receipt.breakdown.brains.total,.5);
  assert.equal(g.state.money,ECONOMY_CONFIG.maxSavedMoney);assert.equal(g.state.brains,PROGRESSION_CONFIG.maxBrains);assert.equal(g.state.retention.careerCashEarned,1);assert.equal(g.state.retention.missionSequence,1);
});

check('malformed retention is bounded and conservatively suppresses retrospective checkpoint awards',()=>{
  const career=freshCareer();career.money=12345;career.retention={version:1,missionSequence:Infinity,missionProgress:1e12,goalVehicleId:'unknown',careerCashEarned:-1,testCashGranted:'42'};
  const fixed=sanitizeCareer(career);assert.equal(fixed.money,12345);assert.equal(fixed.retention.missionSequence,0);assert.equal(fixed.retention.missionProgress,2);assert.equal(fixed.retention.goalVehicleId,null);assert.equal(fixed.retention.careerCashEarned,0);assert.equal(fixed.retention.testCashGranted,0);assert.equal(fixed.retention.claimedCheckpointIds.length,16);
  let getterCalls=0;Object.defineProperty(career.retention,'missionSequence',{get(){getterCalls++;throw Error('must not execute');}});const safe=sanitizeCareer(career);assert.equal(getterCalls,0);assert.equal(safe.money,12345);assert.equal(safe.retention.claimedCheckpointIds.length,16);
});

check('real route traversal followed by a teleport cannot cash earlier hard/bridge telemetry or restore cargo',()=>{
  const career=freshCareer();career.retention.missionSequence=2;const g=make({career}),t=createCareerRouteTracker(),f=FORK_DEFINITIONS[0];begin(g);
  for(let q=f.from-2;q<=f.to+2;q+=2){const p=routePointAtProgress(q,{branch:'main'});t.update(g,{...p,routeContext:p},.05);}
  const before=snapshot(g),d=deliveries.at(-1),p=routePointAtProgress(d.progress);
  t.update(g,{x:d.x,z:d.z,routeContext:p},.05);
  assert.equal(g.state.run?.loaded??false,false,'teleport must invalidate already-loaded cargo');
  g.drive(0,d.x,d.z);assert.equal(snapshot(g),before);assert.equal(g.events().some(e=>e.type==='delivery'),false);
  g.returnToGarage();begin(g);const clean=deliver(g);assert.equal(clean.hard,false);assert.equal(clean.missionCompleted,null);
});

console.log(`PASS independent retention audit: ${passed} focused groups.`);
