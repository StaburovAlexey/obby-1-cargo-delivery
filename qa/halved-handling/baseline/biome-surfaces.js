



import { BIOMES } from './road-layout.js';
import { VEHICLE_CONFIG } from './economy-config.js';

export const SURFACE_TRANSITION_METERS = 48;
export const SURFACE_FACTOR_KEYS = Object.freeze([
  'frictionFactor', 'lateralDampingFactor', 'rollingFactor', 'engineFactor',
  'speedFactor', 'coastingFactor', 'vibration',
]);
export const CITY_SURFACE = Object.freeze({
  id: 'city', frictionFactor: 1, lateralDampingFactor: 1, rollingFactor: 1,
  engineFactor: 1, speedFactor: 1, coastingFactor: 1, vibration: 0,
});
const surface = (id, dynamics, color, detail) => Object.freeze({
  ...CITY_SURFACE, id, ...dynamics, color, detail: Object.freeze(detail),
});


export const BIOME_SURFACES = Object.freeze({
  city: surface('city', {}, 0x72747a, [.19, .025, 0]),
  forest: surface('forest', {
    frictionFactor: .78, lateralDampingFactor: .58, rollingFactor: 3.7,
    engineFactor: .82, speedFactor: .91, coastingFactor: 1.08,
  }, 0x99734e, [.025, .12, .025]),
  desert: surface('desert', {
    frictionFactor: .61, lateralDampingFactor: .4, rollingFactor: 6.4,
    engineFactor: .66, speedFactor: .79, coastingFactor: 1.2,
  }, 0xe7bd63, [0, .065, .07]),
  snow: surface('snow', {
    frictionFactor: .35, lateralDampingFactor: .10, rollingFactor: .65,
    engineFactor: .87, speedFactor: .94, coastingFactor: .48,
  }, 0xddeef4, [0, .028, .025]),
  volcanic: surface('volcanic', {
    frictionFactor: .93, lateralDampingFactor: .84, rollingFactor: 1.9,
    engineFactor: .95, speedFactor: .95, coastingFactor: 1.02, vibration: 1,
  }, 0x45434d, [.32, .06, .012]),
});





const profile = (frictionFactor, lateralDampingFactor, rollingFactor,
  engineFactor, speedFactor, coastingFactor, vibration = 0) => Object.freeze({
  frictionFactor, lateralDampingFactor, rollingFactor, engineFactor,
  speedFactor, coastingFactor, vibration,
});
const supported = Object.freeze({
  city:     [1,    1,   1,    1,    1,    1,    0],
  forest:   [.98, .90, 1.45, 1,    1,    1.05, 0],
  desert:   [.96, .80, 1.75, 1,    1,    1.10, 0],
  snow:     [.90, .55,  .75, 1,    1,     .69, 0],
  volcanic: [1.02,.95, 1.10, 1,    1,    1.02,.32],
});

const unsupported = Object.freeze({
  1:[.28,.16,.38,.42], 2:[.22,.11,.34,.31],
  3:[.18,.065,.32,.23], 4:[.15,.085,.30,.17],
});
export const VEHICLE_SURFACE_PROFILES = Object.freeze(Object.fromEntries(
  VEHICLE_CONFIG.map((vehicle,index)=>{
    const tier=BIOMES.findIndex(b=>b.id===vehicle.specialty);
    const entries=BIOMES.map((biome,biomeIndex)=>{
      const gap=biomeIndex-tier;
      if(gap<=0){
        const [friction,lateral,rolling,engine,speed,coast,vibration]=supported[biome.id];
        const earlier=gap<0?.99:1;
        return [biome.id,profile(friction*vehicle.grip*earlier,lateral*vehicle.grip*earlier,
          rolling,engine*(gap<0?.98:1),speed*(gap<0?.98:1),coast,vibration)];
      }
      const [friction,lateral,engine,speed]=unsupported[gap];
      const pair=index%2?1.08:1;
      const rolling=biome.id==='snow'?.65:biome.id==='volcanic'?2.2:2.7;
      const coast=biome.id==='snow'?.38:biome.id==='volcanic'?.84:1.1;
      return [biome.id,profile(friction*pair,lateral*pair,rolling,engine,speed,coast,biome.id==='volcanic'?1:0)];
    });
    return [vehicle.id,Object.freeze(Object.fromEntries(entries))];
  }),
));




export const VEHICLE_SURFACE_MODIFIERS = Object.freeze(Object.fromEntries(
  Object.entries(VEHICLE_SURFACE_PROFILES).map(([vehicleId, profiles]) => [vehicleId,
    Object.freeze(Object.fromEntries(Object.entries(profiles).map(([id, dynamics]) => [id,
      Object.freeze(Object.fromEntries(SURFACE_FACTOR_KEYS.map(key => [key,
        BIOME_SURFACES[id][key] === 0 ? 1 : dynamics[key] / BIOME_SURFACES[id][key],
      ]))),
    ]))),
  ]),
));
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const SURFACE_BOUNDS = Object.freeze(BIOMES.slice(1).map(b => b.from));
export function biomeSurfaceBlend(logicalY) {
  if (!Number.isFinite(logicalY)) logicalY = BIOMES[0].from;
  const half = SURFACE_TRANSITION_METERS / 2;
  for (let i = 0; i < SURFACE_BOUNDS.length; i++) {
    const boundary = SURFACE_BOUNDS[i];
    if (logicalY < boundary - half) return { from: BIOMES[i].id, to: BIOMES[i].id, blend: 0 };
    if (logicalY <= boundary + half) return { from: BIOMES[i].id, to: BIOMES[i+1].id,
      blend: smooth((logicalY - boundary + half) / SURFACE_TRANSITION_METERS) };
  }
  const id = BIOMES.at(-1).id;
  return { from: id, to: id, blend: 0 };
}
const vehicleSurfaces = Object.freeze(Object.fromEntries(
  Object.entries(VEHICLE_SURFACE_PROFILES).map(([vehicleId, profiles]) => [vehicleId,
    Object.freeze(Object.fromEntries(Object.entries(profiles).map(([id, dynamics]) =>
      [id, Object.freeze({ id, ...dynamics })]))),
  ]),
));
export function surfaceForBiome(id, vehicleId = 'pickup') {
  return (vehicleSurfaces[vehicleId] || vehicleSurfaces.pickup)[id] || CITY_SURFACE;
}


export function biomeSurfaceAt(logicalY, vehicleId = 'pickup') {
  const { from, to, blend } = biomeSurfaceBlend(logicalY);
  const a = surfaceForBiome(from, vehicleId), b = surfaceForBiome(to, vehicleId);
  if (a === b || blend === 0) return a;
  if (blend === 1) return b;
  return { id: blend < .5 ? from : to,
    ...Object.fromEntries(SURFACE_FACTOR_KEYS.map(key => [key, a[key] + (b[key] - a[key]) * blend])),
  };
}


export function normalizeSurfaceDynamics(value) {
  const out = {};
  for (const key of SURFACE_FACTOR_KEYS) {
    const n = value?.[key];
    out[key] = Number.isFinite(n) ? clamp(n, key === 'vibration' ? 0 : .05,
      key === 'rollingFactor' ? 12 : key === 'vibration' ? 1 : 3) : CITY_SURFACE[key];
  }
  return out;
}
