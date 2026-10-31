import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareerStore,freshCareer,sanitizeCareer} from '../dist/career-save.js';
import {createGameplay} from '../dist/gameplay.js';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';
import {DRIFT_VEHICLE_UNLOCKS,driftUnlockScore,unlockedDriftVehicleIds} from '../dist/drift-unlocks.js';
import {earnedRewardCareer} from './fixtures/reward-career.mjs';

const earned=earnedRewardCareer();
const vehicles=VEHICLE_CONFIG.map((vehicle,index)=>({id:vehicle.id,park:{x:24,z:44+11*index}}));
const record=score=>({version:1,trackId:'canyon-v1',score,durationMs:130000,maxCombo:4});
const scoreCars=career=>career.ownedVehicleIds.filter(id=>['bmwe30','cadillac75','koenigseggone1','phoenixinterceptor'].includes(id));

test('saved best run derives every reached threshold without relying on supplied ownership',()=>{
 for(const [score,expected] of [
  [9999,[]],[10000,['bmwe30']],[24999,['bmwe30']],[25000,['bmwe30','cadillac75']],
  [34999,['bmwe30','cadillac75']],[35000,['bmwe30','cadillac75','koenigseggone1']],
  [44999,['bmwe30','cadillac75','koenigseggone1']],[45000,['bmwe30','cadillac75','koenigseggone1','phoenixinterceptor']],
 ]){
  const career=sanitizeCareer({...earned,ownedVehicleIds:['pickup','phoenixinterceptor','unknown'],driftRecord:record(score)});
  assert.deepEqual(scoreCars(career),expected,`score ${score}`);
  assert.equal(career.ownedVehicleIds.includes('bmwreward'),true);
  assert.equal(career.ownedVehicleIds.includes('unknown'),false);
  assert.deepEqual(sanitizeCareer(career),career,'earned ownership survives repeated canonicalization');
 }
});

test('score ownership requires a valid best record and canonical route proof',()=>{
 for(const patch of [
  {driftRecord:null},{driftRecord:record(NaN)},{driftRecord:record(45000.1)},
  {driftRecord:{...record(45000),trackId:'practice'}},
  {driftRecord:{...record(45000),durationMs:29999}},
  {routeCompletion:{...earned.routeCompletion,bridgeIds:[]}},
  {routeCompletion:null},{completedRuns:0},
 ]){
  const career=sanitizeCareer({...earned,ownedVehicleIds:['pickup','bmwreward','bmwe30','cadillac75','koenigseggone1','phoenixinterceptor'],driftRecord:record(45000),...patch});
  assert.deepEqual(scoreCars(career),[]);
 }
 const withoutProof=sanitizeCareer({...freshCareer(),driftRecord:record(45000),ownedVehicleIds:['pickup','bmwreward']});
 assert.equal(withoutProof.ownedVehicleIds.includes('bmwreward'),false,'a high score never creates BMW route proof');
});

test('one new best atomically saves several earned cars and emits their IDs without spending score or currency',()=>{
 let raw=null,writes=0;
 const storage={getItem:()=>raw,setItem(key,value){raw=value;writes++;}};
 const persistence=createCareerStore({storage});
 const gameplay=createGameplay({vehicles,career:earned,persistence}),before=gameplay.snapshot();
 assert.equal(gameplay.recordDriftResult({...record(35000),verified:false}),true,'local finished results do not require platform verification');
 const event=gameplay.events().find(event=>event.type==='drift-record');
 assert.deepEqual(event,{type:'drift-record',record:record(35000),newlyUnlockedVehicleIds:['bmwe30','cadillac75','koenigseggone1']});
 assert.equal(writes,1);
 assert.deepEqual(scoreCars(JSON.parse(raw)),['bmwe30','cadillac75','koenigseggone1']);
 for(const id of ['bmwe30','cadillac75','koenigseggone1'])assert.equal(gameplay.isOwned(id),true,id);
 assert.equal(gameplay.isOwned('phoenixinterceptor'),false);
 assert.equal(gameplay.state.money,before.money);assert.equal(gameplay.state.brains,before.brains);
 assert.equal(gameplay.state.completedRuns,before.completedRuns);assert.equal(gameplay.state.driftRecord.score,35000);
 const reload=createGameplay({vehicles,persistence});
 assert.deepEqual(scoreCars(reload.snapshot()),['bmwe30','cadillac75','koenigseggone1']);
 assert.equal(reload.isOwned('koenigseggone1'),true);
 assert.equal(reload.recordDriftResult(record(45000)),true);
 assert.deepEqual(reload.events().find(event=>event.type==='drift-record').newlyUnlockedVehicleIds,['phoenixinterceptor']);
});

test('finishes compare one best score instead of accumulating runs or repeating unlock events',()=>{
 const gameplay=createGameplay({vehicles,career:earned});
 assert.equal(gameplay.recordDriftResult(record(18000)),true);gameplay.events();
 assert.equal(gameplay.recordDriftResult(record(20000)),true);
 assert.deepEqual(gameplay.events().find(event=>event.type==='drift-record').newlyUnlockedVehicleIds,[]);
 assert.deepEqual(scoreCars(gameplay.snapshot()),['bmwe30']);
 assert.equal(gameplay.recordDriftResult(record(20000)),false);
 assert.equal(gameplay.recordDriftResult(record(18000)),false);
 assert.deepEqual(gameplay.events(),[]);assert.equal(gameplay.state.driftRecord.score,20000);
});

test('invalid result and missing route proof cannot mutate progression or persist',()=>{
 let writes=0;
 for(const career of [freshCareer(),earned]){
  const gameplay=createGameplay({vehicles,career,persistence:{save(){writes++;return true;}}}),before=gameplay.snapshot();
  const result=career===earned?{...record(45000),durationMs:1}:record(45000);
  assert.equal(gameplay.recordDriftResult(result),false);assert.deepEqual(gameplay.snapshot(),before);
  assert.deepEqual(gameplay.events(),[]);
 }
 assert.equal(writes,0);
});

test('developer manual unlock stays session-only and practice cannot mint score ownership or proof',()=>{
 let writes=0;
 const gameplay=createGameplay({vehicles,developerMode:true,career:freshCareer(),persistence:{save(){writes++;return true;}}});
 const before=gameplay.snapshot();
 assert.equal(gameplay.isOwned('bmwe30'),false);
 gameplay.state.player={...vehicles.find(vehicle=>vehicle.id==='bmwe30').park};
 assert.equal(gameplay.unlockDeveloperVehicle('bmwe30'),true);assert.equal(gameplay.isOwned('bmwe30'),true);
 assert.equal(gameplay.recordDriftResult(record(45000)),false);gameplay.returnToGarage();gameplay.flushProgress();
 assert.deepEqual(gameplay.snapshot(),before);assert.equal(writes,0);
 const normal=createGameplay({vehicles,career:gameplay.snapshot()});assert.equal(normal.isOwned('bmwe30'),false);
 const earnedDev=createGameplay({vehicles,developerMode:true,career:earned,persistence:{save(){writes++;}}});
 assert.equal(earnedDev.recordDriftResult(record(45000)),false);assert.deepEqual(earnedDev.snapshot(),earned);assert.equal(writes,0);
});

test('score vehicle availability explains the required finish without allowing a purchase',()=>{
 const gameplay=createGameplay({vehicles,career:earned});
 const offer=gameplay.getVehicleAvailability('cadillac75');
 assert.equal(offer.reason,'drift-score');assert.equal(offer.requiredScore,25000);
 assert.equal(offer.price,null);assert.equal(offer.purchasable,false);assert.equal(gameplay.buy('cadillac75'),false);
});

test('public unlock helpers expose immutable rules and validate ownership through the canonical career',()=>{
 assert.equal(Object.isFrozen(DRIFT_VEHICLE_UNLOCKS),true);
 assert.equal(DRIFT_VEHICLE_UNLOCKS.every(Object.isFrozen),true);
 assert.throws(()=>{DRIFT_VEHICLE_UNLOCKS[0].score=1;},TypeError);
 assert.equal(driftUnlockScore('bmwe30'),10000);assert.equal(driftUnlockScore('cadillac75'),25000);
 assert.equal(driftUnlockScore('koenigseggone1'),35000);assert.equal(driftUnlockScore('phoenixinterceptor'),45000);
 assert.equal(driftUnlockScore('bmwreward'),null);assert.equal(driftUnlockScore('unknown'),null);
 assert.deepEqual(unlockedDriftVehicleIds({...earned,driftRecord:record(35000)}),['bmwe30','cadillac75','koenigseggone1']);
 assert.deepEqual(unlockedDriftVehicleIds({...freshCareer(),ownedVehicleIds:['pickup','phoenixinterceptor'],driftRecord:record(45000)}),[]);
 assert.deepEqual(unlockedDriftVehicleIds({...earned,routeCompletion:{...earned.routeCompletion,proof:'fake'},driftRecord:record(45000)}),[]);
});
