import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
const app=createAppDom({startDriving:false}),d=app.debug;
try{
 app.frame();assert.equal(d.careerMenuOpen,false);assert.equal(app.ids.get('career-panel').hidden,true);
 for(const id of ['career-mission-button','career-mission-button','career-mission-button']){
  if(d.careerMenuOpen)app.ids.get('career-close').dispatch('click');
  app.ids.get(id).dispatch('click');assert.equal(d.careerMenuOpen,true);
  app.win.dispatch('keydown',{code:'KeyW',key:'w'});assert.equal(d.walkInput.sample().active,false);assert.equal(d.requestJump(),false);
  const p={...d.gameplay.state.player},money=d.gameplay.state.money,brains=d.gameplay.state.brains;
  for(let i=0;i<10;i++)app.frame();assert.deepEqual(d.gameplay.state.player,p);assert.equal(d.gameplay.state.brains,brains);
  app.ids.get('vehicle-funds-button').dispatch('click');assert.equal(d.gameplay.state.money,money);
 }
 app.ids.get('career-close').dispatch('click');assert.equal(d.careerMenuOpen,false);assert.equal(d.walkInput.sample().active,false);
 app.win.dispatch('keydown',{code:'KeyW',key:'w'});assert.equal(d.walkInput.sample().active,true);app.win.dispatch('keyup',{code:'KeyW',key:'w'});
 app.ids.get('career-goal-button').dispatch('click');assert.equal(d.careerMenuOpen,false);assert.equal(app.ids.get('career-goal-button').hidden,true);d.setDriving(false);assert.equal(d.careerMenuOpen,false);d.setDriving(true);assert.equal(d.careerMenuOpen,false);
 app.ids.get('career-mission-button').dispatch('click');d.gameplay.state.cooldown=0;d.enterVehicle('pickup');assert.equal(d.careerMenuOpen,false);assert.equal(app.ids.get('career-panel').hidden,true);
 console.log('PASS actual app closed-by-default dialogs, one modal, blocked walk/jump/rewards/background purchase, release/overview/driving resets. CPU/mock only.');
}finally{app.dispose();}
