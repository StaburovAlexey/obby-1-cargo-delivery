// Fixed shuffled allocation; never reroll paid ownership on reload.
const paid = new Set(["orange", "cyan", "purple", "red"]);
export const VEHICLE_NEON_CATALOG = Object.freeze([
  ['red', 0xff254b, 'Красный', 'Red'],
  ['orange', 0xff7a18, 'Оранжевый', 'Orange'],
  ['yellow', 0xffe600, 'Жёлтый', 'Yellow'],
  ['green', 0x39ff64, 'Зелёный', 'Green'],
  ['cyan', 0x00eaff, 'Голубой', 'Cyan'],
  ['blue', 0x3575ff, 'Синий', 'Blue'],
  ['purple', 0xc23cff, 'Фиолетовый', 'Purple'],
  ['pink', 0xff42ba, 'Розовый', 'Pink'],
].map(([id, color, ru, en]) => Object.freeze({ id, color, currency: paid.has(id) ? 'yandex' : 'coins', price: paid.has(id) ? 39 : 20000, productId: paid.has(id) ? `neon_${id}` : null, name: Object.freeze({ ru, en }) })));
export const VEHICLE_NEON_COLORS = VEHICLE_NEON_CATALOG;
export function getVehicleNeon(id) { return VEHICLE_NEON_CATALOG.find(item => item.id === id) || null; }
export function vehicleNeonName(id, language = 'ru') { return getVehicleNeon(id)?.name[language === 'en' ? 'en' : 'ru'] || ''; }
