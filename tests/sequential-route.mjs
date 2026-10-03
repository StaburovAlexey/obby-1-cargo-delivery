#!/usr/bin/env node
// Current branching-world integration. Supersedes the old world-Z/no-fork
// assumptions. Graph topology and exact union geometry have separate tests.
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import * as road from '../dist/road-layout.js';
import {buildCity} from '../dist/network-scene.js';
import {createGarageScene,GARAGE_LAYOUT} from '../dist/garage-scene.js';
import {DELIVERY_CHECKPOINTS,VEHICLE_CONFIG} from '../dist/economy-config.js';
import {groundHeight,fitTruckToGround,SUPPORT_CLEARANCE} from '../dist/city-driving.js';
import {roadGroundGradient,roadGroundSurface} from '../dist/driving-ground.js';
import {BIOME_DESTINATIONS} from '../dist/biome-travel.js';
let passed=0;const check=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
const near=(a,b,e=1e-5)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<e,`${a} != ${b}`);
const city=buildCity(THREE,{seed:42}),garage=createGarageScene(THREE,city);city.group.updateMatrixWorld(true);garage.group.updateMatrixWorld(true);
try{
check('Longer sequential route keeps 30m lanes and eleven stable paired checkpoints on common edges',()=>{
 assert.equal(road.FORKS.length,4);assert.equal(road.ROUTE.halfWidth,15);assert.ok(road.ROUTE_LENGTH>10800);assert.equal(DELIVERY_CHECKPOINTS.length,11);
 for(const [i,s]of DELIVERY_CHECKPOINTS.entries()){assert.equal(s.id,`checkpoint-${String(i+1).padStart(2,'0')}`);const p=road.routePointAtDistance(s.distance);near(p.progress,s.progress);assert.ok(!road.FORKS.some(f=>s.progress>f.from&&s.progress<f.to));if(i)assert.ok(s.reward>DELIVERY_CHECKPOINTS[i-1].reward);}
});
check('Actual fuel and delivery ring vertices follow ground and clear the full road boundary',()=>{
 assert.equal(garage.stations.length,11);assert.equal(garage.deliveries.length,11);
 for(const [stops,side]of [[garage.stations,1],[garage.deliveries,-1]])for(const stop of stops){const p=road.routePointAtDistance(stop.distance);near(stop.x,p.x+side*8*p.right.x);near(stop.z,p.z+side*8*p.right.z);assert.equal(stop.biome,p.biome);assert.ok(road.truckInRoad(stop.x,stop.z,p.heading,p));
 for(const mesh of [stop.circle,stop.glow])for(let i=0;i<mesh.geometry.attributes.position.count;i++){const v=new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld);assert.ok(road.pointInRoad(v.x,v.z,.1));near(v.y,groundHeight(v.x,v.z)+mesh.userData.groundLift,6e-5);}}
});
check('Garage apron, parking, school and road launch remain at their original flat height',()=>{
 const spawn=road.routePointAtDistance(0);near(spawn.x,0);near(spawn.z,6);near(spawn.height,0);assert.equal(GARAGE_LAYOUT.entranceZ,26);
 for(let x=GARAGE_LAYOUT.minX;x<=GARAGE_LAYOUT.maxX;x+=5)for(let z=26;z<=90;z+=5)near(groundHeight(x,z),.008);
 assert.equal(garage.vehicles.length,10);assert.equal(garage.desks.length,20);assert.equal(garage.stands.length,17);
});
check('Four-wheel fit uses one chassis edge history in both directions over every fork and grade',()=>{
 let n=0;for(const branch of ['main','alternate']){let history;
 for(let q=0;q<=10800;q+=17.3){const p=road.routePointAtProgress(q,{branch});history=road.projectRoad(p.x,p.z,history);for(const delta of[0,Math.PI]){const pose=fitTruckToGround(THREE,p.x,p.z,p.heading+delta,history);assert.ok([...pose.position,...pose.quaternion,...pose.normal,...pose.clearances].every(Number.isFinite));near(pose.quaternion.length(),1,1e-8);near(Math.min(...pose.clearances),SUPPORT_CLEARANCE,1e-7);assert.ok(pose.normal.y>.99);n++;}
 const surface=road.queryRoadSurface(p.x,p.z,history);assert.deepEqual(roadGroundGradient(p.x,p.z,history),surface.gradient);}}
 assert.ok(n>2400);
});
check('All vehicle terrain callbacks and preview destinations use canonical progress rather than world Z',()=>{
 for(const v of VEHICLE_CONFIG)for(const b of road.BIOMES){const p=road.routePointAtProgress((b.from+b.to)/2);for(const offset of[-12,0,12]){const x=p.x+offset*p.right.x,z=p.z+offset*p.right.z;assert.equal(roadGroundSurface(x,z,v.id,p).id,b.id);}}
 for(const p of BIOME_DESTINATIONS){assert.ok(road.truckInRoad(p.x,p.z,p.heading,p));assert.equal(roadGroundSurface(p.x,p.z,'pickup',p).id,p.id);assert.ok(DELIVERY_CHECKPOINTS.every(s=>Math.abs(s.progress-p.progress)>95));}
});
check('City turn reaches a true perpendicular direction while shops and the finite road remain procedural',()=>{
 const a=road.routePointAtProgress(900),b=road.routePointAtProgress(1700);near(Math.abs(b.heading-a.heading),Math.PI/2);assert.ok(Math.abs(b.x-a.x)>400&&Math.abs(b.z-a.z)>400);
 assert.equal(city.stats.roadsideProps,0);assert.equal(city.stats.buildingHeightScale,2);assert.equal(city.stats.buildingWidthScale,3);assert.equal(city.stats.importedModels,0);assert.equal(city.stats.roadUnion,true);
});
}finally{garage.dispose();city.dispose();}
console.log(`Network world integration: ${passed}/6 groups passed. Node/Three geometry, not WebGL.`);
