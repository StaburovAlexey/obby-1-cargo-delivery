// Export actual final THREE vertex arrays for offline Blender geometry proof.
// The storefront wall bake uses the source CPU material sampler. No browser.
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from '../../dist/vendor/three.module.js';
import {buildCity} from '../../dist/network-scene.js';
import * as N from '../../dist/route-network.js';
import {sampleBuildingSurface} from '../../dist/building-material.js';
import {createGrassCheckerTextureData} from '../../dist/square-stud-texture.js';
import {roadSurfaceAppearanceAt} from '../../dist/road-material.js';
import {createRoadHazards} from '../../dist/road-hazards.js';
import {createRoadHazardsScene} from '../../dist/road-hazards-scene.js';
const dir=new URL('../../../network-scene-diagnostics/',import.meta.url);fs.mkdirSync(dir,{recursive:true});
const city=buildCity(THREE),out={kind:'Actual final Three.js geometry, rendered offline in Blender; not browser/WebGL',sourceSHA256:{},scenes:[]};
for(const f of ['network-scene.js','route-network.js','route-network-config.js','road-material.js'])out.sourceSHA256[f]=crypto.createHash('sha256').update(fs.readFileSync(new URL('../../dist/'+f,import.meta.url))).digest('hex');
const tile=createGrassCheckerTextureData();fs.writeFileSync(new URL('checker.ppm',dir),Buffer.concat([Buffer.from(`P6\n${tile.width} ${tile.height}\n255\n`),Buffer.from(tile.data.filter((_,i)=>i%4!==3))]));
const main=N.routePointAtProgress(3030),alternate=N.routePointAtProgress(3030,{branch:'alternate'}),forkCenter=[(main.x+alternate.x)/2,main.height,(main.z+alternate.z)/2];
const settings=[
 {id:'forest-driver',q:3030,center:forkCenter,radius:290,camera:[0,-125,12],target:[0,70,1],projection:'PERSP',lens:32,ortho:110,bake:false,label:'Actual 12m driving-height fork approach, green median and six branched log hazards'},
 {id:'whole-plan',q:5480,center:[1,0,-3665],radius:10000,camera:[0,-.01,9000],ortho:8200,resolution:[1000,1600],bake:false,label:'Actual complete five-biome 10.83km network with four alternative-route loops'},
 {id:'city-turn',q:1300,radius:700,camera:[-650,800,650],ortho:1300,bake:false,label:'Actual 90 degree city curve and continuous shared-cut houses'},
 {id:'city-street',q:1220,radius:100,camera:[36,43,53],ortho:110,bake:true,label:'Actual curved city storefronts with source CPU material textures'},
 {id:'forest-fork',q:3030,radius:360,camera:[230,390,260],ortho:640,bake:false,label:'Actual flat road union at forest split, both routes and rejoin'},
];
const linear=n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4,srgb=n=>n<=.0031308?n*12.92:1.055*n**(1/2.4)-.055;
let textureId=0;
function bakeWall(mesh,start){
 const g=mesh.geometry,m=g.attributes.urPrismMeters,sz=g.attributes.urPrismSize,face=g.attributes.urPrismFace,shop=g.attributes.urShopData,col=g.attributes.color;
 const normal=[face.getX(start),face.getY(start),face.getZ(start)],size=[sz.getX(start),sz.getY(start),sz.getZ(start)],side=Math.abs(normal[0])>.5,width=side?size[2]:size[0],height=size[1],color=[col.getX(start),col.getY(start),col.getZ(start)];
 const W=Math.max(32,Math.min(384,Math.round(width*12))),H=Math.max(32,Math.min(384,Math.round(height*12))),data=new Uint8Array(W*H*3),shopData={shopBase:shop.getX(start),shopId:shop.getY(start)};
 for(let j=0;j<H;j++)for(let i=0;i<W;i++){
  const u=(i+.5)/W,v=1-(j+.5)/H,position=side?[normal[0]*.5,v-.5,u-.5]:[u-.5,v-.5,normal[2]*.5];
  const rgba=sampleBuildingSurface(position,normal,size,shopData),rgb=rgba.slice(0,3).map((n,k)=>rgba[3]===255?Math.round(255*srgb(linear(n/255)*color[k])):n);data.set(rgb,(j*W+i)*3);
 }
 const file=`facade-${textureId++}.ppm`;fs.writeFileSync(new URL(file,dir),Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`),Buffer.from(data)]));
 return {file,uv:Array.from({length:4},(_,j)=>[(side?m.getZ(start+j):m.getX(start+j))/width,m.getY(start+j)/height])};
}
const selected=process.argv.slice(2);
const hazardSystem=createRoadHazards(42),hazardScene=createRoadHazardsScene(THREE,{system:hazardSystem});hazardScene.update(0);hazardScene.group.updateMatrixWorld(true);
for(const config of settings){
 if(selected.length&&!selected.includes(config.id))continue;
 const origin=config.center?{x:config.center[0],height:config.center[1],z:config.center[2]}:N.routePointAtProgress(config.q),scene={...config,origin:[origin.x,origin.height,origin.z],parts:[]};
 city.group.traverse(mesh=>{
  if(!mesh.isMesh||mesh.isInstancedMesh)return;const g=mesh.geometry,p=g.attributes.position,ix=g.index,col=g.attributes.color;
  const isRoad=mesh.name==='Continuous 30m-wide road',isGround=mesh.name==='Closed continuous terrain foundation',isHouse=mesh.name==='Continuous storefront residences';
  if(isRoad||isGround){const vertices=[],faces=[],uv=[],colors=[],lookup=new Map();
   for(let i=0;i<ix.count;i+=3){const ids=[0,1,2].map(k=>ix.getX(i+k));if(!ids.some(k=>Math.hypot(p.getX(k)-origin.x,p.getZ(k)-origin.z)<config.radius))continue;
    faces.push(ids.map(k=>{if(!lookup.has(k)){lookup.set(k,vertices.length);vertices.push([p.getX(k),p.getY(k),p.getZ(k)]);uv.push([g.attributes.uv.getX(k),g.attributes.uv.getY(k)]);const c=isRoad?roadSurfaceAppearanceAt(THREE,g.attributes.roadProgress.getX(k)).color:new THREE.Color(col.getX(k),col.getY(k),col.getZ(k));colors.push(c.toArray());}return lookup.get(k);}));}
   scene.parts.push({name:mesh.name,vertices,faces,uv,colors,checker:true});return;
  }
  const vertices=[],faces=[],uv=[],colors=[];
  for(let i=0;i<p.count;i+=4){if(!Array.from({length:4},(_,j)=>i+j).some(k=>Math.hypot(p.getX(k)-origin.x,p.getZ(k)-origin.z)<config.radius))continue;
   const verts=Array.from({length:4},(_,j)=>[p.getX(i+j),p.getY(i+j),p.getZ(i+j)]),face=g.attributes.urPrismFace,m=g.attributes.urPrismMeters;
   if(config.bake&&isHouse&&Math.abs(face.getY(i))<.5){const texture=bakeWall(mesh,i);scene.parts.push({name:'Source-sampled metric storefront face',vertices:verts,faces:[[0,1,2],[0,2,3]],uv:texture.uv,texture:texture.file});continue;}
   const base=vertices.length;vertices.push(...verts);faces.push([base,base+1,base+2],[base,base+2,base+3]);
   for(let j=0;j<4;j++){const k=i+j;colors.push([col.getX(k),col.getY(k),col.getZ(k)]);uv.push(Math.abs(face.getY(i))>.5?[m.getX(k)/4,m.getZ(k)/4]:Math.abs(face.getX(i))>.5?[m.getZ(k)/4,m.getY(k)/4]:[m.getX(k)/4,m.getY(k)/4]);}
  }
  scene.parts.push({name:mesh.name,vertices,faces,uv,colors,checker:true});
 });
 if(config.id==='forest-driver')hazardScene.group.traverse(mesh=>{
  if(!mesh.isInstancedMesh)return;
  for(let instance=0;instance<mesh.count;instance++){
   const h=hazardSystem.hazards.find(h=>h.id===mesh.userData.hazardIds[instance]);if(!h||Math.hypot(h.x-origin.x,h.z-origin.z)>config.radius)continue;
   const matrix=new THREE.Matrix4();mesh.getMatrixAt(instance,matrix);matrix.premultiply(mesh.matrixWorld);
   const g=mesh.geometry,p=g.attributes.position,col=g.attributes.color,uv=g.attributes.uv,indices=g.index?.array||Array.from({length:p.count},(_,i)=>i),color=mesh.material.color.clone();
   if(mesh.instanceColor){const tint=new THREE.Color();mesh.getColorAt(instance,tint);color.multiply(tint);}
   const vertices=Array.from({length:p.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(matrix).toArray()),faces=[];
   for(let i=0;i<indices.length;i+=3)faces.push(Array.from(indices.slice(i,i+3)));
   scene.parts.push({name:mesh.name+' '+h.id,vertices,faces,uv:uv?Array.from({length:p.count},(_,i)=>[uv.getX(i),uv.getY(i)]):Array.from({length:p.count},()=>[0,0]),colors:Array.from({length:p.count},(_,i)=>col?[col.getX(i)*color.r,col.getY(i)*color.g,col.getZ(i)*color.b]:color.toArray()),checker:!!mesh.material.map});
  }
 });
 out.scenes.push(scene);
}
fs.writeFileSync(new URL('geometry.json',dir),JSON.stringify(out));city.dispose();hazardScene.dispose();console.log(JSON.stringify({scenes:out.scenes.length,facadeTextures:textureId,sourceSHA256:out.sourceSHA256},null,2));
