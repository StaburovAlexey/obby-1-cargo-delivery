import test from 'node:test';
import assert from 'node:assert/strict';
import {createProgressiveAssets} from '../dist/progressive-assets.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('models are not attached until their queued GPU preparation completes',async()=>{
  let resolvePreparation,attached=0,preparing=0;
  const ready=new Promise(resolve=>resolvePreparation=resolve);
  const value={dispose(){}};
  const queue=createProgressiveAssets({items:[{id:'car'}],load:async()=>value,
    prepare:()=>{preparing++;return ready;},onLoad(){attached++;}});
  const result=queue.ensure('car');await tick();
  assert.equal(preparing,1);assert.equal(attached,0);
  resolvePreparation(true);assert.equal(await result,value);assert.equal(attached,1);queue.dispose();
});
test('a world cancelled during preparation disposes the late model exactly once',async()=>{
  let resolvePreparation,attached=0,disposals=0;
  const ready=new Promise(resolve=>resolvePreparation=resolve);
  const queue=createProgressiveAssets({items:[{id:'skin'}],load:async()=>({dispose(){disposals++;}}),
    prepare:()=>ready,onLoad(){attached++;}});
  const result=queue.ensure('skin');await tick();queue.dispose();resolvePreparation(true);
  assert.equal(await result,null);assert.equal(attached,0);assert.equal(disposals,1);
});
test('failed GPU preparation reports a retryable load failure and frees its resources',async()=>{
  let disposals=0;
  const queue=createProgressiveAssets({items:[{id:'car'}],load:async()=>({dispose(){disposals++;}}),
    prepare:async()=>{throw Error('compile failed');},onError(){}});
  await assert.rejects(queue.ensure('car'),/compile failed/);assert.equal(queue.status('car'),'failed');
  assert.equal(disposals,1);queue.dispose();
});
