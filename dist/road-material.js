/** Biome surfaces and road markings share one opaque road shader. There are
 * no extra meshes, relief triangles, shoulder strips. The original shared square-stud color tile is retained. */
import { createRoadMaterial } from './building-material.js';
import { ROUTE } from './road-layout.js';
import { BIOME_SURFACES, SURFACE_BOUNDS, SURFACE_TRANSITION_METERS, biomeSurfaceBlend } from './biome-surfaces.js';
export const ROAD_PAINT=Object.freeze({edgeOuter:14.95,edgeInner:14.81,dashHalfWidth:.1,dashLength:3,dashPeriod:12,dashStart:ROUTE.start+3,color:0xf6f1da});
export function roadPaintAt(across,logicalY){
  const edge=Math.abs(across)>=ROAD_PAINT.edgeInner&&Math.abs(across)<=ROAD_PAINT.edgeOuter;
  const phase=((logicalY-ROAD_PAINT.dashStart)%12+12)%12;
  const dash=Math.abs(across)<.1&&phase<3&&logicalY>=ROAD_PAINT.dashStart&&logicalY<ROUTE.end-3;
  return edge||dash;
}
/** Linear RGB reference for the same complete-width shader palette. */
export function roadSurfaceAppearanceAt(THREE,logicalY){
  const {from,to,blend}=biomeSurfaceBlend(logicalY),a=BIOME_SURFACES[from],b=BIOME_SURFACES[to];
  return {color:new THREE.Color(a.color).lerp(new THREE.Color(b.color),blend),
    paintColor:new THREE.Color(from==='snow'?0x4b708d:ROAD_PAINT.color).lerp(new THREE.Color(to==='snow'?0x4b708d:ROAD_PAINT.color),blend),
    detail:a.detail.map((v,i)=>v+(b.detail[i]-v)*blend),from,to,blend};
}
export function createPaintedRoadMaterial(THREE,color=BIOME_SURFACES.city.color,options={}){
  const m=createRoadMaterial(THREE,0xffffff);
  m.name='Five biome colors · original square LEGO checker · integrated paint';
  m.userData.embeddedRoadMarkings={...ROAD_PAINT};
  return applyRoadSurfaceShader(THREE,m,{color,...options});
}
/** Reuses the exact road pattern on the pre-existing terrain seam, covering
 * exposed gaps to the roadside walls without adding any drivable geometry.
 * Terrain must supply roadAcross just like the road; outside the bounded
 * fringe its original map/vertex colors and lighting remain untouched. */
export function applyRoadSurfaceShader(THREE,m,{fringe=false,color=BIOME_SURFACES.city.color,network=false}={}){
  m.userData.biomeSurfaces={boundaries:[...SURFACE_BOUNDS],transitionMeters:SURFACE_TRANSITION_METERS,
    colors:Object.fromEntries(Object.entries(BIOME_SURFACES).map(([id,s])=>[id,s.color])),fringe};
  const previousCompile=m.onBeforeCompile;
  m.customProgramCacheKey=()=> `urban-square-lego-biomes-v6-${fringe?'fringe':'paint'}-${network?'network':'legacy'}`;
  m.onBeforeCompile=shader=>{
    previousCompile?.call(m,shader);
    shader.uniforms.urPaintColor={value:new THREE.Color(ROAD_PAINT.color)};
    shader.uniforms.urSnowPaintColor={value:new THREE.Color(0x4b708d)};
    shader.uniforms.urSurfaceColors={value:Object.values(BIOME_SURFACES).map((s,i)=>new THREE.Color(i===0?color:s.color))};
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>\nattribute float roadAcross; varying vec2 urRoadMeters;
      ${network?'attribute float roadProgress; attribute float roadDistance; attribute float roadPaintMask; varying float urRoadDistance; varying float urRoadPaintMask;':''}
      ${network&&fringe?'attribute float roadFringeMask; varying float urRoadFringeMask;':''}`)
      .replace('#include <begin_vertex>',`#include <begin_vertex>\nurRoadMeters=vec2(${network&&fringe?'abs(roadAcross)':'roadAcross'},${network?'roadProgress':'-position.z'});
      ${network?'urRoadDistance=roadDistance; urRoadPaintMask=roadPaintMask;':''}
      ${network&&fringe?'urRoadFringeMask=roadFringeMask;':''}`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec2 urRoadMeters; uniform vec3 urPaintColor; uniform vec3 urSnowPaintColor;
      ${network?'varying float urRoadDistance; varying float urRoadPaintMask;':''}
      ${network&&fringe?'varying float urRoadFringeMask;':''}
      uniform vec3 urSurfaceColors[5];`).replace('#include <color_fragment>',`#include <color_fragment>
      vec2 aa=max(fwidth(urRoadMeters),vec2(.001));
      vec3 urSurfaceColor=urSurfaceColors[0];
      vec3 urSurfacePaint=urPaintColor;
      ${SURFACE_BOUNDS.map((boundary,i)=>`
      float urBiomeBlend${i}=smoothstep(${(boundary-SURFACE_TRANSITION_METERS/2).toFixed(1)},${(boundary+SURFACE_TRANSITION_METERS/2).toFixed(1)},urRoadMeters.y);
      urSurfaceColor=mix(urSurfaceColor,urSurfaceColors[${i+1}],urBiomeBlend${i});
      urSurfacePaint=mix(urSurfacePaint,${i+1===3?'urSnowPaintColor':'urPaintColor'},urBiomeBlend${i});`).join('')}
      // The exact v26 grass-checker map, already sampled by Three's map_fragment.
      // Its world-metric UVs repeat every 4m on both road and terrain. Mipmaps
      // average the 0.4m square studs at distance; there is no geometric relief.
      vec3 urLegoPattern=vec3(1.0);
      #ifdef USE_MAP
        urLegoPattern=sampledDiffuseColor.rgb;
      #endif
      float urSurfaceMask=${fringe?`step(abs(urRoadMeters.x),17.5)*step(${ROUTE.start.toFixed(1)},urRoadMeters.y)*(1.0-step(${ROUTE.end.toFixed(1)},urRoadMeters.y))${network?'*clamp(urRoadFringeMask,0.0,1.0)':''}`:'1.0'};
      vec3 urRoadColor=urSurfaceColor*urLegoPattern;
      diffuseColor.rgb=mix(diffuseColor.rgb,urRoadColor,urSurfaceMask);
      ${fringe?'':`
      float edge=(1.0-smoothstep(14.95-aa.x,14.95+aa.x,abs(urRoadMeters.x)))*smoothstep(14.81-aa.x,14.81+aa.x,abs(urRoadMeters.x));
      float phase=mod(${network?'urRoadDistance':'urRoadMeters.y'}-(${ROAD_PAINT.dashStart.toFixed(1)}),12.0);
      float dash=(1.0-smoothstep(.1-aa.x,.1+aa.x,abs(urRoadMeters.x)))*smoothstep(0.0,aa.y,phase)*(1.0-smoothstep(3.0-aa.y,3.0+aa.y,phase));
      dash*=step(${ROAD_PAINT.dashStart.toFixed(1)},urRoadMeters.y)*(1.0-step(${(ROUTE.end-3).toFixed(1)},urRoadMeters.y));
      diffuseColor.rgb=mix(diffuseColor.rgb,urSurfacePaint,clamp(max(edge,dash),0.0,1.0)${network?'*clamp(urRoadPaintMask,0.0,1.0)':''});`}`);
    if(fringe)shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.86,urSurfaceMask);');
  };return m;
}
