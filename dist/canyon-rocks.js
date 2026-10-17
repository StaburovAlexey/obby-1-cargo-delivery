import {CANYON_APPROACH_LENGTH,canyonApproachPoint} from './canyon-approach.js';
import {canyonPointAt} from './canyon-track.js';
import {pointInRoad} from './road-layout.js';
import {ROAD_MESH} from './route-network.js';
import {polygonIndex,meshFootprints,subtractFootprints} from './surface-cut.js';
const area=p=>Math.abs(p.slice(1,-1).reduce((sum,a,i)=>{const b=p[i+2],o=p[0];return sum+(a.x-o.x)*(b.z-o.z)-(a.z-o.z)*(b.x-o.x);},0)/2);
const road=polygonIndex(meshFootprints(ROAD_MESH));
// Find the first exposed asphalt cross-section, not the distant drift start.
export const CANYON_ROCK_START=Array.from({length:CANYON_APPROACH_LENGTH+1},(_,s)=>s).find(s=>{const p=canyonApproachPoint(s);return !pointInRoad(p.x+p.right.x*9,p.z+p.right.z*9);});
export const CANYON_APPROACH_ROCKS=[];
const samples=[];
for(let s=CANYON_ROCK_START;s<CANYON_APPROACH_LENGTH;s+=19)samples.push({p:canyonApproachPoint(s),distance:s});
for(let s=0;s<57;s+=19)samples.push({p:canyonPointAt(s),distance:CANYON_APPROACH_LENGTH+s});
for(const {p,distance} of samples)for(const side of [-1,1]){
 const index=(distance-CANYON_APPROACH_LENGTH-57)/19,t=Math.min(1,(distance-CANYON_ROCK_START)/90),radius=10+7*t;
 const offset=27+7*t+Math.sin(index*3.1+side)*2*t;
 const x=p.x+p.right.x*offset*side,z=p.z+p.right.z*offset*side,heading=p.heading;
 const footprint=Array.from({length:7},(_,i)=>{const a=i*Math.PI*2/7;return {x:x+Math.sin(a+heading)*radius,z:z+Math.cos(a+heading)*radius};});
 // A conservative square includes the entire rock and a 1 m main-road gap.
 const r=radius+1,clearance=[{x:x-r,z:z-r},{x:x+r,z:z-r},{x:x+r,z:z+r},{x:x-r,z:z+r}];
 if(Math.abs(subtractFootprints(clearance,road).reduce((n,q)=>n+area(q),0)-area(clearance))>1e-6)continue;
 CANYON_APPROACH_ROCKS.push({x,z,heading,radius,footprint,side,distance,bottom:p.height-45,top:p.height+12+8*t+Math.sin(index*.7)*8*t});
}
