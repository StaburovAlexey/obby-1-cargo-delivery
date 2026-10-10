/** Advertising policy and lifecycle, independent of rendering and physics. */
import {routePointAtProgress} from './route-network.js';

const EPSILON=1e-8;
const bridgeCache=new WeakMap(),hazardCache=new WeakMap();
const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
function hull(points){
  const sorted=points.slice().sort((a,b)=>a.x-b.x||a.z-b.z);
  const half=vertices=>{const out=[];for(const p of vertices){while(out.length>1&&cross(out.at(-2),out.at(-1),p)<=EPSILON)out.pop();out.push(p);}return out;};
  return [...half(sorted).slice(0,-1),...half(sorted.slice().reverse()).slice(0,-1)];
}
function rectangle(x,z,heading,halfWidth,halfLength){
  const c=Math.cos(heading),s=Math.sin(heading);
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>({x:x+c*a*halfWidth+s*b*halfLength,z:z-s*a*halfWidth+c*b*halfLength}));
}
function bounds(points){return {minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z))};}
function geometry(points){return {points,...bounds(points)};}
function pointSegmentDistance(p,a,b){
  const x=b.x-a.x,z=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*x+(p.z-a.z)*z)/(x*x+z*z||1)));
  return Math.hypot(p.x-a.x-x*t,p.z-a.z-z*t);
}
function inside(p,poly){
  let positive=false,negative=false;
  for(let i=0;i<poly.length;i++){const c=cross(poly[i],poly[(i+1)%poly.length],p);positive ||= c>EPSILON;negative ||= c<-EPSILON;if(positive&&negative)return false;}
  return true;
}
function pointPolygonDistance(p,poly){
  if(inside(p,poly))return 0;
  let distance=Infinity;
  for(let i=0;i<poly.length;i++)distance=Math.min(distance,pointSegmentDistance(p,poly[i],poly[(i+1)%poly.length]));
  return distance;
}
function segmentsIntersect(a,b,c,d){
  const ca=cross(a,b,c),da=cross(a,b,d),ac=cross(c,d,a),bc=cross(c,d,b);
  return ca*da<=EPSILON&&ac*bc<=EPSILON&&
    Math.max(a.x,b.x)+EPSILON>=Math.min(c.x,d.x)&&Math.max(c.x,d.x)+EPSILON>=Math.min(a.x,b.x)&&
    Math.max(a.z,b.z)+EPSILON>=Math.min(c.z,d.z)&&Math.max(c.z,d.z)+EPSILON>=Math.min(a.z,b.z);
}
function polygonDistance(a,b){
  if(inside(a[0],b)||inside(b[0],a))return 0;
  let distance=Infinity;
  for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++){
    const p=a[i],q=a[(i+1)%a.length],r=b[j],s=b[(j+1)%b.length];
    if(segmentsIntersect(p,q,r,s))return 0;
    distance=Math.min(distance,pointSegmentDistance(p,r,s),pointSegmentDistance(q,r,s),pointSegmentDistance(r,p,q),pointSegmentDistance(s,p,q));
  }
  return distance;
}
function closeTo(body,obstacle,margin){
  const dx=Math.max(0,body.minX-obstacle.maxX,obstacle.minX-body.maxX),dz=Math.max(0,body.minZ-obstacle.maxZ,obstacle.minZ-body.maxZ);
  if(Math.hypot(dx,dz)>margin+EPSILON)return false;
  const distance=body.radius===undefined?polygonDistance(body.points,obstacle.points):Math.max(0,pointPolygonDistance(body.center,obstacle.points)-body.radius);
  return distance<=margin+EPSILON;
}
function bridgeGeometry(bridge){
  if(!bridge||![bridge.from,bridge.to,bridge.halfWidth,bridge.offset??0].every(Number.isFinite)||bridge.to<=bridge.from||bridge.halfWidth<=0)return null;
  if(bridgeCache.has(bridge))return bridgeCache.get(bridge);
  const points=[],steps=Math.max(1,Math.ceil((bridge.to-bridge.from)/.25));
  for(let i=0;i<=steps;i++){
    const p=routePointAtProgress(bridge.from+(bridge.to-bridge.from)*i/steps,bridge.branch?{branch:bridge.branch}:{});
    for(const side of [-1,1]){const offset=(bridge.offset??0)+side*bridge.halfWidth;points.push({x:p.x+p.right.x*offset,z:p.z+p.right.z*offset});}
  }
  // The hull conservatively contains the whole curved deck, including the
  // inside of a bend. A 2 cm allowance covers sub-sample curvature on this map.
  const result=geometry(hull(points));
  if(Object.isFrozen(bridge))bridgeCache.set(bridge,result);
  return result;
}
function hazardGeometry(hazard){
  if(!hazard||![hazard.x,hazard.z,hazard.heading,hazard.width,hazard.length].every(Number.isFinite)||hazard.width<=0||hazard.length<=0)return null;
  if(hazardCache.has(hazard))return hazardCache.get(hazard);
  let points;
  if(hazard.motion){
    const {minOffset,maxOffset}=hazard.motion,roadHeading=hazard.roadHeading??hazard.heading,offset=hazard.offset;
    if(![minOffset,maxOffset,roadHeading,offset].every(Number.isFinite)||maxOffset<minOffset)return null;
    const right={x:Math.cos(roadHeading),z:-Math.sin(roadHeading)},x=hazard.x-right.x*offset,z=hazard.z-right.z*offset;
    points=hull([minOffset,maxOffset].flatMap(o=>rectangle(x+right.x*o,z+right.z*o,hazard.heading,hazard.width/2,hazard.length/2)));
  }else points=rectangle(hazard.x,hazard.z,hazard.heading,hazard.width/2,hazard.length/2);
  const result=geometry(points);
  if(Object.isFrozen(hazard))hazardCache.set(hazard,result);
  return result;
}
/**
 * Horizontal clearance from the complete avatar/vehicle shape to every bridge
 * deck and complete obstacle sweep, in metres. speed is signed metres/second;
 * heading uses the game's +X right, -Z forward convention. No world is advanced.
 * footprint is {halfWidth,halfLength} or {radius}; top-level radius is accepted.
 * The caller supplies the current map's immutable bridge/hazard descriptors.
 */
export function isAdvertisingSafe({position,heading=0,speed=0,footprint,radius,bridges=[],hazards=[],jumping=false,falling=false,teleporting=false,loading=false,modal=false}={}){
  if(jumping||falling||teleporting||loading||modal)return false;
  const x=Array.isArray(position)?position[0]:position?.x,z=Array.isArray(position)?position[2]:position?.z;
  if(![x,z,heading,speed].every(Number.isFinite)||!Array.isArray(bridges)||!Array.isArray(hazards))return false;
  let body;
  if(footprint?.halfWidth!==undefined||footprint?.halfLength!==undefined){
    const {halfWidth,halfLength}=footprint;
    if(![halfWidth,halfLength].every(Number.isFinite)||halfWidth<=0||halfLength<=0)return false;
    body=geometry(rectangle(x,z,heading,halfWidth,halfLength));
  }else{
    const r=footprint?.radius??radius??.5;
    if(!Number.isFinite(r)||r<0)return false;
    body={center:{x,z},radius:r,minX:x-r,maxX:x+r,minZ:z-r,maxZ:z+r};
  }
  const margin=Math.max(50,Math.abs(speed)*5);
  for(const bridge of bridges){const obstacle=bridgeGeometry(bridge);if(!obstacle||closeTo(body,obstacle,margin+.02))return false;}
  for(const hazard of hazards){const obstacle=hazardGeometry(hazard);if(!obstacle||closeTo(body,obstacle,margin))return false;}
  return true;
}

/**
 * Single-attempt fullscreen advertising controller.
 *
 * update(realElapsedSeconds, {active, safe, visible=true}) must run on every
 * animation frame, including frames paused by this controller. active means
 * gameplay is actually advancing, excluding menus, loading, SDK pause and ads.
 * The warning advances from real elapsed dt even when our own pause makes
 * active=false. Other pause reasons call setSuspended(true); do not suspend
 * for the advertising reason itself. Hidden/unsafe warnings return to pending
 * and require a fresh complete 3,2,1 warning when active and safe again.
 *
 * showAd({onOpen,onClose,onError,onOffline}) may use SDK callbacks (return undefined),
 * return false for refusal, or return a Promise settled only when the attempt
 * completes. Callback and Promise completion are deduplicated per attempt.
 * pause/resume own only the caller's advertising pause reason. No rewards,
 * persistence, world progression or other lifecycle reasons are changed.
 * onCountdown receives 3, 2, 1, then null; onStatus receives phase and details.
 */
export function createAdvertising({showAd=()=>false,pause=()=>{},resume=()=>{},onCountdown=()=>{},onStatus=()=>{},intervalSeconds=240}={}){
  if(!Number.isFinite(intervalSeconds)||intervalSeconds<=0)throw new RangeError('Advertising interval must be positive seconds');
  let phase='idle',activeSeconds=0,countdownElapsed=0,countdown=null,suspended=false,ownsPause=false,attempt=0;
  const getState=()=>({phase,activeSeconds,countdown,pending:phase==='pending',suspended,attempts:attempt});
  function status(next,details={}){phase=next;onStatus(next,{...getState(),...details});}
  function warning(value){if(countdown!==value){countdown=value;onCountdown(value);}}
  function releasePause(){if(ownsPause){ownsPause=false;resume();}}
  function defer(reason){
    if(phase!=='countdown')return;
    countdownElapsed=0;warning(null);status('pending',{reason});releasePause();
  }
  function complete(id,reason,result){
    if(phase!=='showing'||id!==attempt)return;
    activeSeconds=0;countdownElapsed=0;warning(null);status('idle',{reason,result});releasePause();
  }
  function dispatch(){
    warning(null);const id=++attempt;status('showing');
    const callbacks={
      onOpen(){},
      onClose(result){complete(id,'close',result);},
      onError(error){complete(id,'error',error);},
      onOffline(result){complete(id,'offline',result);},
    };
    try{
      const result=showAd(callbacks);
      if(result&&typeof result.then==='function')Promise.resolve(result).then(value=>complete(id,'resolved',value),error=>complete(id,'error',error));
      else if(result!==undefined)complete(id,result===false?'refused':'resolved',result);
    }catch(error){complete(id,'error',error);}
  }
  function update(dt,{active=false,safe=false,visible=true}={}){
    if(phase==='destroyed'||phase==='showing')return;
    if(suspended||!visible){defer('suspended');return;}
    if(phase==='countdown'){
      if(!safe){defer('unsafe');return;}
      if(!Number.isFinite(dt)||dt<0)return;
      countdownElapsed+=dt;
      if(countdownElapsed>=1-EPSILON&&countdown===3)warning(2);
      if(countdownElapsed>=2-EPSILON&&countdown===2)warning(1);
      if(countdownElapsed>=3-EPSILON)dispatch();
      return;
    }
    if(!active)return;
    if(phase==='idle'&&Number.isFinite(dt)&&dt>=0){
      activeSeconds=Math.min(intervalSeconds,activeSeconds+dt);
      if(activeSeconds>=intervalSeconds-EPSILON)status('pending');
    }
    if(phase==='pending'&&safe){
      phase='countdown';countdownElapsed=0;ownsPause=true;pause();warning(3);status('countdown');
    }
  }
  function setSuspended(value){
    if(phase==='destroyed')return;
    suspended=Boolean(value);
    if(suspended)defer('suspended');
  }
  function destroy(){
    if(phase==='destroyed')return;
    warning(null);status('destroyed');releasePause();
  }
  return {update,setSuspended,getState,destroy};
}
