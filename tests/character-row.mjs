#!/usr/bin/env node


import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import { buildCity } from '../dist/scene.js';
import { createGarageScene, GARAGE_LAYOUT, CHARACTER_STANDS, REWARD_PEDESTAL } from '../dist/garage-scene.js';
import { freshCareer } from '../dist/career-save.js';
import { SCHOOL_CONFIG, SKIN_CONFIG } from '../dist/progression-config.js';
import { createGameplay } from '../dist/gameplay.js';
import { BACON_HEIGHT, CHARACTER_CATALOG, loadCharacter, createCharacterDisplay, clearCharacterCache } from '../dist/character.js';
import { createFollowCameraState, computeFollowOffset } from '../dist/follow-camera.js';
import { updateProgressionWorldLabels, WORLD_LABEL_DROP } from '../dist/progression-hud.js';

globalThis.self = globalThis;
globalThis.ProgressEvent = class { constructor(type, values) { Object.assign(this, { type }, values); } };
globalThis.createImageBitmap = async blob => {
  const bytes = Buffer.from(await blob.arrayBuffer());
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), close() {} };
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async request => {
  const url = typeof request === 'string' ? request : request.url;
  if (url.startsWith('blob:')) return originalFetch(request);
  assert.ok(url.startsWith('file:'), `Unexpected non-local request: ${url}`);
  return new Response(fs.readFileSync(new URL(url)), { status: 200 });
};


const appSource = fs.readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8');
const displaySetup = appSource.slice(appSource.indexOf('async function populateDisplays()'), appSource.indexOf('function standCharacter()'));
assert.ok(displaySetup.includes('createCharacterDisplay(THREE,{id:spec.id})'), 'purchase displays must use canonical player-height default');
assert.ok(!/display\.group\.scale/.test(displaySetup), 'purchase display size must not be overridden after normalization');

const expectedIds = ['bacon', 'pack1', 'pack2', 'pack3', 'pack4', 'pack5', 'pack6', 'pack7', 'pack9', 'pirate', 'robux-man', 'jeff-the-killer', 'spider-man', 'spyder-sammy', 'kreekcraft', 'jandel', 'dancing-npc-girl'];
assert.deepEqual(CHARACTER_CATALOG.map(entry => entry.id), expectedIds);
assert.equal(CHARACTER_STANDS.length, 17);
assert.equal(new Set(CHARACTER_STANDS.map(stand => stand.z)).size, 1);
assert.equal(new Set(CHARACTER_STANDS.map(stand => stand.trigger.z)).size, 1);
const rowShift = -5;
assert.equal((CHARACTER_STANDS[0].x + CHARACTER_STANDS.at(-1).x) / 2, GARAGE_LAYOUT.center.x + rowShift);
for (const [index, stand] of CHARACTER_STANDS.entries()) {
  assert.equal(stand.index, index);
  assert.equal(stand.x, -41 + rowShift + index * 3.5);
  assert.equal(stand.z, 85);
  assert.equal(stand.heading, 0);
  assert.deepEqual(stand.trigger, { x: stand.x, z: 82 });
  assert.equal(stand.triggerRadius, 1.25);
}


const camera = new THREE.PerspectiveCamera(50, 1440 / 900, .1, 1000);
const target = new THREE.Vector3(GARAGE_LAYOUT.spawn.x, 1.6, GARAGE_LAYOUT.spawn.z);
const rearCamera = createFollowCameraState({ mode: 'walking', heading: Math.PI });
camera.position.copy(target).add(computeFollowOffset(rearCamera.state, new THREE.Vector3()));
camera.lookAt(target);camera.updateMatrixWorld(true);
assert.ok(camera.getWorldDirection(new THREE.Vector3()).z > 0);
for (const stand of CHARACTER_STANDS) {
  const before = new THREE.Vector3(stand.x - rowShift, .17, stand.z).project(camera);
  const after = new THREE.Vector3(stand.x, .17, stand.z).project(camera);
  assert.ok(after.x > before.x, `stand ${stand.index}: must move screen-right in rear-facing view`);
}
assert.deepEqual(GARAGE_LAYOUT.bounds, { minX: -57, maxX: 31, minZ: 26, maxZ: 90 });
assert.deepEqual(GARAGE_LAYOUT.spawn, { x: 0, z: 60 });
assert.deepEqual(GARAGE_LAYOUT.bays.map(({ x, z }) => ({ x, z })), Array.from({ length: 10 }, (_, i) => ({ x: 24, z: 30 + i * 4.8 })));
assert.deepEqual({ x: REWARD_PEDESTAL.x, z: REWARD_PEDESTAL.z, radius: REWARD_PEDESTAL.radius }, { x: 24, z: (75.169616825+90)/2, radius: 4.9 });
console.log('PASS all 17 original IDs, platforms and markers move 5 m screen-right in rear-facing view; cars, pedestal, spawn and hangar bounds unchanged');

const city = buildCity(THREE, { seed: 42 });
const garage = createGarageScene(THREE, city);
garage.group.updateMatrixWorld(true);
const shell = garage.hangar.getObjectByName('Garage shell and flush bay markings');
const platformIndices = shell.userData.partNames.flatMap((name, index) => /^Character stand \d+$/.test(name) ? [index] : []);
const markerIndices = shell.userData.partNames.flatMap((name, index) => name === 'Character approach marker' ? [index] : []);
assert.equal(platformIndices.length, 17);
assert.equal(markerIndices.length, 17);
const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const bounds = [];
for (const stand of CHARACTER_STANDS) {
  shell.getMatrixAt(platformIndices[stand.index], matrix);
  position.setFromMatrixPosition(matrix);
  assert.ok(position.distanceTo(new THREE.Vector3(stand.x, .08, stand.z)) < 1e-6);
  const platform = new THREE.Box3(new THREE.Vector3(-.5, -.5, -.5), new THREE.Vector3(.5, .5, .5)).applyMatrix4(matrix).applyMatrix4(shell.matrixWorld);
  assert.ok(platform.min.x > GARAGE_LAYOUT.minX && platform.max.x < GARAGE_LAYOUT.maxX);
  assert.ok(platform.max.z < GARAGE_LAYOUT.rearZ);
  shell.getMatrixAt(markerIndices[stand.index], matrix);
  position.setFromMatrixPosition(matrix);
  assert.ok(position.distanceTo(new THREE.Vector3(stand.trigger.x, .018, stand.trigger.z)) < 1e-6);
  const player = await loadCharacter(THREE, { id: expectedIds[stand.index] });
  const playerBounds = new THREE.Box3().setFromObject(player.group, true);
  const display = await createCharacterDisplay(THREE, { id: expectedIds[stand.index] });
  const displayBounds = new THREE.Box3().setFromObject(display.group, true);
  const playerSize = playerBounds.getSize(new THREE.Vector3());
  const displaySize = displayBounds.getSize(new THREE.Vector3());
  assert.ok(Math.abs(playerSize.y - BACON_HEIGHT) < 1e-6, `${display.id} canonical player height`);
  assert.ok(Math.abs(displaySize.y - BACON_HEIGHT) < 1e-6, `${display.id} actual frozen GLB height`);
  assert.ok(displaySize.distanceTo(playerSize) < 1e-6, `${display.id} display/player actual vertex bounds differ`);
  assert.ok(Math.abs(displayBounds.min.y) < 1e-6, `${display.id} feet must stay anchored`);
  display.group.traverse(object => assert.ok(!object.isSkinnedMesh && !object.isBone, `${display.id} must remain static`));
  player.dispose();
  display.group.position.set(stand.x, .17, stand.z);
  display.group.updateMatrixWorld(true);
  const model = new THREE.Box3().setFromObject(display.group, true);
  assert.ok(!model.isEmpty(), expectedIds[stand.index]);
  assert.ok(model.min.x > GARAGE_LAYOUT.minX && model.max.x < GARAGE_LAYOUT.maxX, `${display.id} side-wall clearance`);
  assert.ok(model.max.z < GARAGE_LAYOUT.rearZ, `${display.id} rear-wall clearance`);
  assert.ok(Math.abs(model.min.y - .17) < 1e-6 && model.max.y < GARAGE_LAYOUT.roofHeight, `${display.id} floor/roof clearance`);
  assert.ok(platform.containsPoint(new THREE.Vector3(model.min.x, .08, model.min.z)) && platform.containsPoint(new THREE.Vector3(model.max.x, .08, model.max.z)), `${display.id} accessory overhangs its platform`);
  if (bounds.length) assert.ok(model.min.x > bounds.at(-1).model.max.x, `${display.id} overlaps previous frozen display`);
  bounds.push({ id: display.id, model, platform });
  display.dispose();
}
const displayGap = Math.min(...bounds.slice(1).map((item, index) => item.model.min.x - bounds[index].model.max.x));
const platformGap = Math.min(...bounds.slice(1).map((item, index) => item.platform.min.x - bounds[index].platform.max.x));
const sideClearance = Math.min(bounds[0].platform.min.x - GARAGE_LAYOUT.minX, GARAGE_LAYOUT.maxX - bounds.at(-1).platform.max.x);
const rearClearance = Math.min(...bounds.map(item => GARAGE_LAYOUT.rearZ - item.platform.max.z));
const pedestalGap = REWARD_PEDESTAL.x - REWARD_PEDESTAL.radius - bounds.at(-1).platform.max.x;
assert.ok(Math.abs(pedestalGap - 7.6) < 1e-6, `pedestal horizontal clearance: ${pedestalGap}`);
console.log(`PASS actual 17 frozen GLBs match player height/width/depth with anchored feet, including accessories: display gap >= ${displayGap.toFixed(3)} m, platform gap ${platformGap.toFixed(3)} m, side clearance ${sideClearance.toFixed(3)} m, rear clearance ${rearClearance.toFixed(3)} m`);
console.log(`PASS BMW pedestal horizontal gap ${(pedestalGap + rowShift).toFixed(3)} -> ${pedestalGap.toFixed(3)} m`);

let approachCount = 0;
for (const characterId of ['bacon', 'jandel']) {
  for (const stand of CHARACTER_STANDS) {
    for (const direction of [-1, 1]) {
      const gameplay = createGameplay({ vehicles: garage.vehicles, stations: garage.stations, desks: garage.desks, stands: garage.stands, solids: garage.walkingSolids, career: { ...freshCareer(), characterId, ownedSkinIds: expectedIds, ownedSchoolIds: SCHOOL_CONFIG.map(school=>school.id) } });
      const label = `${characterId} at stand ${stand.index} from ${direction > 0 ? 'left' : 'right'}`;
      const route = [GARAGE_LAYOUT.spawn, { x: 0, z: 70 }, { x: stand.trigger.x, z: 70 }, stand.trigger];
      for (let segment = 1; segment < route.length; segment++) {
        const a = route[segment - 1], b = route[segment], steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .1);
        for (let step = 0; step <= steps; step++) {
          const t = step / steps;
          assert.ok(gameplay.canWalk(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t), `${label}: route from spawn blocked`);
        }
      }
      gameplay.state.player = { x: stand.trigger.x - direction * 2, z: stand.trigger.z, heading: 0 };
      assert.ok(gameplay.canWalk(gameplay.state.player.x, gameplay.state.player.z), `${label}: start blocked`);
      for (let step = 0; step <= 40; step++) {
        assert.ok(gameplay.canWalk(stand.trigger.x - direction * 2 + direction * step * .05, stand.trigger.z), `${label}: approach blocked`);
      }
      const events = [];
      for (let step = 0; step < 26; step++) {
        gameplay.walk(1 / 60, { x: direction, z: 0 });
        events.push(...gameplay.events());
      }
      assert.deepEqual(events.filter(event => event.type === 'character').map(event => event.index), [stand.index], `${label}: wrong or repeated selection`);
      assert.equal(gameplay.state.blockedStand, stand.index);
      for (let step = 0; step < 600; step++) gameplay.walk(1 / 60, {});
      assert.equal(gameplay.events().filter(event => event.type === 'character').length, 0, `${label}: stationary retrigger`);

      for (let step = 0; step < 40; step++) gameplay.walk(1 / 60, { x: step % 2 ? .1 : -.1, z: 0 });
      assert.equal(gameplay.events().filter(event => event.type === 'character').length, 0, `${label}: movement retrigger before departure`);

      for (let step = 0; step < 60; step++) gameplay.walk(1 / 60, { x: 0, z: -1 });
      assert.equal(gameplay.state.blockedStand, null, `${label}: failed to rearm`);
      assert.equal(gameplay.events().filter(event => event.type === 'character').length, 0, `${label}: wrong marker on departure`);
      const returned = [];
      for (let step = 0; step < 60; step++) {
        gameplay.walk(1 / 60, { x: 0, z: 1 });
        returned.push(...gameplay.events());
      }
      assert.deepEqual(returned.filter(event => event.type === 'character').map(event => event.index), [stand.index], `${label}: re-entry failed`);
      approachCount++;
    }
  }
}
console.log(`PASS ${approachCount} lateral approaches across all 17 markers, both directions and both collision sizes; cooldown, stationary/moving debounce and departure/re-entry`);
const shop = createGameplay({ vehicles: garage.vehicles, desks: garage.desks, stands: garage.stands, solids: garage.walkingSolids, career: freshCareer() });
const elements = new Map();
const doc = { getElementById(id) {
  if (!elements.has(id)) elements.set(id, { id, dataset: {}, style: { setProperty() {} } });
  return elements.get(id);
} };
const projections = new Map();
updateProgressionWorldLabels(doc, { gameplay: shop, garage, playing: true, project(element, x, y, z, visible) {
  projections.set(element.id, { x, y, z, visible });element.hidden = !visible;return 0;
} });
for (const stand of CHARACTER_STANDS) {
  const skin = SKIN_CONFIG[stand.index], n = stand.index + 1;
  assert.equal(skin.id, expectedIds[stand.index]);
  assert.equal(elements.get(`skin-price-${n}`).textContent, String(skin.price));
  assert.deepEqual(projections.get(`skin-label-${n}`), { x: stand.x, y: 5 - WORLD_LABEL_DROP, z: stand.z, visible: !shop.isSkinOwned(skin.id) });
  shop.state.player = { x: stand.trigger.x, z: stand.trigger.z - 1.3, heading: 0 };shop.state.cooldown = 0;shop.state.interactionCooldown = 0;shop.state.blockedStand = null;
  for (let step = 0; step < 2; step++) shop.walk(.05, { x: 0, z: 1 });
  const events = shop.events();
  if (shop.isSkinOwned(skin.id)) assert.deepEqual(events.filter(event => event.type === 'character').map(event => event.id), [skin.id]);
  else {
    const prompts = events.filter(event => event.type === 'skin-purchase-prompt');
    assert.equal(prompts.length, 1);assert.equal(prompts[0].id, skin.id);assert.equal(prompts[0].price, skin.price);
    assert.equal(shop.state.skinPurchaseCandidateId, skin.id);
  }
}
console.log('PASS all 17 spawn routes, world-price anchors and owned/unowned selection prompts follow the relocated stands');
garage.dispose();
city.dispose();
clearCharacterCache();
globalThis.fetch = originalFetch;
