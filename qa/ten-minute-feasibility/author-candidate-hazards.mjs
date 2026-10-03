// HISTORICAL ONE-TIME AUTHORING PASS. Not idempotent; do not rerun on the finalized candidate.
import fs from 'node:fs';
const root='/workspace/scratch/e6939d35b3a6/city-ten-minute-candidate/';
const file=root+'dist/road-hazards.js';
let source=fs.readFileSync(file,'utf8');
source=source.replace('export function buildRoadHazards(seed = 42) {','export function legacyCandidateBuildRoadHazards(seed = 42) {');
const code=`
/** Isolated compact-map authoring study: exact existing geometry safeguards. */
export function buildRoadHazards(seed=42){
 const random=randomFor(seed),result=[];
 const ids=['city','forest','desert','snow','volcanic'];
 const requestedMovers=Number(globalThis.CANDIDATE_MOVERS_PER_BIOME??2);
 for(const biome of ids){
  const ps=expansionCandidatesFor(biome),all=[];
  for(const p of ps)if(all.every(o=>o.edgeId!==p.edgeId||Math.abs(o.edgeDistance-p.edgeDistance)>=R.moverSpacingMetres))all.push(p);
  const selected=Array.from({length:Math.min(requestedMovers,all.length)},(_,i)=>all[Math.floor(i*all.length/Math.min(requestedMovers,all.length))]);
  for(const [i,p] of selected.entries()){
   const side=i%2?-1:1,type=biome==='city'||biome==='snow'?'barrier':'boulder';
   const width=3.8,length=type==='barrier'?2.3:3.5,height=type==='barrier'?1.35:1.8;
   const inner=5.7,outer=10.6,crossesCenter=i%2===0;
   const motion=Object.freeze({minOffset:crossesCenter?-inner:side>0?inner:-outer,maxOffset:crossesCenter?inner:side>0?outer:-inner,crossesCenter,period:crossesCenter?40:24,phase:random(),pauseSeconds:1.4,startPause:1.2});
   const offset=motionOffset(motion,0),x=p.x+p.right.x*offset,z=p.z+p.right.z*offset;
   result.push(Object.freeze({id:biome+'-'+type+'-compact-mover-'+(i+1),type,biome,expanded:true,station:p.progress,progress:p.progress,distance:p.distance,edgeId:p.edgeId,edgeDistance:p.edgeDistance,branch:p.branch,x,z,heading:p.heading,roadHeading:p.heading,headingDelta:0,width,length,height,offset,groundHeight:queryRoadSurface(x,z,p).height,solid:true,edgeBlend:0,series:biome+'-mover-'+i,pattern:'lateral-sweep',bypassSide:crossesCenter?side:0,bypassMin:crossesCenter?(side>0?10.1:-11.4):-R.minimumCenterClearance,bypassMax:crossesCenter?(side>0?11.4:-10.1):R.minimumCenterClearance,motion}));
  }
 }
 const staticByBiome={};
 for(const biome of ids){
  const staticResult=[];
  for(const edge of NETWORK_EDGES.filter(e=>e.biome===biome))for(let d=10;d<edge.length-10;d+=5){
   const p=pointOnEdge(edge.id,d),type={city:'repair',forest:'log',desert:'dune',snow:'ice',volcanic:'rock'}[biome];
   const size=type==='repair'?{width:4,length:3.5,height:1.3,lateral:8.7}:type==='log'?{width:7.3,length:1.25,height:1.25,lateral:9.95}:type==='dune'?{width:7.4,length:18,height:.15,lateral:10}:type==='ice'?{width:7.6,length:19,height:.035,lateral:10}:{width:4.7,length:4.8,height:2.2,lateral:9.8};
   const extent=Math.hypot(size.width,size.length)/2+1;
   if(ROAD_HAZARD_EXCLUSIONS.some(e=>Math.abs(p.distance-e.distance)<e.radius+extent))continue;
   const fork=FORKS.find(f=>f.id===edge.forkId);
   if(fork&&(p.progress-fork.splitOverlapEnd<R.forkTipExclusionMetres+extent||fork.mergeOverlapStart-p.progress<R.forkTipExclusionMetres+extent))continue;
   if(result.some(h=>h.edgeId===p.edgeId&&Math.abs(h.edgeDistance-d)<R.moverSpacingMetres))continue;
   if(staticResult.some(h=>h.edgeId===p.edgeId&&Math.abs(h.edgeDistance-d)<Math.max(12,(h.length+size.length)/2+6)))continue;
   const offset=(staticResult.length%2?1:-1)*size.lateral,x=p.x+p.right.x*offset,z=p.z+p.right.z*offset;
   const descriptor={id:biome+'-'+type+'-compact-static-'+(staticResult.length+1),type,biome,station:p.progress,progress:p.progress,distance:p.distance,edgeId:p.edgeId,edgeDistance:d,branch:p.branch,x,z,heading:p.heading,roadHeading:p.heading,headingDelta:0,width:size.width,length:size.length,height:size.height,offset,groundHeight:queryRoadSurface(x,z,p).height,solid:type==='repair'||type==='log'||type==='rock',edgeBlend:type==='dune'||type==='ice'?R.softEdgeMetres:0,series:biome+'-static-'+staticResult.length,pattern:'single',bypassSide:0,bypassMin:-4,bypassMax:4,motion:null};
   if(type==='rock'&&!rockApproachIsClear(descriptor))continue;
   staticResult.push(Object.freeze(descriptor));
  }
  staticByBiome[biome]=staticResult;
 }
 const available=Object.values(staticByBiome).flat();
 const target=Number(globalThis.CANDIDATE_TARGET_COUNT??100);
 const wanted=Math.min(available.length,target-result.length);
 // Round-robin biome choices spread the static descriptors rather than favoring city.
 for(let i=0,taken=0;taken<wanted;i++)for(const biome of ids){if(taken>=wanted)break;const h=staticByBiome[biome][i];if(h){result.push(h);taken++;}}
 return Object.freeze(result.sort((a,b)=>a.distance-b.distance||a.edgeId.localeCompare(b.edgeId)));
}
`;
source+=code;fs.writeFileSync(file,source);
