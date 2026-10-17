import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {buildCity,createRoadFootprintIndex,polygonIntersectionArea} from '../dist/network-scene.js';
import {CANYON_APPROACH_ROCKS} from '../dist/canyon-rocks.js';
import {canyonApproachQuads} from '../dist/canyon-approach.js';
import {ROAD_MESH} from '../dist/route-network.js';
const footprint=b=>b.footprint.map(p=>({x:p.x,z:-p.y}));

test('fitted houses close the blue/green frontage gap without touching sandstone or roads',()=>{
 const city=buildCity(THREE),road=createRoadFootprintIndex(ROAD_MESH);
 try{
  const houses=city.features.filter(f=>f.type==='building');
  const infills=houses.filter(f=>f.rockFittedFrontage);
  assert.equal(infills.length,2,'both missing lots receive full-height shopfront residences');
  const row=houses.filter(f=>f.edgeId==='city--17-3000'&&f.side===1&&f.from>143&&f.from<214).sort((a,b)=>a.from-b.from);
  assert.equal(row.length,5,'green neighbor, two infills, blue neighbor and next house');
  for(let i=1;i<row.length;i++){
   assert.equal(row[i].from,row[i-1].to,'no longitudinal frontage gap');
   const a=footprint(row[i-1])[3],b=footprint(row[i])[0];
   assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<1e-9,'front faces share their exact boundary');
  }
  for(const b of infills){
   const p=footprint(b);
   assert.ok(b.depth>2&&b.depth<4,'real shallow building footprint fits behind the facade');
   assert.ok(b.frontage>17&&b.top>23,'full-width, four-floor residence covers the exposed rock view');
   assert.equal(b.clearance,.35,'existing street setback retained');
   assert.ok(b.metricPrism&&b.alignedFacade&&Number.isFinite(b.shopBase),'normal residence/storefront renderer');
   assert.ok(!road.intersects(p,1e-6),'main road remains clear');
   for(const r of CANYON_APPROACH_ROCKS)assert.ok(polygonIntersectionArea(p,r.footprint)<1e-6,'no house/rock overlap');
   for(const q of canyonApproachQuads(1))assert.ok(polygonIntersectionArea(p,q)<1e-6,'entrance and shoulders stay clear');
   for(const other of houses)if(other!==b)assert.ok(polygonIntersectionArea(p,footprint(other))<1e-6,'no overlapping/coplanar house frontage');
  }
 }finally{city.dispose();}
});
