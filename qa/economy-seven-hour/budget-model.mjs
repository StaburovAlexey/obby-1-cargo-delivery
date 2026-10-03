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
const inputs=['production-journeys.json','skill-and-farming.json','typical-builds.json'].map(f=>`qa/current-economy-calibration/${f}`);
const reports=inputs.map(read);
for(const r of reports)if(!r.complete||!r.passed||r.changedRuntimeFiles.length)throw new Error('Incomplete, failed or drifting calibration input');
// Route timing inputs remain the pre-economy measurements. Changes to the
// physical solver, road, bridges or hazards invalidate them. The approved
// price/core/UI edits are recorded explicitly, never labelled remeasured.
const approvedNonPhysicsChanges=new Set(['app.js','career-save.js','economy-config.js','gameplay.js','progression-config.js','progression-hud.js','vehicle-upgrades.js']);
const calibrationRuntimeHashes=reports[0].runtimeHashes,currentRuntimeHashes={},changedSinceCalibration=[];
for(const [f,h] of Object.entries(calibrationRuntimeHashes)){
 const current=hash(fs.readFileSync(path.join(root,'dist',f)));currentRuntimeHashes[f]=current;
 if(current!==h){if(!approvedNonPhysicsChanges.has(f))throw new Error(`Measured route dependency changed: ${f}`);changedSinceCalibration.push(f);}
}
const newRuntimeHashes=Object.fromEntries(fs.readdirSync(path.join(root,'dist')).filter(f=>f.endsWith('.js')&&!Object.hasOwn(calibrationRuntimeHashes,f)).map(f=>[f,hash(fs.readFileSync(path.join(root,'dist',f)))]));
const physicsContract=read('qa/economy-seven-hour/calibration-physics-contract.json');
assert.deepEqual(VEHICLE_CONFIG.map(({price,...v})=>v),physicsContract.vehicles);
for(const row of physicsContract.performances)assert.deepEqual(physicsContract.levels.map(l=>getVehiclePerformance(row.id,l)),row.values);
const checks=reports.flatMap(r=>r.checks),ids=VEHICLE_CONFIG.map(v=>v.id),prices=VEHICLE_CONFIG.map(v=>v.price);
const round=n=>Math.round(n*1000)/1000,sum=xs=>xs.reduce((a,b)=>a+b,0);
const levels=i=>Array.from({length:UPGRADE_MAX_LEVEL},(_,l)=>getUpgradeOffer(ids[i],'fuel',{fuel:l}).price);
const tankCost=i=>sum(levels(i)),typicalCost=i=>tankCost(i)+3*sum(levels(i).slice(0,3));
const cars=VEHICLE_CONFIG.map((v,i)=>({order:i+1,id:v.id,name:v.name,price:v.price,upgradeLevelsPerStat:levels(i),oneStatMax:tankCost(i),fourStatsMax:4*tankCost(i),typicalBuild:typicalCost(i)}));
const schools=SCHOOL_CONFIG.map(({id,price,rate})=>({id,price,rate}));
const stock=i=>checks.find(c=>c.id===ids[i]&&c.name===`endpoint ${ids[i]} stock`);
const build=i=>reports[2].checks.find(c=>c.id===ids[i]);
const finalTank=reports[1].checks.find(c=>c.name==='final ashhauler tank10 other stats0');
const isHard=(row,a)=>a.historicalHardProxy?row.target>=4:FORK_DEFINITIONS.some(f=>HARD_BRANCHES[f.id]&&row.finalProgress>=f.to);
const typical={speedFactor:1.15,restartSeconds:15,failureProbabilities:[.05,.06,.10,.13,.17,.20,.20],failureAtFraction:.65,cleanSuccessFraction:.55,hardBonus:true,hardSuccessFraction:.5,driveBrainsPerSecond:PROGRESSION_CONFIG.drivingRate,firstDeliveryBonus:true,missions:'normal-sequence'};
const defaultPath=[0,1,4,6,7,8,9];
function outcomes(row,a){
 const clean=a.cleanSuccessFraction,hard=a.hardBonus&&isHard(row,a)?(a.hardSuccessFraction??1):0;
 // Independence of clean success and optional hard selection is an explicit
 // illustrative assumption, not player telemetry.
 return [false,true].flatMap(c=>[false,true].map(h=>({clean:c,hard:h,p:(c?clean:1-clean)*(h?hard:1-hard)}))).filter(o=>o.p>0);
}
function routeEconomics(row,a,k){
 const p=a.failureProbabilities[Math.min(k,a.failureProbabilities.length-1)],failedAttemptsPerSuccess=p/(1-p);
 const movingSeconds=row.seconds*a.speedFactor*(1+a.failureAtFraction*failedAttemptsPerSuccess);
 const overheadSeconds=a.restartSeconds*(1+failedAttemptsPerSuccess);
 let cash=0,masteryBrains=0;
 for(const o of outcomes(row,a)){const r=calculateDeliveryReward(row.reward,o);cash+=o.p*r.totalCash;masteryBrains+=o.p*r.brains.total;}
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
function simulate({name,carPath=defaultPath,a=typical,mode='typical',school5First=false}){
 let cash=0,brains=0,moving=0,overhead=0,successfulRuns=0,expectedFailedRuns=0,cashSpent=0,brainsSpent=0;
 let firstCash=0,firstBrains=0,missionCash=0,missionBrains=0,missionCompletions=0,missionDistribution=new Map([[JSON.stringify([0,0,[]]),1]]);
 const phases=[],claimed=new Set();
 function run(row,k,phase){
  assert.ok(row&&row.outcome==='delivery','Only measured successful route rows may be used');
  const e=routeEconomics(row,a,k),checkpoint=DELIVERY_CHECKPOINTS[row.target-1];
  assert.equal(row.reward,checkpoint.reward,'Base delivery reward changed since calibration');
  const first=!!a.firstDeliveryBonus&&!claimed.has(checkpoint.id),firstAward=calculateDeliveryReward(row.reward,{first});
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
  const cost=last?(mode==='typical'?typicalCost(i):tankCost(i)):(mode==='typical'&&i>=4?typicalCost(i):0);
  const fallback=mode==='stock-farm'?selectStock(i,k):stock(i);
  while(brains+1e-8<cost)run(fallback,k,p);
  brains-=cost;brainsSpent+=cost;p.upgradeBrains=cost;
  if(last)run(mode==='typical'?build(i):finalTank,k,p);
  else{const row=mode==='stock-farm'?fallback:(build(i)||stock(i));while(cash+1e-8<prices[next])run(row,k,p);cash-=prices[next];cashSpent+=prices[next];}
  p.phaseMinutes=round((p.movingSeconds+p.overheadSeconds)/60);p.cumulativeMinutes=round((moving+overhead)/60);p.cashAfter=round(cash);p.brainsAfter=round(brains);phases.push(p);
 }
 return {name,carPath:carPath.map(i=>ids[i]),assumptions:a,movingMinutes:round(moving/60),interfaceRestartMinutes:round(overhead/60),requiredStudyMinutes:0,totalMinutes:round((moving+overhead)/60),totalHours:round((moving+overhead)/3600),successfulRuns,expectedFailedRuns:round(expectedFailedRuns),cashSpent,brainsSpent,cashAfter:round(cash),brainsAfter:round(brains),retentionRewards:{firstCash,firstBrains,missionCash:round(missionCash),missionBrains:round(missionBrains),expectedMissionCompletions:round(missionCompletions),firstCheckpoints:a.firstDeliveryBonus?[...claimed]:[]},phases};
}
const scenarios=[
 simulate({name:'Implemented typical illustrative first-clear plan'}),
 simulate({name:'Same real-branch plan without first-delivery and mission rewards',a:{...typical,firstDeliveryBonus:false,missions:false}}),
 simulate({name:'Historical proposal proxy; target4+ hard; no new retention',a:{...typical,historicalHardProxy:true,firstDeliveryBonus:false,missions:false}}),
 simulate({name:'Same plan without any optional bonuses',a:{...typical,cleanSuccessFraction:0,hardBonus:false,firstDeliveryBonus:false,missions:false}}),
 simulate({name:'Same plan, capable careful driver',a:{...typical,speedFactor:1,restartSeconds:10,failureProbabilities:[.02,.03,.04,.05,.08,.10,.10],cleanSuccessFraction:.80}}),
 simulate({name:'Same plan, frequent mistakes',a:{...typical,speedFactor:1.35,restartSeconds:20,failureProbabilities:[.10,.15,.20,.25,.30,.35,.35],cleanSuccessFraction:.30}}),
 simulate({name:'Direct school-5 access before the ordinary plan',school5First:true}),
 simulate({name:'Same plan with missions skipped to repeat three deliveries',a:{...typical,missions:'skip-to-deliveries'}}),
 simulate({name:'Generous retention bound: mission150cash40brains every success; not an attainable guarantee',a:{...typical,missions:'reward-upper-bound'}}),
];
const expert={...typical,speedFactor:1,restartSeconds:5,failureProbabilities:[0],cleanSuccessFraction:1,hardSuccessFraction:1,missions:'skip-to-deliveries'};
const skipCandidates=[];
for(let mask=0;mask<256;mask++){const carPath=[0];for(let i=1;i<=8;i++)if(mask&(1<<(i-1)))carPath.push(i);carPath.push(9);skipCandidates.push(simulate({name:'Measured stock-route skip witness',carPath,a:expert,mode:'stock-farm'}));}
skipCandidates.sort((a,b)=>a.totalMinutes-b.totalMinutes);
scenarios.push({...skipCandidates[0],name:'Fastest of256 enumerated stock-route purchase paths; not global optimum'});
scenarios.push(simulate({name:'Direct pickup-to-ash stock-route witness',carPath:[0,9],a:expert,mode:'stock-farm'}));
scenarios.push(simulate({name:'All eligible later successes use a hard branch',a:{...typical,hardSuccessFraction:1}}));
scenarios.push(simulate({name:'Clean bonus and retention only; no hard-branch choices',a:{...typical,hardBonus:false}}));
const result={generatedAt:new Date().toISOString(),scope:'Implemented config/reward budget, with assumed human behavior and pre-change measured route timings; not observed human completion times. Physics signatures and unchanged route dependencies checked.',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),calibrationRuntimeHashes,currentRuntimeHashes,newRuntimeHashes,changedSinceCalibration,routeFingerprint:reports[0].routeFingerprint,inputFiles:Object.fromEntries([...inputs,'qa/economy-seven-hour/calibration-physics-contract.json'].map(p=>[p,hash(fs.readFileSync(path.join(root,p)))])),modelHash:hash(fs.readFileSync(fileURLToPath(import.meta.url))),measuredChecks:sum(reports.map(r=>r.checks.length)),cars,schools,drivingBrainsPerSecond:PROGRESSION_CONFIG.drivingRate,mastery:{rates:DELIVERY_BONUS_RATES,hardBranches:HARD_BRANCHES,firstEligibleCheckpoint:11,eligibility:'A full actual forward main/ridge traversal of a configured fork before a successful loaded non-test delivery. Counted once per run, not once per fork. Target number alone never grants it.',rounding:'Each bonus component floors independently through production calculateDeliveryReward.',maximumCashMultiplierWithoutFirstOrMission:1.35,maximumMasteryBrains:'floor(0.08*R)'},retention:{missions:CAREER_MISSIONS,normalModel:'Exact mission-state probability propagation per successful delivery, using measured crossedBridges, persistent distinct bridge IDs and independent assumed clean/hard outcomes. Mission progress does not transfer to the next mission in that run.',first:'One-time only per canonical delivered checkpoint; finite bonuses from visited endpoints only.',skip:'Free skip resets progress. Repeating three-delivery mission pays90cash20brains per3successes; late repeated bridge or hard missions may pay more. Absolute modeled bound150cash40brains per success is deliberately generous.',allCheckpointFirstBonusCash:sum(DELIVERY_CHECKPOINTS.map(p=>Math.floor(p.reward*DELIVERY_BONUS_RATES.firstCash))),allCheckpointFirstBonusBrains:sum(DELIVERY_CHECKPOINTS.map(p=>Math.floor(p.reward*DELIVERY_BONUS_RATES.firstBrains)))},totals:{allCars:sum(prices),allFourStatsAllCars:sum(cars.map(c=>c.fourStatsMax)),allSchools:sum(schools.map(s=>s.price))},modelNotes:[
 'Restarts, human speed factor, failure probabilities, failure location, clean fraction and hard selection are assumptions. Only clean route seconds/fuel/reward/bridges were measured. Hard main versus alternate timing differences are not remeasured here.',
 'Each simulation purchases an integer count of expected successful deliveries. Expected failed attempts per success = p/(1-p); failure time =0.65 of slowed route. Failure pays no delivery/first/mission reward, while ordinary movement brains accrue.',
 'Integer production reward rounding is used before averaging probabilities. Expected rewards may be fractional, so these are budgeting trajectories, not sampled complete careers or an estimate of population means.',
 'Driving earns cash and brains concurrently. Upgrade builds are paid before their measured route is used; real stock deliveries fill any brain shortfall. No forced school waiting or extra clock is inserted.',
 'Typical purchased upgrades are fuel10 and speed/handling/grip3; all other cars, skins, schools and fullmax upgrades are optional.',
 'No debug cash, save edits, offline earnings, trade-in revenue or mandatory progression locks. Existing saved money and purchases are preserved; this model starts a fresh career.',
 'The16destinations and repeated shared early road still mean repetition. New goals and small bonuses do not establish fun, a3–8minute reward cadence, or a7–8hour human mean without playtests.'
],scenarios};
fs.writeFileSync(path.join(outDir,'budget-results.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({totals:result.totals,changedSinceCalibration,scenarios:scenarios.map(s=>({name:s.name,hours:s.totalHours,runs:s.successfulRuns,retention:s.retentionRewards,path:s.carPath}))},null,2));
