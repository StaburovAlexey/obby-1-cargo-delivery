import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import {createDriftEffects} from '../dist/drift-effects.js';

const ids=['flowers','hearts','skulls','coins','smileys'];
const metadata={wheelContacts:[{front:true,center:[-1,0,-2]},{front:true,center:[1,0,-2]},
 {front:false,center:[-2,0,3],halfWidth:.35},{front:false,center:[2,0,3],halfWidth:.35}]};
const state={x:0,z:0,heading:0,velocityX:0,velocityZ:-18,linearSpeed:18,driftIntensity:1};
function particles(effects){
 const result=[],matrix=new THREE.Matrix4(),position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3();
 for(let i=0;i<effects.smokeCount;i++){
  effects.smoke.getMatrixAt(i,matrix);matrix.decompose(position,quaternion,scale);
  result.push({x:position.x,y:position.y,z:position.z,size:scale.x,alpha:effects.smoke.geometry.attributes.opacity.getX(i)});
 }
 return result;
}
const range=values=>Math.max(...values)-Math.min(...values);
function firstWave(effects){
 for(let frame=0;frame<10&&effects.smokeCount===0;frame++)effects.update(.05,state,{metadata});
 return particles(effects);
}

test('a decorative emission wave creates a group at both rear tire contacts',()=>{
 for(const id of ids){
  const effects=createDriftEffects(THREE);
  try{
   effects.setSmokeStyle(id);const born=firstWave(effects);
   assert.equal(born.length,8,`${id}: eight particles in the first wave`);
   assert.equal(born.filter(p=>Math.abs(p.x+2)<.001).length,4,`${id}: left contact group`);
   assert.equal(born.filter(p=>Math.abs(p.x-2)<.001).length,4,`${id}: right contact group`);
   assert.ok(born.every(p=>Math.abs(p.z-3)<.001&&Math.abs(p.y-.22)<.001),`${id}: both groups start on rear patches`);
  }finally{effects.dispose();}
 }
});

test('particles in the same wave visibly differ in size, horizontal and upward speed, and fading age',()=>{
 const effects=createDriftEffects(THREE);
 try{
  effects.setSmokeStyle('hearts');const born=firstWave(effects);
  assert.ok(range(born.map(p=>p.size))>.3,'broad size range within one burst');
  assert.ok(Math.min(...born.map(p=>p.size))<.4&&Math.max(...born.map(p=>p.size))>.6,'small and large sprites coexist');
  effects.update(.05,state,{metadata,enabled:false});const moved=particles(effects);
  const vx=moved.map((p,i)=>(p.x-born[i].x)/.05),vy=moved.map((p,i)=>(p.y-born[i].y)/.05),vz=moved.map((p,i)=>(p.z-born[i].z)/.05);
  assert.ok(range(vx)>1,'independent horizontal dispersal');assert.ok(range(vz)>1,'independent depth dispersal');
  assert.ok(range(vy)>.7,'independent upward speeds');
  for(let frame=0;frame<9;frame++)effects.update(.05,state,{metadata,enabled:false});
  const aged=particles(effects);assert.equal(aged.length,8,'birth group is still alive after half a second');
  assert.ok(range(aged.map(p=>p.alpha))>.2,'different lifetimes produce different fade ages');
  assert.ok(aged.every(p=>p.alpha>0&&p.alpha<=.95),'all particles fade smoothly in the existing material');
 }finally{effects.dispose();}
});

test('sustained maximum bursts stay within the existing pool and reuse the mesh, material and atlas',()=>{
 const effects=createDriftEffects(THREE);
 try{
  effects.setSmokeStyle('coins');const mesh=effects.smoke,material=mesh.material,texture=material.uniforms.cloud.value;
  let maximum=0;
  for(let frame=0;frame<300;frame++){
   effects.update(.05,state,{metadata});maximum=Math.max(maximum,effects.smokeCount);
   assert.ok(effects.smokeCount<=72,'live particles never exceed the fixed pool');
   assert.equal(effects.smoke,mesh);assert.equal(mesh.material,material);assert.equal(material.uniforms.cloud.value,texture);
  }
  assert.ok(maximum>=60,'high intensity produces a full decorative trail');
  assert.equal(effects.group.children.length,2);assert.equal(effects.smokeCapacity,72);
 }finally{effects.dispose();}
});
