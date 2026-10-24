


import { ROUTE, BIOME_DEFINITIONS, FORKS, NETWORK_EDGES,
  routeDistanceAt, pointOnEdge,
  junctionDistance, queryRoadSurface,
} from './route-network.js';
import { CHECKPOINT_PROGRESS, PREVIEW_PROGRESS, HAZARD_FREE_DRIVING_SECTIONS } from './route-network-config.js';
import {BRIDGES} from './road-bridges.js';

export const ROAD_HAZARD_RULES = Object.freeze({
  count: 94, additionalSurfacePatches: 4, baseCount: 30, staticCount: 6, movingCount: 88, moversPerBiome: 4,
  moverCountByBiome: Object.freeze({city: 4, forest: 4, desert: 4, snow: 3, volcanic: 4}),
  staticSpacingMetres: 150, staticMoverSpacingMetres: 180, staticPerBiome: 2,
  exclusionMetres: 40, baseExclusionMetres: 100, junctionExclusionMetres: 100,
  forkTipExclusionMetres: 24, softEdgeMetres: 2.5,
  bodyWidth: 3.1, bodyLength: 5.76, minimumFreeCorridor: 8,
  rockSightlineMetres: 60, rockCrestEyeDistance: 180, maxDelta: .1,
  maximumApproachCurvature: .0025, maximumApproachHeadingChange: .34,
  maximumApproachGrade: .105,
  maximumSweepApproachCurvature: .0025, maximumSweepApproachHeadingChange: .34,
  moverOuterOffset: 10.6, moverTravelSeconds: 8, moverPauseSeconds: 1.4,
  moverSpacingMetres: 180, moverSightlineMetres: 100,
  additionalMoversPerBiome: 12, additionalSpacingMetres: 60,
  additionalSightlineMetres: 60, additionalSweepExtent: 10,
  additionalAlongAmplitude: 6, maximumAdditionalApproachCurvature: .0045, maximumMoverSpeed: 9,
});
const R = ROAD_HAZARD_RULES;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const finitePose = p => p && [p.x, p.z, p.heading].every(Number.isFinite);
const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
function randomFor(seed) {
  let s;
  if (Number.isFinite(seed)) s = seed >>> 0;
  else { s = 2166136261; for (const c of String(seed ?? 42)) { s ^= c.charCodeAt(0); s = Math.imul(s, 16777619); } }
  return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}


export const ROAD_HAZARD_EXCLUSIONS = Object.freeze([
  { id: 'spawn', progress: 0 }, { id: 'route-start', progress: ROUTE.start },
  { id: 'route-end', progress: ROUTE.end },
  ...BRIDGES.map(b=>({id:b.id,progress:(b.from+b.to)/2})),
  ...CHECKPOINT_PROGRESS.map((progress, i) => ({ id: `checkpoint-${String(i + 1).padStart(2, '0')}`, progress })),
  ...PREVIEW_PROGRESS.map(p => ({ id: `preview-${p.id}`, progress: p.progress })),
  ...BIOME_DEFINITIONS.slice(1).map(p => ({ id: `join-${p.id}`, progress: p.from })),
  ...FORKS.flatMap(f => [{ id: `${f.id}-split`, progress: f.from }, { id: `${f.id}-join`, progress: f.to }]),
].map(p => Object.freeze({ ...p, distance: routeDistanceAt(p.progress), radius: R.exclusionMetres })));

const recoverySections = HAZARD_FREE_DRIVING_SECTIONS.map(section => ({
  from: routeDistanceAt(section.from) - section.recovery,
  to: routeDistanceAt(section.to) + section.recovery,
}));
const inRecoverySection = (distance, extent = 0) => recoverySections.some(section =>
  distance + extent >= section.from && distance - extent <= section.to);



export function rockApproachIsClear(h, sample=pointOnEdge) {
  const edge = NETWORK_EDGES.find(e => e.id === h.edgeId), sight = R.rockSightlineMetres;
  if (!edge || h.edgeDistance < sight + 8 || edge.length - h.edgeDistance < sight + 8) return false;
  const center = sample(h.edgeId, h.edgeDistance);
  for (let d = -sight; d <= sight; d += 5) {
    const p = sample(h.edgeId, h.edgeDistance + d);
    if (Math.abs(p.curvature) > R.maximumApproachCurvature ||
      Math.abs(angleDelta(p.heading, center.heading)) > R.maximumApproachHeadingChange ||
      Math.hypot(p.gradient.x, p.gradient.z) > R.maximumApproachGrade ||
      junctionDistance(p.progress) < R.junctionExclusionMetres) return false;


    const eye = sample(h.edgeId, h.edgeDistance + (d < 0 ? -R.rockCrestEyeDistance : R.rockCrestEyeDistance));
    const fraction = Math.abs(d) / sight;
    if (p.height > center.height * (1 - fraction) + (eye.height + 2) * fraction + .1) return false;
  }
  return true;
}
const moverCandidates = new Map();
function moverCandidatesFor(biome,sample) {
  if (moverCandidates.has(biome)) return moverCandidates.get(biome);
  const candidates = [];
  for (const edge of NETWORK_EDGES.filter(e => e.biome === biome && !e.forkId)) {


    for (let distance = R.moverSightlineMetres + 15; distance < edge.length - R.moverSightlineMetres - 15; distance += 5) {
      const p = sample(edge.id, distance), extent = 5;
      if (inRecoverySection(p.distance, extent)) continue;
      // The long dune patch needs this broad exit: it cannot fit between the
      // tightly spaced desert bridges. Reserve it before packing short movers.
      if (biome === 'desert' && p.progress >= 7200 && p.progress <= 7350) continue;
      if(p.distance < routeDistanceAt(CHECKPOINT_PROGRESS[2])+160)continue;
      if (ROAD_HAZARD_EXCLUSIONS.some(e => Math.abs(p.distance - e.distance) < R.baseExclusionMetres + extent)) continue;
      const fork = FORKS.find(f => f.id === edge.forkId);
      if (fork && (p.progress < fork.splitOverlapEnd + 110 || p.progress > fork.mergeOverlapStart - 110)) continue;
      let clear = true;
      for (let d = -R.moverSightlineMetres; d <= R.moverSightlineMetres; d += 2.5) {
        const q = sample(edge.id, distance + d);
        if (Math.abs(q.curvature) > R.maximumApproachCurvature ||
          Math.abs(angleDelta(q.heading, p.heading)) > R.maximumApproachHeadingChange ||
          Math.hypot(q.gradient.x, q.gradient.z) > R.maximumApproachGrade) { clear = false; break; }
      }
      if (clear) candidates.push(Object.freeze(p));
    }
  }
  moverCandidates.set(biome, Object.freeze(candidates));
  return candidates;
}

const additionalCandidates = new Map();
function additionalCandidatesFor(biome, sample) {
  if (additionalCandidates.has(biome)) return additionalCandidates.get(biome);
  const candidates=[], sight=R.additionalSightlineMetres, extent=R.additionalSweepExtent;
  for (const edge of NETWORK_EDGES.filter(e=>e.biome===biome&&!e.forkId)) {
    for (let distance=sight+15;distance<edge.length-sight-15;distance+=5) {
      const p=sample(edge.id,distance);
      if (inRecoverySection(p.distance, extent)) continue;
      if (p.distance<routeDistanceAt(CHECKPOINT_PROGRESS[2])+160) continue;
      if (ROAD_HAZARD_EXCLUSIONS.some(e=>Math.abs(p.distance-e.distance)<e.radius+extent)) continue;
      const fork=FORKS.find(f=>f.id===edge.forkId);
      if (fork&&(p.progress<fork.splitOverlapEnd+R.forkTipExclusionMetres+extent||p.progress>fork.mergeOverlapStart-R.forkTipExclusionMetres-extent)) continue;
      let clear=true;
      for (let d=-sight;d<=sight;d+=5) {
        const q=sample(edge.id,distance+d);
        if (Math.abs(q.curvature)>R.maximumAdditionalApproachCurvature||Math.abs(angleDelta(q.heading,p.heading))>R.maximumApproachHeadingChange||Math.hypot(q.gradient.x,q.gradient.z)>R.maximumApproachGrade) {clear=false;break;}
      }
      if (clear) candidates.push(Object.freeze(p));
    }
  }
  candidates.sort((a,b)=>a.distance-b.distance||a.edgeId.localeCompare(b.edgeId));
  additionalCandidates.set(biome,Object.freeze(candidates));
  return candidates;
}



export function buildRoadHazards(seed = 42, {reservedIntervals = []} = {}) {
  // Adjacent candidates check the same 2.5/5m approach stations repeatedly.
  // Retain exact samples only during this build; runtime poses stay independent.
  const samples=new Map();
  const sample=(id,distance)=>{
    let edge=samples.get(id);if(!edge){edge=new Map();samples.set(id,edge);}
    if(!edge.has(distance))edge.set(distance,pointOnEdge(id,distance));
    return edge.get(distance);
  };
  const random = randomFor(seed), result = [];
  const biomes = BIOME_DEFINITIONS.map(b => b.id);
  for (const biome of biomes) {
    const available = [];
    for (const p of moverCandidatesFor(biome,sample)) {
      if (available.every(other =>
        Math.abs(other.distance - p.distance) >= R.moverSpacingMetres)) available.push(p);
    }
    const moverCount = R.moverCountByBiome[biome] ?? R.moversPerBiome;
    if (available.length < moverCount) throw new Error(`Insufficient fair mover positions: ${biome}`);
    const selected = Array.from({length: moverCount}, (_, i) =>
      available[Math.floor(i * (available.length - 1) / (moverCount - 1))]);
    for (const [i, p] of selected.entries()) {
      const type = biome === 'city' || biome === 'snow' ? 'barrier' : 'boulder';
      const width = 3.8, length = type === 'barrier' ? 2.3 : 3.5;
      const height = type === 'barrier' ? 1.35 : 1.8;
      const motion = Object.freeze({
        minOffset: -R.moverOuterOffset, maxOffset: R.moverOuterOffset,
        path: 'lateral', speedMultiplier: 1, alongAmplitude: 0,
        crossesCenter: true, travelSeconds: R.moverTravelSeconds,

        period: 2 * (R.moverTravelSeconds + R.moverPauseSeconds), phase: random(),
        pauseSeconds: R.moverPauseSeconds, startPause: 1.2,
      });
      const offset = motionOffset(motion, 0);
      const x = p.x + p.right.x * offset, z = p.z + p.right.z * offset;
      result.push(Object.freeze({
        id: `${biome}-${type}-compact-mover-${i + 1}`, type, biome, expanded: true,
        station: p.progress, progress: p.progress, distance: p.distance,
        edgeId: p.edgeId, edgeDistance: p.edgeDistance, branch: p.branch,
        x, z, heading: p.heading, roadHeading: p.heading, headingDelta: 0,
        width, length, height, offset, groundHeight: queryRoadSurface(x, z, p).height,
        solid: true, edgeBlend: 0, series: `${biome}-mover-${i}`, pattern: 'lateral-sweep',
        ...moverBypass(offset, width),
        motion,
      }));
    }
  }
  if (result.length !== biomes.reduce((sum, biome) => sum + R.moverCountByBiome[biome], 0)) throw new Error(`Unexpected mover count: ${result.length}`);

  const staticFractions = [.10, .36, .66, .93];
  const lateralPattern = [-8.4, 5.8, -2.8, 8.8, -6.6, 2.3];
  for (const biome of biomes) {
    const candidates = [];
    const biomeIndex = biomes.indexOf(biome);

    for (const edge of NETWORK_EDGES.filter(e => e.biome === biome && !e.forkId)) {
      for (let distance = 10; distance < edge.length - 10; distance += 5) {
        if(distance<R.moverSightlineMetres+15||edge.length-distance<R.moverSightlineMetres+15)continue;
        const p = sample(edge.id, distance);
        let clear=true;
        for(let d=-R.moverSightlineMetres;d<=R.moverSightlineMetres;d+=5){
          const q=sample(edge.id,distance+d);
          if(Math.abs(q.curvature)>R.maximumSweepApproachCurvature||Math.abs(angleDelta(q.heading,p.heading))>R.maximumSweepApproachHeadingChange||Math.hypot(q.gradient.x,q.gradient.z)>R.maximumApproachGrade){clear=false;break;}
        }
        if(!clear)continue;
        const type = {city: 'repair', forest: 'log', desert: 'dune', snow: 'ice', volcanic: 'rock'}[biome];
        const size = STATIC_DIMENSIONS[type];
        const extent = Math.hypot(size.width, size.length) / 2 + 1;
        if (inRecoverySection(p.distance, extent)) continue;
        if (ROAD_HAZARD_EXCLUSIONS.some(e => Math.abs(p.distance - e.distance) < R.baseExclusionMetres + extent)) continue;
        const fork = FORKS.find(f => f.id === edge.forkId);
        if (fork && (p.progress - fork.splitOverlapEnd < R.forkTipExclusionMetres + extent ||
          fork.mergeOverlapStart - p.progress < R.forkTipExclusionMetres + extent)) continue;
        if (result.some(h => h.edgeId === p.edgeId && Math.abs(h.edgeDistance - distance) < R.moverSpacingMetres)) continue;


        const offset = -size.lateral;
        const x = p.x + p.right.x * offset, z = p.z + p.right.z * offset;
        const descriptor = {
          id: `${biome}-${type}-compact-static-${candidates.length + 1}`, type, biome,
          station: p.progress, progress: p.progress, distance: p.distance,
          edgeId: p.edgeId, edgeDistance: distance, branch: p.branch,
          x, z, heading: p.heading, roadHeading: p.heading, headingDelta: 0,
          width: size.width, length: size.length, height: size.height, offset,
          groundHeight: queryRoadSurface(x, z, p).height,
          solid: type === 'repair' || type === 'log' || type === 'rock',
          edgeBlend: type === 'dune' || type === 'ice' ? R.softEdgeMetres : 0,
          series: `${biome}-static-${candidates.length}`, pattern: 'single',
          bypassSide: 0, bypassMin: -4, bypassMax: 4, motion: null,
        };
        if (type === 'rock' && !rockApproachIsClear(descriptor,sample)) continue;
        candidates.push(Object.freeze(descriptor));
      }
    }
    const definition=BIOME_DEFINITIONS.find(b=>b.id===biome);
    const startDistance=routeDistanceAt(definition.from),endDistance=routeDistanceAt(definition.to);
    const encounterCount=biome==='volcanic'?6:(biome==='forest'||biome==='snow'||biome==='desert')?1:R.staticPerBiome;
    for(let slot=0;slot<encounterCount;slot++){
      const fraction=(encounterCount===1?.5:encounterCount===2?[.15,.85][slot]:(.10+.83*slot/(encounterCount-1)))+(random()-.5)*.045;
      const target=startDistance+(endDistance-startDistance)*fraction;
      const available=candidates.filter(h=>result.every(other=>
        Math.abs(other.distance-h.distance)>=(R.moverSpacingMetres)));
      available.sort((a,b)=>Math.abs(a.distance-target)-Math.abs(b.distance-target)||a.edgeId.localeCompare(b.edgeId));
      const base=available[0];
      if(!base)throw new Error(`Insufficient separated encounters: ${biome}/${slot}`);
      const size=STATIC_DIMENSIONS[base.type];
      const offset=clamp(lateralPattern[(slot+biomeIndex)%lateralPattern.length]+(random()-.5)*.9,
        -14+size.width/2,14-size.width/2);
      const point=sample(base.edgeId,base.edgeDistance);
      const x=point.x+point.right.x*offset,z=point.z+point.right.z*offset;
      const half=size.width/2;
      const left=offset-half+15,right=15-offset-half;
      const bypassSide=right>=left?1:-1;
      result.push(Object.freeze({...base,
        id:`${biome}-${base.type}-spaced-static-${slot+1}`,expanded:true,
        x,z,offset,groundHeight:queryRoadSurface(x,z,point).height,
        series:`${biome}-encounter-${slot+1}`,pattern:'single',
        bypassSide,bypassMin:bypassSide>0?offset+half+2:-12,
        bypassMax:bypassSide>0?12:offset-half-2,
      }));
    }
  }
  if (result.length !== R.baseCount) throw new Error(`Unexpected base hazard count: ${result.length}`);
  const motionRandom=randomFor(`${seed}:all-hazard-crossings`);
  const moving=result.map(h=>{
    if(h.motion)return h;
    const outer=Math.min(R.moverOuterOffset,14-h.width/2);
    const motion=Object.freeze({minOffset:-outer,maxOffset:outer,crossesCenter:true,
      path:'lateral',speedMultiplier:1,alongAmplitude:0,
      travelSeconds:R.moverTravelSeconds,pauseSeconds:R.moverPauseSeconds,
      period:2*(R.moverTravelSeconds+R.moverPauseSeconds),phase:motionRandom(),startPause:1.2});
    const p=sample(h.edgeId,h.edgeDistance),offset=motionOffset(motion,0);
    const x=p.x+p.right.x*offset,z=p.z+p.right.z*offset;
    return Object.freeze({...h,motion,pattern:'lateral-sweep',offset,x,z,
      groundHeight:queryRoadSurface(x,z,p).height,...moverBypass(offset,h.width)});
  });
  // Keep the existing encounters and reserve steering/recovery zones. Share the
  // extra pairs across biomes that still have room, keeping both fast paths equal.
  const extraRandom=randomFor(`${seed}:varied-hazards`);
  const plans=biomes.map(biome=>{
    const packed=[];
    for (const p of additionalCandidatesFor(biome,sample)) {
      if (moving.every(h=>Math.abs(h.distance-p.distance)>=R.additionalSpacingMetres)&&
          packed.every(q=>Math.abs(q.distance-p.distance)>=R.additionalSpacingMetres)) packed.push(p);
    }
    return {biome,packed,count:2*Math.floor(Math.min(packed.length,R.additionalMoversPerBiome)/2)};
  });
  let remaining=R.count-R.additionalSurfacePatches-moving.length-plans.reduce((sum,plan)=>sum+plan.count,0);
  while (remaining>0) {
    const available=plans.filter(plan=>plan.packed.length>=plan.count+2)
      .sort((a,b)=>a.count-b.count||biomes.indexOf(a.biome)-biomes.indexOf(b.biome));
    if (!available.length) throw new Error('Insufficient protected extra mover positions');
    available[0].count+=2;remaining-=2;
  }
  for (const {biome,packed,count} of plans) {
    for (let i=0;i<count;i++) {
      const p=packed[Math.floor(i*(packed.length-1)/(count-1))];
      const type=biome==='city'||biome==='snow'?'barrier':'boulder', width=3.8;
      const path=i%2?'oval':'diagonal',speedMultiplier=i%2?2:1.5;
      const travelSeconds=R.moverTravelSeconds/speedMultiplier,pauseSeconds=R.moverPauseSeconds/speedMultiplier;
      const motion=Object.freeze({minOffset:-R.moverOuterOffset,maxOffset:R.moverOuterOffset,crossesCenter:true,
        path,speedMultiplier,alongAmplitude:R.additionalAlongAmplitude,direction:extraRandom()<.5?-1:1,
        travelSeconds,pauseSeconds,period:2*(travelSeconds+pauseSeconds),phase:extraRandom(),startPause:1.2});
      const pose={},offset=motionOffset(motion,0,pose),alongOffset=pose.alongOffset;
      const x=p.x+p.right.x*offset+Math.sin(p.heading)*alongOffset,z=p.z+p.right.z*offset+Math.cos(p.heading)*alongOffset;
      moving.push(Object.freeze({id:`${biome}-${type}-extra-mover-${i+1}`,type,biome,expanded:true,
        station:p.progress,progress:p.progress,distance:p.distance,edgeId:p.edgeId,edgeDistance:p.edgeDistance,branch:p.branch,
        x,z,heading:p.heading,roadHeading:p.heading,headingDelta:0,width,length:type==='barrier'?2.3:3.5,height:type==='barrier'?1.35:1.8,
        offset,alongOffset,groundHeight:queryRoadSurface(x,z,p).height,solid:true,edgeBlend:0,
        series:`${biome}-extra-mover-${i+1}`,pattern:path==='oval'?'oval-loop':'diagonal-sweep',motion,...moverBypass(offset,width)}));
    }
  }
  if (moving.length!==R.count-R.additionalSurfacePatches) throw new Error(`Unexpected hazard count: ${moving.length}`);
  const hazards=Object.freeze(moving.sort((a, b) => a.distance - b.distance || a.edgeId.localeCompare(b.edgeId)));
  const surfaces=hazards.filter(h=>h.type==='dune'||h.type==='ice');
  const obstacles=hazards.filter(h=>h.type!=='dune'&&h.type!=='ice');
  const packed=[...(reservedIntervals.length?repackReservedHazards(obstacles,reservedIntervals,sample):obstacles)];
  // Add new surface encounters without replacing any existing obstacle.
  for(const [biome,type] of [['desert','dune'],['snow','ice']]){
    const size=STATIC_DIMENSIONS[type],extent=Math.hypot(size.width,size.length)/2+1;
    const definition=BIOME_DEFINITIONS.find(b=>b.id===biome),from=routeDistanceAt(definition.from),to=routeDistanceAt(definition.to);
    for(let slot=1;slot<=3;slot++){
      const target=from+(to-from)*(slot===1?.5:slot===2?.25:.75);
      const available=additionalCandidatesFor(biome,sample).filter(p=>
        !reservedIntervals.some(r=>p.distance+extent>=r.from&&p.distance-extent<=r.to)&&
        !ROAD_HAZARD_EXCLUSIONS.some(e=>Math.abs(p.distance-e.distance)<e.radius+extent)&&
        !inRecoverySection(p.distance,extent)&&
        packed.every(h=>Math.abs(h.distance-p.distance)>=extent+h.length/2+(h.motion?.alongAmplitude||0)+2));
      available.sort((a,b)=>Math.abs(a.distance-target)-Math.abs(b.distance-target)||a.distance-b.distance);
      const point=available[0];
      if(!point)throw new Error(`Insufficient native surface patch slots: ${biome}/${slot}`);
      packed.push(Object.freeze({id:slot===1?surfaces.find(h=>h.type===type).id:`${biome}-${type}-fixed-patch-${slot}`,type,biome,expanded:true,
        station:point.progress,progress:point.progress,distance:point.distance,edgeId:point.edgeId,edgeDistance:point.edgeDistance,branch:point.branch,
        x:point.x,z:point.z,heading:point.heading,roadHeading:point.heading,headingDelta:0,offset:slot===2?-4.5:4.5,
        width:size.width,length:size.length,height:size.height,solid:false,edgeBlend:R.softEdgeMetres,motion:null,
        series:`${biome}-surface-${slot}`}));
    }
  }
  packed.sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id));
  return Object.freeze(packed.map(h=>{
    if(h.type!=='dune'&&h.type!=='ice')return h;
    const point=sample(h.edgeId,h.edgeDistance),offset=h.offset<0?-4.5:4.5;
    const x=point.x+point.right.x*offset,z=point.z+point.right.z*offset;
    return Object.freeze({...h,x,z,offset,motion:null,pattern:'fixed-rounded-patch',alongOffset:0,
      groundHeight:queryRoadSurface(x,z,point).height,...moverBypass(offset,h.width),
      patchOutline:makePatchOutline(h,`${seed}:${h.id}:patch`)});
  }));
}

function repackReservedHazards(hazards,intervals,sample){
  const ranges=intervals.map(range=>{
    if(!Number.isFinite(range.from)||!Number.isFinite(range.to)||range.from>range.to)throw new TypeError('Reserved route interval must have finite ordered endpoints');
    return range;
  });
  const extent=h=>Math.hypot(h.width,h.length)/2+(h.motion.alongAmplitude||0)+1;
  const clear=(p,h)=>ranges.every(r=>p.distance+extent(h)<r.from||p.distance-extent(h)>r.to);
  const result=[],bases=hazards.filter(h=>h.motion.path==='lateral'),extras=hazards.filter(h=>h.motion.path!=='lateral');
  const biomes=BIOME_DEFINITIONS.map(b=>b.id);
  const basePool=[...biomes.flatMap(b=>moverCandidatesFor(b,sample)),...bases.map(h=>sample(h.edgeId,h.edgeDistance))];
  function relocate(h,p){
    const pose={},offset=motionOffset(h.motion,0,pose),alongOffset=pose.alongOffset;
    const x=p.x+p.right.x*offset+Math.sin(p.heading)*alongOffset,z=p.z+p.right.z*offset+Math.cos(p.heading)*alongOffset;
    return Object.freeze({...h,biome:p.biome,station:p.progress,progress:p.progress,distance:p.distance,edgeId:p.edgeId,edgeDistance:p.edgeDistance,branch:p.branch,x,z,heading:p.heading,roadHeading:p.heading,headingDelta:0,offset,...(h.alongOffset===undefined?{}:{alongOffset}),groundHeight:queryRoadSurface(x,z,p).height,...moverBypass(offset,h.width)});
  }
  // The original 30 have the longest sightlines. Pack them before the faster
  // short movers; retaining all unblocked extras first can strand a base mover.
  for(const h of bases)if(clear(h,h))result.push(h);
  const legalBase=(p,h,ignore=-1)=>(h.type!=='dune'||p.biome==='desert')&&(h.type!=='ice'||p.biome==='snow')&&clear(p,h)&&result.every((other,j)=>j===ignore||Math.abs(other.distance-p.distance)>=R.moverSpacingMetres)&&
    ROAD_HAZARD_EXCLUSIONS.every(e=>Math.abs(p.distance-e.distance)>R.baseExclusionMetres+extent(h))&&
    !inRecoverySection(p.distance,extent(h))&&(h.type!=='rock'||rockApproachIsClear({...h,edgeId:p.edgeId,edgeDistance:p.edgeDistance},sample));
  function selectBase(h,ownBiomeOnly){
    const matching=p=>!ownBiomeOnly||p.biome===h.biome;
    let available=basePool.filter(p=>matching(p)&&legalBase(p,h));
    // Seeded legacy encounters can leave a five-metre packing sliver. Move one
    // neighbour within its own protected sightline before exporting the surplus.
    if(!available.length)for(let i=0;i<result.length&&!available.length;i++){
      const neighbour=result[i];if(ownBiomeOnly&&neighbour.biome!==h.biome)continue;
      const alternatives=basePool.filter(p=>p.biome===neighbour.biome&&Math.abs(p.distance-neighbour.distance)<=60&&legalBase(p,neighbour,i)).sort((a,b)=>Math.abs(a.distance-neighbour.distance)-Math.abs(b.distance-neighbour.distance));
      for(const p of alternatives){result[i]=relocate(neighbour,p);available=basePool.filter(q=>matching(q)&&legalBase(q,h));if(available.length)break;result[i]=neighbour;}
    }
    available.sort((a,b)=>(a.biome===h.biome?0:1)-(b.biome===h.biome?0:1)||Math.abs(a.distance-h.distance)-Math.abs(b.distance-h.distance)||a.distance-b.distance);
    return available[0];
  }
  const baseSurplus=[];
  // Allocate every biome's own long crossing before admitting overflow. A city
  // crossing must not consume Snow's last legal ice slot while Snow is pending.
  for(const h of bases.filter(h=>!clear(h,h))){
    const p=selectBase(h,true);if(!p){baseSurplus.push(h);continue;}
    result.push(relocate(h,p));
  }
  for(const h of baseSurplus){
    const p=selectBase(h,false);if(!p)throw new Error(`Insufficient reserved base mover positions: ${h.id}`);
    result.push(relocate(h,p));
  }
  const extraExtent=Math.max(...extras.map(extent));
  const extraPool=biomes.flatMap(b=>additionalCandidatesFor(b,sample)).sort((a,b)=>a.distance-b.distance).filter(p=>!(
      ranges.some(r=>p.distance+extraExtent>=r.from&&p.distance-extraExtent<=r.to)||
      ROAD_HAZARD_EXCLUSIONS.some(e=>Math.abs(p.distance-e.distance)<=e.radius+extraExtent)||
      inRecoverySection(p.distance,extraExtent)));
  function packExtras(bases){const packed=[];for(const p of extraPool){if(bases.some(h=>Math.abs(h.distance-p.distance)<R.additionalSpacingMetres)||packed.length&&p.distance-packed.at(-1).distance<R.additionalSpacingMetres)continue;packed.push(p);}return packed;}
  let packed=packExtras(result);
  // Shift a long crossing within its legal sightline to leave whole 60 m slots,
  // rather than two unusable fragments on either side of an otherwise safe pose.
  for(let pass=0;packed.length<extras.length&&pass<3;pass++){
    let improved=false;
    for(let i=0;i<result.length&&packed.length<extras.length;i++){
      const h=result[i];let best=h,bestPacked=packed;
      for(const p of basePool){
        if(p.biome!==h.biome||!clear(p,h)||result.some((other,j)=>i!==j&&Math.abs(other.distance-p.distance)<R.moverSpacingMetres)||
          ROAD_HAZARD_EXCLUSIONS.some(e=>Math.abs(p.distance-e.distance)<=R.baseExclusionMetres+extent(h))||inRecoverySection(p.distance,extent(h))||
          h.type==='rock'&&!rockApproachIsClear({...h,edgeId:p.edgeId,edgeDistance:p.edgeDistance},sample))continue;
        const alternative=result.slice();alternative[i]=p;const slots=packExtras(alternative);
        if(slots.length>bestPacked.length){best=relocate(h,p);bestPacked=slots;}
      }
      if(best!==h){result[i]=best;packed=bestPacked;improved=true;}
    }
    if(!improved)break;
  }
  if(packed.length<extras.length)throw new Error(`Insufficient reserved extra mover positions: ${packed.length}/${extras.length}`);
  const surplus=[];
  // Give each biome its own short crossings before filling spare capacity with
  // surplus from another biome; otherwise an early overflow causes a cascade.
  for(const biome of biomes)for(const h of extras.filter(h=>h.biome===biome)){
    const local=packed.filter(p=>p.biome===biome).sort((a,b)=>Math.abs(a.distance-h.distance)-Math.abs(b.distance-h.distance)||a.distance-b.distance);
    if(!local.length){surplus.push(h);continue;}
    const p=local[0];packed.splice(packed.indexOf(p),1);result.push(relocate(h,p));
  }
  for(const h of surplus){packed.sort((a,b)=>Math.abs(a.distance-h.distance)-Math.abs(b.distance-h.distance)||a.distance-b.distance);result.push(relocate(h,packed.shift()));}
  return Object.freeze(result.sort((a,b)=>a.distance-b.distance||a.edgeId.localeCompare(b.edgeId)));
}
const STATIC_DIMENSIONS = Object.freeze({
  repair: Object.freeze({width: 4, length: 3.5, height: 1.3, lateral: 8.7}),
  log: Object.freeze({width: 7.3, length: 1.25, height: 1.25, lateral: 9.95}),
  dune: Object.freeze({width: 21, length: 18, height: .15, lateral: 10}),
  ice: Object.freeze({width: 21, length: 19, height: .035, lateral: 10}),
  rock: Object.freeze({width: 4.7, length: 4.8, height: 2.2, lateral: 9.8}),
});



function moverBypass(offset, width, pose = {}) {
  const bypassSide = offset <= 0 ? 1 : -1, half = width / 2;
  pose.bypassSide = bypassSide;
  pose.bypassMin = bypassSide > 0 ? offset + half + 2 : -12;
  pose.bypassMax = bypassSide > 0 ? 12 : offset - half - 2;
  return pose;
}




function motionOffset(motion, elapsed, pose) {
  const t = (Math.max(0, elapsed-motion.startPause) + motion.phase*motion.period) % motion.period;
  const dwell = motion.pauseSeconds, travel = motion.travelSeconds;
  let amount,returning=false;
  if (t < dwell) amount = 0;
  else if (t < dwell+travel) amount = smooth((t-dwell)/travel);
  else if (t < 2*dwell+travel) amount = 1;
  else {amount = 1-smooth((t-2*dwell-travel)/travel);returning=true;}
  if (pose) {
    const amplitude=(motion.alongAmplitude||0)*(motion.direction||1);
    pose.alongOffset=motion.path==='diagonal'?amplitude*(2*amount-1):
      motion.path==='oval'&&amount>0&&amount<1?amplitude*(returning?-1:1)*Math.sin(Math.PI*amount):0;
  }
  return motion.minOffset+(motion.maxOffset-motion.minOffset)*amount;
}




export function roadHazardContact(hazard, x, z, heading, padding = 0, footprint) {
  if (![x, z, heading, padding].every(Number.isFinite)) return undefined;
  const hc = Math.cos(hazard.heading), hs = Math.sin(hazard.heading);
  const c = Math.cos(heading), s = Math.sin(heading);
  const right = [c, -s], back = [s, c], hr = [hc, -hs], hb = [hs, hc];
  const hw = (footprint?.halfWidth ?? R.bodyWidth / 2) + padding,
    hl = (footprint?.halfLength ?? R.bodyLength / 2) + padding;
  const dx = x - hazard.x, dz = z - hazard.z;
  const radius = Math.hypot(hw, hl) + Math.hypot(hazard.width, hazard.length) / 2;
  if (dx * dx + dz * dz > radius * radius) return undefined;
  let depth = Infinity, nx = 0, nz = 0;
  for (const [ax, az] of [hr, hb, right, back]) {
    const body = hw * Math.abs(ax * right[0] + az * right[1]) + hl * Math.abs(ax * back[0] + az * back[1]);
    const obstacle = hazard.width / 2 * Math.abs(ax * hr[0] + az * hr[1]) + hazard.length / 2 * Math.abs(ax * hb[0] + az * hb[1]);
    const separation = dx * ax + dz * az, overlap = body + obstacle - Math.abs(separation);
    if (overlap <= 0) return undefined;
    if (overlap < depth) { depth = overlap; const sign = separation < 0 ? -1 : 1; nx = ax * sign; nz = az * sign; }
  }
  return { normalX: nx, normalZ: nz, depth, name: `Road hazard ${hazard.id}` };
}
function makePatchOutline(h,seed){
 const random=randomFor(seed),points=[],count=64,phase=random()*Math.PI*2;
 // Smooth rounded lobes preserve an organic outline without torn teeth.
 for(let i=0;i<count;i++){
  const angle=i*Math.PI*2/count,radius=1+.045*Math.sin(3*angle+phase)+.025*Math.sin(5*angle-phase);
  points.push({x:Math.cos(angle)*radius,z:Math.sin(angle)*radius});
 }
 const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z));
 return Object.freeze(points.map(p=>Object.freeze({x:((p.x-minX)/(maxX-minX)-.5)*h.width,z:((p.z-minZ)/(maxZ-minZ)-.5)*h.length})));
}
export function roadHazardPatchOutline(h){return h.patchOutline||makePatchOutline(h,h.id);}
// One signed boundary distance drives paint blending, grip and entry effects.
export function roadHazardPatchDistance(h,x,z){
 const c=Math.cos(h.heading),s=Math.sin(h.heading),dx=x-h.x,dz=z-h.z;
 const px=c*dx-s*dz,pz=s*dx+c*dz,polygon=roadHazardPatchOutline(h);
 let inside=false,nearest=Infinity;
 for(let i=0;i<polygon.length;i++){
  const a=polygon[i],b=polygon[(i+1)%polygon.length],ex=b.x-a.x,ez=b.z-a.z;
  const t=clamp(((px-a.x)*ex+(pz-a.z)*ez)/(ex*ex+ez*ez||1),0,1);
  nearest=Math.min(nearest,Math.hypot(px-a.x-ex*t,pz-a.z-ez*t));
  if((a.z>pz)!==(b.z>pz)&&px<a.x+(b.x-a.x)*(pz-a.z)/(b.z-a.z))inside=!inside;
 }
 return inside?nearest:-nearest;
}
function patchWeight(h,x,z){return smooth(roadHazardPatchDistance(h,x,z)/R.softEdgeMetres);}
const PATCH_FACTORS = Object.freeze({
  dune: Object.freeze({ frictionFactor: .95, lateralDampingFactor: .95, rollingFactor: 1.28, engineFactor: .86, speedFactor: .80, coastingFactor: 1.1 }),
  ice: Object.freeze({ frictionFactor: .62, lateralDampingFactor: .5, rollingFactor: .9, engineFactor: .94, coastingFactor: .76 }),
});


export function createRoadHazards(seed = 42, options = {}) {
  const hazards = buildRoadHazards(seed,options);
  const poses = Object.freeze(hazards.map(h => h.motion ? {...h} : h));
  const poseById = new Map(poses.map(h => [h.id,h])), solids = poses.filter(h => h.solid), patches=poses.filter(h=>h.edgeBlend);
  const movers = Object.freeze(poses.filter(h => h.motion));
  const moverFrames = movers.map(h => pointOnEdge(h.edgeId,h.edgeDistance));
  let elapsed = 0;
  const rocks = Object.freeze(hazards.filter(h => h.type === 'rock').map(h => Object.freeze({
    id:h.id,phase:'landed',elapsed:0,warningSeconds:0,fallSeconds:0,fallProgress:1,
    shadowVisible:false,rockVisible:true,altitude:0,deferred:false,
  })));
  const rockById=new Map(rocks.map(s=>[s.id,s]));

  function setMoverPoses() {
    for (let i=0;i<movers.length;i++) {
      const h=movers[i], p=moverFrames[i];
      h.offset=motionOffset(h.motion,elapsed,h);
      moverBypass(h.offset,h.width,h);
      h.x=p.x+p.right.x*h.offset+Math.sin(h.heading)*h.alongOffset;
      h.z=p.z+p.right.z*h.offset+Math.cos(h.heading)*h.alongOffset;
      const ground=queryRoadSurface(h.x,h.z,p);
      h.groundHeight=ground.height;h.groundGradientX=ground.gradient.x;h.groundGradientZ=ground.gradient.z;
    }
  }
  function reset(){elapsed=0;setMoverPoses();}
  function update(dt,player,active=true){
    if(!active || !Number.isFinite(dt) || dt<=0 || !finitePose(player))return;
    elapsed+=Math.min(R.maxDelta,dt);setMoverPoses();
  }
  const poseFor=id=>poseById.get(typeof id==='string'?id:id?.id);
  function contact(x, z, heading, footprint) {
    if (![x, z, heading].every(Number.isFinite)) return undefined;
    let deepest;
    for (const h of solids) {
      if (h.type === 'rock' && rockById.get(h.id).phase !== 'landed') continue;
      const hit = roadHazardContact(h, x, z, heading, 0, footprint);
      if (hit && (!deepest || hit.depth > deepest.depth)) deepest = hit;
    }
    return deepest;
  }
  function patchAt(x,z,margin=0){
    if(![x,z,margin].every(Number.isFinite))return null;
    return patches.find(h=>roadHazardPatchDistance(h,x,z)>=-margin-1e-8)||null;
  }
  function surfaceAt(x, z, baseSurface) {
    if (![x, z].every(Number.isFinite) || !baseSurface || typeof baseSurface !== 'object') return baseSurface;
    for (const h of patches) {
      const weight = patchWeight(h, x, z);
      if (weight <= 0) continue;
      const surface = { ...baseSurface };
      for (const [key, factor] of Object.entries(PATCH_FACTORS[h.type])) {
        if (Number.isFinite(baseSurface[key])) surface[key] = baseSurface[key] * (1 + (factor - 1) * weight);
      }
      if (h.type === 'dune' && Number.isFinite(baseSurface.vibration)) surface.vibration = Math.min(1, baseSurface.vibration + .08 * weight);
      return surface;
    }

    return baseSurface;
  }
  setMoverPoses();
  return Object.freeze({ hazards, poses, movers, rocks, poseFor, get elapsed(){return elapsed;}, update, reset, contact, surfaceAt, patchAt });
}
