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



export const VEHICLE_CONFIG = Object.freeze([
  {id:'pickup',name:'Пикап',price:0,capacity:100,range:520,maxSpeed:11,acceleration:11/1.8,specialty:'city'},
  {id:'citycourier',name:'Городской курьер',price:900,capacity:125,range:700,maxSpeed:12.5,acceleration:6.9,specialty:'city'},
  {id:'rover',name:'Внедорожник',price:1200,capacity:140,range:1000,maxSpeed:14.2,acceleration:7.8,specialty:'forest'},
  {id:'foresthauler',name:'Лесовоз',price:3200,capacity:190,range:1420,maxSpeed:16.2,acceleration:8.8,specialty:'forest'},
  {id:'van',name:'Фургон',price:3600,capacity:180,range:1800,maxSpeed:18.4,acceleration:10,specialty:'desert'},
  {id:'desertscout',name:'Песчаный разведчик',price:4800,capacity:150,range:2250,maxSpeed:21,acceleration:11.3,specialty:'desert'},
  {id:'snowgrip',name:'Ледовый вездеход',price:5200,capacity:145,range:2800,maxSpeed:23.9,acceleration:12.8,specialty:'snow'},
  {id:'snowrunner',name:'Полярный экспресс',price:5600,capacity:185,range:3500,maxSpeed:27.2,acceleration:14.5,specialty:'snow'},
  {id:'lavacrawler',name:'Лавовый тягач',price:6200,capacity:165,range:4400,maxSpeed:31,acceleration:16.4,specialty:'volcanic'},
  {id:'ashhauler',name:'Пепельный караван',price:7200,capacity:210,range:5500,maxSpeed:35.4,acceleration:18.6,specialty:'volcanic'},
].map((v,index)=>Object.freeze({...v,progressionOrder:index+1,pairRole:index%2?'advanced':'standard',
  handling:1.08**index,grip:1.08**index,consumption:v.capacity/v.range})));
export const vehicleConfig = id => VEHICLE_CONFIG.find(v=>v.id===id) || VEHICLE_CONFIG[0];


export const DELIVERY_CHECKPOINTS = Object.freeze(CHECKPOINT_PROGRESS.map((progress,index)=>{
  const distance=routeDistanceAt(progress);
  return Object.freeze({id:`checkpoint-${String(index+1).padStart(2,'0')}`,progress,distance,reward:Math.round(distance*.6/10)*10});
}));
export const BIOME_SEQUENCE = BIOME_DEFINITIONS;
