import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import {buildCity} from '../dist/scene.js';
import {createGarageScene} from '../dist/garage-scene.js';
import {DELIVERY_CHECKPOINTS,VEHICLE_CONFIG} from '../dist/economy-config.js';
import {createDrivingModel} from '../dist/driving-model.js';
import {routePointAtDistance} from '../dist/road-layout.js';
import {createRoadHazards} from '../dist/road-hazards.js';
import {createRoadHazardsScene} from '../dist/road-hazards-scene.js';
let passed=0;const test=(name,fn)=>{fn();passed++;console.log('PASS '+name);};
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const city=buildCity(THREE,{seed:42}),garage=createGarageScene(THREE,city);city.group.getObjectByName('Orange delivery truck').visible=false;
try{
 test('Every increasingly distant checkpoint is paired left delivery/right fuel at the same route arc station',()=>{
  assert.equal(garage.deliveries.length,11);assert.equal(garage.stations.length,11);
  let lastDistance=0,lastGap=0,lastReward=0;
  for(let i=0;i<DELIVERY_CHECKPOINTS.length;i++){
   const c=DELIVERY_CHECKPOINTS[i],d=garage.deliveries[i],f=garage.stations[i],p=routePointAtDistance(c.distance),gap=c.distance-lastDistance;
   assert.ok(gap>lastGap);assert.ok(c.reward>lastReward);
   assert.equal(d.distance,f.distance);assert.equal(d.reward,c.reward);assert.equal(d.checkpointId,f.checkpointId);
   const side=q=>(q.x-p.x)*p.right.x+(q.z-p.z)*p.right.z;assert.ok(Math.abs(side(d)+8)<1e-9);assert.ok(Math.abs(side(f)-8)<1e-9);
   assert.ok(Math.abs((d.x+f.x)/2-p.x)<1e-9);assert.ok(Math.abs((d.z+f.z)/2-p.z)<1e-9);
   assert.equal(d.nonBlocking,true);assert.equal(f.nonBlocking,true);assert.equal(f.canister.name,'Floating fuel canister');
   lastDistance=c.distance;lastGap=gap;lastReward=c.reward;
  }
 });
 test('All prices and rewards use the same native dollar icon; buy is explicit and footer retains one fuel/speed row',()=>{
  assert.match(html,/<symbol id="hud-money"/);
  for(let i=1;i<=DELIVERY_CHECKPOINTS.length;i++){assert.match(html,new RegExp(`id="delivery-label-${i}"[^]*?<use href="#hud-money"`));assert.match(html,new RegExp(`id="delivery-value-${i}"`));}
  for(let i=1;i<=VEHICLE_CONFIG.length;i++){assert.match(html,new RegExp(`id="vehicle-price-${i}"[^]*?<use href="#hud-money"`));}
  assert.match(html,/<button id="buy-vehicle"[^>]*type="button"[^>]*hidden/);
  assert.match(html,/<div class="drive-bottom-row">\s*<section id="fuel-hud"[^]*?<\/section>\s*<div class="drive-speed">/);
  assert.doesNotMatch(html,/id="exit-car"|id="info-toggle"/);
 });
 test('All ten tiers increase speed/range; original three capacities and every D/R direction remain valid',()=>{
  let speed=0,capacity=0,range=0;
  for(const [index,spec] of VEHICLE_CONFIG.entries()){if(index>0){assert.ok(spec.maxSpeed>VEHICLE_CONFIG[index-1].maxSpeed);assert.ok(spec.range>VEHICLE_CONFIG[index-1].range);}if(['pickup','rover','van'].includes(spec.id)){assert.ok(spec.maxSpeed>speed&&spec.capacity>capacity&&spec.range>range);speed=spec.maxSpeed;capacity=spec.capacity;range=spec.range;}
   for(const gear of ['D','R']){const m=createDrivingModel({maxSpeed:spec.maxSpeed});m.setGear(gear);m.setInput({active:true});for(let i=0;i<720;i++)m.step(1/60);assert.ok(Math.abs(Math.abs(m.state.speed)-spec.maxSpeed)<.01);assert.equal(Math.sign(m.state.travel),gear==='D'?1:-1);}
  }
 });
 test('Nominal gap budgets preserve affordable progression; actual driven ranges have separate journey tests',()=>{
  const reachable=VEHICLE_CONFIG.map(v=>{let last=0,reward=0;for(const c of DELIVERY_CHECKPOINTS){if(c.distance-last>v.range)break;last=c.distance;reward=c.reward;}return {id:v.id,distance:last,reward};});
  assert.deepEqual(reachable.map(x=>DELIVERY_CHECKPOINTS.findIndex(c=>c.distance===x.distance)+1),[4,5,7,8,10,11,11,11,11,11]);
  assert.ok(VEHICLE_CONFIG[1].price<=2*reachable[0].reward);
  for(let i=1;i<VEHICLE_CONFIG.length;i++)assert.ok(VEHICLE_CONFIG[i].price<=3*reachable[i-1].reward,`${VEHICLE_CONFIG[i].id}: next tier remains attainable within three farthest reachable deliveries`);
 });
 test('Character poses, base checker and input/camera modules are byte-identical to v21',()=>{
  const expected=JSON.parse(fs.readFileSync(new URL('./fixtures/economy-unchanged-v21.json',import.meta.url)));

  for(const [file,hash]of Object.entries(expected)){if(file==='building-material.js')continue;const data=fs.readFileSync(new URL('../dist/'+file,import.meta.url));assert.equal(crypto.createHash('sha256').update(data).digest('hex'),hash,file);}
 });
 test('Scene metrics include all visible procedural vehicles and checkpoints, with no geometric studs',()=>{
  const root=new THREE.Group(),hazards=createRoadHazards(42),hazardScene=createRoadHazardsScene(THREE,{system:hazards});root.add(city.group,garage.group,hazardScene.group);let triangles=0,batches=0,instances=0;
  root.traverse(o=>{if(!o.isMesh||(o.isInstancedMesh&&o.count===0))return;for(let p=o;p;p=p.parent)if(!p.visible)return;triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);batches++;if(o.isInstancedMesh)instances+=o.count;});
  assert.ok(triangles<165000);assert.equal(city.stats.studs,false);assert.equal(city.stats.roadsideProps,0);assert.equal(city.stats.roadWidth,30);
  const report={seed:42,procedural:{triangles,batches,instances},hazards:{...hazardScene.stats},city:city.stats,deliveryPoints:garage.deliveries.length,fuelStations:garage.stations.length,characterDisplayTriangles:100014,activeBaconTriangles:3817,walkingSceneTriangles:triangles+100014+3817,note:'Static scene traversal, not GPU draw calls or FPS. No browser used.'};
  fs.writeFileSync(new URL('./latest-economy-metrics.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));hazardScene.dispose();
 });
}finally{garage.dispose();city.dispose();}
console.log(`Economy UI/geometry: ${passed} checks passed. Node/static only.`);
