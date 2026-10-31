import test from 'node:test';
import assert from 'node:assert/strict';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';
import {getUpgradeModifiers,getVehiclePerformance,getUpgradeOffer,UPGRADE_STATS} from '../dist/vehicle-upgrades.js';
import {createGameplay} from '../dist/gameplay.js';
import {nitroCareer} from './fixtures/nitro-career.mjs';
const levels={speed:10,handling:10,grip:10,fuel:10};
for(const spec of VEHICLE_CONFIG.filter(v=>v.rewardDrift))test(`${spec.id}: old upgrades have no effect and cannot be purchased`,()=>{
 assert.deepEqual(getUpgradeModifiers(levels,spec.id),{speed:1,engine:1,handling:1,grip:1,fuel:1});
 assert.deepEqual(getVehiclePerformance(spec.id,levels),getVehiclePerformance(spec.id,{}));
 const vehicles=[{id:spec.id,park:{x:24,z:44}}],g=createGameplay({developerMode:true,career:nitroCareer(),vehicles});
 if(spec.devUnlock){g.state.player={x:24,z:44};assert.equal(g.unlockDeveloperVehicle(spec.id),true);}
 assert.equal(g.enter(spec.id),true);g.state.upgrades[spec.id]={...levels};const before=g.snapshot();
 for(const stat of UPGRADE_STATS){assert.equal(getUpgradeOffer(spec.id,stat.id,{}),null);assert.equal(g.buyUpgrade(stat.id),false);}
 assert.deepEqual(g.snapshot(),before);assert.deepEqual(g.state.upgrades[spec.id],levels);assert.equal(g.buyNitro(1),true);assert.equal(g.nitro.state.level,1);
});
test('ordinary upgrades retain their effects and availability',()=>{
 assert.ok(getVehiclePerformance('pickup',levels).maxSpeed>getVehiclePerformance('pickup',{}).maxSpeed);
 assert.ok(getUpgradeOffer('pickup','speed',{}));
});
