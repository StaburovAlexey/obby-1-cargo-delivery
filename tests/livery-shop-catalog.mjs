import test from 'node:test';
import assert from 'node:assert/strict';
import { VEHICLE_CONFIG } from '../dist/economy-config.js';
import { BASE_VEHICLE_LIVERY_ID, VEHICLE_LIVERY_CATALOG, VEHICLE_LIVERY_VARIANTS, getVehicleLivery, vehicleLiveryName } from '../dist/vehicle-livery-catalog.js';

test('Every game car has its base and the four requested variants, including the reward BMW', () => {
  assert.equal(VEHICLE_LIVERY_CATALOG.length, 11);
  assert.deepEqual(VEHICLE_LIVERY_CATALOG.map(vehicle => vehicle.id), VEHICLE_CONFIG.map(vehicle => vehicle.id));
  assert.deepEqual(VEHICLE_LIVERY_VARIANTS.map(variant => variant.id), ['base', 'neon', 'anime', 'racing', 'biome']);
  for (const vehicle of VEHICLE_LIVERY_CATALOG) {
    assert.equal(vehicle.variants.length, 5);
    assert.ok(vehicle.name.ru);
    assert.ok(vehicle.name.en);
    assert.doesNotMatch(vehicle.name.en, /[А-Яа-яЁё]/u);
    assert.ok(Object.isFrozen(vehicle));
    assert.ok(Object.isFrozen(vehicle.name));
  }
  assert.equal(VEHICLE_LIVERY_CATALOG.at(-1).id, 'bmwreward');
  assert.equal(VEHICLE_LIVERY_CATALOG.at(-1).rewardOnly, true);
});

test('Ownership is immutable and base-only; no guessed currency, price, purchase, or unlock data', () => {
  assert.equal(BASE_VEHICLE_LIVERY_ID, 'base');
  assert.ok(Object.isFrozen(VEHICLE_LIVERY_CATALOG));
  assert.ok(Object.isFrozen(VEHICLE_LIVERY_VARIANTS));
  for (const vehicle of VEHICLE_LIVERY_CATALOG) for (const variant of vehicle.variants) {
    assert.equal(variant.owned, variant.id === 'base');
    assert.equal(variant.equipped, variant.id === 'base');
    assert.equal(variant.purchasable, false);
    for (const key of ['price', 'currency', 'cost', 'unlock']) assert.ok(!(key in variant));
    assert.ok(Object.isFrozen(variant));
    assert.throws(() => { variant.owned = true; }, TypeError);
  }
});

test('Catalog names localize and invalid identifiers are rejected rather than remapped', () => {
  assert.equal(vehicleLiveryName('pickup', 'neon', 'ru'), 'Неон');
  assert.equal(vehicleLiveryName('pickup', 'neon', 'en'), 'Neon');
  assert.equal(vehicleLiveryName('bmwreward', 'biome', 'en'), 'Premium');
  assert.equal(vehicleLiveryName('bmwreward', 'biome', 'ru'), 'Премиальная');
  assert.equal(vehicleLiveryName('not-a-car', 'base'), '');
  assert.equal(getVehicleLivery('pickup', 'invalid'), null);
  assert.equal(getVehicleLivery('invalid', 'base'), null);
});
