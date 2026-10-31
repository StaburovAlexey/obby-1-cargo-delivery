import { VEHICLE_CONFIG } from './economy-config.js';
import { translateGameText } from './localization.js';

// Selected once at authoring time; never reroll paid products per player or reload.
export const PAID_LIVERY_BY_VEHICLE=Object.freeze({"pickup": "biome", "citycourier": "racing", "rover": "neon", "van": "racing", "desertscout": "neon", "snowrunner": "biome", "lavacrawler": "racing", "ashhauler": "anime", "bmwreward": "racing"});
export const BASE_VEHICLE_LIVERY_ID = 'base';
export const VEHICLE_LIVERY_VARIANTS = Object.freeze([
  { id: 'base', code: '0', name: { ru: 'Базовая', en: 'Base' }, owned: true, equipped: true },
  { id: 'neon', code: 'A', name: { ru: 'Неон', en: 'Neon' }, owned: false, equipped: false },
  { id: 'anime', code: 'B', name: { ru: 'Аниме', en: 'Anime' }, owned: false, equipped: false },
  { id: 'racing', code: 'C', name: { ru: 'Гоночная', en: 'Racing' }, owned: false, equipped: false },
  { id: 'biome', code: 'D', name: { ru: 'Биомная', en: 'Biome' }, owned: false, equipped: false },
].map(variant => Object.freeze({ ...variant, name: Object.freeze(variant.name), purchasable: false })));

export const VEHICLE_LIVERY_CATALOG = Object.freeze(VEHICLE_CONFIG.filter(vehicle=>!vehicle.devUnlock).map(vehicle => Object.freeze({
  id: vehicle.id,
  name: Object.freeze({ ru: vehicle.name, en: translateGameText(vehicle.name, 'en') }),
  biome: vehicle.specialty,
  rewardOnly: !!vehicle.rewardOnly,
  variants: VEHICLE_LIVERY_VARIANTS,
})));

export function getVehicleLivery(vehicleId, liveryId) {
  const vehicle = VEHICLE_LIVERY_CATALOG.find(item => item.id === vehicleId);
  return vehicle?.variants.find(item => item.id === liveryId) ?? null;
}

export function vehicleLiveryName(vehicleId, liveryId, language = 'ru') {
  const variant = getVehicleLivery(vehicleId, liveryId);
  if (!variant) return '';
  if (liveryId === 'biome' && vehicleId === 'bmwreward') return language === 'en' ? 'Premium' : 'Премиальная';
  return variant.name[language === 'en' ? 'en' : 'ru'];
}

export const PREMIUM_LIVERY_PRODUCTS=Object.freeze(VEHICLE_LIVERY_CATALOG.map(vehicle=>{
 const id=PAID_LIVERY_BY_VEHICLE[vehicle.id];
 return Object.freeze({key:`livery:${vehicle.id}:${id}`,vehicleId:vehicle.id,liveryId:id,productId:`livery_${vehicle.id}_${id}`,price:39,currency:'RUB',name:`${vehicle.name.ru} · ${vehicleLiveryName(vehicle.id,id)}`});
}));
export const premiumLiveryProductId=key=>PREMIUM_LIVERY_PRODUCTS.find(item=>item.key===key)?.productId;
