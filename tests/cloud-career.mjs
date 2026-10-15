import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudCareer } from '../dist/cloud-career.js';
import { freshCareer } from '../dist/career-save.js';

const copy = value => value === null ? null : structuredClone(value);
const snapshot = (money, updatedAt, legacyPremiumIds = []) => ({ version: 1, updatedAt, career: { ...freshCareer(), money }, settings: { audioVolume: 0.5, lastAudibleVolume: 0.5, language: 'en' }, legacyPremiumIds });
function fixture(initial = null) {
  let data = copy(initial), offline = false, clock = 1000; const writes = [], reads = [];
  const platform = { language: 'ru', async loadSave() { reads.push(1); if (offline) throw Error('offline'); return copy(data); }, async saveSave(value) { if (offline) throw Error('offline'); data = copy(value); writes.push(copy(value)); } };
  const create = options => createCloudCareer({ platform, now: () => clock, writeDelayMs: 0, retryDelays: [], legacyStorage: null, ...options });
  return { create, writes, reads, set data(value) { data = copy(value); }, get data() { return data; }, set offline(value) { offline = value; }, set clock(value) { clock = value; } };
}
test('initial cloud failure rejects without local import or empty cloud overwrite and can retry', async () => {
  const f = fixture(); f.offline = true; let legacyReads = 0;
  const cloud = f.create({ legacyStorage: { getItem() { legacyReads++; return null; } } });
  assert.throws(() => cloud.store.save(freshCareer()), /initial/i);
  await assert.rejects(cloud.initialize(), /offline/); assert.equal(legacyReads, 0); assert.equal(f.writes.length, 0);
  f.offline = false; await cloud.initialize(); assert.equal(cloud.status.available, true); cloud.destroy();
});
test('existing cloud wins over legacy and sanitizes mutable store snapshots', async () => {
  const f = fixture(snapshot(200, 100)); let legacyReads = 0;
  const cloud = f.create({ legacyStorage: { getItem() { legacyReads++; return null; } } });
  const result = await cloud.initialize(); assert.equal(result.career.money, 200); assert.equal(result.settings.language, 'en'); assert.equal(legacyReads, 0);
  const loaded = cloud.store.load(); loaded.money = 900; assert.equal(cloud.store.load().money, 200);
  assert.equal(await cloud.flush(), true); assert.equal(f.writes.length, 0); assert.equal(f.data.updatedAt, 100); cloud.destroy();
});
test('legacy import reads v2 career and audio/language once without any local writes', async () => {
  const f = fixture(); const raw = { ...freshCareer(), money: 345, characterId: 'spider-man', ownedSkinIds: ['noob', 'spider-man'] };
  const values = { 'urban-route-career-v1': JSON.stringify(raw), 'urban-route-audio-volume': '0.7', 'urban-route-audio-last-volume': '0.8', 'urban-route-audio-muted': '1', 'urban-route-language': 'en' };
  const cloud = f.create({ legacyStorage: { getItem: key => values[key] ?? null, setItem() { assert.fail('local write forbidden'); } } });
  const result = await cloud.initialize(); assert.equal(result.career.money, 345); assert.equal(result.career.characterId, 'spider-man');
  assert.equal(cloud.legacyPremiumIds.has('spider-man'), true); assert.deepEqual(result.settings, { audioVolume: 0, lastAudibleVolume: 0.8, language: 'en' });
  await cloud.flush(); assert.deepEqual(f.data.legacyPremiumIds, ['spider-man']); assert.equal(f.data.version, 1); cloud.destroy();
});
test('v1 selected premium avatar remains a separate legacy entitlement', async () => {
  const f = fixture(); const cloud = f.create({ legacyStorage: { getItem: key => key === 'urban-route-career-v1' ? JSON.stringify({ version: 1, money: 44, characterId: 'jandel' }) : null } });
  const result = await cloud.initialize(); assert.equal(result.career.characterId, 'jandel'); assert.equal(cloud.legacyPremiumIds.has('jandel'), true); cloud.destroy();
});
test('synchronous saves coalesce, retain memory offline, and no-op flush never advances timestamp', async () => {
  const f = fixture(snapshot(100, 100)); const cloud = f.create(); await cloud.initialize();
  cloud.store.save({ ...cloud.store.load(), money: 200 }); cloud.store.save({ ...cloud.store.load(), money: 300 });
  assert.equal(cloud.store.load().money, 300); await cloud.flush(); assert.equal(f.writes.length, 1); assert.equal(f.data.career.money, 300);
  const stamp = f.data.updatedAt; f.clock = 2000; cloud.store.save(cloud.store.load()); cloud.setSettings({ language: 'en' }); await cloud.flush();
  assert.equal(f.writes.length, 1); assert.equal(f.data.updatedAt, stamp);
  f.offline = true; cloud.store.save({ ...cloud.store.load(), money: 400 }); assert.equal(await cloud.flush(), false);
  assert.equal(cloud.status.unsaved, true); assert.equal(cloud.status.failed, true); assert.equal(cloud.store.load().money, 400);
  f.offline = false; assert.equal(await cloud.flush(), true); assert.equal(f.data.career.money, 400); assert.equal(cloud.status.failed, false); cloud.destroy();
});
test('reconnect chooses newest whole cloud save, ties favor cloud, and unions legacy rights', async () => {
  const f = fixture(snapshot(100, 100, ['jandel'])), replacements = [];
  const cloud = f.create({ onReplace: value => replacements.push(value) }); await cloud.initialize();
  cloud.store.save({ ...cloud.store.load(), money: 500 });
  f.data = snapshot(800, 1000, ['spider-man']);
  await cloud.flush(); assert.equal(cloud.store.load().money, 800); assert.equal(replacements.length, 1);
  assert.deepEqual(new Set(cloud.legacyPremiumIds), new Set(['jandel', 'spider-man']));
  assert.equal(f.data.career.money, 800); assert.deepEqual(new Set(f.data.legacyPremiumIds), new Set(['jandel', 'spider-man'])); cloud.destroy();
});
test('older cloud cannot roll back progress but contributes legacy rights independently', async () => {
  const f = fixture(snapshot(100, 100)); const cloud = f.create(); await cloud.initialize();
  cloud.store.save({ ...cloud.store.load(), money: 500 }); f.data = snapshot(800, 500, ['jandel']);
  await cloud.flush(); assert.equal(f.data.career.money, 500); assert.equal(cloud.legacyPremiumIds.has('jandel'), true); cloud.destroy();
});
test('changes made while a write is in flight stay dirty and flush writes the latest revision', async () => {
  const f = fixture(snapshot(100, 100)); const cloud = f.create(); await cloud.initialize();
  let release, started;
  const startedPromise = new Promise(resolve => { started = resolve; });
  const platform = { language: 'ru', loadSave: async () => f.data, saveSave: async envelope => { started(); await new Promise(resolve => { release = resolve; }); f.data = envelope; } };
  cloud.destroy(); const racing = createCloudCareer({ platform, writeDelayMs: 0, retryDelays: [], now: () => 1000, legacyStorage: null }); await racing.initialize();
  racing.store.save({ ...racing.store.load(), money: 200 }); const flushing = racing.flush(); await startedPromise;
  racing.store.save({ ...racing.store.load(), money: 300 }); release();

  await new Promise(resolve => setImmediate(resolve)); release(); await flushing;
  assert.equal(f.data.career.money, 300); assert.equal(racing.status.unsaved, false); racing.destroy();
});

test('destroyed cloud controller cannot write after a pending read completes', async () => {
  let read = 0, release, writes = 0;
  const cloud = createCloudCareer({ writeDelayMs: 0, retryDelays: [], legacyStorage: null, platform: {
    language: 'en', loadSave: () => ++read === 1 ? Promise.resolve(snapshot(100, 10)) : new Promise(resolve => { release = resolve; }), saveSave: async () => { writes++; },
  } });
  await cloud.initialize(); cloud.store.save({ ...cloud.store.load(), money: 200 }); const flushing = cloud.flush();
  await new Promise(resolve => setImmediate(resolve)); cloud.destroy(); release(snapshot(100, 10));
  assert.equal(await flushing, false); assert.equal(writes, 0);
});

test('corrupt or unsupported cloud data never triggers legacy import or overwrite', async () => {
  for (const value of [{ version: 2, updatedAt: 100, career: freshCareer() }, { version: 1, updatedAt: 'tomorrow', career: freshCareer() }]) {
    const f = fixture(value); let imports = 0;
    const cloud = f.create({ legacyStorage: { getItem() { imports++; return null; } } });
    await assert.rejects(cloud.initialize(), /cloud career/i); assert.equal(imports, 0); assert.equal(f.writes.length, 0); cloud.destroy();
  }
});

test('automatic retries are bounded and explicit retry recovers unsaved memory', async () => {
  let reads = 0, offline = false;
  const cloud = createCloudCareer({ writeDelayMs: 0, retryDelays: [1, 1], legacyStorage: null, platform: {
    language: 'en', loadSave: async () => { reads++; if (offline) throw Error('offline'); return snapshot(100, 10); }, saveSave: async () => {},
  } });
  await cloud.initialize(); offline = true; cloud.store.save({ ...cloud.store.load(), money: 200 });
  assert.equal(await cloud.flush(), false); await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(reads, 4); await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(reads, 4);
  offline = false; assert.equal(await cloud.flush(), true); assert.equal(cloud.status.unsaved, false); cloud.destroy();
});

test('newer-cloud replacement waits until merged legacy rights are durably saved', async () => {
  let data = snapshot(100, 10, ['jandel']), rejectWrite = true; const order = [];
  const cloud = createCloudCareer({ writeDelayMs: 0, retryDelays: [], now: () => 1000, legacyStorage: null,
    onReplace: replacement => { order.push('replace'); assert.equal(replacement.career.money, 800); assert.equal(data.legacyPremiumIds.includes('jandel'), true); },
    platform: { language: 'en', loadSave: async () => copy(data), saveSave: async envelope => { if (rejectWrite) throw Error('offline'); data = copy(envelope); order.push('saved'); } },
  });
  await cloud.initialize(); cloud.store.save({ ...cloud.store.load(), money: 500 }); data = snapshot(800, 1500, ['spider-man']);
  assert.equal(await cloud.flush(), false); assert.deepEqual(order, []);
  rejectWrite = false; assert.equal(await cloud.flush(), true); assert.deepEqual(order, ['saved', 'replace']); cloud.destroy();
});

test('permanent premium skin snapshots union independently of newest progress without minting legacy rights', async () => {
  const first = snapshot(100, 10); first.career.ownedSkinIds.push('jandel');
  const f = fixture(first), cloud = f.create(); await cloud.initialize();
  cloud.store.save({ ...cloud.store.load(), money: 200 });
  const second = snapshot(500, 2000); second.career.ownedSkinIds.push('spider-man'); f.data = second;
  await cloud.flush(); assert.equal(cloud.store.load().money, 500);
  assert.equal(cloud.store.load().ownedSkinIds.includes('jandel'), true);
  assert.equal(cloud.store.load().ownedSkinIds.includes('spider-man'), true);
  assert.deepEqual([...cloud.legacyPremiumIds], []); cloud.destroy();
});

test('future career schema is rejected instead of replacing progress with a fresh save', async () => {
  const data = snapshot(100, 10); data.career.version = 999;
  const f = fixture(data), cloud = f.create();
  await assert.rejects(cloud.initialize(), /cloud career/i); assert.equal(f.writes.length, 0); cloud.destroy();
});
