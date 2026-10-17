import {CANYON_TRACK,canyonContains,projectCanyon} from './canyon-track.js';
import {sanitizeCareer} from './career-save.js';
import {pointInRoad,projectRoad} from './road-layout.js';
import {CANYON_APPROACH_HEIGHT,CANYON_GATE_DISTANCE,CANYON_APPROACH_SAMPLES,canyonApproachPoint,canyonApproachContains,projectCanyonApproach,canyonApproachQuads,CANYON_APPROACH_LENGTH} from './canyon-approach.js';

export function canEnterCanyon(career,vehicleId,{developerMode=false}={}){return vehicleId==='bmwreward'&&(developerMode===true||!!sanitizeCareer(career).routeCompletion);}
export function createCanyonEntrance(THREE){
 const group=new THREE.Group();group.name='Canyon entrance and personal progression barrier';
 const geometries=new Set(),materials=new Set();let unlocked=false,disposed=false;
 const geometry=(...size)=>{const g=new THREE.BoxGeometry(...size);geometries.add(g);return g;};
 const material=color=>{const m=new THREE.MeshStandardMaterial({color,roughness:.8});materials.add(m);return m;};
 const box=(name,size,position,color,parent=group)=>{const mesh=new THREE.Mesh(geometry(...size),material(color));mesh.name=name;mesh.position.set(...position);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;};
 // The branch peels gradually to 45 degrees, with no transverse right-angle leg.
 const positions=[];
 for(const quad of canyonApproachQuads())for(const i of [0,2,1,0,3,2])positions.push(quad[i].x,CANYON_APPROACH_HEIGHT,quad[i].z);
 const asphaltGeometry=new THREE.BufferGeometry();asphaltGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));asphaltGeometry.computeVertexNormals();geometries.add(asphaltGeometry);
 const asphalt=new THREE.Mesh(asphaltGeometry,material(0x343b43));asphalt.name='Canyon approach asphalt';asphalt.receiveShadow=true;group.add(asphalt);
 const shoulderPositions=[];
 for(let i=1;i<CANYON_APPROACH_SAMPLES.length;i++){
  const a=CANYON_APPROACH_SAMPLES[i-1],b=CANYON_APPROACH_SAMPLES[i];
  for(const side of [-1,1]){
   const ax=a.x+a.right.x*9.5*side,az=a.z+a.right.z*9.5*side,bx=b.x+b.right.x*9.5*side,bz=b.z+b.right.z*9.5*side;
   if(pointInRoad(ax,az)||pointInRoad(bx,bz))continue;
   const quad=[{x:ax-a.right.x*.5,z:az-a.right.z*.5},{x:bx-b.right.x*.5,z:bz-b.right.z*.5},{x:bx+b.right.x*.5,z:bz+b.right.z*.5},{x:ax+a.right.x*.5,z:az+a.right.z*.5}];
   for(const j of [0,2,1,0,3,2])shoulderPositions.push(quad[j].x,CANYON_APPROACH_HEIGHT+.02,quad[j].z);
  }
 }
 const shoulderGeometry=new THREE.BufferGeometry();shoulderGeometry.setAttribute('position',new THREE.Float32BufferAttribute(shoulderPositions,3));shoulderGeometry.computeVertexNormals();geometries.add(shoulderGeometry);
 const shoulders=new THREE.Mesh(shoulderGeometry,material(0xe4b771));shoulders.name='Entrance curved shoulders';group.add(shoulders);
 for(let s=24;s<CANYON_APPROACH_LENGTH-5;s+=8){const p=canyonApproachPoint(s);if(pointInRoad(p.x,p.z))continue;const dash=box('Approach center dash',[.16,.018,4],[p.x,CANYON_APPROACH_HEIGHT+.015,p.z],0xf6d061);dash.rotation.y=p.heading;}
 const gate=canyonApproachPoint(CANYON_GATE_DISTANCE),forward={x:-Math.sin(gate.heading),z:-Math.cos(gate.heading)};
 const gateGroup=new THREE.Group();gateGroup.position.set(gate.x,0,gate.z);gateGroup.rotation.y=gate.heading;group.add(gateGroup);
 for(const x of [-10,10])box('Barrier post',[.7,2.1,.7],[x,1.05,0],0xead8b5,gateGroup);
 const pivot=new THREE.Group();pivot.position.set(-10,1.65,0);gateGroup.add(pivot);
 box('Closed red and white barrier arm',[20,.32,.35],[10,0,0],0xf4eee0,pivot);
 for(let x=1;x<20;x+=3)box('Barrier red stripe',[1.25,.34,.38],[x,0,0],0xd84736,pivot);
 const sign={x:gate.x+gate.right.x*12+forward.x*10,z:gate.z+gate.right.z*12+forward.z*10};
 box('Canyon sign upright',[.5,7,.5],[sign.x,3.5,sign.z],0x423b33);const signBoard=box('Canyon sign board',[12,3,.35],[sign.x,7,sign.z],0x172d3a);signBoard.rotation.y=gate.heading;
 const gateSolid={minX:gate.x-7.5,maxX:gate.x+7.5,minZ:gate.z-7.5,maxZ:gate.z+7.5};
 const contains=canyonApproachContains;
 const near=(x,z)=>z<-17&&projectCanyonApproach(x,z).distance<24;
 return {group,solids:[gateSolid],labelAnchor:{x:sign.x,y:7,z:sign.z},get unlocked(){return unlocked;},contains,near,
  updateAccess(career,options){unlocked=canEnterCanyon(career,'bmwreward',options);pivot.rotation.z=unlocked?Math.PI/2:0;gateSolid.minX=unlocked?Infinity:gate.x-7.5;gateSolid.maxX=unlocked?-Infinity:gate.x+7.5;},
  shouldEnter(position,vehicleId){const p=canyonContains(position.x,position.z)&&projectCanyon(position.x,position.z);return unlocked&&vehicleId==='bmwreward'&&!!p&&p.progress<=30&&Math.abs(p.offset)<6;},
  contact(x,z,h,footprint={halfWidth:1.7,halfLength:4.05}){
   if(!near(x,z))return undefined;
   const c=Math.cos(h),s=Math.sin(h),rx=footprint.halfWidth*Math.abs(c)+footprint.halfLength*Math.abs(s),rz=footprint.halfWidth*Math.abs(s)+footprint.halfLength*Math.abs(c);
   const along=(x-gate.x)*forward.x+(z-gate.z)*forward.z,across=(x-gate.x)*gate.right.x+(z-gate.z)*gate.right.z;
   const relative=h-gate.heading,extent=footprint.halfLength*Math.abs(Math.cos(relative))+footprint.halfWidth*Math.abs(Math.sin(relative));
   if(!unlocked&&Math.abs(along)<extent+.35&&Math.abs(across)<10.5+Math.hypot(rx,rz))return {normalX:Math.sign(along||-1)*forward.x,normalZ:Math.sign(along||-1)*forward.z,depth:extent+.35-Math.abs(along),name:'Locked canyon barrier'};
   let hit;
   for(const dx of [-footprint.halfWidth,footprint.halfWidth])for(const dz of [-footprint.halfLength,footprint.halfLength]){
    const px=x+c*dx+s*dz,pz=z-s*dx+c*dz;if(contains(px,pz)||canyonContains(px,pz)||pointInRoad(px,pz))continue;
    const branch=projectCanyonApproach(px,pz),scale=Math.min(1,9/Math.max(branch.distance,1e-9)),bx=branch.x+(px-branch.x)*scale,bz=branch.z+(pz-branch.z)*scale,p=projectRoad(px,pz),offset=Math.max(-14.9,Math.min(14.9,p.offset));
    const mx=p.x+p.right.x*offset,mz=p.z+p.right.z*offset;
    const canyon=projectCanyon(px,pz),canyonOffset=Math.max(-CANYON_TRACK.halfWidth,Math.min(CANYON_TRACK.halfWidth,canyon.offset)),cx=canyon.x+canyon.right.x*canyonOffset,cz=canyon.z+canyon.right.z*canyonOffset;
    const canyonDistance=Math.hypot(cx-px,cz-pz);
    const branchDistance=Math.hypot(bx-px,bz-pz),mainDistance=Math.hypot(mx-px,mz-pz),tx=canyonDistance<Math.min(branchDistance,mainDistance)?cx:branchDistance<mainDistance?bx:mx,tz=canyonDistance<Math.min(branchDistance,mainDistance)?cz:branchDistance<mainDistance?bz:mz,depth=Math.hypot(tx-px,tz-pz);
    if(depth>1e-6&&(!hit||depth>hit.depth))hit={normalX:(tx-px)/depth,normalZ:(tz-pz)/depth,depth,name:'Canyon entrance edge'};
   }
   return hit;
  },
  dispose(){if(disposed)return;disposed=true;geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.removeFromParent();},
 };
}
