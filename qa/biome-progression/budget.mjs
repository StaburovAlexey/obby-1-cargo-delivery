import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {VEHICLE_CONFIG,DELIVERY_CHECKPOINTS} from '../../dist/economy-config.js';
import {BRIDGES} from '../../dist/road-bridges.js';
import {calculateDeliveryReward,advanceCareerMission} from '../../dist/career-missions.js';
const input=process.argv[2]||new URL('./journeys.json',import.meta.url);
const report=JSON.parse(fs.readFileSync(input,'utf8'));
// UI-only fixes do not invalidate a physics/fuel calibration. Verify the actual imported graph.
const distRoot=new URL('../../dist/',import.meta.url),physicsFiles=new Set();
function dependency(file){
 if(physicsFiles.has(file))return;physicsFiles.add(file);
 const source=fs.readFileSync(new URL(file,distRoot),'utf8');
 for(const match of source.matchAll(/(?:import|export)\s[\s\S]*?\sfrom\s*['"]\.\/([^'"]+\.js)['"]/g)){
  if(!match[1].includes('/'))dependency(match[1]);
 }
}
for(const file of ['gameplay.js','driving-model.js','garage-scene.js','road-hazards.js','city-driving.js','driving-ground.js','road-layout.js','vehicle-upgrades.js','road-bridges.js','career-route-tracker.js','biome-surfaces.js'])dependency(file);
for(const file of physicsFiles)assert.equal(createHash('sha256').update(fs.readFileSync(new URL(file,distRoot))).digest('hex'),report.runtimeHashes[file],'stale journey dependency: '+file);

assert.ok(report.results.length>=16);
assert.equal(new Set(report.results.map(r=>r.name)).size,report.results.length);
const cars=VEHICLE_CONFIG.filter(v=>!v.rewardOnly),prices=cars.map(v=>v.price);
const oldPrices=[0,1300,3200,6500,10000,16000,25000,45000,78000,100000];
const rounds=n=>Math.round(n*100)/100;
const assumptions={clean:{clean:1,hard:1,speed:1,restart:15,fail:Array(10).fill(0)},illustrative:{clean:.6,hard:.5,speed:1.15,restart:20,fail:[.03,.05,.06,.08,.09,.10,.12,.13,.14,.15]}};
const route=i=>report.results.find(r=>r.id===cars[i].id&&r.outcome==='delivery'&&r.name!=='reward-bmw-repeat');
const outcomes=(r,a)=>[false,true].flatMap(clean=>[false,true].map(hard=>({clean,hard,p:(clean?a.clean:1-a.clean)*(hard?(r.hard?a.hard:0):1-(r.hard?a.hard:0))}))).filter(o=>o.p>0);
function budget(cost,path,a){
 let money=0,seconds=0,deliveries=0,discoveries=0,failures=0,firstCash=0,missionCash=0;
 let missions=new Map([[JSON.stringify([0,0,[]]),1]]);const claimed=new Set(),phases=[];
 function duration(i,driving){const failed=a.fail[i]/(1-a.fail[i]);failures+=failed;return driving*a.speed*(1+.65*failed)+a.restart*(1+failed);}
 function deliver(i){
  const r=route(i),base=DELIVERY_CHECKPOINTS[r.checkpoint-1].reward;assert.equal(base,r.baseReward);
  const bridgeIds=BRIDGES.filter(b=>b.to+3<DELIVERY_CHECKPOINTS[r.checkpoint-1].progress).map(b=>b.id),next=new Map();
  for(const o of outcomes(r,a)){
   money+=o.p*calculateDeliveryReward(base,o).totalCash;
   for(const [key,weight] of missions){
    const [missionSequence,missionProgress,missionBridgeIds]=JSON.parse(key),retention={missionSequence,missionProgress,missionBridgeIds},award=advanceCareerMission(retention,{clean:o.clean,hard:o.hard,bridgeIds});
    const p=weight*o.p,k=JSON.stringify([retention.missionSequence%3,retention.missionProgress,[...retention.missionBridgeIds].sort()]);next.set(k,(next.get(k)||0)+p);
    if(award){money+=award.cash*p;missionCash+=award.cash*p;}
   }
  }
  if(!claimed.has(r.checkpoint)){const first=calculateDeliveryReward(base,{first:true}).first;money+=first;firstCash+=first;claimed.add(r.checkpoint);}
  missions=next;seconds+=duration(i,r.seconds);deliveries++;
 }
 for(let k=0;k<path.length;k++){
  const i=path[k],j=path[k+1],before=seconds,count=deliveries;
  if(j===undefined){assert.equal(cars[i].id,'ashhauler');deliver(i);}
  else{
   while(money+1e-8<cost[j])deliver(i);
   if(cars[i].specialty!==cars[j].specialty){
    const witness=report.results.find(r=>r.id===cars[i].id&&r.discovery===cars[j].specialty);assert.ok(witness,'reachable paid path to '+cars[j].id);assert.ok(witness.minFuelFraction>.15);
    seconds+=duration(i,witness.seconds);discoveries++;
   }
   money-=cost[j];assert.ok(money>=0);
  }
  phases.push({car:cars[i].id,purpose:j===undefined?'finish':'buy '+cars[j].id,deliveries:deliveries-count,minutes:rounds((seconds-before)/60),cashAfter:rounds(money)});
 }
 return {minutes:rounds(seconds/60),successfulDeliveries:deliveries,discoveries,expectedFailures:rounds(failures),purchaseCash:path.reduce((s,i)=>s+cost[i],0),firstCash,missionCash:rounds(missionCash),phases};
}
const scenarios=[];
for(const [assumption,a] of Object.entries(assumptions))for(const [pathName,path] of [['allTen',[0,1,2,3,4,5,6,7,8,9]],['sixCars',[0,1,3,5,6,9]]])for(const [curve,cost] of [['oldPrices',oldPrices],['newPrices',prices]])scenarios.push({assumption,path:pathName,curve,...budget(cost,path,a)});
const standalone=prices.slice(1).map((price,i)=>{const r=route(i),repeat=calculateDeliveryReward(r.baseReward,{clean:true,hard:r.hard}).totalCash;return {id:cars[i+1].id,price,predecessor:cars[i].id,checkpoint:r.checkpoint,base:r.baseReward,cleanRepeat:repeat,runsFromZeroWithBonuses:Math.ceil(price/repeat),runsFromZeroBaseOnly:Math.ceil(price/r.baseReward)};});
const output={generatedAt:new Date().toISOString(),scope:'Measured current production-physics trips with live price/reward/mission rules. Fixed progression paths, not global optimization or observed human averages. Same new stats and payouts for old/new price comparisons.',journeyReportGeneratedAt:report.generatedAt,validatedPhysicsFiles:[...physicsFiles].sort(),assumptions,prices,totalPrice:prices.reduce((a,b)=>a+b,0),oldTotalPrice:oldPrices.reduce((a,b)=>a+b,0),standalone,scenarios,limitations:['Four unpaid discovery trips; all prices paid in full; no trade-in, cash grants, discovery bonuses, optional schools or cosmetics.','Car upgrades use brains and are optional here: all required witness trips are stock. Cheaper partial tank-upgrade strategies may skip more cars.','Success bonuses are probabilistic expected awards in the illustrative scenario. Failures pay zero and occur at 65% of a trip; slowdown, restart and failure assumptions are illustrative.','First-visit claims and sequential mission state persist across purchases. A delivery pays only its endpoint.','The second snow car remains optional: comfort/speed/range value does not make it the fastest cash strategy.']};
if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({totalPrice:output.totalPrice,standalone,scenarios:scenarios.map(({phases,...r})=>r)},null,2));
