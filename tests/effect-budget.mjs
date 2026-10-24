import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
import {createBiomeWeather} from '../dist/biome-weather.js';
import {createDriftEffects} from '../dist/drift-effects.js';

const car=z=>({x:0,z,heading:0,velocityX:5,velocityZ:-18,linearSpeed:19,driftIntensity:.8});
const camera=()=>{const c=new THREE.PerspectiveCamera(53,390/844,.5,1800);c.position.set(123,12,-30);c.lookAt(123,1.7,-46);c.updateMatrixWorld();return c;};
const hashWeather=weather=>{const h=createHash('sha256');for(const p of weather.group.children){for(const name of ['position','life','haze'])h.update(new Uint8Array(p.geometry.getAttribute(name).array.buffer));h.update(JSON.stringify({draw:p.geometry.drawRange,weight:p.material.uniforms.blendWeight.value,kind:p.material.uniforms.kind.value}));}return h.digest('hex');};

test('high weather quality preserves original seeded motion, fades and biome transitions',()=>{
 const weather=createBiomeWeather(THREE),view=camera();
 try{
  assert.equal(typeof weather.setQuality,'function');weather.setQuality({weatherScale:1,hazeScale:1});
  // Snapshots captured from the approved dirty-checkout baseline before this change.
  for(const [biome,want] of [
   ['forest','a20c3c121f12d6bdd1239c93d2cbfd3110b4a9ca9ecbbe2158a31b9ceca695f3'],
   ['desert','9c912c1d50d071bffc16726738679cad2c31e425d8a236f67deadb0d75cde893'],
   ['snow','f30c6501fd16dba758aac8d4d128b9a6a800741baede5ee26490f09b70ba0dc4'],
   ['volcanic','74c2d7bc5bc923a12829b31436304e8528d9e106f89a30200a09e9571c5ba0fa'],
  ]){for(let frame=0;frame<65;frame++)weather.update(1/60,{biome,camera:view});assert.equal(hashWeather(weather),want,biome);}
 }finally{weather.dispose();}
});

test('weather quality reduces both rendered and simulated slots without reallocating the pool',()=>{
 const weather=createBiomeWeather(THREE),view=camera();
 try{
  assert.equal(typeof weather.setQuality,'function');weather.update(.1,{biome:'snow',camera:view});
  const p=weather.group.children[0],g=p.geometry,buffers=['position','life','haze'].map(name=>g.getAttribute(name).array),index=g.index;
  for(const [weatherScale,hazeScale,want,wantHaze] of [[.65,.72,501,17],[.4,.55,311,13],[.25,.4,196,10],[1,1,768,24]]){
   const fog={...weather.fog},weight=p.material.uniforms.blendWeight.value;
   weather.setQuality({weatherScale,hazeScale});
   assert.equal(g.index,index);assert.equal(g.drawRange.count,want);assert.deepEqual(weather.fog,fog);assert.equal(p.material.uniforms.blendWeight.value,weight);
   let hazeCount=0;const drawn=new Set(g.index.array.subarray(0,want));assert.equal(drawn.size,want);
   for(const i of drawn)hazeCount+=buffers[2][i];assert.equal(hazeCount,wantHaze);
   const before=buffers[0].slice();weather.update(.01,{biome:'snow',camera:view});let moved=0;
   for(let i=0;i<768;i++){
    const changed=[0,1,2].some(axis=>before[i*3+axis]!==buffers[0][i*3+axis]);
    if(drawn.has(i)){assert.ok(changed,`selected slot ${i} advances`);moved++;}else assert.equal(changed,false,`hidden slot ${i} is not simulated`);
   }
   assert.equal(moved,want);for(const [i,name] of ['position','life','haze'].entries())assert.equal(g.getAttribute(name).array,buffers[i]);
  }
  weather.setQuality({weatherScale:.25,hazeScale:.4});const hidden=new Set(Array.from({length:768},(_,i)=>i).filter(i=>!g.index.array.subarray(0,g.drawRange.count).includes(i)));
  weather.setQuality({weatherScale:1,hazeScale:1});for(const i of hidden)assert.equal(buffers[1][i],0,'restored slots fade in');
 }finally{weather.dispose();}
});

test('quality changes keep deterministic RNG, camera rotation and two weather types through a boundary',()=>{
 const a=createBiomeWeather(THREE),b=createBiomeWeather(THREE),view=camera();
 try{
  assert.equal(typeof a.setQuality,'function');
  for(let frame=0;frame<160;frame++){
   if(frame%20===0){const profile=frame%40?{weatherScale:.25,hazeScale:.4}:{weatherScale:.65,hazeScale:.72};a.setQuality(profile);b.setQuality(profile);}
   view.rotation.y+=.01;view.updateMatrixWorld();const opts={biome:frame<80?'forest':'desert',camera:view};a.update(1/60,opts);b.update(1/60,opts);assert.equal(hashWeather(a),hashWeather(b));
   if(frame===90)assert.equal(a.group.children.filter(p=>p.visible).length,2,'both shader kinds remain while fading');
  }
  for(const w of [a,b]){const before=hashWeather(w);w.update(10,{biome:'desert',camera:view,paused:true});assert.equal(hashWeather(w),before);}
 }finally{a.dispose();b.dispose();}
});

test('skid draw range includes only live ring segments and clears after the full lifetime',()=>{
 const effects=createDriftEffects(THREE);
 try{
  const g=effects.skids.geometry,index=g.index,positions=g.attributes.position.array;
  assert.equal(g.drawRange.count,0,'empty skid pool draws no triangles');
  for(let frame=0;frame<6;frame++)effects.update(1/60,car(-frame*.2));
  assert.equal(effects.skidCount,10);assert.equal(g.drawRange.count,60);
  // Leave two old marks to expire before two newer marks; this creates holes in the ring.
  for(let frame=0;frame<510;frame++)effects.update(.05,car(-1),{enabled:false});
  for(let frame=0;frame<3;frame++)effects.update(1/60,car(-2-frame*.2));
  for(let frame=0;frame<12;frame++)effects.update(.05,car(-2.4),{enabled:false});
  assert.equal(effects.skidCount,4);assert.equal(g.drawRange.count,24);
  for(let i=0;i<g.drawRange.count;i++)assert.ok(g.attributes.opacity.array[g.index.array[i]]>0,'dead slots are absent from the drawn index prefix');
  assert.equal(g.index,index);assert.equal(g.attributes.position.array,positions);
  for(let frame=0;frame<530;frame++)effects.update(.05,car(-2.4),{enabled:false});assert.equal(g.drawRange.count,0);
  for(let frame=0;frame<560;frame++)effects.update(1/60,car(-frame*.2));assert.equal(effects.skidCount,1024);assert.equal(g.drawRange.count,6144);
  assert.equal(new Set(g.index.array.subarray(0,6144)).size,4096,'wrap keeps every current ring segment once');
  effects.clear();assert.equal(g.drawRange.count,0);
 }finally{effects.dispose();}
});

test('smoke quality limits compacted instances while keeping skid emission, pool and RNG stable',()=>{
 const full=createDriftEffects(THREE),reduced=createDriftEffects(THREE);
 try{
  assert.equal(typeof reduced.setQuality,'function');reduced.setQuality({smokeScale:.4});
  for(let frame=0;frame<100;frame++)for(const e of [full,reduced])e.update(1/60,car(-frame*.2));
  assert.ok(reduced.smoke.count<=29);assert.equal(reduced.smokeCapacity,72);assert.equal(reduced.skidCount,full.skidCount);
  assert.deepEqual(reduced.skids.geometry.attributes.position.array,full.skids.geometry.attributes.position.array);
  reduced.setQuality({smokeScale:1});for(const e of [full,reduced])e.update(1/60,car(-20));
  assert.equal(reduced.smokeCount,full.smokeCount);assert.deepEqual(reduced.smoke.instanceMatrix.array.subarray(0,full.smokeCount*16),full.smoke.instanceMatrix.array.subarray(0,full.smokeCount*16));
  assert.deepEqual(reduced.smoke.geometry.attributes.opacity.array.subarray(0,full.smokeCount),full.smoke.geometry.attributes.opacity.array.subarray(0,full.smokeCount));
 }finally{full.dispose();reduced.dispose();}
});
