

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




  [-17,0],[202,0],[418,8],[462,8],[758,2],[802,2],
  [1198,15],[1242,15],[1778,4],[1822,4],
  [2118,14],[2162,14],[2558,28],[2602,28],
  [2780,34],[3030,44],[3280,36],[3458,30],[3502,30],
  [4000,48],[4118,50],[4162,50],[4708,34],[4752,34],
  [4980,40],[5480,60],[5980,42],[6148,36],[6192,36],
  [6318,32],[6362,32],[7060,16],[7660,38],[7848,42],[7892,42],
  [8518,66],[8562,66],

  [8660,66],[9660,66],[9848,60],[9892,60],[10650,32],[10800,32],
].map(Object.freeze));

export const CHECKPOINT_PROGRESS=Object.freeze([180,440,780,1220,1800,2580,3480,4730,6170,7870,9870]);
export const PREVIEW_PROGRESS=Object.freeze(BIOME_DEFINITIONS.map(b=>Object.freeze({id:b.id,progress:b.id==='city'?80:b.from+140})));
