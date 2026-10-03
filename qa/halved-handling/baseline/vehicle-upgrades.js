/** Bounded, per-car brain-currency upgrades. No wallet, save, or fuel mutations.
 * The game owns the transaction; this module is also the UI/physics contract. */
import { VEHICLE_CONFIG } from './economy-config.js';
export const UPGRADE_MAX_LEVEL = 3;
export const UPGRADE_STEP = .02;
export const UPGRADE_STATS = Object.freeze([
  {id:'speed',name:'Скорость',maxLevel:3,unit:'м/с',step:UPGRADE_STEP},
  {id:'handling',name:'Управление',maxLevel:3,unit:'%',step:UPGRADE_STEP},
  {id:'grip',name:'Сцепление',maxLevel:3,unit:'%',step:UPGRADE_STEP},
  {id:'fuel',name:'Бак',maxLevel:3,unit:'ед.',step:UPGRADE_STEP},
].map(Object.freeze));
const statIds = new Set(UPGRADE_STATS.map(s=>s.id));
const vehicles = new Map(VEHICLE_CONFIG.map(v=>[v.id,v]));
// Descriptor-only reads never invoke JSON-adjacent getters or inherit values.
const ownData = (value,key) => {
  if(!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  try { const d=Object.getOwnPropertyDescriptor(value,key);return d && Object.hasOwn(d,'value') ? d.value : undefined; }
  catch { return undefined; }
};
const level = n => typeof n === 'number' && Number.isFinite(n) ? Math.max(0,Math.min(3,Math.floor(n))) : 0;
export function sanitizeUpgradeLevels(input) {
  return Object.fromEntries(UPGRADE_STATS.map(({id})=>[id,level(ownData(input,id))]));
}
export function sanitizeVehicleUpgrades(input) {
  return Object.fromEntries(VEHICLE_CONFIG.map(({id})=>[id,sanitizeUpgradeLevels(ownData(input,id))]));
}
export function getUpgradeModifiers(levels) {
  const clean=sanitizeUpgradeLevels(levels);
  return {speed:1+UPGRADE_STEP*clean.speed,engine:1+UPGRADE_STEP*clean.speed,
    handling:1+UPGRADE_STEP*clean.handling,grip:1+UPGRADE_STEP*clean.grip,
    fuel:1+UPGRADE_STEP*clean.fuel};
}
export function getVehiclePerformance(vehicleId,levels) {
  const v=vehicles.get(vehicleId);if(!v)return null;
  const m=getUpgradeModifiers(levels);
  return {maxSpeed:v.maxSpeed*m.speed,acceleration:v.acceleration*m.engine,
    handling:v.handling*m.handling,steeringResponseSeconds:.22/(v.handling*m.handling),
    // Tank size extends one-fill range; fuel burned per metre is unchanged.
    grip:v.grip*m.grip,range:v.range*m.fuel,capacity:v.capacity*m.fuel,consumption:v.consumption};
}
export function getUpgradeOffer(vehicleId,stat,levels) {
  const v=vehicles.get(vehicleId);if(!v||!statIds.has(stat))return null;
  const clean=sanitizeUpgradeLevels(levels),currentLevel=clean[stat],maxed=currentLevel===3;
  const nextLevel=maxed?currentLevel:currentLevel+1;
  const currentPerformance=getVehiclePerformance(vehicleId,clean);
  const nextPerformance=getVehiclePerformance(vehicleId,{...clean,[stat]:nextLevel});
  const value=p=>stat==='speed'?p.maxSpeed:stat==='fuel'?p.capacity:p[stat]*100;
  // Brain prices: 20/35/50 on car 1; +5/+10/+15 per later bay respectively.
  const price=maxed?null:[20,35,50][currentLevel]+(v.progressionOrder-1)*[5,10,15][currentLevel];
  return {vehicleId,stat,level:currentLevel,nextLevel,maxLevel:3,maxed,price,
    current:value(currentPerformance),next:value(nextPerformance),
    currentPerformance,nextPerformance};
}
