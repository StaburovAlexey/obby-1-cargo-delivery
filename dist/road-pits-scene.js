import {surfaceHeight,ROAD_SURFACE_OFFSET} from './route-network.js';
import {polygonIndex,subtractFootprints} from './surface-cut.js';

const palettes={city:[0x795f42,0x9b7651,0x514943],forest:[0x554a31,0x80603c,0x44483c],desert:[0xd4a264,0xb6804c,0x79543c],snow:[0xd3dce0,0x8899a6,0x536473],volcanic:[0x65504a,0x4d4042,0x302d36]};
const clamp=t=>Math.max(0,Math.min(1,t));
const baseHeight=(x,z)=>surfaceHeight(x,-z)+ROAD_SURFACE_OFFSET;
const winding=polygon=>Math.sign(polygon.slice(1,-1).reduce((sum,a,i)=>{const b=polygon[i+2],o=polygon[0];return sum+(a.x-o.x)*(b.z-o.z)-(a.z-o.z)*(b.x-o.x);},0));

// Keep the ordered boundary for walls, but decompose concave mouths before
// passing them to the existing convex surface subtractor. Floors reuse exactly
// these triangles, so an inward notch stays solid at every depth.
export function compileRoadPitFootprints(THREE,pits){
 const compiled=new Map();
 for(const pit of pits){
  const p=pit.cutFootprint,sign=winding(p),triangles=THREE.ShapeUtils.triangulateShape(p.map(v=>new THREE.Vector2(v.x,v.z)),[]).map(face=>face.map(i=>p[i]));
  const convex=p.every((a,i)=>{const b=p[(i+1)%p.length],c=p[(i+2)%p.length];return sign*((b.x-a.x)*(c.z-b.z)-(b.z-a.z)*(c.x-b.x))>=-1e-9;});
  compiled.set(pit,{triangles,cutPolygons:convex?[p]:triangles,winding:sign});
 }
 return compiled;
}

function batch(THREE){
 const positions=[],colors=[],indices=[],parts=[],depths=[],middleColors=[],bottomColors=[];const color=new THREE.Color();
 function face(points,hex,normal,strata){
  if(points.length<3)return;
  let vertices=points,reverse=false;
  if(normal){const a=points[0],b=points[1],c=points[2],ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];if((uy*vz-uz*vy)*normal[0]+(uz*vx-ux*vz)*normal[1]+(ux*vy-uy*vx)*normal[2]<0){vertices=points.slice().reverse();reverse=true;}}
  const start=positions.length/3;color.setHex(hex);
  for(const p of vertices){positions.push(...p);colors.push(color.r,color.g,color.b);}
  if(strata){
   depths.push(...(reverse?strata.depths.slice().reverse():strata.depths));
   const middle=new THREE.Color(strata.palette[1]),bottom=new THREE.Color(strata.palette[2]);
   for(const p of vertices){middleColors.push(middle.r,middle.g,middle.b);bottomColors.push(bottom.r,bottom.g,bottom.b);}
  }
  for(let i=1;i<vertices.length-1;i++)indices.push(start,start+i,start+i+1);
 }
 return {face,parts,source(){return {positions:new Float32Array(positions),indices:new Uint32Array(indices)};},part(id,fn){const start=indices.length;fn();parts.push({id,indexStart:start,indexCount:indices.length-start});},mesh(name,material){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();g.userData.parts=parts;
  if(depths.length){g.setAttribute('urPitDepth',new THREE.Float32BufferAttribute(depths,1));g.setAttribute('urPitMiddleColor',new THREE.Float32BufferAttribute(middleColors,3));g.setAttribute('urPitBottomColor',new THREE.Float32BufferAttribute(bottomColors,3));}
  const mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.receiveShadow=true;mesh.castShadow=name==='Road pit walls';mesh.userData.spatialStatic=true;return mesh;
 }};
}

// All geometry is immutable after build. Rock batches share one material,
// and the city owns their ordinary traversal/disposal and spatial partitioning.
export function buildRoadPitMeshes(THREE,pits,{compiled=compileRoadPitFootprints(THREE,pits)}={}){
 const root=new THREE.Group();root.name='Road pits and forward jumps';
 if(!pits.length)return root;
 const walls=batch(THREE),canonicalWalls=batch(THREE),floors=batch(THREE),ramps=batch(THREE),warnings=batch(THREE);
 const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0,flatShading:true});material.name='Road pit biome rock';
 // All depth bands on one wall segment are coplanar. Shade their original
 // .65m and 8m boundaries per fragment and retain the old triangles for physics.
 const wallMaterial=material.clone();wallMaterial.name='Road pit biome strata';
 wallMaterial.customProgramCacheKey=()=> 'road-pit-depth-strata-v1';
 wallMaterial.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
   attribute float urPitDepth; attribute vec3 urPitMiddleColor; attribute vec3 urPitBottomColor;
   varying float vUrPitDepth; varying vec3 vUrPitMiddleColor; varying vec3 vUrPitBottomColor;`)
   .replace('#include <begin_vertex>',`#include <begin_vertex>
    vUrPitDepth=urPitDepth; vUrPitMiddleColor=urPitMiddleColor; vUrPitBottomColor=urPitBottomColor;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
   varying float vUrPitDepth; varying vec3 vUrPitMiddleColor; varying vec3 vUrPitBottomColor;`)
   .replace('#include <color_fragment>','diffuseColor.rgb *= vUrPitDepth < .65 ? vColor.rgb : (vUrPitDepth < 8.0 ? vUrPitMiddleColor : vUrPitBottomColor);');
 };
 // Paint follows graded terrain; depth bias keeps it clear of the underlying
 // road triangles without lifting the border into a visibly floating ribbon.
 const warningMaterial=material.clone();warningMaterial.name='Road pit warning paint';
 warningMaterial.polygonOffset=true;warningMaterial.polygonOffsetFactor=-1;warningMaterial.polygonOffsetUnits=-2;
 const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
 for(const pit of pits){
  const palette=palettes[pit.biome]||palettes.city,p=pit.cutFootprint,outline=compiled.get(pit);
  // The top follows the actual indexed landscape. The lower lip/floor sits
  // exactly twenty metres below that reference, with no 48m cliff extrusion.
  walls.part(pit.id,()=>{for(let edge=0;edge<p.length;edge++){
   const a=p[edge],b=p[(edge+1)%p.length],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/4));
   for(let i=0;i<steps;i++){
    const left=lerp(a,b,i/steps),right=lerp(a,b,(i+1)/steps),ha=baseHeight(left.x,left.z),hb=baseHeight(right.x,right.z),inside=[-(b.z-a.z)*outline.winding,0,(b.x-a.x)*outline.winding];
    walls.face([[left.x,ha,left.z],[right.x,hb,right.z],[right.x,hb-pit.depth,right.z],[left.x,ha-pit.depth,left.z]],palette[0],inside,{depths:[0,0,pit.depth,pit.depth],palette});
    const strata=[0,.65,3,8,pit.depth];
    for(let j=0;j<strata.length-1;j++){const top=strata[j],bottom=strata[j+1],shade=palette[j<1?0:j<3?1:2];canonicalWalls.face([[left.x,ha-top,left.z],[right.x,hb-top,right.z],[right.x,hb-bottom,right.z],[left.x,ha-bottom,left.z]],shade,inside);}
   }
  }});
  floors.part(pit.id,()=>{for(const triangle of outline.triangles)floors.face(triangle.map(v=>[v.x,baseHeight(v.x,v.z)-pit.depth,v.z]),palette[2],[0,1,0]);});
  if(pit.ramp){
   const ramp=pit.ramp,[nearLeft,nearRight,farRight,farLeft]=ramp.footprint,steps=Math.ceil(ramp.length/2),across=Math.ceil((ramp.width||pit.width)/5);
   const point=(s,t)=>{const q=lerp(lerp(nearLeft,farLeft,t),lerp(nearRight,farRight,t),s);return [q.x,baseHeight(q.x,q.z)+ramp.height*t,q.z];};
   ramps.part(pit.id,()=>{
    for(let j=0;j<steps;j++)for(let i=0;i<across;i++)ramps.face([point(i/across,j/steps),point((i+1)/across,j/steps),point((i+1)/across,(j+1)/steps),point(i/across,(j+1)/steps)],0x087d98,[0,1,0]);
    // Two triangular wedge sides and a vertical takeoff lip; no hidden flat
    // support underneath. The removed original road belongs only to the wedge.
    for(const side of [0,1])for(let j=0;j<steps;j++){
     const a=point(side,j/steps),b=point(side,(j+1)/steps),out=[(side?1:-1)*Math.cos(pit.heading),0,(side?-1:1)*Math.sin(pit.heading)];
     const points=[[a[0],baseHeight(a[0],a[2]),a[2]],[b[0],baseHeight(b[0],b[2]),b[2]],b];if(j)points.push(a);ramps.face(points,palette[1],out);
    }
    const a=point(0,1),b=point(1,1);ramps.face([a,b,[b[0],baseHeight(b[0],b[2]),b[2]],[a[0],baseHeight(a[0],a[2]),a[2]]],palette[1],[-Math.sin(pit.heading),0,-Math.cos(pit.heading)]);
   });
  }
  warnings.part(pit.id,()=>{
   if(pit.ramp){
    const ramp=pit.ramp,[nl,nr,fr,fl]=ramp.footprint,steps=Math.ceil(ramp.length/2);
    const top=(s,t)=>{const q=lerp(lerp(nl,fl,t),lerp(nr,fr,t),s);return[q.x,baseHeight(q.x,q.z)+ramp.height*t+.026,q.z];};
    for(let j=0;j<steps;j++){
     for(const [left,right] of [[0,.018],[.982,1]])warnings.face([top(left,j/steps),top(right,j/steps),top(right,(j+1)/steps),top(left,(j+1)/steps)],0xffcf27,[0,1,0]);

    }
    // Large uphill arrows make the pad read as a speed booster at a glance.
    for(const t of [.12,.34,.56,.78]){
     const arrow=[[.37,t],[.63,t],[.63,t+.07],[.87,t+.07],[.5,t+.18],[.13,t+.07],[.37,t+.07]].map(([s,u])=>new THREE.Vector2(s,u));
     for(const triangle of THREE.ShapeUtils.triangulateShape(arrow,[]))warnings.face(triangle.map(i=>top(arrow[i].x,arrow[i].y)),0xffe642,[0,1,0]);
    }
   }
   // Follow the actual broken outline. Clip every outside strip against the
   // same mouth triangles so paint cannot float over a re-entrant corner.
   if(!pit.ramp){
    const painted=[],holes=polygonIndex(outline.cutPolygons);
    for(let edge=0;edge<p.length;edge++){
     const a=p[edge],b=p[(edge+1)%p.length],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),steps=Math.ceil(length/1.5);
     if(length<1e-8)continue;
     const outward={x:dz/length*outline.winding,z:-dx/length*outline.winding};
     for(let i=0;i<steps;i++){
      const left=lerp(a,b,i/steps),right=lerp(a,b,(i+1)/steps),at=(v,d)=>({x:v.x+outward.x*d,z:v.z+outward.z*d});
      const strip=[at(left,.12),at(right,.12),at(right,.5),at(left,.5)];
      // A concave corner can make adjacent outward strips intersect.
      // Give each patch its own area instead of stacking coplanar colors.
      const occupied=polygonIndex(painted),patches=[];
      for(const polygon of subtractFootprints(strip,holes))for(const patch of subtractFootprints(polygon,occupied)){
       warnings.face(patch.map(v=>[v.x,baseHeight(v.x,v.z)+.026,v.z]),i%2?0x24222a:0xffcf27,[0,1,0]);patches.push(patch);
      }
      painted.push(...patches);
     }
    }
   }

  });
 }
 for(const [builder,name] of [[walls,'Road pit walls'],[floors,'Road pit floors'],[ramps,'Road jump ramps'],[warnings,'Road pit warnings']]){
  const mesh=builder.mesh(name,builder===warnings?warningMaterial:builder===walls?wallMaterial:material);
  if(builder===walls)mesh.userData.physicsGeometry=canonicalWalls.source();
  root.add(mesh);
 }
 return root;
}
