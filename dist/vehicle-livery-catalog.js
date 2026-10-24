import { VEHICLE_CONFIG } from './economy-config.js';
import { translateGameText } from './localization.js';

// The shop is a preview-only catalogue. Only the original finish is owned.
// Prices and currencies intentionally do not exist until a purchase design is approved.
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
