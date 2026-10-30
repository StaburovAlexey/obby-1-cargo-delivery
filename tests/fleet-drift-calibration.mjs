import test from 'node:test';
import assert from 'node:assert/strict';
import {measureDrift} from './fixtures/drift-fleet.mjs';

const reference=measureDrift('bmwreward');
test('BMW preserves its approved drift, handbrake and recovery behavior',()=>{
 for(const [actual,expected] of [[reference.corner.slipDegrees,19.7054609024],[reference.corner.yaw,.7685688357],
  [reference.handbrake.slipDegrees,81.6908167137],[reference.recovery.speed,5.9430035087]]){
  assert.ok(Math.abs(actual-expected)<.001,`BMW baseline changed: ${actual} vs ${expected}`);
 }
});
for(const steering of [.7,-.7])for(const id of ['cadillac75','koenigseggone1']){
 test(`${id} retains BMW-like drift and brake response with steering ${steering}`,()=>{
  const baseline=steering>0?reference:measureDrift('bmwreward',{steering});
  const result=measureDrift(id,{steering});
  for(const [label,actual,expected,tolerance] of [
   ['corner slip',result.corner.slipDegrees,baseline.corner.slipDegrees,.2],
   ['yaw',result.corner.yaw,baseline.corner.yaw,.2],
   ['brake slip',result.handbrake.slipDegrees,baseline.handbrake.slipDegrees,.25]]){
   assert.ok(Math.abs(actual/expected-1)<tolerance,`${label}: ${actual} vs BMW ${expected}`);
  }
  assert.equal(result.unsupported,0,'all maneuvers retain tire support');
  assert.ok(result.recovery.speed>2,'released brake and countersteer recover forward drive');
  assert.ok(result.recovery.slipDegrees<10,'countersteer recovers a small slip angle');
 });
}

for(const [id,slip,yaw] of [['bmwe30',21.6821852507,.8090203016],['phoenixinterceptor',21.4845725824,.8076846726]]){
 test(`${id} keeps its existing corner response`,()=>{
  const result=measureDrift(id);
  assert.ok(Math.abs(result.corner.slipDegrees-slip)<.001);
  assert.ok(Math.abs(result.corner.yaw-yaw)<.001);
 });
}
const levels={speed:5,handling:5,grip:5,fuel:5};
for(const id of ['cadillac75','koenigseggone1']){
 test(`${id} retains reference drift with level-five upgrades`,()=>{
  const baseline=measureDrift('bmwreward',{levels}),result=measureDrift(id,{levels});
  assert.ok(Math.abs(result.corner.slipDegrees/baseline.corner.slipDegrees-1)<.2);
  assert.ok(Math.abs(result.corner.yaw/baseline.corner.yaw-1)<.2);
  assert.equal(result.unsupported,0);
  assert.ok(result.recovery.speed>2);
 });
}
