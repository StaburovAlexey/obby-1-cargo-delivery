#!/usr/bin/env node
/** Actual packaged GLB bounds and production collision/sweep code, offline.
 * No browser, socket, rendered-visibility, GPU or handling-feel claim. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {COSMO_VEHICLES,loadCosmoVehicle,clearCosmoVehicleCache} from '../dist/cosmo-vehicles.js';
import {overlapsTruck,getTruckContact,canPlaceTruck} from '../dist/city-driving.js';
import {truckFootprint,truckInRoad,corridorContact,pointOnEdge,NETWORK_EDGES,TRUCK_HALF_WIDTH,TRUCK_HALF_LENGTH,ROAD_MARGIN} from '../dist/route-network.js';
import {createRoadHazards,roadHazardContact,ROAD_HAZARD_RULES} from '../dist/road-hazards.js';
import {parkedVehicleContact,GAMEPLAY} from '../dist/gameplay.js';
import {createDrivingModel,moveWithContacts,VEHICLE_DYNAMICS} from '../dist/driving-model.js';

const original={fetch:globalThis.fetch,self:globalThis.self,createImageBitmap:globalThis.createImageBitmap};
globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>{const png=Buffer.from(await blob.arrayBuffer());return {width:png.readUInt32BE(16),height:png.readUInt32BE(20),close(){}};};
globalThis.fetch=async request=>{
  const url=typeof request==='string'?request:request.url;
  if(url.startsWith('blob:'))return original.fetch(request);
  assert(url.startsWith('file:'),`Unexpected nonlocal request: ${url}`);
  return new Response(fs.readFileSync(new URL(url)),{status:200});
};
const near=(a,b,label='',epsilon=2e-7)=>assert(Math.abs(a-b)<=epsilon,`${label}: ${a} != ${b}`);
const adapters=[],cars=[];
const report={scope:'Offline actual GLBs, OBB/SAT, runtime moving poses and existing production sweeps',cars:[],faceChecks:0,yawChecks:0,roadChecks:0,sweeps:0,moverChecks:0,minimumPassage:Infinity};
// Independent rectangle vertices and edge-normal SAT, with no shared collision helpers.
function polygon(x,z,h,hw,hl){
  const c=Math.cos(h),s=Math.sin(h);
  return [[-hw,-hl],[hw,-hl],[hw,hl],[-hw,hl]].map(([u,v])=>[x+c*u+s*v,z-s*u+c*v]);
}
function intersects(a,b,padding=0){
  for(const points of [a,b])for(let i=0;i<2;i++){
    const p=points[i],q=points[i+1],axis=[p[1]-q[1],q[0]-p[0]];
    const A=a.map(v=>v[0]*axis[0]+v[1]*axis[1]),B=b.map(v=>v[0]*axis[0]+v[1]*axis[1]);
    const margin=padding*Math.hypot(...axis);
    if(Math.max(...A)+margin<=Math.min(...B)||Math.max(...B)+margin<=Math.min(...A))return false;
  }
  return true;
}
function correctedClear(hit,query,x,z,label){
  assert(hit&&hit.depth>0,`${label}: contact missing`);
  near(Math.hypot(hit.normalX,hit.normalZ),1,`${label}: unit normal`);
  assert(!query(x+hit.normalX*(hit.depth+1e-5),z+hit.normalZ*(hit.depth+1e-5)),`${label}: separating translation failed`);
}
try{
  for(const spec of COSMO_VEHICLES){
    const adapter=await loadCosmoVehicle(THREE,spec.id);adapters.push(adapter);
    adapter.group.updateWorldMatrix(true,true);
    const bounds=new THREE.Box3().setFromObject(adapter.group,true),size=bounds.getSize(new THREE.Vector3());
    const footprint={halfWidth:size.x/2,halfLength:size.z/2};
    near(bounds.getCenter(new THREE.Vector3()).x,0,spec.id+' centered X');near(bounds.getCenter(new THREE.Vector3()).z,0,spec.id+' centered Z');
    near(size.x,adapter.metadata.bounds.max[0]-adapter.metadata.bounds.min[0],spec.id+' bounds X');
    near(size.z,adapter.metadata.bounds.max[2]-adapter.metadata.bounds.min[2],spec.id+' bounds Z');
    assert(size.x<=4.65001&&size.z<=8.64001);near(size.z,8.64,spec.id+' enlarged length');
    cars.push({id:spec.id,...footprint});report.cars.push({id:spec.id,width:size.x,length:size.z});
    const {x,z,heading}=GAMEPLAY.roadSpawn;
    assert.equal(getTruckContact(x,z,heading,[],undefined,footprint),undefined,spec.id+' clear road spawn');
    assert(canPlaceTruck(x,z,heading,[],footprint));
    assert.equal(createRoadHazards(42).contact(x,z,heading,footprint),undefined,spec.id+' spawn clear of hazards');

    for(const h of [0,.37,Math.PI/2,Math.PI,Math.PI+.37]){
      const c=Math.cos(h),s=Math.sin(h),actual=truckFootprint(x,z,h,footprint),expected=polygon(x,z,h,footprint.halfWidth,footprint.halfLength);
      actual.forEach((point,i)=>{near(point.x,expected[i][0]);near(point.z,expected[i][1]);});
      for(const [nx,nz,reach] of [[c,-s,footprint.halfWidth],[-c,s,footprint.halfWidth],[s,c,footprint.halfLength],[-s,-c,footprint.halfLength]]){
        for(const gap of [-.02,.02]){
          const obstacleReach=.07*(Math.abs(nx)+Math.abs(nz));
          const ox=x+nx*(reach+obstacleReach+gap),oz=z+nz*(reach+obstacleReach+gap);
          const obstacle={name:'thin face probe',minX:ox-.04,maxX:ox+.04,minZ:oz-.04,maxZ:oz+.04};
          const query=(px,pz)=>getTruckContact(px,pz,h,[obstacle],undefined,footprint);
          assert.equal(overlapsTruck(x,z,h,obstacle,.03,footprint),gap<0,`${spec.id} static face h=${h} gap=${gap}`);
          assert.equal(!!query(x,z),gap<0,`${spec.id} static contact face`);
          if(gap<0)correctedClear(query(x,z),query,x,z,spec.id+' static');
          const hazard={id:'face-probe',x:x+nx*(reach+.08+gap),z:z+nz*(reach+.08+gap),heading:h,width:.16,length:.16};
          const hazardQuery=(px,pz)=>roadHazardContact(hazard,px,pz,h,0,footprint);
          assert.equal(!!hazardQuery(x,z),gap<0,spec.id+' hazard face');
          if(gap<0)correctedClear(hazardQuery(x,z),hazardQuery,x,z,spec.id+' hazard');
          const passive={id:'passive',park:{x:x+nx*(reach+reach+.05+gap),z:z+nz*(reach+reach+.05+gap),heading:h},parkedFootprint:footprint};
          const parkedQuery=(px,pz)=>parkedVehicleContact(px,pz,h,[passive],spec.id,footprint);
          assert.equal(!!parkedQuery(x,z),gap<0,spec.id+' parked face');
          if(gap<0)correctedClear(parkedQuery(x,z),parkedQuery,x,z,spec.id+' parked');
          assert.equal(parkedVehicleContact(x,z,h,[passive],passive.id,footprint),undefined,'Selected car excluded');
          report.faceChecks+=3;
        }
      }
      // Arbitrary yaw and offsets are checked against independent SAT polygons.
      for(const oh of [-1.17,.42,2.13])for(const dx of [-5,-2.1,0,2.1,5])for(const dz of [-7,-3.8,0,3.8,7]){
        const hazard={id:'yaw-probe',x:x+dx,z:z+dz,heading:oh,width:2.2,length:3.7};
        const expected=intersects(polygon(x,z,h,footprint.halfWidth,footprint.halfLength),polygon(hazard.x,hazard.z,oh,1.1,1.85));
        const hit=roadHazardContact(hazard,x,z,h,0,footprint);
        assert.equal(!!hit,expected,`${spec.id} yaw SAT h=${h}, obstacle=${oh}, offset=${dx},${dz}`);
        if(hit)correctedClear(hit,(px,pz)=>roadHazardContact(hazard,px,pz,h,0,footprint),x,z,spec.id+' yaw');
        const parked={id:'other-car',park:{x:hazard.x,z:hazard.z,heading:oh},parkedFootprint:cars[0]};
        const parkedExpected=intersects(polygon(x,z,h,footprint.halfWidth,footprint.halfLength),polygon(hazard.x,hazard.z,oh,cars[0].halfWidth,cars[0].halfLength),.05);
        const parkedHit=parkedVehicleContact(x,z,h,[parked],spec.id,footprint);
        assert.equal(!!parkedHit,parkedExpected,`${spec.id} parked yaw SAT`);
        if(parkedHit)correctedClear(parkedHit,(px,pz)=>parkedVehicleContact(px,pz,h,[parked],spec.id,footprint),x,z,spec.id+' parked yaw');
        const obstacle={name:'axis-aligned yaw probe',minX:hazard.x-1.1,maxX:hazard.x+1.1,minZ:hazard.z-1.85,maxZ:hazard.z+1.85};
        const staticExpected=intersects(polygon(x,z,h,footprint.halfWidth,footprint.halfLength),polygon(hazard.x,hazard.z,0,1.13,1.88));
        assert.equal(overlapsTruck(x,z,h,obstacle,.03,footprint),staticExpected,`${spec.id} static yaw SAT`);
        assert.equal(!!getTruckContact(x,z,h,[obstacle],undefined,footprint),staticExpected,`${spec.id} static contact yaw SAT`);
        report.yawChecks+=3;
      }
    }
    // Wide-road containment uses each actual body, including yaw/front/rear reach.
    for(const h of [0,.37,Math.PI/2,Math.PI])for(const side of [-1,1])for(const gap of [-.02,.02]){
      const reach=Math.abs(Math.cos(h))*footprint.halfWidth+Math.abs(Math.sin(h))*footprint.halfLength;
      const px=side*(15-reach-ROAD_MARGIN+gap),hit=corridorContact(px,6,h,undefined,footprint);
      assert.equal(!!hit,gap>0,`${spec.id} road boundary h=${h}, gap=${gap}`);
      assert.equal(truckInRoad(px,6,h,undefined,footprint),gap<0);
      if(hit)correctedClear(hit,(xx,zz)=>corridorContact(xx,zz,h,undefined,footprint),px,6,spec.id+' road');
      report.roadChecks++;
    }
    for(const edge of NETWORK_EDGES)for(let distance=10;distance<edge.length-10;distance+=53){
      const p=pointOnEdge(edge.id,distance);
      for(const yaw of [0,Math.PI,.25])assert(truckInRoad(p.x,p.z,p.heading+yaw,p,footprint),`${spec.id}/${edge.id}/${distance} center fits 30 m road`);
      report.roadChecks+=3;
    }
    // Existing production fixed-step solver: thin walls, front/rear, side and yaw.
    for(const h of [0,.62,Math.PI/2,Math.PI])for(const angularVelocity of [-3,0,3]){
      const reach=Math.abs(Math.cos(h))*footprint.halfLength+Math.abs(Math.sin(h))*footprint.halfWidth;
      const wall={name:'thin sweep wall',minX:-14,maxX:14,minZ:-.005,maxZ:.005};
      const contact=(px,pz,heading)=>getTruckContact(px,pz,heading,[wall],undefined,footprint);
      const model=createDrivingModel({x:0,z:reach+.25,heading:h,contact});
      Object.assign(model.state,{velocityZ:-40,angularVelocity});model.step(.1);
      assert(model.state.z>0,`${spec.id} tunneled through wall`);
      assert(!overlapsTruck(model.state.x,model.state.z,model.state.heading,wall,.03,footprint),`${spec.id} sweep ended inside wall`);
      assert(model.state.blocked,`${spec.id} sweep never hit wall`);report.sweeps++;
    }
    for(const direction of [1,-1]){
      const wall={name:'long travel wall',minX:-14,maxX:14,minZ:-.005,maxZ:.005};
      const position={x:0,z:6},rotation={y:direction===1?0:Math.PI};
      moveWithContacts(position,rotation,direction*200,0,Math.hypot(footprint.halfWidth,footprint.halfLength),()=>getTruckContact(position.x,position.z,rotation.y,[wall],undefined,footprint));
      assert(position.z>=footprint.halfLength+.035,'Long forward/reverse sweep cannot tunnel');report.sweeps++;
    }
  }
  // Legacy/procedural callers retain every existing default envelope.
  const legacy={halfWidth:1.55,halfLength:2.88},routeDefault={halfWidth:TRUCK_HALF_WIDTH,halfLength:TRUCK_HALF_LENGTH};
  for(const h of [0,.4,Math.PI/2]){
    assert.deepEqual(truckFootprint(0,6,h),truckFootprint(0,6,h,routeDefault));
    assert.deepEqual(corridorContact(13,6,h),corridorContact(13,6,h,undefined,routeDefault));
    const hazard={id:'default',x:1,z:3,heading:.3,width:1,length:2};
    assert.deepEqual(roadHazardContact(hazard,0,6,h),roadHazardContact(hazard,0,6,h,0,legacy));
    const obstacle={name:'default',minX:1,maxX:2,minZ:3,maxZ:5};
    assert.equal(overlapsTruck(0,6,h,obstacle),overlapsTruck(0,6,h,obstacle,.03,legacy));
    assert.deepEqual(getTruckContact(0,6,h,[obstacle]),getTruckContact(0,6,h,[obstacle],undefined,legacy));
    const parked={id:'legacy',park:{x:1,z:3,heading:.3}};
    assert.deepEqual(parkedVehicleContact(0,6,h,[parked],'active'),parkedVehicleContact(0,6,h,[parked],'active',routeDefault));
  }
  const system=createRoadHazards(42),descriptors=JSON.stringify(system.hazards),identities=[...system.poses];
  assert.equal(system.hazards.length,30);assert.equal(system.movers.length,20);assert.equal(ROAD_HAZARD_RULES.moverTravelSeconds,8);
  for(let frame=0;frame<=188;frame++){
    if(frame)system.update(.1,{x:0,z:6,heading:0},true);
    if(frame%10!==0&&frame!==188)continue;
    for(const h of system.movers){
      const p=pointOnEdge(h.edgeId,h.edgeDistance),side=h.offset<=0?1:-1;
      near(h.x,p.x+p.right.x*h.offset,h.id+' live X');near(h.z,p.z+p.right.z*h.offset,h.id+' live Z');
      const passage=15-h.width/2+Math.abs(h.offset);report.minimumPassage=Math.min(report.minimumPassage,passage);
      for(const footprint of cars){
        assert(passage>footprint.halfWidth*2+1,`${footprint.id}: no usable moving-hazard passage`);
        assert(system.contact(h.x,h.z,h.heading,footprint),h.id+' current pose must collide');
        const probe=(h.width/2+footprint.halfWidth-.02),x=h.x+Math.cos(h.heading)*probe,z=h.z-Math.sin(h.heading)*probe;
        assert(system.contact(x,z,h.heading,footprint),h.id+' larger body edge must collide at live pose');
        const bypass={x:p.x+p.right.x*10.4*side,z:p.z+p.right.z*10.4*side};
        assert(!system.contact(bypass.x,bypass.z,p.heading,footprint),`${footprint.id}/${h.id}: clear bypass`);
        assert(truckInRoad(bypass.x,bypass.z,p.heading,p,footprint),`${footprint.id}/${h.id}: bypass stays on road`);
        report.moverChecks++;
      }
    }
  }
  assert.equal(JSON.stringify(system.hazards),descriptors,'Static descriptors/density/motion unchanged');
  identities.forEach((pose,i)=>assert.equal(system.poses[i],pose,'Moving hazard pool identities retained'));
  // Collider resizing never retunes chassis forces, wheelbase, sweep settings or mass.
  assert.equal(VEHICLE_DYNAMICS.mass,1600);assert.equal(VEHICLE_DYNAMICS.yawInertia,5300);
  assert.equal(VEHICLE_DYNAMICS.halfWidth,1.55);assert.equal(VEHICLE_DYNAMICS.halfLength,2.88);
  assert.equal(VEHICLE_DYNAMICS.maxSweepDistance,.12);assert.equal(VEHICLE_DYNAMICS.fixedStep,1/120);
  console.log(JSON.stringify({passed:true,...report},null,2));
}finally{adapters.forEach(adapter=>adapter.dispose());clearCosmoVehicleCache();Object.assign(globalThis,original);}
