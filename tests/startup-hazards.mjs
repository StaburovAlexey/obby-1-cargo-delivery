import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRoadHazards} from '../dist/road-hazards.js';

test('cold hazard generation avoids repeated curve work for overlapping approach samples',t=>{
 const sin=Math.sin;let curveWork=0;t.mock.method(Math,'sin',value=>{curveWork++;return sin(value);});
 const hazards=buildRoadHazards(42);
 assert.equal(hazards.length,28);
 assert.ok(curveWork<500000,`curve work budget exceeded: ${curveWork} sine evaluations; overlapping approach samples must be reused`);
});
