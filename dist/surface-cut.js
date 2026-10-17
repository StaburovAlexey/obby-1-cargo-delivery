// Convex planar subtraction, retaining interpolated vertex attributes. Adjacent
// surfaces own disjoint footprints instead of relying on depth bias.
const area=p=>p.length<3?0:p.slice(1,-1).reduce((s,a,i)=>{const b=p[i+2],o=p[0];return s+(a.x-o.x)*(b.z-o.z)-(a.z-o.z)*(b.x-o.x);},0)/2;
const bounds=p=>({minX:Math.min(...p.map(v=>v.x)),maxX:Math.max(...p.map(v=>v.x)),minZ:Math.min(...p.map(v=>v.z)),maxZ:Math.max(...p.map(v=>v.z))});
export function polygonIndex(polygons,cell=32){
 const bins=new Map(),visit=(b,fn)=>{for(let x=Math.floor(b.minX/cell);x<=Math.floor(b.maxX/cell);x++)for(let z=Math.floor(b.minZ/cell);z<=Math.floor(b.maxZ/cell);z++)fn(`${x},${z}`);};
 polygons.forEach(p=>visit(bounds(p),k=>{if(!bins.has(k))bins.set(k,[]);bins.get(k).push(p);}));
 return {candidates(p){const found=new Set();visit(bounds(p),k=>{for(const q of bins.get(k)||[])found.add(q);});return [...found];}};
}
export function meshFootprints(data){return Array.from({length:data.indices.length/3},(_,i)=>[0,1,2].map(j=>{const k=data.indices[i*3+j]*3;return {x:data.positions[k],z:data.positions[k+2]};}));}
function halfPlane(poly,a,b,sign){
 const out=[],distance=p=>sign*((b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x));
 for(let i=0;i<poly.length;i++){
  const p=poly[i],q=poly[(i+1)%poly.length],dp=distance(p),dq=distance(q);
  if(dp>=0)out.push(p);
  if((dp>=0)!==(dq>=0)){
   const t=dp/(dp-dq),v={};for(const key of Object.keys(p))v[key]=Array.isArray(p[key])?p[key].map((n,j)=>n+(q[key][j]-n)*t):p[key]+(q[key]-p[key])*t;if(a.x===b.x)v.x=a.x;if(a.z===b.z)v.z=a.z;out.push(v);
  }
 }
 return out;
}
export function subtractFootprints(subject,index){
 let remaining=[subject];
 for(let clip of index.candidates(subject)){
  if(area(clip)<0)clip=clip.slice().reverse();
  const next=[];
  for(const polygon of remaining){
   let intersection=polygon;for(let i=0;i<clip.length&&intersection.length>=3;i++)intersection=halfPlane(intersection,clip[i],clip[(i+1)%clip.length],1);
   if(Math.abs(area(intersection))<1e-9){next.push(polygon);continue;}
   let inside=polygon;
   for(let i=0;i<clip.length&&inside.length>=3;i++){
    const a=clip[i],b=clip[(i+1)%clip.length],outside=halfPlane(inside,a,b,-1);
    if(outside.length>=3&&Math.abs(area(outside))>1e-10)next.push(outside);
    inside=halfPlane(inside,a,b,1);
   }
  }
  remaining=next;if(!remaining.length)break;
 }
 return remaining;
}
export function cutSurfaceMesh(data,index){
 const n=data.positions.length/3,keys=Object.keys(data).filter(k=>k!=='indices'&&(Array.isArray(data[k])||ArrayBuffer.isView(data[k]))&&data[k].length%n===0),sizes=Object.fromEntries(keys.map(k=>[k,data[k].length/n]));
 const out=Object.fromEntries(keys.map(k=>[k,[]]));out.indices=[];
 for(let i=0;i<data.indices.length;i+=3){
  const tri=[0,1,2].map(j=>{const id=data.indices[i+j],v={x:data.positions[id*3],z:data.positions[id*3+2]};for(const key of keys)v[key]=Array.from(data[key].slice(id*sizes[key],(id+1)*sizes[key]));return v;});
  for(const poly of subtractFootprints(tri,index))for(let j=1;j<poly.length-1;j++){
   const face=[poly[0],poly[j],poly[j+1]];if(Math.abs(area(face))<1e-10)continue;
   for(const v of face){out.indices.push(out.positions.length/3);for(const key of keys)out[key].push(...v[key]);}
  }
 }
 return out;
}
