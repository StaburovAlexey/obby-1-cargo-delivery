#!/usr/bin/env node
// Independent real-Three camera, garage-boundary, fleet-contact and locked-vehicle QA.
// Renderer/DOM are stubbed. This does not claim browser or WebGL visual QA.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import { createAppDom } from './fixtures/app-dom.mjs';
import { loadBacon } from '../dist/character.js';
import { groundHeight } from '../dist/city-driving.js';
import { garageRoadContact, parkedVehicleContact, walkPointAllowed, isInGarage, GAMEPLAY } from '../dist/gameplay.js';
import { corridorContact, truckFootprint, truckInRoad, TRUCK_HALF_WIDTH, TRUCK_HALF_LENGTH } from '../dist/road-layout.js';
import { GARAGE_LAYOUT } from '../dist/garage-scene.js';
import { FOLLOW_CAMERA, computeFollowOffset } from '../dist/follow-camera.js';

let passed=0,failed=0,poses=0,vertices=0,roadFrames=0,boundaryFrames=0,obbCases=0,exitCases=0;
const baconEnvelope={halfWidth:0,halfLength:0,radius:0};
const fleetEnvelope=new Map();
const check=(name,run)=>{try{run();passed++;console.log(`PASS ${name}`);}catch(error){failed++;console.error(`FAIL ${name}: ${error.stack}`);}};
const oldSelf=globalThis.self,oldBitmap=globalThis.createImageBitmap;
globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>{const png=Buffer.from(await blob.arrayBuffer());return {width:png.readUInt32BE(16),height:png.readUInt32BE(20),close(){}};};
const bytes=fs.readFileSync(new URL('../dist/assets/bacon.glb',import.meta.url));
let bacon;
try{bacon=await loadBacon(THREE,{data:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});}
finally{if(oldSelf===undefined)delete globalThis.self;else globalThis.self=oldSelf;if(oldBitmap===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=oldBitmap;}

function worldVertices(root){
  root.updateWorldMatrix(true,true);const result=[],matrix=new THREE.Matrix4(),combined=new THREE.Matrix4(),v=new THREE.Vector3();
  root.traverse(mesh=>{if(!mesh.isMesh)return;const attr=mesh.geometry.attributes.position;
    if(mesh.isInstancedMesh){for(let instance=0;instance<mesh.count;instance++){mesh.getMatrixAt(instance,matrix);combined.multiplyMatrices(mesh.matrixWorld,matrix);for(let i=0;i<attr.count;i++)result.push(v.fromBufferAttribute(attr,i).applyMatrix4(combined).clone());}}
    else{for(let i=0;i<attr.count;i++){mesh.getVertexPosition(i,v);result.push(v.applyMatrix4(mesh.matrixWorld).clone());}}
  });return result;
}
// Measure the shipped skin once, across actual idle/locomotion transitions.
bacon.group.position.set(0,0,0);
for(const speed of [0,4.5,7,0])for(let frame=0;frame<120;frame++){
  bacon.update(1/60,speed,0);
  for(const p of worldVertices(bacon.group)){baconEnvelope.halfWidth=Math.max(baconEnvelope.halfWidth,Math.abs(p.x));baconEnvelope.halfLength=Math.max(baconEnvelope.halfLength,Math.abs(p.z));baconEnvelope.radius=Math.max(baconEnvelope.radius,Math.hypot(p.x,p.z));}
}
function frameVisible(camera,points,label){
  camera.updateMatrixWorld(true);let maxX=0,maxY=0;
  for(const point of points){const p=point.clone().project(camera);vertices++;assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.z>-1&&p.z<1,`${label}: invalid projection ${p.toArray()}`);maxX=Math.max(maxX,Math.abs(p.x));maxY=Math.max(maxY,Math.abs(p.y));}
  assert.ok(maxX<.985&&maxY<.985,`${label}: cropped mesh max NDC ${maxX.toFixed(4)}, ${maxY.toFixed(4)}`);
}
function shellHits(debug,target){
  debug.scene.updateMatrixWorld(true);const delta=target.clone().sub(debug.camera.position),ray=new THREE.Raycaster(debug.camera.position,delta.clone().normalize(),.01,delta.length()-.01);
  const shell=debug.garage.hangar.children[0];const hits=ray.intersectObject(shell).filter(hit=>/wall|roof|frame|lintel/.test(shell.userData.partNames[hit.instanceId]||''));
  return hits;
}
function fixedOrbit(debug,anchor,scale,label){
  const expected=computeFollowOffset(debug.cameraState.state,new THREE.Vector3()).multiplyScalar(scale);
  const actual=debug.camera.position.clone().sub(anchor);
  assert.ok(actual.distanceTo(expected)<1e-8,`${label}: orbit changed by environment geometry`);
  assert.ok(Math.abs(actual.length()-FOLLOW_CAMERA[debug.cameraState.state.mode].radius*scale)<1e-8,`${label}: follow radius changed`);
  debug.camera.updateMatrixWorld(true);
  const center=anchor.clone().project(debug.camera);
  assert.ok(Math.abs(center.x)<1e-8&&Math.abs(center.y)<1e-8&&center.z>-1&&center.z<1,`${label}: orbit anchor not centred`);
}
function select(debug,id){debug.returnToGarage();debug.gameplay.state.cooldown=0;assert.equal(debug.enterVehicle(id),true);}
function place(debug,pose){Object.assign(debug.model.state,pose,{speed:0,frontWheelAngle:0,bodyPitch:0,bodyRoll:0,bodyBob:0});debug.applyTruckPose();debug.followTruck(1,true);poses++;}
function footprintClear(debug,label){
  const s=debug.model.state,points=truckFootprint(s.x,s.z,s.heading);
  assert.ok(truckInRoad(s.x,s.z,s.heading),`${label}: conservative footprint leaves the finite road`);
  assert.ok(points.every(p=>-p.y<23.0001),`${label}: rear road end opened toward the detached hangar`);
  assert.ok(!parkedVehicleContact(s.x,s.z,s.heading,debug.garage.vehicles,debug.gameplay.state.selectedId),`${label}: parked vehicle penetration`);
}
function actualBodyClear(debug,label){
  debug.applyTruckPose();const points=worldVertices(debug.rig.root);
  assert.ok(points.every(p=>p.z<23.0001),`${label}: rendered body leaves the rear road end`);
  assert.ok(!isInGarage(debug.model.state.x,debug.model.state.z),`${label}: driving entered the hangar`);
}
function onFootClear(debug,label){
  const p=debug.gameplay.state.player;assert.ok(walkPointAllowed(p.x,p.z),`${label}: outside walking surface`);
  for(const car of debug.garage.vehicles){const q=car.position,c=Math.cos(q.heading),s=Math.sin(q.heading),dx=p.x-q.x,dz=p.z-q.z;
    const extent=fleetEnvelope.get(car.id),localX=dx*c-dz*s,localZ=-dx*s-dz*c;
    const distance=Math.hypot(Math.max(0,Math.abs(localX)-extent.halfWidth),Math.max(0,Math.abs(localZ)-extent.halfLength));
    assert.ok(distance>baconEnvelope.radius,`${label}: measured Bacon capsule intersects actual ${car.id} body bounds; clearance ${distance}`);
  }
}

function characterPose(debug,pose,snap=true){
  Object.assign(debug.gameplay.state.player,pose);
  debug.followCharacter(snap?1:1/60,snap);
  bacon.group.position.set(pose.x,groundHeight(pose.x,pose.z),pose.z);
  bacon.resetMotion?.(pose.heading||0); bacon.update(0,0,pose.heading||0);
  poses++;
}
function eyeOutsideHangar(debug){
  const p=debug.camera.position;
  return p.x<GARAGE_LAYOUT.minX||p.x>GARAGE_LAYOUT.maxX||p.z<GARAGE_LAYOUT.frontZ||p.z>GARAGE_LAYOUT.rearZ||p.y>GARAGE_LAYOUT.roofHeight;
}
for(const viewport of [{width:390,height:844,name:'portrait'},{width:1440,height:900,name:'landscape'}]){
  const app=createAppDom({...viewport,startDriving:false}),d=app.debug;
  try{
    const walkScale=viewport.width/viewport.height<.8?1.12:1,carScale=viewport.width/viewport.height<.8?1.2:1;
    check(`${viewport.name}: actual skinned Bacon spawn is framed at the fixed starting orbit`,()=>{
      characterPose(d,d.gameplay.state.player);
      frameVisible(d.camera,worldVertices(bacon.group),'Bacon spawn');
      const p=d.gameplay.state.player;
      fixedOrbit(d,new THREE.Vector3(p.x,groundHeight(p.x,p.z)+1.6,p.z),walkScale,'Bacon spawn');
      assert.ok(Math.abs(d.camera.position.y-groundHeight(p.x,p.z)-(1.6+5.6*walkScale))<1e-8);
    });
    check(`${viewport.name}: walking near walls keeps the fixed orbit and deliberately permits wall crossings`,()=>{
      let outside=0,occluded=0;
      for(const x of [GARAGE_LAYOUT.minX+1.65,0,GARAGE_LAYOUT.maxX-1.65])for(const z of [GARAGE_LAYOUT.frontZ+1.65,GARAGE_LAYOUT.spawn.z,GARAGE_LAYOUT.rearZ-1.65])for(const heading of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
        const p={x,z,heading}; assert.ok(walkPointAllowed(x,z));
        characterPose(d,p);
        const anchor=new THREE.Vector3(x,groundHeight(x,z)+1.6,z);
        fixedOrbit(d,anchor,walkScale,`walk ${x},${z}`);
        frameVisible(d.camera,worldVertices(bacon.group),`walk ${x},${z},${heading}`);
        if(eyeOutsideHangar(d))outside++;
        if(shellHits(d,anchor).length)occluded++;
      }
      assert.ok(outside>0,'Camera was incorrectly clamped inside the hangar');
      assert.ok(occluded>0,'Expected wall-crossing poses must not be corrected by occlusion protection');
    });
    check(`${viewport.name}: selecting every car teleports and frames it on the road immediately`,()=>{
      for(const car of d.garage.vehicles){
        select(d,car.id);
        assert.equal(d.model.state.x,GAMEPLAY.roadSpawn.x);assert.equal(d.model.state.z,GAMEPLAY.roadSpawn.z);
        assert.ok(!isInGarage(d.model.state.x,d.model.state.z));
        frameVisible(d.camera,worldVertices(d.rig.root),`${car.id} launch`);
        fixedOrbit(d,d.rig.root.position.clone().add(new THREE.Vector3(0,1.7,0)),carScale,`${car.id} launch`);
        assert.ok(d.camera.position.z<GARAGE_LAYOUT.frontZ,'Camera retained the previous indoor position');
      }
    });
    check(`${viewport.name}: road camera stays close and frames all car silhouettes at eight headings`,()=>{
      for(const id of ['pickup','rover','van']){select(d,id);for(const z of [6,-50])for(let i=0;i<8;i++){
        const pose={x:0,z,heading:i*Math.PI/4};place(d,pose);
        assert.ok(!corridorContact(pose.x,pose.z,pose.heading),'Road test pose must be valid');
        frameVisible(d.camera,worldVertices(d.rig.root),`${id} road ${z} angle${i}`);
        fixedOrbit(d,d.rig.root.position.clone().add(new THREE.Vector3(0,1.7,0)),carScale,`${id} road`);
        assert.ok(d.camera.position.distanceTo(d.rig.root.position)<21,'Close camera regressed to distant view');
      }}
    });
    check(`${viewport.name}: repeated road returns reset the orbit, and walking interpolation has no wall correction`,()=>{
      for(const id of ['pickup','rover','van']){
        select(d,id);place(d,{x:0,z:-50,heading:0});d.returnToGarage();
        characterPose(d,d.gameplay.state.player);
        const p=d.gameplay.state.player;
        fixedOrbit(d,new THREE.Vector3(p.x,groundHeight(p.x,p.z)+1.6,p.z),walkScale,`${id} return`);
        frameVisible(d.camera,worldVertices(bacon.group),`${id} return`);
        const start={...d.gameplay.state.player},end={x:GARAGE_LAYOUT.maxX-1.7,z:GARAGE_LAYOUT.rearZ-1.7,heading:0};
        for(let i=1;i<=120;i++){
          const fraction=i/120,p={x:start.x+(end.x-start.x)*fraction,z:start.z+(end.z-start.z)*fraction,heading:0};
          characterPose(d,p,false);
          assert.ok([...d.camera.position,...d.camera.quaternion].every(Number.isFinite));
          const expected=computeFollowOffset(d.cameraState.state,new THREE.Vector3()).normalize().negate();
          assert.ok(d.camera.getWorldDirection(new THREE.Vector3()).distanceTo(expected)<1e-8,'Translation smoothing must not rotate the held orbit');
        }
        assert.ok(eyeOutsideHangar(d),'Walking follow unexpectedly pushed the eye away from the rear wall');
      }
    });
  }finally{app.dispose();}
}

const app=createAppDom({startDriving:false}),d=app.debug;
for(const car of d.garage.vehicles){
  let halfWidth=0,halfLength=0;
  for(const p of worldVertices(car.rig.root)){car.rig.root.worldToLocal(p);halfWidth=Math.max(halfWidth,Math.abs(p.x));halfLength=Math.max(halfLength,Math.abs(p.z));}
  fleetEnvelope.set(car.id,{halfWidth,halfLength});
}
try{
  check('all selected cars drive forward and reverse while the rear road end stays closed',()=>{
    for(const id of ['pickup','rover','van'])for(const gear of ['D','R'])for(const heading of [0,Math.PI]){
      select(d,id);const forward=(gear==='D'?1:-1)*Math.cos(heading)>0;
      place(d,{x:0,z:6,heading});d.model.setGear(gear);d.model.setInput({active:true,steering:0});
      let travelled=0;
      for(let frame=0;frame<360;frame++){
        d.model.step(1/60);roadFrames++;travelled+=Math.abs(d.model.state.travel);
        footprintClear(d,`${id} ${gear}`);if(frame%12===0)actualBodyClear(d,`${id} ${gear}`);
      }
      assert.ok(forward?d.model.state.z<0:d.model.state.z>6,`${id} ${gear} h${heading}: did not move`);
      assert.ok(d.model.state.z<=23-TRUCK_HALF_LENGTH+.001,`${id}: breached rear road end`);
      assert.ok(travelled>1);assert.ok(Math.abs(travelled-Math.abs(d.model.state.z-6))<1e-5);
    }
    for(let x=-10;x<=10;x+=2)for(let z=23.1;z<=GARAGE_LAYOUT.rearZ;z+=1.25)for(let i=0;i<16;i++)
      assert.ok(garageRoadContact(x,z,i*Math.PI/8,corridorContact),`Unintended drivable connection ${x},${z},${i}`);
  });
  check('actual articulated bodies stay on the road through continuous D/R turning and collisions',()=>{
    for(const id of ['pickup','rover','van'])for(const gear of ['D','R'])for(let direction=0;direction<8;direction++){
      select(d,id);place(d,{x:0,z:6,heading:direction*Math.PI/4});d.model.setGear(gear);d.model.setInput({active:true,steering:direction%3===0?.75:0});
      for(let frame=0;frame<180;frame++){d.model.step(1/60);boundaryFrames++;footprintClear(d,`${id} ${gear} ${direction}`);if(frame%12===0)actualBodyClear(d,`${id} ${gear} ${direction}`);}
    }
  });
  check('parked-car contact agrees with independent corner-projection SAT across fleet and rotated headings',()=>{
    d.returnToGarage();
    const corners=(x,z,h)=>{const c=Math.cos(h),s=Math.sin(h);return[-1,1].flatMap(a=>[-1,1].map(b=>({x:x+a*TRUCK_HALF_WIDTH*c-b*TRUCK_HALF_LENGTH*s,z:z-a*TRUCK_HALF_WIDTH*s-b*TRUCK_HALF_LENGTH*c})));};
    const overlaps=(a,b,ha,hb)=>[[Math.cos(ha),-Math.sin(ha)],[-Math.sin(ha),-Math.cos(ha)],[Math.cos(hb),-Math.sin(hb)],[-Math.sin(hb),-Math.cos(hb)]].every(([x,z])=>{const p=a.map(v=>v.x*x+v.z*z),q=b.map(v=>v.x*x+v.z*z);return Math.min(Math.max(...p),Math.max(...q))-Math.max(Math.min(...p),Math.min(...q))>-.05+1e-10;});
    for(const id of ['pickup','rover','van'])for(let x=-14;x<=14;x+=2)for(let z=GARAGE_LAYOUT.frontZ+10;z<=GARAGE_LAYOUT.frontZ+26;z+=2)for(let i=0;i<24;i++){
      const h=i*Math.PI/12,a=corners(x,z,h),expected=d.garage.vehicles.some(v=>v.id!==id&&overlaps(a,corners(v.position.x,v.position.z,v.position.heading),h,v.position.heading));
      assert.equal(!!parkedVehicleContact(x,z,h,d.garage.vehicles,id),expected,`${id},${x},${z},${h}`);obbCases++;
    }
  });
  check('exit API refuses every sampled car, road position and heading without changing the session',()=>{
    assert.equal(d.exitVehicle,undefined);
    for(const id of ['pickup','rover','van'])for(let x=-11;x<=11;x+=2)for(const z of [16,6,-10,-35,-50])for(let i=0;i<16;i++){
      select(d,id);const h=i*Math.PI/8;
      if(garageRoadContact(x,z,h,corridorContact)||parkedVehicleContact(x,z,h,d.garage.vehicles,id))continue;
      Object.assign(d.model.state,{x,z,heading:h});d.applyTruckPose();d.gameplay.events();
      const snapshot=structuredClone(d.gameplay.state);
      assert.equal(d.gameplay.exit(d.model.state,h),false);exitCases++;
      assert.deepEqual(d.gameplay.state,snapshot);assert.deepEqual(d.gameplay.events(),[]);
      assert.equal(d.gameplay.state.mode,'driving');assert.equal(d.character.group.visible,false);
    }
    select(d,'rover');Object.assign(d.model.state,{x:12,z:6,heading:0});d.applyTruckPose();
    assert.equal(d.gameplay.exit(d.model.state,0),false);assert.equal(d.gameplay.state.mode,'driving');
    app.ids.get('garage-button').dispatch('click');
    assert.equal(d.gameplay.state.mode,'walking');assert.deepEqual(d.gameplay.state.player,{...GAMEPLAY.spawn});
    onFootClear(d,'Top garage return regression');
  });
  check('actual animated Bacon footprint is measured against walking and parked-car clearances',()=>{
    const {halfWidth,halfLength,radius}=baconEnvelope;
    const limit=(lo,hi,allowed)=>{for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(allowed(mid))lo=mid;else hi=mid;}return lo;};
    const maxX=limit(GARAGE_LAYOUT.maxX-4,GARAGE_LAYOUT.maxX+1,x=>walkPointAllowed(x,GARAGE_LAYOUT.spawn.z)),maxZ=limit(GARAGE_LAYOUT.rearZ-4,GARAGE_LAYOUT.rearZ+1,z=>walkPointAllowed(0,z));
    console.log(`  Bacon measured over idle/walk/run: half-width ${halfWidth.toFixed(3)} m, half-length ${halfLength.toFixed(3)} m, maximum horizontal radius ${radius.toFixed(3)} m. Allowed center limits: x=${maxX.toFixed(3)}, z=${maxZ.toFixed(3)}.`);
    // Logical road inset and physical hangar bounds differ. Use the measured
    // full radial animation envelope so all player headings remain safe.
    assert.ok(radius<GARAGE_LAYOUT.maxX-maxX,'Bacon rendered body reaches through hangar side walls');
    assert.ok(radius<GARAGE_LAYOUT.rearZ-maxZ,'Bacon rendered body reaches through rear wall');
  });
}finally{app.dispose();bacon.dispose();}
console.log(`\nGarage camera/bounds: ${passed} passed, ${failed} failed. ${poses} camera poses, ${vertices} projected mesh vertices, ${roadFrames} road driving frames, ${boundaryFrames} boundary frames, ${obbCases} OBB cases, ${exitCases} denied exit cases. Renderer-free only.`);
if(failed)process.exitCode=1;
