import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameplay} from '../dist/gameplay.js';
import {freshCareer} from '../dist/career-save.js';
import {CHARACTER_CATALOG} from '../dist/character-catalog.js';
import {CHARACTER_STANDS} from '../dist/garage-scene.js';
import {createPremiumSkins} from '../dist/premium-skins.js';
import {initializeYandexPlatform} from '../dist/yandex-platform.js';

const jeff='jeff-the-killer';
const product={id:'skin_jeff-the-killer',title:'Jeff the Killer',description:'Permanently unlock Jeff the Killer.',price:'39 YAN',priceValue:'39',priceCurrencyCode:'YAN',getPriceCurrencyImage:()=>'/currency.svg'};

test('Jeff cannot be bought with game money even at his stand with sufficient funds',()=>{
  const game=createGameplay({career:{...freshCareer(),money:10000},stands:CHARACTER_STANDS});
  const stand=CHARACTER_STANDS[CHARACTER_CATALOG.findIndex(entry=>entry.id===jeff)];
  game.state.player={...stand.trigger,heading:0};
  assert.equal(game.buySkin(jeff),false);
  assert.equal(game.state.money,10000);
  assert.equal(game.isSkinOwned(jeff),false);
  assert.equal(game.setCharacter(jeff),false);
});

test('Jeff uses his Yandex product ID and confirmed permanent purchase unlocks selection without spending game money',async()=>{
  const calls=[];let purchases=[];
  const platform=await initializeYandexPlatform({sdk:{on(){},environment:{i18n:{lang:'ru'}},getPayments:async()=>({
    getCatalog:async()=>[product],getPurchases:async()=>purchases,
    purchase:async request=>{calls.push(request);purchases=[{productID:'skin_jeff-the-killer',purchaseToken:'jeff-test-token'}];return purchases[0];}
  })}});
  const premium=createPremiumSkins({platform});await premium.initialize();
  assert.equal(premium.catalog.get(jeff),product);
  assert.equal(await premium.purchase(jeff),true);
  assert.deepEqual(calls,[{id:'skin_jeff-the-killer'}]);
  const game=createGameplay({career:{...freshCareer(),money:812}});
  assert.equal(game.grantPremiumSkin(jeff),true);
  assert.equal(game.setCharacter(jeff),true);
  assert.equal(game.snapshot().characterId,jeff);
  assert.equal(game.state.money,812);
  const restored=createPremiumSkins({platform});await restored.initialize();
  assert.equal(restored.ownedIds.has(jeff),true);
  assert.equal(await restored.purchase(jeff),true);
  assert.equal(calls.length,1,'restored ownership must not open another payment');
  platform.destroy();
});

test('cancelled Jeff payment leaves the character locked',async()=>{
  const premium=createPremiumSkins({platform:{getCatalog:async()=>[product],getPurchases:async()=>[],purchase:async()=>{throw Error('cancelled');}}});
  await premium.initialize();
  assert.equal(await premium.purchase(jeff),false);
  assert.equal(premium.ownedIds.has(jeff),false);
  assert.equal(premium.status.reason,'cancelled');
});
