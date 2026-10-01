import { ECONOMY_CONFIG, DELIVERY_CHECKPOINTS, VEHICLE_CONFIG } from './economy-config.js';
import { BRIDGES } from './road-bridges.js';

/** Small, trip-based rewards. No clocks, streaks, daily resets or live cargo are saved. */
export const RETENTION_VERSION = 1;
export const MAX_MISSION_SEQUENCE = 1_000_000_000;
export const CAREER_MISSIONS = Object.freeze([
  {id:'deliveries',name:'Три доставки',description:'Успешно доставь груз 3 раза',target:3,cash:90,brains:20},
  {id:'clean-bridges',name:'Два чистых моста',description:'Пересеки 2 разных моста и доставь груз без столкновений',target:2,cash:120,brains:30},
  {id:'hard-delivery',name:'Сложный маршрут',description:'Пройди сложную ветку целиком и доставь груз',target:1,cash:150,brains:40},
].map(Object.freeze));
export const DELIVERY_BONUS_RATES = Object.freeze({cleanCash:.20,hardCash:.15,cleanBrains:.04,hardBrains:.04,maxMasteryBrains:.08,firstCash:.05,firstBrains:.01});
const knownBridgeIds=new Set(BRIDGES.map(bridge=>bridge.id));
const integer=(value,max=ECONOMY_CONFIG.maxSavedMoney)=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(max,Math.floor(value))):0;
export function freshRetention({migrated=false}={}) {
  return {version:RETENTION_VERSION,missionSequence:0,missionProgress:0,missionBridgeIds:[],
    claimedCheckpointIds:migrated?DELIVERY_CHECKPOINTS.map(checkpoint=>checkpoint.id):[],
    goalVehicleId:null,careerCashEarned:0,testCashGranted:0};
}
export function getActiveMission(retention) {
  const sequence=integer(retention?.missionSequence,MAX_MISSION_SEQUENCE);
  const definition=CAREER_MISSIONS[sequence%CAREER_MISSIONS.length];
  const progress=integer(retention?.missionProgress,definition.target-1);
  return {...definition,sequence,progress,remaining:definition.target-progress};
}
/** Mutates only the bounded career retention record, after successful delivery.
 * Crossings from failed/aborted trips never become durable mission progress.
 * A run contributes to exactly the mission that was active for that delivery. */
export function advanceCareerMission(retention,{clean=false,bridgeIds=[],hard=false}={}) {
  const mission=getActiveMission(retention);
  if(mission.sequence>=MAX_MISSION_SEQUENCE)return null;
  let progress;
  if(mission.id==='clean-bridges'){
    const distinct=new Set((retention.missionBridgeIds||[]).filter(id=>knownBridgeIds.has(id)));
    if(clean)for(const id of bridgeIds)if(knownBridgeIds.has(id))distinct.add(id);
    retention.missionBridgeIds=[...distinct].slice(0,BRIDGES.length);
    progress=Math.min(mission.target,distinct.size);
  }else progress=Math.min(mission.target,mission.progress+(mission.id==='deliveries'?1:hard?1:0));
  if(progress<mission.target){retention.missionProgress=progress;return null;}
  retention.missionSequence=mission.sequence+1;retention.missionProgress=0;retention.missionBridgeIds=[];
  return {id:mission.id,name:mission.name,sequence:mission.sequence,cash:mission.cash,brains:mission.brains};
}
/** Rounding applies independently to approved bonuses. Mission and first-visit
 * rewards are separately labelled; they do not enlarge the 8% mastery cap. */
export function calculateDeliveryReward(reward,{clean=false,hard=false,first=false,mission=null}={}) {
  const base=integer(Math.round(reward));
  const cleanBrains=clean?Math.floor(base*DELIVERY_BONUS_RATES.cleanBrains):0;
  const hardBrains=hard?Math.min(Math.floor(base*DELIVERY_BONUS_RATES.hardBrains),Math.floor(base*DELIVERY_BONUS_RATES.maxMasteryBrains)-cleanBrains):0;
  const result={base,clean:clean?Math.floor(base*DELIVERY_BONUS_RATES.cleanCash):0,
    hard:hard?Math.floor(base*DELIVERY_BONUS_RATES.hardCash):0,
    first:first?Math.floor(base*DELIVERY_BONUS_RATES.firstCash):0,mission:integer(mission?.cash),
    brains:{clean:cleanBrains,hard:hardBrains,first:first?Math.floor(base*DELIVERY_BONUS_RATES.firstBrains):0,mission:integer(mission?.brains)}};
  result.totalCash=result.base+result.clean+result.hard+result.first+result.mission;
  result.brains.total=result.brains.clean+result.brains.hard+result.brains.first+result.brains.mission;
  return result;
}
/** At currency caps the receipt describes what was credited, not a larger
 * theoretical payout. Base reward is credited before its optional bonuses. */
export function capDeliveryReward(reward,cashRoom,brainRoom) {
  const result={...reward,brains:{...reward.brains}};
  let cash=Math.max(0,cashRoom),brains=Math.max(0,brainRoom);
  for(const key of ['base','clean','hard','first','mission']){result[key]=Math.min(result[key],cash);cash-=result[key];}
  for(const key of ['clean','hard','first','mission']){result.brains[key]=Math.min(result.brains[key],brains);brains-=result.brains[key];}
  result.totalCash=result.base+result.clean+result.hard+result.first+result.mission;
  result.brains.total=result.brains.clean+result.brains.hard+result.brains.first+result.brains.mission;
  return result;
}
export function getVehicleGoal(retention,money,ownedVehicleIds=[]) {
  const vehicle=VEHICLE_CONFIG.find(spec=>spec.id===retention?.goalVehicleId&&spec.price>0&&!ownedVehicleIds.includes(spec.id));
  if(!vehicle)return null;
  const balance=integer(money);
  return {id:vehicle.id,name:vehicle.name,price:vehicle.price,money:balance,remaining:Math.max(0,vehicle.price-balance),progress:Math.min(1,balance/vehicle.price)};
}
