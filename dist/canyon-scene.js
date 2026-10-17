import {CANYON_TRACK,canyonPointAt} from './canyon-track.js';
import {CANYON_APPROACH_LENGTH,canyonApproachPoint} from './canyon-approach.js';
import {CANYON_APPROACH_ROCKS} from './canyon-rocks.js';
import {pointInRoad} from './road-layout.js';
import {createBarrierGeometry} from './roadside-barrier.js';

export function createCanyonScene(THREE){
 const group=new THREE.Group();group.name='Downhill sandstone drift canyon';
 const geometries=new Set(),materials=new Set(),instances=[];let disposed=false;
 const mat=(color,extra={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.94,...extra});materials.add(m);return m;};
 const box=new THREE.BoxGeometry(1,1,1);geometries.add(box);
 function strip(name,left,right,material,lift=0){
  const positions=[],indices=[];let i=0;
  for(let s=0;s<=CANYON_TRACK.length;s+=2){const p=canyonPointAt(s);for(const w of [left,right])positions.push(p.x+p.right.x*w,p.height+lift,p.z+p.right.z*w);if(i>0)indices.push(i-2,i-1,i,i-1,i+1,i);i+=2;}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();geometries.add(geometry);
  const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.receiveShadow=true;group.add(mesh);return mesh;
 }
 strip('Canyon asphalt',-9,9,mat(0x3e4349));strip('Canyon left shoulder',-15,-9,mat(0xc49461),-.04);strip('Canyon right shoulder',9,15,mat(0xd3a576),-.04);
 strip('Canyon left edge paint',-8.65,-8.48,mat(0xf9e9c5),.02);strip('Canyon right edge paint',8.48,8.65,mat(0xf9e9c5),.02);
 const object=new THREE.Object3D();
 function batch(name,geometry,material,parts){
  const mesh=new THREE.InstancedMesh(geometry,material,parts.length);mesh.name=name;
  parts.forEach((p,i)=>{object.position.set(...p.position);object.rotation.set(p.pitch||0,p.heading||0,0,'YXZ');object.scale.set(...p.scale);object.updateMatrix();mesh.setMatrixAt(i,object.matrix);if(p.color!==undefined)mesh.setColorAt(i,new THREE.Color(p.color));});mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.castShadow=mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);instances.push(mesh);return mesh;
 }
 const posts=[],dashes=[];
 // Use the same centerline/cross-sections on both sides of the approach join.
 // A run only begins once the complete steel profile clears the main road.
 const railPoints=[],approachRailStarts=new Map();
 for(let s=0;s<CANYON_APPROACH_LENGTH;s+=2)railPoints.push({...canyonApproachPoint(s),approachDistance:s});
 for(let s=0;s<=CANYON_TRACK.length;s+=2)railPoints.push(canyonPointAt(s));
 const railMaterial=mat(0xbfc3bd,{metalness:.3}),runs=[];
 for(const side of [-1,1]){
  let sections=[];
  const flush=()=>{if(sections.length>1)runs.push({side,sections});sections=[];};
  for(let i=0;i<railPoints.length;i++){
   const p=railPoints[i],near={x:p.x+p.right.x*9.14*side,z:p.z+p.right.z*9.14*side},far={x:p.x+p.right.x*9.36*side,z:p.z+p.right.z*9.36*side};
   if(i<Math.ceil(CANYON_APPROACH_LENGTH/2)&&(pointInRoad(near.x,near.z)||pointInRoad(far.x,far.z))){flush();continue;}
   if(p.approachDistance!==undefined&&!approachRailStarts.has(side))approachRailStarts.set(side,p.approachDistance);
   sections.push({near,far,bottom:p.height+.53,top:p.height+1.03});
  }
  flush();
 }
 // Miter both corners of the terminal rail into the side rails. One U-shaped
 // sweep has no intersecting terminal box, doubled end faces or corner gaps.
 const left=runs.findLast(r=>r.side===-1),right=runs.findLast(r=>r.side===1),end=canyonPointAt(CANYON_TRACK.length);
 if(left&&right){
  const forward={x:-Math.sin(end.heading),z:-Math.cos(end.heading)};
  for(const run of [left,right]){const last=run.sections.at(-1);for(const [key,d]of [['near',-.11],['far',.11]]){last[key].x+=forward.x*d;last[key].z+=forward.z*d;}}
  left.sections.push(...right.sections.slice().reverse());runs.splice(runs.indexOf(right),1);
 }
 for(let i=0;i<runs.length;i++){
  const geometry=createBarrierGeometry(THREE,runs[i].sections);geometries.add(geometry);
  const mesh=new THREE.Mesh(geometry,railMaterial);mesh.name=i===0?'Canyon steel guardrails':'Canyon steel guardrails '+i;mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
 }
 for(const side of [-1,1])for(let s=Math.ceil((approachRailStarts.get(side)??CANYON_APPROACH_LENGTH)/12)*12;s<CANYON_APPROACH_LENGTH;s+=12){
  const p=canyonApproachPoint(s),x=p.x+p.right.x*9.25*side,z=p.z+p.right.z*9.25*side;
  if([[-.125,-.125],[-.125,.125],[.125,-.125],[.125,.125]].some(([dx,dz])=>pointInRoad(x+dx,z+dz)))continue;
  posts.push({position:[x,p.height+.48,z],scale:[.25,.95,.25]});
 }
 for(let s=0;s<CANYON_TRACK.length;s+=12){const p=canyonPointAt(s);for(const side of [-1,1])posts.push({position:[p.x+p.right.x*9.25*side,p.height+.48,p.z+p.right.z*9.25*side],scale:[.25,.95,.25]});}
 for(let s=8;s<CANYON_TRACK.length;s+=14){const p=canyonPointAt(s);dashes.push({position:[p.x,p.height+.024,p.z],scale:[.14,.028,5],heading:p.heading,pitch:Math.atan(p.gradient.x*-Math.sin(p.heading)+p.gradient.z*-Math.cos(p.heading))});}
 batch('Canyon guardrail posts',box,mat(0x6d7478),posts);batch('Canyon center dashes',box,mat(0xe9b94e),dashes);
 // Layers meet without overlapping sidewalls or doubled internal caps.
 for(let layer=0;layer<3;layer++){
  const rock=new THREE.CylinderGeometry(1,1,1,7,1),indices=[];
  for(const part of rock.groups)if(part.materialIndex===0||(layer===0&&part.materialIndex===2)||(layer===2&&part.materialIndex===1))for(let i=part.start;i<part.start+part.count;i++)indices.push(rock.index.getX(i));
  rock.setIndex(indices);rock.clearGroups();geometries.add(rock);
  const parts=[];
  // Set the first outcrops beyond the city terrain and the garage sightline.
  for(let s=57,index=0;s<=CANYON_TRACK.length;s+=19,index++){
   const p=canyonPointAt(s);
   for(const side of [-1,1]){const wobble=Math.sin(index*3.1+side)*3.5,top=p.height+20+Math.sin(index*.7)*12,bottom=p.height-45,total=top-bottom,h=total/3;
    parts.push({position:[p.x+p.right.x*(34+wobble)*side,bottom+h*(layer+.5),p.z+p.right.z*(34+wobble)*side],scale:[17+Math.sin(index*2.3)*3,h,17+Math.cos(index*1.3)*3],heading:index*.3,color:[0xa45f3a,0xc88650,0xe0a56c][layer]});}
  }
  batch('Canyon sandstone stratum '+layer,rock,mat(0xffffff,{flatShading:true}),parts);
  const approachParts=CANYON_APPROACH_ROCKS.map(p=>{const h=(p.top-p.bottom)/3;return {position:[p.x,p.bottom+h*(layer+.5),p.z],scale:[p.radius,h,p.radius],heading:p.heading,color:[0xa45f3a,0xc88650,0xe0a56c][layer]};});
  // Underground approach bases share a flat datum. Leave them open so adjacent
  // buried outcrops cannot create doubled coplanar bottom caps.
  const approachRock=rock.clone(),approachIndices=[];
  for(let i=0;i<rock.index.count;i+=3)if(rock.attributes.normal.getY(rock.index.getX(i))>-.99)for(let j=0;j<3;j++)approachIndices.push(rock.index.getX(i+j));
  approachRock.setIndex(approachIndices);geometries.add(approachRock);
  batch('Canyon approach sandstone stratum '+layer,approachRock,mat(0xffffff,{flatShading:true}),approachParts);
 }
 for(const [distance,name]of [[5,'Canyon start'],[CANYON_TRACK.finish,'Canyon finish']]){
  const p=canyonPointAt(distance),parts=[];
  for(const side of [-1,1])parts.push({position:[p.x+p.right.x*10.4*side,p.height+4,p.z+p.right.z*10.4*side],scale:[.65,8,.65]});
  parts.push({position:[p.x,p.height+8,p.z],scale:[21.5,1.3,.6],heading:p.heading});batch(name+' arch',box,mat(name.includes('finish')?0xf4d16f:0x4ac1d4),parts);
 }
 // A finite ribbon follows the canyon. A world-sized floor would cut across
 // the main map and, after the shared join, cover the downhill asphalt.
 // Keep floor offsets below the 50 m minimum bend radius so triangles cannot fold.
 strip('Canyon basin floor',-45,45,mat(0xa87952),-45);
 return {group,dispose(){if(disposed)return;disposed=true;instances.forEach(i=>i.dispose());geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.removeFromParent();}};
}
