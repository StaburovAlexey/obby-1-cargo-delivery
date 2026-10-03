/** Geometry-only route configuration. Progress is a canonical station in metres;
 * it is never a world coordinate. The spawn and rear apron stay at (0,0,6). */
export const NETWORK_CONFIG = Object.freeze({ start:-17, end:10800, spawn:0,
  halfWidth:15, shoulderWidth:110, meshStep:2, roadSurfaceOffset:.008,
  truckHalfWidth:2.9, truckHalfLength:3.6, roadMargin:.1 });
export const BIOME_DEFINITIONS = Object.freeze([
  {id:'city',name:'Город',from:-17,to:2000,color:0x22e500},
  {id:'forest',name:'Лес',from:2000,to:4000,color:0x159b2e},
  {id:'desert',name:'Пустыня',from:4000,to:6200,color:0xf2b941},
  {id:'snow',name:'Снег',from:6200,to:8400,color:0xe6f8ff},
  {id:'volcanic',name:'Вулкан',from:8400,to:10800,color:0x553442},
].map(Object.freeze));
export const FORK_DEFINITIONS = Object.freeze([
  {id:'forest-fork',biome:'forest',from:2780,to:3280,offset:24},
  {id:'desert-fork',biome:'desert',from:4980,to:5980,offset:50},
  {id:'snow-fork',biome:'snow',from:7060,to:7660,offset:32},
  {id:'volcanic-fork',biome:'volcanic',from:8660,to:9660,offset:50},
].map(Object.freeze));
export const TURN_DEFINITIONS = Object.freeze([
  [900,1700,0,Math.PI/2], [2000,2700,Math.PI/2,0],
  [4000,4800,0,-Math.PI/2], [6200,7000,-Math.PI/2,0],
  [9850,10650,0,Math.PI/2],
].map(Object.freeze));
export const ELEVATION_PROFILE = Object.freeze([
  [-17,0],[120,0],[450,10],[850,2],[1200,14],[1650,0],[2000,0],
  [2350,14],[2770,0],[3290,0],[3600,10],[4000,10],
  [4450,28],[4960,10],[6000,10],[6200,10],
  [6600,26],[7040,10],[7680,10],[8030,22],[8380,12],
  [9680,12],[10050,25],[10500,8],[10800,8],
].map(Object.freeze));
/** Safe common-edge gates, shared by economy, hazards and travel adapters. */
export const CHECKPOINT_PROGRESS=Object.freeze([180,440,780,1220,1800,2580,3480,4730,6170,7870,9870]);
export const PREVIEW_PROGRESS=Object.freeze(BIOME_DEFINITIONS.map(b=>Object.freeze({id:b.id,progress:b.id==='city'?80:b.from+140})));
