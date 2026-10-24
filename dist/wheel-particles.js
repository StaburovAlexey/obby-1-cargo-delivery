import {wheelContactVisual} from './wheel-contact-visuals.js';
import { projectRoad } from './road-layout.js';
import { biomeSurfaceBlend } from './biome-surfaces.js';
const COLORS={city:0x777777,forest:0x885129,desert:0xeabd53,snow:0xdeefff,volcanic:0x48414c};
export const WHEEL_PARTICLES=Object.freeze({capacity:96,maxRate:52,gravity:6.5,maxLife:.9});

export function createWheelParticles(THREE,{groundHeight=()=>0}={}){
 const geometry=new THREE.BoxGeometry(.19,.13,.21),material=new THREE.MeshLambertMaterial({color:0xffffff});
 const mesh=new THREE.InstancedMesh(geometry,material,WHEEL_PARTICLES.capacity);mesh.name='Bounded wheel dirt / sand / snow / ash';mesh.count=0;mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=false;
 mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
 const items=Array.from({length:WHEEL_PARTICLES.capacity},()=>({life:0,color:new THREE.Color()})),object=new THREE.Object3D(),color=new THREE.Color(),targetColor=new THREE.Color();
 let cursor=0,credit=0,sequence=0,wheelCursor=0,disposed=false;
 const random=()=>{sequence=(Math.imul(sequence,1664525)+1013904223)>>>0;return sequence/4294967296};
 function clear(){for(const p of items)p.life=0;credit=0;mesh.count=0;mesh.visible=false;}
 function update(dt,state,enabled=true,visual,pose){
  dt=Math.max(0,Math.min(.05,Number(dt)||0));if(disposed||!dt)return;
  for(const p of items)if(p.life>0){p.life-=dt;p.vy-=WHEEL_PARTICLES.gravity*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.angle+=p.spin*dt;if(p.contactPlane?(p.x-p.gx)*p.nx+(p.y-p.gy)*p.ny+(p.z-p.gz)*p.nz<=.07:p.y<=groundHeight(p.x,p.z)+.07)p.life=0;}
  const contacts=state?.wheelContacts,physicalContacts=contacts!==undefined;
  const supported=physicalContacts?contacts?.filter(w=>w.grounded&&w.point&&[w.point.x,w.point.y,w.point.z].every(Number.isFinite)):null;
  if(enabled&&(!physicalContacts||supported?.length)&&state&&state.pathDistance>1e-5&&state.linearSpeed>.15){
   const b=biomeSurfaceBlend(projectRoad(state.x,state.z,state.routeContext)?.progress),weight=(b.from==='city'?0:1)*(1-b.blend)+(b.to==='city'?0:1)*b.blend;
   color.set(COLORS[b.from]);targetColor.set(COLORS[b.to]);color.lerp(targetColor,b.blend);
   const c=Math.cos(state.heading),s=Math.sin(state.heading),lateral=Math.abs(state.velocityX*c-state.velocityZ*s),boost=1+Math.min(1.4,lateral*.35);
   credit+=Math.min(WHEEL_PARTICLES.maxRate*dt,state.pathDistance*1.8*boost)*weight;
   const count=Math.min(4,Math.floor(credit));credit-=count;
   for(let i=0;i<count;i++){
    const p=items[cursor];cursor=(cursor+1)%items.length;
    const wheel=wheelCursor++%4,hit=physicalContacts?supported[wheel%supported.length]:null;
    p.contactPlane=!!hit;
    let dx;
    if(hit){
     const wheelSpec=(visual?.wheelContacts??visual?.wheels)?.find(w=>w.name===hit.name);
     const patch=wheelSpec&&wheelContactVisual(wheelSpec,contacts,pose);
     const emission=patch??hit.point;
     const normal=hit.normal,length=normal&&Math.hypot(normal.x,normal.y,normal.z);
     p.nx=length>0?normal.x/length:0;p.ny=length>0?normal.y/length:1;p.nz=length>0?normal.z/length:0;
     p.gx=emission.x;p.gy=emission.y;p.gz=emission.z;
     p.x=p.gx+p.nx*.16;p.y=p.gy+p.ny*.16;p.z=p.gz+p.nz*.16;
     dx=hit.name?.endsWith('left')?-1:1;
    }else{
     const contact=visual?.wheels?.[wheel]?.center;dx=contact?contact[0]:(wheel%2?-1.32:1.32);const dz=contact?contact[2]:(wheel<2?-1.63:1.73);
     p.x=state.x+c*dx+s*dz;p.z=state.z-s*dx+c*dz;p.y=groundHeight(p.x,p.z)+.16;p.nx=0;p.ny=1;p.nz=0;
    }
    const side=Math.sign(dx),spread=.35+random()*.65,lift=1.4+random()*1.3;
    p.vx=state.velocityX*.12+c*side*spread+p.nx*lift;p.vz=state.velocityZ*.12-s*side*spread+p.nz*lift;p.vy=p.ny*lift;
    p.life=.55+random()*.35;p.total=p.life;p.angle=random()*Math.PI;p.spin=(random()-.5)*7;p.size=.7+random()*.65;p.color.copy(color).multiplyScalar(.8+random()*.35);
   }
  } else credit=0;
  let n=0;
  for(const p of items)if(p.life>0){object.position.set(p.x,p.y,p.z);object.rotation.set(p.angle,p.angle*.7,p.angle*.4);const scale=p.size*Math.min(1,p.life/.18);object.scale.setScalar(scale);object.updateMatrix();mesh.setMatrixAt(n,object.matrix);mesh.setColorAt(n,p.color);n++;}
  mesh.count=n;mesh.visible=n>0;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
 }
 clear();return {mesh,update,clear,get count(){return mesh.count},get capacity(){return items.length},dispose(){if(disposed)return;disposed=true;clear();geometry.dispose();material.dispose();}};
}
