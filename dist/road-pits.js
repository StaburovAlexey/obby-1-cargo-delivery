import {BIOME_DEFINITIONS,NETWORK_EDGES,pointOnEdge,routeDistanceAt,surfaceHeight,ROAD_SURFACE_OFFSET} from './route-network.js';
import {HAZARD_FREE_DRIVING_SECTIONS} from './route-network-config.js';
import {CHECKPOINT_PROGRESS,PREVIEW_PROGRESS,FORKS} from './route-network.js';
import {BRIDGES} from './road-bridges.js';

const freezePolygon=points=>Object.freeze(points.map(p=>Object.freeze(p)));
const overlaps=(a,b)=>a.from<=b.to&&a.to>=b.from;
const protectedRanges=Object.freeze([
 ...BRIDGES.map(p=>({from:routeDistanceAt(p.from)-10,to:routeDistanceAt(p.to)+10})),
 ...CHECKPOINT_PROGRESS.map(q=>({from:routeDistanceAt(q)-15,to:routeDistanceAt(q)+15})),
 ...PREVIEW_PROGRESS.map(p=>({from:routeDistanceAt(p.progress)-15,to:routeDistanceAt(p.progress)+15})),
 ...BIOME_DEFINITIONS.slice(1).map(p=>({from:routeDistanceAt(p.from)-30,to:routeDistanceAt(p.from)+30})),
 ...FORKS.map(p=>({from:routeDistanceAt(p.from),to:routeDistanceAt(p.to)})),
 ...HAZARD_FREE_DRIVING_SECTIONS.map(p=>({from:routeDistanceAt(p.from)-p.recovery,to:routeDistanceAt(p.to)+p.recovery})),
 // The curved canyon entrance branches from the starting road and has its own
 // shared apron; keep the complete entry and acceleration area intact.
 {from:routeDistanceAt(-17),to:routeDistanceAt(400)},
]);
function crossSection(edgeId,distance,width,offset=0){const p=pointOnEdge(edgeId,distance);return[-1,1].map(side=>({x:p.x+p.right.x*(offset+side*width/2),z:p.z+p.right.z*(offset+side*width/2)}));}
function routeQuad(edgeId,from,to,width,offset=0){const a=crossSection(edgeId,from,width,offset),b=crossSection(edgeId,to,width,offset);return freezePolygon([a[0],a[1],b[1],b[0]]);}
function routeHull(edgeId,from,to){
 const points=[];for(let d=from-.05;d<to+.05;d+=2)points.push(...crossSection(edgeId,d,30.1));points.push(...crossSection(edgeId,to+.05,30.1));
 points.sort((a,b)=>a.x-b.x||a.z-b.z);
 const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x),half=ps=>{const hull=[];for(const p of ps){while(hull.length>1&&cross(hull.at(-2),hull.at(-1),p)<=0)hull.pop();hull.push(p);}return hull.slice(0,-1);};
 return freezePolygon([...half(points),...half(points.slice().reverse())]);
}
function naturalMouth(p,width,length,seed,id){
 let state=2166136261;for(const c of `${seed}:${id}`){state^=c.charCodeAt(0);state=Math.imul(state,16777619);}
 const random=()=>{state+=0x6D2B79F5;let t=state;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
 const count=14+2*Math.floor(random()*3),step=2*Math.PI/count,points=[];
 // Angular order makes one simple bank. Inward points remain part of the
 // actual mouth instead of being replaced by a convex or rectangular envelope.
 for(let i=0;i<count;i++){const angle=step*(i+(random()-.5)*.52),radius=i%2===0?.9+random()*.1:.6+random()*.23;points.push({x:Math.cos(angle)*radius,z:Math.sin(angle)*radius});}
 // Chip the long bank segments as well as the large-scale mouth outline.
 // Inward-only chips retain the width/length envelope and angular ordering.
 const chipped=[];
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length];chipped.push(a);
  for(const t of [.33,.67]){const inset=.88+random()*.09;chipped.push({x:(a.x+(b.x-a.x)*t)*inset,z:(a.z+(b.z-a.z)*t)*inset});}
 }
 points.splice(0,points.length,...chipped);
 const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z)),c=Math.cos(p.heading),s=Math.sin(p.heading);
 return freezePolygon(points.map(q=>{const across=((q.x-minX)/(maxX-minX)-.5)*width,forward=((q.z-minZ)/(maxZ-minZ)-.5)*length;return{x:p.x+c*across-s*forward,z:p.z-s*across-c*forward};}));
}
// Keep the takeoff seam intact while breaking both banks across the landscape.
function jumpMouth(p,width,rampOffset,seed,id){
 const points=[],half=width/2,steps=Math.ceil(width/3),c=Math.cos(p.heading),s=Math.sin(p.heading);
 const random=i=>(seedOffset(`${seed}:${id}:bank:${i}`)+10)/20;
 // Alternate shallow splinters and deep bites, with uneven spacing, instead
 // of a nearly straight bank carrying only small, uniform ripples.
 const bite=i=>i%2===0?.15+random(i)*.55:2+random(i)*2.2;
 const across=Array.from({length:steps+1},(_,i)=>i===0?-half:i===steps?half:-half+width*(i+(random(i+1000)-.5)*.65)/steps);
 // Explicit seam endpoints prevent a neighbouring tooth from crossing the
 // takeoff edge, even when the seeded bank spacing changes.
 across.push(rampOffset-4,rampOffset+4);across.sort((a,b)=>a-b);
 for(let i=0;i<across.length;i++){
  const x=across[i],lip=Math.abs(x-rampOffset)<=4;
  points.push({x,z:-3+(lip||i===0||i===across.length-1?0:bite(i))});
 }
 for(const [i,z] of [4,6,8].entries())points.push({x:half-(i%2?2.4:.35),z});
 for(let i=across.length-1;i>=0;i--){const x=across[i];points.push({x,z:15-(i===0||i===across.length-1?0:bite(i+steps+1))});}
 for(const [i,z] of [8,6,4].entries())points.push({x:-half+(i%2?2.4:.35),z});
 return freezePolygon(points.map(q=>({x:p.x+c*q.x-s*q.z,z:p.z-s*q.x-c*q.z})));
}
function inside(polygon,x,z,margin=0){
 let covered=false,nearest=Infinity;
 for(let i=0;i<polygon.length;i++){
  const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
  nearest=Math.min(nearest,Math.hypot(x-a.x-dx*t,z-a.z-dz*t));
  if((a.z>z)!==(b.z>z)&&x<a.x+dx*(z-a.z)/dz)covered=!covered;
 }
 if(nearest<=1e-8)covered=true;
 return(covered?nearest:-nearest)+margin>=-1e-8;
}
function rampFraction(footprint,x,z){
 const [a,b,c,d]=footprint,lx=d.x-a.x,lz=d.z-a.z,wx=b.x-a.x,wz=b.z-a.z,ex=c.x-d.x-wx,ez=c.z-d.z-wz;
 let t=.5;
 // Intersect the query with its interpolated cross-section. This preserves a
 // uniform rise at each lip even when the two road cross-sections rotate.
 for(let i=0;i<6;i++){const vx=wx+ex*t,vz=wz+ez*t,px=x-a.x-lx*t,pz=z-a.z-lz*t,f=vx*pz-vz*px,derivative=ex*pz-ez*px-vx*lz+vz*lx;if(Math.abs(derivative)<1e-12)break;t-=f/derivative;}
 return Math.max(0,Math.min(1,t));
}
function seedOffset(seed){let value=2166136261;for(const c of String(seed)){value^=c.charCodeAt(0);value=Math.imul(value,16777619);}return((value>>>0)/4294967296-.5)*20;}
const candidateCache=new Map();
// These fixed-geometry takeoffs are calibrated with all stock and upgraded
// vehicles. Seed variation belongs to avoidable pits, not critical trajectories.
const calibratedJumpDistance=Object.freeze({city:1437,forest:1187,desert:1432,snow:752,volcanic:372});
let buildSamples;
function sampledPoint(edgeId,distance){let edge=buildSamples.get(edgeId);if(!edge){edge=new Map();buildSamples.set(edgeId,edge);}if(!edge.has(distance))edge.set(distance,pointOnEdge(edgeId,distance));return edge.get(distance);}
function candidatesFor(biome,type){
 const key=`${biome}:${type}`;if(candidateCache.has(key))return candidateCache.get(key);
 const jump=type==='jump',before=jump?67:40,after=jump?103:30,candidates=[];
 for(const edge of NETWORK_EDGES.filter(e=>e.biome===biome&&!e.forkId))for(let d=before;d<edge.length-after;d+=5){
  const p=sampledPoint(edge.id,d),reservation={from:p.distance-before,to:p.distance+after};
  if(protectedRanges.some(range=>overlaps(reservation,range)))continue;
  let clear=true;for(let offset=-before;offset<=after;offset+=1){const q=sampledPoint(edge.id,d+offset),local=jump&&offset>=-27&&offset<=33,grade=jump?(local?.02:.05):.105,curvature=jump?(local?.0015:.003):.0045;if(Math.hypot(q.gradient.x,q.gradient.z)>grade||Math.abs(q.curvature)>curvature){clear=false;break;}}if(!clear)continue;
  candidates.push(Object.freeze({...p,reservation:Object.freeze(reservation)}));
 }
 const result=Object.freeze(candidates);candidateCache.set(key,result);return result;
}
function descriptor(p,type,index,offset,seed){
 const jump=type==='jump',width=jump?30:21,length=18,cutWidth=jump?224:21,id=`${p.biome}-${type}-${index}`;
 const position={x:p.x+p.right.x*offset,z:p.z+p.right.z*offset,heading:p.heading};
 const rampSide=seedOffset(`${seed}:${id}:takeoff`)<0?-1:1,rampOffset=rampSide*7.5;
 const ramp=jump?Object.freeze({length:24,height:2.4,width:5.3,offset:rampOffset,side:rampSide,boostSpeed:38,boostAcceleration:65,fromEdgeDistance:p.edgeDistance-27,toEdgeDistance:p.edgeDistance-3,footprint:routeQuad(p.edgeId,p.edgeDistance-27,p.edgeDistance-3,5.3,rampOffset)}):null;
 return Object.freeze({id,type,biome:p.biome,edgeId:p.edgeId,edgeDistance:p.edgeDistance,progress:p.progress,distance:p.distance,...position,height:p.height,offset,width,length,cutWidth,depth:20,cutFootprint:jump?jumpMouth(position,cutWidth,rampOffset,seed,id):naturalMouth(position,cutWidth,length,seed,id),ramp,reservation:p.reservation,reservationFootprint:routeHull(p.edgeId,p.edgeDistance-(jump?67:40),p.edgeDistance+(jump?103:30))});
}

/** Immutable world geometry uses local 3D edge distances throughout. */
export function buildRoadPits(seed=42){
 buildSamples=new Map();
 const result=[],jitter=seedOffset(seed);
 for(const biome of BIOME_DEFINITIONS){
  const start=routeDistanceAt(biome.from),span=routeDistanceAt(biome.to)-start;
  const select=(type,fraction)=>{
   const target=start+span*fraction+jitter;
   const available=candidatesFor(biome.id,type).filter(p=>result.every(other=>!overlaps(p.reservation,other.reservation)));
   if(type==='jump'){
    const calibrated=available.find(p=>p.edgeDistance===calibratedJumpDistance[biome.id]);
    if(!calibrated)throw new Error(`Calibrated road jump is no longer legal: ${biome.id}`);
    return calibrated;
   }
   available.sort((a,b)=>Math.abs(a.distance-target)-Math.abs(b.distance-target)||a.distance-b.distance);
   if(!available.length)throw new Error(`Insufficient protected road pit positions: ${biome.id}/${type}`);
   return available[0];
  };
  result.push(descriptor(select('jump',.5),'jump',1,0,seed));
  result.push(descriptor(select('pit',.25),'pit',1,-4.5,seed));
  result.push(descriptor(select('pit',.75),'pit',2,4.5,seed));
 }
 buildSamples=null;
 return Object.freeze(result.sort((a,b)=>a.distance-b.distance));
}

/** Return only an open mouth; the takeoff is supported ground. */
export function roadPitAt(pits,x,z,margin=0){if(![x,z,margin].every(Number.isFinite))return null;return pits.find(p=>inside(p.cutFootprint,x,z,margin))||null;}
export function roadPitRampHeight(pits,x,z){
 if(![x,z].every(Number.isFinite))return undefined;
 for(const pit of pits){const ramp=pit.ramp;if(!ramp||!inside(ramp.footprint,x,z))continue;return surfaceHeight(x,-z)+ROAD_SURFACE_OFFSET+ramp.height*rampFraction(ramp.footprint,x,z);}
 return undefined;
}
export function roadPitReservations(pits){return Object.freeze(pits.map(p=>p.reservation));}

/** Booster is queried at real supported tire contacts, never in the air. */
export function roadPitRampBoost(pits,x,z){
 const pit=pits.find(p=>p.ramp&&inside(p.ramp.footprint,x,z));
 if(!pit)return null;
 return {heading:pit.heading,slope:pit.ramp.height/pit.ramp.length,speed:pit.ramp.boostSpeed,acceleration:pit.ramp.boostAcceleration};
}
