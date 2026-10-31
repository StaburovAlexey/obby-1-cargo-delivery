import assert from 'node:assert/strict';
import { createGameplay } from '../dist/gameplay.js';
import { freshCareer, sanitizeCareer, createCareerStore } from '../dist/career-save.js';
import { CAREER_MISSIONS, calculateDeliveryReward, getActiveMission, MAX_MISSION_SEQUENCE } from '../dist/career-missions.js';
import { ECONOMY_CONFIG, DELIVERY_CHECKPOINTS, VEHICLE_CONFIG } from '../dist/economy-config.js';
import { PROGRESSION_CONFIG, SCHOOL_CONFIG, SKIN_CONFIG } from '../dist/progression-config.js';
import { BRIDGES } from '../dist/road-bridges.js';
import { FORK_DEFINITIONS } from '../dist/route-network-config.js';
import { UPGRADE_STATS } from '../dist/vehicle-upgrades.js';
let passed=0;
const check=(name,fn)=>{fn();passed++;console.log('PASS',name);};
const vehicles=VEHICLE_CONFIG.map((vehicle,index)=>({id:vehicle.id,park:{x:40,z:40+index*20,heading:0}}));
const delivery={...DELIVERY_CHECKPOINTS[0],x:0,z:-100,radius:3,reward:100};
const hardBranches=Object.fromEntries(FORK_DEFINITIONS.map(fork=>[fork.id,'main']));
const make=(options={})=>createGameplay({vehicles,deliveries:[delivery],hardBranches,...options});
const begin=g=>{g.state.cooldown=0;assert.equal(g.enter('pickup'),true);return g.state.run.id;};
const deliver=g=>{g.events();g.drive(0,delivery.x,delivery.z);return g.events().find(event=>event.type==='delivery');};
const trip=g=>{begin(g);return deliver(g);};
const mem=(initial=null)=>{let raw=initial,writes=0,blocked=false;return{getItem:()=>raw,setItem:(key,value)=>{if(blocked)throw Error('blocked');raw=value;writes++;},get raw(){return raw;},get writes(){return writes;},set blocked(value){blocked=value;}};};

check('fresh retention starts empty, bounded and clock-free',()=>{
 const career=freshCareer();assert.deepEqual(career.retention.claimedCheckpointIds,[]);
 assert.equal(career.retention.missionSequence,0);assert.equal(getActiveMission(career.retention).id,'deliveries');
 assert.equal(career.retention.goalVehicleId,null);assert.equal(career.retention.careerCashEarned,0);assert.equal(career.retention.testCashGranted,0);
 assert.deepEqual(sanitizeCareer(career),career);
});
check('legacy v2 migration preserves wallets, all purchases and actual upgrade levels',()=>{
 const career=freshCareer('jandel');career.money=56789;career.brains=123.25;career.completedRuns=41;career.vehicleGrantClaimed=true;
 career.ownedVehicleIds=VEHICLE_CONFIG.map(v=>v.id);career.ownedSkinIds=SKIN_CONFIG.map(s=>s.id);career.ownedSchoolIds=SCHOOL_CONFIG.map(s=>s.id);
 for(const car of VEHICLE_CONFIG)for(const stat of UPGRADE_STATS)career.upgrades[car.id][stat.id]=stat.maxLevel;
 delete career.retention;const migrated=sanitizeCareer(career);
 for(const key of Object.keys(career))assert.deepEqual(migrated[key],career[key],key);
 assert.deepEqual(migrated.retention.claimedCheckpointIds,DELIVERY_CHECKPOINTS.map(d=>d.id));
 assert.deepEqual(sanitizeCareer(migrated),migrated);
 const g=make({career:migrated}),event=trip(g);assert.equal(event.breakdown.first,0);assert.equal(event.breakdown.brains.first,0);
});
check('legacy v1 retains selected paid skin and receives no retroactive milestone flood',()=>{
 const migrated=sanitizeCareer({version:1,money:12345,ownedVehicleIds:['pickup','rover'],characterId:'jandel',completedRuns:13});
 assert.equal(migrated.money,12345);assert.deepEqual(migrated.ownedVehicleIds,['pickup','rover']);assert.equal(migrated.characterId,'jandel');
 assert.equal(migrated.retention.claimedCheckpointIds.length,DELIVERY_CHECKPOINTS.length);
});
check('retention sanitizer rejects malformed state without losing valid existing wallet or purchases',()=>{
 const original={...freshCareer(),money:1234,brains:78.5,ownedVehicleIds:['pickup','rover']};
 for(const retention of [undefined,null,[],{}, {version:99},Object.create({version:1})]){
  const sanitized=sanitizeCareer({...original,retention});assert.equal(sanitized.money,1234);assert.equal(sanitized.brains,78.5);assert.deepEqual(sanitized.ownedVehicleIds,['pickup','rover']);
  assert.equal(sanitized.retention.claimedCheckpointIds.length,DELIVERY_CHECKPOINTS.length);
 }
 let calls=0;const retention={...freshCareer().retention};Object.defineProperty(retention,'missionProgress',{get(){calls++;return 999;}});
 const sanitized=sanitizeCareer({...original,retention});assert.equal(calls,0);assert.equal(sanitized.money,1234);assert.equal(sanitized.retention.claimedCheckpointIds.length,DELIVERY_CHECKPOINTS.length);
 for(const history of [null,{},new Array(5),['checkpoint-01',1]])assert.equal(sanitizeCareer({...original,retention:{...freshCareer().retention,claimedCheckpointIds:history}}).retention.claimedCheckpointIds.length,DELIVERY_CHECKPOINTS.length);
 const array=['checkpoint-01'];Object.defineProperty(array,'0',{get(){calls++;return 'checkpoint-01';}});
 assert.equal(sanitizeCareer({...original,retention:{...freshCareer().retention,claimedCheckpointIds:array}}).retention.claimedCheckpointIds.length,DELIVERY_CHECKPOINTS.length);assert.equal(calls,0);
});
check('nested fields whitelist, cap and deduplicate with idempotent snapshots',()=>{
 const career={...freshCareer(),retention:{version:1,missionSequence:Infinity,missionProgress:900,claimedCheckpointIds:['checkpoint-02','invalid','checkpoint-02'],goalVehicleId:'missing',careerCashEarned:-100,testCashGranted:Number.MAX_VALUE,loaded:true}};
 const safe=sanitizeCareer(career);assert.equal(safe.retention.missionSequence,0);assert.equal(safe.retention.missionProgress,2);assert.deepEqual(safe.retention.claimedCheckpointIds,['checkpoint-02']);
 assert.equal(safe.retention.goalVehicleId,null);assert.equal(safe.retention.careerCashEarned,0);assert.equal(safe.retention.testCashGranted,ECONOMY_CONFIG.maxSavedMoney);assert.equal('loaded' in safe.retention,false);assert.deepEqual(sanitizeCareer(safe),safe);
});
check('approved clean/hard rates and separate first/mission bonuses round and cap correctly',()=>{
 for(let base=0;base<10001;base+=13)for(const clean of [false,true])for(const hard of [false,true]){
  const reward=calculateDeliveryReward(base,{clean,hard,first:true,mission:{cash:90,brains:20}});
  assert.equal(reward.base,base);assert.equal(reward.clean,clean?Math.floor(.2*base):0);assert.equal(reward.hard,hard?Math.floor(.15*base):0);
  assert.equal(reward.brains.clean,clean?Math.floor(.04*base):0);assert.equal(reward.brains.hard,hard?Math.floor(.04*base):0);
  assert.ok(reward.brains.clean+reward.brains.hard<=Math.floor(.08*base));assert.equal(reward.first,Math.floor(.05*base));assert.equal(reward.brains.first,Math.floor(.01*base));
  assert.equal(reward.mission,90);assert.equal(reward.brains.mission,20);assert.equal(reward.totalCash,base+reward.clean+reward.hard+reward.first+90);
 }
});
check('one loaded delivery pays once, claims first checkpoint once, and emits complete breakdown',()=>{
 const g=make(),runId=begin(g),run=g.state.run,event=deliver(g);
 assert.equal(run.loaded,false);assert.equal(event.reward,125);assert.deepEqual(event.breakdown,{base:100,clean:20,hard:0,first:5,mission:0,brains:{clean:4,hard:0,first:1,mission:0,total:5},totalCash:125});
 assert.equal(event.runId,runId);assert.equal(event.saved,false);assert.equal(g.state.run,null);assert.equal(g.state.completedRuns,1);
 const saved=g.snapshot();g.drive(0,delivery.x,delivery.z);assert.deepEqual(g.snapshot(),saved);assert.deepEqual(g.events(),[]);
 const second=trip(g);assert.equal(second.reward,120);assert.equal(second.first,false);assert.equal(g.state.retention.careerCashEarned,245);
});
check('collision disables only clean mastery, genuine completed hard path remains separately earned',()=>{
 const g=make(),runId=begin(g);assert.ok(g.recordHardBranch({runId,forkId:FORK_DEFINITIONS[0].id,branch:'main'}));assert.ok(g.recordRunCollision({runId}));
 const event=deliver(g);assert.equal(event.clean,false);assert.equal(event.hard,true);assert.equal(event.breakdown.clean,0);assert.equal(event.breakdown.hard,15);assert.equal(event.breakdown.brains.clean,0);assert.equal(event.breakdown.brains.hard,4);
});
check('telemetry rejects stale IDs, absent cargo, unknown geometry, wrong branches and duplicate crossings',()=>{
 const g=make();for(const method of ['recordRunCollision','recordBridgeCrossing','recordHardBranch','invalidateRun'])assert.equal(g[method]({runId:'fake'}),false);
 const runId=begin(g);assert.equal(g.recordRunCollision({runId:'stale'}),false);assert.equal(g.recordBridgeCrossing({runId,bridgeId:'fake'}),false);
 assert.equal(g.recordBridgeCrossing({runId,bridgeId:BRIDGES[0].id}),true);assert.equal(g.recordBridgeCrossing({runId,bridgeId:BRIDGES[0].id}),false);
 assert.equal(g.recordHardBranch({runId,forkId:'fake',branch:'main'}),false);assert.equal(g.recordHardBranch({runId,forkId:FORK_DEFINITIONS[0].id,branch:'alternate'}),false);
 assert.equal(g.recordHardBranch({runId,forkId:FORK_DEFINITIONS[0].id,branch:'main'}),true);assert.equal(g.recordHardBranch({runId,forkId:FORK_DEFINITIONS[0].id,branch:'main'}),false);
 const event=deliver(g);assert.equal(event.breakdown.hard,15);assert.equal(g.recordHardBranch({runId,forkId:FORK_DEFINITIONS[1].id,branch:'main'}),false);
 const noMap=make({hardBranches:{}}),secondId=begin(noMap);assert.equal(noMap.recordHardBranch({runId:secondId,forkId:FORK_DEFINITIONS[0].id,branch:'main'}),false);assert.equal(deliver(noMap).hard,false);
});
check('biome preview, aborted trips and impossible motion cannot earn delivery or retention progress',()=>{
 for(const reset of ['preview','abort','invalid','empty']){
  const g=make(),before=g.snapshot(),runId=begin(g);g.recordHardBranch({runId,forkId:FORK_DEFINITIONS[0].id,branch:'main'});g.recordBridgeCrossing({runId,bridgeId:BRIDGES[0].id});
  if(reset==='preview')g.beginBiomeTest('forest');if(reset==='abort')g.returnToGarage('abort');if(reset==='invalid')assert.ok(g.invalidateRun({runId}));if(reset==='empty'){g.state.fuels.pickup=0;g.drive(0,delivery.x,delivery.z);}
  for(const method of ['recordRunCollision','recordBridgeCrossing','recordHardBranch','invalidateRun'])assert.equal(g[method]({runId,bridgeId:BRIDGES[1].id,forkId:FORK_DEFINITIONS[1].id,branch:'main'}),false);
  g.drive(0,delivery.x,delivery.z);assert.deepEqual(g.snapshot(),before,reset);assert.equal(g.state.run,null);
 }
});
check('delivery milestones survive reloads and pay only through explicit one-time claims',()=>{
 const memory=mem(),store=createCareerStore({storage:memory});let g=make({persistence:store});
 trip(g);assert.equal(g.getCareerMissions().find(m=>m.id==='deliveries-3').progress,1);
 g=make({persistence:store});assert.equal(g.getCareerMissions().find(m=>m.id==='deliveries-3').progress,1);trip(g);
 const third=trip(g);assert.equal(third.breakdown.mission,0);assert.equal(third.breakdown.brains.mission,0);
 assert.equal(g.getCareerMissions().find(m=>m.id==='deliveries-3').status,'ready');
 const before={cash:g.state.money,brains:g.state.brains};assert.equal(g.claimCareerMission('deliveries-3'),true);
 assert.equal(g.state.money,before.cash+200);assert.equal(g.state.brains,before.brains+75);
 g=make({persistence:store});assert.equal(g.claimCareerMission('deliveries-3'),false);assert.equal(trip(g).breakdown.mission,0);
});

check('clean delivery milestones ignore collisions and aborted trips',()=>{
 const g=make();let runId=begin(g);g.recordBridgeCrossing({runId,bridgeId:BRIDGES[0].id});deliver(g);
 assert.equal(g.state.missions.stats.cleanDeliveries,1);
 runId=begin(g);g.recordRunCollision({runId});deliver(g);assert.equal(g.state.missions.stats.cleanDeliveries,1);
 begin(g);g.returnToGarage('abort');assert.equal(g.state.missions.stats.cleanDeliveries,1);
 const event=trip(g);assert.equal(event.breakdown.mission,0);assert.equal(g.state.missions.stats.cleanDeliveries,2);
});

check('clean delivery history survives reload without depending on bridge identity',()=>{
 const memory=mem(),store=createCareerStore({storage:memory});let g=make({persistence:store});
 let runId=begin(g);g.recordBridgeCrossing({runId,bridgeId:BRIDGES[0].id});deliver(g);
 g=make({persistence:store});assert.equal(g.state.missions.stats.cleanDeliveries,1);
 runId=begin(g);g.recordBridgeCrossing({runId,bridgeId:BRIDGES[0].id});deliver(g);
 assert.equal(g.state.missions.stats.cleanDeliveries,2);trip(g);
 assert.equal(g.getCareerMissions().find(m=>m.id==='clean-deliveries-3').status,'ready');
});

check('hard branch remains a delivery bonus and does not automatically pay a mission',()=>{
 const g=make();let runId=begin(g);assert.equal(g.recordHardBranch({runId,forkId:FORK_DEFINITIONS[0].id,branch:'alternate'}),false);deliver(g);
 runId=begin(g);g.recordHardBranch({runId,forkId:FORK_DEFINITIONS[0].id,branch:'main'});g.recordHardBranch({runId,forkId:FORK_DEFINITIONS[1].id,branch:'main'});
 const event=deliver(g);assert.equal(event.breakdown.mission,0);assert.equal(event.breakdown.brains.mission,0);assert.equal(event.breakdown.hard,15);
 assert.equal(g.getCareerMissions().find(m=>m.id==='deliveries-3').progress,2);
});

check('catalog has no reroll and cannot claim rewards from live or test runs',()=>{
 const g=make();trip(g);assert.equal(typeof g.skipMission,'undefined');const before={cash:g.state.money,brains:g.state.brains};
 begin(g);assert.equal(g.claimCareerMission('first-delivery'),false);g.beginBiomeTest('snow');assert.equal(g.claimCareerMission('first-delivery'),false);
 assert.equal(g.state.money,before.cash);assert.equal(g.state.brains,before.brains);
});

check('goal validates an unowned car, reports wallet distance and is cleared on actual purchase',()=>{
 const memory=mem(),store=createCareerStore({storage:memory}),g=make({career:{...freshCareer(),money:VEHICLE_CONFIG[1].price},persistence:store});
 for(const id of [null,'pickup','missing','__proto__'])assert.equal(g.setVehicleGoal(id),false);
 const car=VEHICLE_CONFIG[1];assert.ok(g.setVehicleGoal(car.id));assert.deepEqual(g.getVehicleGoal(),{id:car.id,name:car.name,price:car.price,money:car.price,remaining:0,progress:1});
 assert.equal(make({persistence:store}).getVehicleGoal().id,car.id);g.state.player={...vehicles[1].park};assert.ok(g.buy(car.id));assert.equal(g.getVehicleGoal(),null);assert.equal(make({persistence:store}).state.retention.goalVehicleId,null);
 assert.equal(g.setVehicleGoal(car.id),false);const goalCar=VEHICLE_CONFIG[2];g.setVehicleGoal(goalCar.id);const event=trip(g);assert.equal(event.goal.id,goalCar.id);assert.equal(event.goal.remaining,goalCar.price-g.state.money);
});
check('test money remains available exactly once and separate from career-earned cash',()=>{
 const memory=mem(),store=createCareerStore({storage:memory}),g=make({persistence:store});assert.ok(g.claimVehicleFunds());const amount=g.state.money;
 assert.equal(g.state.retention.testCashGranted,amount);assert.equal(g.state.retention.careerCashEarned,0);assert.equal(g.claimVehicleFunds(),false);
 const event=trip(g);assert.equal(g.state.retention.testCashGranted,amount);assert.equal(g.state.retention.careerCashEarned,event.reward);assert.equal(g.state.money,amount+event.reward);
 const reload=make({persistence:store});assert.equal(reload.claimVehicleFunds(),false);assert.equal(reload.state.retention.testCashGranted,amount);assert.equal(reload.state.retention.careerCashEarned,event.reward);
});
check('single successful storage write includes all claims, currency, goal and mission atomically; no live run survives',()=>{
 const memory=mem(),store=createCareerStore({storage:memory}),g=make({persistence:store});g.setVehicleGoal(VEHICLE_CONFIG[1].id);const writes=memory.writes;begin(g);assert.equal(memory.writes,writes);
 const event=deliver(g);assert.equal(event.saved,true);assert.equal(memory.writes,writes+1);const saved=JSON.parse(memory.raw);assert.equal(saved.money,event.reward);assert.equal(saved.missions.stats.cleanDeliveries,1);assert.equal(saved.completedRuns,1);assert.deepEqual(saved.retention.claimedCheckpointIds,[delivery.id]);
 for(const key of ['run','runId','bridgeIds','hardBranchIds','player','position','cargo','timestamp','elapsed'])assert.equal(key in saved,false,key);
 const reload=make({persistence:store});assert.equal(reload.state.run,null);assert.equal(reload.state.mode,'walking');assert.deepEqual(reload.snapshot(),saved);
});
check('failed storage warns, does not duplicate payouts, and retries the whole dirty career without pretending durability',()=>{
 const memory=mem(JSON.stringify(freshCareer())),store=createCareerStore({storage:memory}),g=make({persistence:store});memory.blocked=true;begin(g);g.events();g.drive(0,delivery.x,delivery.z);
 const events=g.events(),event=events.find(e=>e.type==='delivery');assert.equal(event.saved,false);assert.equal(events.filter(e=>e.type==='save-warning').length,1);assert.equal(g.state.saveFailed,true);assert.equal(JSON.parse(memory.raw).money,0);
 const snapshot=g.snapshot();g.drive(0,delivery.x,delivery.z);assert.deepEqual(g.snapshot(),snapshot);assert.equal(g.flushProgress(),false);assert.equal(g.events().filter(e=>e.type==='save-warning').length,0);
 memory.blocked=false;assert.equal(g.flushProgress(),true);assert.equal(g.state.saveFailed,false);assert.deepEqual(JSON.parse(memory.raw),snapshot);assert.deepEqual(make({persistence:store}).snapshot(),snapshot);
});
check('all canonical first-checkpoint rewards are once only; arbitrary delivery IDs never create milestones',()=>{
 const deliveries=DELIVERY_CHECKPOINTS.map((d,i)=>({...d,x:i*10,z:-100,radius:1,reward:100})),g=make({deliveries});
 for(const d of deliveries){begin(g);g.events();g.drive(0,d.x,d.z);assert.equal(g.events().find(e=>e.type==='delivery').first,true);}
 assert.equal(g.state.retention.claimedCheckpointIds.length,16);
 for(const d of deliveries){begin(g);g.events();g.drive(0,d.x,d.z);assert.equal(g.events().find(e=>e.type==='delivery').first,false);}
 const unknown=make({deliveries:[{...delivery,id:'untrusted-gate'}]});assert.equal(trip(unknown).first,false);assert.deepEqual(unknown.state.retention.claimedCheckpointIds,[]);
});
check('real scene delivery-trigger IDs share canonical first-visit claims without granting unknown IDs',()=>{
 const scene={...delivery,id:`delivery-${delivery.id}`},g=make({deliveries:[scene]});
 const first=trip(g);assert.equal(first.first,true);assert.equal(first.breakdown.first,5);assert.equal(first.checkpointId,delivery.id);assert.deepEqual(g.state.retention.claimedCheckpointIds,[delivery.id]);
 const canonical=make({career:g.snapshot()});assert.equal(trip(canonical).first,false);
 const prefixed=make({deliveries:[{...delivery,id:'delivery-unknown'}]});assert.equal(trip(prefixed).first,false);assert.deepEqual(prefixed.state.retention.claimedCheckpointIds,[]);
});
check('currency caps stay finite and delivery receipts equal actual credited money and brains',()=>{
 const g=make({career:{...freshCareer(),money:ECONOMY_CONFIG.maxSavedMoney-2,brains:PROGRESSION_CONFIG.maxBrains-.25}});const event=trip(g);
 assert.equal(g.state.money,ECONOMY_CONFIG.maxSavedMoney);assert.equal(g.state.brains,PROGRESSION_CONFIG.maxBrains);assert.equal(event.reward,2);assert.equal(event.breakdown.base,2);assert.equal(event.breakdown.clean,0);assert.equal(event.breakdown.brains.total,.25);assert.equal(g.state.retention.careerCashEarned,2);
 const terminal=make({career:{...freshCareer(),retention:{...freshCareer().retention,missionSequence:MAX_MISSION_SEQUENCE}}});assert.equal(terminal.getCareerMissions().length,35);assert.equal(trip(terminal).breakdown.mission,0);
});
console.log(`Career retention: ${passed} checks passed; Node-only.`);
