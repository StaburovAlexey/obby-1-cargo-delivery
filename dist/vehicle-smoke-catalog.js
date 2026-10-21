export const DEFAULT_VEHICLE_SMOKE_ID = 'standard';
// Literal asset URLs keep every generated icon in both production builds.
export const VEHICLE_SMOKE_STYLES = Object.freeze([
  ['standard', 'Стандартный', 'Standard', new URL('./assets/smoke/standard.webp', import.meta.url).href],
  ['flowers', 'Цветочки', 'Flowers', new URL('./assets/smoke/flowers.webp', import.meta.url).href],
  ['hearts', 'Сердечки', 'Hearts', new URL('./assets/smoke/hearts.webp', import.meta.url).href],
  ['skulls', 'Черепа', 'Skulls', new URL('./assets/smoke/skulls.webp', import.meta.url).href],
  ['coins', 'Монетки', 'Coins', new URL('./assets/smoke/coins.webp', import.meta.url).href],
  ['smileys', 'Смайлики', 'Smileys', new URL('./assets/smoke/smileys.webp', import.meta.url).href],
].map(([id, ru, en, iconUrl]) => Object.freeze({id, name: Object.freeze({ru, en}), iconUrl})));
export function getVehicleSmokeStyle(id) {
  return VEHICLE_SMOKE_STYLES.find(style => style.id === id) || null;
}
