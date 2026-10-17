import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
import {FINISH_LINE_SPEC as LINE} from '../dist/finish-line.js';
import {routePointAtProgress} from '../dist/route-network.js';
const f=createAppDom({search:'?dev=1'});
try{
 const d=f.debug,g=d.gameplay;
 assert(d.setBiomeMenu(true));f.ids.get('biome-go-finish').dispatch('click');
 f.frame();
 const move=q=>{const p=routePointAtProgress(q);Object.assign(d.model.state,{x:p.x,z:p.z,heading:p.heading,routeContext:p});d.model.pause();f.frame();};
 move(LINE.progress-1);move(LINE.progress+1);
 assert.equal(g.state.eventMode,'finish');assert(d.finishCelebration.active);assert.equal(g.state.routeCompletion,null);assert.equal(g.state.money,0);
 const fuel=g.state.fuels[g.state.selectedId],x=d.model.state.x,z=d.model.state.z;
 assert.equal(d.setBiomeMenu(true),false);assert.equal(d.setDriving(false),false);assert.equal(d.setUpgradeMenu(true),false);assert.equal(d.returnToGarage(),false);
 f.ids.get('garage-button').dispatch('click');assert.equal(g.state.eventMode,'finish');
 f.frame();assert.equal(d.model.state.x,x);assert.equal(d.model.state.z,z);assert.equal(g.state.fuels[g.state.selectedId],fuel);
 const remaining=g.state.finishRemaining;
 f.doc.hidden=true;for(let i=0;i<10;i++)f.frame();assert.equal(g.state.finishRemaining,remaining);f.doc.hidden=false;f.frame();assert.equal(g.state.finishRemaining,remaining);
 f.win.dispatch('blur');for(let i=0;i<10;i++)f.frame();assert.equal(g.state.finishRemaining,remaining);f.win.dispatch('focus');f.frame();
 for(let i=0;i<140;i++)f.frame();assert.equal(g.state.mode,'walking');assert.equal(g.state.eventMode,null);assert(!d.finishCelebration.active);assert.equal(g.state.selectedId,null);assert.equal(g.state.money,0);
 const old=d.finishCelebration;d.rebuild(42);assert.equal(old.group.children.length,0);assert(!f.debug.finishCelebration.active);
 console.log('PASS headless app: crossing/confetti, frozen vehicle/fuel, blocked controls, hidden/blur pause, hangar after resume, rebuild disposal; no GPU rendering claimed.');
}finally{f.dispose();}

const {freshCareer}=await import('../dist/career-save.js');
const {createCareerRouteTracker}=await import('../dist/career-route-tracker.js');
const {rewardRoutePose}=await import('./fixtures/reward-career.mjs');
const earned=createAppDom({startDriving:false,career:{...freshCareer(),ownedVehicleIds:['pickup','ashhauler']}});
try{
 const d=earned.debug,g=d.gameplay;g.state.cooldown=0;assert(d.enterVehicle('ashhauler'));const tracker=createCareerRouteTracker();
 for(let q=-6;q<LINE.progress;q+=2){const p=rewardRoutePose(q);tracker.update(g,p,.05);g.drive(0,p.x,p.z);}
 const p=rewardRoutePose(LINE.progress+1);tracker.update(g,p,.05);Object.assign(d.model.state,{x:p.x,z:p.z,heading:p.heading,routeContext:p});g.drive(0,p.x,p.z);
 earned.frame();assert(d.finishCelebration.active);assert(g.isOwned('bmwreward'));assert(!d.careerMenuOpen);assert(earned.ids.get('delivery-receipt-menu').hidden);
 d.pauseState.set('platform',true);const remain=g.state.finishRemaining;for(let i=0;i<20;i++)earned.frame();assert.equal(g.state.finishRemaining,remain);d.pauseState.set('platform',false);
 for(let i=0;i<140;i++)earned.frame();assert.equal(g.state.mode,'walking');assert.equal(g.state.completedRuns,1);assert(!d.finishCelebration.active);assert(d.careerMenuOpen);assert(!earned.ids.get('delivery-receipt-menu').hidden);assert(!earned.ids.get('receipt-vehicle-unlock').hidden);
 console.log('PASS legitimate finish app: saved BMW unlock, receipt deferred until hangar, platform pause preserves sequence, no duplicate reward.');
}finally{earned.dispose();}
