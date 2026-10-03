import assert from 'node:assert/strict';
import {createStartupGate} from '../dist/startup-gate.js';
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};}
function fixture(){const frames=[],events=[];let timeout;const gate=createStartupGate({schedule:fn=>frames.push(fn),setTimer:fn=>{timeout=fn;return 1;},clearTimer:()=>events.push('timer-cleared'),onReady:()=>events.push('ready'),onError:e=>events.push(e.message)});return{gate,events,frames,timeout:()=>timeout(),async frame(){frames.shift()?.();await flush();}};}
{
 const f=fixture(),asset=deferred(),compile=deferred();
 const done=f.gate.start(asset.promise,{prepare:()=>{f.events.push('compile');return compile.promise;},render:()=>f.events.push('render')});
 await flush();assert.equal(f.gate.ready,false);assert.equal(f.frames.length,0);
 asset.resolve();await flush();assert.deepEqual(f.events,['compile']);assert.equal(f.frames.length,0);
 compile.resolve();await flush();assert.equal(f.gate.ready,false);
 await f.frame();assert.deepEqual(f.events,['compile','render']);assert.equal(f.gate.ready,false,'covered render is not enough: wait for a paint boundary');
 await f.frame();await done;assert.equal(f.gate.ready,true);assert.deepEqual(f.events,['compile','render','timer-cleared','ready']);
}
for(const phase of ['asset','compile','render','timeout']){
 const f=fixture(),asset=deferred();let renders=0;
 const done=f.gate.start(asset.promise,{prepare:()=>{if(phase==='compile')throw Error('compile');},render:()=>{renders++;if(phase==='render')throw Error('render');}});
 if(phase==='asset')asset.reject(Error('asset'));else if(phase==='timeout'){f.timeout();asset.resolve();}else asset.resolve();
 await flush();await f.frame();await f.frame();await done;
 assert.equal(f.gate.state,'failed');assert.equal(f.gate.ready,false);assert(!f.events.includes('ready'));
 if(phase!=='render')assert.equal(renders,0);
}
console.log('PASS startup gate: delayed assets, shader preparation, covered render + paint boundary, asset/compile/render failure and timeout never start gameplay.');
