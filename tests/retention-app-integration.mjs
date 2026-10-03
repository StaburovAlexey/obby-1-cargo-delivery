import assert from 'node:assert/strict';
import {createAppDom} from './fixtures/app-dom.mjs';
import {ECONOMY_CONFIG} from '../dist/economy-config.js';
const app=createAppDom({startDriving:false}),d=app.debug;
try{
 app.frame();const panel=app.ids.get('career-panel'),select=app.ids.get('career-goal-select');
 assert.equal(panel.hidden,true);assert.equal(app.ids.get('career-goal-button').hidden,true);
 app.ids.get('career-goal-button').dispatch('click');assert.equal(panel.hidden,true);assert.equal(d.gameplay.getVehicleGoal(),null);
 // Existing saved goals remain valid even though the launcher is retired.
 d.gameplay.setVehicleGoal('citycourier');app.frame();assert.equal(d.gameplay.getVehicleGoal().id,'citycourier');
 select.value='rover';select.dispatch('change');assert.equal(d.gameplay.getVehicleGoal().id,'citycourier');
 let saved=JSON.parse(app.storage.getItem(ECONOMY_CONFIG.saveKey));assert.equal(saved.retention.goalVehicleId,'citycourier');
 app.ids.get('career-mission-button').dispatch('click');const beforeSequence=d.gameplay.state.retention.missionSequence;app.ids.get('career-mission-skip').dispatch('click');assert.equal(d.gameplay.state.retention.missionSequence,beforeSequence+1);
 app.ids.get('career-close').dispatch('click');d.gameplay.state.cooldown=0;d.enterVehicle('pickup');app.frame();assert.equal(panel.hidden,true);
 const delivery=d.garage.deliveries[0];d.gameplay.drive(0,delivery.x,delivery.z);app.frame();
 assert.equal(d.driving,false);assert.equal(panel.hidden,true);assert.equal(app.ids.get('delivery-receipt').hidden,false);
 assert.equal(d.gameplay.state.money,delivery.reward+Math.floor(.2*delivery.reward)+Math.floor(.05*delivery.reward));
 assert.equal(app.ids.get('session-note').textContent||'','');
 const balance=d.gameplay.state.money;d.gameplay.drive(0,delivery.x,delivery.z);app.frame();assert.equal(d.gameplay.state.money,balance);
 app.ids.get('delivery-receipt-close').dispatch('click');app.frame();assert.equal(app.ids.get('delivery-receipt').hidden,true);
 saved=JSON.parse(app.storage.getItem(ECONOMY_CONFIG.saveKey));assert(saved.retention.claimedCheckpointIds.includes(delivery.id.replace(/^delivery-/,'')));
 console.log('PASS integrated app: retired savings launcher and existing goal persistence, mission change, driving suppression, delivery receipt and once-only saved milestone. CPU/mock only.');
}finally{app.dispose();}
