import fs from 'node:fs';
import assert from 'node:assert/strict';
const data=JSON.parse(fs.readFileSync(new URL('./budget-results.json',import.meta.url)));
assert.equal(data.runtimeUnchanged,true);
assert.deepEqual(data.measuredStock.map(v=>v.price),[0,1300,3200,6500,10000,16000,25000,45000,78000,100000]);
assert.deepEqual(data.measuredStock.map(v=>v.range),[290,380,496,646,841,1095,1425,1855,2413,3140]);
assert.ok(data.measuredStock.slice(1).every((v,i)=>v.range>data.measuredStock[i].maxRange));
assert.equal(data.drivingBrainsPerSecond,3);
assert.deepEqual(data.schools.map(s=>s.rate),[1.5,1.8,2.2,2.6,3]);
assert.deepEqual(data.lateSteps.map(s=>[s.tank1Brains,s.tank1Endpoint,s.tank1Reward]),[[120,13,10510],[145,14,12910],[170,15,15680]]);
assert.equal(data.measuredStock[9].tank10Brains,11265);
assert.equal(data.measuredStock[9].maxAllBrains,45060);
assert.equal(data.expertEnumeration.count,256);
for(const scenario of data.scenarios){
 assert.equal(scenario.carPath[0],'pickup');assert.equal(scenario.carPath.at(-1),'ashhauler');
 const indexes=scenario.carPath.map(id=>data.measuredStock.findIndex(v=>v.id===id));assert.equal(new Set(indexes).size,indexes.length);assert.ok(indexes.slice(1).every((n,i)=>n>indexes[i]));
 assert.equal(scenario.firstClear.cashSpent,indexes.slice(1).reduce((a,i)=>a+data.measuredStock[i].price,0));
 for(const snapshot of [scenario.firstClear,scenario.fullMaxClear]){assert.ok(snapshot.cashAfter>=0);assert.ok(snapshot.brainsAfter>=0);assert.equal(snapshot.requiredStudyMinutes,0);assert.ok(snapshot.successfulRuns>=1);assert.ok(Math.abs(snapshot.totalMinutes-snapshot.movingMinutes-snapshot.interfaceRestartMinutes)<.003);}
 assert.ok(scenario.fullMaxClear.totalMinutes>=scenario.firstClear.totalMinutes);assert.equal(scenario.fullMaxClear.cashSpent,scenario.firstClear.cashSpent);
 const upgradeTotal=scenario.phases.reduce((a,p)=>a+p.upgradeBrains,0);assert.equal(upgradeTotal,scenario.fullMaxClear.brainsSpent);assert.ok(scenario.fullMaxClear.brainsSpent>=45060);
 assert.equal(scenario.phases.reduce((a,p)=>a+p.runs,0),scenario.fullMaxClear.successfulRuns);
 assert.equal(scenario.fullMaxClear.firstCash,scenario.claimedCheckpoints.reduce((a,target)=>a+Math.floor(([110,260,470,730,1080,1550,2180,3020,4090,5350,6780,8460,10510,12910,15680,19460][target-1])*.05),0)*(scenario.a.firstDeliveryBonus?1:0));
}
const noBonus=data.scenarios.find(s=>s.name.includes('no optional'));
assert.equal(noBonus.fullMaxClear.firstCash+noBonus.fullMaxClear.firstBrains+noBonus.fullMaxClear.missionCash+noBonus.fullMaxClear.missionBrains,0);
console.log(`Passed compact budget invariants: ${data.scenarios.length} scenarios, ${data.expertEnumeration.count} path subsets, current prices/payouts, paid upgrades, no compulsory study, no runtime writes.`);
