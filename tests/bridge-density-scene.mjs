import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../dist/vendor/three.module.js';
import {buildCity} from '../dist/network-scene.js';
import {buildRoadHazards,ROAD_HAZARD_EXCLUSIONS,ROAD_HAZARD_RULES} from '../dist/road-hazards.js';
import {BRIDGES} from '../dist/road-bridges.js';
import {routePointAtProgress} from '../dist/route-network.js';
import {freshCareer,sanitizeCareer} from '../dist/career-save.js';
const city=buildCity(T),road=city.group.getObjectByName('Continuous 30m-wide road'),ground=city.group.getObjectByName('Closed continuous terrain foundation');city.group.updateMatrixWorld(true);
assert.equal(city.stats.drawCalls,8);assert.equal(city.stats.bridges,25);assert(city.stats.triangles<130000);
const ray=new T.Raycaster();let deck=0,gaps=0;
for(const b of BRIDGES){for(const dq of [-8,0,8]){
 const p=routePointAtProgress((b.from+b.to)/2+dq);
 for(const offset of [b.offset,b.offset-4,b.offset+4]){
  ray.set(new T.Vector3(p.x+p.right.x*offset,p.height+100,p.z+p.right.z*offset),new T.Vector3(0,-1,0));
  const hits=ray.intersectObject(road,false);if(offset===b.offset){assert(hits.length>0,b.id+'deck');deck++;}else{assert.equal(hits.length,0,b.id+'no full-width road');gaps++;}
  assert.equal(ray.intersectObject(ground,false).length,0,b.id+'no grass under gap');
 }
}}
const hazardCounts=[];for(const seed of [0,1,42,12345,99999]){const hazards=buildRoadHazards(seed);assert.equal(hazards.length,ROAD_HAZARD_RULES.count);for(const h of hazards)assert(ROAD_HAZARD_EXCLUSIONS.every(e=>Math.abs(h.distance-e.distance)>=e.radius+Math.hypot(h.width,h.length)/2+1));hazardCounts.push(hazards.length);}
const oldIds=BRIDGES.filter(b=>/-[123]$/.test(b.id)).map(b=>b.id);assert.equal(oldIds.length,15);
for(const id of oldIds){const c=freshCareer();c.retention.missionSequence=1;c.retention.missionProgress=1;c.retention.missionBridgeIds=[id];const restored=sanitizeCareer(c);assert.deepEqual(restored.retention.missionBridgeIds,[id]);assert.equal(restored.retention.missionProgress,1);}
fs.mkdirSync('qa/bridge-density',{recursive:true});fs.writeFileSync('qa/bridge-density/scene.json',JSON.stringify({stats:city.stats,deck,gaps,hazardCounts,preservedSavedBridgeIds:oldIds,scope:'CPU actual meshes/rays; no GPU FPS claim'},null,2));city.dispose();console.log(`PASS 25 bridge meshes: ${deck} deck rays, ${gaps} real side gaps, no terrain beneath, 8 world drawcalls, all legacy mission bridge IDs preserved.`);
