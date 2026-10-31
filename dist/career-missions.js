import { ECONOMY_CONFIG, DELIVERY_CHECKPOINTS, VEHICLE_CONFIG } from './economy-config.js';
import { BRIDGES } from './road-bridges.js';


export const RETENTION_VERSION = 1;
export const MAX_MISSION_SEQUENCE = 1_000_000_000;
const LEGACY_MISSIONS = Object.freeze([
  {id:'deliveries',name:'Три доставки',description:'Успешно доставь груз 3 раза',target:3,cash:90,brains:20},
  {id:'clean-bridges',name:'Два чистых моста',description:'Пересеки 2 разных моста и доставь груз без столкновений',target:2,cash:120,brains:30},
  {id:'hard-delivery',name:'Сложный маршрут',description:'Пройди сложную ветку целиком и доставь груз',target:1,cash:150,brains:40},
].map(Object.freeze));
export const CAREER_MISSIONS = Object.freeze([
  {"id":"first-delivery","name":"Первый заработок","description":"Успешно доставить первый груз","metric":"deliveries","target":1,"cash":100,"brains":50},
  {"id":"study-60-seconds","name":"За парту","description":"Провести в классе суммарно 60 секунд активной игры","metric":"studySeconds","target":60,"cash":100,"brains":50},
  {"id":"first-upgrade","name":"Первый тюнинг","description":"Купить первое улучшение обычной машины","metric":"upgradeLevel","target":1,"cash":150,"brains":50},
  {"id":"deliveries-3","name":"Начинающий курьер","description":"Выполнить 3 успешные доставки","metric":"deliveries","target":3,"cash":200,"brains":75},
  {"id":"first-vehicle-purchase","name":"Обновление гаража","description":"Купить первую машину после стартовой","metric":"purchasedVehicles","target":1,"cash":200,"brains":75},
  {"id":"clean-deliveries-1","name":"Осторожный водитель","description":"Доставить груз без столкновений","metric":"cleanDeliveries","target":1,"cash":250,"brains":100},
  {"id":"discover-forest","name":"Навстречу лесу","description":"Открыть лесной биом","metric":"biome","target":1,"cash":400,"brains":150,"key":"forest"},
  {"id":"delivery-forest","name":"Лесной курьер","description":"Успешно доставить груз в лесном биоме","metric":"deliveryBiome","target":1,"cash":500,"brains":200,"key":"forest"},
  {"id":"school-2","name":"Следующий класс","description":"Открыть второй класс","metric":"school","target":1,"cash":300,"brains":150,"key":"school-2"},
  {"id":"clean-deliveries-3","name":"Бережём груз","description":"Выполнить 3 успешные доставки без столкновений","metric":"cleanDeliveries","target":3,"cash":400,"brains":150},
  {"id":"discover-desert","name":"Горячие пески","description":"Открыть пустыню","metric":"biome","target":1,"cash":700,"brains":250,"key":"desert"},
  {"id":"delivery-desert","name":"Через барханы","description":"Успешно доставить груз в пустынном биоме","metric":"deliveryBiome","target":1,"cash":900,"brains":300,"key":"desert"},
  {"id":"ordinary-upgrade-5","name":"Машина становится лучше","description":"Довести любую общую характеристику обычных машин до 5-го уровня","metric":"upgradeLevel","target":5,"cash":500,"brains":250},
  {"id":"school-3","name":"Любознательный","description":"Открыть третий класс","metric":"school","target":1,"cash":600,"brains":300,"key":"school-3"},
  {"id":"deliveries-10","name":"Опытный курьер","description":"Выполнить 10 успешных доставок","metric":"deliveries","target":10,"cash":800,"brains":300},
  {"id":"discover-snow","name":"Холодный край","description":"Открыть снежный биом","metric":"biome","target":1,"cash":1200,"brains":400,"key":"snow"},
  {"id":"delivery-snow","name":"Полярная доставка","description":"Успешно доставить груз в снежном биоме","metric":"deliveryBiome","target":1,"cash":1500,"brains":500,"key":"snow"},
  {"id":"school-4","name":"Отличник","description":"Открыть четвёртый класс","metric":"school","target":1,"cash":1000,"brains":400,"key":"school-4"},
  {"id":"discover-volcanic","name":"Земля огня","description":"Открыть вулканический биом","metric":"biome","target":1,"cash":1800,"brains":600,"key":"volcanic"},
  {"id":"delivery-volcanic","name":"Горячий заказ","description":"Успешно доставить груз в вулканическом биоме","metric":"deliveryBiome","target":1,"cash":2200,"brains":800,"key":"volcanic"},
  {"id":"school-5","name":"Высшее образование","description":"Открыть пятый класс","metric":"school","target":1,"cash":1500,"brains":500,"key":"school-5"},
  {"id":"full-route","name":"Весь путь позади","description":"Завершить полный основной маршрут с успешной финальной доставкой","metric":"route","target":1,"cash":3000,"brains":1000},
  {"id":"canyon-finishes-1","name":"Знакомство с каньоном","description":"Завершить первый зачётный заезд в каньоне","metric":"canyonFinishes","target":1,"cash":1500,"brains":500},
  {"id":"canyon-score-5000","name":"Первый занос","description":"Набрать 5 000 очков за один завершённый зачётный заезд в каньоне","metric":"driftScore","target":5000,"cash":1000,"brains":400},
  {"id":"canyon-score-10000","name":"Дрифт: первый рубеж","description":"Набрать 10 000 очков за один завершённый зачётный заезд в каньоне","metric":"driftScore","target":10000,"cash":2000,"brains":600},
  {"id":"nitro-1","name":"Дополнительная тяга","description":"Купить нитро","metric":"nitroLevel","target":1,"cash":1500,"brains":500},
  {"id":"nitro-uses-10","name":"На ускорении","description":"Использовать 10 зарядов нитро","metric":"nitroUses","target":10,"cash":1000,"brains":300},
  {"id":"canyon-score-25000","name":"Дрифт: уверенный контроль","description":"Набрать 25 000 очков за один завершённый зачётный заезд в каньоне","metric":"driftScore","target":25000,"cash":2500,"brains":800},
  {"id":"canyon-score-35000","name":"Дрифт: мастерство","description":"Набрать 35 000 очков за один завершённый зачётный заезд в каньоне","metric":"driftScore","target":35000,"cash":3000,"brains":1000},
  {"id":"canyon-score-45000","name":"Дрифт: высшая лига","description":"Набрать 45 000 очков за один завершённый зачётный заезд в каньоне","metric":"driftScore","target":45000,"cash":4000,"brains":1500},
  {"id":"canyon-finishes-10","name":"Завсегдатай каньона","description":"Завершить 10 зачётных заездов в каньоне","metric":"canyonFinishes","target":10,"cash":2500,"brains":1000},
  {"id":"ordinary-vehicles-all","name":"Большой гараж","description":"Собрать все 8 обычных машин","metric":"ordinaryVehicles","target":8,"cash":4000,"brains":1000},
  {"id":"nitro-5","name":"Полный заряд","description":"Улучшить нитро до 5-го уровня","metric":"nitroLevel","target":5,"cash":3000,"brains":1000},
  {"id":"clean-deliveries-20","name":"Надёжный перевозчик","description":"Выполнить 20 успешных доставок без столкновений","metric":"cleanDeliveries","target":20,"cash":2500,"brains":800},
  {"id":"deliveries-50","name":"Легенда доставки","description":"Выполнить 50 успешных доставок","metric":"deliveries","target":50,"cash":3500,"brains":1000}
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
  const definition=LEGACY_MISSIONS[sequence%LEGACY_MISSIONS.length];
  const progress=integer(retention?.missionProgress,definition.target-1);
  return {...definition,sequence,progress,remaining:definition.target-progress};
}



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
