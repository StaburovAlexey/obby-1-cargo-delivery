import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
import {FINISH_LINE_SPEC as LINE} from '../dist/finish-line.js';
import {routePointAtProgress} from '../dist/route-network.js';
import {BRIDGES} from '../dist/road-bridges.js';
const f=createAppDom({search:'?dev=1'});
try{
 const d=f.debug,g=d.gameplay;
 assert(d.setBiomeMenu(true));f.ids.get('biome-go-finish').dispatch('click');
 f.frame();
 const move=q=>{const p=routePointAtProgress(q);Object.assign(d.model.state,{x:p.x,z:p.z,heading:p.heading,routeContext:p});d.model.pause();f.frame();};
 move(LINE.progress-1);
 const crossing=routePointAtProgress(LINE.progress-.05);Object.assign(d.model.state,{x:crossing.x,z:crossing.z,heading:crossing.heading,routeContext:crossing,velocityX:-Math.sin(crossing.heading)*8,velocityZ:-Math.cos(crossing.heading)*8,linearSpeed:8});
 let pauses=0,cameraResets=0;const pause=d.model.pause.bind(d.model),reset=d.cameraState.reset.bind(d.cameraState);d.model.pause=(...args)=>{pauses++;return pause(...args);};d.cameraState.reset=(...args)=>{cameraResets++;return reset(...args);};
 f.win.dispatch('keydown',{code:'KeyW',key:'w'});f.frame();assert.equal(pauses,0);assert.equal(cameraResets,0);
 assert(d.model.state.linearSpeed>7,'finish preserves forward speed');assert(d.model.state.active,'held gas survives crossing');
 assert.equal(g.state.eventMode,'finish');assert.equal(g.state.finishKind,'main');assert(d.finishCelebration.active);assert.equal(g.state.routeCompletion,null);assert.equal(g.state.money,0);
 const fuel=g.state.fuels[g.state.selectedId],x=d.model.state.x,z=d.model.state.z;
 assert.equal(d.setBiomeMenu(true),false);assert.equal(d.setDriving(false),false);assert.equal(d.setUpgradeMenu(true),false);assert.equal(d.returnToGarage(),false);
 f.ids.get('garage-button').dispatch('click');assert.equal(g.state.eventMode,'finish');
 f.frame();assert(Math.hypot(d.model.state.x-x,d.model.state.z-z)>.1,'vehicle continues moving');assert.equal(g.state.fuels[g.state.selectedId],fuel);
 f.win.dispatch('keydown',{code:'KeyD',key:'d'});const heading=d.model.state.heading;for(let i=0;i<5;i++)f.frame();assert.notEqual(d.model.state.heading,heading,'steering still changes heading');f.win.dispatch('keyup',{code:'KeyD',key:'d'});
 f.win.dispatch('keyup',{code:'KeyW',key:'w'});assert.equal(d.model.state.active,false);
 const reverse=f.ids.get('reverse-pedal');reverse.dispatch('pointerdown',{pointerId:12,button:0});assert.equal(d.model.state.gear,'R');assert.equal(d.model.state.active,true);reverse.dispatch('pointerup',{pointerId:12});
 assert.equal(d.finishCelebration.group.position.x,d.model.state.x);assert.equal(d.finishCelebration.group.position.z,d.model.state.z);
 // A depleted tank or a repeated crossing after completion cannot interrupt the timer.
 g.state.fuels[g.state.selectedId]=0;g.drive(9999,crossing.x,crossing.z);g.drive(9999,x,z);assert.equal(g.state.eventMode,'finish');assert.equal(g.state.money,0);
 const remaining=g.state.finishRemaining;
 f.ids.get('settings-button').dispatch('click');assert(d.settingsMenuOpen);for(let i=0;i<10;i++)f.frame();assert.equal(g.state.finishRemaining,remaining);f.ids.get('settings-close').dispatch('click');assert(!d.settingsMenuOpen);f.frame();assert.equal(g.state.finishRemaining,remaining);
 f.doc.hidden=true;for(let i=0;i<10;i++)f.frame();assert.equal(g.state.finishRemaining,remaining);f.doc.hidden=false;f.frame();assert.equal(g.state.finishRemaining,remaining);
 f.win.dispatch('blur');for(let i=0;i<10;i++)f.frame();assert.equal(g.state.finishRemaining,remaining);f.win.dispatch('focus');f.frame();
 while(g.state.finishRemaining>1/60+1e-8){f.frame();assert.equal(g.state.mode,'driving');}f.frame();assert.equal(g.state.mode,'walking');assert.equal(g.state.eventMode,null);assert(!d.finishCelebration.active);assert.equal(g.state.selectedId,null);assert.equal(g.state.money,0);
 const old=d.finishCelebration;d.rebuild(42);assert.equal(old.group.children.length,0);assert(!f.debug.finishCelebration.active);
 console.log('PASS headless app: moving crossing/confetti follow, continuous speed, gas/steering/reverse, frozen rewards/fuel, hidden/blur pause, exact two-second hangar after resume, rebuild disposal; no GPU rendering claimed.');
}finally{f.dispose();}

const {freshCareer}=await import('../dist/career-save.js');
const {createCareerRouteTracker}=await import('../dist/career-route-tracker.js');
const {rewardRoutePose}=await import('./fixtures/reward-career.mjs');
const earned=createAppDom({startDriving:false,career:{...freshCareer(),ownedVehicleIds:['pickup','ashhauler']}});
try{
 const d=earned.debug,g=d.gameplay;g.state.cooldown=0;assert(d.enterVehicle('ashhauler'));const tracker=createCareerRouteTracker();
 for(let q=-6;q<LINE.progress;q+=2){const p=rewardRoutePose(q);tracker.update(g,p,.05);g.drive(0,p.x,p.z);}
 const p=rewardRoutePose(LINE.progress+1);tracker.update(g,p,.05);Object.assign(d.model.state,{x:p.x,z:p.z,heading:p.heading,routeContext:p});g.drive(0,p.x,p.z);
 earned.frame();assert(d.finishCelebration.active);assert.equal(g.state.finishKind,'main');assert(g.isOwned('bmwreward'));assert(!d.careerMenuOpen);assert(earned.ids.get('delivery-receipt-menu').hidden);
 d.pauseState.set('platform',true);const remain=g.state.finishRemaining;for(let i=0;i<20;i++)earned.frame();assert.equal(g.state.finishRemaining,remain);d.pauseState.set('platform',false);
 for(let i=0;i<140;i++)earned.frame();assert.equal(g.state.mode,'walking');assert.equal(g.state.completedRuns,1);assert(!d.finishCelebration.active);assert(d.careerMenuOpen);assert(!earned.ids.get('delivery-receipt-menu').hidden);assert(!earned.ids.get('receipt-vehicle-unlock').hidden);
 console.log('PASS legitimate finish app: saved BMW unlock, receipt deferred until hangar, platform pause preserves sequence, no duplicate reward.');
}finally{earned.dispose();}

const bmw=createAppDom({search:'?dev=1',startDriving:false});
try{
 const d=bmw.debug,g=d.gameplay;g.state.cooldown=0;assert(d.enterVehicle('bmwreward'));
 const a=routePointAtProgress(LINE.progress-1),b=routePointAtProgress(LINE.progress+1);
 Object.assign(d.model.state,{x:b.x,z:b.z,heading:b.heading,routeContext:b,velocityX:-Math.sin(b.heading)*10,velocityZ:-Math.cos(b.heading)*10,linearSpeed:10});
 g.drive(0,a.x,a.z);g.drive(0,b.x,b.z);bmw.frame();assert.equal(g.state.eventMode,'finish');assert.equal(g.state.finishKind,'main');
 bmw.win.dispatch('keydown',{code:'KeyS',key:'s'});const speed=d.model.state.linearSpeed;for(let i=0;i<5;i++)bmw.frame();assert(d.model.state.braking>0);assert(d.model.state.linearSpeed<speed);
 bmw.win.dispatch('keyup',{code:'KeyS',key:'s'});bmw.win.dispatch('keydown',{code:'KeyW',key:'w'});const slowed=d.model.state.linearSpeed;for(let i=0;i<5;i++)bmw.frame();assert(d.model.state.linearSpeed>slowed);
 bmw.win.dispatch('keydown',{code:'ShiftLeft',key:'Shift'});bmw.frame();assert.equal(d.model.state.handbrake,1);
 const bridge=BRIDGES.find(b=>b.biome==='forest'),edge=routePointAtProgress((bridge.from+bridge.to)/2);Object.assign(d.model.state,{x:edge.x+edge.right.x*(bridge.offset+1.3),z:edge.z+edge.right.z*(bridge.offset+1.3),heading:edge.heading,routeContext:edge});
 for(let i=0;i<5;i++)bmw.frame();assert.equal(g.state.eventMode,'finish','bridge failure cannot replace settled finish');assert.equal(g.state.mode,'driving');
 assert.equal(g.state.money,0);assert.equal(g.state.completedRuns,0);
 console.log('PASS actual app BMW finish: brake/handbrake and throttle response remain active; dev gets no saved reward.');
}finally{bmw.dispose();}
