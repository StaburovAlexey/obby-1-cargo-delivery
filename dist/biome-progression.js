import { BIOME_SEQUENCE, VEHICLE_CONFIG } from './economy-config.js';
import { TYRE_CONFIG } from './economy-balance.js';

// Finish crossing the surface blend before recording the first real visit.
export const BIOME_DISCOVERY_OFFSET = 24;

export function biomeForProgress(progress) {
  return BIOME_SEQUENCE.find(biome => progress >= biome.from && progress < biome.to)
    || (progress >= BIOME_SEQUENCE.at(-1).to ? BIOME_SEQUENCE.at(-1) : BIOME_SEQUENCE[0]);
}

export function vehicleSupportsBiome(vehicleId, biomeId, tyreTier = 0) {
  const vehicle = VEHICLE_CONFIG.find(spec => spec.id === vehicleId);
  const required = BIOME_SEQUENCE.findIndex(biome => biome.id === biomeId);
  const tier=vehicle?.rewardOnly?BIOME_SEQUENCE.findIndex(biome=>biome.id===vehicle.specialty):
    Number.isFinite(tyreTier)?Math.max(0,Math.min(TYRE_CONFIG.length-1,Math.floor(tyreTier))):0;
  return !!vehicle && required >= 0 && tier >= required;
}

export function biomeVehicle(biomeId) {
  return VEHICLE_CONFIG.find(vehicle => vehicle.specialty === biomeId && !vehicle.rewardOnly);
}

export function vehicleUnlockHint(availability) {
  if (availability?.reason === 'previous-vehicle')
    return `Сначала купите ${availability.previousVehicleName}.`;
  if (availability?.reason === 'previous-tyres') return 'Сначала купите предыдущие шины.';
  if (availability?.reason === 'complete-full-route') return 'Пройдите весь маршрут за один рейс.';
  return '';
}

export function biomeDiscoveryMessage(event) {
  const tyres = TYRE_CONFIG.find(spec=>spec.id===event.id);
  return `Открыт биом «${event.name}». ${tyres?.name || 'Подходящие'} шины улучшают сцепление, скорость и расход топлива. Доставка доступна на любой купленной машине.`;
}
