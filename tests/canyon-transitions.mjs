import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {createCanyonMode} from '../dist/canyon-mode.js';
import {earnedRewardCareer} from './fixtures/reward-career.mjs';
import {createInputDom} from './fixtures/vehicle-input-dom.mjs';
import fs from 'node:fs';

const career=earnedRewardCareer();
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(){
 const dom=createInputDom(),Element=dom.wheel.constructor,ids=new Map();dom.doc.body=new Element();
 for(const [,id]of fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8').matchAll(/\bid="([^"]+)"/g))ids.set(id,new Element());dom.doc.getElementById=id=>ids.get(id);dom.doc.createElement=()=>new Element();ids.get('canyon-ranking-rows').replaceChildren=(...rows)=>ids.get('canyon-ranking-rows').children=rows;
 const scene=new THREE.Scene(),garage={group:new THREE.Group(),walkingSolids:[]},root=new THREE.Group();garage.group.add(root);scene.add(garage.group);
 const vehicle={id:'bmwreward',group:root,model:{},position:{},rig:{root,update(pose){this.pose=pose;root.position.copy(pose.position);root.quaternion.copy(pose.quaternion);}}};garage.vehicles=[vehicle];
 const saved=[],submitted=[],finish=deferred(),platform={id:'yandex',accountGeneration:0,status:{},getLeaderboardStatus:async()=>({available:true,authorized:true}),getLeaderboardPlayerEntry:async()=>null,setLeaderboardScore:async(...args)=>submitted.push(args)};
 const client={connected:true,roomId:'persistent-room',startDriftRun:async()=>({ok:true,runId:'one'}),finishDriftRun:()=>finish.promise,cancelDriftRun(){}};
 const gameplay={state:{routeCompletion:career.routeCompletion,fuels:{},selectedId:'bmwreward'},snapshot:()=>career,beginCanyonRun:()=>true,recordDriftResult:record=>saved.push(record)};
 const context={garage,gameplay,online:{client},driving:true,...Object.fromEntries(['city','finishLine','roadHazardsScene'].map(key=>[key,{group:new THREE.Group()}]))};
 const canyon=createCanyonMode(THREE,{scene,document:dom.doc,platform,getContext:()=>context});
 const record={version:1,trackId:'canyon-v1',score:5000,durationMs:100000,maxCombo:3,verified:true};
 return {canyon,platform,saved,submitted,finish,client,record,ids,async start(){assert.equal(canyon.enter(),true);for(let i=0;i<31;i++)canyon.step(.1);await Promise.resolve();assert.equal(canyon.phase,'running');Object.assign(canyon.score,{finished:true,score:5000,elapsed:100,maxCombo:3});}};
}
test('retry ignores an earlier finish and keeps the original room connection',async()=>{
 const f=fixture();try{await f.start();const room=f.client,finishing=f.canyon.complete();await Promise.resolve();assert.equal(f.canyon.retry(),true);f.finish.resolve(f.record);assert.equal(await finishing,null);assert.deepEqual(f.saved,[]);assert.deepEqual(f.submitted,[]);assert.equal(f.canyon.phase,'countdown');assert.equal(f.client,room);assert.equal(f.client.roomId,'persistent-room');}finally{f.canyon.dispose();}
});
test('account changes discard a finish instead of saving or publishing it for a different player',async()=>{
 const f=fixture();try{await f.start();const finishing=f.canyon.complete();await Promise.resolve();f.platform.accountGeneration++;f.finish.resolve(f.record);assert.equal(await finishing,null);assert.deepEqual(f.saved,[]);assert.deepEqual(f.submitted,[]);}finally{f.canyon.dispose();}
});
test('only a fresh server result is saved as verified and submitted to Yandex',async()=>{
 const f=fixture();try{await f.start();const finishing=f.canyon.complete();await Promise.resolve();f.finish.resolve(f.record);assert.deepEqual(await finishing,f.record);assert.equal(f.saved.length,1);assert.equal(f.saved[0].verified,true);assert.equal(f.submitted[0][1],5000);assert.equal(f.canyon.phase,'result');}finally{f.canyon.dispose();}
});
test('retry cancels a prior result waiting to write the Yandex score',async()=>{
 const f=fixture(),reading=deferred(),started=deferred();f.platform.getLeaderboardPlayerEntry=()=>{started.resolve();return reading.promise;};
 try{await f.start();const finishing=f.canyon.complete();f.finish.resolve(f.record);await started.promise;assert.equal(f.canyon.phase,'result');f.canyon.retry();reading.resolve(null);await finishing;assert.deepEqual(f.submitted,[],'the cancelled read must not issue an SDK write');assert.equal(f.saved.length,1,'the completed local record remains saved');}finally{f.canyon.dispose();}
});
