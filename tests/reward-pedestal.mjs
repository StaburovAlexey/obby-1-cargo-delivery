#!/usr/bin/env node
// Real Three.js scene/rig and on-foot collision checks. No browser or sockets.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {BMW_VEHICLE,createBMWVehicleAdapter} from '../dist/bmw-vehicle.js';
import {createGarageScene,GARAGE_LAYOUT,REWARD_PEDESTAL,CHARACTER_STANDS,CLASSROOM_DESKS,CLASSROOM_ENTRIES,rewardDisplayPose} from '../dist/garage-scene.js';
import {createGameplay} from '../dist/gameplay.js';
import {fitTruckToGround,groundHeight} from '../dist/city-driving.js';
import {TRUCK_HALF_WIDTH,TRUCK_HALF_LENGTH} from '../dist/road-layout.js';

const near=(a,b,label='number',epsilon=1e-6)=>assert(Math.abs(a-b)<epsilon,`${label}: ${a} != ${b}`);
const garage=createGarageScene(THREE,{group:new THREE.Group()});
const reward=garage.vehicles.find(vehicle=>vehicle.id==='bmwreward');
const oldIds=['pickup','rover','van','citycourier','foresthauler','desertscout','snowgrip','snowrunner','lavacrawler','ashhauler'];
const oldBayIndices=[0,2,4,1,3,5,6,7,8,9];
const report={scope:'Renderer-free production scene, rig, real BMW GLB geometry and gameplay',rotationSamples:0,actualBMWRotationSamples:0,walkingSamples:0};
try{
  assert.equal(garage.vehicles.length,11);
  assert.equal(garage.group.userData.vehicleCount,11);
  assert.deepEqual(garage.vehicles.slice(0,10).map(vehicle=>vehicle.id),oldIds);
  assert.equal(GARAGE_LAYOUT.bays.length,10);
  assert.deepEqual(GARAGE_LAYOUT.bounds,{minX:-57,maxX:31,minZ:26,maxZ:90});
  assert.deepEqual(GARAGE_LAYOUT.spawn,{x:0,z:60});
  assert.deepEqual(GARAGE_LAYOUT.center,{x:-13,z:58});
  for(const [index,vehicle] of garage.vehicles.slice(0,10).entries()){
    const bayIndex=oldBayIndices[index];
    assert.deepEqual(vehicle.park,GARAGE_LAYOUT.bays[bayIndex]);
    near(vehicle.park.x,24);near(vehicle.park.z,30+bayIndex*4.8);near(vehicle.park.heading,Math.PI/2);
    near(vehicle.root.position.y,fitTruckToGround(THREE,vehicle.park.x,vehicle.park.z,vehicle.park.heading).position.y);
    assert.equal(vehicle.rewardDisplay,undefined);
    assert.equal(rewardDisplayPose(THREE,vehicle,8),null);
  }
  assert.equal(reward.parkingId,'reward-pedestal');
  assert.equal(reward.rewardDisplay,true);
  assert.equal(reward.park.column,11);
  assert.deepEqual(reward.approach,REWARD_PEDESTAL.approach);
  assert.equal(reward.approachRadius,.9);
  assert.deepEqual(reward.footprint,{halfWidth:TRUCK_HALF_WIDTH,halfLength:TRUCK_HALF_LENGTH});
  assert.deepEqual(reward.parkedFootprint,{halfWidth:4.9,halfLength:4.9});
  assert.equal(reward.rig.wheels.length,4);
  assert.equal(garage.pedestalSolids.length,1);
  assert.equal(garage.classroomSolids.length,40);
  assert.deepEqual(garage.walkingSolids,[...garage.classroomSolids,...garage.pedestalSolids]);
  assert.equal(garage.rewardMarker.userData.vehicleId,'bmwreward');
  assert.equal(garage.rewardMarker.userData.nonBlocking,true);

  const solid=garage.pedestalSolids[0];
  assert(solid.minX>GARAGE_LAYOUT.minX&&solid.maxX<GARAGE_LAYOUT.maxX);
  assert(solid.minZ>GARAGE_LAYOUT.frontZ&&solid.maxZ<GARAGE_LAYOUT.rearZ);
  assert(solid.minZ>GARAGE_LAYOUT.bays.at(-1).z+GARAGE_LAYOUT.bays.at(-1).halfLength+.5);
  for(const stand of CHARACTER_STANDS)assert(stand.x+1.5<solid.minX);
  for(const desk of CLASSROOM_DESKS)assert(desk.bounds.maxX+20<solid.minX);
  const pedestalMesh=garage.hangar.getObjectByName('BMW reward display pedestal');
  const pedestalBox=new THREE.Box3().setFromObject(pedestalMesh);
  near(pedestalBox.min.y,groundHeight(24,81));near(pedestalBox.max.y,reward.pedestal.topY);
  near(pedestalBox.min.x,solid.minX,'pedestal min x');near(pedestalBox.max.x,solid.maxX,'pedestal max x');

  // BMW import contract supplied by the visual adapter: 8m long, 3.381m wide.
  // Every corner is tested at a full turn with the local forward display pitch.
  reward.visual={metadata:{bounds:{min:[-3.381/2,.05,-4],max:[3.381/2,2.6,4]}}};
  for(let step=0;step<=180;step++){
    const pose=rewardDisplayPose(THREE,reward,step*Math.PI*2/(180*REWARD_PEDESTAL.rotationSpeed));
    const front=new THREE.Vector3(0,0,-1).applyQuaternion(pose.quaternion);
    assert(front.y<-.08&&front.y>-.1,'nose-down pitch stays local while yaw turns');
    for(const x of reward.visual.metadata.bounds.min.slice(0,1).concat(reward.visual.metadata.bounds.max.slice(0,1)))
      for(const y of [.05,2.6])for(const z of [-4,4]){
        const point=new THREE.Vector3(x,y,z).applyQuaternion(pose.quaternion).add(pose.position);
        assert(point.y>reward.pedestal.topY,'pitched imported body stays above pedestal');
        assert(Math.hypot(point.x-reward.park.x,point.z-reward.park.z)<reward.pedestal.radius,'full turn fits pedestal radius');
        assert(point.x>GARAGE_LAYOUT.minX&&point.x<GARAGE_LAYOUT.maxX&&point.z>GARAGE_LAYOUT.frontZ&&point.z<GARAGE_LAYOUT.rearZ,'all orientations fit walls');
      }
    reward.rig.update(pose);report.rotationSamples++;
  }
  const start=rewardDisplayPose(THREE,reward,0),later=rewardDisplayPose(THREE,reward,1);
  near(start.quaternion.angleTo(later.quaternion),.14,'slow rotation rate');
  assert.deepEqual(rewardDisplayPose(THREE,reward,NaN).position.toArray(),start.position.toArray());
  assert.deepEqual(rewardDisplayPose(THREE,reward,NaN).quaternion.toArray(),start.quaternion.toArray());
  // A taller/longer alternate visual needs extra lift rather than clipping.
  reward.visual.metadata.bounds={min:[-1.7,0,-8],max:[1.7,3,8]};
  const adaptive=rewardDisplayPose(THREE,reward,0);
  assert(adaptive.position.y>start.position.y+.2);
  const lowCorner=new THREE.Vector3(0,0,-8).applyQuaternion(adaptive.quaternion).add(adaptive.position);
  near(lowCorner.y,reward.pedestal.topY+.05,'dynamic pitch clearance');
  delete reward.visual;
  const bytes=fs.readFileSync(new URL(BMW_VEHICLE.url));
  const parsed=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const adapter=createBMWVehicleAdapter(THREE,'bmwreward',parsed);
  reward.visual=adapter;reward.root.add(adapter.group);
  try{
    let minimumTopGap=Infinity,maximumRadius=0;
    const vertex=new THREE.Vector3();
    for(let step=0;step<=72;step++){
      const pose=rewardDisplayPose(THREE,reward,step*Math.PI*2/(72*REWARD_PEDESTAL.rotationSpeed));
      reward.rig.update(pose);adapter.update(pose);reward.root.updateWorldMatrix(true,true);
      adapter.group.traverse(mesh=>{
        if(!mesh.isMesh)return;
        const positions=mesh.geometry.attributes.position;
        for(let i=0;i<positions.count;i++){
          vertex.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
          const gap=vertex.y-reward.pedestal.topY,radius=Math.hypot(vertex.x-reward.park.x,vertex.z-reward.park.z);
          minimumTopGap=Math.min(minimumTopGap,gap);maximumRadius=Math.max(maximumRadius,radius);
          assert(gap>0,'actual tilted BMW vertex remains above platform');
          assert(radius<REWARD_PEDESTAL.radius,'actual rotating BMW fits platform footprint');
          assert(vertex.x>GARAGE_LAYOUT.minX&&vertex.x<GARAGE_LAYOUT.maxX&&vertex.z>GARAGE_LAYOUT.frontZ&&vertex.z<GARAGE_LAYOUT.rearZ,'actual rotating BMW clears hangar walls');
          assert(vertex.z>GARAGE_LAYOUT.bays.at(-1).z+2.25,'actual rotating BMW clears final original car');
        }
      });
      report.actualBMWRotationSamples++;
    }
    report.actualBMWDimensions=adapter.metadata.dimensions;
    report.actualBMWMinimumTopGap=minimumTopGap;
    report.actualBMWMaximumRadius=maximumRadius;
  }finally{adapter.dispose();delete reward.visual;}
  const road=fitTruckToGround(THREE,0,6,0);
  reward.rig.update(road);
  near(reward.root.position.y,road.position.y,'road root has no pedestal lift');
  near(new THREE.Vector3(0,0,-1).applyQuaternion(reward.root.quaternion).y,0,'road root has no display pitch');
  reward.rig.update(rewardDisplayPose(THREE,reward,0));

  // Reserve the current imported footprints to test actual occupied aisles,
  // including the largest skin's airborne collision envelope.
  for(const vehicle of garage.vehicles.slice(0,10)){
    vehicle.parkedFootprint={halfWidth:2.25,halfLength:4.32};
    vehicle.approach={x:vehicle.park.x-6.55,z:vehicle.park.z};vehicle.approachRadius=.9;
  }
  const route=(game,a,b)=>{
    const steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.1);
    for(let i=0;i<=steps;i++){
      const t=i/Math.max(1,steps),x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
      assert(game.canWalk(x,z),`${game.state.characterId}/${game.state.jump.airborne}: blocked at ${x},${z}`);report.walkingSamples++;
    }
  };
  for(const characterId of ['bacon','jandel'])for(const airborne of [false,true]){
    const game=createGameplay({vehicles:garage.vehicles,stands:garage.stands,desks:garage.desks,solids:garage.walkingSolids,characterId});
    game.state.jump.airborne=airborne;
    for(const vehicle of garage.vehicles){
      route(game,GARAGE_LAYOUT.spawn,{x:0,z:vehicle.approach.z});
      route(game,{x:0,z:vehicle.approach.z},vehicle.approach);
    }
    for(const stand of CHARACTER_STANDS){
      route(game,{x:0,z:79},{x:stand.trigger.x,z:79});
      route(game,{x:stand.trigger.x,z:79},{x:stand.trigger.x,z:airborne?81.9:82});
      route(game,{x:stand.trigger.x-2,z:airborne?81.9:82},{x:stand.trigger.x+2,z:airborne?81.9:82});
    }
    for(const entry of CLASSROOM_ENTRIES){route(game,GARAGE_LAYOUT.spawn,{x:0,z:70});route(game,{x:0,z:70},{x:entry.x,z:70});route(game,{x:entry.x,z:70},entry);}
    assert(!game.canWalk(reward.park.x,reward.park.z),'pedestal center is never walkable');
    reward.position={x:0,z:6,heading:0};
    assert(!game.canWalk(reward.park.x,reward.park.z),'pedestal stays solid while car is driving');
    assert(game.canWalk(reward.approach.x,reward.approach.z),'approach remains outside platform');
    delete reward.position;
  }

  const resources={geometry:new Set(),material:new Set(),batch:new Set()};
  garage.group.traverse(node=>{
    if(node.geometry)resources.geometry.add(node.geometry);
    if(node.material)resources.material.add(node.material);
    if(node.isInstancedMesh)resources.batch.add(node);
  });
  const disposed={geometry:0,material:0,batch:0};
  for(const [kind,entries] of Object.entries(resources))for(const resource of entries)resource.addEventListener('dispose',()=>disposed[kind]++);
  garage.dispose();garage.dispose();
  for(const kind of Object.keys(resources))assert.equal(disposed[kind],resources[kind].size,`${kind} disposed exactly once`);
  console.log(JSON.stringify({passed:true,...report},null,2));
}finally{garage.dispose();}
