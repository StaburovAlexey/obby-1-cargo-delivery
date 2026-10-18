import { routeDistanceAt } from './route-network.js';
import { BIOME_DEFINITIONS, NETWORK_CONFIG, CHECKPOINT_PROGRESS } from './route-network-config.js';

export const ECONOMY_CONFIG = Object.freeze({
  saveVersion: 2,
  saveKey: 'urban-route-career-v1',
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
  {id:'pickup',name:'Пикап',price:0,capacity:100,range:290,maxSpeed:11,acceleration:11/1.8,specialty:'city'},
  {id:'citycourier',name:'Городской курьер',price:1300,capacity:140,range:800,maxSpeed:12.5,acceleration:6.9,specialty:'city'},
  {id:'rover',name:'Внедорожник',price:3200,capacity:190,range:700,maxSpeed:14.2,acceleration:7.8,specialty:'forest'},
  {id:'foresthauler',name:'Лесовоз',price:6500,capacity:260,range:1050,maxSpeed:16.2,acceleration:8.8,specialty:'forest'},
  {id:'van',name:'Фургон',price:10000,capacity:350,range:1200,maxSpeed:18.4,acceleration:10,specialty:'desert'},
  {id:'desertscout',name:'Песчаный разведчик',price:16000,capacity:480,range:1850,maxSpeed:21,acceleration:11.3,specialty:'desert'},
  {id:'snowgrip',name:'Ледовый вездеход',price:25000,capacity:650,range:2400,maxSpeed:23.9,acceleration:12.8,specialty:'snow'},
  {id:'snowrunner',name:'Полярный экспресс',price:30000,capacity:880,range:2700,maxSpeed:27.2,acceleration:14.5,specialty:'snow'},
  {id:'lavacrawler',name:'Лавовый тягач',price:50000,capacity:1190,range:3000,maxSpeed:31,acceleration:16.4,specialty:'volcanic'},
  {id:'ashhauler',name:'Пепельный караван',price:85000,capacity:1610,range:5000,maxSpeed:35.4,acceleration:18.6,specialty:'volcanic'},

  {id:REWARD_VEHICLE_ID,name:'BMW — награда',price:0,rewardOnly:true,unlock:'full-route',capacity:1800,range:6000,maxSpeed:42,acceleration:4.8,specialty:'volcanic',
    rewardDrift:Object.freeze({rearLateralGrip:.85,rearLateralDamping:.7,steeringSpeedRatio:.65})},
].map((v,index)=>Object.freeze({...v,progressionOrder:index+1,pairRole:index%2?'advanced':'standard',
  handling:.5*1.12**index,grip:.5*1.12**index,consumption:v.capacity/v.range})));
export const vehicleConfig = id => VEHICLE_CONFIG.find(v=>v.id===id) || VEHICLE_CONFIG[0];


const CHECKPOINT_REWARDS=Object.freeze([110,260,470,730,1080,1550,2180,3020,4090,5350,6780,8460,12000,14500,18000,26000]);
export const DELIVERY_CHECKPOINTS = Object.freeze(CHECKPOINT_PROGRESS.map((progress,index)=>{
  const distance=routeDistanceAt(progress);
  return Object.freeze({id:`checkpoint-${String(index+1).padStart(2,'0')}`,progress,distance,reward:CHECKPOINT_REWARDS[index]});
}));
export const FINAL_DELIVERY_CHECKPOINT = DELIVERY_CHECKPOINTS.at(-1);
export const BIOME_SEQUENCE = BIOME_DEFINITIONS;
