import test from 'node:test';
import assert from 'node:assert/strict';
import {PREMIUM_LIVERY_PRODUCTS,VEHICLE_LIVERY_CATALOG,premiumLiveryProductId} from '../dist/vehicle-livery-catalog.js';
import {createPremiumSkins} from '../dist/premium-skins.js';
import {SHOP_COSMETICS} from '../dist/shop-cosmetics.js';
import {freshCareer} from '../dist/career-save.js';
import {createGameplay} from '../dist/gameplay.js';

test('each car has exactly one stable paid non-base livery at the nominal 39 RUB price',()=>{
 assert.equal(PREMIUM_LIVERY_PRODUCTS.length,VEHICLE_LIVERY_CATALOG.length);
 assert.equal(new Set(PREMIUM_LIVERY_PRODUCTS.map(p=>p.productId)).size,PREMIUM_LIVERY_PRODUCTS.length);
 for(const vehicle of VEHICLE_LIVERY_CATALOG){
  const items=SHOP_COSMETICS.filter(p=>p.vehicleId===vehicle.id&&p.premium);assert.equal(items.length,1);
  assert.notEqual(items[0].id,'base');const product=PREMIUM_LIVERY_PRODUCTS.find(p=>p.key===items[0].key);
  assert.equal(product.price,39);assert.equal(product.currency,'RUB');
 }
});
test('coins never buy a paid livery; a confirmed platform purchase grants permanent ownership',async()=>{
 const item=PREMIUM_LIVERY_PRODUCTS.find(p=>p.vehicleId==='pickup');let purchases=[],calls=0;
 const platform={async getCatalog(){return [{id:item.productId,price:'39 ₽',priceValue:39,priceCurrencyCode:'RUB'}];},async getPurchases(){return purchases;},async purchase(id){calls++;const p={productID:id};purchases.push(p);return p;}};
 const service=createPremiumSkins({platform,ids:PREMIUM_LIVERY_PRODUCTS.map(p=>p.key),productId:premiumLiveryProductId});await service.initialize();
 const g=createGameplay({career:{...freshCareer(),money:1000000}});
 assert.equal(g.buyCosmetic('livery',item.liveryId,item.vehicleId),false);assert.equal(g.state.money,1000000);
 assert.equal(await service.purchase(item.key),true);assert.equal(g.grantPremiumCosmetic(item.key),true);
 assert.equal(g.buyCosmetic('livery',item.liveryId,item.vehicleId),true);assert.equal(g.state.money,1000000);
 const next=createGameplay({career:g.snapshot()});assert.equal(next.getCosmeticOffer('livery',item.liveryId,item.vehicleId).owned,true);
 assert.equal(await service.purchase(item.key),true);assert.equal(calls,1);
});
test('cancellation and missing catalog do not grant paid products or spend coins',async()=>{
 const item=PREMIUM_LIVERY_PRODUCTS[0];let catalog=[];
 const platform={async getCatalog(){return catalog;},async getPurchases(){return [];},async purchase(){throw Error('cancelled');}};
 const service=createPremiumSkins({platform,ids:[item.key],productId:premiumLiveryProductId});await service.initialize();
 assert.equal(await service.purchase(item.key),false);
 catalog=[{id:item.productId,price:'39 ₽'}];await service.initialize();assert.equal(await service.purchase(item.key),false);
 assert.equal(service.ownedIds.has(item.key),false);
});
test('a livery previously bought for coins remains owned after the pricing change',()=>{
 const item=PREMIUM_LIVERY_PRODUCTS.find(p=>p.vehicleId==='pickup');
 const g=createGameplay({career:{...freshCareer(),cosmetics:{owned:[item.key],liveries:{pickup:item.liveryId}}}});
 assert.equal(g.getCosmeticOffer('livery',item.liveryId,'pickup').owned,true);
 assert.equal(g.buyCosmetic('livery',item.liveryId,'pickup'),true);assert.equal(g.state.money,0);
});

test('paid livery ownership survives cloud career schema migration',async()=>{
 const {createCloudCareer}=await import('../dist/cloud-career.js');
 const item=PREMIUM_LIVERY_PRODUCTS.find(p=>p.vehicleId==='pickup');
 const career={...freshCareer(),cosmetics:{owned:[],premiumOwned:[item.key],liveries:{pickup:item.liveryId},smoke:'standard',tracks:'standard'}};
 career.version--;
 const platform={async loadSave(){return {version:1,updatedAt:1,career,settings:{},legacyPremiumIds:[]};},async saveSave(){}};
 const cloud=createCloudCareer({platform,legacyStorage:null});
 try{
  const loaded=await cloud.initialize();assert.ok(loaded.career.cosmetics.premiumOwned.includes(item.key));
  assert.equal(loaded.career.cosmetics.liveries.pickup,item.liveryId);
 }finally{cloud.destroy();}
});
