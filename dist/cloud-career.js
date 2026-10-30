import {sanitizeCosmetics} from './shop-cosmetics.js';
import { freshCareer, sanitizeCareer } from './career-save.js';
import { DEFAULT_CHARACTER_ID } from './character-catalog.js';
import { PREMIUM_SKIN_IDS } from './premium-skins.js';
import { VEHICLE_NEON_CATALOG } from './vehicle-neon-catalog.js';

const copy = value => JSON.parse(JSON.stringify(value));
const premium = new Set(PREMIUM_SKIN_IDS);
const rights = value => Array.isArray(value) ? PREMIUM_SKIN_IDS.filter(id => value.includes(id)) : [];
const validRecord = value => value && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
  !['__proto__', 'prototype', 'constructor'].some(key => Object.hasOwn(value, key));
const level = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
const paidNeonState = career => {
  const ownedNeonIds = VEHICLE_NEON_CATALOG.filter(item => item.currency === 'yandex' &&
    Array.isArray(career?.ownedNeonIds) && career.ownedNeonIds.includes(item.id)).map(item => item.id);
  const cosmetics=sanitizeCosmetics(career?.cosmetics);
  return { ownedNeonIds, selectedNeonId: ownedNeonIds.includes(career?.selectedNeonId) ? career.selectedNeonId : null,
    cosmetics:sanitizeCosmetics({premiumOwned:cosmetics.premiumOwned,liveries:cosmetics.liveries,smoke:cosmetics.smoke,tracks:cosmetics.tracks}) };
};

function settingsValue(value, language) {
  const data = validRecord(value) ? value : {};
  return { audioVolume: level(data.audioVolume, 1), lastAudibleVolume: level(data.lastAudibleVolume, 1), language: data.language === 'ru' || data.language === 'en' ? data.language : language === 'ru' ? 'ru' : 'en' };
}
function careerValue(value, legacyIds, permanentIds = []) {
  const result = sanitizeCareer(value);
  // Reset earned progression while retaining the paid-purchase cache for SDK outages.
  if (value?.version !== result.version) Object.assign(result, paidNeonState(value));

  result.ownedSkinIds = [...new Set([...result.ownedSkinIds, ...legacyIds, ...permanentIds])];
  if (result.ownedSkinIds.includes(value?.characterId)) result.characterId = value.characterId;
  if (!result.ownedSkinIds.includes(result.characterId)) result.characterId = DEFAULT_CHARACTER_ID;
  return result;
}
function envelopeValue(raw, language) {
  if (raw === null || raw === undefined) return null;
  if (!validRecord(raw) || raw.version !== 1 || !Number.isSafeInteger(raw.updatedAt) || raw.updatedAt < 0 || !validRecord(raw.career))
    throw new Error('Unsupported or corrupt cloud career');
  const resetCareer = raw.career.version !== freshCareer().version;
  const legacyPremiumIds = rights([...rights(raw.legacyPremiumIds),
    ...(resetCareer ? rights(raw.career.ownedSkinIds) : [])]);
  if (resetCareer && raw.career.version === 1 && premium.has(raw.career.characterId) && !legacyPremiumIds.includes(raw.career.characterId))
    legacyPremiumIds.push(raw.career.characterId);
  const result = { version: 1, updatedAt: raw.updatedAt, legacyPremiumIds, settings: settingsValue(raw.settings, language), career: careerValue(raw.career, legacyPremiumIds) };
  // Internal marker does not leak into saved envelopes or equality checks.
  Object.defineProperty(result, 'resetCareer', { value: resetCareer });
  return result;
}
const contents = envelope => JSON.stringify({ career: envelope.career, settings: envelope.settings, legacyPremiumIds: envelope.legacyPremiumIds });





export function createCloudCareer(options = {}) {
  const { platform, onStatus, onReplace } = options;
  if (!platform?.loadSave || !platform?.saveSave) throw new Error('Cloud platform required');
  const now = options.now || Date.now;
  const writeDelayMs = Math.max(0, Number(options.writeDelayMs ?? 3500));
  const retryDelays = options.retryDelays || [1000, 4000, 15000];
  const status = { available: false, failed: false, reason: null, operation: 'initialize', unsaved: false, initialized: false, syncing: false };
  const legacyPremiumIds = new Set(), listeners = new Set();
  let envelope, initializing, flushing, timer, destroyed = false, revision = 0, retryIndex = 0, lastAttemptAt = -Infinity, pendingReplacement = false;
  const notify = () => { onStatus?.(status); for (const listener of listeners) listener(status); };
  const ensureReady = () => { if (!status.initialized || destroyed) throw new Error('Cloud career not initialized'); };
  const fail = (error, operation) => { Object.assign(status, { available: false, failed: true, reason: error?.message || String(error), operation, syncing: false }); notify(); };
  const clearTimer = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  const schedule = delay => {
    if (destroyed || timer !== undefined) return;
    timer = setTimeout(() => { timer = undefined; void flush(); }, Math.max(0, delay));
    timer.unref?.();
  };
  const snapshot = () => ({ career: copy(envelope.career), settings: copy(envelope.settings) });
  const syncRights = () => { legacyPremiumIds.clear(); for (const id of envelope.legacyPremiumIds) legacyPremiumIds.add(id); };
  const nextTimestamp = previous => Math.max(Math.floor(Number(now()) || 0), previous + 1);
  const update = next => {
    if (contents(next) === contents(envelope)) return false;
    envelope = { ...next, updatedAt: nextTimestamp(envelope.updatedAt) }; revision++;
    status.unsaved = true; status.operation = 'save'; syncRights(); notify();

    if (retryIndex <= retryDelays.length) schedule(writeDelayMs);
    return true;
  };
  function readLegacy() {
    let storage;
    try { storage = Object.hasOwn(options, 'legacyStorage') ? options.legacyStorage : globalThis.localStorage; }
    catch { return {}; }
    if (typeof storage?.getItem !== 'function') return {};
    const read = key => { try { return storage.getItem(key); } catch { return null; } };
    let career;
    try { const raw = read('urban-route-career-v1'); if (typeof raw === 'string' && raw.length < 100000) { const data = JSON.parse(raw); if (validRecord(data) && [1, 2].includes(data.version)) career = data; } } catch {                                            }
    const importedRights = rights(career?.ownedSkinIds);
    if (career?.version === 1 && premium.has(career.characterId) && !importedRights.includes(career.characterId)) importedRights.push(career.characterId);
    const volume = read('urban-route-audio-volume'), lastVolume = read('urban-route-audio-last-volume');
    const audioVolume = volume === null || volume === '' || !Number.isFinite(Number(volume)) ? 1 : level(Number(volume), 1);
    const last = lastVolume === null || lastVolume === '' || !Number.isFinite(Number(lastVolume)) ? audioVolume || 1 : level(Number(lastVolume), 1);
    return { paidNeon: paidNeonState(career), legacyPremiumIds: rights(importedRights), settings: { audioVolume: read('urban-route-audio-muted') === '1' ? 0 : audioVolume, lastAudibleVolume: last > 0 ? last : 1, language: read('urban-route-language') || platform.language } };
  }
  const initialize = () => {
    if (status.initialized) return Promise.resolve(snapshot());
    if (initializing) return initializing;
    initializing = (async () => {
      try {
        const cloud = envelopeValue(await platform.loadSave(), platform.language);
        if (destroyed) throw new Error('Cloud career destroyed');
        if (cloud) envelope = cloud.resetCareer ? { ...cloud, updatedAt: nextTimestamp(cloud.updatedAt) } : cloud;
        else {
          const legacy = readLegacy(), importedRights = legacy.legacyPremiumIds || [];
          envelope = { version: 1, updatedAt: Math.max(0, Math.floor(Number(now()) || 0)), legacyPremiumIds: importedRights, career: careerValue({ ...freshCareer(), ...legacy.paidNeon }, importedRights), settings: settingsValue(legacy.settings, platform.language) };
        }
        syncRights(); Object.assign(status, { available: true, failed: false, reason: null, initialized: true, operation: 'load', unsaved: !cloud || cloud.resetCareer });
        notify(); if (!cloud || cloud.resetCareer) schedule(writeDelayMs); return snapshot();
      } catch (error) { fail(error, 'initialize'); throw error; }
    })().finally(() => { initializing = undefined; });
    return initializing;
  };
  function flush() {
    ensureReady(); clearTimer();
    if (flushing) return flushing;
    if (!status.unsaved) return Promise.resolve(true);
    flushing = (async () => {
      try {
        while (status.unsaved && !destroyed) {
          const wait = Math.max(0, writeDelayMs - (Number(now()) - lastAttemptAt));
          if (wait) await new Promise(resolve => setTimeout(resolve, wait));
          if (destroyed) return false;
          lastAttemptAt = Number(now()); status.syncing = true; status.operation = 'sync'; notify();


          const cloud = envelopeValue(await platform.loadSave(), platform.language);
          if (destroyed) return false;
          const union = rights([...envelope.legacyPremiumIds, ...(cloud?.legacyPremiumIds || [])]);
          const permanentIds = platform.id==='vk'?[]:rights([...envelope.career.ownedSkinIds, ...(cloud?.career.ownedSkinIds || [])]);
          if (cloud && cloud.updatedAt >= envelope.updatedAt) {
            const changed = contents(cloud) !== contents(envelope);
            envelope = { ...cloud, legacyPremiumIds: union, career: careerValue(cloud.career, union, permanentIds) }; revision++; syncRights();
            status.unsaved = contents(envelope) !== contents(cloud);
            if (status.unsaved) envelope.updatedAt = nextTimestamp(cloud.updatedAt);
            if (changed) pendingReplacement = true;
          } else {
            const merged = { ...envelope, legacyPremiumIds: union, career: careerValue(envelope.career, union, permanentIds) };
            if (contents(merged) !== contents(envelope)) {
              envelope = { ...merged, updatedAt: nextTimestamp(envelope.updatedAt) }; revision++; syncRights();
            }
          }
          if (!status.unsaved) break;
          const writingRevision = revision, writingEnvelope = copy(envelope);
          await platform.saveSave(writingEnvelope);
          if (destroyed) return false;
          if (writingRevision === revision) status.unsaved = false;
        }
        retryIndex = 0; Object.assign(status, { available: true, failed: false, reason: null, syncing: false, operation: 'save' }); notify();
        if (pendingReplacement && !status.unsaved) { pendingReplacement = false; onReplace?.(snapshot()); }
        return !status.unsaved;
      } catch (error) {
        fail(error, 'save');
        if (retryIndex < retryDelays.length) schedule(Math.max(writeDelayMs, Number(retryDelays[retryIndex++]) || 0));
        else retryIndex = retryDelays.length + 1;
        return false;
      }
    })().finally(() => { flushing = undefined; });
    return flushing;
  }
  const store = {
    status,
    load() { ensureReady(); return copy(envelope.career); },
    save(career) { ensureReady(); update({ ...envelope, career: careerValue(career, envelope.legacyPremiumIds) }); return true; },
  };
  return {
    status, store, legacyPremiumIds, initialize, flush,
    setSettings(settings) { ensureReady(); update({ ...envelope, settings: settingsValue({ ...envelope.settings, ...settings }, platform.language) }); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    destroy() { destroyed = true; clearTimer(); listeners.clear(); },
  };
}
