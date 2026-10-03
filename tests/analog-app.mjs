import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
const app=createAppDom(),d=app.debug;
const advance=n=>{for(let i=0;i<n;i++)app.frame();};
const touch=(target,type,id,x,y)=>target.dispatch(type,{pointerId:id,button:0,clientX:x,clientY:y,isPrimary:id===1});
try{
 // Fixed joystick center (60,70), radius34 in the renderer-free fixture.
 touch(app.stick,'pointerdown',1,60,36);assert.equal(d.model.state.speedDemand,1);advance(15);assert.ok(d.model.state.linearSpeed>0);
 const canvas=d.renderer.domElement;
 touch(canvas,'pointerdown',2,200,200);touch(canvas,'pointermove',2,240,205);
 assert.equal(d.lookInput.pointerId,2);assert.equal(d.input.state.pointerId,1);assert.equal(d.model.state.speedDemand,1);
 touch(canvas,'pointerup',2,240,205);assert.equal(d.input.state.pointerId,1);
 touch(app.stick,'pointercancel',1,60,36);assert.equal(d.model.state.speedDemand,0);advance(180);assert.ok(d.model.state.linearSpeed<.1);
 for(const type of ['resize','blur']){touch(app.stick,'pointerdown',1,60,36);app.win.dispatch(type);assert.equal(d.input.state.speedDemand,0);assert.ok(!d.model.state.active);if(type==='blur')app.win.dispatch('focus');}
 touch(app.stick,'pointerdown',1,60,36);app.doc.hidden=true;app.doc.dispatch('visibilitychange');assert.equal(d.input.state.speedDemand,0);app.doc.hidden=false;app.doc.dispatch('visibilitychange');app.win.dispatch('focus');
 app.win.dispatch('keydown',{code:'KeyW',key:'w'});assert.equal(d.model.state.speedDemand,1);app.win.dispatch('keyup',{code:'KeyW',key:'w'});assert.equal(d.model.state.speedDemand,0);
 d.setUpgradeMenu(true);app.win.dispatch('keydown',{code:'KeyW',key:'w'});assert.ok(!d.model.state.active);d.setUpgradeMenu(false);advance(2);assert.ok(!d.model.state.active);
 const money=d.gameplay.state.money,brains=d.gameplay.state.brains;
 d.returnToGarage();assert.equal(d.driving,false);assert.equal(app.root.hidden,true);assert.equal(app.ids.get('walk-ui').hidden,false);assert.equal(d.gameplay.state.money,money);assert.equal(d.gameplay.state.brains,brains);
 app.win.dispatch('keydown',{code:'KeyW',key:'w'});assert.ok(!d.model.state.active);app.win.dispatch('keyup',{code:'KeyW',key:'w'});
 console.log('PASS actual app analog input, independent camera finger, release/cancel, resize/blur/visibility, keyboard, upgrade interruption, garage walking and economy preservation (mock renderer, no browser/GPU).');
}finally{app.dispose();}
