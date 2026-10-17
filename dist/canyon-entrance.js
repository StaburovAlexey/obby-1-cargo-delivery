import {sanitizeCareer} from './career-save.js';
import {pointInRoad,projectRoad} from './road-layout.js';

export function canEnterCanyon(career,vehicleId){return vehicleId==='bmwreward'&&!!sanitizeCareer(career).routeCompletion;}
export function createCanyonEntrance(THREE){
 const group=new THREE.Group();group.name='Canyon entrance and personal progression barrier';
 const geometries=new Set(),materials=new Set();let unlocked=false,disposed=false;
 const geometry=(...size)=>{const g=new THREE.BoxGeometry(...size);geometries.add(g);return g;};
 const material=color=>{const m=new THREE.MeshStandardMaterial({color,roughness:.8});materials.add(m);return m;};
 const box=(name,size,position,color,parent=group)=>{const mesh=new THREE.Mesh(geometry(...size),material(color));mesh.name=name;mesh.position.set(...position);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;};
 box('Canyon approach asphalt',[122,.12,18],[49,-.035,-65],0x343b43);
 box('Entrance shoulder near',[122,.16,1],[49,.015,-55.5],0xe4b771);box('Entrance shoulder far',[122,.16,1],[49,.015,-74.5],0xe4b771);
 for(let x=5;x<107;x+=8)box('Approach center dash',[4,.018,.16],[x,.04,-65],0xf6d061);
 for(const z of [-75, -55])box('Barrier post',[.7,2.1,.7],[32,1.05,z],0xead8b5);
 const pivot=new THREE.Group();pivot.position.set(32,1.65,-75);group.add(pivot);
 box('Closed red and white barrier arm',[.35,.32,20],[0,0,10],0xf4eee0,pivot);
 for(let z=1;z<20;z+=3)box('Barrier red stripe',[.38,.34,1.25],[0,0,z],0xd84736,pivot);
 box('Canyon sign upright',[.5,7,.5],[42,3.5,-55],0x423b33);box('Canyon sign board',[12,3,.35],[42,7,-55],0x172d3a);
 const gateSolid={minX:31.65,maxX:32.35,minZ:-75.5,maxZ:-54.5};
 const contains=(x,z)=>x>=-12&&x<=110&&z>=-74&&z<=-56;
 const near=(x,z)=>x>-8&&x<118&&z>-84&&z<-46;
 return {group,solids:[gateSolid],labelAnchor:{x:42,y:7,z:-54.7},get unlocked(){return unlocked;},contains,near,
  updateAccess(career){unlocked=canEnterCanyon(career,'bmwreward');pivot.rotation.x=unlocked?-Math.PI/2:0;gateSolid.minX=unlocked?Infinity:31.65;gateSolid.maxX=unlocked?-Infinity:32.35;},
  shouldEnter(position,vehicleId){return unlocked&&vehicleId==='bmwreward'&&position.x>=84&&position.x<=106&&Math.abs(position.z+65)<6;},
  contact(x,z,h,footprint={halfWidth:1.7,halfLength:4.05}){
   if(!near(x,z))return undefined;
   const c=Math.cos(h),s=Math.sin(h),rx=footprint.halfWidth*Math.abs(c)+footprint.halfLength*Math.abs(s),rz=footprint.halfWidth*Math.abs(s)+footprint.halfLength*Math.abs(c);
   if(!unlocked&&Math.abs(x-32)<rx+.35&&Math.abs(z+65)<10.5+rz)return {normalX:x<32?-1:1,normalZ:0,depth:rx+.35-Math.abs(x-32),name:'Locked canyon barrier'};
   let hit;
   for(const dx of [-footprint.halfWidth,footprint.halfWidth])for(const dz of [-footprint.halfLength,footprint.halfLength]){
    const px=x+c*dx+s*dz,pz=z-s*dx+c*dz;if(contains(px,pz)||pointInRoad(px,pz))continue;
    const bx=Math.max(-12,Math.min(110,px)),bz=Math.max(-74,Math.min(-56,pz)),p=projectRoad(px,pz),offset=Math.max(-14.9,Math.min(14.9,p.offset));
    const mx=p.x+p.right.x*offset,mz=p.z+p.right.z*offset;
    const branchDistance=Math.hypot(bx-px,bz-pz),mainDistance=Math.hypot(mx-px,mz-pz),tx=branchDistance<mainDistance?bx:mx,tz=branchDistance<mainDistance?bz:mz,depth=Math.hypot(tx-px,tz-pz);
    if(depth>1e-6&&(!hit||depth>hit.depth))hit={normalX:(tx-px)/depth,normalZ:(tz-pz)/depth,depth,name:'Canyon entrance edge'};
   }
   return hit;
  },
  dispose(){if(disposed)return;disposed=true;geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.removeFromParent();},
 };
}
