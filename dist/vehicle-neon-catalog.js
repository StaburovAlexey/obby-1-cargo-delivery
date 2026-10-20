/** Preview colors only: no price, ownership, equipped state or persistence. */
export const VEHICLE_NEON_CATALOG = Object.freeze([
  ['red', 0xff254b, 'Красный', 'Red'],
  ['orange', 0xff7a18, 'Оранжевый', 'Orange'],
  ['yellow', 0xffe600, 'Жёлтый', 'Yellow'],
  ['green', 0x39ff64, 'Зелёный', 'Green'],
  ['cyan', 0x00eaff, 'Голубой', 'Cyan'],
  ['blue', 0x3575ff, 'Синий', 'Blue'],
  ['purple', 0xc23cff, 'Фиолетовый', 'Purple'],
].map(([id, color, ru, en]) => Object.freeze({ id, color, name: Object.freeze({ ru, en }) })));
export const VEHICLE_NEON_COLORS = VEHICLE_NEON_CATALOG;
export function getVehicleNeon(id) { return VEHICLE_NEON_CATALOG.find(item => item.id === id) || null; }
export function vehicleNeonName(id, language = 'ru') { return getVehicleNeon(id)?.name[language === 'en' ? 'en' : 'ru'] || ''; }
