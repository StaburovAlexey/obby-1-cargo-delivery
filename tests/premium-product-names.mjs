import test from 'node:test';
import assert from 'node:assert/strict';
import {PREMIUM_LIVERY_PRODUCTS} from '../dist/vehicle-livery-catalog.js';
import {vehicleConfig} from '../dist/economy-config.js';
test('paid livery names identify the actual vehicle in purchase dialogs',()=>{
 for(const product of PREMIUM_LIVERY_PRODUCTS){
  assert.ok(product.name.startsWith(vehicleConfig(product.vehicleId).name+' · '),product.productId);
  assert.doesNotMatch(product.name,/\[object Object\]/);
 }
});
