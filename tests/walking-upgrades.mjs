import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameplay} from '../dist/gameplay.js';
import {freshCareer} from '../dist/career-save.js';
import {getUpgradeOffer} from '../dist/vehicle-upgrades.js';
import {updateProgressionHud} from '../dist/progression-hud.js';
import {createInputDom} from './fixtures/vehicle-input-dom.mjs';

const game=()=>createGameplay({career:{...freshCareer(),brains:100000},developerMode:true});
function hudFixture(gameplay){
  const {doc,root}=createInputDom(),nodes=new Map();doc.body=root;
  doc.getElementById=id=>{
    if(!nodes.has(id))nodes.set(id,new root.constructor());
    return nodes.get(id);
  };
  const render=options=>updateProgressionHud(doc,{gameplay,playing:true,driving:false,upgradeMenuOpen:false,...options});
  return {doc,render,get:id=>doc.getElementById(id)};
}

test('walking HUD exposes upgrades, opens shared offers and retains overview/canyon hiding',()=>{
  const g=game(),f=hudFixture(g);
  f.render();assert.equal(f.get('upgrade-button').hidden,false);
  f.render({upgradeMenuOpen:true});assert.equal(f.get('upgrade-menu').hidden,false);
  assert.equal(f.get('upgrade-car-name').textContent,'Все обычные машины');
  assert.equal(f.get('upgrade-speed-level').textContent,'0 / 10');
  assert.equal(f.get('upgrade-speed-buy').disabled,false);
  f.render({playing:false});assert.equal(f.get('upgrade-button').hidden,true);
  f.render({controlsHidden:true});assert.equal(f.get('upgrade-button').hidden,true);
});

test('walking purchases upgrade the shared fleet without entering or moving a vehicle',()=>{
  const g=game(),before={...g.state.player};
  const price=getUpgradeOffer('pickup','speed',g.state.upgrades.pickup).price,balance=g.state.brains;
  assert.equal(g.buyUpgrade('speed'),true);
  assert.equal(g.state.brains,balance-price);
  assert.equal(g.state.sharedUpgrades.speed,1);
  assert.equal(g.state.upgrades.rover.speed,1);
  assert.equal(g.state.upgrades.bmwreward.speed,0);
  assert.equal(g.state.mode,'walking');assert.equal(g.state.selectedId,null);
  assert.deepEqual(g.state.player,before);
  const f=hudFixture(g);f.render({upgradeMenuOpen:true});
  assert.equal(f.get('upgrade-speed-level').textContent,'1 / 10');
});

test('walking tire purchases preserve price, tier order and test-run restrictions',()=>{
  const g=game(),offer=g.getTyreOffer(1),balance=g.state.brains;
  assert.equal(offer.purchasable,true);
  assert.equal(g.buyTyres(2),false);
  assert.equal(g.buyTyres(1),true);
  assert.equal(g.state.tyreTier,1);assert.equal(g.state.brains,balance-offer.price);
  g.state.testMode=true;assert.equal(g.buyTyres(2),false);
});

test('walking always targets shared upgrades, while driving the BMW targets its own levels',()=>{
  const g=game();g.state.selectedId='bmwreward';
  assert.equal(g.buyUpgrade('speed'),true);
  assert.equal(g.state.sharedUpgrades.speed,1);assert.equal(g.state.upgrades.bmwreward.speed,0);
  g.state.mode='driving';assert.equal(g.buyUpgrade('speed'),true);
  assert.equal(g.state.sharedUpgrades.speed,1);assert.equal(g.state.upgrades.bmwreward.speed,1);
});

test('walking cannot buy an upgrade without enough XP',()=>{
  const g=game();g.state.brains=0;
  assert.equal(g.buyUpgrade('speed'),false);
  assert.equal(g.state.sharedUpgrades.speed,0);assert.equal(g.state.brains,0);
});
