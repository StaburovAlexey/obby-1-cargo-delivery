


import {NETWORK_CONFIG as C, BIOME_DEFINITIONS, FORK_DEFINITIONS,
  TURN_DEFINITIONS, ELEVATION_PROFILE} from './route-network-config.js';
export {NETWORK_CONFIG, BIOME_DEFINITIONS, FORK_DEFINITIONS, TURN_DEFINITIONS, ELEVATION_PROFILE, CHECKPOINT_PROGRESS, PREVIEW_PROGRESS} from './route-network-config.js';
export const ROUTE=Object.freeze({start:C.start,end:C.end,spawnY:-6,spawnProgress:0,halfWidth:C.halfWidth,cityEnd:BIOME_DEFINITIONS[0].to});
export const ROAD_SURFACE_OFFSET=C.roadSurfaceOffset;
export const TRUCK_HALF_WIDTH=C.truckHalfWidth,TRUCK_HALF_LENGTH=C.truckHalfLength,ROAD_MARGIN=C.roadMargin;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const ease=t=>t*t*t*(10+t*(-15+6*t));
const dease=t=>30*t*t*(1-t)*(1-t);
const ddease=t=>60*t*(1-t)*(1-2*t);
const simpson=(f,a,b)=>(b-a)*(f(a)+4*f((a+b)/2)+f(b))/6;
const search=(array,value,key=v=>v)=>{let lo=0,hi=array.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(key(array[m])<=value)lo=m;else hi=m;}return lo;};
function headingAt(q,derivative=0){
  let previous=0;
  for(const [from,to,a,b] of TURN_DEFINITIONS){if(q<from)return derivative?0:previous;if(q<=to){const t=(q-from)/(to-from);return derivative===1?(b-a)*dease(t)/(to-from):derivative===2?(b-a)*ddease(t)/(to-from)**2:a+(b-a)*ease(t);}previous=b;}
  return derivative?0:previous;
}
export function routeHeight(q,derivative=0){
  if(q<=C.start)return derivative?0:ELEVATION_PROFILE[0][1];
  if(q>=C.end)return derivative?0:ELEVATION_PROFILE.at(-1)[1];
  const i=search(ELEVATION_PROFILE,q,v=>v[0]),[a,h]=ELEVATION_PROFILE[i],[b,k]=ELEVATION_PROFILE[i+1],t=(q-a)/(b-a);
  return derivative===1?(k-h)*dease(t)/(b-a):derivative===2?(k-h)*ddease(t)/(b-a)**2:h+(k-h)*ease(t);
}
export const routeGrade=q=>routeHeight(q,1);
const basePoints=[];
for(let q=C.start,x=0,z=23;;){basePoints.push({q,x,z});if(q>=C.end)break;const next=Math.min(C.end,q+C.meshStep);x+=simpson(v=>-Math.sin(headingAt(v)),q,next);z+=simpson(v=>-Math.cos(headingAt(v)),q,next);q=next;}
function backbone(q){q=clamp(q,C.start,C.end);const i=search(basePoints,q,v=>v.q),a=basePoints[i];return{x:a.x+simpson(v=>-Math.sin(headingAt(v)),a.q,q),z:a.z+simpson(v=>-Math.cos(headingAt(v)),a.q,q)};}
const forkAt=q=>FORK_DEFINITIONS.find(f=>q>=f.from&&q<=f.to);
function excursion(f,q,sign=1){
  const t=clamp((q-f.from)/(f.to-f.from),0,1),w=Math.PI/(f.to-f.from),s=Math.sin(Math.PI*t),c=Math.cos(Math.PI*t),a=f.offset*sign;
  const k=(f.skew||0)*sign,g=1+k*Math.sin(2*Math.PI*t),dg=2*w*k*Math.cos(2*Math.PI*t),ddg=-4*w*w*k*Math.sin(2*Math.PI*t);
  const h=s**4,dh=4*w*s**3*c,ddh=4*w*w*(3*s*s*c*c-s**4);
  return{offset:a*h*g,d1:a*(dh*g+h*dg),d2:a*(ddh*g+2*dh*dg+h*ddg)};
}


function branchRise(f,q,sign=1,derivative=0){
  const t=(q-f.from)/(f.to-f.from),span=.2*(f.to-f.from),h=sign>0?f.ridge:f.valley;
  if(t<=.3||t>=.7)return 0;
  const ascending=t<=.5,u=ascending?(t-.3)/.2:(.7-t)/.2;
  return derivative?h*dease(u)/span*(ascending?1:-1):h*ease(u);
}
const arcSpeed=q=>{const f=forkAt(q),d=f?excursion(f,q).d1:0;return Math.hypot(1,d,routeGrade(q)+(f?branchRise(f,q,1,1):0));};
const arcTable=new Float64Array(C.end-C.start+1);
for(let i=1;i<arcTable.length;i++)arcTable[i]=arcTable[i-1]+simpson(arcSpeed,C.start+i-1,C.start+i);
function absoluteArc(q){q=clamp(q,C.start,C.end);const i=Math.min(arcTable.length-1,Math.floor(q-C.start)),a=C.start+i;return arcTable[i]+(q>a?simpson(arcSpeed,a,q):0);}
const spawnArc=absoluteArc(0);
export const ROUTE_DISTANCE_START=-spawnArc,ROUTE_LENGTH=arcTable.at(-1)-spawnArc;
export function routeDistanceAt(q){if(!Number.isFinite(q))throw new TypeError('Progress must be finite');return absoluteArc(q)-spawnArc;}
export function progressAtDistance(distance){if(!Number.isFinite(distance))throw new TypeError('Distance must be finite');const a=clamp(distance+spawnArc,0,arcTable.at(-1)),i=search(arcTable,a);let q=C.start+i+(a-arcTable[i])/(arcTable[i+1]-arcTable[i]);for(let j=0;j<3;j++)q=clamp(q-(absoluteArc(q)-a)/arcSpeed(q),C.start+i,C.start+i+1);return q;}
const biomeFor=q=>BIOME_DEFINITIONS.find(b=>q<b.to)||BIOME_DEFINITIONS.at(-1);
const breakpoints=[...new Set([C.start,C.end,...BIOME_DEFINITIONS.flatMap(b=>[b.from,b.to]),...FORK_DEFINITIONS.flatMap(f=>[f.from,f.to])])].sort((a,b)=>a-b);
export const NETWORK_NODES=Object.freeze(breakpoints.map((q,i)=>Object.freeze({id:i===0?'start':i===breakpoints.length-1?'finish':`node-${q}`,progress:q,...backbone(q),height:routeHeight(q),incoming:[],outgoing:[]})));
const edgeList=[];
for(let i=0;i<breakpoints.length-1;i++){const a=breakpoints[i],b=breakpoints[i+1],fork=FORK_DEFINITIONS.find(f=>f.from===a&&f.to===b),biome=biomeFor((a+b)/2).id;for(const branch of fork?['main','alternate']:['main'])edgeList.push({id:fork?`${fork.id}-${branch}`:`${biome}-${a}-${b}`,from:NETWORK_NODES[i].id,to:NETWORK_NODES[i+1].id,progressFrom:a,progressTo:b,length:routeDistanceAt(b)-routeDistanceAt(a),distanceFrom:routeDistanceAt(a),distanceTo:routeDistanceAt(b),branch,biome,biomes:Object.freeze([biome]),forkId:fork?.id||null,samples:[]});}
const edgeMap=new Map(edgeList.map(e=>[e.id,e]));
for(const e of edgeList){NETWORK_NODES.find(n=>n.id===e.from).outgoing.push(e.id);NETWORK_NODES.find(n=>n.id===e.to).incoming.push(e.id);}
for(const n of NETWORK_NODES){Object.freeze(n.incoming);Object.freeze(n.outgoing);}
export const getEdge=id=>edgeMap.get(id);
const edgesAt=q=>edgeList.filter(e=>q>=e.progressFrom-1e-8&&q<=e.progressTo+1e-8);
function selectedEdge(q,branch='main'){return edgesAt(q).find(e=>e.branch===branch)||edgesAt(q)[0];}
function pointFor(q,edge){
  const b=backbone(q),a=headingAt(q),fx=-Math.sin(a),fz=-Math.cos(a),rx=Math.cos(a),rz=-Math.sin(a),f=edge?.forkId?FORK_DEFINITIONS.find(v=>v.id===edge.forkId):null,ex=f?excursion(f,q,edge.branch==='alternate'?-1:1):{offset:0,d1:0,d2:0};
  const tx=fx+rx*ex.d1,tz=fz+rz*ex.d1,n=Math.hypot(tx,tz),right={x:-tz/n,z:tx/n},grade=routeGrade(q)+(f?branchRise(f,q,edge.branch==='alternate'?-1:1,1):0),den=n*n;



  const gradient=f?{x:grade*fx,z:grade*fz}:{x:grade*tx/den,z:grade*tz/den},normalLength=Math.hypot(gradient.x,1,gradient.z),distance=routeDistanceAt(q);
  return{x:b.x+rx*ex.offset,z:b.z+rz*ex.offset,height:routeHeight(q)+(f?branchRise(f,q,edge.branch==='alternate'?-1:1):0),heading:Math.atan2(-tx,-tz),right,
    normal:{x:-gradient.x/normalLength,y:1/normalLength,z:-gradient.z/normalLength},gradient,
    tangent:{x:tx/n,z:tz/n},edgeId:edge?.id,edgeDistance:distance-(edge?.distanceFrom||0),
    progress:q,distance,biome:biomeFor(q).id,branch:edge?.branch||'main',curvature:f?-ex.d2/(1+ex.d1**2)**1.5:headingAt(q,1)};
}
export function routePointAtProgress(q,options={}){if(!Number.isFinite(q))throw new TypeError('Progress must be finite');q=clamp(q,C.start,C.end);return pointFor(q,selectedEdge(q,typeof options==='string'?options:options.branch));}
export function routePointAtDistance(d,options={}){return routePointAtProgress(progressAtDistance(d),options);}
export function pointOnEdge(id,s){const e=getEdge(id);if(!e)throw new Error(`Unknown route edge: ${id}`);return pointFor(progressAtDistance(e.distanceFrom+clamp(s,0,e.length)),e);}
export const sampleEdge=pointOnEdge;
for(const e of edgeList){const stations=[e.progressFrom,e.progressTo,...ELEVATION_PROFILE.map(p=>p[0]).filter(q=>q>e.progressFrom&&q<e.progressTo)];for(let q=e.progressFrom;q<e.progressTo;q+=q<802?2:C.meshStep)stations.push(q);for(const q of [...new Set(stations)].sort((a,b)=>a-b))e.samples.push(Object.freeze(pointFor(q,e)));Object.freeze(e.samples);Object.freeze(e);}
export const NETWORK_EDGES=Object.freeze(edgeList);
export const BIOMES=Object.freeze(BIOME_DEFINITIONS.map(b=>Object.freeze({...b,branch:'main',sample:Object.freeze([routePointAtProgress((b.from+b.to)/2).x,-routePointAtProgress((b.from+b.to)/2).z])})));
export const ROUTE_STATIONS=Object.freeze([...new Set([...breakpoints,...TURN_DEFINITIONS.flatMap(t=>[t[0],t[1]]),...ELEVATION_PROFILE.map(p=>p[0]),0])].sort((a,b)=>a-b));
export const FORKS=Object.freeze(FORK_DEFINITIONS.map(f=>Object.freeze({...f,length:routeDistanceAt(f.to)-routeDistanceAt(f.from),splitOverlapEnd:f.from+(f.to-f.from)*Math.asin((C.halfWidth/f.offset)**.25)/Math.PI,mergeOverlapStart:f.to-(f.to-f.from)*Math.asin((C.halfWidth/f.offset)**.25)/Math.PI})));
export const junctionDistance=q=>Math.min(...FORKS.flatMap(f=>[Math.abs(q-f.from),Math.abs(q-f.to)]));


const CELL=32,key=(x,z)=>`${Math.floor(x/CELL)},${Math.floor(z/CELL)}`;
function binAdd(map,item,minX,maxX,minZ,maxZ){for(let x=Math.floor(minX/CELL);x<=Math.floor(maxX/CELL);x++)for(let z=Math.floor(minZ/CELL);z<=Math.floor(maxZ/CELL);z++){const k=`${x},${z}`;if(!map.has(k))map.set(k,[]);map.get(k).push(item);}}
const sampleBins=new Map();
for(const e of NETWORK_EDGES)for(let i=0;i<e.samples.length-1;i++){const a=e.samples[i],b=e.samples[i+1],segment={a,b,edge:e};binAdd(sampleBins,segment,Math.min(a.x,b.x)-20,Math.max(a.x,b.x)+20,Math.min(a.z,b.z)-20,Math.max(a.z,b.z)+20);}
function permitted(history){const e=getEdge(history?.edgeId);if(!e)return null;const ids=new Set([e.id]);const q=Number.isFinite(history.progress)?history.progress:(e.progressFrom+e.progressTo)/2;
  for(const n of NETWORK_NODES)if((n.id===e.from||n.id===e.to)&&Math.abs(q-n.progress)<55)for(const id of [...n.incoming,...n.outgoing])ids.add(id);
  if(e.forkId){const f=FORKS.find(f=>f.id===e.forkId);if(q<f.splitOverlapEnd+12||q>f.mergeOverlapStart-12)for(const other of edgeList)if(other.forkId===e.forkId)ids.add(other.id);}
  return ids;
}
const sq=(x,z)=>x*x+z*z;
export function projectRoad(x,z,history){
  if(!Number.isFinite(x)||!Number.isFinite(z))return undefined;
  const allowed=permitted(history),local=sampleBins.get(key(x,z))||[];let segments=allowed?local.filter(s=>allowed.has(s.edge.id)):local;
  if(!segments.length){const edges=allowed?[...allowed].map(getEdge):NETWORK_EDGES;segments=[];for(const e of edges)for(let i=0;i<e.samples.length-1;i++)segments.push({a:e.samples[i],b:e.samples[i+1],edge:e});}
  let best,score=Infinity;
  for(const seg of segments){const {a,b}=seg,dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1),d=sq(x-a.x-t*dx,z-a.z-t*dz);const stable=d+(history?.edgeId===seg.edge.id?0:1e-7);if(stable<score){score=stable;best={seg,q:a.progress+t*(b.progress-a.progress)};}}
  if(!best)return undefined;
  const e=best.seg.edge;let q=best.q;

  for(let i=0;i<5;i++){const p=pointFor(q,e),f=e.forkId?FORK_DEFINITIONS.find(f=>f.id===e.forkId):null,ex=f?excursion(f,q,e.branch==='alternate'?-1:1):{d1:0,d2:0},a=headingAt(q),rx=Math.cos(a),rz=-Math.sin(a),fx=-Math.sin(a),fz=-Math.cos(a),tx=fx+rx*ex.d1,tz=fz+rz*ex.d1,k=headingAt(q,1),ax=-rx*k+rx*ex.d2,az=-rz*k+rz*ex.d2,den=tx*tx+tz*tz+(p.x-x)*ax+(p.z-z)*az;const step=((p.x-x)*tx+(p.z-z)*tz)/den;if(!Number.isFinite(step))break;const next=clamp(q-clamp(step,-4,4),e.progressFrom,e.progressTo);if(Math.abs(next-q)<1e-10){q=next;break;}q=next;}
  const p=pointFor(q,e),dx=x-p.x,dz=z-p.z;return{...p,offset:dx*p.right.x+dz*p.right.z,distanceSquared:sq(dx,dz),y:q,logicalY:q};
}

const mesh=()=>({positions:[],indices:[],progress:[],distance:[],across:[],paintMask:[],fringeMask:[]});
export const ROAD_MESH=mesh(),GROUND_MESH=mesh();
const roadTriangleBins=new Map(),groundTriangleBins=new Map(),boundaryBins=new Map();
export const ROAD_BOUNDARY_SEGMENTS=[];
function appendQuad(m,v,paint=1,fringe=1){


  v=v.map(p=>({...p,x:Math.fround(p.x),height:Math.fround(p.height),z:Math.fround(p.z)}));
  const area=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
  const valid=[[0,1,2],[0,2,3]].filter(t=>Math.abs(area(...t.map(i=>v[i])))>1e-9);
  if(!valid.length)return;
  const used=[...new Set(valid.flat())],start=m.positions.length/3,map=new Map(used.map((id,i)=>[id,start+i]));
  for(const id of used){const p=v[id];m.positions.push(p.x,p.height,p.z);m.progress.push(p.progress);m.distance.push(routeDistanceAt(p.progress));m.across.push(p.across||0);m.paintMask.push(p.paint??paint);m.fringeMask.push(p.fringe??fringe);}
  for(const tri of valid){if(area(...tri.map(i=>v[i]))>0)[tri[1],tri[2]]=[tri[2],tri[1]];m.indices.push(...tri.map(i=>map.get(i)));}
}
function addBoundary(a,b,inside){a={...a,x:Math.fround(a.x),z:Math.fround(a.z)};b={...b,x:Math.fround(b.x),z:Math.fround(b.z)};const dx=b.x-a.x,dz=b.z-a.z,n=Math.hypot(dx,dz);if(n<1e-9)return;let nx=-dz/n,nz=dx/n;if((inside.x-(a.x+b.x)/2)*nx+(inside.z-(a.z+b.z)/2)*nz<0){nx=-nx;nz=-nz;}const s={a,b,normalX:nx,normalZ:nz,minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minZ:Math.min(a.z,b.z),maxZ:Math.max(a.z,b.z)};ROAD_BOUNDARY_SEGMENTS.push(s);binAdd(boundaryBins,s,s.minX-1,s.maxX+1,s.minZ-1,s.maxZ+1);}
const shifted=(p,v)=>({x:p.x+p.right.x*v,z:p.z+p.right.z*v,height:p.height,progress:p.progress,across:v});
const shoulderAt=q=>104+6*ease(clamp((q-100)/100,0,1));
function buildSingle(e){const ps=e.samples;for(let i=0;i<ps.length-1;i++){const a=ps[i],b=ps[i+1],al=shifted(a,-15),ar=shifted(a,15),bl=shifted(b,-15),br=shifted(b,15);appendQuad(ROAD_MESH,[al,ar,br,bl]);appendQuad(GROUND_MESH,[shifted(a,-shoulderAt(a.progress)),al,bl,shifted(b,-shoulderAt(b.progress))],0);appendQuad(GROUND_MESH,[ar,shifted(a,shoulderAt(a.progress)),shifted(b,shoulderAt(b.progress)),br],0);addBoundary(al,bl,a);addBoundary(ar,br,a);}}
function buildFork(f){
  const origin=backbone(f.from),angle=headingAt(f.from),r={x:Math.cos(angle),z:-Math.sin(angle)},t={x:-Math.sin(angle),z:-Math.cos(angle)},curves=[];
  for(const branch of ['alternate','main'])for(const side of [-1,1]){const e=getEdge(`${f.id}-${branch}`),line=e.samples.map(p=>{const x=p.x+p.right.x*side*15-origin.x,z=p.z+p.right.z*side*15-origin.z;return{u:x*t.x+z*t.z,v:x*r.x+z*r.z};});curves.push(line);}
  const interp=(line,u)=>{if(u<=0)return line[0].v;if(u>=f.to-f.from)return line.at(-1).v;const i=search(line,u,p=>p.u),a=line[i],b=line[i+1];return a.v+(b.v-a.v)*(u-a.u)/(b.u-a.u);};
  let rows=[...new Set([0,f.to-f.from,...getEdge(`${f.id}-main`).samples.map(p=>p.progress-f.from)])].sort((a,b)=>a-b);
  const gap=u=>interp(curves[2],u)-interp(curves[1],u),roots=[];
  for(let i=0;i<rows.length-1;i++){
    let a=rows[i],b=rows[i+1],ga=gap(a);const gb=gap(b);
    if(ga*gb<0){


      for(let j=0;j<48;j++){const mid=(a+b)/2,gm=gap(mid);if(ga*gm>0){a=mid;ga=gm;}else b=mid;}
      roots.push((a+b)/2);
    }
  }
  rows=[...rows,...roots].sort((a,b)=>a-b).filter((u,i,a)=>!i||u-a[i-1]>1e-8);



  const forkHeight=(u,v)=>{
    const lo=interp(curves[1],u),hi=interp(curves[2],u),q=f.from+u;
    if(hi-lo<=1e-8)return routeHeight(q);
    const blend=clamp((v-lo)/(hi-lo),0,1);



    const relief=smooth((hi-lo)/(2*(f.offset-C.halfWidth)));
    return routeHeight(q)+relief*(branchRise(f,q,-1)*(1-blend)+branchRise(f,q,1)*blend);
  };
  const vertex=(u,v)=>{const ex=excursion(f,f.from+u,v>=0?1:-1);return{x:origin.x+t.x*u+r.x*v,z:origin.z+t.z*u+r.z*v,height:forkHeight(u,v),progress:f.from+u,across:(v-ex.offset)/Math.hypot(1,ex.d1),paint:0};};
  for(let i=0;i<rows.length-1;i++){const a=rows[i],b=rows[i+1],va=curves.map(c=>interp(c,a)),vb=curves.map(c=>interp(c,b)),separate=gap((a+b)/2)>1e-8;
    const quad=(m,lo,hi,fringe=1)=>appendQuad(m,[vertex(a,lo[0]),vertex(a,hi[0]),vertex(b,hi[1]),vertex(b,lo[1])],0,fringe);
    if(separate){quad(ROAD_MESH,[va[0],vb[0]],[va[1],vb[1]]);quad(ROAD_MESH,[va[2],vb[2]],[va[3],vb[3]]);quad(GROUND_MESH,[va[1],vb[1]],[va[2],vb[2]],0);addBoundary(vertex(a,va[1]),vertex(b,vb[1]),vertex((a+b)/2,(va[0]+va[1]+vb[0]+vb[1])/4));addBoundary(vertex(a,va[2]),vertex(b,vb[2]),vertex((a+b)/2,(va[2]+va[3]+vb[2]+vb[3])/4));}
    else {



      const l0=vertex(a,va[0]),r0=vertex(a,va[3]),l1=vertex(b,vb[0]),r1=vertex(b,vb[3]);
      if(Math.abs(gap(a))<1e-8){
        const mid=vertex(a,(va[1]+va[2])/2);
        appendQuad(ROAD_MESH,[l0,mid,r1,l1],0);
        appendQuad(ROAD_MESH,[mid,r0,r1,r1],0);
      }else if(Math.abs(gap(b))<1e-8){
        const mid=vertex(b,(vb[1]+vb[2])/2);
        appendQuad(ROAD_MESH,[l0,r0,r1,mid],0);
        appendQuad(ROAD_MESH,[l0,mid,l1,l1],0);
      }else quad(ROAD_MESH,[va[0],vb[0]],[va[3],vb[3]]);
    }
    quad(GROUND_MESH,[-110,-110],[va[0],vb[0]]);quad(GROUND_MESH,[va[3],vb[3]],[110,110]);addBoundary(vertex(a,va[0]),vertex(b,vb[0]),vertex((a+b)/2,0));addBoundary(vertex(a,va[3]),vertex(b,vb[3]),vertex((a+b)/2,0));
  }
}
for(const e of NETWORK_EDGES){if(!e.forkId)buildSingle(e);else if(e.branch==='main')buildFork(FORKS.find(f=>f.id===e.forkId));}
for(const q of [C.start,C.end]){const p=routePointAtProgress(q),a=shifted(p,-15),b=shifted(p,15),inside=routePointAtProgress(q===C.start?q+1:q-1);addBoundary(a,b,inside);}



export const GARAGE_GRASS_RECTS=Object.freeze([[-104,-8,23,25],[8,104,23,25],[-104,-58,25,27],[32,104,25,27]].map(Object.freeze));
for(const [left,right,front,rear] of GARAGE_GRASS_RECTS)appendQuad(GROUND_MESH,[{x:left,z:rear,height:0,progress:C.start},{x:right,z:rear,height:0,progress:C.start},{x:right,z:front,height:0,progress:C.start},{x:left,z:front,height:0,progress:C.start}],0,0);
function indexTriangles(m,bins){for(let i=0;i<m.indices.length;i+=3){const v=m.indices.slice(i,i+3).map(n=>({x:m.positions[n*3],height:m.positions[n*3+1],z:m.positions[n*3+2],progress:m.progress[n]})),[a,b,c]=v,area=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);if(Math.abs(area)<1e-12)continue;const dhb=b.height-a.height,dhc=c.height-a.height,gradient={x:(dhb*(c.z-a.z)-dhc*(b.z-a.z))/area,z:((b.x-a.x)*dhc-(c.x-a.x)*dhb)/area};const n=Math.hypot(gradient.x,1,gradient.z),tri={a,b,c,area,gradient,normal:{x:-gradient.x/n,y:1/n,z:-gradient.z/n}};binAdd(bins,tri,Math.min(a.x,b.x,c.x),Math.max(a.x,b.x,c.x),Math.min(a.z,b.z,c.z),Math.max(a.z,b.z,c.z));}}
indexTriangles(ROAD_MESH,roadTriangleBins);indexTriangles(GROUND_MESH,groundTriangleBins);
function triangleAt(x,z,bins){for(const t of bins.get(key(x,z))||[]){const {a,b,c,area}=t,u=((b.x-x)*(c.z-z)-(b.z-z)*(c.x-x))/area,v=((c.x-x)*(a.z-z)-(c.z-z)*(a.x-x))/area,w=1-u-v;if(u>=-1e-8&&v>=-1e-8&&w>=-1e-8)return{...t,height:u*a.height+v*b.height+w*c.height,progress:u*a.progress+v*b.progress+w*c.progress};}return null;}
function segmentsNear(x,z,r=1){const found=new Set();for(let ix=Math.floor((x-r)/CELL);ix<=Math.floor((x+r)/CELL);ix++)for(let iz=Math.floor((z-r)/CELL);iz<=Math.floor((z+r)/CELL);iz++)for(const s of boundaryBins.get(`${ix},${iz}`)||[])found.add(s);return found;}
function pointSegment(x,z,s){const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,t=clamp(((x-s.a.x)*dx+(z-s.a.z)*dz)/(dx*dx+dz*dz),0,1),px=s.a.x+t*dx,pz=s.a.z+t*dz;return{x:px,z:pz,distance:Math.hypot(x-px,z-pz)};}
export function pointInRoad(x,z,padding=0){if(!Number.isFinite(x)||!Number.isFinite(z)||!triangleAt(x,z,roadTriangleBins))return false;if(padding>0)for(const s of segmentsNear(x,z,padding+1))if(pointSegment(x,z,s).distance<padding-1e-8)return false;return true;}
export function queryRoadSurface(x,z,history){const p=projectRoad(x,z,history);if(!p)return{height:0,normal:{x:0,y:1,z:0},gradient:{x:0,z:0},onRoad:false};const road=triangleAt(x,z,roadTriangleBins),tri=road||triangleAt(x,z,groundTriangleBins),scale=1+p.offset*p.curvature,gradient=tri?.gradient||{x:p.gradient.x/scale,z:p.gradient.z/scale},n=Math.hypot(gradient.x,1,gradient.z);return{...p,height:tri?tri.height:p.height,gradient,normal:{x:-gradient.x/n,y:1/n,z:-gradient.z/n},onRoad:!!road};}
export const getSurface=queryRoadSurface;
export const surfaceHeight=(x,logicalY,history)=>queryRoadSurface(x,-logicalY,history).height;
export function biomeAt(x,logicalY,history){const p=projectRoad(x,-logicalY,history);return biomeFor(p?.progress??C.start);}
export function truckFootprint(x,z,heading,footprint){const c=Math.cos(heading),s=Math.sin(heading),halfWidth=footprint?.halfWidth??C.truckHalfWidth,halfLength=footprint?.halfLength??C.truckHalfLength;return[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>({x:x+a*halfWidth*c+b*halfLength*s,z:z-a*halfWidth*s+b*halfLength*c}));}
function clipSegmentRectangle(a,b,x,z,heading,width,length){const c=Math.cos(heading),s=Math.sin(heading),local=p=>({x:(p.x-x)*c-(p.z-z)*s,z:(p.x-x)*s+(p.z-z)*c}),p=local(a),q=local(b),dx=q.x-p.x,dz=q.z-p.z;let lo=0,hi=1;for(const [v,d,r] of [[p.x,dx,width],[p.z,dz,length]]){if(Math.abs(d)<1e-12){if(v<=-r||v>=r)return false;continue;}let a=(-r-v)/d,b=(r-v)/d;if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>=hi)return false;}return true;}



export function corridorContact(x,z,heading,history,footprint){if(![x,z,heading].every(Number.isFinite))return undefined;const halfWidth=footprint?.halfWidth??C.truckHalfWidth,halfLength=footprint?.halfLength??C.truckHalfLength,corners=truckFootprint(x,z,heading,footprint),radius=Math.hypot(halfWidth,halfLength)+C.roadMargin,near=segmentsNear(x,z,radius+1);let deepest;
  const keep=v=>{if(v.depth>1e-8&&(!deepest||v.depth>deepest.depth))deepest=v;};
  for(const s of near){if(!clipSegmentRectangle(s.a,s.b,x,z,heading,halfWidth+C.roadMargin,halfLength+C.roadMargin))continue;const depth=Math.max(...corners.map(p=>(s.a.x-p.x)*s.normalX+(s.a.z-p.z)*s.normalZ))+C.roadMargin;if(depth>0)keep({normalX:s.normalX,normalZ:s.normalZ,depth,name:'Road boundary'});}
  if(deepest)return deepest;
  for(const p of corners)if(!pointInRoad(p.x,p.z,C.roadMargin)){let nearest;for(const s of near){const d=pointSegment(p.x,p.z,s);if(!nearest||d.distance<nearest.distance)nearest={...d,s};}if(nearest){const inside=pointInRoad(p.x,p.z),depth=inside?C.roadMargin-nearest.distance:C.roadMargin+nearest.distance;keep({normalX:nearest.s.normalX,normalZ:nearest.s.normalZ,depth,name:'Road boundary'});}else{const projection=projectRoad(p.x,p.z,history),dx=projection.x-p.x,dz=projection.z-p.z,d=Math.hypot(dx,dz);keep({normalX:dx/d,normalZ:dz/d,depth:Math.max(.01,d-C.halfWidth+C.roadMargin),name:'Road boundary'});}}
  return deepest;
}
export const truckInRoad=(x,z,heading,history,footprint)=>[x,z,heading].every(Number.isFinite)&&!corridorContact(x,z,heading,history,footprint);
export function roadIntervals(logicalY,halfWidth=C.halfWidth){const z=-logicalY,spans=[];for(const t of roadTriangleBins.get(key(0,z))||[])void t;

  for(const s of ROAD_BOUNDARY_SEGMENTS){const a=s.a,b=s.b;if(z<Math.min(a.z,b.z)-1e-9||z>Math.max(a.z,b.z)+1e-9)continue;if(Math.abs(b.z-a.z)<1e-10){if(Math.abs(z-a.z)<1e-8)spans.push(a.x,b.x);}else spans.push(a.x+(b.x-a.x)*(z-a.z)/(b.z-a.z));}
  const xs=[...new Set(spans)].sort((a,b)=>a-b),out=[];for(let i=0;i<xs.length-1;i++)if(pointInRoad((xs[i]+xs[i+1])/2,z)){const pad=halfWidth-C.halfWidth,min=xs[i]-pad,max=xs[i+1]+pad,last=out.at(-1);if(last&&Math.abs(last.max-min)<1e-7)last.max=max;else out.push({min,max});}return out;
}
export function obstacleIntersectsRoad(o,padding=.15){const minX=o.minX-padding,maxX=o.maxX+padding,minZ=o.minZ-padding,maxZ=o.maxZ+padding;for(const [x,z] of [[minX,minZ],[minX,maxZ],[maxX,minZ],[maxX,maxZ]])if(pointInRoad(x,z))return true;for(const s of segmentsNear((minX+maxX)/2,(minZ+maxZ)/2,Math.hypot(maxX-minX,maxZ-minZ)/2+1))if(clipSegmentRectangle(s.a,s.b,(minX+maxX)/2,(minZ+maxZ)/2,0,(maxX-minX)/2,(maxZ-minZ)/2))return true;return false;}
export const NETWORK_STATS=Object.freeze({length:ROUTE_LENGTH,nodes:NETWORK_NODES.length,edges:NETWORK_EDGES.length,forks:FORKS.length,roadTriangles:ROAD_MESH.indices.length/3,groundTriangles:GROUND_MESH.indices.length/3,boundarySegments:ROAD_BOUNDARY_SEGMENTS.length});
