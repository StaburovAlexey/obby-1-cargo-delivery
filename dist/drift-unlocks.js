import {DRIFT_VEHICLE_UNLOCKS} from './economy-config.js';
import {sanitizeCareer} from './career-save.js';

export {DRIFT_VEHICLE_UNLOCKS};

export function driftUnlockScore(vehicleId){
 return DRIFT_VEHICLE_UNLOCKS.find(unlock=>unlock.vehicleId===vehicleId)?.score??null;
}

// Canonical proof and best-record validation also keeps developer ownership out.
export function unlockedDriftVehicleIds(career){
 const canonical=sanitizeCareer(career);
 return DRIFT_VEHICLE_UNLOCKS.filter(unlock=>canonical.ownedVehicleIds.includes(unlock.vehicleId))
  .map(unlock=>unlock.vehicleId);
}
