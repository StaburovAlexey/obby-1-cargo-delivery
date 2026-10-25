import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import {createDriftEffects} from '../dist/drift-effects.js';

const ids=['standard','neon-purple','rainbow','fire','ice','lightning','neon-blue','neon-green'];
const metadata={wheelContacts:[
 {name:'rear-left',front:false,center:[-1,.6,2],halfWidth:.3},
 {name:'rear-right',front:false,center:[1,.6,2],halfWidth:.3},
]};
function fixture(){
 const effects=createDriftEffects(THREE,{height:()=>-100});
 const state={x:0,z:0,heading:0,velocityX:5,velocityZ:18,linearSpeed:19,driftIntensity:1,
  wheelContacts:metadata.wheelContacts.map((wheel,i)=>({name:wheel.name,grounded:true,point:{x:i?1:-1,y:4,z:2},normal:{x:0,y:1,z:0}}))};
 return {effects,state,step(x,z,options={}){
  state.x=x;state.z=z;
  state.wheelContacts.forEach((contact,i)=>{contact.point.x=x+(i?1:-1);contact.point.z=z+2;});
  effects.update(.05,state,{metadata,...options});
 },drive(frames=8){for(let i=0;i<frames;i++)this.step(i*.1,i*.4);}};
}
function smokePositions(effects){
 const result=[],matrix=new THREE.Matrix4();
 for(let i=0;i<effects.smokeCount;i++){effects.smoke.getMatrixAt(i,matrix);result.push(...matrix.elements);}
 return result;
}

test('track selection validates IDs without disturbing live marks or smoke on a repeated/invalid selection',()=>{
 const f=fixture(),e=f.effects;
 try{
  assert.equal(typeof e.setTrackStyle,'function');
  assert.equal(e.trackStyleId,'standard');f.drive();
  const marks=e.skidCount,smoke=e.smokeCount,positions=smokePositions(e);
  assert.ok(marks>0&&smoke>0);
  for(const id of ['standard','unknown',undefined,null,'__proto__']){
   assert.equal(e.setTrackStyle(id),id==='standard');
   assert.equal(e.trackStyleId,'standard');assert.equal(e.skidCount,marks);assert.equal(e.smokeCount,smoke);
   assert.deepEqual(smokePositions(e),positions);
  }
 }finally{e.dispose();}
});

test('every catalog entry selects a valid track style with a stable localized icon',async()=>{
 const catalog=await import('../dist/vehicle-track-catalog.js').catch(()=>null);
 assert.ok(catalog,'track catalog exists');
 assert.equal(catalog.DEFAULT_VEHICLE_TRACK_ID,'standard');
 assert.deepEqual(catalog.VEHICLE_TRACK_STYLES.map(style=>style.id),ids);
 assert.ok(Object.isFrozen(catalog.VEHICLE_TRACK_STYLES));
 const e=createDriftEffects(THREE);
 try{for(const id of ids){
  const style=catalog.getVehicleTrackStyle(id);
  assert.ok(Object.isFrozen(style)&&Object.isFrozen(style.name));assert.ok(style.name.ru&&style.name.en);
  assert.ok(style.iconUrl.endsWith(`/assets/tracks/${id}.webp`));
  assert.equal(e.setTrackStyle(id),true);assert.equal(e.trackStyleId,id);
 }}finally{e.dispose();}
 for(const id of ['unknown',undefined,null,'__proto__'])assert.equal(catalog.getVehicleTrackStyle(id),null);
});

test('decorative tracks keep the standard rear contact geometry and never change smoke emission or telemetry',()=>{
 const standard=fixture();standard.drive();
 try{for(const id of ids){
  const f=fixture(),e=f.effects;
  try{
   assert.equal(e.setTrackStyle(id),true);const before=structuredClone(f.state);f.drive();
   assert.equal(f.state.linearSpeed,before.linearSpeed);assert.equal(f.state.driftIntensity,before.driftIntensity);
   assert.deepEqual(e.skids.geometry.attributes.position.array,standard.effects.skids.geometry.attributes.position.array,id);
   assert.deepEqual(smokePositions(e),smokePositions(standard.effects),id);
   assert.equal(e.skidCount,standard.effects.skidCount);assert.equal(e.group.children.length,2);
   for(const attribute of Object.values(e.skids.geometry.attributes))assert.ok(attribute.array.every(Number.isFinite),id);
  }finally{e.dispose();}
 }}finally{standard.effects.dispose();}
});

test('pattern distance follows metres and the joined ribbon corners continuously through turns',()=>{
 const f=fixture(),e=f.effects;
 try{
  assert.equal(e.setTrackStyle('rainbow'),true);
  f.step(0,0);f.step(0,.4);f.step(.4,.4);f.step(.4,.8);
  const uv=e.skids.geometry.attributes.uv,position=e.skids.geometry.attributes.position;
  assert.ok(uv,'pattern UVs exist');assert.equal(e.skidCount,6);
  for(const [segment,start,end] of [[0,0,.4],[1,0,.4],[2,.4,.8],[3,.4,.8],[4,.8,1.2],[5,.8,1.2]]){
   for(let corner=0;corner<4;corner++){
    assert.equal(uv.getX(segment*4+corner),corner%2);
    assert.ok(Math.abs(uv.getY(segment*4+corner)-(corner<2?start:end))<1e-6);
   }
   if(segment>=2)for(let side=0;side<2;side++){
    const previous=(segment-2)*4+2+side,current=segment*4+side;
    assert.deepEqual([position.getX(current),position.getY(current),position.getZ(current)],[position.getX(previous),position.getY(previous),position.getZ(previous)]);
   }
  }
 }finally{e.dispose();}
});

test('changing track style clears only tracks and the next segment starts a fresh pattern',()=>{
 const f=fixture(),e=f.effects;
 try{
  f.drive();const count=e.smokeCount,positions=smokePositions(e),smokeMaterial=e.smoke.material;
  assert.equal(e.setTrackStyle('fire'),true);assert.equal(e.skidCount,0);assert.equal(e.skids.geometry.drawRange.count,0);
  assert.equal(e.smokeCount,count);assert.deepEqual(smokePositions(e),positions);assert.equal(e.smoke.material,smokeMaterial);assert.equal(e.group.visible,true);
  f.step(.8,3.2);assert.equal(e.skidCount,0);f.step(.9,3.6);assert.equal(e.skidCount,2);
  assert.equal(e.skids.geometry.attributes.uv.getY(0),0);
  const marks=e.skidCount,uv=e.skids.geometry.attributes.uv.array.slice();
  e.setSmokeStyle('hearts');assert.equal(e.skidCount,marks);assert.deepEqual(e.skids.geometry.attributes.uv.array,uv);assert.equal(e.trackStyleId,'fire');
 }finally{e.dispose();}
});

test('teleports, wheel support gaps, pauses and replacement wheel metadata break the patterned ribbon',()=>{
 for(const interruption of ['teleport','contact-jump','airborne','pause','metadata']){
  const f=fixture(),e=f.effects;
  try{
   e.setTrackStyle('lightning');f.step(0,0);f.step(0,.4);const before=e.skidCount;
   let nextX=0,nextZ=.8;
   if(interruption==='teleport'){nextX=30;f.step(nextX,nextZ);}
   if(interruption==='contact-jump'){f.state.wheelContacts.forEach(c=>c.point.x+=7);e.update(.05,f.state,{metadata});}
   if(interruption==='airborne'){f.state.wheelContacts.forEach(c=>c.grounded=false);f.step(nextX,nextZ);f.state.wheelContacts.forEach(c=>c.grounded=true);}
   if(interruption==='pause')f.step(nextX,nextZ,{enabled:false});
   if(interruption==='metadata')f.step(nextX,nextZ,{metadata:{wheelContacts:metadata.wheelContacts.map(w=>({...w}))}});
   assert.equal(e.skidCount,before,interruption);
   if(interruption==='contact-jump'){
    f.state.wheelContacts.forEach(c=>c.point.x-=7);e.update(.05,f.state,{metadata});assert.equal(e.skidCount,before);
    // A rejected long segment becomes the next anchor, matching standard trails.
    f.step(nextX,nextZ+1.2);assert.equal(e.skidCount,before+2);
    assert.equal(e.skids.geometry.attributes.uv.getY(before*4),0);continue;
   }
   f.step(nextX,nextZ+1.2);assert.equal(e.skidCount,before,interruption);
   f.step(nextX,nextZ+1.6);assert.equal(e.skidCount,before+2,interruption);
   const uv=e.skids.geometry.attributes.uv;assert.equal(uv.getY(before*4),0,interruption);
  }finally{e.dispose();}
 }
});

test('style selection configures distinct patterns while reusing the mesh, geometry and custom material',()=>{
 const e=createDriftEffects(THREE),mesh=e.skids,geometry=mesh.geometry,standard=mesh.material;
 try{
  let custom=null;
  for(const [id,pattern,color] of [
   ['neon-purple',1,0xb84dff],['rainbow',2,0xffffff],['fire',3,0xff6518],
   ['ice',4,0x6ddcff],['lightning',5,0x668cff],['neon-blue',1,0x248cff],['neon-green',1,0x48ff5c],
  ]){
   assert.equal(e.setTrackStyle(id),true);custom??=mesh.material;
   assert.equal(e.skids,mesh);assert.equal(mesh.geometry,geometry);assert.equal(mesh.material,custom);
   assert.equal(custom.uniforms.pattern.value,pattern);assert.equal(custom.uniforms.trackColor.value.getHex(),color);
  }
  assert.equal(e.setTrackStyle('standard'),true);assert.equal(mesh.material,standard);
  let originalDisposed=0,customDisposed=0;
  standard.addEventListener('dispose',()=>originalDisposed++);custom.addEventListener('dispose',()=>customDisposed++);
  e.dispose();assert.equal(originalDisposed,1);assert.equal(customDisposed,1);
 }finally{e.dispose();}
});

test('no track style can emit without the existing rear support and drift conditions',()=>{
 for(const id of ids)for(const scenario of ['no-contacts','front-only','airborne','slow','straight','disabled','falling']){
  const f=fixture(),e=f.effects;
  try{
   e.setTrackStyle(id);
   if(scenario==='no-contacts')f.state.wheelContacts=[];
   if(scenario==='front-only')f.state.wheelContacts.forEach(c=>c.name=c.name.replace('rear','front'));
   if(scenario==='airborne')f.state.wheelContacts.forEach(c=>c.grounded=false);
   if(scenario==='slow')f.state.linearSpeed=3;
   if(scenario==='straight')f.state.driftIntensity=.08;
   for(let i=0;i<8;i++)f.step(i*.1,i*.4,{enabled:scenario!=='disabled',grounded:scenario!=='falling'});
   assert.equal(e.skidCount,0,`${id}: ${scenario}`);assert.equal(e.smokeCount,0,`${id}: ${scenario}`);
  }finally{e.dispose();}
 }
});

test('all styles retain real banked contact planes, fixed capacity, lifetime, reset and disposal',()=>{
 for(const id of ids){
  const f=fixture(),e=f.effects;
  try{
   e.setTrackStyle(id);const mesh=e.skids,geometry=mesh.geometry;
   f.state.wheelContacts=[{name:'rear-left',grounded:true,point:{x:-1,y:4,z:2},normal:{x:.6,y:.8,z:0}}];
   for(let i=0;i<1100;i++){f.state.z=i*.1;f.state.wheelContacts[0].point.z=2+i*.1;e.update(.01,f.state,{metadata});}
   assert.equal(e.skidCount,1024,id);assert.equal(e.skidCapacity,1024);assert.equal(e.skids,mesh);assert.equal(e.skids.geometry,geometry);
   assert.equal(geometry.drawRange.count,1024*6);assert.ok(geometry.index.array.every(index=>index<4096));
   const p=geometry.attributes.position;
   for(let vertex=0;vertex<p.count;vertex++)assert.ok(Math.abs(.6*(p.getX(vertex)+1)+.8*(p.getY(vertex)-4)-.02)<1e-5,id);
   assert.ok(geometry.attributes.uv.array.every(Number.isFinite));
   for(let i=0;i<521;i++)e.update(.05,f.state,{enabled:false,metadata});
   assert.equal(e.skidCount,0);assert.equal(geometry.drawRange.count,0);
   f.drive();e.clear();assert.equal(e.trackStyleId,id);assert.equal(e.skidCount,0);assert.equal(e.smokeCount,0);assert.equal(e.group.visible,false);
   let geometryDisposed=0,materialDisposed=0;
   geometry.addEventListener('dispose',()=>geometryDisposed++);e.skids.material.addEventListener('dispose',()=>materialDisposed++);
   e.dispose();e.dispose();assert.equal(geometryDisposed,1);assert.equal(materialDisposed,1);assert.equal(e.setTrackStyle('standard'),false);
  }finally{e.dispose();}
 }
});
