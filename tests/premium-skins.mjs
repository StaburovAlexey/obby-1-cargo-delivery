import test from 'node:test';
import assert from 'node:assert/strict';
import { createPremiumSkins, PREMIUM_SKIN_IDS, premiumProductId } from '../dist/premium-skins.js';
import { initializeYandexPlatform } from '../dist/yandex-platform.js';

test('six permanent skin products use catalog prices and restored platform entitlements', async () => {
  assert.deepEqual(PREMIUM_SKIN_IDS, ['dancing-npc-girl', 'jandel', 'kreekcraft', 'spyder-sammy', 'spider-man', 'jeff-the-killer']);
  const item = { id: 'skin_jandel', price: '39 custom', priceValue: '39', priceCurrencyCode: 'custom', getPriceCurrencyImage: () => '/currency.svg' };
  const premium = createPremiumSkins({ platform: { getCatalog: async () => [item], getPurchases: async () => [{ productID: 'skin_jandel' }, { productID: 'unknown' }] } });
  await premium.initialize(); assert.equal(premiumProductId('jandel'), 'skin_jandel');
  assert.deepEqual([...premium.ownedIds], ['jandel']); assert.equal(premium.catalog.get('jandel'), item);
  assert.equal(premium.catalog.get('jandel').getPriceCurrencyImage('svg'), '/currency.svg');
});
test('failed entitlement refresh preserves confirmed ownership and recovers', async () => {
  let offline = false;
  const premium = createPremiumSkins({ platform: { getCatalog: async () => [], getPurchases: async () => { if (offline) throw Error('offline'); return [{ productID: 'skin_kreekcraft' }]; } } });
  await premium.initialize(); offline = true; await premium.initialize();
  assert.equal(premium.status.failed, true); assert.equal(premium.ownedIds.has('kreekcraft'), true);
  offline = false; await premium.initialize(); assert.equal(premium.status.failed, false);
});
test('purchase grants only confirmed matching non-consumable product and retries missing callback via refresh', async () => {
  let attempts = 0; const busy = []; let purchases = [];
  const premium = createPremiumSkins({ onBusy: value => busy.push(value), platform: {
    getCatalog: async () => [{ id: 'skin_jandel', price: '39 YAN' }], getPurchases: async () => purchases,
    purchase: async id => { attempts++; purchases = [{ productID: id }]; throw Error('callback lost'); },
  } });
  await premium.initialize(); assert.equal(await premium.purchase('jandel'), true);
  assert.equal(premium.ownedIds.has('jandel'), true); assert.deepEqual(busy, [true, false]);
  assert.equal(await premium.purchase('jandel'), true); assert.equal(attempts, 1);
  assert.equal(await premium.purchase('spider-man'), false); assert.equal(attempts, 1);
});
test('mismatching purchase response cannot grant the requested skin', async () => {
  const premium = createPremiumSkins({ platform: { getCatalog: async () => [{ id: 'skin_jandel' }], getPurchases: async () => [], purchase: async () => ({ productID: 'skin_spider-man' }) } });
  await premium.initialize(); assert.equal(await premium.purchase('jandel'), false); assert.equal(premium.ownedIds.has('jandel'), false);
});

test('premium stays busy across a long SDK payment dialog and grants its late successful result', async () => {
  let completePayment; const busy = [];
  const sdk = { on() {}, environment: { i18n: { lang: 'en' } }, getPayments: async () => ({
    getCatalog: async () => [{ id: 'skin_jandel', price: '39 portal' }], getPurchases: async () => [],
    purchase: () => new Promise(resolve => { completePayment = resolve; }),
  }) };
  const platform = await initializeYandexPlatform({ sdk, timeoutMs: 5 });
  const premium = createPremiumSkins({ platform, onBusy: value => busy.push(value) }); await premium.initialize();
  const purchase = premium.purchase('jandel'); await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(premium.status.busy, true); assert.deepEqual(busy, [true]);
  completePayment({ productID: 'skin_jandel' }); assert.equal(await purchase, true);
  assert.equal(premium.ownedIds.has('jandel'), true); assert.deepEqual(busy, [true, false]);
});
