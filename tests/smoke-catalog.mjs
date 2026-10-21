import test from 'node:test';
import assert from 'node:assert/strict';
import {VEHICLE_SMOKE_STYLES,DEFAULT_VEHICLE_SMOKE_ID,getVehicleSmokeStyle} from '../dist/vehicle-smoke-catalog.js';
test('smoke styles offer exactly the approved six icons and reject unknown selection',()=>{
 assert.equal(DEFAULT_VEHICLE_SMOKE_ID,'standard');
 assert.deepEqual(VEHICLE_SMOKE_STYLES.map(s=>s.id),['standard','flowers','hearts','skulls','coins','smileys']);
 for(const item of VEHICLE_SMOKE_STYLES){
  assert.ok(item.name.ru&&item.name.en);assert.ok(item.iconUrl.endsWith(`/smoke/${item.id}.webp`));
  assert.equal(getVehicleSmokeStyle(item.id),item);assert.ok(Object.isFrozen(item));
  assert.ok(!('price' in item),'no invented purchase terms');
 }
 assert.equal(getVehicleSmokeStyle('unknown'),null);assert.equal(getVehicleSmokeStyle(null),null);
});
