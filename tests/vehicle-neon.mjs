import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameplay} from '../dist/gameplay.js';
import {freshCareer,sanitizeCareer} from '../dist/career-save.js';
import {VEHICLE_NEON_CATALOG} from '../dist/vehicle-neon-catalog.js';
const vehicles=[{id:'pickup',park:{x:40,z:40}}];
test('a coin neon purchase charges once, equips fleet-wide and survives sanitized reload',()=>{
 const color=VEHICLE_NEON_CATALOG.find(x=>x.currency==='coins');assert.ok(color,'coin colors exist');
 let saved;const game=createGameplay({vehicles,career:{...freshCareer(),money:100000},persistence:{save(v){saved=v;return true;}}});
 assert.equal(game.buyNeon(color.id),true);assert.equal(game.state.money,80000);assert.equal(game.state.selectedNeonId,color.id);
 assert.equal(game.buyNeon(color.id),true);assert.equal(game.state.money,80000);
 const next=createGameplay({vehicles,career:sanitizeCareer(saved)});assert.equal(next.state.selectedNeonId,color.id);assert.ok(next.state.ownedNeonIds.includes(color.id));
 assert.equal(next.selectNeon(null),true);assert.equal(next.state.selectedNeonId,null);
});
test('insufficient funds, unknown and premium colors cannot spend coins or equip unowned neon',()=>{
 const game=createGameplay({vehicles,career:{...freshCareer(),money:19999}});
 for(const item of VEHICLE_NEON_CATALOG){assert.equal(game.buyNeon(item.id),false);assert.equal(game.selectNeon(item.id),false);}
 assert.equal(game.buyNeon('bad'),false);assert.equal(game.state.money,19999);
 const paid=VEHICLE_NEON_CATALOG.find(x=>x.currency==='yandex');assert.ok(paid);assert.equal(game.grantPremiumNeon(paid.id),true);assert.equal(game.selectNeon(paid.id),true);
 assert.equal(sanitizeCareer({...freshCareer(),selectedNeonId:'blue'}).selectedNeonId,null);
});
test('permanent neon SDK entitlement is restored and a cancelled purchase never grants ownership',async()=>{
 const {createPremiumSkins}=await import('../dist/premium-skins.js');
 const platform={id:'yandex',getCatalog:async()=>[{id:'neon_red',price:'39'},{id:'neon_cyan',price:'39'}],getPurchases:async()=>[{productID:'neon_red'}],purchase:async()=>{throw Error('cancelled');}};
 const shop=createPremiumSkins({platform,ids:['red','cyan'],productId:id=>`neon_${id}`});await shop.initialize();assert.ok(shop.ownedIds.has('red'));assert.equal(await shop.purchase('cyan'),false);assert.equal(shop.ownedIds.has('cyan'),false);
});
test('underglow follows every car body, changes color without accumulating meshes and disposes',async()=>{
 const THREE=await import('../dist/vendor/three.module.js');const {createFleetNeon}=await import('../dist/vehicle-neon.js');
 const fleet=createFleetNeon(THREE);const cars=[1,2,3].map(size=>{const group=new THREE.Group(),body=new THREE.Group();group.add(body);body.add(new THREE.Mesh(new THREE.BoxGeometry(size,1,4),new THREE.MeshBasicMaterial()));return {group,body};});
 fleet.setColor('red');for(const car of cars)fleet.attach(car);assert.equal(fleet.size,3);
 for(const car of cars){const glow=car.body.children.find(x=>x.name==='vehicle-underglow');assert.ok(glow);assert.ok(glow.visible);assert.equal(glow.children[0].material.color.getHex(),0xff254b);}
 fleet.setColor('blue');fleet.attach(cars[0]);assert.equal(cars[0].body.children.length,2);assert.equal(cars[0].body.children[1].children[0].material.color.getHex(),0x3575ff);
 fleet.setColor(null);for(const car of cars)assert.equal(car.body.children[1].visible,false);
 fleet.dispose();for(const car of cars)assert.equal(car.body.children.length,1);
});
