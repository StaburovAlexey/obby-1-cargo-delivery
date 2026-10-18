import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {createAppDom} from './fixtures/app-dom.mjs';
const flush=async()=>{for(let i=0;i<80;i++)await Promise.resolve();};
function deferredDisplays(){
 const jobs=[];let active=0,peak=0;
 const loadDisplay=(_,{id})=>new Promise((resolve,reject)=>{
  active++;peak=Math.max(peak,active);const group=new THREE.Group();let disposed=0;
  const display={id,group,dispose(){disposed++;group.removeFromParent();}};
  jobs.push({id,display,get disposed(){return disposed;},resolve(){active--;resolve(display);},reject(reason=new Error('display unavailable')){active--;reject(reason);}});
 });
 return{jobs,loadDisplay,get peak(){return peak;}};
}
test('display loads overlap the selected character with bounded work and reveal only a complete world',async()=>{
 const loads=deferredDisplays();
 const f=createAppDom({startDriving:false,realStartup:true,deferCharacters:true,devServer:true,search:'?dev=1',career:{version:1,characterId:'pack1',ownedSkinIds:['bacon','pack1']},loadDisplay:loads.loadDisplay});
 try{
  await flush();assert.equal(f.debug.characterReady,false);assert.equal(loads.jobs.length,3,'three displays must start while the selected character is still loading');
  assert.equal(f.debug.startup.ready,false);assert.equal(f.debug.characterReady,false);
  const count=f.debug.garage.stands.length;
  // Finish the second request first; published scene order still matches stands.
  loads.jobs[1].resolve();await flush();assert.equal(loads.jobs.length,4);
  for(let i=0;i<count;i++){if(i===1)continue;assert.ok(loads.jobs[i]);loads.jobs[i].resolve();await flush();}
  assert.equal(loads.peak,3);assert.equal(f.debug.characterDisplays.length,count);
  assert.deepEqual(f.debug.characterDisplays.map(d=>d.id),loads.jobs.map(d=>d.id));
  assert.equal(f.debug.startup.ready,false);assert.equal(f.ids.get('loading').hidden,false);
  f.resolveCharacter('pack1');await flush();
  for(let i=0;i<10&&!f.debug.startup.ready;i++){f.frame();await flush();}
  assert.equal(f.debug.startup.ready,true);assert.equal(f.ids.get('loading').hidden,true);
 }finally{f.debug.startup.fail(new Error('Test cleanup'));f.dispose();}
});
test('a required display failure keeps the loader failure gate closed and disposes in-flight results',async t=>{
 t.mock.method(console,'error',()=>{});
 const loads=deferredDisplays(),f=createAppDom({startDriving:false,realStartup:true,loadDisplay:loads.loadDisplay});
 try{
  await flush();assert.equal(loads.jobs.length,3);loads.jobs[2].resolve();await flush();assert.equal(loads.jobs.length,4);
  loads.jobs[0].reject('');await flush();
  assert.equal(f.debug.startup.state,'failed','one failed required model must show the retry error even while peers are pending');
  loads.jobs[1].resolve();loads.jobs[3].resolve();await flush();
  assert.equal(f.debug.startup.state,'failed');assert.equal(f.debug.enterVehicle('pickup'),false);
  assert.equal(f.ids.get('error').hidden,false);
  assert.equal(f.debug.characterDisplays.length,0);assert.equal(loads.jobs[1].disposed,1);assert.equal(loads.jobs[2].disposed,1);assert.equal(loads.jobs[3].disposed,1);
 }finally{f.debug.startup.fail(new Error('Test cleanup'));f.dispose();}
});
test('a rebuilt world discards every display result from the previous generation',async()=>{
 const loads=deferredDisplays(),f=createAppDom({startDriving:false,loadDisplay:loads.loadDisplay});
 try{
  await flush();assert.equal(loads.jobs.length,3);f.debug.rebuild(43);await flush();
  const stale=loads.jobs.slice(0,3);for(const job of stale)job.resolve();await flush();
  assert.ok(stale.every(job=>job.disposed===1));assert.equal(f.debug.characterDisplays.length,0);
  const count=f.debug.garage.stands.length;
  for(let i=3;i<count+3;i++){loads.jobs[i].resolve();await flush();}
  assert.equal(f.debug.characterDisplays.length,count);assert.ok(stale.every(job=>!job.display.group.parent));
 }finally{f.debug.startup.fail(new Error('Test cleanup'));f.dispose();}
});
