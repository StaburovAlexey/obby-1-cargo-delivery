import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {buildCity} from '../dist/network-scene.js';
import {buildRoadHazards,ROAD_HAZARD_EXCLUSIONS,createRoadHazards,ROAD_HAZARD_RULES} from '../dist/road-hazards.js';
import {BRIDGES,bridgeSupport} from '../dist/road-bridges.js';
import {BIOMES,FORKS,routePointAtProgress} from '../dist/route-network.js';
const city=buildCity(THREE),h=buildRoadHazards();
assert.equal(city.stats.drawCalls,8);assert.ok(city.stats.triangles<98288*1.2);assert.equal(city.stats.bridges,25);
assert.deepEqual(h,buildRoadHazards());assert.equal(h.length,ROAD_HAZARD_RULES.count);
for(const b of BIOMES){assert.equal(BRIDGES.filter(x=>x.biome===b.id).length,5);assert.ok(h.some(x=>x.biome===b.id));}
for(const b of BRIDGES){const q=(b.from+b.to)/2;assert.ok(!FORKS.some(f=>q>f.from-150&&q<f.to+150));const p=routePointAtProgress(q),pose={x:p.x+p.right.x*b.offset,z:p.z+p.right.z*b.offset,heading:p.heading};assert.equal(bridgeSupport(pose,p).fall,false);}
for(const x of h){assert.ok(ROAD_HAZARD_EXCLUSIONS.every(e=>Math.abs(x.distance-e.distance)>=e.radius+Math.hypot(x.width,x.length)/2+1));assert.ok(BIOMES.some(b=>b.id===x.biome&&x.progress>=b.from&&x.progress<=b.to));}
const system=createRoadHazards();assert.ok(system.rocks.every(r=>r.phase==='landed'&&!r.shadowVisible&&r.altitude===0));
fs.writeFileSync(new URL('../qa/expanded-scene.json',import.meta.url),JSON.stringify({stats:city.stats,hazards:h.length,staticRocks:system.rocks.length,baselineTriangles:98288,triangleRatio:city.stats.triangles/98288,scope:'CPU scene geometry, not GPU FPS',passed:true},null,2));city.dispose();console.log('PASS expanded scene: 8 world draw calls, bounded triangles, 25 safe bridges, deterministic hazards, static rocks.');
