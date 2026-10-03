#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createGameplay,GAMEPLAY} from '../dist/gameplay.js';
import {freshCareer,sanitizeCareer,createCareerStore} from '../dist/career-save.js';
import {VEHICLE_CONFIG,ECONOMY_CONFIG,FINAL_DELIVERY_CHECKPOINT as FINAL,REWARD_VEHICLE_ID as REWARD,ROUTE_COMPLETION_PROOF} from '../dist/economy-config.js';
import {createCareerRouteTracker} from '../dist/career-route-tracker.js';
import {routePointAtProgress} from '../dist/route-network.js';
import {BRIDGES} from '../dist/road-bridges.js';
import {getVehiclePerformance} from '../dist/vehicle-upgrades.js';

const oldIds=['pickup','citycourier','rover','foresthauler','van','desertscout','snowgrip','snowrunner','lavacrawler','ashhauler'];
const specs=VEHICLE_CONFIG.slice(0,10);
const vehicles=VEHICLE_CONFIG.map((v,i)=>({id:v.id,park:{x:24,z:44+11*i,heading:Math.PI/2}}));
const endpoint=routePointAtProgress(FINAL.progress);
const delivery={...FINAL,id:`delivery-${FINAL.id}`,x:endpoint.x+endpoint.right.x*8,z:endpoint.z+endpoint.right.z*8,radius:ECONOMY_CONFIG.checkpointRadius};
const make=(options={})=>createGameplay({vehicles,deliveries:[delivery],...options});
const begin=(g,id='pickup')=>{g.state.cooldown=0;assert.equal(g.enter(id),true);g.events();return g.state.run.id;};
const memory=()=>{let value=null,writes=0;return {getItem:()=>value,setItem:(key,next)=>{assert.equal(key,ECONOMY_CONFIG.saveKey);value=next;writes++;},get value(){return value;},get writes(){return writes;}};};
// A reproducible legal center path aligns before each narrow bridge and uses
// either branch. One-metre samples also exercise all interpolated deck checks.
function poseAt(q,branch='main'){
  const p=routePointAtProgress(q,{branch});let offset=0;
  for(const bridge of BRIDGES){
    if(q>=bridge.from-45&&q<=bridge.to+45){
      const blend=q<bridge.from?(q-(bridge.from-45))/45:q>bridge.to?((bridge.to+45)-q)/45:1;
      offset=bridge.offset*Math.max(0,Math.min(1,blend));break;
    }
  }
  if(q>FINAL.progress-50)offset=8*Math.min(1,(q-(FINAL.progress-50))/50);
  return {...p,x:p.x+p.right.x*offset,z:p.z+p.right.z*offset,routeContext:p};
}
function route(g,{branch='main',from=-6,to=FINAL.progress,tracker=createCareerRouteTracker()}={}){
  for(let q=from;q<=to;q+=2){tracker.update(g,poseAt(q,branch),.05);assert.ok(g.state.run?.loaded,`legal sample ${q} (${branch})`);}
  if((to-from)%2)tracker.update(g,poseAt(to,branch),.05);
  return tracker;
}
const finish=g=>{g.drive(0,delivery.x,delivery.z);return g.events();};
let passed=0;const check=(name,fn)=>{fn();passed++;console.log('PASS',name);};

check('the original ten IDs, prices, base stats, upgrades and budgets are unchanged',()=>{
  assert.deepEqual(specs.map(v=>v.id),oldIds);
  const rows=[
    [0,100,290,11,11/1.8,'city'],[1300,140,380,12.5,6.9,'city'],[3200,190,496,14.2,7.8,'forest'],
    [6500,260,646,16.2,8.8,'forest'],[10000,350,841,18.4,10,'desert'],[16000,480,1095,21,11.3,'desert'],
    [25000,650,1425,23.9,12.8,'snow'],[45000,880,1855,27.2,14.5,'snow'],[78000,1190,2413,31,16.4,'volcanic'],[100000,1610,3140,35.4,18.6,'volcanic'],
  ];
  specs.forEach((v,i)=>{
    assert.deepEqual([v.price,v.capacity,v.range,v.maxSpeed,v.acceleration,v.specialty],rows[i]);
    assert.equal(v.progressionOrder,i+1);assert.equal(v.handling,.5*1.12**i);assert.equal(v.grip,.5*1.12**i);
    assert.equal(v.consumption,v.capacity/v.range);assert.equal(v.pairRole,i%2?'advanced':'standard');assert.equal(v.rewardOnly,undefined);
    assert.equal(getVehiclePerformance(v.id,{speed:10}).maxSpeed,v.maxSpeed*1.1);
  });
  assert.equal(specs.reduce((n,v)=>n+v.price,0),285000);
  assert.equal(VEHICLE_CONFIG.length,11);const reward=VEHICLE_CONFIG.at(-1);
  assert.equal(reward.id,REWARD);assert.equal(reward.rewardOnly,true);assert.equal(reward.price,0);
  assert.ok(reward.maxSpeed>specs.at(-1).maxSpeed*1.1);assert.ok(reward.acceleration>specs.at(-1).acceleration);
  assert.ok(reward.rewardDrift.rearLateralGrip<1);assert.ok(reward.rewardDrift.rearLateralDamping<1);
});

check('locked reward cannot be bought, boarded, selected as money goal or granted by debug funds',()=>{
  const g=make();assert.equal(g.isOwned(REWARD),false);
  assert.deepEqual(g.getVehicleAvailability(REWARD),{id:REWARD,owned:false,rewardOnly:true,purchasable:false,status:'locked',price:null,reason:'complete-full-route'});
  assert.equal(g.enter(REWARD),false);assert.equal(g.setVehicleGoal(REWARD),false);
  assert.equal(g.claimVehicleFunds(),true);assert.equal(g.state.money,285000);assert.equal(g.isOwned(REWARD),false);
  g.state.player={...vehicles.at(-1).park};g.walk(0);let events=g.events();const prompt=events.find(e=>e.type==='purchase-prompt');
  assert.equal(prompt.rewardOnly,true);assert.equal(prompt.affordable,false);assert.equal(prompt.price,null);
  assert.equal(g.buy(REWARD),false);assert.equal(g.events().at(-1).reason,'reward-locked');assert.equal(g.state.money,285000);
  assert.equal(g.claimVehicleFunds(),false);assert.equal(g.snapshot().routeCompletion,null);
  g.state.ownedVehicleIds.push(REWARD);assert.equal(g.isOwned(REWARD),false);assert.equal(g.enter(REWARD),false);
  assert.equal(g.snapshot().ownedVehicleIds.includes(REWARD),false);
});

check('all ten ordinary cars remain directly purchasable and early delivery still pays without a reward',()=>{
  const g=make({career:{...freshCareer(),money:285000}});
  for(const spec of specs.slice(1)){
    g.state.player={...vehicles.find(vehicle=>vehicle.id===spec.id).park};
    assert.equal(g.buy(spec.id),true);assert.equal(g.isOwned(spec.id),true);assert.equal(g.buy(spec.id),false);
  }
  assert.equal(g.state.money,0);assert.deepEqual(g.state.ownedVehicleIds,oldIds);assert.equal(g.isOwned(REWARD),false);
  const early={id:'delivery-checkpoint-01',x:8,z:-180,radius:4.4,reward:110};
  const short=make({deliveries:[early]});begin(short);short.drive(0,early.x,early.z);
  const receipt=short.events().find(event=>event.type==='delivery');assert.ok(receipt);assert.ok(receipt.reward>=110);
  assert.equal(receipt.unlockedVehicleId,null);assert.equal(short.isOwned(REWARD),false);assert.equal(short.snapshot().routeCompletion,null);
});

check('legacy money, last-car ownership, completion counts and checkpoint claims never infer proof',()=>{
  for(const version of [1,2])for(const history of [undefined,[],[FINAL.id],Array.from({length:16},(_,i)=>`checkpoint-${String(i+1).padStart(2,'0')}`)]){
    const old={...freshCareer(),version,money:999999,brains:765,ownedVehicleIds:[...oldIds,REWARD],completedRuns:987};
    if(history===undefined)delete old.retention;else old.retention.claimedCheckpointIds=history;
    const next=sanitizeCareer(old);assert.equal(next.money,999999);assert.equal(next.completedRuns,987);
    assert.deepEqual(next.ownedVehicleIds,oldIds);assert.equal(next.routeCompletion,null);assert.deepEqual(next.upgrades[REWARD],{speed:0,handling:0,grip:0,fuel:0});
  }
});

check('no proof, first-pose teleport, late start, preview, no cargo, abort and fuel failure never pay or unlock',()=>{
  for(const kind of ['no-proof','teleport','late-start','preview','no-cargo','abort','empty']){
    const g=make();begin(g);const before=g.snapshot();
    if(kind==='teleport'){const t=createCareerRouteTracker();t.update(g,{...GAMEPLAY.roadSpawn},.05);t.update(g,{x:delivery.x,z:delivery.z},.05);}
    if(kind==='late-start')createCareerRouteTracker().update(g,{x:delivery.x,z:delivery.z},.05);
    if(kind==='preview')g.beginBiomeTest('volcanic');
    if(kind==='no-cargo')g.state.run.loaded=false;
    if(kind==='abort')g.returnToGarage('abort');
    if(kind==='empty')g.state.fuels.pickup=0;
    const events=finish(g);assert.equal(events.some(e=>e.type==='delivery'||e.type==='vehicle-unlocked'),false,kind);
    assert.deepEqual(g.snapshot(),before,kind);assert.equal(g.isOwned(REWARD),false,kind);
  }
});

let validProof;
check('a complete legal final delivery unlocks for free and saves payout, proof and ownership atomically once',()=>{
  const mem=memory(),g=make({persistence:createCareerStore({storage:mem})});begin(g);route(g);
  const events=finish(g),receipt=events.find(e=>e.type==='delivery');assert.ok(receipt);
  assert.equal(receipt.routeCompleted,true);assert.equal(receipt.unlockedVehicleId,REWARD);
  assert.equal(events.filter(e=>e.type==='vehicle-unlocked').length,1);assert.equal(mem.writes,1);
  assert.equal(g.isOwned(REWARD),true);assert.equal(g.getVehicleAvailability(REWARD).status,'owned');
  assert.equal(g.state.money,receipt.reward);assert.equal(g.state.completedRuns,1);
  const saved=JSON.parse(mem.value);assert.equal(saved.routeCompletion.proof,ROUTE_COMPLETION_PROOF);
  assert.equal(saved.routeCompletion.checkpointId,FINAL.id);assert.ok(saved.ownedVehicleIds.includes(REWARD));
  assert.equal(saved.run,undefined);assert.equal(saved.runProgress,undefined);assert.equal(saved.testMode,undefined);
  validProof=saved.routeCompletion;
  for(let i=0;i<100;i++)finish(g);assert.equal(mem.writes,1);assert.deepEqual(g.snapshot(),saved);
  const reload=make({persistence:createCareerStore({storage:mem})});assert.deepEqual(reload.snapshot(),saved);assert.equal(reload.state.run,null);
  for(let i=0;i<100;i++)finish(reload);assert.equal(mem.writes,1);assert.deepEqual(reload.snapshot(),saved);
  begin(reload,REWARD);assert.equal(reload.state.selectedId,REWARD);
});

check('both legal fork choices qualify and future successful runs never repeat the unlock',()=>{
  const initial={...freshCareer(),completedRuns:1,routeCompletion:validProof,money:100};
  const g=make({career:initial});begin(g,REWARD);route(g,{branch:'alternate'});
  const events=finish(g),receipt=events.find(e=>e.type==='delivery');assert.ok(receipt);
  assert.equal(receipt.unlockedVehicleId,null);assert.equal(events.some(e=>e.type==='vehicle-unlocked'),false);
  assert.equal(g.state.ownedVehicleIds.filter(id=>id===REWARD).length,1);assert.deepEqual(g.state.routeCompletion,validProof);
});

check('off-road, bridge-gap, late teleport and stale run telemetry invalidate cargo',()=>{
  for(const kind of ['off-road','bridge-gap','teleport','stale']){
    const g=make(),runId=begin(g),t=createCareerRouteTracker();route(g,{to:100,tracker:t});
    if(kind==='off-road'){const p=routePointAtProgress(102);t.update(g,{x:p.x+p.right.x*30,z:p.z+p.right.z*30},.05);}
    if(kind==='bridge-gap'){
      const b=BRIDGES[0];route(g,{from:102,to:b.from-2,tracker:t});
      for(let q=b.from;q<=b.to;q+=2){const p=routePointAtProgress(q);t.update(g,p,.05);if(!g.state.run)break;}
    }
    if(kind==='teleport')t.update(g,{x:delivery.x,z:delivery.z},.05);
    if(kind==='stale'){g.returnToGarage();begin(g);assert.equal(g.recordRouteSample({runId,x:delivery.x,z:delivery.z,dt:.05}),false);}
    const events=finish(g);assert.equal(events.some(e=>e.type==='delivery'||e.type==='vehicle-unlocked'),false,kind);
    assert.equal(g.state.money,0);assert.equal(g.isOwned(REWARD),false);
  }
});

check('failed saving cannot duplicate rewards and a later flush/reload preserves the earned car',()=>{
  let fail=true,writes=0,raw=null;const persistence={save(value){writes++;raw=JSON.stringify(value);if(fail)throw Error('write then throw');return true;}};
  const g=make({persistence});begin(g);route(g);const receipt=finish(g).find(e=>e.type==='delivery');assert.equal(receipt.saved,false);
  const snapshot=g.snapshot();assert.equal(writes,1);for(let i=0;i<100;i++)finish(g);assert.equal(writes,1);assert.deepEqual(g.snapshot(),snapshot);
  fail=false;assert.equal(g.flushProgress(),true);assert.equal(writes,2);const reload=make({career:JSON.parse(raw)});
  assert.deepEqual(reload.snapshot(),snapshot);assert.equal(reload.isOwned(REWARD),true);assert.equal(reload.state.run,null);
});

check('completed traversal alone never unlocks, and re-entrant final observers cannot duplicate credit',()=>{
  for(const stop of ['empty','abort','preview']){
    const g=make();begin(g);route(g);assert.equal(g.isOwned(REWARD),false);assert.equal(g.snapshot().routeCompletion,null);
    if(stop==='empty')g.state.fuels.pickup=0;else if(stop==='abort')g.returnToGarage('abort');else g.beginBiomeTest('volcanic');
    const events=finish(g);assert.equal(events.some(event=>event.type==='delivery'||event.type==='vehicle-unlocked'),false);
    assert.equal(g.isOwned(REWARD),false);assert.equal(g.state.money,0);assert.equal(g.snapshot().routeCompletion,null);
  }
  let g,writes=0;g=make({persistence:{save(){writes++;g.drive(0,delivery.x,delivery.z);return true;}}});
  begin(g);route(g);const events=finish(g),receipt=events.find(event=>event.type==='delivery');
  assert.equal(writes,1);assert.equal(events.filter(event=>event.type==='delivery').length,1);
  assert.equal(events.filter(event=>event.type==='vehicle-unlocked').length,1);assert.equal(g.state.money,receipt.reward);
  assert.equal(g.state.ownedVehicleIds.filter(id=>id===REWARD).length,1);assert.equal(g.state.completedRuns,1);
});

check('proof normalization requires complete evidence and rejects accessors without invoking them',()=>{
  const career={...freshCareer(),completedRuns:1,routeCompletion:validProof,ownedVehicleIds:[...oldIds,REWARD]};
  career.upgrades[REWARD]={speed:10,handling:3,grip:4,fuel:2};
  const saved=sanitizeCareer(career);assert.deepEqual(saved,career);assert.deepEqual(sanitizeCareer(saved),saved);
  for(const patch of [{proof:'unknown'},{checkpointId:'checkpoint-15'},{runId:''},{startProgress:999},{endProgress:100},{sampleCount:1},{bridgeIds:[]},{version:0}]){
    const bad=sanitizeCareer({...career,routeCompletion:{...validProof,...patch}});assert.equal(bad.routeCompletion,null);assert.equal(bad.ownedVehicleIds.includes(REWARD),false);
  }
  let calls=0;const proof={...validProof};Object.defineProperty(proof,'proof',{get(){calls++;return ROUTE_COMPLETION_PROOF;}});
  assert.equal(sanitizeCareer({...career,routeCompletion:proof}).routeCompletion,null);assert.equal(calls,0);
});
console.log(`PASS reward-only BMW: ${passed} focused groups.`);
