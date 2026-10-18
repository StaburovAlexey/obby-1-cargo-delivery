import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanyonUi} from '../dist/canyon-ui.js';
class Element{
 hidden=false;disabled=false;children=[];listeners=new Map();attributes={};value='';
 set textContent(v){this.value=String(v);this.children=[];}get textContent(){return this.value+this.children.map(c=>c.textContent).join('');}
 append(...children){this.children.push(...children);}replaceChildren(...children){this.value='';this.children=children;}setAttribute(k,v){this.attributes[k]=String(v);}addEventListener(n,f){this.listeners.set(n,f);}removeEventListener(n){this.listeners.delete(n);}click(){this.listeners.get('click')?.({stopPropagation(){}});}
}
function fixture(){const ids=new Map(['canyon-hud','canyon-phase','canyon-score','canyon-combo','canyon-progress','canyon-angle','canyon-overlay','canyon-title','canyon-result-score','canyon-result-note','canyon-retry','canyon-exit','canyon-rankings-button','canyon-login','canyon-rankings','canyon-ranking-rows','canyon-ranking-note','canyon-back'].map(id=>[id,new Element()]));return {ids,doc:{getElementById:id=>ids.get(id),createElement:()=>new Element()}};}
test('race HUD, results and retry/exit actions have distinct visible states',()=>{
 const f=fixture();let retried=0,exited=0;const ui=createCanyonUi(f.doc,{onRetry:()=>retried++,onExit:()=>exited++});
 ui.update({phase:'running',score:1234,multiplier:3,progress:500,length:1850,angle:.4});assert.equal(f.ids.get('canyon-hud').hidden,false);assert.match(f.ids.get('canyon-score').textContent,/1.?234/);assert.equal(f.ids.get('canyon-overlay').hidden,true);
 ui.showResult({score:12500,maxCombo:4},{status:'posted'});assert.equal(f.ids.get('canyon-overlay').hidden,false);assert.match(f.ids.get('canyon-result-score').textContent,/12.?500/);
 f.ids.get('canyon-retry').click();f.ids.get('canyon-exit').click();assert.equal(retried,1);assert.equal(exited,1);ui.hide();assert.equal(f.ids.get('canyon-hud').hidden,true);ui.dispose();
});
test('ranking rows treat player names as text and offer optional Yandex login',()=>{
 const f=fixture();let logins=0;const ui=createCanyonUi(f.doc,{onLogin:()=>logins++});
 ui.showRankings({status:'ready',canLogin:true,entries:[{rank:1,score:9000,name:'<img src=x onerror=alert(1)>'}]});
 assert.equal(f.ids.get('canyon-login').hidden,false);assert.equal(f.ids.get('canyon-ranking-rows').children.length,1);assert.match(f.ids.get('canyon-ranking-rows').textContent,/<img/);assert.equal(f.ids.get('canyon-ranking-rows').children[0].children.length,3);
 f.ids.get('canyon-login').click();assert.equal(logins,1);ui.dispose();
});
test('minimal drift HUD appears on scoring, pulses continuously, then fades and resets',()=>{
 const f=fixture();let time=0;const ui=createCanyonUi(f.doc,{now:()=>time}),hud=f.ids.get('canyon-hud');
 ui.update({phase:'running'});assert.equal(hud.hidden,true,'no idle score panel');
 time=10;ui.update({phase:'running',score:10,multiplier:2});assert.equal(hud.hidden,false);assert.equal(hud.attributes['data-visible'],'true');assert.equal(hud.attributes['data-scoring'],'true');assert.equal(f.ids.get('canyon-combo').textContent,'×2');
 for(time=20;time<500;time+=10){ui.update({phase:'running',score:time,multiplier:2});assert.equal(hud.attributes['data-scoring'],'true','animation state stays on across score ticks');}
 time=700;ui.update({phase:'running',score:490,multiplier:2});assert.equal(hud.attributes['data-scoring'],'false');assert.equal(hud.attributes['data-visible'],'true','brief legible hold');
 time=1200;ui.update({phase:'running',score:490});assert.equal(hud.hidden,false);assert.equal(hud.attributes['data-visible'],'false','fade before removing');
 time=1500;ui.update({phase:'running',score:490});assert.equal(hud.hidden,true);
 time=1510;ui.update({phase:'running',score:510});assert.equal(hud.hidden,false,'new drift reappears');
 ui.suspend();ui.update({phase:'running',score:510});assert.equal(hud.hidden,true,'pause does not replay banked points on resume');
 ui.hide();ui.update({phase:'running',score:0});assert.equal(hud.hidden,true,'new run never reuses stale score');
 ui.update({phase:'running',score:20});ui.update({phase:'celebrating',score:20});assert.equal(hud.hidden,true);
 ui.dispose();
});
test('HUD markup contains just the score and multiplier, with no panel decoration',async()=>{
 const {readFile}=await import('node:fs/promises');
 const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8'),css=await readFile(new URL('../dist/canyon-ui.css',import.meta.url),'utf8');
 const hud=html.match(/<section id="canyon-hud"[^]*?<\/section>/)[0];
 assert.match(hud,/id="canyon-score"/);assert.match(hud,/id="canyon-combo"/);assert.doesNotMatch(hud,/canyon-(angle|progress|phase)|%|°/);
 assert.doesNotMatch(css.match(/#canyon-hud\{([^}]+)\}/)[1],/background|border|box-shadow/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);assert.match(css,/animation:canyon-score-bounce .48s ease-in-out infinite/);
});
