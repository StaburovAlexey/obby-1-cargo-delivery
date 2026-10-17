import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {CANYON_APPROACH_ROCKS as rocks,CANYON_ROCK_START} from '../dist/canyon-rocks.js';
import {canyonApproachPoint,canyonApproachQuads,CANYON_APPROACH_LENGTH} from '../dist/canyon-approach.js';
import {pointInRoad} from '../dist/road-layout.js';
import {ROAD_MESH} from '../dist/route-network.js';
import {buildCity,createRoadFootprintIndex,polygonIntersectionArea} from '../dist/network-scene.js';
import {createCanyonScene} from '../dist/canyon-scene.js';

test('rocks begin at the first exposed fork asphalt and continue into the old canyon',()=>{
 for(let s=0;s<CANYON_ROCK_START;s++){const p=canyonApproachPoint(s);assert.ok(pointInRoad(p.x+p.right.x*9,p.z+p.right.z*9));}
 assert.equal(rocks[0].distance,CANYON_ROCK_START);assert.ok(CANYON_ROCK_START<60,'no distant drift-start offset');
 for(const side of [-1,1]){const r=rocks.filter(p=>p.side===side);assert.ok(r[0].distance<(side===1?60:140));assert.equal(r.at(-1).distance,CANYON_APPROACH_LENGTH+38);
 for(let i=1;i<r.length;i++){assert.ok(r[i].distance-r[i-1].distance<=19);assert.ok(polygonIntersectionArea(r[i].footprint,r[i-1].footprint)>1,'continuous actual rock silhouette');}}
});

test('every new rock footprint leaves main asphalt and the complete approach shoulder clear',()=>{
 const main=createRoadFootprintIndex(ROAD_MESH);
 for(const rock of rocks){assert.ok(!main.intersects(rock.footprint,1e-6));for(const quad of canyonApproachQuads(1))assert.ok(polygonIntersectionArea(rock.footprint,quad)<1e-6,'clear 20 m approach ribbon');}
});

test('terrain and city facades are cut out under actual new rock footprints',()=>{
 const city=buildCity(THREE);
 try{const g=city.group.getObjectByName('Closed continuous terrain foundation').geometry,index=createRoadFootprintIndex({positions:Array.from(g.attributes.position.array),indices:Array.from(g.index.array)});
 for(const rock of rocks){assert.ok(!index.intersects(rock.footprint,.0001),'no terrain layer inside rock footprint');for(const b of city.features.filter(f=>f.type==='building'))assert.ok(polygonIntersectionArea(rock.footprint,b.footprint.map(v=>({x:v.x,z:-v.y})))<1e-6,'no house/rock intersection');}}
 finally{city.dispose();}
});

test('rendered approach strata match footprints and retain shared rings without buried or internal caps',()=>{
 const scene=createCanyonScene(THREE),matrix=new THREE.Matrix4();
 try{const layers=[0,1,2].map(i=>scene.group.getObjectByName('Canyon approach sandstone stratum '+i));
 for(let k=0;k<3;k++){const mesh=layers[k],g=mesh.geometry;assert.equal(mesh.count,rocks.length);
 for(let j=0;j<g.index.count;j++){const n=g.attributes.normal.getY(g.index.getX(j));assert.ok(n>-.99,'no overlapping underground bottom caps');if(k<2)assert.ok(n<.99,'no internal top caps');}
 for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);assert.ok(Math.abs(matrix.elements[12]-rocks[i].x)<1e-4);assert.ok(Math.abs(matrix.elements[14]-rocks[i].z)<1e-4);
 for(const v of rocks[i].footprint){let nearest=Infinity;for(let j=0;j<g.attributes.position.count;j++){const p=new THREE.Vector3().fromBufferAttribute(g.attributes.position,j).applyMatrix4(matrix);nearest=Math.min(nearest,Math.hypot(p.x-v.x,p.z-v.z));}assert.ok(nearest<.0001,'rendered ring matches terrain cut');}}}
 for(let i=0;i<rocks.length;i++){const bands=layers.map(l=>{l.getMatrixAt(i,matrix);return {lo:matrix.elements[13]-matrix.elements[5]/2,hi:matrix.elements[13]+matrix.elements[5]/2};});for(let k=1;k<3;k++)assert.ok(Math.abs(bands[k].lo-bands[k-1].hi)<.00002);}
 }finally{scene.dispose();}
});
