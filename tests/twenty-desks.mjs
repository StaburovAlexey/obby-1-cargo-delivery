import assert from 'node:assert/strict';
import {DELIVERY_CHECKPOINTS,VEHICLE_CONFIG} from '../dist/economy-config.js';
import * as THREE from '../dist/vendor/three.module.js';
import {createAppDom} from './fixtures/app-dom.mjs';
import {createGameplay,resolveFreeClassroomSeat,GAMEPLAY} from '../dist/gameplay.js';
import {CLASSROOM_DESKS,CLASSROOM_ENTRY,CLASSROOM_ENTRIES,GARAGE_LAYOUT} from '../dist/garage-scene.js';
import {CHARACTER_CATALOG} from '../dist/character-catalog.js';
import {freshCareer} from '../dist/career-save.js';
import {SCHOOL_CONFIG} from '../dist/progression-config.js';
const ownedCareer={...freshCareer(),ownedSkinIds:CHARACTER_CATALOG.map(s=>s.id),ownedSchoolIds:SCHOOL_CONFIG.map(s=>s.id)};
const app=createAppDom({startDriving:false}),d=app.debug;
const make=(options={})=>createGameplay({vehicles:d.garage.vehicles,stations:d.garage.stations,desks:d.garage.desks,stands:d.garage.stands,solids:d.garage.classroomSolids,career:ownedCareer,...options});
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS '+name);};
function enter(g,entry=CLASSROOM_ENTRY){g.state.player={x:entry.x,z:entry.z+3,heading:0};g.state.walked=1;g.state.interactionCooldown=0;for(let i=0;i<20&&!g.state.seatedId;i++)g.walk(1/60,{x:0,z:-1});}
check('expanded 90m hangar has compact 20-desk left wing in five columns and four rows',()=>{
 assert.equal(GARAGE_LAYOUT.minX,-57);assert.equal(GARAGE_LAYOUT.maxX,31);assert.equal(CLASSROOM_DESKS.length,20);
 assert.equal(new Set(CLASSROOM_DESKS.map(d=>d.x)).size,5);assert.equal(new Set(CLASSROOM_DESKS.map(d=>d.z)).size,4);
 CLASSROOM_DESKS.forEach((desk,i)=>{assert.equal(desk.id,`desk-${String(i+1).padStart(2,'0')}`);assert.equal(desk.row,Math.floor(i/5)+1);assert.equal(desk.column,i%5+1);assert.equal(Object.hasOwn(desk,'schoolId'),false);assert.ok(desk.bounds.maxX<-27);});
 assert.equal(CLASSROOM_DESKS[1].x-CLASSROOM_DESKS[0].x,5);assert.equal(CLASSROOM_DESKS[5].z-CLASSROOM_DESKS[0].z,6);
 assert.equal(CLASSROOM_ENTRIES.length,5);assert.equal(d.garage.classMarkers.length,5);assert.ok(CLASSROOM_DESKS.every(desk=>!Object.hasOwn(desk,'schoolId')));
 assert.ok(d.garage.classMarker?.isMesh);assert.equal(d.garage.classMarker.userData.nonBlocking,true);
});
check('pure occupancy resolver is stable for empty, partial, full, duplicate and unknown IDs',()=>{
 const ids=CLASSROOM_DESKS.map(d=>d.id);assert.equal(resolveFreeClassroomSeat(CLASSROOM_DESKS).id,'desk-01');
 for(let i=0;i<20;i++)assert.equal(resolveFreeClassroomSeat([...CLASSROOM_DESKS].reverse(),ids.filter((_,j)=>j!==i)).id,ids[i]);
 assert.equal(resolveFreeClassroomSeat(CLASSROOM_DESKS,ids),null);
 assert.equal(resolveFreeClassroomSeat(CLASSROOM_DESKS,['unknown','desk-01','desk-01']).id,'desk-02');assert.equal(resolveFreeClassroomSeat([],[]),null);
 const reversed=[...CLASSROOM_DESKS].reverse(),original=reversed.slice();resolveFreeClassroomSeat(reversed,ids.slice(0,3));assert.deepEqual(reversed,original,'resolving cannot reorder caller furniture');
});
check('every entrance uses the same lexical pool across empty, partial, old-column, random and full occupancy masks',()=>{
 const ids=CLASSROOM_DESKS.map(desk=>desk.id),all=(1<<ids.length)-1,masks=new Set([0,all,0x55555,0xaaaaa]);
 for(let i=0;i<=20;i++)masks.add((1<<i)-1);
 for(let i=0;i<20;i++)masks.add(all^(1<<i));
 for(let column=0;column<5;column++)masks.add(CLASSROOM_DESKS.reduce((mask,desk,index)=>mask|(desk.column===column+1?1<<index:0),0));
 let random=0x29cafe;for(let i=0;i<64;i++){random=(Math.imul(random,1664525)+1013904223)>>>0;masks.add(random&all);}
 let cases=0;
 for(const entry of CLASSROOM_ENTRIES)for(const mask of masks){
  const occupied=ids.filter((_,i)=>mask&(1<<i)),expected=ids.find((_,i)=>!(mask&(1<<i)))||null;
  const g=make({desks:[...CLASSROOM_DESKS].reverse()});g.setOccupiedSeatIds([...occupied,...occupied,'unknown']);
  assert.deepEqual(g.state.occupiedSeatIds,occupied);enter(g,entry);
  assert.equal(g.state.seatedId,expected,`${entry.id}: mask ${mask.toString(16)}`);
  assert.equal(g.state.seatedSchoolId,expected?entry.id:null);
  const events=g.events();assert.equal(events.filter(event=>event.type==='classroom-full').length,expected?0:1);
  if(expected){const seated=events.find(event=>event.type==='sit');assert.equal(seated.schoolId,entry.id);assert.equal(seated.id,expected);assert.equal(seated.rate,SCHOOL_CONFIG.find(s=>s.id===entry.id).rate);}
  cases++;
 }
 assert.ok(cases>500);console.log(`  ${cases} entrance/occupancy combinations`);
});
check('all 17 owned avatars use every free seat through every entrance and stand beside class (1700 cycles)',()=>{
 for(const spec of CHARACTER_CATALOG)for(const entry of CLASSROOM_ENTRIES)for(const desk of CLASSROOM_DESKS){const g=make();assert.ok(g.setCharacter(spec.id));g.setOccupiedSeatIds(CLASSROOM_DESKS.filter(v=>v.id!==desk.id).map(v=>v.id));enter(g,entry);
 assert.equal(g.state.seatedSchoolId,entry.id);assert.equal(g.state.seatedId,desk.id);assert.deepEqual(g.state.player,{x:desk.seat.x,z:desk.seat.z,heading:desk.seat.heading});assert.ok(!g.jump());
 assert.ok(g.stand());assert.equal(g.state.seatedId,null);assert.equal(g.state.seatedSchoolId,null);assert.deepEqual(g.state.player,entry.exit);assert.ok(g.canWalk(g.state.player.x,g.state.player.z));
 for(let i=0;i<180;i++)g.walk(1/60,{x:(i%2?.1:-.1),z:0});assert.equal(g.state.seatedId,null);assert.equal(g.state.characterId,spec.id);
 }
});
check('a full twenty-seat room emits one notice per entrance without teleport or spam and rearms after departure',()=>{
 for(const entry of CLASSROOM_ENTRIES){
  const g=make();g.setOccupiedSeatIds(CLASSROOM_DESKS.map(d=>d.id));enter(g,entry);assert.equal(g.state.seatedId,null);assert.equal(g.state.seatedSchoolId,null);assert.ok(Math.hypot(g.state.player.x-entry.x,g.state.player.z-entry.z)<2.4);
  const notices=g.events().filter(e=>e.type==='classroom-full');assert.equal(notices.length,1);assert.equal(notices[0].schoolId,entry.id);
  for(let i=0;i<180;i++)g.walk(1/60,{x:.01,z:0});assert.equal(g.events().length,0);
  g.setOccupiedSeatIds([]);for(let i=0;i<90;i++)g.walk(1/60,{x:.01,z:0});assert.equal(g.state.seatedId,null);
  g.state.player={...entry.exit};g.walk(.05,{});assert.equal(g.state.classroomArmed,true);enter(g,entry);assert.equal(g.state.seatedId,'desk-01');assert.equal(g.state.seatedSchoolId,entry.id);
 }
});
check('no direct per-desk seating, airborne seating, landing-frame seating, or idle activation',()=>{
 const g=make();for(const desk of CLASSROOM_DESKS){g.state.player={x:desk.x+2.5,z:desk.z,heading:0};g.state.walked=1;g.walk(1/60,{x:1,z:0});assert.equal(g.state.seatedId,null);}
 g.state.player={x:CLASSROOM_ENTRY.x,z:CLASSROOM_ENTRY.z,heading:0};g.state.walked=1;for(let i=0;i<90;i++)g.walk(1/60,{});assert.equal(g.state.seatedId,null);
 assert.ok(g.jump());while(g.state.jump.airborne){g.walk(1/60,{x:.01,z:0});assert.equal(g.state.seatedId,null);}assert.ok(g.state.landingCooldown>0);assert.equal(g.state.seatedId,null);
});
check('entry, stand exit and spawn are safe for largest grounded and jumping footprint',()=>{
 for(const id of['bacon','jandel']){const g=make();assert.ok(g.setCharacter(id));for(const p of[GAMEPLAY.spawn,...CLASSROOM_ENTRIES,...CLASSROOM_ENTRIES.map(e=>e.exit)]){g.state.player={...p,heading:0};assert.ok(g.canWalk(p.x,p.z));assert.ok(g.jump());g.returnToGarage();}}
});
check('geometry has20 tabletops, full roof over left wing and preserved cars/stands/fuel',()=>{
 const shell=d.garage.hangar.children[0],m=new THREE.Matrix4(),b=new THREE.Box3().setFromBufferAttribute(shell.geometry.attributes.position);
 assert.equal(shell.userData.partNames.filter(n=>/tabletop$/.test(n)).length,20);
 const at=n=>{shell.getMatrixAt(shell.userData.partNames.indexOf(n),m);return b.clone().applyMatrix4(m);};const roof=at('Garage roof');assert.ok(roof.min.x<=-58&&roof.max.x>=32);
 for(const desk of CLASSROOM_DESKS){const box=at(`Classroom ${desk.id} tabletop`);assert.ok(Math.abs(box.min.x-desk.bounds.minX)<1e-5);assert.ok(roof.min.x<=box.min.x&&roof.max.x>=box.max.x);}
 assert.equal(d.garage.vehicles.length,VEHICLE_CONFIG.length);assert.equal(VEHICLE_CONFIG.length,10);assert.equal(d.garage.stations.length,DELIVERY_CHECKPOINTS.length);assert.equal(d.garage.stands.length,17);
});
check('car fuel-empty resets class interaction without losing selected avatar',()=>{
 const g=make();g.setCharacter('jandel');enter(g);g.stand();g.state.cooldown=0;assert.ok(g.enter('pickup'));g.state.fuels.pickup=.001;g.drive(1,0,-40);
 assert.equal(g.state.mode,'walking');assert.equal(g.state.seatedId,null);assert.equal(g.state.seatedSchoolId,null);assert.equal(g.state.characterId,'jandel');assert.deepEqual(g.state.player,GAMEPLAY.spawn);assert.equal(g.state.classroomArmed,true);
});
check('native keyboard repeat after seating cannot immediately stand or keep moving',()=>{
 const a=createAppDom({startDriving:false}),d=a.debug;
 d.gameplay.state.player={x:CLASSROOM_ENTRY.x+3,z:CLASSROOM_ENTRY.z,heading:0};d.gameplay.state.walked=1;
 a.win.dispatch('keydown',{code:'KeyA',stopImmediatePropagation(){}});
 for(let i=0;i<400&&!d.gameplay.state.seatedId;i++)a.frame();assert.equal(d.gameplay.state.seatedId,'desk-01');
 for(let i=0;i<30;i++){a.win.dispatch('keydown',{code:'KeyA',repeat:true,stopImmediatePropagation(){}});a.frame();}assert.equal(d.gameplay.state.seatedId,'desk-01');
 a.win.dispatch('keyup',{code:'KeyA',stopImmediatePropagation(){}});a.win.dispatch('keydown',{code:'KeyA',stopImmediatePropagation(){}});a.frame();assert.equal(d.gameplay.state.seatedId,null);assert.deepEqual(d.gameplay.state.player,CLASSROOM_ENTRY.exit);a.dispose();
});
app.dispose();console.log(`Classroom entry: ${checks} checks passed; Node/Three only.`);
