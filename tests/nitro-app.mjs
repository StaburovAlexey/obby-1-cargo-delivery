import test from 'node:test';import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
import {nitroCareer} from './fixtures/nitro-career.mjs';
test('improvements unlock, purchase, upgrade gains and driving HUD',()=>{
 const f=createAppDom({startDriving:false,career:nitroCareer()});
 try{
 const d=f.debug,g=d.gameplay,el=id=>f.doc.getElementById(id);
 g.state.routeCompletion=null;
 assert.ok(el('nitro-button'));assert.equal(el('nitro-button').hidden,true);
 assert.equal(el('nitro-shop-category'),null);
 el('upgrade-button').dispatch('click');assert.equal(el('nitro-upgrade-card').hidden,true);assert.equal(el('nitro-new-badge').hidden,true);
 el('upgrade-close').dispatch('click');
 const saved=nitroCareer();Object.assign(g.state,{routeCompletion:saved.routeCompletion,completedRuns:1,money:100000,brains:10000});
 el('upgrade-button').dispatch('click');assert.equal(el('nitro-upgrade-card').hidden,false);
 assert.equal(el('nitro-new-badge').hidden,false);assert.equal(el('nitro-new-badge').textContent,'Новое!');
 el('nitro-upgrade-buy').dispatch('click');assert.equal(g.state.nitroLevel,1);assert.equal(g.state.money,80000);assert.equal(el('nitro-new-badge').hidden,true);
 const stats=['nitro-upgrade-charges','nitro-upgrade-recharge'].map(id=>el(id).textContent).join(' ').replace(/\s/g,' ');
 assert.match(stats,/1 → 2/);assert.match(stats,/2 000 → 1 667/);
 el('nitro-upgrade-buy').dispatch('click');assert.equal(g.state.nitroLevel,2);
 el('upgrade-close').dispatch('click');
 g.state.cooldown=0;d.enterVehicle('bmwreward');
 assert.equal(el('nitro-button').hidden,false);assert.equal(g.nitro.state.charges,2);
 f.pointer(f.pedal,'pointerdown',0,2);d.model.body.setLinvel({x:0,y:0,z:-20},true);
 for(let i=0;i<20;i++)f.frame();
 f.pointer(f.pedal,'pointerup',0,2);f.frame();assert.equal(d.model.state.active,false);
 assert.equal(el('nitro-button').disabled,false);
 el('nitro-button').dispatch('click');assert.equal(g.nitro.state.charges,1);f.frame();
 assert.equal(d.model.state.nitroThrust,true);assert.equal(d.model.state.active,false);
 f.win.dispatch('keydown',{code:'KeyN'});assert.equal(g.nitro.state.charges,1,'no queued activation');
 const remaining=g.nitro.state.remaining;d.pauseState.set('test-nitro',true);f.frame();assert.equal(g.nitro.state.remaining,remaining);d.pauseState.set('test-nitro',false);
 g.nitro.cancel();d.model.setInput({active:false});d.model.body.setLinvel({x:0,y:0,z:-20},true);f.frame();
 f.win.dispatch('keydown',{code:'KeyN'});assert.equal(g.nitro.state.charges,0);
 f.pointer(el('reverse-pedal'),'pointerdown',0,3);assert.equal(g.nitro.state.remaining,0,'mobile brake interrupts nitro immediately');
 f.pointer(el('reverse-pedal'),'pointerup',0,3);assert.equal(g.nitro.state.remaining,0);

 }finally{f.dispose();}
});
