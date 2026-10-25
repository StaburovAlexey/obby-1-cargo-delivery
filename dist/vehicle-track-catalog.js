export const DEFAULT_VEHICLE_TRACK_ID = 'standard';
// Literal URLs let the production bundler include every track icon.
export const VEHICLE_TRACK_STYLES = Object.freeze([
  ['standard', 'Стандартный', 'Standard', new URL('./assets/tracks/standard.webp', import.meta.url).href, 'standard', 0x0b0d0e],
  ['neon-purple', 'Фиолетовый неон', 'Purple neon', new URL('./assets/tracks/neon-purple.webp', import.meta.url).href, 'neon', 0xb84dff],
  ['rainbow', 'Радуга', 'Rainbow', new URL('./assets/tracks/rainbow.webp', import.meta.url).href, 'rainbow', 0xffffff],
  ['fire', 'Огонь', 'Fire', new URL('./assets/tracks/fire.webp', import.meta.url).href, 'fire', 0xff6518],
  ['ice', 'Лёд', 'Ice', new URL('./assets/tracks/ice.webp', import.meta.url).href, 'ice', 0x6ddcff],
  ['lightning', 'Молния', 'Lightning', new URL('./assets/tracks/lightning.webp', import.meta.url).href, 'lightning', 0x668cff],
  ['neon-blue', 'Синий неон', 'Blue neon', new URL('./assets/tracks/neon-blue.webp', import.meta.url).href, 'neon', 0x248cff],
  ['neon-green', 'Зелёный неон', 'Green neon', new URL('./assets/tracks/neon-green.webp', import.meta.url).href, 'neon', 0x48ff5c],
].map(([id, ru, en, iconUrl, effect, color]) => Object.freeze({id, name: Object.freeze({ru, en}), iconUrl, effect, color})));

export function getVehicleTrackStyle(id) {
  return VEHICLE_TRACK_STYLES.find(style => style.id === id) || null;
}
