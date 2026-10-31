import {SHOP_COSMETICS} from '../dist/shop-cosmetics.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameplay} from '../dist/gameplay.js';
import {freshCareer} from '../dist/career-save.js';
import {createInputDom} from './fixtures/vehicle-input-dom.mjs';
import {getAffordablePurchases,updatePurchaseNotifications} from '../dist/purchase-notifications.js';
import {getUpgradeOffer} from '../dist/vehicle-upgrades.js';
import {VEHICLE_NEON_CATALOG} from '../dist/vehicle-neon-catalog.js';
const game=()=>createGameplay({career:freshCareer()});
test('upgrade notification appears at the exact XP threshold and clears after spending',()=>{
 const g=game(),price=getUpgradeOffer('pickup','handling',g.state.upgrades.pickup).price;
 g.state.brains=price-1;assert.equal(getAffordablePurchases(g).upgrade,false);
 g.state.brains=price;assert.equal(getAffordablePurchases(g).upgrade,true);
 assert.equal(g.buyUpgrade('handling'),true);assert.equal(getAffordablePurchases(g).upgrade,false);
});
test('maxed upgrades do not notify, but the next affordable tire set does',()=>{
 const g=game();for(const stat of ['speed','handling','grip','fuel'])g.state.upgrades.pickup[stat]=10;
 g.state.brains=0;assert.equal(getAffordablePurchases(g).upgrade,false);
 g.state.brains=100000;assert.equal(getAffordablePurchases(g).upgrade,true);
 g.state.tyreTier=4;assert.equal(getAffordablePurchases(g).upgrade,false);
});
test('shop notification ignores paid products and already owned coin products',()=>{
 const g=game();g.state.money=19999;assert.equal(getAffordablePurchases(g).shop,false);
 g.state.money=20000;assert.equal(getAffordablePurchases(g).shop,true);
 g.state.ownedNeonIds=VEHICLE_NEON_CATALOG.filter(n=>n.currency==='coins').map(n=>n.id);
 g.state.cosmetics.owned=SHOP_COSMETICS.filter(item=>!item.free).map(item=>item.key);
 assert.equal(getAffordablePurchases(g).shop,false);
});
test('developer mode uses the same affordable shop purchases as production',()=>{
 const g=game();g.state.money=100000;assert.equal(getAffordablePurchases(g,{developerMode:true}).shop,true);
});

test('launcher classes follow changing balances without clearing when the same view refreshes',()=>{
 const g=game(),{doc,root}=createInputDom(),nodes=new Map();
 doc.getElementById=id=>{if(!nodes.has(id))nodes.set(id,new root.constructor());return nodes.get(id);};
 const render=()=>updatePurchaseNotifications(doc,{gameplay:g});
 g.state.brains=150;g.state.money=20000;render();
 for(const id of ['upgrade-button','livery-shop-button'])assert.equal(nodes.get(id).classList.contains('has-affordable-purchase'),true);
 render();assert.equal(nodes.get('upgrade-button').classList.contains('has-affordable-purchase'),true);
 g.state.brains=0;g.state.money=0;render();
 for(const id of ['upgrade-button','livery-shop-button'])assert.equal(nodes.get(id).classList.contains('has-affordable-purchase'),false);
});

test('developer purchases spend coins and retain ownership just like production',()=>{
 const g=createGameplay({career:{...freshCareer(),money:1000000},developerMode:true});
 const item=VEHICLE_NEON_CATALOG.find(n=>n.currency==='coins');
 assert.equal(g.buyNeon(item.id),true);
 assert.equal(g.state.money,980000);
 assert.ok(g.state.ownedNeonIds.includes(item.id));
 assert.equal(g.state.selectedNeonId,item.id);
 assert.equal(g.buyNeon(item.id),true);
 assert.equal(g.state.money,980000,'selecting an owned color never charges twice');
});

test('initial nitro purchase notifies the upgrade icon, not the cosmetic shop',()=>{
 const g=createGameplay({developerMode:true,career:{...freshCareer(),money:20000,brains:2000}});
 for(const stat of ['speed','handling','grip','fuel'])g.state.upgrades.pickup[stat]=10;
 g.state.tyreTier=4;
 g.state.ownedNeonIds=VEHICLE_NEON_CATALOG.filter(n=>n.currency==='coins').map(n=>n.id);
 g.state.cosmetics.owned=SHOP_COSMETICS.filter(item=>!item.free).map(item=>item.key);
 assert.deepEqual(getAffordablePurchases(g),{upgrade:true,shop:false});
 assert.equal(g.buyNitro(1),true);assert.deepEqual(getAffordablePurchases(g),{upgrade:false,shop:false});
});
