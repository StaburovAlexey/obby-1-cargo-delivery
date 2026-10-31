import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeYandexPlatform, resolveYandexLanguage, CLOUD_SAVE_KEY } from '../dist/yandex-platform.js';

function sdkFixture(language = 'ru') {
  const events = new Map(), calls = [];
  let data = {}, purchases = [];
  const player = { async getData(keys) { calls.push(['getData', keys]); return data; }, async setData(value, flush) { calls.push(['setData', value, flush]); data = value; } };
  const sdk = {
    environment: { i18n: { lang: language } },
    EVENTS: { ACCOUNT_SELECTION_DIALOG_OPENED: 'account-open', ACCOUNT_SELECTION_DIALOG_CLOSED: 'account-close' },
    on(name, fn) { calls.push(['on', name]); events.set(name, fn); }, off(name) { events.delete(name); },
    features: { LoadingAPI: { ready() { calls.push(['ready']); } }, GameplayAPI: { start() { calls.push(['start']); }, stop() { calls.push(['stop']); } } },
    async getPlayer() { calls.push(['getPlayer']); return player; },
    async getPayments() { return { async getCatalog() { return [{ id: 'skin_jandel', price: '39 YAN' }]; }, async getPurchases() { return purchases; }, async purchase({ id }) { const result = { productID: id }; purchases.push(result); return result; } }; },
    adv: { showFullscreenAdv({ callbacks }) { callbacks.onOpen(); callbacks.onClose(true); } },
  };
  return { sdk, calls, events, player };
}

test('language follows SDK and uses approved RU/EN fallback', () => {
  for (const lang of ['ru', 'be', 'kk', 'uk', 'uz', 'ru-RU']) assert.equal(resolveYandexLanguage(lang), 'ru');
  for (const lang of ['en', 'de', 'zh', undefined]) assert.equal(resolveYandexLanguage(lang), 'en');
});
test('SDK listeners attach before lazy player access and ready/start/stop are idempotent', async () => {
  const fixture = sdkFixture('kk'); let paused = 0, resumed = 0;
  const platform = await initializeYandexPlatform({ sdk: fixture.sdk, onPause: () => paused++, onResume: () => resumed++ });
  assert.equal(platform.language, 'ru');
  assert.equal(fixture.calls.some(([name]) => name === 'getPlayer'), false);
  platform.ready(); platform.ready(); platform.gameplayStart(); platform.gameplayStart();
  fixture.events.get('game_api_pause')(); platform.gameplayStart();
  fixture.events.get('game_api_resume')(); platform.gameplayStart(); platform.gameplayStop(); platform.gameplayStop();
  assert.equal(paused, 1); assert.equal(resumed, 1);
  assert.deepEqual(fixture.calls.filter(([name]) => ['ready', 'start', 'stop'].includes(name)).map(([name]) => name), ['ready', 'start', 'stop', 'start', 'stop']);
  platform.destroy(); assert.equal(fixture.events.size, 0);
});
test('cloud uses a namespaced payload with confirmed immediate writes', async () => {
  const fixture = sdkFixture(), platform = await initializeYandexPlatform({ sdk: fixture.sdk });
  assert.equal(await platform.loadSave(), null);
  const envelope = { version: 1, updatedAt: 100, career: {} };
  await platform.saveSave(envelope); assert.deepEqual(await platform.loadSave(), envelope);
  assert.deepEqual(fixture.calls.find(([name]) => name === 'setData'), ['setData', { [CLOUD_SAVE_KEY]: envelope }, true]);
  assert.equal(fixture.calls.filter(([name]) => name === 'getPlayer').length, 1);
});
test('catalog, permanent purchases and ad callbacks pass through official methods', async () => {
  const fixture = sdkFixture(), platform = await initializeYandexPlatform({ sdk: fixture.sdk });
  assert.equal((await platform.getCatalog())[0].price, '39 YAN');
  await platform.purchase('skin_jandel'); assert.deepEqual(await platform.getPurchases(), [{ productID: 'skin_jandel' }]);
  const called = []; assert.deepEqual(await platform.showAd({ onOpen: () => called.push('open'), onClose: value => called.push(value) }), { wasShown: true });
  assert.deepEqual(called, ['open', true]);
});
test('account selection locks sync and entitlements until reload and invalidates in-flight data', async () => {
  const fixture = sdkFixture(); let reloads = 0, resolveData;
  fixture.player.getData = () => new Promise(resolve => { resolveData = resolve; });
  const platform = await initializeYandexPlatform({ sdk: fixture.sdk, onAccountChange: () => reloads++ });
  const pending = platform.loadSave(); await new Promise(resolve => setImmediate(resolve));
  fixture.events.get('account-open')(); resolveData({ [CLOUD_SAVE_KEY]: { career: { money: 10 } } });
  await assert.rejects(pending, /account/i);
  fixture.events.get('account-close')(); assert.equal(reloads, 1);
  await assert.rejects(platform.saveSave({}), /account/i); await assert.rejects(platform.purchase('skin_jandel'), /account/i);
});
test('production rejects missing SDK while explicit development keeps saves only in memory', async () => {
  await assert.rejects(initializeYandexPlatform({ global: {}, document: null }), /SDK/i);
  const platform = await initializeYandexPlatform({ development: true });
  await platform.saveSave({ version: 1 }); assert.deepEqual(await platform.loadSave(), { version: 1 });
  assert.equal(platform.development, true); assert.deepEqual(await platform.getPurchases(), []);
  await assert.rejects(platform.purchase('skin_jandel'), /development/i);
});
test('official SDK loader uses /sdk.js and calls YaGames.init', async () => {
  const fixture = sdkFixture(); const globals = {}; let script;
  const document = { createElement() { return {}; }, head: { appendChild(element) { script = element; globals.YaGames = { init: async () => fixture.sdk }; queueMicrotask(() => element.onload()); } } };
  const platform = await initializeYandexPlatform({ global: globals, document });
  assert.equal(script.src, '/sdk.js'); assert.equal(platform.sdk, fixture.sdk);
});
test('initialization and lazy data calls have bounded waits and can retry', async () => {
  await assert.rejects(initializeYandexPlatform({ global: { YaGames: { init: () => new Promise(() => {}) } }, timeoutMs: 5 }), /timed out/i);
  const fixture = sdkFixture(); let attempts = 0;
  fixture.sdk.getPlayer = () => ++attempts === 1 ? new Promise(() => {}) : Promise.resolve(fixture.player);
  const platform = await initializeYandexPlatform({ sdk: fixture.sdk, timeoutMs: 5 });
  await assert.rejects(platform.loadSave(), /timed out/i); assert.equal(await platform.loadSave(), null);
});

test('a user payment dialog outlives network timeouts and returns its eventual confirmed purchase', async () => {
  const fixture = sdkFixture();
  fixture.sdk.getPayments = async () => ({ purchase: ({ id }) => new Promise(resolve => setTimeout(() => resolve({ productID: id }), 25)) });
  const platform = await initializeYandexPlatform({ sdk: fixture.sdk, timeoutMs: 5 });
  assert.deepEqual(await platform.purchase('skin_jandel'), { productID: 'skin_jandel' });
});

test('rewarded ads require SDK reward confirmation, not just closing the video',async()=>{
 for(const reward of [false,true]){
  const fixture=sdkFixture();fixture.sdk.adv.showRewardedVideo=({callbacks})=>{
   if(reward){callbacks.onRewarded();callbacks.onRewarded();}callbacks.onClose(true);callbacks.onRewarded();
  };
  const platform=await initializeYandexPlatform({sdk:fixture.sdk});
  assert.deepEqual(await platform.showRewardedAd(),{rewarded:reward});platform.destroy();
 }
});
test('rewarded errors and unavailable video reject without granting a reward',async()=>{
 const fixture=sdkFixture();const platform=await initializeYandexPlatform({sdk:fixture.sdk});
 await assert.rejects(platform.showRewardedAd(),/unavailable/);
 fixture.sdk.adv.showRewardedVideo=({callbacks})=>callbacks.onError(new Error('offline'));
 await assert.rejects(platform.showRewardedAd(),/offline/);platform.destroy();
});
