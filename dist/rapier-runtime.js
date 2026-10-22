import RAPIER from './vendor/rapier.mjs';

let initialization;
let initialized = false;

export function initializeRapier() {
  if (!initialization) initialization = RAPIER.init().then(() => {
    initialized = true;
    return RAPIER;
  });
  return initialization;
}

export function getRapier() {
  if (!initialized) throw new Error('Rapier must be initialized before creating physics objects.');
  return RAPIER;
}
