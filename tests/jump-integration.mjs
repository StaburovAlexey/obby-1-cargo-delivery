import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {createAppDom} from './fixtures/app-dom.mjs';
import {createGameplay,GAMEPLAY,walkPointAllowed} from '../dist/gameplay.js';
import {GARAGE_LAYOUT,CLASSROOM_ENTRY} from '../dist/garage-scene.js';
import {freshCareer} from '../dist/career-save.js';
import {groundHeight} from '../dist/city-driving.js';
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS '+name)};
const app=createAppDom({startDriving:false,career:{...freshCareer(),ownedSkinIds:['bacon','pack1']}}),d=app.debug;
const make=()=>createGameplay({vehicles:d.garage.vehicles,stations:d.garage.stations,desks:d.garage.desks,stands:d.garage.stands,solids:d.garage.classroomSolids});
const advance=n=>{for(let i=0;i<n;i++)app.frame();};
const key=(code,down=true,extra={})=>app.win.dispatch(down?'keydown':'keyup',{code,stopImmediatePropagation(){this.stopped=true;},...extra});
const pointer=(el,type,id,x=50,y=50)=>el.dispatch(type,{pointerId:id,button:0,clientX:x,clientY:y,isPrimary:id===1,pointerType:'touch'});
test('garage is 3m from road, threshold faces it, all solids remain outside route',()=>{
 assert.equal(GARAGE_LAYOUT.frontZ,26);assert.equal(GARAGE_LAYOUT.frontZ-23,3);assert.equal(GARAGE_LAYOUT.spawn.z,60);
 const shell=d.garage.hangar.children[0],m=new THREE.Matrix4(),b=new THREE.Box3().setFromBufferAttribute(shell.geometry.attributes.position);
 for(let i=0;i<shell.count;i++){shell.getMatrixAt(i,m);const bounds=b.clone().applyMatrix4(m);assert.ok(bounds.min.z>=23-1e-6,shell.userData.partNames[i]);}
 for(const car of d.garage.vehicles){const b=new THREE.Box3().setFromObject(car.root);assert.ok(b.min.z>GARAGE_LAYOUT.frontZ+1.8,'Each of ten parked cars clears the front wall');assert.ok(b.max.x<GARAGE_LAYOUT.maxX-.2);}
});
test('jump arc is ballistic and frame-rate independent at30/60/120fps',()=>{
 const peaks=[];for(const fps of[30,60,120]){const g=make();assert.ok(g.jump());assert.ok(!g.jump());let peak=0,landedAt=0;
 for(let i=0;i<fps*2;i++){g.walk(1/fps,{});peak=Math.max(peak,g.state.jump.height);if(!g.state.jump.airborne&&!landedAt)landedAt=(i+1)/fps;assert.ok(g.state.jump.height>=0);}
 assert.ok(Math.abs(peak-GAMEPLAY.jumpSpeed**2/(2*GAMEPLAY.gravity))<.005);assert.ok(landedAt>=GAMEPLAY.jumpDuration&&landedAt<=GAMEPLAY.jumpDuration+1/fps);assert.equal(g.state.jump.velocity,0);assert.equal(g.events().filter(e=>e.type==='land').length,1);peaks.push(peak);}
 console.log('  Jump peaks:',peaks);
});
test('jump never bypasses entrance, cars, displays or desk collisions',()=>{
 for(const p of [{x:0,z:GARAGE_LAYOUT.frontZ+1.7,dx:0,dz:-1},{x:29.2,z:60,dx:1,dz:0},{x:d.garage.vehicles[0].park.x-5,z:d.garage.vehicles[0].park.z,dx:1,dz:0}]){
 const g=make();g.state.player={x:p.x,z:p.z,heading:0};g.jump();for(let i=0;i<43;i++){g.walk(1/60,{x:p.dx,z:p.dz,running:true});assert.ok(walkPointAllowed(g.state.player.x,g.state.player.z));assert.ok(g.canWalk(g.state.player.x,g.state.player.z));assert.equal(g.state.mode,'walking');}}
});
test('airborne entry, model changes and seats are suppressed including landing frame',()=>{
 for(const target of [{x:d.garage.vehicles[0].park.x-4.9,z:d.garage.vehicles[0].park.z},d.garage.stands[0].trigger,{x:CLASSROOM_ENTRY.x,z:CLASSROOM_ENTRY.z}]){
 const g=make();g.state.cooldown=0;g.state.interactionCooldown=0;g.state.walked=5;g.state.player={...target,heading:0};assert.ok(g.jump());assert.ok(!g.enter('pickup'));
 let frames=0;while(g.state.jump.airborne&&frames++<60){g.walk(1/60,{x:0,z:0});assert.equal(g.state.mode,'walking');assert.equal(g.state.seatedId,null);assert.ok(!g.events().some(e=>['enter','character','sit'].includes(e.type)));}
 assert.ok(g.state.interactionCooldown>0);g.walk(1/60,{});assert.equal(g.state.mode,'walking');}
});
test('button and Space cause real world elevation once, and landing restores ground',()=>{
 d.returnToGarage();advance(70);const y=groundHeight(d.gameplay.state.player.x,d.gameplay.state.player.z);
 pointer(app.ids.get('jump-button'),'pointerdown',3);assert.ok(d.gameplay.state.jump.airborne);advance(12);assert.ok(d.character.group.position.y>y+.9);
 const elapsed=d.gameplay.state.jump.elapsed;key('Space');key('Space',true,{repeat:true});assert.equal(d.gameplay.state.jump.elapsed,elapsed);key('Space',false);
 advance(60);assert.equal(d.gameplay.state.jump.airborne,false);assert.equal(d.character.group.position.y,y);assert.equal(app.ids.get('jump-button').disabled,false);
 key('Space');assert.ok(d.gameplay.state.jump.airborne);advance(60);key('Space',false);
});
test('seated must stand first, driving cannot jump, garage reset clears vertical state',()=>{
 const desk=d.garage.desks[0];d.gameplay.state.seatedId=desk.id;d.gameplay.state.player={...desk.seat};assert.equal(d.requestJump(),false);assert.equal(d.gameplay.state.jump.airborne,false);
 d.standCharacter();assert.ok(d.requestJump());d.returnToGarage('empty');assert.deepEqual(d.gameplay.state.jump,{height:0,velocity:0,elapsed:0,airborne:false});
 d.gameplay.state.cooldown=0;d.enterVehicle('pickup');assert.equal(d.requestJump(),false);assert.equal(app.ids.get('jump-button').hidden,true);d.returnToGarage();
});
test('three concurrent walking/look/jump pointers have separate ownership',()=>{
 advance(70);const stick=app.ids.get('walk-stick'),canvas=d.renderer.domElement;
 pointer(stick,'pointerdown',1,80,30);pointer(canvas,'pointerdown',2,100,100);const yaw=d.cameraState.state.yaw;
 pointer(app.ids.get('jump-button'),'pointerdown',3);pointer(canvas,'pointermove',2,170,120);
 assert.equal(d.lookInput.pointerId,2);assert.ok(d.walkInput.sample().active);assert.ok(d.gameplay.state.jump.airborne);assert.notEqual(d.cameraState.state.yaw,yaw);
 const yaw2=d.cameraState.state.yaw;pointer(stick,'pointermove',1,20,30);pointer(app.ids.get('jump-button'),'pointermove',3,230,100);assert.equal(d.cameraState.state.yaw,yaw2);
 pointer(canvas,'pointerup',2);assert.equal(d.lookInput.active,false);assert.ok(d.walkInput.sample().active);pointer(stick,'pointercancel',1);assert.equal(d.walkInput.sample().active,false);app.win.dispatch('blur');assert.equal(d.lookInput.active,false);app.win.dispatch('focus');
 const heldYaw=d.cameraState.state.yaw;advance(70);assert.equal(d.cameraState.state.yaw,heldYaw);d.selectCharacter('pack1');assert.equal(d.gameplay.state.characterId,'pack1');assert.equal(d.cameraState.state.yaw,heldYaw,'Walking model changes must not reset the chosen camera angle');
});
test('driving return uses actual displacement, waits6m, reverse works and teleports reset it',()=>{
 d.returnToGarage();d.gameplay.state.cooldown=0;d.enterVehicle('pickup');d.cameraState.lookBegin();d.cameraState.lookDelta(1,.1);d.cameraState.lookEnd();const yaw=d.cameraState.state.yaw;
 advance(120);assert.equal(d.cameraState.state.yaw,yaw);assert.equal(d.cameraState.state.distanceSinceLook,0);
 Object.assign(d.model.state,{x:0,z:-60,heading:0});d.model.setGear('R');d.model.setInput({active:true,steering:0});let distance=0;
 for(let i=0;i<120;i++){const before={x:d.model.state.x,z:d.model.state.z};app.frame();distance+=Math.hypot(d.model.state.x-before.x,d.model.state.z-before.z);assert.ok(Math.abs(d.cameraState.state.distanceSinceLook-distance)<1e-8);if(distance<6-1e-8)assert.equal(d.cameraState.state.yaw,yaw);}
 assert.ok(distance>6);assert.ok(Math.abs(d.cameraState.state.yaw)<Math.abs(yaw));d.returnToGarage('empty');assert.equal(d.cameraState.state.distanceSinceLook,0);assert.equal(d.cameraState.state.mode,'walking');
});
app.dispose();console.log(`Jump/camera integration: ${count} checks passed. No browser/WebGL test.`);
