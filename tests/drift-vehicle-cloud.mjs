import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudCareer} from '../dist/cloud-career.js';
import {freshCareer} from '../dist/career-save.js';
import {earnedRewardCareer} from './fixtures/reward-career.mjs';

const earned=earnedRewardCareer();
const record=score=>({version:1,trackId:'canyon-v1',score,durationMs:130000,maxCombo:4});
const envelope=(career,updatedAt=100)=>({version:1,updatedAt,legacyPremiumIds:[],career,settings:{audioVolume:.5,lastAudibleVolume:.5,language:'en'}});
function fixture(initial){
 let data=structuredClone(initial),offline=false,writeOffline=false;
 const writes=[],replacements=[];
 const cloud=createCloudCareer({writeDelayMs:0,retryDelays:[],now:()=>1000,legacyStorage:null,
  onReplace:value=>replacements.push(value),
  platform:{language:'en',loadSave:async()=>{if(offline)throw Error('offline');return structuredClone(data);},
   saveSave:async value=>{if(offline||writeOffline)throw Error('offline');data=structuredClone(value);writes.push(structuredClone(value));}},
 });
 return {cloud,writes,replacements,get data(){return data;},set data(value){data=structuredClone(value);},set offline(value){offline=value;},set writeOffline(value){writeOffline=value;}};
}

test('newer cloud keeps its profile while retaining the better offline finish and earned cars',async()=>{
 const f=fixture(envelope(earned));
 try{
  await f.cloud.initialize();
  f.offline=true;
  f.cloud.store.save({...f.cloud.store.load(),money:123,driftRecord:record(45000)});
  assert.equal(await f.cloud.flush(),false);
  f.data=envelope({...earned,money:987,driftRecord:record(10000)},2000);f.offline=false;
  assert.equal(await f.cloud.flush(),true);
  assert.equal(f.data.career.money,987,'newer profile still wins ordinary progression');
  assert.deepEqual(f.data.career.driftRecord,record(45000));
  assert.deepEqual(f.data.career.ownedVehicleIds.filter(id=>id!=='pickup'&&id!=='ashhauler'),['bmwreward','bmwe30','cadillac75','koenigseggone1','phoenixinterceptor']);
  assert.equal(f.replacements.length,1);assert.equal(f.replacements[0].career.driftRecord.score,45000);
  assert.equal(f.data.updatedAt>2000,true);
 }finally{f.cloud.destroy();}
});

test('older cloud contributes its better finished run while newer local money wins',async()=>{
 const f=fixture(envelope(earned));
 try{
  await f.cloud.initialize();f.cloud.store.save({...f.cloud.store.load(),money:777,driftRecord:record(10000)});
  f.data=envelope({...earned,money:111,driftRecord:record(35000)},500);
  assert.equal(await f.cloud.flush(),true);assert.equal(f.data.career.money,777);
  assert.deepEqual(f.data.career.driftRecord,record(35000));
  assert.equal(f.data.career.ownedVehicleIds.includes('koenigseggone1'),true);
  assert.equal(f.data.career.ownedVehicleIds.includes('phoenixinterceptor'),false);
  assert.equal(f.replacements.length,1);assert.equal(f.replacements[0].career.driftRecord.score,35000);
 }finally{f.cloud.destroy();}
});

test('newer incomplete profile cannot erase the proof needed to retain earned drift cars',async()=>{
 const f=fixture(envelope({...earned,driftRecord:record(25000)}));
 try{
  await f.cloud.initialize();f.cloud.store.save({...f.cloud.store.load(),money:123});
  f.data=envelope({...freshCareer(),money:456},2000);
  assert.equal(await f.cloud.flush(),true);assert.equal(f.data.career.money,456);
  assert.deepEqual(f.data.career.driftRecord,record(25000));
  assert.deepEqual(f.data.career.routeCompletion,earned.routeCompletion);
  assert.equal(f.data.career.completedRuns>=1,true);
  assert.equal(f.data.career.ownedVehicleIds.includes('cadillac75'),true);
 }finally{f.cloud.destroy();}
});

test('record merge waits for durable save before replacing live progression',async()=>{
 const f=fixture(envelope({...earned,driftRecord:record(45000)}));
 try{
  await f.cloud.initialize();f.cloud.store.save({...f.cloud.store.load(),money:123});
  f.data=envelope({...earned,money:456,driftRecord:record(10000)},2000);
  f.writeOffline=true;assert.equal(await f.cloud.flush(),false);assert.equal(f.replacements.length,0);
  assert.equal(f.data.career.driftRecord.score,10000,'failed write has not replaced the durable cloud record');
  assert.equal(f.cloud.store.load().driftRecord.score,45000,'merged best stays available for retry');
  f.writeOffline=false;assert.equal(await f.cloud.flush(),true);
  assert.equal(f.replacements.length,1);assert.equal(f.replacements[0].career.driftRecord.score,45000);
  assert.equal(f.data.career.driftRecord.score,45000);
 }finally{f.cloud.destroy();}
});

test('separate account controller never imports another profile best from local legacy data',async()=>{
 const previous=JSON.stringify({...earned,version:2,driftRecord:record(45000)});
 let data=null;
 const cloud=createCloudCareer({writeDelayMs:0,retryDelays:[],now:()=>1000,
  legacyStorage:{getItem:key=>key==='urban-route-career-v1'?previous:null},
  platform:{language:'en',loadSave:async()=>data,saveSave:async value=>{data=structuredClone(value);}},
 });
 try{
  const value=await cloud.initialize();assert.equal(value.career.driftRecord,null);
  assert.deepEqual(value.career.ownedVehicleIds,['pickup']);
  await cloud.flush();assert.equal(data.career.routeCompletion,null);assert.equal(data.career.driftRecord,null);
 }finally{cloud.destroy();}
});
