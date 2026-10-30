import {SHOWCASE_VEHICLES} from './showcase-vehicle-catalog.js';
import {STANDARD_VEHICLE_BALANCE} from './economy-balance.js';
import { routeDistanceAt } from './route-network.js';
import { BIOME_DEFINITIONS, NETWORK_CONFIG, CHECKPOINT_PROGRESS } from './route-network-config.js';

export const ECONOMY_CONFIG = Object.freeze({
  saveVersion: 3,
  saveKey: 'urban-route-career-v3',
  startingMoney: 0,
  maxSavedMoney: 1_000_000_000,
  roadHalfWidth: 15,
  checkpointOffset: 8,
  checkpointRadius: 4.4,
  routeEnd: NETWORK_CONFIG.end,
});



export const REWARD_VEHICLE_ID = 'bmwreward';
export const ROUTE_COMPLETION_PROOF = 'continuous-route-v1';
export const VEHICLE_CONFIG = Object.freeze([
  {id:'pickup',name:'Пикап',price:0,specialty:'city'},
  {id:'citycourier',name:'Городской курьер',price:1300,specialty:'city'},
  {id:'rover',name:'Внедорожник',price:3200,specialty:'forest'},
  {id:'van',name:'Фургон',price:10000,specialty:'desert'},
  {id:'desertscout',name:'Песчаный разведчик',price:16000,specialty:'desert'},
  {id:'snowrunner',name:'Полярный экспресс',price:30000,specialty:'snow'},
  {id:'lavacrawler',name:'Лавовый тягач',price:40000,specialty:'volcanic'},
  {id:'ashhauler',name:'Пепельный караван',price:55000,specialty:'volcanic'},

  {id:REWARD_VEHICLE_ID,name:'BMW — награда',price:0,rewardOnly:true,unlock:'full-route',capacity:1800,range:6000,maxSpeed:42,acceleration:4.8,specialty:'volcanic',
    rewardDrift:Object.freeze({rearLateralGrip:.85,rearLateralDamping:.7,steeringSpeedRatio:.65})},
  ...SHOWCASE_VEHICLES.map(vehicle=>({id:vehicle.id,name:vehicle.name,price:0,rewardOnly:true,devUnlock:true,unlock:'developer',
    capacity:1800,range:6000,maxSpeed:42,acceleration:4.8,specialty:'volcanic',
    rewardDrift:Object.freeze({rearLateralGrip:.85,rearLateralDamping:.7,steeringSpeedRatio:.65,referenceGeometry:['cadillac75','koenigseggone1'].includes(vehicle.id)})})),
].map((v,index)=>{
  const values=v.rewardOnly?{...v,handling:.5*1.12**10,grip:.5*1.12**10}: {...v,...STANDARD_VEHICLE_BALANCE};
  // Reward upgrade prices keep their original position after removing two career cars.
  return Object.freeze({...values,progressionOrder:index+(v.rewardOnly?3:1),pairRole:index%2?'advanced':'standard',
    brainRate:v.rewardOnly?3:index+1,consumption:values.capacity/values.range});
}));
export const CAREER_VEHICLES = Object.freeze(VEHICLE_CONFIG.filter(vehicle=>!vehicle.rewardOnly));
export const vehicleConfig = id => VEHICLE_CONFIG.find(v=>v.id===id) || VEHICLE_CONFIG[0];
export const isCanyonVehicle=id=>VEHICLE_CONFIG.some(vehicle=>vehicle.id===id&&!!vehicle.rewardDrift);


const CHECKPOINT_REWARDS=Object.freeze([110,260,470,730,1080,1550,2180,3020,4090,5350,6780,8460,12000,14500,18000,26000]);
export const DELIVERY_CHECKPOINTS = Object.freeze(CHECKPOINT_PROGRESS.map((progress,index)=>{
  const distance=routeDistanceAt(progress);
  return Object.freeze({id:`checkpoint-${String(index+1).padStart(2,'0')}`,progress,distance,reward:CHECKPOINT_REWARDS[index]});
}));
export const FINAL_DELIVERY_CHECKPOINT = DELIVERY_CHECKPOINTS.at(-1);
export const BIOME_SEQUENCE = BIOME_DEFINITIONS;
