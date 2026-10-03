import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { VEHICLE_CONFIG, DELIVERY_CHECKPOINTS } from '../../dist/economy-config.js';
import { PROGRESSION_CONFIG, SCHOOL_CONFIG } from '../../dist/progression-config.js';
import { getUpgradeOffer, getVehiclePerformance, UPGRADE_MAX_LEVEL } from '../../dist/vehicle-upgrades.js';
import { CAREER_MISSIONS, DELIVERY_BONUS_RATES, advanceCareerMission, calculateDeliveryReward } from '../../dist/career-missions.js';
import { FORK_DEFINITIONS } from '../../dist/route-network-config.js';
import { HARD_BRANCHES } from '../../dist/career-route-tracker.js';
const outDir=path.dirname(fileURLToPath(import.meta.url)), root=path.resolve(outDir,'../..');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=rel=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));
const calibration=process.argv[2]||'qa/45-bridge-calibration/bridge-only';
const outputName=process.argv[3]||'bridge-only';
const inputs=['journeys-stock.json','journeys-final.json','journeys-typical.json'].map(f=>`${calibration}/${f}`);
const reports=inputs.map(read);
for(const r of reports)if(!r.complete||!r.passed||r.changedRuntimeFiles.length)throw new Error('Incomplete, failed or drifting calibration input');
// This is a read-only counterfactual budget. Calibration may be a preserved snapshot.
// Runtime physics signatures are reported rather than substituted into old route timings.
const calibrationRuntimeHashes=reports[0].runtimeHashes;
for(const report of reports)assert.deepEqual(report.runtimeHashes,calibrationRuntimeHashes,'Calibration reports must be from one runtime');
const currentRuntimeHashes=Object.fromEntries(Object.keys(calibrationRuntimeHashes).map(f=>[f,hash(fs.readFileSync(path.join(root,'dist',f)))]));
const changedSinceCalibration=Object.keys(calibrationRuntimeHashes).filter(f=>calibrationRuntimeHashes[f]!==currentRuntimeHashes[f]);
for(const f of ['economy-config.js','progression-config.js','vehicle-upgrades.js','career-missions.js'])assert.equal(calibrationRuntimeHashes[f],currentRuntimeHashes[f],`Economy source changed: ${f}`);
const physicsContract=read('qa/economy-seven-hour/calibration-physics-contract.json');
assert.deepEqual(VEHICLE_CONFIG.map(({price,...v})=>v),physicsContract.vehicles);
for(const row of physicsContract.performances)assert.deepEqual(physicsContract.levels.map(l=>getVehiclePerformance(row.id,l)),row.values);
const checks=reports.flatMap(r=>r.checks),ids=VEHICLE_CONFIG.map(v=>v.id),basePrices=VEHICLE_CONFIG.map(v=>v.price);
const round=n=>Math.round(n*1000)/1000,sum=xs=>xs.reduce((a,b)=>a+b,0);
const levels=i=>Array.from({length:UPGRADE_MAX_LEVEL},(_,l)=>getUpgradeOffer(ids[i],'fuel',{fuel:l}).price);
const tankCost=i=>sum(levels(i)),typicalCost=i=>tankCost(i)+3*sum(levels(i).slice(0,3));
const cars=VEHICLE_CONFIG.map((v,i)=>({order:i+1,id:v.id,name:v.name,price:v.price,upgradeLevelsPerStat:levels(i),oneStatMax:tankCost(i),fourStatsMax:4*tankCost(i),typicalBuild:typicalCost(i)}));
const schools=SCHOOL_CONFIG.map(({id,price,rate})=>({id,price,rate}));
const stock=i=>checks.find(c=>c.id===ids[i]&&c.name===`endpoint ${ids[i]} stock`);
// The historical seven-car purchase plan uses stock pickup/courier. Extra
// comfort rows for those vehicles are measurements, not purchased model builds.
const build=i=>i<4?undefined:reports[2].checks.find(c=>c.id===ids[i]);
const finalTank=reports[1].checks.find(c=>c.name==='final ashhauler tank10 other stats0 primary');
const isHard=(row,a)=>a.historicalHardProxy?row.target>=4:FORK_DEFINITIONS.some(f=>HARD_BRANCHES[f.id]&&row.finalProgress>=f.to);
const typical={speedFactor:1.15,restartSeconds:15,failureProbabilities:[.05,.06,.10,.13,.17,.20,.20],failureAtFraction:.65,cleanSuccessFraction:.55,hardBonus:true,hardSuccessFraction:.5,driveBrainsPerSecond:PROGRESSION_CONFIG.drivingRate,firstDeliveryBonus:true,missions:'normal-sequence'};
const defaultPath=[0,1,4,6,7,8,9];
function outcomes(row,a){
 const clean=a.cleanSuccessFraction,hard=a.hardBonus&&isHard(row,a)?(a.hardSuccessFraction??1):0;
 // Independence of clean success and optional hard selection is an explicit
 // illustrative assumption, not player telemetry.
 return [false,true].flatMap(c=>[false,true].map(h=>({clean:c,hard:h,p:(c?clean:1-clean)*(h?hard:1-hard)}))).filter(o=>o.p>0);
}
const rewardValue=(row,a)=>Math.round(DELIVERY_CHECKPOINTS[row.target-1].distance*.6*(a.rewardMultiplier||1)/10)*10;
function routeEconomics(row,a,k){
 const p=a.failureProbabilities[Math.min(k,a.failureProbabilities.length-1)],failedAttemptsPerSuccess=p/(1-p);
 const movingSeconds=row.seconds*a.speedFactor*(1+a.failureAtFraction*failedAttemptsPerSuccess);
 const overheadSeconds=a.restartSeconds*(1+failedAttemptsPerSuccess);
 let cash=0,masteryBrains=0;
 for(const o of outcomes(row,a)){const r=calculateDeliveryReward(rewardValue(row,a),o);cash+=o.p*r.totalCash;masteryBrains+=o.p*r.brains.total;}
 return {cash,brains:movingSeconds*a.driveBrainsPerSecond+masteryBrains,movingSeconds,overheadSeconds,expectedFailures:failedAttemptsPerSuccess};
}
// Exact finite-state expectation for the implemented sequential mission rules.
// A fractional state weight is probability, never an extra runtime payout.
function missionStep(distribution,row,a){
 if(!a.missions)return {distribution,cash:0,brains:0,completions:0};
 if(a.missions==='reward-upper-bound')return {distribution,cash:150,brains:40,completions:1};
 const next=new Map();let cash=0,brains=0,completions=0;
 for(const [key,weight] of distribution){
  let [sequence,progress,missionBridgeIds]=JSON.parse(key);
  if(a.missions==='skip-to-deliveries'&&sequence!==0){sequence=0;progress=0;missionBridgeIds=[];}
  for(const o of outcomes(row,a)){
   const retention={missionSequence:sequence,missionProgress:progress,missionBridgeIds:[...missionBridgeIds]};
   const reward=advanceCareerMission(retention,{clean:o.clean,hard:o.hard,bridgeIds:row.crossedBridges||[]});
   const p=weight*o.p,newKey=JSON.stringify([retention.missionSequence%CAREER_MISSIONS.length,retention.missionProgress,[...(retention.missionBridgeIds||[])].sort()]);
   next.set(newKey,(next.get(newKey)||0)+p);
   if(reward){cash+=p*reward.cash;brains+=p*reward.brains;completions+=p;}
  }
 }
 assert.ok(Math.abs(sum([...next.values()])-1)<1e-8);
 return {distribution:next,cash,brains,completions};
}
function simulate({name,carPath=defaultPath,a=typical,mode='typical',school5First=false,prices=basePrices,upgradeBase=40}){
 let cash=0,brains=0,moving=0,overhead=0,successfulRuns=0,expectedFailedRuns=0,cashSpent=0,brainsSpent=0;
 let firstCash=0,firstBrains=0,missionCash=0,missionBrains=0,missionCompletions=0,missionDistribution=new Map([[JSON.stringify([0,0,[]]),1]]);
 const phases=[],claimed=new Set();
 function run(row,k,phase){
  assert.ok(row&&row.outcome==='delivery','Only measured successful route rows may be used');
  const e=routeEconomics(row,a,k),checkpoint=DELIVERY_CHECKPOINTS[row.target-1];
  assert.equal(row.reward,checkpoint.reward,'Base delivery reward changed since calibration');
  const first=!!a.firstDeliveryBonus&&!claimed.has(checkpoint.id),firstAward=calculateDeliveryReward(rewardValue(row,a),{first});
  const m=missionStep(missionDistribution,row,a);missionDistribution=m.distribution;
  cash+=e.cash+firstAward.first+m.cash;brains+=e.brains+firstAward.brains.first+m.brains;
  firstCash+=firstAward.first;firstBrains+=firstAward.brains.first;missionCash+=m.cash;missionBrains+=m.brains;missionCompletions+=m.completions;
  claimed.add(checkpoint.id);moving+=e.movingSeconds;overhead+=e.overheadSeconds;successfulRuns++;expectedFailedRuns+=e.expectedFailures;
  phase.runs++;phase.movingSeconds+=e.movingSeconds;phase.overheadSeconds+=e.overheadSeconds;phase.targets[row.target]=(phase.targets[row.target]||0)+1;
 }
 function selectStock(i,k){return checks.filter(c=>c.id===ids[i]&&c.upgrade==='stock'&&c.outcome==='delivery').sort((x,y)=>{let ex=routeEconomics(x,a,k),ey=routeEconomics(y,a,k);return ey.cash/(ey.movingSeconds+ey.overheadSeconds)-ex.cash/(ex.movingSeconds+ex.overheadSeconds);})[0];}
 if(school5First){const p={car:'pickup',purchase:'school-5',runs:0,movingSeconds:0,overheadSeconds:0,targets:{}};while(cash<SCHOOL_CONFIG[4].price)run(stock(0),0,p);cash-=SCHOOL_CONFIG[4].price;cashSpent+=SCHOOL_CONFIG[4].price;p.cumulativeMinutes=round((moving+overhead)/60);phases.push(p);}
 for(let k=0;k<carPath.length;k++){
  const i=carPath[k],next=carPath[k+1],last=k===carPath.length-1;
  const p={car:ids[i],purchase:last?'first successful delivery to checkpoint-16':ids[next],runs:0,movingSeconds:0,overheadSeconds:0,targets:{},upgradeBrains:0};
  const optionLevels=Array.from({length:10},(_,level)=>Math.round(upgradeBase*1.35**level*1.2**i/5)*5);
  const optionTank=sum(optionLevels),optionTypical=optionTank+3*sum(optionLevels.slice(0,3));
  const cost=last?(mode==='typical'?optionTypical:optionTank):(mode==='typical'&&i>=4?optionTypical:0);
  const fallback=mode==='stock-farm'?selectStock(i,k):stock(i);
  while(brains+1e-8<cost)run(fallback,k,p);
  brains-=cost;brainsSpent+=cost;p.upgradeBrains=cost;
  if(last)run(mode==='typical'?build(i):finalTank,k,p);
  else{const row=mode==='stock-farm'?fallback:(build(i)||stock(i));while(cash+1e-8<prices[next])run(row,k,p);cash-=prices[next];cashSpent+=prices[next];}
  p.phaseMinutes=round((p.movingSeconds+p.overheadSeconds)/60);p.cumulativeMinutes=round((moving+overhead)/60);p.cashAfter=round(cash);p.brainsAfter=round(brains);phases.push(p);
 }
 return {name,prices,upgradeBase,carPath:carPath.map(i=>ids[i]),assumptions:a,movingMinutes:round(moving/60),interfaceRestartMinutes:round(overhead/60),requiredStudyMinutes:0,totalMinutes:round((moving+overhead)/60),totalHours:round((moving+overhead)/3600),successfulRuns,expectedFailedRuns:round(expectedFailedRuns),cashSpent,brainsSpent,cashAfter:round(cash),brainsAfter:round(brains),retentionRewards:{firstCash,firstBrains,missionCash:round(missionCash),missionBrains:round(missionBrains),expectedMissionCompletions:round(missionCompletions),firstCheckpoints:a.firstDeliveryBonus?[...claimed]:[]},phases};
}

const priceOptions=[
 {id:'unchanged',prices:basePrices},
 {id:'price-3edit-a',prices:[0,1300,3200,6500,10000,16000,25000,30000,45000,60000]},
 {id:'price-3edit-b',prices:[0,1300,3200,6500,10000,16000,25000,30000,45000,55000]},
 {id:'price-3edit-c',prices:[0,1300,3200,6500,10000,16000,25000,28000,45000,55000]},
 {id:'price-3edit-d',prices:[0,1300,3200,6500,10000,16000,25000,30000,40000,55000]},
 {id:'price-v1',prices:[0,1300,3200,6500,10000,16000,20000,30000,45000,60000]},
 {id:'price-buffer-a',prices:[0,1300,3200,6500,10000,16000,18000,30000,45000,60000]},
 {id:'price-buffer-b',prices:[0,1300,3200,6500,10000,16000,20000,25000,45000,60000]},
 {id:'price-buffer-c',prices:[0,1300,3200,6500,10000,16000,19000,28000,45000,60000]},
 {id:'price-v2',prices:[0,1300,3200,6500,10000,14000,18000,27000,42000,56000]},
 {id:'price-v3',prices:[0,1300,3200,6000,9000,13000,18000,26000,40000,55000]},
 {id:'price-v4',prices:[0,1300,3200,6000,9000,13000,17000,25000,39000,52000]},
 {id:'price-v5',prices:[0,1300,3200,6000,8500,12000,17000,25000,38000,50000]},
];
const capable={...typical,speedFactor:1,restartSeconds:10,failureProbabilities:[.02,.03,.04,.05,.08,.10,.10],cleanSuccessFraction:.80};
const frequent={...typical,speedFactor:1.35,restartSeconds:20,failureProbabilities:[.10,.15,.20,.25,.30,.35,.35],cleanSuccessFraction:.30};
const scenarios=[];
const recommendedId=process.argv[4]||'price-v1';
const recommended=priceOptions.find(o=>o.id===recommendedId);
assert.ok(recommended,'Unknown recommended option');
const expert={...typical,speedFactor:1,restartSeconds:5,failureProbabilities:[0],cleanSuccessFraction:1,hardSuccessFraction:1,missions:'skip-to-deliveries'};
const expertPaths=[];
const measuredMiddle=[1,4,6,7,8];
for(let mask=0;mask<32;mask++){
 const carPath=[0,...measuredMiddle.filter((_,i)=>mask&(1<<i)),9];
 expertPaths.push(simulate({name:'Measured stock-route skip witness',carPath,a:expert,mode:'stock-farm',prices:recommended.prices}));
}
expertPaths.sort((a,b)=>a.totalMinutes-b.totalMinutes);

for(const option of priceOptions){
 scenarios.push(simulate({name:option.id,prices:option.prices}));
}
for(const rewardMultiplier of [1.3,1.4,1.5,1.6,1.7])scenarios.push(simulate({name:`reward-x${rewardMultiplier}`,a:{...typical,rewardMultiplier}}));
for(const upgradeBase of [20,30,50,60])scenarios.push(simulate({name:`upgrade-base-${upgradeBase}`,upgradeBase}));
const detailScenarios=[
 simulate({name:'Recommended prices: typical illustrative budget',prices:recommended.prices}),
 simulate({name:'Recommended prices: capable assumptions',prices:recommended.prices,a:capable}),
 simulate({name:'Recommended prices: frequent mistakes',prices:recommended.prices,a:frequent}),
 simulate({name:'Recommended prices: no first or mission rewards',prices:recommended.prices,a:{...typical,firstDeliveryBonus:false,missions:false}}),
 simulate({name:'Recommended prices: no optional bonuses',prices:recommended.prices,a:{...typical,cleanSuccessFraction:0,hardBonus:false,firstDeliveryBonus:false,missions:false}}),
 simulate({name:'Recommended prices: no hard-branch bonus',prices:recommended.prices,a:{...typical,hardBonus:false}}),
 simulate({name:'Recommended prices: missions skipped to three deliveries',prices:recommended.prices,a:{...typical,missions:'skip-to-deliveries'}}),
 simulate({name:'Recommended prices: 5% slower than typical route assumption',prices:recommended.prices,a:{...typical,speedFactor:typical.speedFactor*1.05}}),
 simulate({name:'Recommended prices: 10% slower than typical route assumption',prices:recommended.prices,a:{...typical,speedFactor:typical.speedFactor*1.10}}),
 simulate({name:'Recommended prices: failures happen at 90% rather than 65%',prices:recommended.prices,a:{...typical,failureAtFraction:.90}}),
 {...expertPaths[0],name:'Recommended prices: fastest of 32 measured stock-route paths; not global optimum'},
 simulate({name:'Recommended prices: direct pickup to final car witness',prices:recommended.prices,carPath:[0,9],a:expert,mode:'stock-farm'}),
];
const baseline=read(`${calibration}/budget-results.json`).scenarios[0];
assert.equal(scenarios[0].totalHours,baseline.totalHours,'Counterfactual harness reproduces baseline exactly');
assert.equal(scenarios[0].successfulRuns,baseline.successfulRuns);
for(const s of [...scenarios,...detailScenarios]){
 assert.ok(s.cashAfter>=0&&s.brainsAfter>=0);
 assert.equal(s.requiredStudyMinutes,0);
 assert.ok(s.prices.slice(1).every((p,i)=>p>s.prices[i]),'Car prices must increase');
}
const payoutCadence=defaultPath.map((i,k)=>{
 const row=build(i)||stock(i),e=routeEconomics(row,typical,k);
 return {car:ids[i],target:row.target,cleanMeasuredMinutes:round(row.seconds/60),assumedHumanSuccessfulTripMinutes:round(row.seconds*typical.speedFactor/60),expectedMinutesPerSuccessWithFailures:round((e.movingSeconds+e.overheadSeconds)/60),baseCash:row.reward};
});
const result={generatedAt:new Date().toISOString(),scope:'Read-only counterfactual economy. No runtime files changed and no physics rerun. Measured clean journeys plus explicit assumed player behavior; not a human-average claim.',calibration,outputName,recommendedId,calibrationRuntimeHashes,currentRuntimeHashes,changedSinceCalibration,inputFiles:Object.fromEntries(inputs.map(p=>[p,hash(fs.readFileSync(path.join(root,p)))])),modelHash:hash(fs.readFileSync(fileURLToPath(import.meta.url))),scenarios,detailScenarios,payoutCadence,expertEnumeration:{count:32,carIds:defaultPath.map(i=>ids[i]),note:'Only the seven cars with fresh stock journeys are enumerated; intermediate target choice, three other cars, alternate strategies and human behavior may be faster.'}};
fs.writeFileSync(path.join(outDir,`${outputName}-results.json`),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify([...scenarios,...detailScenarios].map(s=>({name:s.name,hours:s.totalHours,runs:s.successfulRuns,brainsAfter:s.brainsAfter,phases:s.phases.map(p=>p.phaseMinutes)})),null,2));
