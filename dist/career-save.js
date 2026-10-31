import {sanitizeNitroLevel} from './vehicle-nitro.js';
import {freshCosmetics,sanitizeCosmetics} from './shop-cosmetics.js';
import {VEHICLE_NEON_CATALOG} from './vehicle-neon-catalog.js';
import {FINISH_LINE_SPEC} from './finish-line.js';
import { ECONOMY_CONFIG, VEHICLE_CONFIG, BIOME_SEQUENCE, DELIVERY_CHECKPOINTS, REWARD_VEHICLE_ID, ROUTE_COMPLETION_PROOF, FINAL_DELIVERY_CHECKPOINT, DRIFT_VEHICLE_UNLOCKS } from './economy-config.js';
import { CHARACTER_CATALOG, DEFAULT_CHARACTER_ID } from './character-catalog.js';
import { SCHOOL_CONFIG, PROGRESSION_CONFIG } from './progression-config.js';
import { UPGRADE_STATS } from './vehicle-upgrades.js';
import { freshRetention, RETENTION_VERSION, MAX_MISSION_SEQUENCE, getActiveMission } from './career-missions.js';
import { BRIDGES } from './road-bridges.js';
import {sanitizeDriftRecord} from './drift-record.js';
import {freshMissions,sanitizeMissions} from './mission-progress.js';

const characterIds = new Set(CHARACTER_CATALOG.map(character => character.id));
const purchasableVehicleIds = VEHICLE_CONFIG.filter(vehicle => vehicle.id !== 'pickup' && !vehicle.rewardOnly).map(vehicle => vehicle.id);
const forbiddenKeys = ['__proto__', 'prototype', 'constructor'];
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const counter = (value, maximum) => typeof value === 'number' && Number.isFinite(value)
  ? Math.max(0, Math.min(maximum, Math.floor(value))) : 0;
const brainCounter = value => typeof value === 'number' && Number.isFinite(value)
  ? Math.round(Math.max(0, Math.min(PROGRESSION_CONFIG.maxBrains, value)) * PROGRESSION_CONFIG.brainPrecision) / PROGRESSION_CONFIG.brainPrecision : 0;
const emptyLevels = () => Object.fromEntries(UPGRADE_STATS.map(stat => [stat.id, 0]));
// Ordinary entries intentionally alias one career-owned object; reward levels stay separate.
const emptyUpgrades = shared => Object.fromEntries(VEHICLE_CONFIG.map(vehicle => [vehicle.id,
  vehicle.rewardOnly ? emptyLevels() : shared]));

export function freshCareer(characterId = DEFAULT_CHARACTER_ID) {
  const selected = characterIds.has(characterId) ? characterId : DEFAULT_CHARACTER_ID;
  const sharedUpgrades = emptyLevels();
  return {
    version: ECONOMY_CONFIG.saveVersion,
    money: ECONOMY_CONFIG.startingMoney,
    ownedVehicleIds: ['pickup'],
    discoveredBiomeIds: ['city'],
    characterId: selected,
    completedRuns: 0,
    routeCompletion: null,
    nitroLevel: 0,
    driftRecord:null,
    brains: 0,
    ownedNeonIds: [], selectedNeonId: null, cosmetics:freshCosmetics(),
    ownedSkinIds: selected === DEFAULT_CHARACTER_ID ? [DEFAULT_CHARACTER_ID] : [DEFAULT_CHARACTER_ID, selected],
    ownedSchoolIds: ['school-1'],
    sharedUpgrades,
    tyreTier: 0,
    upgrades: emptyUpgrades(sharedUpgrades),
    vehicleGrantClaimed: false,
    retention: freshRetention(),
    missions: freshMissions(),
  };
}

function validRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null) &&
    !forbiddenKeys.some(key => owns(value, key));
}



function readData(value, keys) {
  if (!validRecord(value)) return null;
  const result = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && !owns(descriptor, 'value')) return null;
    result[key] = descriptor?.value;
  }
  return result;
}
function readIds(value) {
  const ids = new Set();
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      forbiddenKeys.some(key => owns(value, key))) return ids;
  const length = Object.getOwnPropertyDescriptor(value, 'length')?.value;
  if (!Number.isInteger(length) || length < 0 || length > 1000) return ids;
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor && owns(descriptor, 'value') && typeof descriptor.value === 'string')
      ids.add(descriptor.value);
  }
  return ids;
}




function sanitizeRouteCompletion(value) {
  const data=readData(value,['version','proof','checkpointId','runId','startProgress','endProgress','sampleCount','bridgeIds']);
  if(!data||data.version!==1||data.proof!==ROUTE_COMPLETION_PROOF||
    data.checkpointId!==FINAL_DELIVERY_CHECKPOINT.id||typeof data.runId!=='string'||
    !/^[a-zA-Z0-9-]{1,120}$/.test(data.runId)||
    !Number.isFinite(data.startProgress)||data.startProgress < -17||data.startProgress>12||
    !Number.isFinite(data.endProgress)||data.endProgress<FINISH_LINE_SPEC.progress||
    data.endProgress>ECONOMY_CONFIG.routeEnd+1||!Number.isInteger(data.sampleCount)||
    data.sampleCount<Math.ceil((data.endProgress-data.startProgress)/9)||data.sampleCount>100_000_000)return null;
  const crossed=readIds(data.bridgeIds),required=BRIDGES.filter(bridge=>bridge.to<FINAL_DELIVERY_CHECKPOINT.progress);
  if(required.some(bridge=>!crossed.has(bridge.id)))return null;
  return {version:1,proof:ROUTE_COMPLETION_PROOF,checkpointId:FINAL_DELIVERY_CHECKPOINT.id,
    runId:data.runId,startProgress:data.startProgress,endProgress:data.endProgress,
    sampleCount:data.sampleCount,bridgeIds:required.map(bridge=>bridge.id)};
}

function sanitizeRetention(value, ownedVehicleIds) {


  const result=freshRetention({migrated:true});
  const data=readData(value,['version','missionSequence','missionProgress','missionBridgeIds','claimedCheckpointIds','goalVehicleId','careerCashEarned','testCashGranted']);
  if(!data||data.version!==RETENTION_VERSION)return result;
  result.missionSequence=counter(data.missionSequence,MAX_MISSION_SEQUENCE);
  const mission=getActiveMission(result);
  result.missionProgress=counter(data.missionProgress,mission.target-1);
  if(mission.id==='clean-bridges'){
    const crossed=readIds(data.missionBridgeIds);
    result.missionBridgeIds=BRIDGES.filter(bridge=>crossed.has(bridge.id)).map(bridge=>bridge.id).slice(0,mission.target-1);

    result.missionProgress=result.missionBridgeIds.length;
  }


  const history=data.claimedCheckpointIds;
  let validHistory=Array.isArray(history)&&Object.getPrototypeOf(history)===Array.prototype&&
    !forbiddenKeys.some(key=>owns(history,key))&&history.length<=1000;
  if(validHistory)for(let index=0;index<history.length;index++){
    const descriptor=Object.getOwnPropertyDescriptor(history,String(index));
    if(!descriptor||!owns(descriptor,'value')||typeof descriptor.value!=='string'){validHistory=false;break;}
  }
  if(validHistory){
    const claimed=readIds(history);
    result.claimedCheckpointIds=DELIVERY_CHECKPOINTS.filter(checkpoint=>claimed.has(checkpoint.id)).map(checkpoint=>checkpoint.id);
  }
  const goal=VEHICLE_CONFIG.find(vehicle=>vehicle.id===data.goalVehicleId&&vehicle.price>0&&!ownedVehicleIds.includes(vehicle.id));
  result.goalVehicleId=goal?.id||null;
  result.careerCashEarned=counter(data.careerCashEarned,ECONOMY_CONFIG.maxSavedMoney);
  result.testCashGranted=counter(data.testCashGranted,ECONOMY_CONFIG.maxSavedMoney);
  return result;
}



export function sanitizeCareer(value, fallbackCharacterId = DEFAULT_CHARACTER_ID) {
  const result = freshCareer(fallbackCharacterId);
  try {
    const data = readData(value, ['version', 'money', 'ownedVehicleIds', 'characterId', 'completedRuns',
      'nitroLevel', 'brains', 'ownedSkinIds', 'ownedSchoolIds', 'sharedUpgrades', 'tyreTier', 'upgrades', 'vehicleGrantClaimed', 'retention', 'missions', 'routeCompletion', 'discoveredBiomeIds','driftRecord','ownedNeonIds','selectedNeonId','cosmetics']);
    if (!data || data.version !== ECONOMY_CONFIG.saveVersion) return result;
    result.money = counter(data.money, ECONOMY_CONFIG.maxSavedMoney);
    result.missions = sanitizeMissions(data.missions);
    const ownedVehicles = readIds(data.ownedVehicleIds);
    result.ownedVehicleIds = ['pickup', ...purchasableVehicleIds.filter(id => ownedVehicles.has(id))];
    const selected = characterIds.has(data.characterId) ? data.characterId : result.characterId;
    result.completedRuns = counter(data.completedRuns, ECONOMY_CONFIG.maxSavedMoney);
    result.routeCompletion = result.completedRuns>0?sanitizeRouteCompletion(data.routeCompletion):null;
    result.nitroLevel=result.routeCompletion?sanitizeNitroLevel(data.nitroLevel):0;
    result.driftRecord=sanitizeDriftRecord(data.driftRecord);
    // Recognize the old completed personal best once. New practice records
    // must not overwrite the missions' independent eligible-score history.
    if(data.missions===undefined&&result.routeCompletion&&result.driftRecord)
      result.missions.stats.canyonBestScore=result.driftRecord.score;
    if(result.routeCompletion){
      result.ownedVehicleIds.push(REWARD_VEHICLE_ID);
      if(result.driftRecord)result.ownedVehicleIds.push(...DRIFT_VEHICLE_UNLOCKS
        .filter(unlock=>result.driftRecord.score>=unlock.score).map(unlock=>unlock.vehicleId));
    }
    const visited = readIds(data.discoveredBiomeIds);
    for (let index = 1; index < BIOME_SEQUENCE.length; index++) {
      const biome = BIOME_SEQUENCE[index];
      if (!visited.has(biome.id)) break;
      result.discoveredBiomeIds.push(biome.id);
    }
    result.retention = sanitizeRetention(data.retention, result.ownedVehicleIds);
    result.cosmetics=sanitizeCosmetics(data.cosmetics);
    const neonIds=readIds(data.ownedNeonIds);
    result.ownedNeonIds=VEHICLE_NEON_CATALOG.filter(item=>neonIds.has(item.id)).map(item=>item.id);
    result.selectedNeonId=result.ownedNeonIds.includes(data.selectedNeonId)?data.selectedNeonId:null;
    result.brains = brainCounter(data.brains);
    const ownedSkins = readIds(data.ownedSkinIds);
    result.ownedSkinIds = CHARACTER_CATALOG.filter(skin => skin.id === DEFAULT_CHARACTER_ID || ownedSkins.has(skin.id)).map(skin => skin.id);
    result.characterId = result.ownedSkinIds.includes(selected) ? selected : DEFAULT_CHARACTER_ID;
    const ownedSchools = readIds(data.ownedSchoolIds);
    result.ownedSchoolIds = SCHOOL_CONFIG.filter(school => school.price === 0 || ownedSchools.has(school.id)).map(school => school.id);
    result.vehicleGrantClaimed = data.vehicleGrantClaimed === true;
    const sharedLevels = readData(data.sharedUpgrades, UPGRADE_STATS.map(stat => stat.id));
    if (sharedLevels) for (const stat of UPGRADE_STATS)
      result.sharedUpgrades[stat.id] = counter(sharedLevels[stat.id], stat.maxLevel);
    result.tyreTier = counter(data.tyreTier, BIOME_SEQUENCE.length - 1);
    const upgradeData = readData(data.upgrades, VEHICLE_CONFIG.map(vehicle => vehicle.id));
    if (upgradeData) {
      for (const id of result.ownedVehicleIds.filter(id => VEHICLE_CONFIG.find(vehicle => vehicle.id === id)?.rewardOnly)) {
        const levels = readData(upgradeData[id], UPGRADE_STATS.map(stat => stat.id));
        if (levels) for (const stat of UPGRADE_STATS) result.upgrades[id][stat.id] = counter(levels[stat.id], stat.maxLevel);
      }
    }
  } catch {
    return freshCareer(fallbackCharacterId);
  }
  return result;
}



export function createCareerStore(options = {}) {
  const key = typeof options.key === 'string' && options.key ? options.key : ECONOMY_CONFIG.saveKey;
  const status = { available: true, failed: false, reason: null, operation: null };
  const fail = (reason, operation) => {
    Object.assign(status, { failed: true, reason, operation });
    if (reason === 'unavailable' || reason === 'storage') status.available = false;
  };
  const success = operation => Object.assign(status, {
    available: true, failed: false, reason: null, operation,
  });
  const storage = () => {
    const target = owns(options, 'storage') ? options.storage : globalThis.localStorage;
    if (!target || typeof target.getItem !== 'function' || typeof target.setItem !== 'function')
      throw new Error('Storage unavailable');
    return target;
  };
  return {
    status,
    load() {
      try {
        const raw = storage().getItem(key);
        if (raw === null || raw === undefined) { success('load'); return freshCareer(); }
        if (typeof raw !== 'string' || raw.length > 100_000) {
          fail('corrupt', 'load'); return freshCareer();
        }
        let value;
        try { value = JSON.parse(raw); }
        catch { fail('corrupt', 'load'); return freshCareer(); }
        if (!validRecord(value)) { fail('corrupt', 'load'); return freshCareer(); }
        if (value.version !== ECONOMY_CONFIG.saveVersion) {
          success('load'); return freshCareer();
        }
        success('load');
        return sanitizeCareer(value);
      } catch {
        fail('storage', 'load');
        return freshCareer();
      }
    },
    save(snapshot) {
      try {
        storage().setItem(key, JSON.stringify(sanitizeCareer(snapshot)));
        success('save');
        return true;
      } catch {
        fail('storage', 'save');
        return false;
      }
    },
  };
}
