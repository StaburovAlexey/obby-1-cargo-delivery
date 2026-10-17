import assert from 'node:assert/strict';
import test from 'node:test';
import {createAppDom} from './fixtures/app-dom.mjs';
import {freshCareer} from '../dist/career-save.js';
import {translateGameText} from '../dist/localization.js';
import {updateProgressionHud} from '../dist/progression-hud.js';

// Catches the UI advertising a locked purchase as affordable and actionable.
test('locked garage cars show the required biome and cannot be bought with a full wallet',()=>{
 const f=createAppDom({startDriving:false,career:{...freshCareer(),money:100000}});
 try{
  const game=f.debug.gameplay,vehicle=f.debug.garage.vehicles.find(v=>v.id==='rover');f.debug.returnToGarage();
  Object.assign(game.state.player,vehicle.approach||vehicle.park);game.state.purchaseCandidateId='rover';f.frame();
  const button=f.ids.get('buy-vehicle');assert.equal(button.hidden,false);assert.equal(button.disabled,true);assert.equal(f.ids.get('buy-label').textContent,'Откройте: Лес');assert.match(button.getAttribute('aria-label'),/доедьте/);
  const notice=f.ids.get('biome-progress-notice');assert.equal(notice.hidden,true);assert.equal(notice.textContent,'');
  assert.match(f.ids.get('vehicle-price-value-'+(f.debug.garage.vehicles.indexOf(vehicle)+1)).textContent,/Лес/);button.dispatch('click');assert.equal(game.isOwned('rover'),false);assert.equal(game.state.money,100000);
  game.state.discoveredBiomeIds.push('forest');f.frame();assert.equal(button.disabled,false);assert.equal(f.ids.get('buy-label').textContent,'Купить 3200');
  button.dispatch('click');assert.equal(game.isOwned('rover'),true);assert.equal(game.state.money,96800);
 }finally{f.dispose();}
});

for(const search of ['', '?dev=1'])test('an opened biome without a suitable car keeps the garage free of instruction banners '+search,()=>{
 const f=createAppDom({startDriving:false,search,career:{...freshCareer(),ownedVehicleIds:['pickup','citycourier'],discoveredBiomeIds:['city','forest']}});
 try{
  f.debug.returnToGarage();f.frame();const notice=f.ids.get('biome-progress-notice');assert.equal(notice.hidden,true);assert.equal(notice.textContent,'');
  f.debug.gameplay.state.ownedVehicleIds.push('rover');f.frame();assert.equal(notice.hidden,true);
 }finally{f.dispose();}
});

// Catches new instructions being left in Russian when the rest of the game is English.
test('biome locks and discovery instructions translate with the vehicle and biome names',()=>{
 assert.equal(translateGameText('Сначала доедьте до биома «Лес» на машине прошлого биома.','en'),'First reach the Forest biome in a vehicle from the previous biome.');
 assert.equal(translateGameText('Откройте: Лес','en'),'Discover: Forest');
 assert.equal(translateGameText('Открыт биом «Лес». Для доставок здесь нужна местная машина. В ангаре доступен Внедорожник.','en'),'Forest biome discovered. Deliveries here require a local vehicle. Off-roader is available in the hangar.');
});

// Catches the return instruction appearing before the visit has actually unlocked purchases.
test('the boundary instruction keeps the player driving until the biome has really opened',()=>{
 const f=createAppDom({startDriving:false,career:{...freshCareer(),ownedVehicleIds:['pickup','citycourier']}});
 try{
  const game=f.debug.gameplay;game.state.cooldown=0;assert.ok(game.enter('citycourier'));
  const render=routeProgress=>updateProgressionHud(f.doc,{gameplay:game,playing:true,driving:true,upgradeMenuOpen:false,routeProgress});
  render(3000);const notice=f.ids.get('biome-progress-notice');assert.equal(notice.hidden,false);assert.match(notice.textContent,/дальше/);assert.doesNotMatch(notice.textContent,/Вернитесь/);assert.equal(game.getVehicleAvailability('rover').purchasable,false);
  game.state.discoveredBiomeIds.push('forest');render(3026);assert.match(notice.textContent,/Вернитесь/);assert.equal(game.getVehicleAvailability('rover').purchasable,true);
  render(2990);assert.equal(notice.hidden,true);
 }finally{f.dispose();}
});
