/** The exact render triangles supply world-space gradient and biome progress. */
import { queryRoadSurface,projectRoad } from './road-layout.js';
import { biomeSurfaceAt } from './biome-surfaces.js';
export function roadGroundGradient(x,z,history){
  if(!Number.isFinite(x)||!Number.isFinite(z))return {x:0,z:0};
  return queryRoadSurface(x,z,history).gradient;
}
export function roadGroundSurface(x,z,vehicleId='pickup',history){
  const progress=Number.isFinite(x)&&Number.isFinite(z)?projectRoad(x,z,history)?.progress:NaN;
  return biomeSurfaceAt(progress,vehicleId);
}
