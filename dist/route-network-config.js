
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




const degrees = value => value * Math.PI / 180;
// Arc-length stations stay fixed: variety comes from headings, not longer journeys.
// Quintic heading interpolation enters and exits each bend with zero curvature.
// Bridge approaches keep broad radii; stronger bends live between those approaches.
export const TURN_DEFINITIONS = Object.freeze([
  // City: gentle introduction, a compact S around the service straight, then
  // longer steering exchanges. Both compact turns are clear of bridge approaches.
  [80, 345, 0, 18],
  [500, 710, 18, 26],
  [1040, 1100, 26, -14],
  [1190, 1240, -14, 16],
  [1395, 1645, 16, 32],
  [1795, 2085, 32, 12],
  [2235, 2585, 12, 36],
  [2735, 3080, 36, 12],
  // Forest: broad linked sweeps, a tighter entry, then a level fork/recovery.
  [3080, 3580, 12, -7],
  [3580, 4150, -7, 15],
  [4150, 4410, 15, -3],
  [5080, 5750, -3, 19],
  // Desert: open S combinations either side of the five bridge approaches.
  [5750, 6120, 19, -22],
  [6150, 6670, -22, -4],
  [6670, 7210, -4, -24],
  [7210, 7750, -24, 28],
  // Snow: one deliberate tighter entry followed by a readable, broad reversal.
  [8400, 8750, 28, -6],
  [8750, 9260, -6, 14],
  [9260, 9545, 14, -8],
  [10370, 10980, -8, 14],
  // Volcano: bridge rhythm first; sustained S turns and a recovery before finish.
  [10980, 11700, 14, -12],
  [11700, 12410, -12, 12],
  [13080, 13700, 12, -12],
  [13700, 14260, -12, 34],
  [14260, 14820, 34, -34],
  [14820, 15180, -34, 12],
  [15400, 15770, 12, 0],
].map(([from, to, a, b]) => Object.freeze([from, to, degrees(a), degrees(b)])));
// These sections reserve the demanding bend and its exit for steering practice.
// Obstacles still use the unchanged bridge/service exclusions outside these zones.
export const HAZARD_FREE_DRIVING_SECTIONS = Object.freeze([
  {id: 'city-tight-turn', from: 1035, to: 1245, recovery: 60},
  {id: 'desert-entry-sweep', from: 5750, to: 6120, recovery: 60},
  {id: 'desert-open-sweep', from: 7420, to: 7750, recovery: 80},
  {id: 'snow-entry-turn', from: 8400, to: 8750, recovery: 80},
  {id: 'volcanic-linked-s', from: 13800, to: 15180, recovery: 80},
].map(Object.freeze));
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
