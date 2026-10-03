import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {createAppDom} from './fixtures/app-dom.mjs';
import {createGameplay,GAMEPLAY} from '../dist/gameplay.js';
import {GARAGE_LAYOUT,CLASSROOM_DESKS,CHARACTER_STANDS,CLASSROOM_ENTRY} from '../dist/garage-scene.js';
import {CHARACTER_CATALOG} from '../dist/character-catalog.js';
let passed=0;const check=(n,f)=>{f();passed++;console.log('PASS '+n)};
const a=createAppDom({startDriving:false}),d=a.debug;
const make=()=>createGameplay({vehicles:d.garage.vehicles,stations:d.garage.stations,desks:d.garage.desks,stands:d.garage.stands,solids:d.garage.classroomSolids});
const approach=(g,target,direction=-1)=>{g.state.player={x:target.x,z:target.z-direction*1.3,heading:0};g.state.walked=1;g.state.cooldown=0;g.state.interactionCooldown=0;for(let i=0;i<35;i++)g.walk(1/60,{x:0,z:direction});return g.events();};
check('spawn-facing layout has right cars, left classroom, rear real-character stands',()=>{
 assert.equal(d.garage.vehicles.length,3);assert.equal(GARAGE_LAYOUT.bays.length,10);
 assert.ok(GARAGE_LAYOUT.bays.every(b=>b.x===24&&b.heading===Math.PI/2));
 assert.equal(CLASSROOM_DESKS.length,20);assert.ok(CLASSROOM_DESKS.every(b=>b.x<0));
 assert.equal(CHARACTER_STANDS.length,17);assert.equal(CHARACTER_CATALOG.length,17);
 assert.ok(CHARACTER_STANDS.every(b=>b.z>GAMEPLAY.spawn.z));
 assert.equal(new Set(CHARACTER_CATALOG.map(c=>c.id)).size,17);
});
check('open visible doorway has no wall ray hit, but on-foot threshold shows one clear hint',()=>{
 d.scene.updateMatrixWorld(true);const ray=new THREE.Raycaster(new THREE.Vector3(0,2,GARAGE_LAYOUT.frontZ+5),new THREE.Vector3(0,0,-1),0,10);
 assert.equal(ray.intersectObject(d.garage.hangar,true).length,0);
 const g=make();g.state.player={x:0,z:GARAGE_LAYOUT.frontZ+2,heading:0};
 for(let i=0;i<300;i++)g.walk(1/60,{x:0,z:-1,running:true});
 assert.ok(g.state.player.z>=GARAGE_LAYOUT.frontZ+1.6);assert.equal(g.events().filter(e=>e.type==='door').length,1);assert.equal(g.state.mode,'walking');
});
check('all 17 model markers fire once, require movement and departure before re-entry',()=>{
 for(const stand of CHARACTER_STANDS){const g=make();const events=approach(g,stand.trigger,1);assert.equal(events.filter(e=>e.type==='character').length,1,`stand ${stand.index}`);
 assert.equal(g.state.blockedStand,stand.index);for(let i=0;i<300;i++)g.walk(1/60,{});assert.equal(g.events().filter(e=>e.type==='character').length,0);
 g.state.player={x:stand.trigger.x,z:stand.trigger.z-4,heading:0};g.walk(.05,{});assert.equal(g.state.blockedStand,null);
 }
});
check('single classroom entry chooses free seats and standing returns safely outside its trigger',()=>{
 for(const desk of CLASSROOM_DESKS){const g=make();g.setOccupiedSeatIds(CLASSROOM_DESKS.filter(v=>v.id!==desk.id).map(v=>v.id));
 g.state.player={x:CLASSROOM_ENTRY.x,z:CLASSROOM_ENTRY.z+3,heading:0};g.state.walked=1;
 for(let i=0;i<20&&!g.state.seatedId;i++)g.walk(1/60,{x:0,z:-1});assert.equal(g.state.seatedId,desk.id);
 for(let i=0;i<180;i++)g.walk(1/60,{});assert.equal(g.state.seatedId,desk.id);assert.ok(!g.enter('pickup'));
 assert.ok(g.stand());assert.equal(g.state.seatedId,null);assert.deepEqual(g.state.player,CLASSROOM_ENTRY.exit);assert.ok(g.canWalk(g.state.player.x,g.state.player.z));
 for(let i=0;i<120;i++)g.walk(1/60,{});assert.equal(g.state.seatedId,null);
 }
});
check('all 17 choices persist through each car, exit, fuel-empty and garage/reseed',()=>{
 for(const spec of CHARACTER_CATALOG){d.selectCharacter(spec.id);assert.equal(d.gameplay.state.characterId,spec.id);assert.equal(d.character.id,spec.id);
 for(const car of ['pickup','rover','van']){d.returnToGarage();d.gameplay.state.cooldown=0;assert.ok(d.enterVehicle(car));assert.equal(d.character.group.visible,false);d.gameplay.state.fuels[car]=.001;d.gameplay.drive(1,0,-40);d.returnToGarage('empty');assert.equal(d.gameplay.state.characterId,spec.id);assert.equal(d.character.id,spec.id);assert.equal(d.gameplay.state.seatedId,null);}
 }const id=d.gameplay.state.characterId;d.rebuild(17);assert.equal(a.debug.gameplay.state.characterId,id);assert.equal(a.debug.character.id,id);
});
check('single classroom marker and stands have reachable approach zones from spawn',()=>{
 for(const id of ['bacon','jandel']){const g=make();g.setCharacter(id);const step=.5,queue=[[0,GAMEPLAY.spawn.z]],visited=new Set([`0,${GAMEPLAY.spawn.z}`]);let cursor=0;
 while(cursor<queue.length){const [x,z]=queue[cursor++];for(const [dx,dz]of[[step,0],[-step,0],[0,step],[0,-step]]){const nx=x+dx,nz=z+dz,k=`${nx},${nz}`;if(nx<GARAGE_LAYOUT.minX+1.5||nx>GARAGE_LAYOUT.maxX-1.5||nz<GARAGE_LAYOUT.frontZ+1.5||nz>GARAGE_LAYOUT.rearZ-1.5||visited.has(k)||!g.canWalk(nx,nz))continue;visited.add(k);queue.push([nx,nz]);}}
 for(const obj of [{id:'classroom-entry',trigger:CLASSROOM_ENTRY,triggerRadius:CLASSROOM_ENTRY.radius},...CHARACTER_STANDS])assert.ok(queue.some(([x,z])=>Math.hypot(x-obj.trigger.x,z-obj.trigger.z)<obj.triggerRadius),`unreachable ${obj.id??obj.index}`);
 console.log('  Reachable walking samples:',id,queue.length);}
});
check('seated camera remains under roof and frames target for portrait and landscape',()=>{
 for(const [width,height]of[[360,640],[390,844],[844,390],[1440,900]]){const app=createAppDom({width,height,startDriving:false});const debug=app.debug;
 for(const desk of CLASSROOM_DESKS){debug.gameplay.state.seatedId=desk.id;debug.gameplay.state.player={...desk.seat};debug.followCharacter(1,true);debug.camera.updateMatrixWorld(true);
 assert.ok(debug.camera.position.y<20);for(const y of [.3,1,2.9]){const p=new THREE.Vector3(desk.seat.x,y,desk.seat.z).project(debug.camera);assert.ok(Math.abs(p.x)<.95&&Math.abs(p.y)<.95&&p.z<1);}}
 app.dispose();}
});
const delayed=createAppDom({startDriving:false,deferCharacters:true});
const changing=delayed.debug.selectCharacter('pack1');delayed.debug.rebuild(2026);delayed.resolveCharacter('pack1');await changing;
for(let i=0;i<40;i++)await Promise.resolve();
check('model loading across regeneration repopulates every display and preserves last successful choice',()=>{
 assert.equal(delayed.debug.character.id,'pack1');assert.equal(delayed.debug.characterDisplays.length,17);
 assert.equal(delayed.debug.gameplay.state.characterId,'pack1');
});
const failed=delayed.debug.selectCharacter('pack2');delayed.resolveCharacter('pack2',true);await failed;
check('failed replacement keeps previous avatar and restores walking input',()=>{assert.equal(delayed.debug.character.id,'pack1');assert.equal(delayed.debug.characterReady,true);});
delayed.dispose();a.dispose();console.log(`Hangar interactions: ${passed} checks passed; renderer-free.`);
