import test from 'node:test';
import assert from 'node:assert/strict';
import {createHangarDriftLeaderboard} from '../dist/hangar-drift-leaderboard.js';
import {createInputDom} from './fixtures/vehicle-input-dom.mjs';
function fixture(options={}){
 const dom=createInputDom(),Element=dom.wheel.constructor,doc=dom.doc,ids=new Map();doc.body=new Element();doc.body.ownerDocument=doc;
 for(const id of ['button','menu','panel','close','title','note','table','rows','self','rank','player','score']){const node=new Element();node.focus=()=>{doc.activeElement=node;};node.replaceChildren=(...children)=>{node.children=[];children.forEach(child=>node.append(child));};ids.set(id,node);}
 doc.body.append(ids.get('button'));doc.body.append(ids.get('menu'));ids.get('menu').append(ids.get('panel'));
 for(const [id,node]of ids)if(!['button','menu','panel'].includes(id))ids.get('panel').append(node);
 doc.getElementById=id=>ids.get(id.replace('hangar-drift-',''));doc.createElement=()=>new Element();doc.activeElement=ids.get('button');
 return {...dom,ids,ui:createHangarDriftLeaderboard(doc,options)};
}
const live=extra=>({id:'yandex',getLeaderboardStatus:async()=>({available:true,authorized:true}),getLeaderboardEntries:async()=>({entries:[]}),getLeaderboardPlayerEntry:async()=>null,...extra});
test('truthful unavailable/development state with no fabricated entries and RU/EN labels',async()=>{
 let lang='ru';const f=fixture({platform:{id:'yandex',development:true},language:()=>lang});await f.ui.open();
 assert.match(f.ids.get('note').textContent,/тестовой/);assert.equal(f.ids.get('rows').children.length,0);assert(f.ids.get('table').hidden);
 lang='en';f.ui.refresh();assert.equal(f.ids.get('title').textContent,'Drift leaderboard');assert.match(f.ids.get('note').textContent,/test version/);f.ui.dispose();
 const offline=fixture();await offline.ui.open();assert.match(offline.ids.get('note').textContent,/Яндекс/);offline.ui.dispose();
});
test('real entries, personal rank and unsafe names rendered as text; no submission',async()=>{
 let submissions=0;const entry={rank:2,score:12000,player:{publicName:'<img onerror=bad>'}};
 const f=fixture({platform:live({getLeaderboardEntries:async()=>({entries:[entry]}),getLeaderboardPlayerEntry:async()=>entry,setLeaderboardScore:()=>submissions++})});
 await f.ui.open();const row=f.ids.get('rows').children[0];assert.equal(row.children[1].textContent,'<img onerror=bad>');assert.equal(row.attributes['data-self'],'true');assert(!f.ids.get('self').hidden);assert.equal(submissions,0);f.ui.dispose();
});
test('empty, error and missing leaderboard states remain distinct',async()=>{
 for(const [getLeaderboardEntries,match]of [[async()=>({entries:[]}),/Пока нет/],[async()=>{throw new Error('network');},/Не удалось/],[async()=>{throw {code:404};},/временно недоступна/]]){
  const f=fixture({platform:live({getLeaderboardEntries})});await f.ui.open();assert.match(f.ids.get('note').textContent,match);assert.equal(f.ids.get('rows').children.length,0);f.ui.dispose();
 }
});
test('focus trap, Escape, backdrop and late response cancellation',async()=>{
 let resolve;const changes=[];const f=fixture({platform:live({getLeaderboardEntries:()=>new Promise(r=>resolve=r)}),onOpenChange:open=>changes.push(open)});
 const pending=f.ui.open();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.doc.activeElement,f.ids.get('close'));assert.equal(f.ids.get('button').inert,true);
 assert(f.doc.dispatch('keydown',{key:'Tab',shiftKey:true}).defaultPrevented);
 f.doc.dispatch('keydown',{key:'Escape'});assert(!f.ui.isOpen());assert(f.ids.get('menu').hidden);assert.equal(f.doc.activeElement,f.ids.get('button'));assert.equal(f.ids.get('button').inert,undefined);
 resolve({entries:[{rank:1,score:100}]});await pending;assert.equal(f.ids.get('rows').children.length,0);assert.deepEqual(changes,[true,false]);f.ui.dispose();
 const g=fixture();await g.ui.open();g.ids.get('menu').dispatch('click');assert(!g.ui.isOpen());g.ui.dispose();
});
test('unavailable hangar access never opens or fetches',async()=>{
 let reads=0;const f=fixture({canOpen:()=>false,platform:live({getLeaderboardStatus:()=>reads++})});assert.equal(await f.ui.open(),false);assert.equal(reads,0);assert(f.ids.get('menu').hidden);f.ui.dispose();
});
