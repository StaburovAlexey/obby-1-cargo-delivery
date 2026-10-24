import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import {initializeRapier} from '../dist/rapier-runtime.js';
import {createPhysicsWorld,PHYSICS_FIXED_STEP} from '../dist/physics-world.js';
import {createRapierDrivingModel} from '../dist/rapier-vehicle.js';
import {buildCity} from '../dist/network-scene.js';
import {buildRoadPits} from '../dist/road-pits.js';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';
import {surfaceForBiome} from '../dist/biome-surfaces.js';
import {UPGRADE_MAX_LEVEL,UPGRADE_STATS,getUpgradeModifiers} from '../dist/vehicle-upgrades.js';
import {pointOnEdge,projectRoad,queryRoadSurface,ROAD_SURFACE_OFFSET} from '../dist/route-network.js';
import {loadRoadPitVehicleMetadata} from './fixtures/road-pit-vehicles.mjs';

const R=await initializeRapier();
const DT=PHYSICS_FIXED_STEP;
const MODES=['low','90%-cap','full','upgraded'];
// Optional focused reproduction, e.g. snow/citycourier/90%-cap or */*/low.
const caseFilter=process.env.ROAD_PIT_CASE?.split('/');
let metadata,catalog,city,physics;

function setup(){
  if(physics)return;
  catalog=buildRoadPits(42);
  city=buildCity(THREE,{seed:42,roadPits:catalog});
  physics=createPhysicsWorld({THREE,city});physics.step(DT);
}
test.after(()=>{physics?.dispose();city?.dispose();});

function point(pit,edgeDistance,offset=0){
  const p=pointOnEdge(pit.edgeId,edgeDistance);
  return{...p,x:p.x+p.right.x*offset,z:p.z+p.right.z*offset};
}
function castDown(x,z,y,distance=25){
  return physics.world.castRayAndGetNormal(new R.Ray({x,y,z},{x:0,y:-1,z:0}),distance,true);
}
function touchingChassis(world,chassis,names){
  let touching=false;
  world.contactPairsWith(chassis,other=>world.contactPair(chassis,other,manifold=>{
    let contact=manifold.numSolverContacts()>0;
    for(let i=0;i<manifold.numContacts();i++)if(manifold.contactDist(i)<=.002)contact=true;
    if(contact){touching=true;names?.add(other.userData?.name??'unnamed collider');}
  }));
  return touching;
}
function bodyCorners(model){
  const g=model.physicsGeometry,rotation=model.state.quaternion,q=new THREE.Quaternion(rotation.x,rotation.y,rotation.z,rotation.w);
  const p=new THREE.Vector3(model.state.x,model.state.y,model.state.z),result=[];
  for(const x of [-g.colliderHalf.x,g.colliderHalf.x])for(const z of [-g.colliderHalf.z,g.colliderHalf.z]){
    result.push(new THREE.Vector3(g.colliderCenter.x+x,g.colliderCenter.y-g.colliderHalf.y,g.colliderCenter.z+z).applyQuaternion(q).add(p));
  }
  return result;
}
function chassisFor(model){
  let chassis;physics.world.colliders.forEach(c=>{if(c.parent()?.handle===model.body.handle)chassis=c;});
  assert.ok(chassis,'real dynamic chassis collider');return chassis;
}

test('real city pit mouths have only deep floor support and ramps replace the original flat road',()=>{
  setup();
  const jumps=catalog.filter(p=>p.type==='jump');assert.equal(jumps.length,5);
  for(const pit of catalog){
    const p=point(pit,pit.edgeDistance,pit.offset??0),reference=queryRoadSurface(p.x,p.z).height+ROAD_SURFACE_OFFSET;
    const hit=castDown(p.x,p.z,reference+1);
    assert.ok(hit,`${pit.id}: visible deep floor must have a collider`);
    assert.match(hit.collider.userData.name,/^Road pit floors/);
    assert.ok(Math.abs(reference+1-hit.timeOfImpact-(pit.height+ROAD_SURFACE_OFFSET-20))<.15,`${pit.id}: floor is twenty metres below its original road reference`);
  }
  for(const pit of jumps){
    const s=(pit.ramp.fromEdgeDistance+pit.ramp.toEdgeDistance)/2,p=point(pit,s);
    const base=queryRoadSurface(p.x,p.z).height+ROAD_SURFACE_OFFSET,hit=castDown(p.x,p.z,base+4,5);
    assert.ok(hit,`${pit.id}: ramp supports the car`);assert.match(hit.collider.userData.name,/^Road jump ramps/);
    const ray=new THREE.Raycaster(new THREE.Vector3(p.x,base+4,p.z),new THREE.Vector3(0,-1,0),0,5);
    const visible=ray.intersectObject(city.group.getObjectByName('Road jump ramps'))[0];
    assert.ok(visible&&visible.point.y>base+.5,`${pit.id}: visible takeoff rises above the road`);
    assert.ok(Math.abs(base+4-hit.timeOfImpact-visible.point.y)<.015,`${pit.id}: Rapier support follows the rendered ramp profile`);
    assert.equal(castDown(p.x,p.z,base+.1,.2),null,`${pit.id}: no original hidden road or shoulder remains under the wedge`);
  }
});

function driveJump(pit,spec,mode){
  const rampStart=pit.ramp.fromEdgeDistance,near=point(pit,rampStart-9),aim=point(pit,(rampStart+pit.ramp.toEdgeDistance)/2);
  const levels=mode==='upgraded'?Object.fromEntries(UPGRADE_STATS.map(stat=>[stat.id,UPGRADE_MAX_LEVEL])):undefined;
  const surface=surfaceForBiome(pit.biome,spec.id),cap=spec.maxSpeed*surface.speedFactor*getUpgradeModifiers(levels).speed;
  const initial=mode==='low'?Math.min(8.25,cap):mode==='full'||mode==='upgraded'?cap:.9*cap;
  const model=createRapierDrivingModel({world:physics.world,x:near.x,z:near.z,heading:aim.heading,
    vehicleId:spec.id,maxSpeed:spec.maxSpeed,getVehicleMetadata:()=>metadata.get(spec.id),getUpgrades:()=>levels,groundSurface:()=>surface});
  const chassis=chassisFor(model),[farRight,farLeft]=pit.cutFootprint.slice(2),end={x:(farRight.x+farLeft.x)/2,z:(farRight.z+farLeft.z)/2};
  const bankWidth=Math.hypot(farRight.x-farLeft.x,farRight.z-farLeft.z);
  const forward={x:(farRight.z-farLeft.z)/bankWidth,z:-(farRight.x-farLeft.x)/bankWidth};
  const signed=p=>(p.x-end.x)*forward.x+(p.z-end.z)*forward.z;
  let strictTicks=0,bestStrictTicks=0,airborneTicks=0,stableTicks=0,landed=false,minClearance=Infinity;
  let priorCorners,furthest=0,maxOffset=0,minUp=1;
  const contacts=new Set(),trace=[];let lastContacts='',wasStrict=false;
  try{
    for(let i=0;i<90;i++)physics.step(DT,model);
    const slope=near.gradient.x*-Math.sin(aim.heading)+near.gradient.z*-Math.cos(aim.heading);
    model.body.setLinvel({x:-Math.sin(aim.heading)*initial,y:slope*initial,z:-Math.cos(aim.heading)*initial},true);
    model.setInput({active:true});priorCorners=bodyCorners(model);
    for(let i=0;i<1200;i++){
      physics.step(DT,model);
      const s=model.state,projection=projectRoad(s.x,s.z,{edgeId:pit.edgeId,progress:pit.progress}),after=projection.distance-(pit.distance+pit.length/2);
      for(const value of [s.x,s.y,s.z,s.upY,s.velocityX,s.velocityY,s.velocityZ])assert.ok(Number.isFinite(value),`${pit.id}/${spec.id}/${mode}: finite simulation`);
      minUp=Math.min(minUp,s.upY);furthest=Math.max(furthest,after);
      const currentContacts=new Set(),touching=touchingChassis(physics.world,chassis,currentContacts);
      for(const name of currentContacts)contacts.add(name);
      const strict=projection.distance>pit.distance-pit.length/2&&s.wheelContacts.length===4&&s.wheelContacts.every(c=>!c.grounded)&&!touching;
      const contactKey=[...currentContacts].join('|');
      if(trace.length<20&&((contactKey&&contactKey!==lastContacts)||strict!==wasStrict))trace.push({tick:i,after,offset:projection.offset,y:s.y-pit.height,speed:s.speed,vy:s.velocityY,up:s.upY,strict,contacts:[...currentContacts]});
      lastContacts=contactKey;wasStrict=strict;
      strictTicks=strict?strictTicks+1:0;bestStrictTicks=Math.max(bestStrictTicks,strictTicks);
      if(s.airborne)airborneTicks++;
      const corners=bodyCorners(model);
      for(let n=0;n<corners.length;n++){
        const a=signed(priorCorners[n]),b=signed(corners[n]);
        if(a<0&&b>=0){
          const crossing=priorCorners[n].clone().lerp(corners[n],-a/(b-a));
          const reference=queryRoadSurface(crossing.x,crossing.z).height+ROAD_SURFACE_OFFSET;
          minClearance=Math.min(minClearance,crossing.y-reference);
        }
      }
      priorCorners=corners;
      if(projection.distance>pit.distance-pit.length/2&&after<100){
        for(const corner of bodyCorners(model))maxOffset=Math.max(maxOffset,Math.abs(projectRoad(corner.x,corner.z,{edgeId:pit.edgeId,progress:pit.progress}).offset));
      }
      const safe=after>10&&s.grounded&&s.upY>.9&&bodyCorners(model).every(c=>Math.abs(projectRoad(c.x,c.z,{edgeId:pit.edgeId,progress:pit.progress}).offset)<14.9);
      stableTicks=safe?stableTicks+1:0;
      if(stableTicks>=30){landed=true;break;}
      if(s.y<queryRoadSurface(s.x,s.z).height-12||after>110)break;
    }
    return{bestStrictTicks,airborneTicks,landed,minClearance,furthest,maxOffset,minUp,contacts:[...contacts],trace,endState:{x:model.state.x,y:model.state.y,z:model.state.z,speed:model.state.speed}};
  }finally{model.dispose();physics.resetTime();}
}

test('all eleven cars genuinely fly and land upright in every biome at stock and maximum-upgrade speeds',async t=>{
  setup();metadata=await loadRoadPitVehicleMetadata();assert.equal(metadata.size,11);
  if(caseFilter){
    assert.equal(caseFilter.length,3,'ROAD_PIT_CASE is biome/vehicle/mode');
    assert.ok(caseFilter[0]==='*'||catalog.some(p=>p.type==='jump'&&p.biome===caseFilter[0]),'ROAD_PIT_CASE biome exists');
    assert.ok(caseFilter[1]==='*'||VEHICLE_CONFIG.some(v=>v.id===caseFilter[1]),'ROAD_PIT_CASE vehicle exists');
    assert.ok(caseFilter[2]==='*'||MODES.includes(caseFilter[2]),'ROAD_PIT_CASE mode exists');
  }
  for(const mode of MODES){
    if(caseFilter?.[2]&&caseFilter[2]!=='*'&&caseFilter[2]!==mode)continue;
    await t.test(mode,async t=>{
    const observed=[];
    for(const pit of catalog.filter(p=>p.type==='jump'&&(!caseFilter?.[0]||caseFilter[0]==='*'||p.biome===caseFilter[0])))await t.test(pit.biome,async t=>{
      for(const spec of VEHICLE_CONFIG){
        if(caseFilter?.[1]&&caseFilter[1]!=='*'&&spec.id!==caseFilter[1])continue;
        await t.test(spec.id,()=>{
        const r=driveJump(pit,spec,mode),label=`${pit.id}/${spec.id}/${mode} ${JSON.stringify(r)}`;
        observed.push(r);
        assert.ok(r.bestStrictTicks>=6,`${label}: six consecutive ticks without tire rays or chassis contact`);
        assert.ok(Number.isFinite(r.minClearance)&&r.minClearance>.015,`${label}: all lower chassis corners clear the far bank`);
        assert.ok(r.landed,`${label}: half a second grounded and upright before the hundred-metre runout ends`);
        assert.ok(r.maxOffset<14.9,`${label}: the whole chassis stays inside the road footprint through flight and landing`);
        });
      }
    });
    t.diagnostic(JSON.stringify({mode,cases:observed.length,minStrictTicks:Math.min(...observed.map(r=>r.bestStrictTicks)),
      minChassisClearance:Math.min(...observed.map(r=>r.minClearance)),maxRunout:Math.max(...observed.map(r=>r.furthest)),
      maxRoadOffset:Math.max(...observed.map(r=>r.maxOffset))}));
  });
  }
});

test('wide and long real stock cars bypass every ordinary pit on the remaining physical road',async t=>{
  if(caseFilter){t.skip('focused jump reproduction');return;}
  setup();metadata??=await loadRoadPitVehicleMetadata();
  for(const pit of catalog.filter(p=>p.type==='pit'))for(const id of ['citycourier','ashhauler']){
    const offset=-Math.sign(pit.offset)*6,spawn=point(pit,pit.edgeDistance-22,offset),spec=VEHICLE_CONFIG.find(v=>v.id===id);
    const model=createRapierDrivingModel({world:physics.world,x:spawn.x,z:spawn.z,heading:pit.heading,
      vehicleId:id,maxSpeed:spec.maxSpeed,getVehicleMetadata:()=>metadata.get(id),groundSurface:()=>surfaceForBiome(pit.biome,id)});
    const chassis=chassisFor(model);let passed=false;
    try{
      for(let i=0;i<90;i++)physics.step(DT,model);
      model.body.setLinvel({x:-Math.sin(pit.heading)*8,y:0,z:-Math.cos(pit.heading)*8},true);model.setInput({active:true});
      for(let i=0;i<600;i++){
        physics.step(DT,model);
        const s=model.state,p=projectRoad(s.x,s.z,{edgeId:pit.edgeId,progress:pit.progress}),contacts=new Set();
        touchingChassis(physics.world,chassis,contacts);
        assert.ok(![...contacts].some(name=>name.startsWith('Road pit walls')),`${pit.id}/${id}: bypass cannot strike a pit wall`);
        assert.ok(s.y>queryRoadSurface(s.x,s.z).height-1,`${pit.id}/${id}: bypass cannot drop into the trap`);
        assert.ok(bodyCorners(model).every(c=>Math.abs(projectRoad(c.x,c.z,{edgeId:pit.edgeId,progress:pit.progress}).offset)<14.9),`${pit.id}/${id}: the whole chassis fits on the remaining road`);
        if(p.distance>pit.distance+20){passed=s.upY>.9&&s.wheelContacts.every(c=>c.grounded);break;}
      }
      assert.ok(passed,`${pit.id}/${id}: bypass exits upright with all four tires supported`);
    }finally{model.dispose();physics.resetTime();}
  }
});

test('a sideways car missing the launch falls into a real deep trap without an invisible road support',async()=>{
  setup();metadata??=await loadRoadPitVehicleMetadata();
  const pit=catalog.find(p=>p.type==='jump'),p=point(pit,pit.edgeDistance),id='pickup';
  const model=createRapierDrivingModel({world:physics.world,x:p.x,z:p.z,y:pit.height+ROAD_SURFACE_OFFSET+.1,heading:p.heading+Math.PI/2,
    vehicleId:id,getVehicleMetadata:()=>metadata.get(id),groundSurface:()=>surfaceForBiome(pit.biome,id)});
  let fell=false;
  try{
    model.setInput({active:false});
    for(let i=0;i<360;i++){
      physics.step(DT,model);
      if(model.state.y<pit.height-12){fell=true;break;}
    }
    assert.ok(fell,`missed launch must pass the existing road-reference minus twelve-metre recovery threshold; y=${model.state.y}`);
  }finally{model.dispose();physics.resetTime();}
});
