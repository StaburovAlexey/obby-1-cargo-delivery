import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../rsbuild.config.mjs';
import {freshCareer} from '../dist/career-save.js';

test('build targets select independent output directories and bootstrap modules', () => {
  const previous=process.env.GAME_PLATFORM;
  try {
    process.env.GAME_PLATFORM='yandex';const yandex=config({env:'production'});
    process.env.GAME_PLATFORM='vk';const vk=config({env:'production'});
    assert.equal(yandex.output.distPath.root,'build');
    assert.equal(vk.output.distPath.root,'build-vk');
    assert.notEqual(yandex.resolve.alias['@game-bootstrap'],vk.resolve.alias['@game-bootstrap']);
    assert.match(vk.resolve.alias['@game-bootstrap'],/bootstrap-vk\.js$/);
    process.env.GAME_PLATFORM='unknown';assert.throws(()=>config({env:'production'}),/platform/i);
  } finally {if(previous===undefined)delete process.env.GAME_PLATFORM;else process.env.GAME_PLATFORM=previous;}
});

test('VK startup never imports Yandex legacy progress or grants locally cached premium rights', async () => {
  const module=await import('../dist/platform-services.js').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;});
  assert.equal(typeof module.createGameServices,'function','shared platform services must exist');
  let writes=0;
  const save={version:1,updatedAt:10,settings:{language:'ru'},career:{...freshCareer(),ownedSkinIds:['bacon','jandel'],characterId:'jandel'},legacyPremiumIds:['jandel']};
  const platform={id:'vk',language:'en',loadSave:async()=>save,saveSave:async()=>{writes++;},getCatalog:async()=>[],getPurchases:async()=>[]};
  const services=await module.createGameServices({platform});
  assert.deepEqual(services.initialCareer.ownedSkinIds,['bacon']);
  assert.equal(services.initialCareer.characterId,'bacon');assert.equal(writes,0);
  services.cloud.destroy();
});
