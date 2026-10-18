import test from 'node:test';
import assert from 'node:assert/strict';
import {measureGeometry} from '../qa/rendering/geometry.mjs';
test('42 iPhone portrait/landscape camera poses submit at least 75 percent less world geometry without extra calls',()=>{
 const result=measureGeometry();assert.equal(result.samples.length,42);
 assert.ok(result.minimumReduction>=.75,JSON.stringify(result));
 assert.ok(result.samples.every(s=>s.afterCalls<=s.beforeCalls));
});
