import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import {createDriftEffects} from '../dist/drift-effects.js';
import {createWheelParticles} from '../dist/wheel-particles.js';
import {routePointAtProgress} from '../dist/road-layout.js';

const metadata={wheelContacts:[
 {name:'front-left',front:true,center:[-1,0,-2]},
 {name:'front-right',front:true,center:[1,0,-2]},
 {name:'rear-left',front:false,center:[-1,0,2],halfWidth:.3},
 {name:'rear-right',front:false,center:[1,0,2],halfWidth:.3},
]};
const support=(name,point,normal={x:0,y:1,z:0})=>({name,front:name.startsWith('front'),grounded:true,point,normal});
const stateAt=(extra={})=>({x:0,z:0,heading:0,velocityX:4,velocityZ:-18,linearSpeed:19,driftIntensity:1,pathDistance:10,...extra});
function positions(mesh,count=mesh.count){
 const result=[],matrix=new THREE.Matrix4();
 for(let i=0;i<count;i++){mesh.getMatrixAt(i,matrix);result.push(new THREE.Vector3().setFromMatrixPosition(matrix));}
 return result;
}
function stepDrift(effects,state,frames=8){
 for(let i=0;i<frames;i++){
  state.z-=.1;
  for(const contact of state.wheelContacts||[])if(contact.point)contact.point.z-=.1;
  effects.update(.05,state,{metadata});
 }
}

test('explicit airborne wheel contacts cannot emit smoke or skids even with the default grounded option',()=>{
 for(const wheelContacts of [[],metadata.wheelContacts.map(({name,front})=>({name,front,grounded:false}))]){
  const effects=createDriftEffects(THREE);
  try{stepDrift(effects,stateAt({wheelContacts}));assert.equal(effects.smokeCount,0);assert.equal(effects.skidCount,0);}
  finally{effects.dispose();}
 }
});

test('standard and decorative smoke originate only from the supported rear contact and its normal',()=>{
 for(const style of ['standard','hearts']){
  const effects=createDriftEffects(THREE,{height:()=>-100});effects.setSmokeStyle(style);
  const state=stateAt({wheelContacts:[support('rear-right',{x:12,y:9,z:22},{x:.6,y:.8,z:0}),{name:'rear-left',front:false,grounded:false}]});
  try{
   for(let i=0;i<8&&effects.smokeCount===0;i++)effects.update(.05,state,{metadata});
   const born=positions(effects.smoke);assert.ok(born.length>0);
   for(const p of born){assert.ok(Math.abs(p.x-12.132)<1e-4);assert.ok(Math.abs(p.y-9.176)<1e-4);assert.ok(Math.abs(p.z-22)<1e-4);}
  }finally{effects.dispose();}
 }
});

test('banked skid ribbon corners follow the physical contact plane above unrelated route ground',()=>{
 const effects=createDriftEffects(THREE,{height:()=>-100}),normal={x:.6,y:.8,z:0};
 const state=stateAt({wheelContacts:[support('rear-left',{x:5,y:12,z:3},normal)]});
 try{
  stepDrift(effects,state,3);assert.equal(effects.skidCount,2,'one strip per supported rear tire per move');
  const points=effects.skids.geometry.attributes.position;
  for(let i=0;i<8;i++)assert.ok(Math.abs(.6*(points.getX(i)-5)+.8*(points.getY(i)-12)-.02)<1e-4,'every corner lies just above the bank plane');
  assert.notEqual(points.getY(0),points.getY(1),'ribbon width follows the bank');
  const before=effects.skidCount;state.wheelContacts=[];stepDrift(effects,state,2);
  state.wheelContacts=[support('rear-left',{x:5,y:12,z:1},normal)];stepDrift(effects,state,1);
  assert.equal(effects.skidCount,before,'landing starts a new strip without joining an airborne gap');
 }finally{effects.dispose();}
});

test('front tire support cannot produce rear smoke or skid trails',()=>{
 const effects=createDriftEffects(THREE);
 try{stepDrift(effects,stateAt({wheelContacts:[support('front-left',{x:3,y:2,z:1})]}));assert.equal(effects.smokeCount,0);assert.equal(effects.skidCount,0);}
 finally{effects.dispose();}
});

test('dirt uses supported wheel hit points and normals, including a front tire with no rear support',()=>{
 const route=routePointAtProgress(3800),particles=createWheelParticles(THREE,{groundHeight:()=>100});
 const state=stateAt({x:route.x,z:route.z,wheelContacts:[support('front-right',{x:route.x+10,y:20,z:route.z+4},{x:.6,y:.8,z:0})]});
 try{
  particles.update(.05,state,true);assert.equal(particles.count,2);
  for(const p of positions(particles.mesh)){assert.ok(Math.abs(p.x-(route.x+10.096))<.001);assert.ok(Math.abs(p.y-20.128)<.001);assert.ok(Math.abs(p.z-(route.z+4))<.001);}
  particles.update(.05,state,false);assert.equal(particles.count,2,'live dirt uses its birth contact plane instead of route height');
  assert.ok(positions(particles.mesh).every(p=>p.y>20.128),'normal lift moves dirt away from the hit plane');
 }finally{particles.dispose();}
});

test('airborne dirt emits nothing and all contact effects retain their bounded pools under sustained use',()=>{
 const route=routePointAtProgress(3800),particles=createWheelParticles(THREE),effects=createDriftEffects(THREE);
 const state=stateAt({x:route.x,z:route.z,wheelContacts:[]});
 try{
  for(let i=0;i<10;i++)particles.update(.05,state,true);assert.equal(particles.count,0);
  state.wheelContacts=[support('rear-left',{x:route.x,y:8,z:route.z})];
  const smoke=effects.smoke,skids=effects.skids,dirt=particles.mesh;
  for(let i=0;i<1500;i++){
   stepDrift(effects,state,1);particles.update(.05,state,true);
   assert.ok(effects.smokeCount<=72&&effects.skidCount<=1024&&particles.count<=96);
  }
  assert.equal(effects.smoke,smoke);assert.equal(effects.skids,skids);assert.equal(particles.mesh,dirt);
  assert.ok(effects.skidCount>0&&particles.count>0);
 }finally{particles.dispose();effects.dispose();}
});
