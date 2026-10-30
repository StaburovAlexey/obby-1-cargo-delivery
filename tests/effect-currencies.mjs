import test from 'node:test';
import assert from 'node:assert/strict';
import {SHOP_COSMETICS,PREMIUM_COSMETIC_PRODUCTS,premiumCosmeticProductId} from '../dist/shop-cosmetics.js';
import {createGameplay} from '../dist/gameplay.js';
import {freshCareer} from '../dist/career-save.js';
import {createPremiumSkins} from '../dist/premium-skins.js';
import {getAffordablePurchases} from '../dist/purchase-notifications.js';

test('half of each effect catalogue costs 2000 XP and exactly lightning/rainbow tracks are paid',()=>{
 for(const [type,count]of [['tracks',4],['smoke',3]])assert.equal(SHOP_COSMETICS.filter(p=>p.type===type&&p.xp).length,count);
 assert.deepEqual(SHOP_COSMETICS.filter(p=>p.type==='tracks'&&p.premium).map(p=>p.id).sort(),['lightning','rainbow']);
});
for(const item of SHOP_COSMETICS.filter(p=>p.xp)){
 test(`${item.key} charges XP once, keeps money and restores its selection`,()=>{
  const g=createGameplay({career:{...freshCareer(),brains:1999,money:100000}});
  assert.equal(g.getCosmeticOffer(item.type,item.id).price,2000);
  assert.equal(g.buyCosmetic(item.type,item.id),false);
  g.state.brains=2000;assert.equal(g.buyCosmetic(item.type,item.id),true);
  assert.equal(g.state.brains,0);assert.equal(g.state.money,100000);
  assert.equal(g.buyCosmetic(item.type,item.id),true);assert.equal(g.state.brains,0);
  const next=createGameplay({career:g.snapshot()});assert.equal(next.getCosmeticOffer(item.type,item.id).selected,true);
 });
}
for(const id of ['rainbow','lightning']){
 test(`${id} requires a confirmed 39 RUB product, never XP or coins`,async()=>{
  const key=`tracks:${id}`,product=PREMIUM_COSMETIC_PRODUCTS.find(p=>p.key===key);assert.equal(product.price,39);
  const g=createGameplay({career:{...freshCareer(),brains:100000,money:1000000}});
  assert.equal(g.buyCosmetic('tracks',id),false);
  const owned=[];const service=createPremiumSkins({ids:[key],productId:premiumCosmeticProductId,platform:{async getCatalog(){return [{id:product.productId,price:'39 ₽'}];},async getPurchases(){return owned;},async purchase(id){const result={productID:id};owned.push(result);return result;}}});
  await service.initialize();assert.equal(await service.purchase(key),true);assert.equal(g.grantPremiumCosmetic(key),true);
  assert.equal(g.buyCosmetic('tracks',id),true);assert.equal(g.state.brains,100000);assert.equal(g.state.money,1000000);
 });
}
test('affordable XP effects notify the shop even with no money',()=>{
 const g=createGameplay({career:{...freshCareer(),brains:1999,money:0}});
 assert.equal(getAffordablePurchases(g).shop,false);g.state.brains=2000;assert.equal(getAffordablePurchases(g).shop,true);
});
test('previously purchased effects retain ownership and never charge again',()=>{
 const g=createGameplay({career:{...freshCareer(),cosmetics:{owned:['smoke:hearts','tracks:rainbow'],smoke:'hearts',tracks:'rainbow'}}});
 assert.equal(g.buyCosmetic('smoke','hearts'),true);assert.equal(g.buyCosmetic('tracks','rainbow'),true);assert.equal(g.state.brains,0);assert.equal(g.state.money,0);
});
