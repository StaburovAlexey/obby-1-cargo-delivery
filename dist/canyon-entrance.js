import {sanitizeCareer} from './career-save.js';
import {pointInRoad,projectRoad} from './road-layout.js';
import {CANYON_APPROACH_SAMPLES,canyonApproachPoint,canyonApproachContains,projectCanyonApproach,canyonApproachQuads,CANYON_APPROACH_LENGTH} from './canyon-approach.js';

export function canEnterCanyon(career,vehicleId,{developerMode=false}={}){return vehicleId==='bmwreward'&&(developerMode===true||!!sanitizeCareer(career).routeCompletion);}
export function createCanyonEntrance(THREE){
 const group=new THREE.Group();group.name='Canyon entrance and personal progression barrier';
 const geometries=new Set(),materials=new Set();let unlocked=false,disposed=false;
 const geometry=(...size)=>{const g=new THREE.BoxGeometry(...size);geometries.add(g);return g;};
 const material=color=>{const m=new THREE.MeshStandardMaterial({color,roughness:.8});materials.add(m);return m;};
 const box=(name,size,position,color,parent=group)=>{const mesh=new THREE.Mesh(geometry(...size),material(color));mesh.name=name;mesh.position.set(...position);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;};
 // The branch shares the main-road heading before peeling into a quarter-circle.
 const positions=[];
 for(const quad of canyonApproachQuads())for(const i of [0,2,1,0,3,2])positions.push(quad[i].x,.025,quad[i].z);
 const asphaltGeometry=new THREE.BufferGeometry();asphaltGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));asphaltGeometry.computeVertexNormals();geometries.add(asphaltGeometry);
 const asphalt=new THREE.Mesh(asphaltGeometry,material(0x343b43));asphalt.name='Canyon approach asphalt';asphalt.receiveShadow=true;group.add(asphalt);
 const shoulderPositions=[];
 for(let i=1;i<CANYON_APPROACH_SAMPLES.length;i++){
  const a=CANYON_APPROACH_SAMPLES[i-1],b=CANYON_APPROACH_SAMPLES[i];
  for(const side of [-1,1]){
   const ax=a.x+a.right.x*9.5*side,az=a.z+a.right.z*9.5*side,bx=b.x+b.right.x*9.5*side,bz=b.z+b.right.z*9.5*side;
   if(pointInRoad(ax,az)||pointInRoad(bx,bz))continue;
   const quad=[{x:ax-a.right.x*.5,z:az-a.right.z*.5},{x:bx-b.right.x*.5,z:bz-b.right.z*.5},{x:bx+b.right.x*.5,z:bz+b.right.z*.5},{x:ax+a.right.x*.5,z:az+a.right.z*.5}];
   for(const j of [0,2,1,0,3,2])shoulderPositions.push(quad[j].x,.045,quad[j].z);
  }
 }
 const shoulderGeometry=new THREE.BufferGeometry();shoulderGeometry.setAttribute('position',new THREE.Float32BufferAttribute(shoulderPositions,3));shoulderGeometry.computeVertexNormals();geometries.add(shoulderGeometry);
 const shoulders=new THREE.Mesh(shoulderGeometry,material(0xe4b771));shoulders.name='Entrance curved shoulders';group.add(shoulders);
 for(let s=24;s<CANYON_APPROACH_LENGTH-5;s+=8){const p=canyonApproachPoint(s);if(pointInRoad(p.x,p.z))continue;const dash=box('Approach center dash',[.16,.018,4],[p.x,.04,p.z],0xf6d061);dash.rotation.y=p.heading;}
 for(const z of [-75, -55])box('Barrier post',[.7,2.1,.7],[32,1.05,z],0xead8b5);
 const pivot=new THREE.Group();pivot.position.set(32,1.65,-75);group.add(pivot);
 box('Closed red and white barrier arm',[.35,.32,20],[0,0,10],0xf4eee0,pivot);
 for(let z=1;z<20;z+=3)box('Barrier red stripe',[.38,.34,1.25],[0,0,z],0xd84736,pivot);
 box('Canyon sign upright',[.5,7,.5],[42,3.5,-55],0x423b33);box('Canyon sign board',[12,3,.35],[42,7,-55],0x172d3a);
 const gateSolid={minX:31.65,maxX:32.35,minZ:-75.5,maxZ:-54.5};
 const contains=canyonApproachContains;
 const near=(x,z)=>x>-8&&x<128&&z>-84&&z<-23;
 return {group,solids:[gateSolid],labelAnchor:{x:42,y:7,z:-54.7},get unlocked(){return unlocked;},contains,near,
  updateAccess(career,options){unlocked=canEnterCanyon(career,'bmwreward',options);pivot.rotation.x=unlocked?-Math.PI/2:0;gateSolid.minX=unlocked?Infinity:31.65;gateSolid.maxX=unlocked?-Infinity:32.35;},
  shouldEnter(position,vehicleId){return unlocked&&vehicleId==='bmwreward'&&position.x>=84&&position.x<=106&&Math.abs(position.z+65)<6;},
  contact(x,z,h,footprint={halfWidth:1.7,halfLength:4.05}){
   if(!near(x,z))return undefined;
   const c=Math.cos(h),s=Math.sin(h),rx=footprint.halfWidth*Math.abs(c)+footprint.halfLength*Math.abs(s),rz=footprint.halfWidth*Math.abs(s)+footprint.halfLength*Math.abs(c);
   if(!unlocked&&Math.abs(x-32)<rx+.35&&Math.abs(z+65)<10.5+rz)return {normalX:x<32?-1:1,normalZ:0,depth:rx+.35-Math.abs(x-32),name:'Locked canyon barrier'};
   let hit;
   for(const dx of [-footprint.halfWidth,footprint.halfWidth])for(const dz of [-footprint.halfLength,footprint.halfLength]){
    const px=x+c*dx+s*dz,pz=z-s*dx+c*dz;if(contains(px,pz)||pointInRoad(px,pz))continue;
    const branch=projectCanyonApproach(px,pz),scale=Math.min(1,9/Math.max(branch.distance,1e-9)),bx=Math.min(110,branch.x+(px-branch.x)*scale),bz=Math.min(-21,branch.z+(pz-branch.z)*scale),p=projectRoad(px,pz),offset=Math.max(-14.9,Math.min(14.9,p.offset));
    const mx=p.x+p.right.x*offset,mz=p.z+p.right.z*offset;
    const branchDistance=Math.hypot(bx-px,bz-pz),mainDistance=Math.hypot(mx-px,mz-pz),tx=branchDistance<mainDistance?bx:mx,tz=branchDistance<mainDistance?bz:mz,depth=Math.hypot(tx-px,tz-pz);
    if(depth>1e-6&&(!hit||depth>hit.depth))hit={normalX:(tx-px)/depth,normalZ:(tz-pz)/depth,depth,name:'Canyon entrance edge'};
   }
   return hit;
  },
  dispose(){if(disposed)return;disposed=true;geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.removeFromParent();},
 };
}
