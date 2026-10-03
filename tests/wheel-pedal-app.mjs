import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
const app=createAppDom(),d=app.debug;
const advance=n=>{for(let i=0;i<n;i++)app.frame();};
const touch=(target,type,id,x,y)=>target.dispatch(type,{pointerId:id,button:0,clientX:x,clientY:y,isPrimary:id===1});
try{
 touch(app.wheel,'pointerdown',1,100,70);touch(app.wheel,'pointermove',1,60,110);assert.ok(d.model.state.steering>0);assert.equal(d.model.state.active,false);advance(2);assert.ok(d.model.state.linearSpeed<.01);
 touch(app.pedal,'pointerdown',2,60,70);assert.equal(d.model.state.active,true);assert.equal(d.model.state.speedDemand,null);
 const canvas=d.renderer.domElement;touch(canvas,'pointerdown',3,200,200);touch(canvas,'pointermove',3,240,205);assert.equal(d.lookInput.pointerId,3);assert.equal(d.model.state.active,true);
 advance(10);assert.ok(d.model.state.linearSpeed>0);touch(canvas,'pointerup',3,240,205);touch(app.pedal,'pointercancel',2,60,70);assert.equal(d.model.state.active,false);touch(app.wheel,'pointerup',1,60,110);assert.equal(d.model.state.steering,0);
 for(const type of ['resize','blur']){touch(app.pedal,'pointerdown',2,60,70);app.win.dispatch(type);assert.equal(d.model.state.active,false);if(type==='blur')app.win.dispatch('focus');}
 touch(app.pedal,'pointerdown',2,60,70);app.doc.hidden=true;app.doc.dispatch('visibilitychange');assert.equal(d.model.state.active,false);app.doc.hidden=false;app.doc.dispatch('visibilitychange');app.win.dispatch('focus');
 app.win.dispatch('keydown',{code:'KeyW',key:'w'});assert.equal(d.model.state.active,true);app.win.dispatch('keyup',{code:'KeyW',key:'w'});assert.equal(d.model.state.active,false);
 d.setUpgradeMenu(true);app.win.dispatch('keydown',{code:'KeyW',key:'w'});assert.equal(d.model.state.active,false);d.setUpgradeMenu(false);assert.equal(d.model.state.active,false);
 const money=d.gameplay.state.money,brains=d.gameplay.state.brains;d.returnToGarage();assert.equal(d.driving,false);assert.equal(app.root.hidden,true);assert.equal(app.ids.get('walk-ui').hidden,false);assert.equal(d.gameplay.state.money,money);assert.equal(d.gameplay.state.brains,brains);
 app.win.dispatch('keydown',{code:'KeyW',key:'w'});assert.equal(d.model.state.active,false);app.win.dispatch('keyup',{code:'KeyW',key:'w'});
 console.log('PASS actual app wheel + pedal + third camera pointer, all safety resets, keyboard, upgrade pause, garage walking and balances. Offline mock renderer.');
}finally{app.dispose();}
