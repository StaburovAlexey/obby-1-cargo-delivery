

import { VEHICLE_CONFIG } from './economy-config.js';
export const UPGRADE_MAX_LEVEL = 10;
export const UPGRADE_STEP = .01;
export const UPGRADE_STATS = Object.freeze([
  {id:'speed',name:'Скорость',maxLevel:UPGRADE_MAX_LEVEL,unit:'м/с',step:UPGRADE_STEP},
  {id:'handling',name:'Управление',maxLevel:UPGRADE_MAX_LEVEL,unit:'%',step:.03},
  {id:'grip',name:'Сцепление',maxLevel:UPGRADE_MAX_LEVEL,unit:'%',step:.02},
  {id:'fuel',name:'Бак',maxLevel:UPGRADE_MAX_LEVEL,unit:'ед.',step:.03},
].map(Object.freeze));
const statIds = new Set(UPGRADE_STATS.map(s=>s.id));
const vehicles = new Map(VEHICLE_CONFIG.map(v=>[v.id,v]));

const ownData = (value,key) => {
  if(!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  try { const d=Object.getOwnPropertyDescriptor(value,key);return d && Object.hasOwn(d,'value') ? d.value : undefined; }
  catch { return undefined; }
};
const level = n => typeof n === 'number' && Number.isFinite(n) ? Math.max(0,Math.min(UPGRADE_MAX_LEVEL,Math.floor(n))) : 0;
export function sanitizeUpgradeLevels(input) {
  return Object.fromEntries(UPGRADE_STATS.map(({id})=>[id,level(ownData(input,id))]));
}
export function sanitizeVehicleUpgrades(input) {
  return Object.fromEntries(VEHICLE_CONFIG.map(({id})=>[id,sanitizeUpgradeLevels(ownData(input,id))]));
}
export function getUpgradeModifiers(levels) {
  const clean=sanitizeUpgradeLevels(levels);
  return {speed:1+UPGRADE_STEP*clean.speed,engine:1+UPGRADE_STEP*clean.speed,
    handling:1+.03*clean.handling,grip:1+.02*clean.grip,
    fuel:1+.03*clean.fuel};
}
// Apply the same continuous response curve to catalog tiers and purchased levels.
// Upgraded earlier cars may handle better; later cars still improve speed, range
// and biome suitability. Speed-sensitive rack effort preserves correction room.
export const steeringResponseSeconds = (handling, speed = 0) => .28 * (.5 / handling) ** 1.35 * Math.sqrt(1 + (speed / 12) ** 2);
export function getVehiclePerformance(vehicleId,levels) {
  const v=vehicles.get(vehicleId);if(!v)return null;
  const m=getUpgradeModifiers(levels);
  return {maxSpeed:v.maxSpeed*m.speed,acceleration:v.acceleration*m.engine,
    handling:v.handling*m.handling,steeringResponseSeconds:v.rewardDrift?.22/(v.handling*m.handling**1.35):steeringResponseSeconds(v.handling*m.handling),

    grip:v.grip*m.grip,range:v.range*m.fuel,capacity:v.capacity*m.fuel,consumption:v.consumption};
}
export function getUpgradeOffer(vehicleId,stat,levels) {
  const v=vehicles.get(vehicleId);if(!v||!statIds.has(stat))return null;
  const clean=sanitizeUpgradeLevels(levels),currentLevel=clean[stat],maxed=currentLevel===UPGRADE_MAX_LEVEL;
  const nextLevel=maxed?currentLevel:currentLevel+1;
  const currentPerformance=getVehiclePerformance(vehicleId,clean);
  const nextPerformance=getVehiclePerformance(vehicleId,{...clean,[stat]:nextLevel});
  const value=p=>stat==='speed'?p.maxSpeed:stat==='fuel'?p.capacity:p[stat]*100;

  const price=maxed?null:5*Math.round(40*1.35**currentLevel*1.2**(v.progressionOrder-1)/5);
  return {vehicleId,stat,level:currentLevel,nextLevel,maxLevel:UPGRADE_MAX_LEVEL,maxed,price,
    current:value(currentPerformance),next:value(nextPerformance),
    currentPerformance,nextPerformance};
}
