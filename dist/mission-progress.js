import {CAREER_MISSIONS} from './career-missions.js';
import {BIOME_SEQUENCE,CAREER_VEHICLES,ECONOMY_CONFIG} from './economy-config.js';

export const MISSIONS_VERSION=1;
const ids=new Set(CAREER_MISSIONS.map(mission=>mission.id));
const biomeIds=new Set(BIOME_SEQUENCE.map(biome=>biome.id));
const data=(value,key)=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return undefined;
  return Object.getOwnPropertyDescriptor(value,key)?.value;
};
const count=value=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(ECONOMY_CONFIG.maxSavedMoney,Math.floor(value))):0;
const knownIds=(value,known)=>{
  if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>1000)return [];
  const result=[];
  for(let i=0;i<value.length;i++){
    const id=Object.getOwnPropertyDescriptor(value,String(i))?.value;
    if(typeof id==='string'&&known.has(id)&&!result.includes(id))result.push(id);
  }
  return result;
};

export function freshMissions(){
  return {version:MISSIONS_VERSION,stats:{studySeconds:0,cleanDeliveries:0,deliveredBiomeIds:[],canyonFinishes:0,canyonBestScore:0,nitroUses:0},claimedIds:[]};
}

export function sanitizeMissions(value){
  const result=freshMissions();
  try{
    if(data(value,'version')!==MISSIONS_VERSION)return result;
    const stats=data(value,'stats'),seconds=data(stats,'studySeconds');
    if(typeof seconds==='number'&&Number.isFinite(seconds))result.stats.studySeconds=Math.round(Math.max(0,Math.min(ECONOMY_CONFIG.maxSavedMoney,seconds))*1e6)/1e6;
    for(const key of ['cleanDeliveries','canyonFinishes','canyonBestScore','nitroUses'])result.stats[key]=count(data(stats,key));
    result.stats.deliveredBiomeIds=knownIds(data(stats,'deliveredBiomeIds'),biomeIds);
    result.claimedIds=knownIds(data(value,'claimedIds'),ids);
  }catch{return freshMissions();}
  return result;
}

export function getCareerMissions(career){
  const missions=career.missions||freshMissions(),stats=missions.stats;
  const claimed=new Map(missions.claimedIds.map((id,index)=>[id,index]));
  const owned=CAREER_VEHICLES.filter(vehicle=>career.ownedVehicleIds.includes(vehicle.id)).length;
  const values={
    deliveries:career.completedRuns,studySeconds:stats.studySeconds,cleanDeliveries:stats.cleanDeliveries,
    upgradeLevel:Math.max(0,...Object.values(career.sharedUpgrades)),purchasedVehicles:Math.max(0,owned-1),
    ordinaryVehicles:owned,route:career.routeCompletion?1:0,canyonFinishes:stats.canyonFinishes,
    driftScore:career.routeCompletion?stats.canyonBestScore:0,nitroLevel:career.nitroLevel,nitroUses:stats.nitroUses,
  };
  return CAREER_MISSIONS.map((mission,order)=>{
    const raw=mission.metric==='biome'?Number(career.discoveredBiomeIds.includes(mission.key)):
      mission.metric==='deliveryBiome'?Number(stats.deliveredBiomeIds.includes(mission.key)):
      mission.metric==='school'?Number(career.ownedSchoolIds.includes(mission.key)):values[mission.metric];
    const received=claimed.has(mission.id),progress=received?mission.target:Math.min(mission.target,count(raw));
    return {...mission,order,progress,status:received?'claimed':progress>=mission.target?'ready':'progress'};
  }).sort((a,b)=>{
    const priority={ready:0,progress:1,claimed:2};
    return priority[a.status]-priority[b.status]||(a.status==='claimed'?claimed.get(a.id)-claimed.get(b.id):a.order-b.order);
  });
}
