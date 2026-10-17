// One sampled centerline drives the visible fork, collision and scenery clearance.
export const CANYON_APPROACH_HALF_WIDTH=9;
export const CANYON_APPROACH_HEIGHT=.025;
const radius=32,arcLength=Math.PI*radius/2,straight=12;
export const CANYON_APPROACH_LENGTH=straight+arcLength+78;
export function canyonApproachPoint(s){
 s=Math.max(0,Math.min(CANYON_APPROACH_LENGTH,s));
 if(s<straight)return {height:CANYON_APPROACH_HEIGHT,gradient:{x:0,z:0},normal:{x:0,y:1,z:0},x:0,z:-21-s,heading:0,right:{x:1,z:0}};
 if(s<straight+arcLength){const a=(s-straight)/radius;return {height:CANYON_APPROACH_HEIGHT,gradient:{x:0,z:0},normal:{x:0,y:1,z:0},x:radius*(1-Math.cos(a)),z:-33-radius*Math.sin(a),heading:-a,right:{x:Math.cos(a),z:Math.sin(a)}};}
 return {height:CANYON_APPROACH_HEIGHT,gradient:{x:0,z:0},normal:{x:0,y:1,z:0},x:32+s-straight-arcLength,z:-65,heading:-Math.PI/2,right:{x:0,z:1}};
}
export const CANYON_APPROACH_SAMPLES=Object.freeze(Array.from({length:Math.ceil(CANYON_APPROACH_LENGTH)+1},(_,i)=>Object.freeze(canyonApproachPoint(Math.min(i,CANYON_APPROACH_LENGTH)))));
export function projectCanyonApproach(x,z){
 let best;
 for(let i=1;i<CANYON_APPROACH_SAMPLES.length;i++){
  const a=CANYON_APPROACH_SAMPLES[i-1],b=CANYON_APPROACH_SAMPLES[i],dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/l2)),px=a.x+t*dx,pz=a.z+t*dz,distance=Math.hypot(x-px,z-pz);
  if(!best||distance<best.distance)best={x:px,z:pz,distance,right:{x:-dz/Math.sqrt(l2),z:dx/Math.sqrt(l2)}};
 }
 return best;
}
export function canyonApproachContains(x,z){return x<=110&&z<=-21&&projectCanyonApproach(x,z).distance<=CANYON_APPROACH_HALF_WIDTH;}
export function canyonApproachQuads(padding=0){
 const width=CANYON_APPROACH_HALF_WIDTH+padding,edge=(p,side)=>({x:p.x+p.right.x*width*side,z:p.z+p.right.z*width*side});
 return CANYON_APPROACH_SAMPLES.slice(1).map((b,i)=>{const a=CANYON_APPROACH_SAMPLES[i];return [edge(a,-1),edge(b,-1),edge(b,1),edge(a,1)];});
}
