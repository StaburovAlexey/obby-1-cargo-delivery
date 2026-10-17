import {NETWORK_CONFIG} from './route-network-config.js';
// One arc-length sampled centerline drives the visible Y fork, collision and clearance.
export const CANYON_APPROACH_HALF_WIDTH=9;
export const CANYON_APPROACH_HEIGHT=NETWORK_CONFIG.roadSurfaceOffset;
export const CANYON_APPROACH_LENGTH=300;
export const CANYON_GATE_DISTANCE=136;
const turnLength=110,angle=Math.PI/4;
const ease=t=>t*t*t*(10+t*(-15+6*t));
const headingAt=s=>s===0?0:-angle*ease(Math.min(1,s/turnLength));
const centers=[{x:0,z:-21}];
for(let i=1;i<=CANYON_APPROACH_LENGTH;i++){const a=centers.at(-1),h=headingAt(i-.5);centers.push({x:a.x-Math.sin(h),z:a.z-Math.cos(h)});}
export function canyonApproachPoint(s){
 s=Math.max(0,Math.min(CANYON_APPROACH_LENGTH,s));
 const i=Math.min(centers.length-2,Math.floor(s)),t=s-i,a=centers[i],b=centers[i+1],heading=headingAt(s);
 return {height:CANYON_APPROACH_HEIGHT,gradient:{x:0,z:0},normal:{x:0,y:1,z:0},x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,heading,right:{x:Math.cos(heading),z:-Math.sin(heading)},progress:s};
}
export const CANYON_APPROACH_SAMPLES=Object.freeze(centers.map((_,i)=>Object.freeze(canyonApproachPoint(i))));
export function projectCanyonApproach(x,z){
 let best;
 for(let i=1;i<CANYON_APPROACH_SAMPLES.length;i++){
  const a=CANYON_APPROACH_SAMPLES[i-1],b=CANYON_APPROACH_SAMPLES[i],dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/l2)),px=a.x+t*dx,pz=a.z+t*dz,distance=Math.hypot(x-px,z-pz);
  if(!best||distance<best.distance)best={x:px,z:pz,distance,progress:i-1+t,right:{x:-dz/Math.sqrt(l2),z:dx/Math.sqrt(l2)}};
 }
 return best;
}
export function canyonApproachContains(x,z){
 const p=projectCanyonApproach(x,z),end=canyonApproachPoint(CANYON_APPROACH_LENGTH);
 return z<=-21&&(x-end.x)*-Math.sin(end.heading)+(z-end.z)*-Math.cos(end.heading)<=1e-7&&p.distance<=CANYON_APPROACH_HALF_WIDTH;
}
export function canyonApproachQuads(padding=0){
 const width=CANYON_APPROACH_HALF_WIDTH+padding,edge=(p,side)=>({x:p.x+p.right.x*width*side,z:p.z+p.right.z*width*side});
 return CANYON_APPROACH_SAMPLES.slice(1).map((b,i)=>{const a=CANYON_APPROACH_SAMPLES[i];return [edge(a,-1),edge(b,-1),edge(b,1),edge(a,1)];});
}
