/** Read-only finite-route fuel audit. Geometry lower bound is independent of
 * controller skill; sampled paths are geometric, not a physics success claim. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CHECKPOINT_PROGRESS as checkpoints, NETWORK_CONFIG as config, FORK_DEFINITIONS as forks, TURN_DEFINITIONS as turns } from '../dist/route-network-config.js';
import { routePointAtProgress } from '../dist/route-network.js';
import { ECONOMY_CONFIG, vehicleConfig } from '../dist/economy-config.js';
import { getVehiclePerformance } from '../dist/vehicle-upgrades.js';
const from=checkpoints.at(-2),to=checkpoints.at(-1), radius=ECONOMY_CONFIG.checkpointRadius;
const finalTurns=turns.filter(t=>t[1]>from&&t[0]<to);
assert.ok(finalTurns.every(t=>t[0]>=from&&t[1]<=to),'Whole-turn analytic bound');
const finalForks=forks.filter(f=>f.to>from&&f.from<to);
assert.ok(finalForks.every(f=>f.from>from+radius&&f.to<to-radius),'Service circles outside forks');
assert.ok(finalForks.every(f=>!finalTurns.some(t=>t[1]>f.from&&t[0]<f.to)),'Fork excursions are on straight backbone spans');
const absoluteTurn=finalTurns.reduce((s,t)=>s+Math.abs(t[3]-t[2]),0);
// On each curved road strip ds >= (1 - halfWidth*abs(curvature))*dq.
// Straight fork spans cannot cover longitudinal q faster than traveled XZ.
// Using full road half-width (rather than the truck's stricter centre limit)
// and the most generous two trigger-circle edges makes this conservative.
const minimumLegalXZ=to-from-config.halfWidth*absoluteTurn-2*radius;
const level9=getVehiclePerformance('ashhauler',{fuel:9}).range;
const level10=getVehiclePerformance('ashhauler',{fuel:10}).range;
assert.ok(minimumLegalXZ>level9+40,'Tank9 excluded with more than 40m margin');
assert.ok(minimumLegalXZ>getVehiclePerformance('lavacrawler',{fuel:10}).range,'All earlier cars excluded');
const paths=[];
for(const branch of ['main','alternate']){
 let total=0,previous=routePointAtProgress(from,{branch});
 for(let q=from+.25;q<=to+.01;q+=.25){const p=routePointAtProgress(q,{branch});total+=Math.hypot(p.x-previous.x,p.z-previous.z);previous=p;}
 paths.push({branch,centrelineXZ:total,nominalFuel10Reserve:level10-total});
 assert.ok(total<level10-50,'Centreline budget leaves more than50m for careful bridge/service manoeuvres');
}
const result={scope:'Analytic lower bound for any continuous in-road final-leg path; sampled centreline lengths are not a physical driver test.',from,to,routeEnd:config.end,runout:config.end-to,minimumLegalXZ,tank9Range:level9,tank10Range:level10,tank9FailureMargin:minimumLegalXZ-level9,paths};
fs.writeFileSync(new URL('../qa/expanded-balance-geometry.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
