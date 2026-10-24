import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../dist/vendor/three.module.js';
const {createModelWarmup}=await import('../dist/model-warmup.js').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND'&&error.message.includes('/dist/model-warmup.js'))return {};throw error;});
const microtasks=async()=>{await Promise.resolve();await Promise.resolve();};
function fixture(renderer){
 assert.equal(typeof createModelWarmup,'function');
 const callbacks=[],scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
 const warmup=createModelWarmup({renderer,scene,camera,schedule:callback=>callbacks.push(callback)});
 return {warmup,scene,camera,get frames(){return callbacks.length;},async frame(){const work=callbacks.splice(0);for(const callback of work)callback();await microtasks();}};
}
function modelWithTextures(textures){
 const object=new THREE.Group();
 object.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial({map:textures[0]??null,normalMap:textures[1]??null})));
 object.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.ShaderMaterial({uniforms:{textures:{value:[textures[0],{nested:textures.slice(2)}]}}})));
 return object;
}

test('warmup uploads at most two unique textures each frame and compiles detached models with scene lighting',async()=>{
 const uploaded=[],compiled=[],textures=Array.from({length:5},()=>new THREE.Texture()),object=modelWithTextures(textures);
 let finishCompile;const f=fixture({initTexture:t=>uploaded.push(t),compileAsync:(...args)=>{compiled.push(args);return new Promise(resolve=>finishCompile=resolve);}});
 try{
  let settled=false;const promise=f.warmup.prepare(object);promise.then(()=>settled=true);
  assert.equal(uploaded.length,0);assert.equal(compiled.length,0);assert.equal(f.warmup.prepare(object),promise,'repeated prepare shares work');
  await f.frame();assert.deepEqual(uploaded,textures.slice(0,2));assert.equal(compiled.length,0);
  await f.frame();assert.deepEqual(uploaded,textures.slice(0,4));assert.equal(compiled.length,0);
  await f.frame();assert.deepEqual(uploaded,textures);assert.deepEqual(compiled,[[object,f.camera,f.scene]]);assert.equal(settled,false);assert.equal(object.parent,null,'warmup leaves attachment to its owner');
  finishCompile();assert.equal(await promise,true);
 }finally{f.warmup.dispose();}
});

test('the two-texture budget is shared across concurrent models and shared textures upload once',async()=>{
 const uploaded=[],textures=Array.from({length:4},()=>new THREE.Texture());const f=fixture({initTexture:t=>uploaded.push(t),compileAsync:()=>Promise.resolve()});
 try{
  const a=f.warmup.prepare(modelWithTextures(textures.slice(0,3))),b=f.warmup.prepare(modelWithTextures(textures.slice(1,4)));
  await f.frame();assert.equal(uploaded.length,2);
  await f.frame();assert.equal(uploaded.length,4);assert.equal(new Set(uploaded).size,4);
  assert.equal(await a,true);assert.equal(await b,true);
 }finally{f.warmup.dispose();}
});

test('disposing releases queued and compiling promises and suppresses later GPU work',async()=>{
 const uploaded=[],compiled=[];let finishCompile;
 const f=fixture({initTexture:t=>uploaded.push(t),compileAsync:object=>{compiled.push(object);return new Promise(resolve=>finishCompile=resolve);}});
 const compiling=f.warmup.prepare(new THREE.Group());await f.frame();assert.equal(compiled.length,1);
 const queued=f.warmup.prepare(modelWithTextures(Array.from({length:5},()=>new THREE.Texture())));
 f.warmup.dispose();f.warmup.dispose();assert.equal(await queued,false);assert.equal(await compiling,false);await f.frame();assert.equal(uploaded.length,0);
 finishCompile();await microtasks();assert.equal(await f.warmup.prepare(new THREE.Group()),false);assert.equal(compiled.length,1);
});

test('texture or compile failures reject only that model and do not stall the queue',async()=>{
 const bad=new THREE.Texture(),textureError=new Error('upload failed'),compileError=new Error('compile failed');
 const failsCompile=new THREE.Group(),f=fixture({initTexture:t=>{if(t===bad)throw textureError;},compileAsync:object=>object===failsCompile?Promise.reject(compileError):Promise.resolve()});
 try{
  const a=f.warmup.prepare(modelWithTextures([bad])),assertA=assert.rejects(a,error=>error===textureError),b=f.warmup.prepare(failsCompile),assertB=assert.rejects(b,error=>error===compileError),c=f.warmup.prepare(new THREE.Group());
  await f.frame();await assertA;await assertB;assert.equal(await c,true);
 }finally{f.warmup.dispose();}
});
