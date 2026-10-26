

import { VEHICLE_CONFIG } from './economy-config.js';
import { FUEL_RANGE_LEVELS, STANDARD_VEHICLE_BALANCE, UPGRADE_GAINS, UPGRADE_PRICE_TABLES } from './economy-balance.js';
export const UPGRADE_MAX_LEVEL = 10;
export const UPGRADE_STEP = UPGRADE_GAINS.speed;
export const UPGRADE_STATS = Object.freeze([
  {id:'speed',name:'Скорость',maxLevel:UPGRADE_MAX_LEVEL,unit:'м/с',step:UPGRADE_STEP},
  {id:'handling',name:'Устойчивость',maxLevel:UPGRADE_MAX_LEVEL,unit:'%',step:UPGRADE_GAINS.handling},
  {id:'grip',name:'Сцепление',maxLevel:UPGRADE_MAX_LEVEL,unit:'%',step:UPGRADE_GAINS.grip},
  {id:'fuel',name:'Бак',maxLevel:UPGRADE_MAX_LEVEL,unit:'м',step:null},
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
export function getUpgradeModifiers(levels,vehicleId) {
  const clean=sanitizeUpgradeLevels(levels);
  if(vehicles.get(vehicleId)?.rewardOnly) return {
    speed:1+.01*clean.speed,engine:1+.01*clean.speed,
    handling:1+.03*clean.handling,grip:1+.02*clean.grip,fuel:1+.03*clean.fuel,
  };
  return {speed:1+UPGRADE_STEP*clean.speed,engine:1+UPGRADE_STEP*clean.speed,
    handling:1+UPGRADE_GAINS.handling*clean.handling,grip:1+UPGRADE_GAINS.grip*clean.grip,
    fuel:FUEL_RANGE_LEVELS[clean.fuel]/STANDARD_VEHICLE_BALANCE.range};
}
// At road speed, bought stability also quickens the rack. Keep the old response
// for parking, reverse and unsupported tyres (controlSupport = 0).
export const steeringResponseSeconds = (handling, speed = 0, controlSupport = 1) => {
  const progress=Math.max(0,Math.min(1,(handling/STANDARD_VEHICLE_BALANCE.handling-1)/(UPGRADE_GAINS.handling*UPGRADE_MAX_LEVEL)));
  const roadBlend=Math.max(0,Math.min(1,(Math.abs(speed)-10)/(STANDARD_VEHICLE_BALANCE.maxSpeed-10)));
  const support=Math.max(0,Math.min(1,controlSupport));
  return .28 * (.5 / handling) ** 1.35 * Math.sqrt(1 + (speed / 12) ** 2) /
    (1+1.5*progress*roadBlend*support);
};

// Shared by both driving models. Buying speed never adds a stability penalty
// until actual motion exceeds the stock terrain cap. Correct tires gate both
// deficits; their existing wrong-biome penalty remains independent.
export function getSpeedStabilityDemand(actualSpeed,stockTerrainCap,modifiers,supportedTire=1) {
  const clamp=value=>Math.max(0,Math.min(1,Number.isFinite(value)?value:0));
  const speed=Number.isFinite(actualSpeed)?Math.max(0,actualSpeed):0;
  const cap=Number.isFinite(stockTerrainCap)&&stockTerrainCap>0?stockTerrainCap:Infinity;
  const speedDemand=clamp((speed/cap-1)/(UPGRADE_GAINS.speed*UPGRADE_MAX_LEVEL));
  const gripProgress=clamp(((modifiers?.grip??1)-1)/(UPGRADE_GAINS.grip*UPGRADE_MAX_LEVEL));
  const handlingProgress=clamp(((modifiers?.handling??1)-1)/(UPGRADE_GAINS.handling*UPGRADE_MAX_LEVEL));
  const mask=clamp(supportedTire);
  return {speedDemand,gripProgress,handlingProgress,loadBlend:speedDemand*speedDemand*(3-2*speedDemand),
    rearGripDeficit:Math.max(0,speedDemand-gripProgress)*mask,
    handlingDeficit:Math.max(0,speedDemand-handlingProgress)*mask};
}

// Lateral demand grows with speed squared. Bought grip supports that extra
// load only over the matching part of the speed range, with suitable tyres.
// No bonus applies at stock speed, G0, or on an unsupported surface.
export function getRoadGripMultiplier(modifiers,actualSpeed,stockTerrainCap,supportedTire=1) {
  const {speedDemand,gripProgress}=getSpeedStabilityDemand(actualSpeed,stockTerrainCap,modifiers);
  const support=Math.max(0,Math.min(1,Number.isFinite(supportedTire)?supportedTire:0));
  const matchedSpeedRatio=1+UPGRADE_GAINS.speed*UPGRADE_MAX_LEVEL*Math.min(speedDemand,gripProgress)*support;
  return modifiers.grip*matchedSpeedRatio**2;
}

export function getVehiclePerformance(vehicleId,levels) {
  const v=vehicles.get(vehicleId);if(!v)return null;
  const m=getUpgradeModifiers(levels,vehicleId);
  const range=v.rewardOnly?v.range*m.fuel:FUEL_RANGE_LEVELS[sanitizeUpgradeLevels(levels).fuel];
  return {maxSpeed:v.maxSpeed*m.speed,acceleration:v.acceleration*m.engine,
    handling:v.handling*m.handling,steeringResponseSeconds:v.rewardDrift?.22/(v.handling*m.handling**1.35):steeringResponseSeconds(v.handling*m.handling),

    grip:v.grip*m.grip,range,capacity:v.rewardOnly?v.capacity*m.fuel:v.capacity*range/v.range,consumption:v.consumption};
}
export function getUpgradeOffer(vehicleId,stat,levels) {
  const v=vehicles.get(vehicleId);if(!v||!statIds.has(stat))return null;
  const clean=sanitizeUpgradeLevels(levels),currentLevel=clean[stat],maxed=currentLevel===UPGRADE_MAX_LEVEL;
  const nextLevel=maxed?currentLevel:currentLevel+1;
  const currentPerformance=getVehiclePerformance(vehicleId,clean);
  const nextPerformance=getVehiclePerformance(vehicleId,{...clean,[stat]:nextLevel});
  const value=p=>stat==='speed'?p.maxSpeed:stat==='fuel'?p.range:p[stat]*100;

  const price=maxed?null:v.rewardOnly?
    5*Math.round(40*1.35**currentLevel*1.2**(v.progressionOrder-1)/5):UPGRADE_PRICE_TABLES[stat][currentLevel];
  return {vehicleId,stat,level:currentLevel,nextLevel,maxLevel:UPGRADE_MAX_LEVEL,maxed,price,
    current:value(currentPerformance),next:value(nextPerformance),
    currentPerformance,nextPerformance};
}
