import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStudyRewardUi} from '../dist/study-reward-ui.js';
function fixture(showRewardedAd,development=false){
 const label={},listeners=new Map(),button={addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)},effects={children:[],appendChild(n){this.children.push(n);}};
 const g={state:{seatedId:'desk'},studyBoostRemaining:0,flushProgress(){},activateStudyBoost(){this.studyBoostRemaining=60;this.grants=(this.grants||0)+1;}};
 const pauses=[],messages=[];
 const document={getElementById:id=>id==='study-reward'?button:id==='study-reward-label'?label:effects,createElement:()=>({style:{},remove(){effects.children.splice(effects.children.indexOf(this),1);}})};
 const ui=createStudyRewardUi({document,getGameplay:()=>g,platform:{showRewardedAd},pause:v=>pauses.push(v),notify:m=>messages.push(m),canAct:()=>true,development});
 return {ui,g,button,label,effects,pauses,messages,click:()=>listeners.get('click')()};
}
test('ordinary study spawns bounded XP effects; leaving clears them',()=>{
 const f=fixture();for(let i=0;i<100;i++)f.ui.update(.1,true);
 assert.ok(f.effects.children.length>0&&f.effects.children.length<=3);assert.match(f.effects.children[0].innerHTML,/XP/);assert.doesNotMatch(f.effects.children[0].innerHTML,/×2/);
 f.g.state.seatedId=null;f.ui.update(.1,true);assert.equal(f.effects.children.length,0);assert.equal(f.button.hidden,true);
});
test('double taps cannot start multiple ads; reward is granted once after completion',async()=>{
 let complete,calls=0;const f=fixture(()=>{calls++;return new Promise(r=>complete=r);});
 const pending=f.click();await f.click();assert.equal(calls,1);assert.deepEqual(f.pauses,[true]);
 complete({rewarded:true});await pending;assert.equal(f.g.grants,1);assert.deepEqual(f.pauses,[true,false]);
 await f.click();assert.equal(calls,1);f.ui.update(.1,true);assert.equal(f.button.disabled,true);assert.match(f.label.textContent,/60/);
});
test('cancel and error release pause without bonus',async()=>{
 for(const result of [()=>Promise.resolve({rewarded:false}),()=>Promise.reject(new Error('offline'))]){
  const f=fixture(result);await f.click();assert.equal(f.g.grants,undefined);assert.deepEqual(f.pauses,[true,false]);assert.equal(f.messages.length,1);
 }
});

test('development starts the reward immediately without any platform ad call',async()=>{
 let calls=0;const f=fixture(()=>{calls++;throw Error('must not call SDK');},true);
 f.ui.update(.1,true);assert.equal(f.button.disabled,false);assert.equal(f.label.textContent,'XP ×2 · 1 мин');
 await f.click();assert.equal(f.g.studyBoostRemaining,60);assert.equal(calls,0);assert.equal(f.g.grants,1);
 f.ui.update(.1,true);assert.equal(f.button.disabled,true);await f.click();assert.equal(f.g.grants,1);
 const offline=fixture(undefined,true);offline.ui.update(.1,true);assert.equal(offline.button.disabled,false);await offline.click();assert.equal(offline.g.studyBoostRemaining,60);
});
