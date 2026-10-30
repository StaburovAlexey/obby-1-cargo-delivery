import {VEHICLE_LIVERY_CATALOG,PAID_LIVERY_BY_VEHICLE,PREMIUM_LIVERY_PRODUCTS} from './vehicle-livery-catalog.js';
import {VEHICLE_SMOKE_STYLES} from './vehicle-smoke-catalog.js';
import {VEHICLE_TRACK_STYLES} from './vehicle-track-catalog.js';
export const SHOP_COIN_PRICE=20000;
export const SHOP_XP_PRICE=2000;
const xpSmoke=new Set(['flowers','hearts','skulls']);
const xpTracks=new Set(['neon-purple','fire','ice','neon-blue']);
const paidTracks=new Set(['rainbow','lightning']);
export const SHOP_COSMETICS=Object.freeze([
 ...VEHICLE_LIVERY_CATALOG.flatMap(v=>v.variants.map(item=>({key:`livery:${v.id}:${item.id}`,type:'livery',id:item.id,vehicleId:v.id,free:item.id==='base',premium:PAID_LIVERY_BY_VEHICLE[v.id]===item.id}))),
 ...VEHICLE_SMOKE_STYLES.map(item=>({key:`smoke:${item.id}`,type:'smoke',id:item.id,free:item.id==='standard',xp:xpSmoke.has(item.id)})),
 ...VEHICLE_TRACK_STYLES.map(item=>({key:`tracks:${item.id}`,type:'tracks',id:item.id,free:item.id==='standard',xp:xpTracks.has(item.id),premium:paidTracks.has(item.id)})),
].map(Object.freeze));
export const cosmeticItem=(type,id,vehicleId)=>SHOP_COSMETICS.find(item=>item.type===type&&item.id===id&&(type!=='livery'||item.vehicleId===vehicleId));
export function freshCosmetics(){return {owned:[],premiumOwned:[],liveries:{},smoke:'standard',tracks:'standard'};}
export function sanitizeCosmetics(value){
 const result=freshCosmetics();if(!value||typeof value!=='object')return result;
 result.owned=SHOP_COSMETICS.filter(item=>!item.free&&Array.isArray(value.owned)&&value.owned.includes(item.key)).map(item=>item.key);
 result.premiumOwned=SHOP_COSMETICS.filter(item=>item.premium&&Array.isArray(value.premiumOwned)&&value.premiumOwned.includes(item.key)).map(item=>item.key);
 for(const item of SHOP_COSMETICS){
  const owned=item.free||result.owned.includes(item.key)||result.premiumOwned.includes(item.key);if(!owned)continue;
  if(item.type==='livery'&&value.liveries?.[item.vehicleId]===item.id)result.liveries[item.vehicleId]=item.id;
  else if(item.type!=='livery'&&value[item.type]===item.id)result[item.type]=item.id;
 }
 return result;
}

export const PREMIUM_COSMETIC_PRODUCTS=Object.freeze([...PREMIUM_LIVERY_PRODUCTS,
 ...VEHICLE_TRACK_STYLES.filter(item=>paidTracks.has(item.id)).map(item=>Object.freeze({key:`tracks:${item.id}`,productId:`tracks_${item.id}`,price:39,currency:'RUB',name:item.name.ru})),
]);
export const premiumCosmeticProductId=key=>PREMIUM_COSMETIC_PRODUCTS.find(item=>item.key===key)?.productId;
