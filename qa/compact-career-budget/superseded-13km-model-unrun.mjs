#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
const outDir=path.dirname(fileURLToPath(import.meta.url)),mainRoot=path.resolve(outDir,'../..');
const candidateRoot=path.resolve(process.argv[2]||path.join(mainRoot,'../city-ten-minute-candidate'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const hashes=root=>Object.fromEntries(fs.readdirSync(path.join(root,'dist')).filter(f=>f.endsWith('.js')).sort().map(f=>[f,hash(fs.readFileSync(path.join(root,'dist',f)))]));
const before={main:hashes(mainRoot),candidate:hashes(candidateRoot)};
const moduleAt=(root,file)=>import(pathToFileURL(path.join(root,'dist',file)).href);
const {VEHICLE_CONFIG:cars,DELIVERY_CHECKPOINTS:checkpoints}=await moduleAt(candidateRoot,'economy-config.js');
const {VEHICLE_CONFIG:mainCars,DELIVERY_CHECKPOINTS:mainCheckpoints}=await moduleAt(mainRoot,'economy-config.js');
const {PROGRESSION_CONFIG,SCHOOL_CONFIG}=await moduleAt(candidateRoot,'progression-config.js');
const {getUpgradeOffer}=await moduleAt(candidateRoot,'vehicle-upgrades.js');
const {CAREER_MISSIONS,advanceCareerMission,calculateDeliveryReward,DELIVERY_BONUS_RATES}=await moduleAt(candidateRoot,'career-missions.js');
const {FORK_DEFINITIONS}=await moduleAt(candidateRoot,'route-network-config.js');
const {biomeSurfaceAt}=await moduleAt(candidateRoot,'biome-surfaces.js');
assert.deepEqual(cars.map(v=>v.price),mainCars.map(v=>v.price),'Candidate must retain current prices');
assert.deepEqual(checkpoints.map(v=>v.reward),mainCheckpoints.map(v=>v.reward),'Candidate must retain old payouts explicitly');
for(const file of ['progression-config.js','vehicle-upgrades.js','career-missions.js'])assert.equal(before.main[file],before.candidate[file],`Economy rule changed: ${file}`);
const files=['journeys-candidate.json','journeys-tank9.json','journeys-career-stock.json','journeys-career-typical.json','journeys-career-short.json'];
const inputs=files.map(file=>{const p=path.join(outDir,'inputs',file);return {file,hash:hash(fs.readFileSync(p)),report:JSON.parse(fs.readFileSync(p))};});
for(const {file,report} of inputs){
 assert.ok(report.complete&&report.passed,`Unfinished/failed calibration: ${file}`);
 assert.equal((report.changedRelevantRuntimeFiles||report.changedRuntimeFiles).length,0,`Runtime changed during ${file}`);
 for(const [f,h] of Object.entries(report.runtimeHashes))assert.equal(before.candidate[f],h,`Stale measured dependency ${file}: ${f}`);
}
assert.equal(new Set(inputs.map(i=>i.report.routeFingerprint)).size,1,'Measurements must have one route');
const checks=inputs.flatMap(({file,report})=>report.checks.map(row=>({...row,inputFile:file})));
const sum=xs=>xs.reduce((a,b)=>a+b,0),round=n=>Math.round(n*1000)/1000;
const ZERO={speed:0,handling:0,grip:0,fuel:0},TANK={...ZERO,fuel:10},COMFORT={speed:3,handling:3,grip:3,fuel:10},MAX={speed:10,handling:10,grip:10,fuel:10};
const levelsOf=row=>row.upgrade==='stock'?ZERO:row.upgrade==='max10'?MAX:{...ZERO,...JSON.parse(row.upgrade)};
const sameLevels=(a,b)=>Object.keys(ZERO).every(key=>(a[key]||0)===(b[key]||0));
const successful=checks.filter(r=>r.passed&&r.outcome==='delivery');
function rowsFor(i,levels=ZERO){return successful.filter(row=>row.id===cars[i].id&&sameLevels(levelsOf(row),levels));}
function endpoint(i,levels=ZERO){const rows=rowsFor(i,levels).sort((a,b)=>b.target-a.target||a.seconds-b.seconds);assert.ok(rows.length,`Missing successful measured ${cars[i].id} ${JSON.stringify(levels)}`);return rows[0];}
function upgradeCost(i,from=ZERO,to=TANK){let cost=0;for(const stat of Object.keys(ZERO))for(let level=from[stat]||0;level<(to[stat]||0);level++)cost+=getUpgradeOffer(cars[i].id,stat,{[stat]:level}).price;return cost;}
const byOrderFailures=[.05,.06,.08,.09,.10,.12,.13,.15,.17,.20];
const typical={speedFactor:1.15,restartSeconds:15,failureProbabilities:byOrderFailures,failureAtFraction:.65,cleanSuccessFraction:.55,hardSuccessFraction:.5,firstDeliveryBonus:true,missions:'normal-sequence'};
const capable={...typical,speedFactor:1,restartSeconds:10,failureProbabilities:[.02,.03,.03,.04,.04,.05,.05,.08,.10,.10],cleanSuccessFraction:.8};
const frequent={...typical,speedFactor:1.35,restartSeconds:20,failureProbabilities:[.10,.15,.15,.20,.20,.25,.25,.30,.35,.35],cleanSuccessFraction:.3};
const expert={...typical,speedFactor:1,restartSeconds:5,failureProbabilities:Array(10).fill(0),cleanSuccessFraction:1,hardSuccessFraction:1,missions:'skip-to-deliveries'};
const hardEligible=row=>FORK_DEFINITIONS.some(f=>row.finalProgress>=f.to);
function outcomes(row,a){const clean=a.cleanSuccessFraction,hard=hardEligible(row)?a.hardSuccessFraction:0;return [false,true].flatMap(c=>[false,true].map(h=>({clean:c,hard:h,p:(c?clean:1-clean)*(h?hard:1-hard)}))).filter(o=>o.p>0);}
function economics(row,a){const i=cars.findIndex(v=>v.id===row.id),p=a.failureProbabilities[i],failed=p/(1-p),moving=row.seconds*a.speedFactor*(1+a.failureAtFraction*failed),overhead=a.restartSeconds*(1+failed);let cash=0,bonusBrains=0;for(const o of outcomes(row,a)){const r=calculateDeliveryReward(row.reward,o);cash+=o.p*r.totalCash;bonusBrains+=o.p*r.brains.total;}return {cash,brains:moving*PROGRESSION_CONFIG.drivingRate+bonusBrains,moving,overhead,failed};}
function missionStep(distribution,row,a){
 if(!a.missions)return {distribution,cash:0,brains:0,completions:0};
 const next=new Map();let cash=0,brains=0,completions=0;
 for(const [key,weight] of distribution){let [sequence,progress,bridgeIds]=JSON.parse(key);if(a.missions==='skip-to-deliveries'&&sequence!==0){sequence=0;progress=0;bridgeIds=[];}
  for(const o of outcomes(row,a)){const retention={missionSequence:sequence,missionProgress:progress,missionBridgeIds:[...bridgeIds]},award=advanceCareerMission(retention,{clean:o.clean,hard:o.hard,bridgeIds:row.crossedBridges});const p=weight*o.p,k=JSON.stringify([retention.missionSequence%CAREER_MISSIONS.length,retention.missionProgress,[...(retention.missionBridgeIds||[])].sort()]);next.set(k,(next.get(k)||0)+p);if(award){cash+=p*award.cash;brains+=p*award.brains;completions+=p;}}
 }
 assert.ok(Math.abs(sum([...next.values()])-1)<1e-8);return {distribution:next,cash,brains,completions};
}
function bestStock(i,a){return rowsFor(i).sort((x,y)=>{const ex=economics(x,a),ey=economics(y,a);return ey.cash/(ey.moving+ey.overhead)-ex.cash/(ex.moving+ex.overhead);})[0];}
function simulate({name,carPath=[0,1,2,4,6,9],a=typical,comfortCars=[2,4],farmChoice='endpoint',firstFinishBuild=TANK,finishMax=true}){
 let cash=0,brains=0,moving=0,overhead=0,successfulRuns=0,expectedFailedRuns=0,cashSpent=0,brainsSpent=0,firstCash=0,firstBrains=0,missionCash=0,missionBrains=0,missionCompletions=0;
 let missionDistribution=new Map([[JSON.stringify([0,0,[]]),1]]);const claimed=new Set(),phases=[];let lastBuild=ZERO,firstClear;
 const snapshot=()=>({totalHours:round((moving+overhead)/3600),totalMinutes:round((moving+overhead)/60),movingMinutes:round(moving/60),interfaceRestartMinutes:round(overhead/60),successfulRuns,expectedFailedRuns:round(expectedFailedRuns),cashSpent,brainsSpent,cashAfter:round(cash),brainsAfter:round(brains),requiredStudyMinutes:0,firstCash,firstBrains,missionCash:round(missionCash),missionBrains:round(missionBrains),expectedMissionCompletions:round(missionCompletions)});
 function run(row,phase){assert.ok(row&&row.outcome==='delivery','Only measured successes used');assert.equal(row.reward,checkpoints[row.target-1].reward);const e=economics(row,a),first=a.firstDeliveryBonus&&!claimed.has(row.target),firstAward=calculateDeliveryReward(row.reward,{first}),m=missionStep(missionDistribution,row,a);missionDistribution=m.distribution;cash+=e.cash+firstAward.first+m.cash;brains+=e.brains+firstAward.brains.first+m.brains;firstCash+=firstAward.first;firstBrains+=firstAward.brains.first;missionCash+=m.cash;missionBrains+=m.brains;missionCompletions+=m.completions;claimed.add(row.target);moving+=e.moving;overhead+=e.overhead;successfulRuns++;expectedFailedRuns+=e.failed;phase.runs++;phase.movingSeconds+=e.moving;phase.overheadSeconds+=e.overhead;const key=`CP${row.target}/${row.upgrade}`;phase.routes[key]=(phase.routes[key]||0)+1;assert.ok(successfulRuns<10000,'Budget runaway');}
 function phaseFor(i,purpose){return {car:cars[i].id,purpose,runs:0,movingSeconds:0,overheadSeconds:0,routes:{},upgradeBrains:0};}
 function close(p){p.phaseMinutes=round((p.movingSeconds+p.overheadSeconds)/60);p.cumulativeMinutes=round((moving+overhead)/60);p.cashAfter=round(cash);p.brainsAfter=round(brains);phases.push(p);}
 for(let k=0;k<carPath.length;k++){const i=carPath[k],next=carPath[k+1],last=k===carPath.length-1;assert.equal(last,i===9);const p=phaseFor(i,last?'First successful finish':`Buy ${cars[next].id}`),build=last?firstFinishBuild:comfortCars.includes(i)?COMFORT:ZERO,upgrade=upgradeCost(i,ZERO,build),stock=farmChoice==='yield'?bestStock(i,a):endpoint(i);
  while(brains+1e-8<upgrade)run(stock,p);brains-=upgrade;brainsSpent+=upgrade;p.upgradeBrains=upgrade;
  const row=sameLevels(build,ZERO)?stock:endpoint(i,build);
  if(last){assert.equal(row.target,16);run(row,p);lastBuild=build;close(p);firstClear=snapshot();}
  else {while(cash+1e-8<cars[next].price)run(row,p);cash-=cars[next].price;cashSpent+=cars[next].price;close(p);}
 }
 if(finishMax&&!sameLevels(lastBuild,MAX)){const p=phaseFor(9,'Own fully maxed final car and finish in it'),cost=upgradeCost(9,lastBuild,MAX),row=endpoint(9,lastBuild);while(brains+1e-8<cost)run(row,p);brains-=cost;brainsSpent+=cost;p.upgradeBrains=cost;run(endpoint(9,MAX),p);close(p);}
 assert.ok(cash>=-1e-8&&brains>=-1e-8);return {name,carPath:carPath.map(i=>cars[i].id),comfortCars:comfortCars.filter(i=>carPath.includes(i)).map(i=>cars[i].id),firstFinishBuild,a,farmChoice,firstClear,fullMaxClear:finishMax?snapshot():null,phases,claimedCheckpoints:[...claimed]};
}
const scenarios=[
 simulate({name:'Baseline: six-car path, Rover and Van comfort upgrades, skip late plateau cars'}),
 simulate({name:'Same six-car path, stock intermediates',comfortCars:[]}),
 simulate({name:'Same six-car baseline, capable assumptions',a:capable}),
 simulate({name:'Same six-car baseline, frequent mistakes',a:frequent}),
 simulate({name:'Same baseline, no optional delivery/mission/first bonuses',a:{...typical,cleanSuccessFraction:0,hardSuccessFraction:0,firstDeliveryBonus:false,missions:false}}),
 simulate({name:'Same baseline, no hard-branch choices',a:{...typical,hardSuccessFraction:0}}),
 simulate({name:'Same baseline, 90%-late failures',a:{...typical,failureAtFraction:.9}}),
 simulate({name:'Five-car plan, skip Rover as well',carPath:[0,1,4,6,9],comfortCars:[4]}),
 simulate({name:'Historical seven-car shopping habit, each late car comfort upgraded',carPath:[0,1,4,6,7,8,9],comfortCars:[4,6,7,8],firstFinishBuild:COMFORT}),
 simulate({name:'Optional ten-car collector, stock intermediates',carPath:[0,1,2,3,4,5,6,7,8,9],comfortCars:[]}),
 simulate({name:'Expert direct pickup-to-final short-farm witness',carPath:[0,9],a:expert,comfortCars:[],farmChoice:'yield'}),
];
const expertPaths=[];
for(let mask=0;mask<256;mask++)expertPaths.push(simulate({name:`Expert stock-path ${mask}`,carPath:[0,...Array.from({length:8},(_,k)=>k+1).filter((_,k)=>mask&(1<<k)),9],a:expert,comfortCars:[],farmChoice:'yield'}));
expertPaths.sort((a,b)=>a.firstClear.totalMinutes-b.firstClear.totalMinutes);
scenarios.push({...expertPaths[0],name:'Fastest first-clear witness among 256 stock-path subsets; not global optimum'});
const maxBest=[...expertPaths].sort((a,b)=>a.fullMaxClear.totalMinutes-b.fullMaxClear.totalMinutes)[0];
scenarios.push({...maxBest,name:'Fastest full-max-clear witness among 256 stock-path subsets; not global optimum'});
const routeTable=successful.map(r=>({car:r.id,build:r.upgrade,target:r.target,branch:r.branch,seconds:r.seconds,reward:r.reward,recordedHardBranches:r.recordedHardBranches,remainingFuel:r.endingFuel,fuelReserveMetres:r.fuelReserveMetres,inputFile:r.inputFile}));
const measuredStock=cars.map((v,i)=>{const row=endpoint(i);return {order:i+1,id:v.id,price:v.price,range:v.range,maxRange:round(1.3*v.range),tank10Brains:upgradeCost(i,ZERO,TANK),comfortBrains:upgradeCost(i,ZERO,COMFORT),maxAllBrains:upgradeCost(i,ZERO,MAX),stockEndpoint:row.target,stockSeconds:row.seconds,stockBaseReward:row.reward,stockBrainsPerSuccess:round(economics(row,typical).brains),stockExpectedMinutesPerSuccess:round((economics(row,typical).moving+economics(row,typical).overhead)/60)};});
const finalGapDemand=cars.slice(6).map(v=>{let demand=0;for(let p=9550;p<13550;p+=.1)demand+=Math.min(.1,13550-p)*biomeSurfaceAt(p,v.id).fuelFactor;return {id:v.id,nominalFinalGap:4000,centerlineWeightedFuelMetres:round(demand),maxRange:round(v.range*1.3),note:'Analytical fuel-factor integral only; excludes controller detours, service-circle offset, actual physics and chord cutting.'};});
const lateRoi=[7,8].map(i=>{const from=endpoint(6),to=endpoint(i);const fromEconomy=economics(from,typical),toEconomy=economics(to,typical),secondsSaved=fromEconomy.moving+fromEconomy.overhead-toEconomy.moving-toEconomy.overhead,extraSuccessfulRuns=cars[i].price/toEconomy.cash;return {from:cars[6].id,to:cars[i].id,price:cars[i].price,sameEndpoint:from.target===to.target,endpoint:to.target,baseReward:to.reward,expectedSecondsSavedPerCP15Success:round(secondsSaved),cashEquivalentExtraCP15Successes:round(extraSuccessfulRuns),timeToEarnPurchaseAtNewCarRateMinutes:round(extraSuccessfulRuns*(toEconomy.moving+toEconomy.overhead)/60),remainingSuccessesToAffordFinalFromZero:round(100000/toEconomy.cash),note:'Cash/time illustration with same assumptions; excludes first/mission rewards. Faster-car failure probability is the scenario value, not observed reliability.'};});
const after={main:hashes(mainRoot),candidate:hashes(candidateRoot)};assert.deepEqual(after,before,'No production file may change during analytical model');
const result={generatedAt:new Date().toISOString(),scope:'Read-only compact 13.59 km candidate; current prices, preserved old 16 payouts, unchanged brain/mission/school/upgrade rules. Scenario budgets, not measured human averages. No physics run by this model and no production mutations.',candidateRoot,routeFingerprint:inputs[0].report.routeFingerprint,inputHashes:Object.fromEntries(inputs.map(i=>[i.file,i.hash])),runtimeHashes:before,modelHash:hash(fs.readFileSync(fileURLToPath(import.meta.url))),runtimeUnchanged:true,measuredStock,routeTable,finalGapDemand,lateRoi,schools:SCHOOL_CONFIG,drivingBrainsPerSecond:PROGRESSION_CONFIG.drivingRate,bonusRates:DELIVERY_BONUS_RATES,totalOptionalCarPurchaseCash:sum(cars.map(c=>c.price)),totalOptionalAllCarUpgradeBrains:sum(measuredStock.map(c=>c.maxAllBrains)),assumptionNotes:[
 'Only successful clean route seconds, fuel, endpoints and crossing records are production-measured. Human speed multiplier, restart/menu time, success cleanliness, failure probability/location and branch mix are explicit assumptions.',
 'Expected failures per success are p/(1-p). A failed attempt consumes the assumed fraction of the slowed trip, earns only movement brains and pays no cash/mission/first award. Time spent stationary is not paid.',
 'Uses integer successful-run purchases with expected rewards. Mission state probabilities are propagated exactly for production mission rules; these budgeting paths are not sampled careers or population means.',
 'Human hard selection is mixed at the same measured route time. Both branches are not measured for every intermediate build; any branch-dependent travel-time difference is not resolved here. Hard eligibility uses full-fork completion, not destination number alone.',
 'Movement brains and cash accrue concurrently. Upgrade brains are paid before their measured build is used. Cars are paid in full, no trade-in, no save injection, no forced ownership, no compulsory school and no income while parked.',
 'First clear uses final tank10 with other stats0 unless explicitly stated. Full-max milestone then farms in that already-owned successful build until all four stats10 are affordable and completes one measured max10 trip. This is a feasible coarse upgrade path, not an optimum; staged speed/handling upgrades could improve it.',
 'Stock-path enumeration includes all 256 ordered subsets of eight intermediate cars but only freshly measured routes. It omits cheaper partial upgrades, unmeasured short routes, deliberate first-bonus tours, diverse mission-skipping policies and human optimizations.',
 'A 7–8-hour mean or enjoyment cannot be established from these deterministic physics journeys and assumed behavior. More repeated purchases or inflated prices are not evidence of more varied play.'
],scenarios,expertEnumeration:{count:256,fastestFirstClearPath:expertPaths[0].carPath,fastestFullMaxClearPath:maxBest.carPath,topFirstClearPaths:expertPaths.slice(0,8).map(s=>({carPath:s.carPath,firstClear:s.firstClear,fullMaxClear:s.fullMaxClear}))}};
fs.writeFileSync(path.join(outDir,'budget-results.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({measuredStock,scenarios:scenarios.map(s=>({name:s.name,path:s.carPath,firstClear:s.firstClear,fullMaxClear:s.fullMaxClear})),runtimeUnchanged:true},null,2));
