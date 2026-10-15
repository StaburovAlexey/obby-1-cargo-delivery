import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {attachCosmoGarage,PARKED_COSMO_SCALE} from '../dist/cosmo-garage.js';
import {loadCosmoVehicle} from '../dist/cosmo-vehicles.js';
import {createGameplay,parkedVehicleContact,GAMEPLAY} from '../dist/gameplay.js';
import {GARAGE_LAYOUT,CHARACTER_STANDS} from '../dist/garage-scene.js';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';
import {freshCareer} from '../dist/career-save.js';
import {groundHeight} from '../dist/city-driving.js';
import {TRUCK_HALF_WIDTH,TRUCK_HALF_LENGTH} from '../dist/road-layout.js';
import {WORLD_LABEL_DROP} from '../dist/progression-hud.js';
import {createAppDom} from './fixtures/app-dom.mjs';


const originalFetch=globalThis.fetch,originalBitmap=globalThis.createImageBitmap,originalSelf=globalThis.self;
globalThis.self=globalThis;
globalThis.createImageBitmap=async blob=>{const b=Buffer.from(await blob.arrayBuffer());return {width:b.readUInt32BE(16),height:b.readUInt32BE(20),close(){}};};
globalThis.fetch=async request=>{const url=typeof request==='string'?request:request.url;return url.startsWith('blob:')?originalFetch(request):new Response(fs.readFileSync(new URL(url)));};
const near=(a,b,message,tolerance=1e-7)=>assert(Math.abs(a-b)<=tolerance,`${message}: ${a} != ${b}`);
const nearArray=(actual,expected,message)=>actual.forEach((value,i)=>near(value,expected[i],`${message}/${i}`));
function visibleBounds(root){
  root.updateWorldMatrix(true,true);const box=new THREE.Box3(),vertex=new THREE.Vector3();
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    for(let node=mesh;node;node=node.parent)if(!node.visible)return;
    const positions=mesh.geometry.attributes.position;
    for(let i=0;i<positions.count;i++)box.expandByPoint(vertex.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld));
  });
  return box;
}
const report={scope:'CPU actual GLB geometry and production gameplay/app with mock DOM; no browser/GPU claim',vehicles:[],walkSamples:0,asyncModes:0};
let fixture;
try{
  fixture=createAppDom({startDriving:false,attachVehicleVisuals:attachCosmoGarage,career:{...freshCareer(),money:500000}});
  const d=fixture.debug,g=d.garage;
  assert.deepEqual(await g.vehicleVisuals.ready,{loaded:10,total:10});
  assert.equal(PARKED_COSMO_SCALE,1);
  const boxes=[],metadata=new Map();
  for(const vehicle of g.vehicles){
    const visual=vehicle.visual,box=visibleBounds(visual.group),size=box.getSize(new THREE.Vector3());
    metadata.set(vehicle.id,JSON.stringify(visual.metadata));
    nearArray(visual.group.scale.toArray(),[1,1,1],vehicle.id+' parked scale');
    nearArray(vehicle.root.scale.toArray(),[1,1,1],vehicle.id+' root scale');
    assert.deepEqual(vehicle.footprint,{halfWidth:TRUCK_HALF_WIDTH,halfLength:TRUCK_HALF_LENGTH});
    near(size.x,visual.metadata.dimensions[2]*1,vehicle.id+' length');
    near(size.y,visual.metadata.dimensions[1]*1,vehicle.id+' height');
    near(size.z,visual.metadata.dimensions[0]*1,vehicle.id+' width');
    near(box.min.y,vehicle.root.position.y+.05,vehicle.id+' anchored tires');
    assert(box.min.y>=groundHeight(vehicle.park.x,vehicle.park.z)-1e-7);
    assert(box.min.x>=vehicle.park.x-vehicle.park.halfWidth&&box.max.x<=vehicle.park.x+vehicle.park.halfWidth);
    assert(box.min.z>=vehicle.park.z-vehicle.park.halfLength&&box.max.z<=vehicle.park.z+vehicle.park.halfLength);
    assert(box.min.z>GARAGE_LAYOUT.frontZ&&box.max.z<GARAGE_LAYOUT.rearZ);
    assert(box.max.y<GARAGE_LAYOUT.roofHeight);
    assert(vehicle.priceAnchor.y-WORLD_LABEL_DROP>box.max.y+1,'price label clears roof');
    for(const other of boxes)assert(!box.intersectsBox(other.box),`${vehicle.id} overlaps ${other.id}`);
    for(const stand of CHARACTER_STANDS)assert(box.max.z<stand.trigger.z-2.05,'rear character path stays clear');
    boxes.push({id:vehicle.id,box});
    report.vehicles.push({id:vehicle.id,height:size.y,width:size.z,length:size.x});
    const rootPose=vehicle.root.matrix.toArray(),footprint={...vehicle.footprint};
    g.setVehicleDisplayMode(vehicle.id);
    nearArray(visual.group.scale.toArray(),[1,1,1],vehicle.id+' driving scale');
    nearArray(visual.group.position.toArray(),[0,0,0],vehicle.id+' driving origin');
    assert.deepEqual(vehicle.root.matrix.toArray(),rootPose,'display switch never moves world root');
    assert.deepEqual(vehicle.footprint,footprint,'display switch never changes driving envelope');
    assert.equal(JSON.stringify(visual.metadata),metadata.get(vehicle.id),'dimensions/tire metadata remain unchanged');
    g.setVehicleDisplayMode(null);g.setVehicleDisplayMode(null);
    nearArray(visibleBounds(visual.group).min.toArray(),box.min.toArray(),'repeated parking is idempotent');
  }
  boxes.sort((a,b)=>a.box.min.z-b.box.min.z);
  report.smallestGap=Math.min(...boxes.slice(1).map((item,i)=>item.box.min.z-boxes[i].box.max.z));
  assert(report.smallestGap>.60);
  const parameters={vehicles:g.vehicles,stations:g.stations,deliveries:g.deliveries,desks:g.desks,stands:g.stands,solids:g.classroomSolids};
  const route=(game,a,b)=>{
    const steps=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/.1);
    for(let i=0;i<=steps;i++){
      const t=i/Math.max(1,steps),x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
      assert(game.canWalk(x,z),`${game.state.characterId}/${game.state.jump.airborne}: blocked at ${x},${z}`);report.walkSamples++;
    }
  };
  for(const characterId of ['bacon','jandel'])for(const airborne of [false,true]){
    const game=createGameplay({...parameters,characterId});game.state.jump.airborne=airborne;
    for(const vehicle of g.vehicles){
      route(game,GARAGE_LAYOUT.spawn,{x:0,z:vehicle.park.z});
      route(game,{x:0,z:vehicle.park.z},vehicle.approach);
      assert(!game.canWalk(vehicle.park.x-5,vehicle.park.z),'enlarged front collision matches display');
    }
    route(game,{x:-44,z:79},{x:28,z:79});
    for(const stand of g.stands){route(game,{x:0,z:79},{x:stand.trigger.x,z:79});route(game,{x:stand.trigger.x,z:79},{x:stand.trigger.x,z:stand.trigger.z-.1});}
  }
  for(const vehicle of g.vehicles){
    const game=createGameplay({...parameters,career:{...freshCareer(),money:500000}});
    const approach=vehicle.approach;
    Object.assign(game.state.player,{x:approach.x-2,z:approach.z});game.state.cooldown=0;game.state.interactionCooldown=0;
    let steps=0;
    while(game.state.mode==='walking'&&game.state.player.x<approach.x-.02&&steps++<30)game.walk(.05,{x:1,z:0});
    if(vehicle.id==='pickup'){
      assert.equal(game.state.mode,'driving');assert.equal(game.state.selectedId,vehicle.id,'approach chooses exact owned car');
    }else{
      assert.equal(game.state.mode,'walking');assert.equal(game.state.purchaseCandidateId,vehicle.id,'approach chooses exact locked car');
      const before=game.state.money;assert(game.buy(vehicle.id));assert.equal(game.state.money,before-vehicle.config.price);
      assert.equal(game.state.mode,'walking','buying does not board');assert(!game.buy(vehicle.id));
      for(let i=0;i<3;i++)game.walk(.05,{x:0,z:1});
      assert.equal(game.state.mode,'walking','purchase blockedEntry remains armed near approach');
      for(let i=0;i<12;i++)game.walk(.05,{x:-1,z:0});
      assert.equal(game.state.blockedEntry,null,'leaving approach rearms entry');
      Object.assign(game.state.player,{x:approach.x-2,z:approach.z});
      for(let i=0;i<15&&game.state.mode==='walking';i++)game.walk(.05,{x:1,z:0});
      assert.equal(game.state.selectedId,vehicle.id,'return to exact bought car boards it');
    }
    game.returnToGarage();assert.equal(game.state.mode,'walking');assert.deepEqual(game.state.player,GAMEPLAY.spawn);

    const other=g.vehicles.find(v=>v.id!==vehicle.id),isolated=createGameplay({...parameters,career:{...freshCareer(),money:500000}});
    Object.assign(isolated.state.player,other.approach);if(vehicle.id!=='pickup')assert(!isolated.buy(vehicle.id));
  }

  const parked=g.vehicles[0],activeX=parked.park.x-parked.parkedFootprint.halfLength-TRUCK_HALF_WIDTH;
  assert(parkedVehicleContact(activeX,parked.park.z,0,[parked],'another'));
  assert(!parkedVehicleContact(activeX-.1,parked.park.z,0,[parked],'another'));
  assert(!parkedVehicleContact(parked.park.x,parked.park.z,0,[parked],parked.id));


  for(const vehicle of g.vehicles){
    if(!d.gameplay.isOwned(vehicle.id))d.gameplay.state.ownedVehicleIds.push(vehicle.id);
    d.gameplay.state.cooldown=0;assert(d.enterVehicle(vehicle.id));
    for(const car of g.vehicles)near(car.visual.group.scale.x,car.id===vehicle.id?1:1,'app selected scale');
    assert.equal(JSON.stringify(vehicle.visual.metadata),metadata.get(vehicle.id));
    assert(!vehicle.cargo.visible);
    d.returnToGarage();for(const car of g.vehicles)near(car.visual.group.scale.x,1,'app garage restore');
  }
  const old=g.vehicles.map(v=>v.visual);fixture.ids.get('regenerate').dispatch('click');
  assert(old.every(v=>v.disposed));
  assert.equal((await fixture.debug.garage.vehicleVisuals.ready).loaded,10);
  for(const car of fixture.debug.garage.vehicles)near(car.visual.group.scale.x,1,'rebuilt parked scale');
  fixture.dispose();fixture=null;


  for(const returnBeforeReady of [false,true]){
    let release;const gate=new Promise(resolve=>release=resolve);
    fixture=createAppDom({startDriving:false,attachVehicleVisuals:(T,garage)=>attachCosmoGarage(T,garage,{load:async(...args)=>{await gate;return loadCosmoVehicle(...args);}})});
    const app=fixture.debug;app.gameplay.state.cooldown=0;assert(app.enterVehicle('pickup'));
    if(returnBeforeReady)app.returnToGarage();release();
    assert.equal((await app.garage.vehicleVisuals.ready).loaded,10);
    for(const car of app.garage.vehicles)near(car.visual.group.scale.x,!returnBeforeReady&&car.id==='pickup'?1:1,'late load inherits current mode');
    app.returnToGarage();for(const car of app.garage.vehicles)near(car.visual.group.scale.x,1,'late-load garage restore');
    fixture.dispose();fixture=null;report.asyncModes++;
  }

  assert.deepEqual([...boxes].map(v=>v.id),VEHICLE_CONFIG.map(v=>v.id));
  console.log(JSON.stringify({passed:true,...report},null,2));
}finally{
  fixture?.dispose();globalThis.fetch=originalFetch;globalThis.createImageBitmap=originalBitmap;globalThis.self=originalSelf;
}
