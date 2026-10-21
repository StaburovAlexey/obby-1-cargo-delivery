import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import {createDriftEffects} from '../dist/drift-effects.js';

const ids=['standard','flowers','hearts','skulls','coins','smileys'];
test('ground skid decals blend before every smoke style while solid objects still occlude smoke',()=>{
 const effects=createDriftEffects(THREE);
 try{
  for(const id of ids){
   effects.setSmokeStyle(id);
   assert.ok(effects.skids.renderOrder<effects.smoke.renderOrder,`${id}: tracks cannot blend over airborne particles`);
   assert.equal(effects.smoke.material.depthTest,true,'cars and terrain retain occlusion');
   assert.equal(effects.smoke.material.depthWrite,false,'smoke does not hide other transparent particles');
   assert.equal(effects.skids.material.depthTest,true,'tracks stay behind solid objects');
  }
 }finally{effects.dispose();}
});
const metadata={wheelContacts:[
 {front:true,center:[-1,0,-2]}, {front:true,center:[1,0,-2]},
 {front:false,center:[-2,0,3],halfWidth:.35}, {front:false,center:[2,0,3],halfWidth:.35},
]};
function fixture(){
 const effects=createDriftEffects(THREE),camera=new THREE.PerspectiveCamera();
 camera.quaternion.setFromEuler(new THREE.Euler(-.35,.6,0));
 const state={x:0,z:0,heading:0,velocityX:4,velocityZ:-18,linearSpeed:19,driftIntensity:.8};
 return {effects,camera,state,step(frames=30,options={}){
  for(let i=0;i<frames;i++){
   state.x+=.1;state.z-=.3;const before={...state};
   effects.update(1/60,state,{metadata,camera,...options});
   assert.deepEqual(state,before,'effects never change driving telemetry');
  }
 }};
}
function scaleAt(effects,index=0){
 const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3();
 effects.smoke.getMatrixAt(index,matrix);matrix.decompose(position,quaternion,scale);
 return {position,quaternion,scale};
}
function atlasPixel(texture,tile,x,y){
 const {data,width,height}=texture.image,size=width/5;
 const px=Math.max(0,Math.min(size-1,Math.floor((x+1)*.5*size)));
 const py=Math.max(0,Math.min(height-1,Math.floor((y+1)*.5*height)));
 return [...data.slice((py*width+tile*size+px)*4,(py*width+tile*size+px)*4+4)];
}

test('valid style selection clears old smoke, preserves skids, and survives clear',()=>{
 const f=fixture(),{effects}=f;
 try{
  assert.equal(effects.smokeStyleId,'standard');f.step();
  const oldCount=effects.smokeCount,skidCount=effects.skidCount;
  const skidPositions=effects.skids.geometry.attributes.position.array.slice();
  assert.ok(oldCount>0&&skidCount>0);
  assert.equal(effects.setSmokeStyle('flowers'),true);
  assert.equal(effects.smokeStyleId,'flowers');assert.equal(effects.smokeCount,0);
  assert.equal(effects.smoke.count,0);assert.equal(effects.skidCount,skidCount);
  assert.deepEqual(effects.skids.geometry.attributes.position.array,skidPositions);
  f.step(10);assert.ok(effects.smokeCount>0);
  const count=effects.smokeCount;
  assert.equal(effects.setSmokeStyle('flowers'),true);assert.equal(effects.smokeCount,count,'repeat selection keeps live particles');
  for(const invalid of ['',null,undefined,'__proto__','glitter']){
   assert.equal(effects.setSmokeStyle(invalid),false);assert.equal(effects.smokeStyleId,'flowers');assert.equal(effects.smokeCount,count);
  }
  effects.clear();assert.equal(effects.smokeStyleId,'flowers');assert.equal(effects.skidCount,0);
  f.step(10);assert.ok(effects.smokeCount>0);
 }finally{effects.dispose();}
});

test('all custom styles reuse one compact camera-facing pool at the rear contacts',()=>{
 const standard=fixture();
 try{
  standard.step(50);const standardCount=standard.effects.smokeCount;
  for(const id of ids.slice(1)){
   const f=fixture(),{effects}=f;
   try{
    assert.equal(effects.setSmokeStyle(id),true);f.step(50);
    assert.ok(effects.smokeCount>standardCount,`${id}: fuller decorative particles`);
    assert.equal(effects.smokeCapacity,72);assert.equal(effects.group.children.length,2);
    assert.ok(!Array.isArray(effects.smoke.material),'one smoke material');
    const particle=scaleAt(effects);
    assert.ok(particle.scale.x>.2&&particle.scale.x<1.1,`${id}: compact varied sprite`);
    assert.ok(particle.quaternion.angleTo(f.camera.quaternion)<.001,`${id}: faces camera`);
    effects.clear();f.state.x=f.state.z=0;
    const pose={position:new THREE.Vector3(10,0,20),quaternion:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2)};
    for(let frame=0;frame<30&&effects.smokeCount===0;frame++)f.step(1,{pose});
    assert.ok(effects.smokeCount>0);
    const origin=scaleAt(effects).position;
    assert.ok(Math.abs(origin.x-13)<.05,`${id}: transformed rear axle`);
    assert.ok(Math.abs(Math.abs(origin.z-20)-2)<.05,`${id}: rear wheel side`);
    effects.clear();f.step(30,{grounded:false});assert.equal(effects.smokeCount,0);assert.equal(effects.skidCount,0);
   }finally{effects.dispose();}
  }
 }finally{standard.effects.dispose();}
});

test('procedural atlas contains recognizable colored motifs without a document or fonts',()=>{
 const {effects}=fixture();
 try{
  effects.setSmokeStyle('flowers');const atlas=effects.smoke.material.uniforms.cloud.value;
  assert.equal(atlas.isDataTexture,true);assert.equal(atlas.image.width/atlas.image.height,5);
  const flowerCenter=atlasPixel(atlas,0,0,0),flowerPetal=atlasPixel(atlas,0,.46,0);
  assert.ok(flowerCenter[0]>220&&flowerCenter[1]>180&&flowerCenter[2]<150,'yellow flower center');
  assert.ok(flowerPetal[0]>150&&flowerPetal[2]>140,'pink or lilac petal');
  assert.equal(atlasPixel(atlas,1,0,.65)[3],0,'heart top notch');
  const heart=atlasPixel(atlas,1,.25,.25);assert.ok(heart[0]>200&&heart[0]>heart[1]*1.3,'pink red heart');
  const skull=atlasPixel(atlas,2,0,.35),eye=atlasPixel(atlas,2,.22,.15);
  assert.ok(skull.slice(0,3).every(v=>v>210),'white skull');assert.ok(eye.slice(0,3).every(v=>v<70),'black skull eye socket');
  const coin=atlasPixel(atlas,3,.46,0),star=atlasPixel(atlas,3,0,0);
  assert.ok(coin[0]>200&&coin[1]>100&&coin[2]<100,'gold coin');assert.ok(star[1]>180,'bright coin star');
  const smiley=atlasPixel(atlas,4,0,.38),smileEye=atlasPixel(atlas,4,.23,.2),mouth=atlasPixel(atlas,4,0,-.33);
  assert.ok(smiley[0]>220&&smiley[1]>170&&smiley[2]<120,'yellow smiley');
  assert.ok(smileEye.slice(0,3).every(v=>v<70)&&mouth.slice(0,3).every(v=>v<70),'smiley eyes and mouth');
  for(let tile=0;tile<5;tile++)assert.equal(atlasPixel(atlas,tile,.96,.96)[3],0,'transparent tile margins');
 }finally{effects.dispose();}
});

test('style changes reuse atlas and material, restore standard cloud, and dispose each resource once',()=>{
 const {effects}=fixture(),material=effects.smoke.material,standard=material.uniforms.cloud.value;
 let standardDisposals=0,atlasDisposals=0,materialDisposals=0;
 standard.addEventListener('dispose',()=>standardDisposals++);material.addEventListener('dispose',()=>materialDisposals++);
 try{
  effects.setSmokeStyle('flowers');const atlas=material.uniforms.cloud.value;
  atlas.addEventListener('dispose',()=>atlasDisposals++);
  const pixels=atlas.image.data.slice();
  for(const [id,index] of [['hearts',1],['skulls',2],['coins',3],['smileys',4],['flowers',0]]){
   effects.setSmokeStyle(id);assert.equal(effects.smoke.material,material);assert.equal(material.uniforms.cloud.value,atlas);
   assert.equal(material.uniforms.spriteIndex.value,index,`${id}: samples its own atlas tile`);
   assert.equal(material.uniforms.spriteColumns.value,5);assert.equal(material.uniforms.spriteMode.value,1);
  }
  effects.setSmokeStyle('standard');assert.equal(material.uniforms.cloud.value,standard);
  assert.equal(material.uniforms.spriteIndex.value,0);assert.equal(material.uniforms.spriteColumns.value,1);assert.equal(material.uniforms.spriteMode.value,0);
  assert.equal(standard.image.width,32);assert.equal(standard.image.height,32);
  assert.equal(standard.image.data[3],0);assert.equal(standard.image.data[(15*32+15)*4+3],236);
  assert.deepEqual(atlas.image.data,pixels,'atlas generated once and never rewritten');
  const independent=fixture();
  try{independent.effects.setSmokeStyle('smileys');assert.deepEqual(independent.effects.smoke.material.uniforms.cloud.value.image.data,pixels,'deterministic atlas');}
  finally{independent.effects.dispose();}
 }finally{effects.dispose();effects.dispose();}
 assert.equal(standardDisposals,1);assert.equal(atlasDisposals,1);assert.equal(materialDisposals,1);
});
