import { CHARACTER_CATALOG } from './character-catalog.js';
import {PREMIUM_SKIN_IDS,premiumProductId} from './premium-skins.js';


export const PROGRESSION_CONFIG = Object.freeze({
  drivingRate: 3,
  maxBrains: 1_000_000_000,
  maxFrameSeconds: .1,
  maxMovementSpeed: 80,
  minMovementSpeed: .15,
  movementEpsilon: .00001,
  saveInterval: 2,
  brainPrecision: 1_000_000,
});
export const SCHOOL_CONFIG = Object.freeze([
  {id:'school-1',name:'Класс 1',price:0,rate:1.5},
  {id:'school-2',name:'Класс 2',price:1500,rate:3},
  {id:'school-3',name:'Класс 3',price:6000,rate:5},
  {id:'school-4',name:'Класс 4',price:18000,rate:8},
  {id:'school-5',name:'Класс 5',price:45000,rate:12},
].map(Object.freeze));
const skinPrices = Object.freeze([0,250,400,600,850,1150,1500,1900,2400,3000,3700,4500,5400,6400,7500,8700,10000]);
export const SKIN_CONFIG = Object.freeze(CHARACTER_CATALOG.map((skin,index)=>Object.freeze({
  id:skin.id,name:skin.name,price:skinPrices[index],
  premium:PREMIUM_SKIN_IDS.includes(skin.id),productId:PREMIUM_SKIN_IDS.includes(skin.id)?premiumProductId(skin.id):null,
})));
export const schoolConfig = id => SCHOOL_CONFIG.find(school=>school.id===id) || null;
export const skinConfig = id => SKIN_CONFIG.find(skin=>skin.id===id) || null;
