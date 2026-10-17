import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {createDriftEffects} from '../dist/drift-effects.js';

const car=z=>({x:0,z,heading:0,velocityX:5,velocityZ:-18,linearSpeed:19,driftIntensity:.8});
test('sliding rear tires produce bounded smoke and surface-aligned skid marks',()=>{
 const height=(x,z)=>x*.02-z*.05,e=createDriftEffects(THREE,{height});
 try{
  for(let i=0;i<180;i++)e.update(1/60,car(-i*.3),{enabled:true});
  assert.ok(e.smokeCount>0);assert.ok(e.skidCount>0);assert.ok(e.smokeCount<=e.smokeCapacity);assert.ok(e.skidCount<=e.skidCapacity);
  const positions=e.skids.geometry.attributes.position;
  for(let i=0;i<e.skidCount*4;i++)assert.ok(Math.abs(positions.getY(i)-height(positions.getX(i),positions.getZ(i))-.02)<1e-5);
  for(let i=180;i<2000;i++)e.update(1/60,car(-i*.3),{enabled:true});assert.ok(e.skidCount<=e.skidCapacity);
 }finally{e.dispose();}
});
test('ordinary rolling or lost ground contact creates no smoke or tire tracks',()=>{
 const e=createDriftEffects(THREE);
 try{
  for(let i=0;i<30;i++)e.update(1/60,{...car(-i*.3),driftIntensity:0},{enabled:true});assert.equal(e.smokeCount,0);assert.equal(e.skidCount,0);
  for(let i=0;i<30;i++)e.update(1/60,car(-i*.3),{enabled:true,grounded:false});assert.equal(e.smokeCount,0);assert.equal(e.skidCount,0);
 }finally{e.dispose();}
});
test('teleports do not draw joining streaks; clear and dispose remove all effects',()=>{
 const e=createDriftEffects(THREE);
 for(let i=0;i<20;i++)e.update(1/60,car(-i*.3),{enabled:true});const before=e.skidCount;
 e.update(1/60,car(-1000),{enabled:true});assert.equal(e.skidCount,before);
 e.clear();assert.equal(e.smokeCount,0);assert.equal(e.skidCount,0);assert.equal(e.group.visible,false);
 let disposed=0;e.skids.geometry.addEventListener('dispose',()=>disposed++);e.dispose();e.dispose();assert.equal(disposed,1);
});
