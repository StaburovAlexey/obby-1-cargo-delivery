import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
const f=createAppDom({startDriving:false});
try{
 const d=f.debug,el=id=>f.ids.get('hangar-drift-'+id);f.frame();
 assert(!el('button').hidden,'trophy visible while walking in hangar');
 el('button').focus();el('button').dispatch('click');assert(d.hangarLeaderboardOpen);assert(!el('menu').hidden);
 const before={...d.gameplay.state.player},hazards=d.roadHazards.elapsed;
 f.win.dispatch('keydown',{code:'KeyW',key:'w'});for(let i=0;i<10;i++)f.frame();
 assert.equal(d.gameplay.state.player.x,before.x);assert.equal(d.gameplay.state.player.z,before.z);assert.equal(d.roadHazards.elapsed,hazards);
 assert.equal(d.enterVehicle('pickup'),false);assert.equal(d.requestJump(),false);assert.equal(d.setUpgradeMenu(true),false);assert.equal(d.setBiomeMenu(true),false);
 assert.equal(d.canyon.active,false);f.doc.dispatch('keydown',{key:'Escape'});assert(!d.hangarLeaderboardOpen);assert(el('menu').hidden);assert.equal(f.doc.activeElement,el('button'));
 d.gameplay.state.player.x=500;d.gameplay.state.player.z=500;f.frame();assert(el('button').hidden);assert.equal(await d.hangarLeaderboardUi.open(),false);
 d.returnToGarage();f.frame();assert(!el('button').hidden);d.gameplay.state.cooldown=0;d.enterVehicle('pickup');assert(el('button').hidden,'trophy hidden when driving');assert.equal(await d.hangarLeaderboardUi.open(),false);
 console.log('PASS hangar leaderboard app: hangar-only, input/physics paused, no canyon start, Escape focus restore.');
}finally{f.dispose();}
