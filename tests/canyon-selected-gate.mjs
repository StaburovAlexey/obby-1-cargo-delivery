import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {COSMO_VEHICLES,createCosmoVehicleAdapter} from '../dist/cosmo-vehicles.js';
import {BMW_VEHICLE,createBMWVehicleAdapter} from '../dist/bmw-vehicle.js';
import {createCanyonEntrance} from '../dist/canyon-entrance.js';
import {CANYON_GATE_DISTANCE,canyonApproachPoint} from '../dist/canyon-approach.js';
import {createDrivingModel} from '../dist/driving-model.js';
import {vehicleFootprint} from '../dist/vehicle-contact.js';
import {VEHICLE_CONFIG,ECONOMY_CONFIG,vehicleConfig} from '../dist/economy-config.js';
import {freshCareer} from '../dist/career-save.js';
import {createAppDom} from './fixtures/app-dom.mjs';
import {earnedRewardCareer} from './fixtures/reward-career.mjs';

// CPU-only: use the shipped GLBs' actual wheel/body bounds, production contact
// sweeps, and the app DOM fixture. This does not assert GPU-rendered appearance.
const nonBmw=VEHICLE_CONFIG.filter(vehicle=>vehicle.id!=='bmwreward');
assert.equal(nonBmw.length,10,'the complete non-BMW catalog is covered');
const earned=earnedRewardCareer({career:{...freshCareer(),ownedVehicleIds:VEHICLE_CONFIG.map(vehicle=>vehicle.id)}});
const metadata=new Map();
const originals={self:globalThis.self,createImageBitmap:globalThis.createImageBitmap};
globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>{
 const png=Buffer.from(await blob.arrayBuffer());
 return {width:png.readUInt32BE(16),height:png.readUInt32BE(20),close(){}};
};
try{
 for(const spec of [...COSMO_VEHICLES,BMW_VEHICLE]){
  const bytes=fs.readFileSync(new URL(spec.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const adapter=spec.id==='bmwreward'?createBMWVehicleAdapter(THREE,spec.id,gltf):createCosmoVehicleAdapter(THREE,spec.id,gltf);
  metadata.set(spec.id,adapter.metadata);
  const footprint=vehicleFootprint(adapter.metadata);
  assert.ok(footprint.halfWidth>1&&footprint.halfLength>3.99,`${spec.id}: actual enlarged vehicle bounds`);
  adapter.dispose();
 }
}finally{
 for(const [key,value] of Object.entries(originals)){
  if(value===undefined)delete globalThis[key];else globalThis[key]=value;
 }
}

const gate=canyonApproachPoint(CANYON_GATE_DISTANCE);
const forward={x:-Math.sin(gate.heading),z:-Math.cos(gate.heading)};
const along=position=>(position.x-gate.x)*forward.x+(position.z-gate.z)*forward.z;
const extent=(id,heading=gate.heading)=>{
 const footprint=vehicleFootprint(metadata.get(id));
 const relative=heading-gate.heading;
 return footprint.halfLength*Math.abs(Math.cos(relative))+footprint.halfWidth*Math.abs(Math.sin(relative));
};
function seedApproach(model,id,speed,gap=4){
 const distance=extent(id)+.35+gap;
 model.pause();model.setGear('D');
 Object.assign(model.state,{x:gate.x-forward.x*distance,z:gate.z-forward.z*distance,heading:gate.heading,
  velocityX:forward.x*speed,velocityZ:forward.z*speed,speed,linearSpeed:speed});
 model.setInput({active:true,steering:0});
}
function assertBarrier(entrance,open,label){
 assert.equal(entrance.unlocked,open,`${label}: selected-vehicle access`);
 const arm=entrance.group.getObjectByName('Closed red and white barrier arm');
 assert.ok(arm,`${label}: actual barrier mesh exists`);
 for(let node=arm;node;node=node.parent)assert.equal(node.visible,true,`${label}: barrier hierarchy remains visible`);
 assert.equal(arm.parent.rotation.z,open?Math.PI/2:0,`${label}: barrier arm updates immediately`);
 entrance.group.updateWorldMatrix(true,true);
 const a=arm.localToWorld(new THREE.Vector3(-10,0,0));
 const b=arm.localToWorld(new THREE.Vector3(10,0,0));
 assert.ok(open?Math.abs(b.y-a.y)>19.99:Math.abs(b.y-a.y)<1e-8,`${label}: actual arm is ${open?'raised':'horizontal'}`);
 assert.ok(open?Math.hypot(b.x-a.x,b.z-a.z)<1e-8:Math.hypot(b.x-a.x,b.z-a.z)>19.99,`${label}: arm spans the lane only when closed`);
 const solid=entrance.solids[0];
 assert.equal(solid.minX<=solid.maxX,!open,`${label}: walking solid matches the arm`);
 const hit=entrance.contact(gate.x,gate.z,gate.heading,vehicleFootprint(metadata.get('bmwreward')));
 assert.equal(hit?.name,open?undefined:'Locked canyon barrier',`${label}: driving contact matches the arm`);
}

test('selected-vehicle access raises the real barrier only for an eligible BMW',()=>{
 const entrance=createCanyonEntrance(THREE);
 try{
  for(const [label,career,developerMode] of [['earned',earned,false],['developer',freshCareer(),true]]){
   for(const vehicle of VEHICLE_CONFIG){
    entrance.updateAccess(career,{developerMode,vehicleId:vehicle.id});
    assertBarrier(entrance,vehicle.id==='bmwreward',`${label} ${vehicle.id}`);
   }
   for(const vehicleId of [null,'','unknown-vehicle']){
    entrance.updateAccess(career,{developerMode,vehicleId});
    assertBarrier(entrance,false,`${label} unselected ${vehicleId}`);
   }
  }
  for(const developerMode of [undefined,false,0,1,'true','1']){
   entrance.updateAccess({...freshCareer(),ownedVehicleIds:VEHICLE_CONFIG.map(vehicle=>vehicle.id)}, {developerMode,vehicleId:'bmwreward'});
   assertBarrier(entrance,false,`production progression lock ${developerMode}`);
  }
  entrance.updateAccess(earned);
  assertBarrier(entrance,true,'legacy entrance-only callers retain their BMW default');
 }finally{entrance.dispose();}
});

test('all ten non-BMW footprints stop at the closed gate at 30/60/120 FPS, including high-speed approaches',()=>{
 const entrance=createCanyonEntrance(THREE);
 let cases=0;
 try{
  for(const [mode,career,developerMode] of [['earned',earned,false],['developer',freshCareer(),true]]){
   for(const vehicle of nonBmw)for(const fps of [30,60,120])for(const speed of [vehicle.maxSpeed,90]){
    const label=`${mode} ${vehicle.id} ${fps} FPS ${speed} m/s`;
    entrance.updateAccess(career,{developerMode,vehicleId:vehicle.id});
    assertBarrier(entrance,false,label);
    let contacts=0,peakImpact=0;
    const model=createDrivingModel({vehicleId:vehicle.id,maxSpeed:vehicle.maxSpeed,
     contact:(x,z,heading)=>{
      const hit=entrance.contact(x,z,heading,vehicleFootprint(metadata.get(vehicle.id),model.state.frontWheelAngle));
      if(hit?.name==='Locked canyon barrier')contacts++;
      return hit;
     }});
    seedApproach(model,vehicle.id,speed);
    const start=along(model.state);
    for(let frame=0;frame<fps;frame++){
     model.step(1/fps);peakImpact=Math.max(peakImpact,model.state.impactSpeed);
     assert.ok(along(model.state)+extent(vehicle.id,model.state.heading)<=-.35+1e-5,`${label}: no footprint corner tunnels past the gate`);
    }
    assert.ok(along(model.state)>start+2,`${label}: car actually approaches the barrier`);
    assert.ok(contacts>0&&peakImpact>0,`${label}: production collision resolver stops the car`);
    assert.ok(model.state.linearSpeed<.1,`${label}: held throttle cannot push through`);
    cases++;
   }
  }
  assert.equal(cases,120);
 }finally{entrance.dispose();}
});

test('eligible BMW drives through the raised gate at every tested frame rate and approach speed',()=>{
 const entrance=createCanyonEntrance(THREE);
 try{
  for(const [mode,career,developerMode] of [['earned',earned,false],['developer',freshCareer(),true]]){
   for(const fps of [30,60,120])for(const speed of [vehicleConfig('bmwreward').maxSpeed,90]){
    const label=`${mode} BMW ${fps} FPS ${speed} m/s`;
    entrance.updateAccess(career,{developerMode,vehicleId:'bmwreward'});assertBarrier(entrance,true,label);
    let contacts=0;
    const model=createDrivingModel({vehicleId:'bmwreward',maxSpeed:vehicleConfig('bmwreward').maxSpeed,
     contact:(x,z,heading)=>{
      const hit=entrance.contact(x,z,heading,vehicleFootprint(metadata.get('bmwreward'),model.state.frontWheelAngle));
      if(hit)contacts++;
      return hit;
     }});
    seedApproach(model,'bmwreward',speed);
    for(let frame=0;frame<fps;frame++)model.step(1/fps);
    assert.ok(along(model.state)>extent('bmwreward')+.35,`${label}: complete BMW clears the gate`);
    assert.equal(contacts,0,`${label}: no invisible collision remains`);
   }
  }
 }finally{entrance.dispose();}
});

function attachFootprints(_THREE,garage){
 // Exercise the app's own vehicleFootprint/contact wiring with GLB metadata.
 for(const vehicle of garage.vehicles)vehicle.visual={metadata:metadata.get(vehicle.id)};
}
test('real app selection immediately closes the arm for every non-BMW and blocks high-speed driving at 30/60/120 FPS',()=>{
 for(const developerMode of [false,true]){
  const career=developerMode?freshCareer():earned;
  const raw=JSON.stringify(career);let writes=0,time=1000;
  const storage={getItem:key=>key===ECONOMY_CONFIG.saveKey?raw:null,setItem(){writes++;}};
  const fixture=createAppDom({startDriving:false,search:developerMode?'?dev=1':'',storage,attachVehicleVisuals:attachFootprints});
  try{
   const debug=fixture.debug;
   assertBarrier(debug.canyon.entrance,false,'walking before selection');
   assert.equal(debug.gameplay.beginCanyonRun(),false,'walking cannot start a BMW event');
   for(const vehicle of nonBmw){
    debug.gameplay.state.cooldown=0;assert.equal(debug.enterVehicle('bmwreward'),true);
    assertBarrier(debug.canyon.entrance,true,`${vehicle.id}: switch to BMW without a frame`);
    if(vehicle===nonBmw[0]){
     fixture.frame(time+=1000/60);
     for(const fps of [30,60,120]){
      seedApproach(debug.model,'bmwreward',90,.2);
      for(let frame=0;frame<Math.ceil(fps/4);frame++){
       fixture.frame(time+=1000/fps);
       assert.equal(debug.model.state.blocked,false,`BMW ${fps} FPS: app has no invisible gate`);
      }
      assert.ok(along(debug.model.state)>extent('bmwreward')+.35,`BMW ${fps} FPS: app passes the raised gate`);
     }
    }
    debug.returnToGarage();assertBarrier(debug.canyon.entrance,false,'return to walking without a frame');
    debug.gameplay.state.cooldown=0;assert.equal(debug.enterVehicle(vehicle.id),true);
    assertBarrier(debug.canyon.entrance,false,`${vehicle.id}: switch away from BMW without a frame`);
    assert.equal(debug.gameplay.beginCanyonRun(),false,`${vehicle.id}: direct event entry cannot convert a non-BMW into the BMW`);
    assert.equal(debug.gameplay.state.selectedId,vehicle.id);
    assert.equal(debug.gameplay.state.eventMode,null);
    fixture.frame(time+=1000/60);
    for(const fps of [30,60,120]){
     seedApproach(debug.model,vehicle.id,90,.2);
     let blocked=false;
     for(let frame=0;frame<6;frame++){
      fixture.frame(time+=1000/fps);blocked||=debug.model.state.blocked;
      assert.ok(along(debug.model.state)+extent(vehicle.id,debug.model.state.heading)<=-.35+1e-5,`${vehicle.id} ${fps} FPS: app collision prevents gate crossing`);
     }
     assert.ok(blocked,`${vehicle.id} ${fps} FPS: app model hits the barrier`);
     assert.equal(debug.canyon.active,false);assert.equal(debug.gameplay.state.eventMode,null);
     assert.equal(debug.gameplay.state.selectedId,vehicle.id);
    }
    debug.returnToGarage();
   }
   if(developerMode){
    const saved=debug.gameplay.snapshot();
    for(const key of ['ownedVehicleIds','routeCompletion','driftRecord','money'])assert.deepEqual(saved[key],career[key],`developer gate access does not change ${key}`);
    assert.equal(writes,0,'developer access never persists unlocks');
   }
  }finally{fixture.dispose();}
  if(developerMode)assert.equal(writes,0,'developer cleanup never persists unlocks');
 }
});

test('production denies dev-query access and refreshes a changed progression lock before the next physics step',()=>{
 const career=freshCareer();
 const services={development:false,initialCareer:career,platform:{ready(){},gameplayStart(){},gameplayStop(){},showAd:async()=>({wasShown:false})}};
 const locked=createAppDom({startDriving:false,search:'?dev=1',services,attachVehicleVisuals:attachFootprints});
 try{
  assert.equal(locked.debug.developerMode,false);
  assert.equal(locked.debug.enterVehicle('bmwreward'),false);
  assertBarrier(locked.debug.canyon.entrance,false,'production query cannot bypass progression');
  assert.deepEqual(locked.debug.gameplay.snapshot(),career);
 }finally{locked.dispose();}
 const fixture=createAppDom({startDriving:false,career:earned,attachVehicleVisuals:attachFootprints});
 try{
  const debug=fixture.debug;
  debug.gameplay.state.cooldown=0;assert.equal(debug.enterVehicle('bmwreward'),true);
  fixture.frame(1000);assertBarrier(debug.canyon.entrance,true,'earned BMW before proof changes');
  seedApproach(debug.model,'bmwreward',90,.2);
  debug.gameplay.state.routeCompletion=null;
  const step=debug.model.step.bind(debug.model);let stepped=false;
  debug.model.step=dt=>{
   assertBarrier(debug.canyon.entrance,false,'access refresh precedes physics');
   stepped=true;return step(dt);
  };
  fixture.frame(1000+1000/30);
  assert.ok(stepped);assert.ok(debug.model.state.blocked);
  assert.ok(along(debug.model.state)+extent('bmwreward')<=-.35+1e-5,'revoked proof cannot grant one stale open-gate frame');
 }finally{fixture.dispose();}
});
