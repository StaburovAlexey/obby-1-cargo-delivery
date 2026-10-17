import { BIOME_SEQUENCE, VEHICLE_CONFIG, vehicleConfig } from './economy-config.js';

// Finish crossing the surface blend before recording the first real visit.
export const BIOME_DISCOVERY_OFFSET = 24;

export function biomeForProgress(progress) {
  return BIOME_SEQUENCE.find(biome => progress >= biome.from && progress < biome.to)
    || (progress >= BIOME_SEQUENCE.at(-1).to ? BIOME_SEQUENCE.at(-1) : BIOME_SEQUENCE[0]);
}

export function vehicleSupportsBiome(vehicleId, biomeId) {
  const vehicle = VEHICLE_CONFIG.find(spec => spec.id === vehicleId);
  const required = BIOME_SEQUENCE.findIndex(biome => biome.id === biomeId);
  return !!vehicle && required >= 0 &&
    BIOME_SEQUENCE.findIndex(biome => biome.id === vehicle.specialty) >= required;
}

export function biomeVehicle(biomeId) {
  return VEHICLE_CONFIG.find(vehicle => vehicle.specialty === biomeId && !vehicle.rewardOnly);
}

export function vehicleUnlockHint(availability) {
  if (availability?.reason === 'discover-biome')
    return `Сначала доедьте до биома «${availability.biomeName}» на машине прошлого биома.`;
  if (availability?.reason === 'complete-full-route') return 'Пройдите весь маршрут за один рейс.';
  return '';
}

export function biomeDiscoveryMessage(event) {
  const vehicle = vehicleConfig(event.vehicleId);
  return `Открыт биом «${event.name}». Для доставок здесь нужна местная машина. В ангаре доступен ${vehicle.name}.`;
}
