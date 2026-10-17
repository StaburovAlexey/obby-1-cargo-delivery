


import {canyonApproachQuads} from './canyon-approach.js';
const canyonClearance=canyonApproachQuads(3);
import * as NETWORK from './route-network.js';
import {NETWORK_CONFIG} from './route-network-config.js';
import {BRIDGES} from './road-bridges.js';
import {createBrickPlasticMaterial,createEnvironmentMaterial} from './building-material.js';
import {createGroundMaterial} from './ground-material.js';
import {createPaintedRoadMaterial,applyRoadSurfaceShader} from './road-material.js';

const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
const signedArea=p=>p.reduce((n,a,i)=>{const b=p[(i+1)%p.length];return n+a.x*b.z-a.z*b.x;},0)/2;
export function polygonIntersectionArea(subject,clip){
  let out=subject.map(p=>({...p}));
  if(signedArea(clip)<0)clip=clip.slice().reverse();
  for(let i=0;i<clip.length&&out.length;i++){
    const a=clip[i],b=clip[(i+1)%clip.length],input=out;out=[];
    for(let j=0;j<input.length;j++){
      const p=input[j],q=input[(j+1)%input.length],dp=cross(a,b,p),dq=cross(a,b,q);
      if(dp>=-1e-10)out.push(p);
      if((dp>=-1e-10)!==(dq>=-1e-10)){const t=dp/(dp-dq);out.push({x:p.x+(q.x-p.x)*t,z:p.z+(q.z-p.z)*t});}
    }
  }
  return out.length>2?Math.abs(signedArea(out)):0;
}
function boundsOf(points){return {minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z))};}


export function createRoadFootprintIndex(data,cellSize=32){
  const cells=new Map(),triangles=[];
  const visit=(b,fn)=>{for(let x=Math.floor(b.minX/cellSize);x<=Math.floor(b.maxX/cellSize);x++)for(let z=Math.floor(b.minZ/cellSize);z<=Math.floor(b.maxZ/cellSize);z++)fn(`${x},${z}`);};
  for(let i=0;i<data.indices.length;i+=3){
    const p=[0,1,2].map(j=>{const k=data.indices[i+j]*3;return {x:data.positions[k],z:data.positions[k+2]};});
    const id=triangles.length,b=boundsOf(p);triangles.push({p,b,id});
    visit(b,key=>{if(!cells.has(key))cells.set(key,[]);cells.get(key).push(id);});
  }
  return {triangles,candidates(p){const ids=new Set();visit(boundsOf(p),key=>{for(const id of cells.get(key)||[])ids.add(id);});return [...ids].map(i=>triangles[i]);},
    intersects(p,tolerance=1e-6){return this.candidates(p).some(t=>polygonIntersectionArea(p,t.p)>tolerance);}};
}




export function clipBridgeSurfaces(data,{terrain=false,bridges=BRIDGES,onlyBridges=false,edgeStrips=false}={}){
  const n=data.positions.length/3,keys=Object.keys(data).filter(k=>k!=='indices'&&(Array.isArray(data[k])||ArrayBuffer.isView(data[k]))&&data[k].length%n===0),sizes=Object.fromEntries(keys.map(k=>[k,data[k].length/n]));
  const out=Object.fromEntries(keys.map(k=>[k,[]]));out.indices=[];
  const vertex=i=>Object.fromEntries(keys.map(k=>[k,Array.from(data[k].slice(i*sizes[k],(i+1)*sizes[k]))]));
  function clip(poly,key,bound,sign){
    const result=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],da=sign*(a[key][0]-bound),db=sign*(b[key][0]-bound);
      if(da>=0)result.push(a);
      if((da>=0)!==(db>=0)){
        const t=da/(da-db),p=Object.fromEntries(keys.map(k=>[k,a[k].map((v,j)=>v+(b[k][j]-v)*t)]));p[key][0]=bound;result.push(p);
      }
    }
    return result;
  }
  function emit(poly){
    if(poly.length<3)return;
    for(let i=1;i<poly.length-1;i++){
      const tri=[poly[0],poly[i],poly[i+1]],p=tri.map(v=>v.positions);
      if(Math.abs((p[1][0]-p[0][0])*(p[2][2]-p[0][2])-(p[1][2]-p[0][2])*(p[2][0]-p[0][0]))<1e-10)continue;
      for(const v of tri){out.indices.push(out.positions.length/3);for(const k of keys)out[k].push(...v[k]);}
    }
  }
  for(let i=0;i<data.indices.length;i+=3){
    const tri=[0,1,2].map(j=>vertex(data.indices[i+j])),lo=Math.min(...tri.map(v=>v.progress[0])),hi=Math.max(...tri.map(v=>v.progress[0]));
    let remaining=tri;
    for(const b of bridges){
      if(b.to<=lo||b.from>=hi)continue;
      if(!onlyBridges)emit(clip(remaining,'progress',b.from,-1));
      let span=clip(clip(remaining,'progress',b.from,1),'progress',b.to,-1);
      if(!terrain){span=clip(clip(span,'across',b.offset-b.halfWidth,1),'across',b.offset+b.halfWidth,-1);
        if(edgeStrips){emit(clip(span,'across',b.offset-b.halfWidth+.15,-1));emit(clip(span,'across',b.offset+b.halfWidth-.15,1));}else emit(span);}
      remaining=clip(remaining,'progress',b.to,1);
    }
    if(!onlyBridges)emit(remaining);
  }
  return out;
}



function bridgeUnderdeck(THREE,data){
  const positions=[],indices=[],edges=new Map(),depth=.85;
  const point=i=>data.positions.slice(i*3,i*3+3),key=p=>p.map(v=>v.toFixed(7)).join(',');
  function face(points){const base=positions.length/3;for(const p of points)positions.push(...p);for(let i=1;i<points.length-1;i++)indices.push(base,base+i,base+i+1);}
  for(let i=0;i<data.indices.length;i+=3){
    const tri=[0,1,2].map(j=>point(data.indices[i+j]));
    face(tri.slice().reverse().map(p=>[p[0],p[1]+NETWORK.ROAD_SURFACE_OFFSET-depth,p[2]]));
    for(let j=0;j<3;j++){const a=tri[j],b=tri[(j+1)%3],ka=key(a),kb=key(b),k=ka<kb?ka+'|'+kb:kb+'|'+ka;if(edges.has(k))edges.delete(k);else edges.set(k,[a,b]);}
  }
  for(const [a,b] of edges.values()){
    const top=p=>[p[0],p[1]+NETWORK.ROAD_SURFACE_OFFSET,p[2]],bottom=p=>[p[0],p[1]+NETWORK.ROAD_SURFACE_OFFSET-depth,p[2]];
    face([top(b),top(a),bottom(a),bottom(b)]);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(positions.flatMap((v,i)=>i%3===0?[v/4,-positions[i+2]/4]:[]),2));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
  const mesh=new THREE.Mesh(g,createEnvironmentMaterial(THREE,0xe1af42));mesh.name='Single-car bridge underdecks';mesh.castShadow=true;mesh.receiveShadow=true;return mesh;
}





function prismMaterial(THREE,shops){
  const material=shops?createBrickPlasticMaterial(THREE):createEnvironmentMaterial(THREE);
  material.vertexColors=true;
  const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.customProgramCacheKey=()=>key+'-merged-metric-prisms';
  material.userData.mergedMetricPrisms=true;
  material.onBeforeCompile=shader=>{
    compile.call(material,shader);
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      attribute vec3 urPrismMeters; attribute vec3 urPrismSize; attribute vec3 urPrismFace;`)
      .replace('vec3 urSize = vec3(length(urObjectMatrix[0].xyz), length(urObjectMatrix[1].xyz), length(urObjectMatrix[2].xyz));','vec3 urSize = urPrismSize;')
      .replace('vec3 urMeters = (position + vec3(0.5)) * urSize;','vec3 urMeters = urPrismMeters;')
      .replace('vec3 urFace = abs(normal);','vec3 urFace = abs(urPrismFace);')
      .replace('(urFace.x > urFace.z && normal.x > 0.0) || (urFace.x <= urFace.z && normal.z < 0.0)',
        '(urFace.x > urFace.z && urPrismFace.x > 0.0) || (urFace.x <= urFace.z && urPrismFace.z < 0.0)');
  };
  return material;
}
function prismBatch(THREE){
  const arrays={position:[],normal:[],color:[],urPrismMeters:[],urPrismSize:[],urPrismFace:[],urShopData:[],uv:[]},indices=[],ranges=[];
  function add(name,footprint,bottom,top,color,shopBase=0,shopId=0){

    const p=footprint,v=p.map(q=>[q.x,bottom,q.z]).concat(p.map(q=>[q.x,top,q.z]));
    const start=arrays.position.length/3,faceStart=indices.length;
    const center=new THREE.Vector3(p.reduce((n,q)=>n+q.x,0)/4,(bottom+top)/2,p.reduce((n,q)=>n+q.z,0)/4),h=top-bottom;
    const faces=[{ids:[0,3,7,4],kind:'front',axis:[-1,0,0]}, {ids:[1,5,6,2],kind:'back',axis:[1,0,0]},
      {ids:[0,4,5,1],kind:'start',axis:[0,0,1]}, {ids:[3,2,6,7],kind:'end',axis:[0,0,-1]},
      {ids:[4,7,6,5],kind:'roof',axis:[0,1,0]}, {ids:[0,1,2,3],kind:'floor',axis:[0,-1,0]}];
    for(const f of faces){
      let ids=f.ids.slice();const points=ids.map(i=>new THREE.Vector3(...v[i]));
      let n=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
      const fc=points.reduce((o,q)=>o.add(q),new THREE.Vector3()).multiplyScalar(.25);
      if(n.dot(fc.sub(center))<0){ids.reverse();n.negate();}
      const base=arrays.position.length/3;
      const edge=f.kind==='front'?[p[0],p[3]]:f.kind==='back'?[p[1],p[2]]:f.kind==='start'?[p[0],p[1]]:[p[3],p[2]];
      const dx=edge[1].x-edge[0].x,dz=edge[1].z-edge[0].z,length=Math.hypot(dx,dz),isSide=f.kind==='front'||f.kind==='back';
      for(const id of ids){
        const point=v[id],height=point[1]-bottom,s=((point[0]-edge[0].x)*dx+(point[2]-edge[0].z)*dz)/length;
        const roof=f.kind==='roof'||f.kind==='floor';
        const meter=roof?[point[0],height,-point[2]]:isSide?[f.kind==='front'?0:7.5,height,s]:[s,height,0];
        const size=roof?[1,h,1]:isSide?[7.5,h,length]:[length,h,18];
        arrays.position.push(...point);arrays.normal.push(n.x,n.y,n.z);arrays.color.push(color.r,color.g,color.b);
        arrays.urPrismMeters.push(...meter);arrays.urPrismSize.push(...size);arrays.urPrismFace.push(...f.axis);
        arrays.urShopData.push(shopBase,shopId);arrays.uv.push(s/4,height/4);
      }
      indices.push(base,base+1,base+2,base,base+2,base+3);
    }
    ranges.push({name,start,count:24,indexStart:faceStart,indexCount:36});
  }
  return {add,ranges,build(){
    const g=new THREE.BufferGeometry();for(const [name,a] of Object.entries(arrays))g.setAttribute(name,new THREE.Float32BufferAttribute(a,name==='urShopData'||name==='uv'?2:3));g.setIndex(indices);g.computeBoundingBox();g.computeBoundingSphere();g.userData.parts=ranges;return g;
  }};
}

export function buildCity(THREE,{seed=42}={}){
  const {ROAD_MESH,GROUND_MESH,NETWORK_EDGES,NETWORK_NODES,BIOMES,ROUTE_LENGTH,ROUTE}=NETWORK;
  const root=new THREE.Group();root.name='Urban Route • five long curved biomes and rejoining forks';
  const features=[],groups={},roadIndex=createRoadFootprintIndex(ROAD_MESH);
  let state=seed>>>0||1;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const group=name=>groups[name]||(groups[name]=Object.assign(new THREE.Group(),{name}));
  const groundColor=q=>{
    let color=new THREE.Color(BIOMES[0].color);
    for(let i=1;i<BIOMES.length;i++){const t=Math.max(0,Math.min(1,(q-BIOMES[i].from+12)/24));color.lerp(new THREE.Color(BIOMES[i].color),t*t*(3-2*t));}
    return color;
  };
  function surface(name,data,material,terrain=false){
    const positions=data.positions.map((n,i)=>n+(i%3===1?NETWORK.ROAD_SURFACE_OFFSET:0));
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(data.indices);
    const n=data.positions.length/3,uv=[],colors=[];
    for(let i=0;i<n;i++){uv.push(data.positions[i*3]/4,-data.positions[i*3+2]/4);if(terrain){const c=groundColor(data.progress[i]);colors.push(c.r,c.g,c.b);}}
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    for(const [name,key] of [['roadAcross','across'],['roadProgress','progress'],['roadDistance','distance'],['roadPaintMask','paintMask'],['roadFringeMask','fringeMask']])g.setAttribute(name,new THREE.Float32BufferAttribute(data[key]||Array(n).fill(key.endsWith('Mask')?1:0),1));
    if(terrain)g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
    const mesh=new THREE.Mesh(g,material);mesh.name=name;mesh.receiveShadow=true;mesh.userData.networkSurface=true;group(terrain?'Terrain':'Street').add(mesh);return mesh;
  }
  const bridgeRoad=clipBridgeSurfaces(ROAD_MESH),bridgeGround=clipBridgeSurfaces(GROUND_MESH,{terrain:true});
  const road=surface('Continuous 30m-wide road',bridgeRoad,createPaintedRoadMaterial(THREE,undefined,{network:true}));
  const groundMaterial=createGroundMaterial(THREE,'grass',0xffffff);groundMaterial.vertexColors=true;
  applyRoadSurfaceShader(THREE,groundMaterial,{fringe:true,network:true});
  surface('Closed continuous terrain foundation',bridgeGround,groundMaterial,true);
  group('Bridges').add(bridgeUnderdeck(THREE,clipBridgeSurfaces(ROAD_MESH,{onlyBridges:true})));
  const edgePaint=clipBridgeSurfaces(ROAD_MESH,{onlyBridges:true,edgeStrips:true});
  edgePaint.positions=edgePaint.positions.map((v,i)=>v+(i%3===1?.006:0));
  surface('Flat yellow bridge edge markings',edgePaint,createEnvironmentMaterial(THREE,0xffc438));
  for(const b of BRIDGES)features.push({type:'bridge',...b,width:b.halfWidth*2,progressFrom:b.from,progressTo:b.to});
  const houseBatch=prismBatch(THREE),barrierBatch=prismBatch(THREE),palette=[0xde7430,0xebb840,0x2dc65b,0x1f91df];
  let buildingCount=0,barrierCount=0,omittedJunctionSections=0,minimumFrontage=Infinity,maximumFrontage=0,maximumFacadeSetback=0;
  const sample=(edge,s)=>NETWORK.pointOnEdge(edge.id,Math.max(0,Math.min(edge.length,s)));
  const offset=(p,d)=>({x:p.x+p.right.x*d,z:p.z+p.right.z*d});
  const groundAt=p=>NETWORK.getSurface(p.x,p.z).height;
  function profileFor(edge,side,frontage=18){


    const curve=edge.samples.map(p=>({...offset(p,side*15.3),s:p.edgeDistance})),arc=[0];
    for(let i=1;i<curve.length;i++)arc.push(arc.at(-1)+Math.hypot(curve[i].x-curve[i-1].x,curve[i].z-curve[i-1].z));
    const count=Math.max(1,Math.round(arc.at(-1)/frontage)),cuts=[0];let k=0;
    for(let i=1;i<count;i++){
      const target=arc.at(-1)*i/count;while(k+1<arc.length-1&&arc[k+1]<target)k++;
      const t=(target-arc[k])/(arc[k+1]-arc[k]);cuts.push(curve[k].s+(curve[k+1].s-curve[k].s)*t);
    }
    cuts.push(edge.length);let error=0;
    for(let i=0;i<count;i++){
      const a=sample(edge,cuts[i]),b=sample(edge,cuts[i+1]),aa=offset(a,side*15),bb=offset(b,side*15);
      for(let j=1;j<8;j++){const t=j/8,p=sample(edge,cuts[i]+(cuts[i+1]-cuts[i])*t),pp=offset(p,side*15);error=Math.max(error,Math.hypot(pp.x-aa.x-(bb.x-aa.x)*t,pp.z-aa.z-(bb.z-aa.z)*t));}
    }
    const setback=Math.max(.35,.08+error);maximumFacadeSetback=Math.max(maximumFacadeSetback,setback);return {count,cuts,setback};
  }
  function envelope(edge,side,from,to,setback,depth){
    const a=sample(edge,from),b=sample(edge,to),fa=offset(a,side*(15+setback)),fb=offset(b,side*(15+setback));
    const ba=offset(a,side*(15+setback+depth)),bb=offset(b,side*(15+setback+depth));
    const p=[fa,ba,bb,fb];let low=Infinity,high=-Infinity;
    for(let i=0;i<4;i++)for(let j=0;j<=4;j++){const t=j/4,aa=p[i],b=p[(i+1)%4],h=groundAt({x:aa.x+(b.x-aa.x)*t,z:aa.z+(b.z-aa.z)*t});low=Math.min(low,h);high=Math.max(high,h);}
    return {p,low,high,a,b,frontage:Math.hypot(fb.x-fa.x,fb.z-fa.z)};
  }
  function tierFootprint(p,depthScale=1,frontScale=1){
    const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t}),half=(1-frontScale)/2;

    const fa=lerp(p[0],p[1],1-depthScale),fb=lerp(p[3],p[2],1-depthScale);
    return [lerp(fa,fb,half),lerp(p[1],p[2],half),lerp(p[1],p[2],1-half),lerp(fa,fb,1-half)];
  }
  for(const edge of NETWORK_EDGES){
    const biome=BIOMES.find(b=>b.id===edge.biome)||BIOMES.find(b=>edge.biomes?.includes(b.id))||BIOMES.find(b=>(edge.progressFrom+edge.progressTo)/2<b.to)||BIOMES.at(-1);
    for(const side of [-1,1]){
      const {count,cuts,setback}=profileFor(edge,side,biome.id==='city'?18:42);
      for(let i=0;i<count;i++){
        const from=cuts[i],to=cuts[i+1],depth=biome.id==='city'?7.5:12;
        const q0=sample(edge,from).progress,q1=sample(edge,to).progress;
        if(BRIDGES.some(b=>q0<b.to&&q1>b.from)){omittedJunctionSections++;continue;}




        const inner=edge.forkId&&side===(edge.branch==='main'?-1:1);
        if(inner){
          let medianFits=true;
          for(let j=0;j<=8;j++){
            const p=sample(edge,from+(to-from)*j/8),other=NETWORK.routePointAtProgress(p.progress,{branch:edge.branch==='main'?'alternate':'main'});
            if(Math.hypot(p.x-other.x,p.z-other.z)<2*(15+setback+depth)+.2){medianFits=false;break;}
          }
          if(!medianFits){omittedJunctionSections++;continue;}
        }
        const shape=envelope(edge,side,from,to,setback,depth);
        if(canyonClearance.some(quad=>polygonIntersectionArea(shape.p,quad)>1e-6)){omittedJunctionSections++;continue;}
        if(roadIndex.intersects(shape.p)){omittedJunctionSections++;continue;}
        const position=[shape.p.reduce((n,p)=>n+p.x,0)/4,-shape.p.reduce((n,p)=>n+p.z,0)/4,shape.low-.15];
        if(biome.id==='city'){
          const floors=3+(rand()>.72?1:0),color=palette[(buildingCount+Math.floor(rand()*2))%palette.length],bottom=shape.low-.15;
          const height=2*(shape.high-shape.low+floors*2.8+.55),top=bottom+height,index=buildingCount++;
          const center=sample(edge,(from+to)/2),shopBase=center.height-bottom;
          houseBatch.add(`Residence ${index}`,shape.p,bottom,top,new THREE.Color(color),shopBase,index+1);
          minimumFrontage=Math.min(minimumFrontage,shape.frontage);maximumFrontage=Math.max(maximumFrontage,shape.frontage);
          features.push({type:'building',index,row:side<0?'West residences':'East residences',branch:edge.branch,edgeId:edge.id,side,from,to,progressFrom:shape.a.progress,progressTo:shape.b.progress,footprint:shape.p.map(p=>({x:p.x,y:-p.z})),position,top,depth,frontage:shape.frontage,color,floors,clearance:setback,biome:'city',baselineHeight:height/2,heightScale:2,widthScale:3,originalFrontage:6,sourceIndex:index,alignedFacade:true,metricPrism:true,shopBase});
        }else{
          const bottom=shape.low-.25,index=barrierCount++,variation=((index*37+seed*11)%17)/17;let top=bottom;
          const tier=(label,lo,hi,ds,fs,color)=>{barrierBatch.add(`Biome barrier ${biome.id} ${index} ${label}`,tierFootprint(shape.p,ds,fs),lo,hi,new THREE.Color(color));top=Math.max(top,hi);};
          if(biome.id==='forest'){
            const crown=shape.high+12+variation*6;tier('root mass',bottom,shape.high+5,1,1,0x145821);tier('lower canopy',shape.high+3,crown,.97,1,0x15952c);tier('upper canopy',crown-3,crown+5,.76,.86,index%2?0x41c31b:0x20ad23);if(index%3===0)tier('treetop',crown+2,crown+8,.5,.55,0x64df18);
          }else if(biome.id==='desert'){
            const ridge=shape.high+9+variation*8;tier('sandstone base',bottom,shape.high+6,1,1,0xa96d24);tier('ochre stratum',shape.high+5,ridge,.89,.98,0xd79432);tier('mesa cap',ridge-.8,ridge+3,.67,.81,0xffc454);if(index%4===0)tier('butte',ridge+1,ridge+9,.4,.45,0xdc9d36);
          }else if(biome.id==='snow'){
            const ridge=shape.high+13+variation*9;tier('blue glacier',bottom,shape.high+8,1,1,0x299bd4);tier('ice wall',shape.high+6,ridge,.88,.95,0x80dcff);tier('snow cap',ridge-1,ridge+2.6,.89,.97,0xf8ffff);if(index%3!==1)tier('ice spire',ridge+1,ridge+8,.47,.55,0xc9f4ff);
          }else{
            const ridge=shape.high+11+variation*9;tier('basalt footing',bottom,shape.high+5,1,1,0x332f32);tier('lava seam',shape.high+4,shape.high+5.2,.96,.99,0xff5708);tier('black ridge',shape.high+5,ridge,.9,.98,index%2?0x4f4547:0x41373b);tier('crater rim',ridge-1,ridge+4,.62,.74,0x6f4740);if(index%4===0)tier('ember crest',ridge+2.5,ridge+5,.44,.57,0xe9450d);
          }
          features.push({type:'barrier',index,biome:biome.id,name:biome.landmark,branch:edge.branch,edgeId:edge.id,side,from,to,progressFrom:shape.a.progress,progressTo:shape.b.progress,footprint:shape.p.map(p=>({x:p.x,y:-p.z})),position:[position[0],position[1],bottom],bottom,top,depth,frontage:shape.frontage,clearance:setback,metricPrism:true});
        }
      }
    }
  }
  const end=NETWORK.routePointAtProgress(ROUTE.end),forward={x:-Math.sin(end.heading),z:-Math.cos(end.heading)};
  const cap=[[-27,.25],[-27,8.25],[27,8.25],[27,.25]].map(([a,b])=>({x:end.x+end.right.x*a+forward.x*b,z:end.z+end.right.z*a+forward.z*b}));
  barrierBatch.add('Biome barrier volcanic route end',cap,end.height-.2,end.height+12.8,new THREE.Color(0x41373b));
  features.push({type:'barrier',index:barrierCount++,biome:'volcanic',name:'Route end',branch:'main',side:0,from:ROUTE.end+.25,to:ROUTE.end+8.25,footprint:cap.map(p=>({x:p.x,y:-p.z})),position:[end.x,-end.z,end.height-.2],bottom:end.height-.2,top:end.height+12.8,depth:8,frontage:54,clearance:.25});
  for(const [name,batch,shops] of [['Continuous storefront residences',houseBatch,true],['Massive biome barriers',barrierBatch,false]]){
    const mesh=new THREE.Mesh(batch.build(),prismMaterial(THREE,shops));mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.partNames=batch.ranges.map(p=>p.name);group(shops?'Residences':'Biome barriers').add(mesh);
  }

  const instances=0;
  for(const g of Object.values(groups))root.add(g);
  let triangles=0,drawCalls=0;root.traverse(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);drawCalls++;}});
  const stats={seed,instances,triangles,drawCalls,bridges:BRIDGES.length,bridgeWidths:BRIDGES.map(b=>b.halfWidth*2),buildings:buildingCount,retainedBuildings:buildingCount,roadWidth:30,roadsideProps:0,
    continuousHouseRows:true,alignedFacadeRows:true,facadeSetback:maximumFacadeSetback,routeLength:ROUTE_LENGTH,
    longitudinalLength:ROUTE.end-ROUTE.start,roadMeshStep:NETWORK_CONFIG.meshStep,roadBranches:NETWORK_EDGES.filter(e=>e.branch==='alternate').length+1,
    forks:NETWORK_EDGES.filter(e=>e.branch==='alternate').length,loops:NETWORK_EDGES.filter(e=>e.branch==='alternate').length,
    sequentialBiomes:true,biomes:BIOMES.length,biomeIds:BIOMES.map(b=>b.id),buildingHeightScale:2,buildingWidthScale:3,
    originalBuildingFrontage:6,buildingFrontage:18,minimumActualFrontage:minimumFrontage,maximumActualFrontage:maximumFrontage,
    barriers:barrierCount,routeEndHeight:end.height,maximumElevation:ROAD_MESH.positions.reduce((m,v,i)=>i%3===1?Math.max(m,v):m,-Infinity),
    sharedMaterialPattern:'grass-checker',flushCurbs:true,studs:false,texturedRoad:true,embeddedRoadMarkings:true,
    nonOverlappingGround:true,nonOverlappingResidences:true,texturedBuildings:true,buildingBodyTriangles:buildingCount*12,
    importedModels:0,externalTextures:0,proceduralBuildingMaterial:true,roofStuds:0,roadUnion:true,mergedMetricPrisms:true,omittedJunctionSections};
  const network={nodes:NETWORK_NODES,edges:NETWORK_EDGES};root.userData={stats,features,biomes:BIOMES,network};
  return {group:root,stats,features,biomes:BIOMES,network,biomeAt:NETWORK.biomeAt,
    dispose(){const geometries=new Set(),materials=new Set();root.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());}};
}
