import {canyonApproachPoint,CANYON_APPROACH_LENGTH} from './canyon-approach.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const ease=t=>t*t*(3-2*t);
const turns=[[0,90,0,0],[90,245,0,1.2],[245,440,1.2,-1.2],[440,635,-1.2,1.3],[635,830,1.3,-1.3],[830,1035,-1.3,1.35],[1035,1240,1.35,-1.25],[1240,1440,-1.25,1.2],[1440,1650,1.2,-.9],[1650,1800,-.9,0],[1800,1850,0,0],
 [1850,2070,0,1.15],[2070,2300,1.15,-1.2],[2300,2530,-1.2,1.25],[2530,2760,1.25,-1.25],[2760,2990,-1.25,1.2],[2990,3220,1.2,-1.15],[3220,3460,-1.15,1.05],[3460,3640,1.05,0],[3640,3700,0,0]];
// The downhill branch begins at the exact final approach cross-section. Rotating
// the S-bends east keeps the entire canyon away from the northbound main route.
const join=canyonApproachPoint(CANYON_APPROACH_LENGTH);
export const CANYON_TRACK=Object.freeze({id:'canyon-v1',length:3700,halfWidth:9,origin:Object.freeze({x:join.x,z:join.z}),heading:join.heading,startHeight:join.height,drop:180,spawn:12,finish:3688,checkpoints:Object.freeze([240,480,720,960,1200,1440,1680,1920,2160,2400,2640,2880,3120,3360,3600])});
export const CANYON_ROCKFALL=Object.freeze({start:1790,end:1870,side:1,slopeWidth:32,slopeRise:9});
// Equal spacing carries alternating open/fenced shelves through the whole run.
// Change sides every two shelves so both variants occur on both road edges.
export const CANYON_CLIFF_SECTIONS=Object.freeze([...Array.from({length:10},(_,index)=>Object.freeze({
 start:180+index*340,end:420+index*340,side:[-1,1,1,-1][index%4],guarded:index%2===1,
})),...[-1,1].map(side=>Object.freeze({start:CANYON_ROCKFALL.start,end:CANYON_ROCKFALL.end,side,guarded:false,rockfall:true}))]);
export function canyonCliffAt(distance,side,margin=0){return CANYON_CLIFF_SECTIONS.find(section=>section.side===side&&distance>=section.start-margin&&distance<=section.end+margin);}
export function canyonGuardrailAt(distance,side){return canyonCliffAt(distance,side)?.guarded!==false;}
export function canyonShoulderWidth(distance,side){
 const cliff=canyonCliffAt(distance,side);if(!cliff)return 15;
 const blend=ease(clamp(Math.min(distance-cliff.start,cliff.end-distance)/36,0,1));
 // Fenced shelves retain enough ground outside the rail for its rear posts.
 const edge=CANYON_TRACK.halfWidth+(cliff.guarded?1.05:.7)+.16*Math.sin(distance*.29)+.12*Math.sin(distance*.67);
 return 15+(edge-15)*blend;
}
export function canyonRockfallHeight(distance,offset){
 const section=CANYON_ROCKFALL,p=canyonPointAt(distance);
 const across=clamp((offset*section.side-canyonShoulderWidth(distance,section.side))/section.slopeWidth,0,1);
 const ends=ease(clamp(Math.min(distance-section.start,section.end-distance)/12,0,1));
 return p.height-.04+section.slopeRise*across*ends;
}
function headingAt(s){const t=turns.find(t=>s<=t[1])||turns.at(-1);return CANYON_TRACK.heading+(-Math.PI/2-CANYON_TRACK.heading)*ease(clamp(s/90,0,1))+t[2]+(t[3]-t[2])*ease(clamp((s-t[0])/(t[1]-t[0]),0,1));}
// Preserve the original downhill road, then continue with a second smooth descent.
const firstDescentLength=1850,firstDescentDrop=115;
const heightAt=s=>CANYON_TRACK.startHeight-firstDescentDrop*ease(clamp(s/firstDescentLength,0,1))-(CANYON_TRACK.drop-firstDescentDrop)*ease(clamp((s-firstDescentLength)/(CANYON_TRACK.length-firstDescentLength),0,1));
const gradeAt=s=>{const first=s<=firstDescentLength,length=first?firstDescentLength:CANYON_TRACK.length-firstDescentLength,drop=first?firstDescentDrop:CANYON_TRACK.drop-firstDescentDrop,t=clamp((first?s:s-firstDescentLength)/length,0,1);return -drop*6*t*(1-t)/length;};
const samples=[{progress:0,x:CANYON_TRACK.origin.x,z:CANYON_TRACK.origin.z}];
for(let s=2;s<=CANYON_TRACK.length;s+=2){const a=samples.at(-1),h=headingAt(s-1);samples.push({progress:s,x:a.x-Math.sin(h)*2,z:a.z-Math.cos(h)*2});}

export function canyonPointAt(distance){
 const s=clamp(Number(distance)||0,0,CANYON_TRACK.length),i=Math.min(samples.length-2,Math.floor(s/2)),a=samples[i],b=samples[i+1],t=(s-a.progress)/2,heading=headingAt(s),fx=-Math.sin(heading),fz=-Math.cos(heading),grade=gradeAt(s);
 const gradient={x:fx*grade,z:fz*grade},n=Math.hypot(gradient.x,1,gradient.z);
 return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,height:heightAt(s),heading,progress:s,distance:s,right:{x:Math.cos(heading),z:-Math.sin(heading)},gradient,normal:{x:-gradient.x/n,y:1/n,z:-gradient.z/n},biome:'canyon'};
}

const cells=new Map(),key=(x,z)=>`${Math.floor(x/32)},${Math.floor(z/32)}`;
for(let i=0;i<samples.length-1;i++){
 const a=samples[i],b=samples[i+1];for(let x=Math.floor((Math.min(a.x,b.x)-20)/32);x<=Math.floor((Math.max(a.x,b.x)+20)/32);x++)for(let z=Math.floor((Math.min(a.z,b.z)-20)/32);z<=Math.floor((Math.max(a.z,b.z)+20)/32);z++){const k=`${x},${z}`;if(!cells.has(k))cells.set(k,[]);cells.get(k).push(i);}
}
const all=samples.slice(0,-1).map((_,i)=>i);
const bounds={minX:Math.min(...samples.map(p=>p.x)),maxX:Math.max(...samples.map(p=>p.x)),minZ:Math.min(...samples.map(p=>p.z)),maxZ:Math.max(...samples.map(p=>p.z))};
export function projectCanyon(x,z,history){
 if(!Number.isFinite(x)||!Number.isFinite(z))return null;
 let candidates=cells.get(key(x,z))||all;
 if(Number.isFinite(history?.progress)){const local=candidates.filter(i=>Math.abs(samples[i].progress-history.progress)<100);if(local.length)candidates=local;}
 let best=null,min=Infinity;
 for(const i of candidates){const a=samples[i],b=samples[i+1],dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1),d=(x-a.x-t*dx)**2+(z-a.z-t*dz)**2;if(d<min){min=d;best=a.progress+t*2;}}
 for(let i=0;i<6;i++){const p=canyonPointAt(best),along=(x-p.x)*-Math.sin(p.heading)+(z-p.z)*-Math.cos(p.heading);if(Math.abs(along)<1e-8)break;best=clamp(best+clamp(along,-4,4),0,CANYON_TRACK.length);}
 const p=canyonPointAt(best);return {...p,offset:(x-p.x)*p.right.x+(z-p.z)*p.right.z,distanceSquared:(x-p.x)**2+(z-p.z)**2};
}
// Unlike nearest-point projection, a surface lookup must never claim remote
// parts of the main world, or the road beyond the open connection at s=0.
export function canyonSurface(x,z,padding=0){
 const width=CANYON_TRACK.halfWidth+padding;
 if(!Number.isFinite(x)||!Number.isFinite(z)||x<bounds.minX-width||x>bounds.maxX+width||z<bounds.minZ-width||z>bounds.maxZ+width)return null;
 const p=projectCanyon(x,z);if(!p)return null;
 const along=(x-p.x)*-Math.sin(p.heading)+(z-p.z)*-Math.cos(p.heading);
 if(Math.abs(p.offset)>width+1e-7)return null;
 if(p.progress<1e-6&&along < -padding-1e-7)return null;
 if(p.progress>CANYON_TRACK.length-1e-6&&along>padding+1e-7)return null;
 return p;
}
export const canyonContains=(x,z,padding=0)=>!!canyonSurface(x,z,padding);
export const canyonHeight=(x,z)=>projectCanyon(x,z)?.height??CANYON_TRACK.startHeight;
export const canyonGradient=(x,z)=>projectCanyon(x,z)?.gradient??{x:0,z:0};
export function canyonContact(x,z,heading,footprint={halfWidth:1.7,halfLength:4.05}){
 const radius=Math.hypot(footprint.halfWidth,footprint.halfLength);
 if(!canyonSurface(x,z,radius+2))return undefined;
 const c=Math.cos(heading),s=Math.sin(heading);let hit;
 for(const dx of [-footprint.halfWidth,footprint.halfWidth])for(const dz of [-footprint.halfLength,footprint.halfLength]){
  const px=x+c*dx+s*dz,pz=z-s*dx+c*dz,p=projectCanyon(px,pz);if(!p)continue;
  const along=(px-p.x)*-Math.sin(p.heading)+(pz-p.z)*-Math.cos(p.heading);
  // The start cross-section is open to the approach in both directions.
  if(p.progress<1e-6&&along<0)continue;
  const lateral=Math.abs(p.offset)-CANYON_TRACK.halfWidth+.12;
  if(lateral>0&&canyonGuardrailAt(p.progress,Math.sign(p.offset))&&(!hit||lateral>hit.depth))hit={normalX:-Math.sign(p.offset)*p.right.x,normalZ:-Math.sign(p.offset)*p.right.z,depth:lateral,name:'Canyon guardrail'};
  const endDepth=p.progress>CANYON_TRACK.length-.01?along:0;
  if(endDepth>0&&(!hit||endDepth>hit.depth)){const sign=p.progress<.01?1:-1;hit={normalX:-Math.sin(p.heading)*sign,normalZ:-Math.cos(p.heading)*sign,depth:endDepth,name:'Canyon end'};}
 }
 return hit;
}

export function canyonPose(THREE,state,metadata){
 const x=state.x,z=state.z,h=state.heading,c=Math.cos(h),s=Math.sin(h);
 const wheels=metadata?.wheelContacts||[{center:[-1.3,.615,-2.583],radius:.565,front:true},{center:[1.3,.615,-2.583],radius:.565,front:true},{center:[-1.3,.615,2.221],radius:.565,front:false},{center:[1.3,.615,2.221],radius:.565,front:false}];
 const contacts=wheels.map(w=>{const p=w.center;return{...w,surface:canyonHeight(x+c*p[0]+s*p[2],z-s*p[0]+c*p[2])};});
 const mean=list=>list.reduce((n,w)=>n+w.surface,0)/list.length;
 const front=contacts.filter(w=>w.front),rear=contacts.filter(w=>!w.front),left=contacts.filter(w=>w.center[0]<0),rightW=contacts.filter(w=>w.center[0]>=0);
 const wheelbase=Math.abs(front[0].center[2]-rear[0].center[2]),width=Math.abs(left[0].center[0]-rightW[0].center[0]);
 const forward=new THREE.Vector3(-s,(mean(front)-mean(rear))/wheelbase,-c).normalize(),right=new THREE.Vector3(c,(mean(rightW)-mean(left))/width,-s).normalize(),normal=new THREE.Vector3().crossVectors(right,forward).normalize();right.crossVectors(forward,normal).normalize();
 const quaternion=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,normal,forward.clone().negate()));let y=-Infinity;
 for(const w of contacts){const local=new THREE.Vector3(...w.center).applyQuaternion(quaternion);y=Math.max(y,canyonHeight(x+local.x,z+local.z)-local.y+w.radius/normal.y+.012);}
 return {position:new THREE.Vector3(x,y,z),quaternion,normal};
}
