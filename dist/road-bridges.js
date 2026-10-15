
import {projectRoad} from './route-network.js';
const biomeIds=['city','forest','desert','snow','volcanic'];
const centers=[
  [960,1320,1720,2160,2660],
  [3320,3850,4070,5360,5580],
  [6260,6480,6700,6920,7140],
  [8820,9040,9620,10470,10690],
  [11320,11540,12180,13500,13180],
];


export function buildBridges(seed=42){
  let state=seed>>>0||1;
  const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;state>>>=0;return state/4294967296;};
  return Object.freeze(centers.flatMap((stations,i)=>stations.map((q,j)=>Object.freeze({
    id:biomeIds[i]+'-bridge-'+(j+1),biome:biomeIds[i],from:q-12,to:q+12,
    halfWidth:2.5,offset:[-1,0,1,-1,1][j]*Math.round((3.5+random()*3.5)*10)/10,
  }))));
}
export const BRIDGES=buildBridges(42);
export const bridgeAtProgress=q=>BRIDGES.find(b=>q>=b.from&&q<=b.to);


function importedWheels(metadata){
  const wheels=metadata?.wheels??metadata?.wheelContacts;
  return Array.isArray(wheels)&&wheels.length===4&&wheels.every(w=>
    Array.isArray(w?.center)&&w.center.length===3&&w.center.every(Number.isFinite)&&
    Number.isFinite(w.radius)&&w.radius>0&&Number.isFinite(w.halfWidth)&&w.halfWidth>0)?wheels:null;
}
function convexHull(points){
  const sorted=points.slice().sort((a,b)=>a.x-b.x||a.z-b.z);
  const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
  const half=pts=>{const h=[];for(const p of pts){while(h.length>1&&cross(h.at(-2),h.at(-1),p)<=1e-10)h.pop();h.push(p);}return h;};
  return sorted.length?[...half(sorted).slice(0,-1),...half(sorted.slice().reverse()).slice(0,-1)]:[];
}
export function bridgeSupport(pose,history,metadata){
  const c=Math.cos(pose.heading),s=Math.sin(pose.heading);let bridge=null,unsupported=0;const lost=[];
  const wheels=importedWheels(metadata),steer=pose.frontWheelAngle??pose.steerAngle??0;



  const contacts=wheels?wheels.flatMap((wheel,index)=>[-1,1].map(end=>{
    const angle=wheel.front?steer:0,width=end*wheel.halfWidth;
    return {dx:wheel.center[0]+width*Math.cos(angle),dz:-wheel.center[2]+width*Math.sin(angle),wheel:index};
  })):[-1.535,1.535].flatMap(dx=>[-1.73,1.63].map(dz=>({dx,dz})));
  const lostWheels=new Set();
  for(const {dx,dz,wheel} of contacts){
    const p=projectRoad(pose.x+c*dx-s*dz,pose.z-s*dx-c*dz,history),b=bridgeAtProgress(p.progress);
    if(b){bridge=b;p.offset-=b.offset;if(Math.abs(p.offset??p.lateral??0)>b.halfWidth){
      if(!wheels||!lostWheels.has(wheel))unsupported++;lostWheels.add(wheel);lost.push({dx,dz,p,...(wheels?{wheel}:{})});
    }}
  }
  const center=projectRoad(pose.x,pose.z,history);
  let outward={x:0,y:0,z:0},pivot=null;
  if(lost.length){
    const corners=convexHull(contacts.map(({dx,dz})=>{
      const x=pose.x+c*dx-s*dz,z=pose.z-s*dx-c*dz,p=projectRoad(x,z,history);
      return{x,z,q:p.progress,offset:p.offset-bridge.offset};
    }));
    const clip=(poly,key,bound,sign)=>{const out=[];for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],da=sign*(a[key]-bound),db=sign*(b[key]-bound);
      if(da>=0)out.push(a);if((da>=0)!==(db>=0)){const t=da/(da-db);out.push(Object.fromEntries(Object.keys(a).map(k=>[k,a[k]+(b[k]-a[k])*t])));}
    }return out;};



    const hull=convexHull([...clip(corners,'q',bridge.from,-1),...clip(corners,'q',bridge.to,1),
      ...clip(clip(corners,'offset',-bridge.halfWidth,1),'offset',bridge.halfWidth,-1)]);
    const side=Math.sign(lost.reduce((sum,w)=>sum+w.p.offset,0))||Math.sign(lost[0].p.offset)||1;
    const tipping=lost.filter(w=>Math.sign(w.p.offset)===side);
    const target=tipping.reduce((v,w)=>({x:v.x+(pose.x+c*w.dx-s*w.dz)/tipping.length,z:v.z+(pose.z-s*w.dx-c*w.dz)/tipping.length}),{x:0,z:0});
    let closest=null,best=Infinity;
    for(let i=0;i<hull.length;i++){
      const a=hull[i],b=hull[(i+1)%hull.length],dx=b.x-a.x,dz=b.z-a.z;
      const t=Math.max(0,Math.min(1,((target.x-a.x)*dx+(target.z-a.z)*dz)/(dx*dx+dz*dz||1)));
      const p={x:a.x+dx*t,z:a.z+dz*t},d=(target.x-p.x)**2+(target.z-p.z)**2;
      if(d<best){best=d;closest=p;}
    }
    closest ||= {x:center.x+center.right.x*(bridge.offset+side*bridge.halfWidth),z:center.z+center.right.z*(bridge.offset+side*bridge.halfWidth)};
    const p=projectRoad(closest.x,closest.z,history);
    pivot={...closest,y:p.height+.008};
    const dx=target.x-closest.x,dz=target.z-closest.z,n=Math.hypot(dx,dz);
    outward=n>1e-8?{x:dx/n,y:0,z:dz/n}:{x:center.right.x*side,y:0,z:center.right.z*side};
  }
  return {bridge,unsupported,fall:unsupported>0,lost,pivot,outward,normal:center.normal,
    ...(wheels?{wheelContacts:wheels,sourceWheelRadius:metadata.sourceWheelRadius??.68}:{}),history};
}
function tireVertices(wheels,steer,spin,sourceRadius){
  return wheels.flatMap(wheel=>{
    const angle=wheel.front?steer:0,cs=Math.cos(angle),ss=Math.sin(angle),roll=-spin*sourceRadius/wheel.radius,cr=Math.cos(roll),sr=Math.sin(roll);


    const vertices=wheel.vertices?.length?wheel.vertices:[-1,1].flatMap(end=>Array.from({length:24},(_,i)=>[end*wheel.halfWidth,wheel.radius*Math.cos(i*Math.PI/12),wheel.radius*Math.sin(i*Math.PI/12)]));
    return vertices.map(([x,y,z])=>{
      const ry=y*cr-z*sr,rz=y*sr+z*cr;
      return [wheel.center[0]+x*cs+rz*ss,wheel.center[1]+ry,wheel.center[2]-x*ss+rz*cs];
    });
  });
}
export function createBridgeFall(){let state=null;return{
 get active(){return !!state;},get state(){return state;},
 begin(pose,support,groundPose){
  if(state)return false;
  state={x:pose.x,z:pose.z,heading:pose.heading,time:0,drop:0,angle:0,slide:0,bodyPitch:pose.bodyPitch||0,bodyRoll:pose.bodyRoll||0,bodyBob:pose.bodyBob||0,frontWheelAngle:pose.frontWheelAngle??pose.steerAngle??0,wheelSpin:pose.wheelSpin||0,
    bridge:support?.bridge||null,
    pivot:support?.pivot?{...support.pivot}:{x:pose.x,y:0,z:pose.z},
    outward:support?.outward?{...support.outward}:{x:Math.cos(pose.heading),y:0,z:-Math.sin(pose.heading)},
    normal:support?.normal?{...support.normal}:{x:0,y:1,z:0},
    origin:groundPose?{x:groundPose.position.x,y:groundPose.position.y,z:groundPose.position.z}:{x:pose.x,y:0,z:pose.z},
    orientation:groundPose?{x:groundPose.quaternion.x,y:groundPose.quaternion.y,z:groundPose.quaternion.z,w:groundPose.quaternion.w}:{x:0,y:0,z:0,w:1},
    history:support?.history,
    wheelContacts:support?.wheelContacts?.map(w=>({...w,center:[...w.center],vertices:w.vertices?.map(v=>[...v])}))||null};
  if(state.wheelContacts)state.tireVertices=tireVertices(state.wheelContacts,state.frontWheelAngle,state.wheelSpin,support.sourceWheelRadius??.68);
  return true;
 },
 step(dt){
  if(!state)return false;state.time+=Math.max(0,Math.min(.05,dt));
  const t=state.time,hold=.42,u=Math.min(t/hold,1),air=Math.max(0,t-hold);


  state.angle=.55*u*u+(1.1/hold)*air;
  state.slide=2.8*air*air;state.drop=7*air*air;
  return t>=1.55;
 },
 reset(){state=null;}
};}

export function bridgeFallPose(THREE,state){
  const pivot=new THREE.Vector3(state.pivot.x,state.pivot.y,state.pivot.z);
  const normal=new THREE.Vector3(state.normal.x,state.normal.y,state.normal.z).normalize();
  const outward=new THREE.Vector3(state.outward.x,state.outward.y,state.outward.z);
  outward.addScaledVector(normal,-outward.dot(normal)).normalize();
  const axis=new THREE.Vector3().crossVectors(normal,outward).normalize();
  const rotation=new THREE.Quaternion().setFromAxisAngle(axis,state.angle);
  const position=new THREE.Vector3(state.origin.x,state.origin.y,state.origin.z).sub(pivot).applyQuaternion(rotation).add(pivot)
    .addScaledVector(outward,state.slide).add(new THREE.Vector3(0,-state.drop,0));
  const quaternion=rotation.clone().multiply(new THREE.Quaternion(state.orientation.x,state.orientation.y,state.orientation.z,state.orientation.w));



  let clearanceLift=0;
  if(state.bridge){
    const check=local=>{
      const v=local.applyQuaternion(quaternion).add(position),p=projectRoad(v.x,v.z,state.history);
      const inGap=p.progress>=state.bridge.from&&p.progress<=state.bridge.to;
      if(!inGap||Math.abs(p.offset-state.bridge.offset)<=state.bridge.halfWidth+1e-8)clearanceLift=Math.max(clearanceLift,p.height+.008+.003-v.y);
    };
    if(state.tireVertices)for(const vertex of state.tireVertices)check(new THREE.Vector3(...vertex));
    else for(const side of [-1,1])for(const axle of [-1.63,1.73])for(const end of [-.215,.215])for(let i=0;i<12;i++){
      const a=i*Math.PI/6+(state.wheelSpin||0),steer=axle<0?(state.frontWheelAngle||0):0;
      const radialZ=.68*Math.sin(a),local=new THREE.Vector3(side*1.32+end*Math.cos(steer)+radialZ*Math.sin(steer),.73+.68*Math.cos(a),axle-end*Math.sin(steer)+radialZ*Math.cos(steer));
      check(local);
    }
  }
  position.y+=clearanceLift;
  return {position,quaternion,pivot,axis,outward,clearanceLift};
}
