/** Compact delivery route. Progress is a graph station, never world Z. */
export const NETWORK_CONFIG = Object.freeze({
  "start": -17,
  "end": 15850,
  "spawn": 0,
  "halfWidth": 15,
  "shoulderWidth": 110,
  "meshStep": 6,
  "roadSurfaceOffset": 0.008,
  "truckHalfWidth": 2.9,
  "truckHalfLength": 3.6,
  "roadMargin": 0.1
});
export const BIOME_DEFINITIONS = Object.freeze([
  {
    "id": "city",
    "name": "Город",
    "from": -17,
    "to": 3000,
    "color": 2286848
  },
  {
    "id": "forest",
    "name": "Лес",
    "from": 3000,
    "to": 5800,
    "color": 1415982
  },
  {
    "id": "desert",
    "name": "Пустыня",
    "from": 5800,
    "to": 8500,
    "color": 15907137
  },
  {
    "id": "snow",
    "name": "Снег",
    "from": 8500,
    "to": 11000,
    "color": 15137023
  },
  {
    "id": "volcanic",
    "name": "Вулкан",
    "from": 11000,
    "to": 15850,
    "color": 5583938
  }
].map(Object.freeze));
export const FORK_DEFINITIONS = Object.freeze([
  {
    "id": "forest-fork",
    "biome": "forest",
    "from": 4500,
    "to": 5000,
    "offset": 25,
    "ridge": 4.4,
    "valley": -3.4,
    "skew": 0.18
  },
  {
    "id": "desert-fork",
    "biome": "desert",
    "from": 7820,
    "to": 8320,
    "offset": 25,
    "ridge": 4.4,
    "valley": -3.4,
    "skew": 0.24
  },
  {
    "id": "snow-fork",
    "biome": "snow",
    "from": 9800,
    "to": 10300,
    "offset": 25,
    "ridge": 4.4,
    "valley": -3.4,
    "skew": -0.2
  },
  {
    "id": "volcanic-fork",
    "biome": "volcanic",
    "from": 12500,
    "to": 13000,
    "offset": 25,
    "ridge": 4.4,
    "valley": -3.4,
    "skew": -0.24
  }
].map(Object.freeze));
// Heading changes use the network's C2 quintic easing. Begin a gentle city
// bend after the 80 m departure apron, then alternate direction throughout
// each biome. Fixed bridge approaches stay straight or below 0.0013/m;
// fork backbones stay straight so both arms retain their welded geometry.
const degrees = value => value * Math.PI / 180;
export const TURN_DEFINITIONS = Object.freeze([
  [80, 345, 0, 18],
  [500, 710, 18, 26],
  [1035, 1245, 26, 12],
  [1395, 1645, 12, 28],
  [1795, 2085, 28, 8],
  [2235, 2585, 8, 32],
  [2735, 3080, 32, 10],
  [3080, 3580, 10, -8],
  [3580, 4150, -8, 12],
  [4150, 4410, 12, -2],
  [5080, 5750, -2, 20],
  [5750, 6120, 20, 0],
  [6150, 6670, 0, -18],
  [6670, 7210, -18, 2],
  [7210, 7750, 2, -18],
  [8400, 8950, -18, 0],
  [8950, 9480, 0, -20],
  [9480, 9700, -20, -12],
  [10370, 10980, -12, 12],
  [10980, 11700, 12, -14],
  [11700, 12410, -14, 10],
  [13080, 13700, 10, -14],
  [13700, 14250, -14, 20],
  [14250, 14800, 20, -14],
  [14800, 15300, -14, 18],
  [15300, 15770, 18, 0],
].map(([from, to, a, b]) => Object.freeze([from, to, degrees(a), degrees(b)])));
export const ELEVATION_PROFILE = Object.freeze([
  [
    -17,
    0
  ],
  [
    0,
    0
  ],
  [
    52,
    0
  ],
  [
    108,
    0
  ],
  [
    152,
    0
  ],
  [
    208,
    0
  ],
  [
    412,
    0
  ],
  [
    468,
    0
  ],
  [
    752,
    0
  ],
  [
    808,
    0
  ],
  [
    1112,
    0.6588651985925754
  ],
  [
    1168,
    0.6588651985925754
  ],
  [
    1512,
    4.468022277577238
  ],
  [
    1568,
    4.468022277577238
  ],
  [
    1952,
    11.51362042982347
  ],
  [
    2008,
    11.51362042982347
  ],
  [
    2452,
    18.2481765729772
  ],
  [
    2508,
    18.2481765729772
  ],
  [
    3000,
    20
  ],
  [
    3012,
    20.002185504237037
  ],
  [
    3068,
    20.002185504237037
  ],
  [
    3112,
    20.084415359051853
  ],
  [
    3168,
    20.084415359051853
  ],
  [
    3642,
    24.809071153303705
  ],
  [
    3698,
    24.809071153303705
  ],
  [
    4352,
    31.9456968704
  ],
  [
    4408,
    31.9456968704
  ],
  [
    4500,
    32
  ],
  [
    5000,
    32
  ],
  [
    5152,
    31.052926484375
  ],
  [
    5208,
    31.052926484375
  ],
  [
    5800,
    20
  ],
  [
    5912,
    20.131559506331605
  ],
  [
    5968,
    20.131559506331605
  ],
  [
    6052,
    20.89915875438144
  ],
  [
    6108,
    20.89915875438144
  ],
  [
    7280,
    38
  ],
  [
    7492,
    38
  ],
  [
    7548,
    38
  ],
  [
    8320,
    38
  ],
  [
    8500,
    38
  ],
  [
    8612,
    37.76769994672671
  ],
  [
    8668,
    37.76769994672671
  ],
  [
    9362,
    20.048450943917608
  ],
  [
    9418,
    20.048450943917608
  ],
  [
    9800,
    16
  ],
  [
    10300,
    16
  ],
  [
    11000,
    32
  ],
  [
    11112,
    32.44680715243859
  ],
  [
    11168,
    32.44680715243859
  ],
  [
    11802,
    44.99836574054994
  ],
  [
    11858,
    44.99836574054994
  ],
  [
    13000,
    45
  ],
  [
    15802,
    20.000085489471573
  ],
  [
    15850,
    20.000085489471573
  ]
].map(Object.freeze));
export const CHECKPOINT_PROGRESS = Object.freeze([
  180,
  440,
  780,
  1140,
  1540,
  1980,
  2480,
  3040,
  3670,
  4380,
  5180,
  6080,
  7520,
  9390,
  11830,
  15830
]);
export const PREVIEW_PROGRESS = Object.freeze(BIOME_DEFINITIONS.map(b => Object.freeze({id:b.id, progress:b.id === 'city' ? 80 : b.from + 140})));
