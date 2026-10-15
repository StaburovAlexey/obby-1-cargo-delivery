




import { queryRoadSurface, ROAD_SURFACE_OFFSET, ROAD_MESH } from './route-network.js';
import { groundHeight as roadGroundHeight } from './city-driving.js';
import { useGrassCheckerTexture } from './square-stud-texture.js';

export const ROAD_HAZARD_VISUALS = Object.freeze({
  surfaceNormalOffset: .022,
  solidInset: .006,
  patchStep: 1.6,
  patchEdgeBlend: 2.5,
  warningBorderFraction: .085,
  warningPulseHz: 2,
  maximumHazards: 112,
  maximumRocks: 24,
  sharedTexture: 'Original grass checker',
});
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

function geometry(THREE, positions, colors, uv, indices) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colors?.length) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  if (uv?.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (indices?.length) g.setIndex(indices);
  g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}


function repairGeometry(THREE) {
  const p = [], colors = [], uv = [];
  const yellow = new THREE.Color(0xffd42b), black = new THREE.Color(0x282832);
  const polygon = (points, map, color) => {
    for (let i = 1; i < points.length - 1; i++) for (const q of [points[0], points[i], points[i + 1]]) {
      p.push(...map(q[0], q[1])); colors.push(color.r, color.g, color.b); uv.push(q[0] * 1.3, q[1] * .35);
    }
  };
  const clip = (points, boundary, keepGreater) => {
    const out = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const da = a[0] - a[1] * .36 - boundary, db = b[0] - b[1] * .36 - boundary;
      const insideA = keepGreater ? da >= -1e-10 : da <= 1e-10;
      const insideB = keepGreater ? db >= -1e-10 : db <= 1e-10;
      if (insideA) out.push(a);
      if (insideA !== insideB) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    return out;
  };
  const rectangle = (a, b) => [[0, a], [1, a], [1, b], [0, b]];
  for (const map of [
    (u,v) => [u-.5,v,.5], (u,v) => [.5-u,v,-.5],
    (u,v) => [.5,v,.5-u], (u,v) => [-.5,v,u-.5],
  ]) {
    polygon(rectangle(0,.2), map, yellow); polygon(rectangle(.75,1), map, yellow);
    for (let i = -3; i < 7; i++) polygon(clip(clip(rectangle(.2,.75), i*.18, true), (i+1)*.18, false), map, i%2 ? yellow : black);
  }
  polygon(rectangle(0,1), (u,v) => [u-.5,1,.5-v], yellow);
  polygon(rectangle(0,1), (u,v) => [u-.5,0,v-.5], yellow);
  return geometry(THREE,p,colors,uv);
}
function rockGeometry(THREE) {
  const ring = [[-.32,-.5],[.32,-.5],[.5,-.32],[.5,.32],[.32,.5],[-.32,.5],[-.5,.32],[-.5,-.32]];
  const p=[], colors=[];
  const tri = (a,b,c,shade) => { for (const v of [a,c,b]) {p.push(...v);colors.push(shade,shade,shade);} };
  const bottom=ring.map(([x,z])=>[x,0,z]), middle=ring.map(([x,z],i)=>[x,.46+(i%3)*.06,z]);
  const top=ring.map(([x,z],i)=>[x*.64,.83+(i%3)*.065,z*.64]);
  for(let i=0;i<8;i++) {
    const j=(i+1)%8;
    tri(bottom[i],bottom[j],middle[j],.64+(i%3)*.10);tri(bottom[i],middle[j],middle[i],.64+(i%3)*.10);
    tri(middle[i],middle[j],top[j],.82+(i%2)*.12);tri(middle[i],top[j],top[i],.82+(i%2)*.12);
    tri(top[i],top[j],[.035,1,-.025],.86+(i%3)*.055);
    tri(bottom[j],bottom[i],[0,0,0],.62);
  }
  return geometry(THREE,p,colors);
}
function groundFrame(THREE, h, groundHeight) {
  const c=Math.cos(h.heading),s=Math.sin(h.heading),e=.25;
  const point=(lx,lz)=>({x:h.x+c*lx+s*lz,z:h.z-s*lx+c*lz});
  const sample=(lx,lz)=>{const q=point(lx,lz);return groundHeight(q.x,q.z);};
  const dx=(sample(e,0)-sample(-e,0))/(2*e),dz=(sample(0,e)-sample(0,-e))/(2*e);
  let base=sample(0,0);


  for(let i=0;i<=6;i++)for(let j=0;j<=6;j++) {
    const x=(i/6-.5)*h.width,z=(j/6-.5)*h.length;
    base=Math.min(base,sample(x,z)-dx*x-dz*z);
  }
  const matrix=new THREE.Matrix4().set(c,0,s,h.x, dx,1,dz,base-ROAD_HAZARD_VISUALS.solidInset, -s,0,c,h.z, 0,0,0,1);
  return {matrix,point,sample,dx,dz,base};
}
function patchGroundHeight(groundHeight,x,z,h) {
  if(groundHeight===roadGroundHeight) {
    const ground=queryRoadSurface(x,z,h);
    return ground.height+ROAD_SURFACE_OFFSET+ROAD_HAZARD_VISUALS.surfaceNormalOffset/ground.normal.y;
  }
  const e=.1,gx=(groundHeight(x+e,z,h)-groundHeight(x-e,z,h))/(2*e),gz=(groundHeight(x,z+e,h)-groundHeight(x,z-e,h))/(2*e);
  return groundHeight(x,z,h)+ROAD_HAZARD_VISUALS.surfaceNormalOffset*Math.hypot(gx,1,gz);
}





function patchGroundSampler(h,groundHeight) {
  if(groundHeight!==roadGroundHeight)return (x,z)=>patchGroundHeight(groundHeight,x,z,h);
  const heading=h.roadHeading??h.heading,c=Math.cos(heading),s=Math.sin(heading),radius=Math.hypot(h.width,h.length)/2+.01;
  const a=(h.motion?.minOffset??h.offset)-h.offset,b=(h.motion?.maxOffset??h.offset)-h.offset;
  const minX=Math.min(h.x+c*a,h.x+c*b)-radius,maxX=Math.max(h.x+c*a,h.x+c*b)+radius;
  const minZ=Math.min(h.z-s*a,h.z-s*b)-radius,maxZ=Math.max(h.z-s*a,h.z-s*b)+radius;
  const triangles=[],p=ROAD_MESH.positions,indices=ROAD_MESH.indices;
  for(let i=0;i<indices.length;i+=3) {
    const ia=indices[i]*3,ib=indices[i+1]*3,ic=indices[i+2]*3;
    const ax=p[ia],ay=p[ia+1],az=p[ia+2],bx=p[ib],by=p[ib+1],bz=p[ib+2],cx=p[ic],cy=p[ic+1],cz=p[ic+2];
    if(Math.max(ax,bx,cx)<minX||Math.min(ax,bx,cx)>maxX||Math.max(az,bz,cz)<minZ||Math.min(az,bz,cz)>maxZ)continue;
    const area=(bx-ax)*(cz-az)-(bz-az)*(cx-ax);if(Math.abs(area)<1e-12)continue;
    const gx=((by-ay)*(cz-az)-(cy-ay)*(bz-az))/area,gz=((bx-ax)*(cy-ay)-(cx-ax)*(by-ay))/area;
    triangles.push({ax,ay,az,bx,by,bz,cx,cy,cz,area,lift:ROAD_SURFACE_OFFSET+ROAD_HAZARD_VISUALS.surfaceNormalOffset*Math.hypot(gx,1,gz)});
  }
  return (x,z)=>{
    for(const t of triangles) {
      const u=((t.bx-x)*(t.cz-z)-(t.bz-z)*(t.cx-x))/t.area,v=((t.cx-x)*(t.az-z)-(t.cz-z)*(t.ax-x))/t.area,w=1-u-v;
      if(u>=-1e-8&&v>=-1e-8&&w>=-1e-8)return u*t.ay+v*t.by+w*t.cy+t.lift;
    }
    return patchGroundHeight(groundHeight,x,z,h);
  };
}
function patchGeometry(THREE, hazards, groundHeight, kind) {
  const p=[],colors=[],uv=[],indices=[],records=[];
  const low=new THREE.Color(kind==='ice'?0x50bddb:0xdca744),high=new THREE.Color(kind==='ice'?0xd6fbff:0xffdb75);
  const color=new THREE.Color();
  for(const h of hazards) {
    const start=p.length/3, nx=Math.max(2,Math.ceil(h.width/ROAD_HAZARD_VISUALS.patchStep)),nz=Math.max(4,Math.ceil(h.length/ROAD_HAZARD_VISUALS.patchStep));
    const local=new Float64Array((nx+1)*(nz+1)*3),sampleGround=patchGroundSampler(h,groundHeight);
    const c=Math.cos(h.heading),s=Math.sin(h.heading);
    for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++) {
      const lx=(i/nx-.5)*h.width,lz=(j/nz-.5)*h.length;
      const x=h.x+c*lx+s*lz,z=h.z-s*lx+c*lz;


      const base=sampleGround(x,z);
      const edge=Math.min(h.width/2-Math.abs(lx),h.length/2-Math.abs(lz));
      const blend=smooth(edge/ROAD_HAZARD_VISUALS.patchEdgeBlend);
      const crest=.64+.36*Math.cos(lz/h.length*Math.PI*3+.28*lx);
      const lift=kind==='dune'?h.height*(blend*crest):0;
      const streak=kind==='ice'?(Math.abs(Math.sin(lz*.38+lx*.72))<.24?.95:.23+.38*blend):.25+.6*blend*crest;
      color.copy(low).lerp(high,streak);
      p.push(x,base+lift,z);colors.push(color.r,color.g,color.b);uv.push(x/4,-z/4);
      const k=(j*(nx+1)+i)*3;local[k]=lx;local[k+1]=kind==='dune'?blend*crest:0;local[k+2]=lz;
      if(i<nx&&j<nz) {const a=start+j*(nx+1)+i;indices.push(a,a+nx+1,a+1,a+1,a+nx+1,a+nx+2);}
    }
    records.push({id:h.id,type:kind,start,count:(nx+1)*(nz+1),nx,nz,local,sampleGround,moving:!!h.motion,footprint:{x:h.x,z:h.z,heading:h.heading,width:h.width,length:h.length,height:h.height}});
  }
  const g=geometry(THREE,p,colors,uv,indices);g.userData.hazards=records;g.userData.surfaceNormalOffset=ROAD_HAZARD_VISUALS.surfaceNormalOffset;
  for(const key of ['position','normal','uv'])g.attributes[key].setUsage(THREE.DynamicDrawUsage);
  return g;
}





function updatePatchGeometry(g, poseFor) {
  let changed=false;
  const positions=g.attributes.position,uv=g.attributes.uv;
  for(const record of g.userData.hazards) {
    if(!record.moving)continue;
    const h=poseFor(record),footprint=record.footprint;
    if(h.x===footprint.x&&h.z===footprint.z&&h.heading===footprint.heading&&h.height===footprint.height)continue;
    const c=Math.cos(h.heading),s=Math.sin(h.heading);
    for(let i=0;i<record.count;i++) {
      const k=i*3,lx=record.local[k],lz=record.local[k+2];
      const x=h.x+c*lx+s*lz,z=h.z-s*lx+c*lz;
      positions.setXYZ(record.start+i,x,record.sampleGround(x,z)+h.height*record.local[k+1],z);
      uv.setXY(record.start+i,x/4,-z/4);
    }
    footprint.x=h.x;footprint.z=h.z;footprint.heading=h.heading;footprint.height=h.height;changed=true;
  }
  if(changed) {
    positions.needsUpdate=true;uv.needsUpdate=true;
    g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
  }
}
function warningGeometry(THREE, border) {
  const outer=.5,inner=.5-ROAD_HAZARD_VISUALS.warningBorderFraction,p=[],index=[];
  const ring=border?[outer,inner]:[inner];
  for(const r of ring)for(const [x,z] of [[-r,-r],[-r,r],[r,r],[r,-r]])p.push(x,0,z);
  if(border)for(let i=0;i<4;i++){const j=(i+1)%4;index.push(i,j,i+4,j,j+4,i+4);}
  else index.push(0,1,2,0,2,3);
  return geometry(THREE,p,null,null,index);
}

export function createRoadHazardsScene(THREE, { system, groundHeight=roadGroundHeight }={}) {
  if(!system||!Array.isArray(system.hazards)||!Array.isArray(system.rocks))throw new TypeError('A road-hazard system with hazards and rocks is required');
  if(system.hazards.length>ROAD_HAZARD_VISUALS.maximumHazards||system.rocks.length>ROAD_HAZARD_VISUALS.maximumRocks)throw new RangeError('Road hazard pool capacity exceeded');
  const group=new THREE.Group();group.name='Low-poly road hazards';
  const geometries=new Set(),materials=new Set(),meshes=[],movingInstances=[],movingPatches=[],matrix=new THREE.Matrix4(),scale=new THREE.Matrix4(),frame=new THREE.Matrix4(),capTransform=new THREE.Matrix4();
  const frames=new Map(system.hazards.map(h=>[h.id,groundFrame(THREE,h,groundHeight)]));
  const descriptorById=new Map(system.hazards.map(h=>[h.id,h]));
  const byType=type=>system.hazards.filter(h=>h.type===type);
  const poseFor=h=>system.poseFor?.(h.id)||descriptorById.get(h.id)||h;
  const material=(name,options)=>{const m=new THREE.MeshStandardMaterial(options);m.name=name;materials.add(m);return m;};
  const paint=material('Yellow LEGO repair paint · no raised studs',{color:0xffffff,roughness:.63,vertexColors:true});paint.map=useGrassCheckerTexture(THREE,paint);
  const bark=material('Faceted warm brown logs',{color:0x95602e,roughness:.94});
  const endgrain=material('Pale cut log ends',{color:0xe7b969,roughness:.9});
  const darkRock=material('Faceted basalt rock',{color:0x5c5368,roughness:.89,vertexColors:true});
  const barrierPaint=material('Biome repair barriers',{color:0xffffff,roughness:.7,vertexColors:true});
  const boulderPaint=material('Biome low-poly stones',{color:0xffffff,roughness:.9,vertexColors:true});
  const sand=material('Localized golden sand',{color:0xffffff,roughness:.95,vertexColors:true});sand.map=useGrassCheckerTexture(THREE,sand);
  const ice=material('Localized clear cyan ice',{color:0xffffff,roughness:.16,metalness:.12,vertexColors:true});
  for(const m of [sand,ice]){m.polygonOffset=true;m.polygonOffsetFactor=-1;m.polygonOffsetUnits=-1;}
  const instanced=(name,g,m,capacity)=>{
    geometries.add(g);const mesh=new THREE.InstancedMesh(g,m,Math.max(1,capacity));mesh.name=name;mesh.count=0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.castShadow=name!=='Rock impact shadow'&&name!=='Rock warning perimeter';mesh.receiveShadow=true;


    mesh.frustumCulled=false;mesh.userData.capacity=capacity;mesh.userData.hazardIds=[];group.add(mesh);meshes.push(mesh);return mesh;
  };
  const staticInstances=(mesh,items,dimensions,offsetY=0)=>{
    items.forEach((h,i)=>{matrix.copy(frames.get(h.id).matrix);matrix.elements[13]+=offsetY;scale.makeScale(...dimensions(h));matrix.multiply(scale);mesh.setMatrixAt(i,matrix);mesh.userData.hazardIds.push(h.id);if(h.motion)movingInstances.push({mesh,index:i,h});});
    mesh.count=items.length;mesh.instanceMatrix.needsUpdate=true;
  };
  const repair=instanced('Yellow black repair blocks',repairGeometry(THREE),paint,byType('repair').length);
  staticInstances(repair,byType('repair'),h=>[h.width,h.height,h.length]);
  const logBodyGeometry=new THREE.CylinderGeometry(.5,.5,1,12,1,true);logBodyGeometry.rotateZ(Math.PI/2);logBodyGeometry.translate(0,.5,0);
  const logs=instanced('Forest log bodies',logBodyGeometry,bark,byType('log').length);
  staticInstances(logs,byType('log'),h=>[h.width,h.height,h.length]);
  const capGeometry=new THREE.CircleGeometry(.5,12);capGeometry.rotateY(Math.PI/2);capGeometry.translate(0,.5,0);
  const caps=instanced('Forest cut log ends',capGeometry,endgrain,byType('log').length*2);
  let capIndex=0;
  for(const h of byType('log'))for(const side of [-1,1]){
    matrix.copy(frames.get(h.id).matrix).multiply(new THREE.Matrix4().makeTranslation(side*h.width*.5,0,0)).multiply(new THREE.Matrix4().makeRotationY(side<0?Math.PI:0)).multiply(new THREE.Matrix4().makeScale(1,h.height,h.length));
    caps.setMatrixAt(capIndex++,matrix);caps.userData.hazardIds.push(h.id);
  }
  caps.count=capIndex;caps.instanceMatrix.needsUpdate=true;
  for(const record of movingInstances)if(record.mesh===logs)record.capIndex=record.index*2;
  for(const [type,m] of [['dune',sand],['ice',ice]]) {
    const g=patchGeometry(THREE,byType(type),groundHeight,type);geometries.add(g);
    const mesh=new THREE.Mesh(g,m);mesh.name=type==='dune'?'Road-conforming sand dunes':'Road-conforming clear ice';mesh.receiveShadow=true;mesh.userData.hazardIds=byType(type).map(h=>h.id);group.add(mesh);meshes.push(mesh);
    if(g.userData.hazards.some(h=>h.moving))movingPatches.push(g);
  }
  const rockDescriptors=byType('rock'),rocks=instanced('Volcanic sliding basalt rocks',rockGeometry(THREE),darkRock,rockDescriptors.length);
  staticInstances(rocks,rockDescriptors,h=>[h.width,h.height,h.length]);


  const barrier=instanced('Biome sliding and fixed barriers',repairGeometry(THREE),barrierPaint,byType('barrier').length);
  const boulders=instanced('Biome sliding and fixed boulders',rockGeometry(THREE),boulderPaint,byType('boulder').length);
  const palette={city:0xffffff,forest:0xa79c78,desert:0xe4b36e,snow:0xa8e6f8,volcanic:0x8e6975};
  for(const [mesh,type] of [[barrier,'barrier'],[boulders,'boulder']]) {
    const items=byType(type);
    staticInstances(mesh,items,h=>[h.width,h.height,h.length]);
    items.forEach((h,index)=>{mesh.setColorAt(index,new THREE.Color(palette[h.biome]));});
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  }



  function setMovingInstance({mesh,index,h,capIndex}) {
    const p=poseFor(h),c=Math.cos(p.heading),s=Math.sin(p.heading),e=.25;
    const sample=(x,z)=>groundHeight(p.x+c*x+s*z,p.z-s*x+c*z,p);
    const sharedGround=groundHeight===roadGroundHeight&&Number.isFinite(p.groundGradientX)&&Number.isFinite(p.groundGradientZ);
    const dx=sharedGround?c*p.groundGradientX-s*p.groundGradientZ:(sample(e,0)-sample(-e,0))/(2*e);
    const dz=sharedGround?s*p.groundGradientX+c*p.groundGradientZ:(sample(0,e)-sample(0,-e))/(2*e);
    let base=sharedGround?p.groundHeight+ROAD_SURFACE_OFFSET:sample(0,0);
    for(const x of [-p.width/2,p.width/2])for(const z of [-p.length/2,p.length/2])base=Math.min(base,sample(x,z)-dx*x-dz*z);
    frame.set(c,0,s,p.x,dx,1,dz,base-ROAD_HAZARD_VISUALS.solidInset,-s,0,c,p.z,0,0,0,1);
    scale.makeScale(p.width,p.height,p.length);matrix.copy(frame).multiply(scale);mesh.setMatrixAt(index,matrix);mesh.instanceMatrix.needsUpdate=true;
    if(capIndex!==undefined)for(let i=0;i<2;i++) {
      const side=i?1:-1;
      matrix.copy(frame).multiply(capTransform.makeTranslation(side*p.width*.5,0,0)).multiply(capTransform.makeRotationY(side<0?Math.PI:0)).multiply(scale.makeScale(1,p.height,p.length));
      caps.setMatrixAt(capIndex+i,matrix);caps.instanceMatrix.needsUpdate=true;
    }
  }
  const stats={hazards:system.hazards.length,movers:system.hazards.filter(h=>h.motion).length,rockCapacity:rockDescriptors.length,instancedMeshes:6,mergedMeshes:2,materials:materials.size,geometries:geometries.size,sharedTextures:1,drawCalls:0,triangles:0,activeInstances:0,visibleRocks:rocks.count,visibleWarnings:0,disposed:false,phases:{landed:rocks.count}};
  let disposed=false;
  function tally(){stats.drawCalls=stats.triangles=stats.activeInstances=0;for(const mesh of meshes){const n=mesh.isInstancedMesh?mesh.count:1;if(!n||!mesh.visible)continue;stats.drawCalls++;stats.triangles+=(mesh.geometry.index?.count||mesh.geometry.attributes.position.count)/3*n;if(mesh.isInstancedMesh)stats.activeInstances+=n;}}
  function update(){if(disposed)return;for(const record of movingInstances)setMovingInstance(record);for(const g of movingPatches)updatePatchGeometry(g,poseFor);tally();}
  function clear() {
    if(disposed)return;
    for(const mesh of meshes)if(mesh.isInstancedMesh)mesh.count=0;else mesh.visible=false;
    stats.visibleRocks=stats.visibleWarnings=0;tally();
  }
  function dispose() {
    if(disposed)return;clear();disposed=true;stats.disposed=true;
    for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
    group.removeFromParent();group.clear();
  }
  group.userData.roadHazards={procedural:true,sharedTexture:true,raisedStudGeometry:false,maximumHazards:ROAD_HAZARD_VISUALS.maximumHazards};
  update(0);
  return {group,update,dispose,stats};
}
