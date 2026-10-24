import {polygonIndex,subtractFootprints} from './surface-cut.js';

// Scale a tier about the wall's depth center. Anchoring every tier to the
// rear edge makes their overlapping vertical ranges render on the same plane.
export function barrierTierDepth(near,depth,scale=1){
 const inset=depth*(1-scale)/2;
 return {near:near+inset,far:near+depth-inset};
}

// A roadside wall is a sweep of shared cross-sections, never overlapping boxes.
// Vertices are shared along each face (smooth bends), but split at the four
// profile corners (crisp steel/stone edges). Only real run ends receive caps.
export function barrierStripData(sections,{capStart=true,capEnd=true,capStartOccluders=[],capEndOccluders=[],omitBottom=false}={}){
 const data={position:[],normal:[],color:[],urPrismMeters:[],urPrismSize:[],urPrismFace:[],urShopData:[],uv:[],indices:[]};
 if(sections.length<2)return data;
 const nearArc=[sections[0].distance||0],farArc=[sections[0].distance||0];
 for(let i=1;i<sections.length;i++)for(const [key,arc]of [['near',nearArc],['far',farArc]])arc.push(arc.at(-1)+Math.hypot(sections[i][key].x-sections[i-1][key].x,sections[i][key].z-sections[i-1][key].z));
 const corners=s=>[[s.near.x,s.bottom,s.near.z],[s.far.x,s.bottom,s.far.z],[s.far.x,s.top,s.far.z],[s.near.x,s.top,s.near.z]];
 const faces=[{ids:[0,3],axis:[-1,0,0],kind:'near'},{ids:[2,1],axis:[1,0,0],kind:'far'},{ids:[3,2],axis:[0,1,0],kind:'top'},{ids:[1,0],axis:[0,-1,0],kind:'bottom'}];
 function vertex(p,s,face,along){
  const id=data.position.length/3,c=s.color||{r:1,g:1,b:1},h=s.top-s.bottom,w=Math.hypot(s.far.x-s.near.x,s.far.z-s.near.z),horizontal=Math.abs(face[1])>.5;
  const meters=horizontal?[p[0],p[1],-p[2]]:face[0]?[face[0]<0?0:w,p[1],along]:[Math.hypot(p[0]-s.near.x,p[2]-s.near.z),p[1],0];
  data.position.push(...p);data.normal.push(0,0,0);data.color.push(c.r,c.g,c.b);data.urPrismMeters.push(...meters);data.urPrismSize.push(w,h,Math.max(nearArc.at(-1),farArc.at(-1)));data.urPrismFace.push(...face);data.urShopData.push(0,0);data.uv.push(horizontal?p[0]/4:along/4,horizontal?-p[2]/4:p[1]/4);return id;
 }
 function quad(ids,outward){
  const p=ids.map(i=>data.position.slice(i*3,i*3+3)),a=p[1].map((v,i)=>v-p[0][i]),b=p[2].map((v,i)=>v-p[0][i]),n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  if(n.reduce((s,v,i)=>s+v*outward[i],0)<0)ids=ids.slice().reverse();
  data.indices.push(ids[0],ids[1],ids[2],ids[0],ids[2],ids[3]);
 }
 for(const face of faces){
  if(omitBottom&&face.kind==='bottom')continue;
  const base=data.position.length/3;
  sections.forEach((s,i)=>{const p=corners(s);for(const id of face.ids)vertex(p[id],s,face.axis,id===0||id===3?nearArc[i]:farArc[i]);});
  for(let i=1;i<sections.length;i++){
   const a=sections[i-1],b=sections[i],sign=face.kind==='near'?1:-1,outward=Math.abs(face.axis[1])>.5?face.axis:[sign*(a.near.x+b.near.x-a.far.x-b.far.x),0,sign*(a.near.z+b.near.z-a.far.z-b.far.z)];
   const j=base+(i-1)*2;quad([j,j+1,j+3,j+2],outward);
  }
 }
 for(const [i,enabled,sign]of [[0,capStart,-1],[sections.length-1,capEnd,1]])if(enabled){
  const s=sections[i],a=sections[Math.max(0,i-1)],b=sections[Math.min(sections.length-1,i+1)],outward=[sign*(b.near.x+b.far.x-a.near.x-a.far.x),0,sign*(b.near.z+b.far.z-a.near.z-a.far.z)];
  const width=Math.hypot(s.far.x-s.near.x,s.far.z-s.near.z),ux=(s.far.x-s.near.x)/width,uz=(s.far.z-s.near.z)/width;
  const rectangle=(near,far,bottom,top)=>[{x:near,z:bottom},{x:far,z:bottom},{x:far,z:top},{x:near,z:top}];
  const occluders=(i===0?capStartOccluders:capEndOccluders).map(other=>{
    const near=(other.near.x-s.near.x)*ux+(other.near.z-s.near.z)*uz,far=(other.far.x-s.near.x)*ux+(other.far.z-s.near.z)*uz;
    return rectangle(Math.min(near,far),Math.max(near,far),other.bottom,other.top);
  });
  for(const patch of subtractFootprints(rectangle(0,width,s.bottom,s.top),polygonIndex(occluders))){
    let points=patch.map(v=>[s.near.x+ux*v.x,v.z,s.near.z+uz*v.x]);
    const u=points[1].map((v,j)=>v-points[0][j]),v=points[2].map((v,j)=>v-points[0][j]);
    const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    if(normal.reduce((sum,n,j)=>sum+n*outward[j],0)<0)points.reverse();
    const ids=points.map(point=>vertex(point,s,[0,0,sign],nearArc[i]));
    for(let j=1;j<ids.length-1;j++)data.indices.push(ids[0],ids[j],ids[j+1]);
  }
 }
 for(let i=0;i<data.indices.length;i+=3){const ids=data.indices.slice(i,i+3),p=ids.map(j=>data.position.slice(j*3,j*3+3)),a=p[1].map((v,j)=>v-p[0][j]),b=p[2].map((v,j)=>v-p[0][j]),n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];for(const id of ids)for(let j=0;j<3;j++)data.normal[id*3+j]+=n[j];}
 for(let i=0;i<data.normal.length;i+=3){const length=Math.hypot(...data.normal.slice(i,i+3));if(length)for(let j=0;j<3;j++)data.normal[i+j]/=length;}
 return data;
}

// Simplify rendering cross-sections only. Both edges and both height limits
// must fit the original sweep; end caps and sharp corners remain exact.
// Callers retaining colliders must keep barrierStripData(originalSections).
export function simplifyBarrierSections(sections,{horizontalError=.04,verticalError=.04,colorError=.015,maxSpan=24}={}){
 if(sections.length<3)return sections;
 const arc=[0];
 for(let i=1;i<sections.length;i++)arc.push(arc[i-1]+(Math.hypot(sections[i].near.x-sections[i-1].near.x,sections[i].near.z-sections[i-1].near.z)+Math.hypot(sections[i].far.x-sections[i-1].far.x,sections[i].far.z-sections[i-1].far.z))/2);
 const anchors=[0,...sections.flatMap((section,i)=>i>0&&i<sections.length-1&&section.preserve?[i]:[]),sections.length-1];
 const keep=new Set(anchors),pending=anchors.slice(1).map((last,i)=>[anchors[i],last]);
 while(pending.length){
  const [first,last]=pending.pop();if(last-first<2)continue;
  const a=sections[first],b=sections[last],span=arc[last]-arc[first];let worst=0,index=-1;
  for(let i=first+1;i<last;i++){
   const t=span?(arc[i]-arc[first])/span:(i-first)/(last-first),s=sections[i],mix=(x,y)=>x+(y-x)*t;
   let error=Math.max(...['near','far'].map(key=>Math.hypot(s[key].x-mix(a[key].x,b[key].x),s[key].z-mix(a[key].z,b[key].z))/horizontalError),Math.abs(s.bottom-mix(a.bottom,b.bottom))/verticalError,Math.abs(s.top-mix(a.top,b.top))/verticalError);
   if(a.color&&b.color&&s.color)for(const channel of ['r','g','b'])error=Math.max(error,Math.abs(s.color[channel]-mix(a.color[channel],b.color[channel]))/colorError);
   if(span>maxSpan)error=Math.max(error,1+span/maxSpan*(1-Math.abs(t-.5)));
   if(error>worst){worst=error;index=i;}
  }
  if(worst>1){keep.add(index);pending.push([first,index],[index,last]);}
 }
 return [...keep].sort((a,b)=>a-b).map(i=>sections[i]);
}

export function createBarrierGeometry(THREE,sections,options){
 const data=barrierStripData(sections,options),geometry=new THREE.BufferGeometry();
 for(const [name,values]of Object.entries(data))if(name!=='indices')geometry.setAttribute(name,new THREE.Float32BufferAttribute(values,name==='uv'||name==='urShopData'?2:3));
 geometry.setIndex(data.indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();
 geometry.userData.continuousBarrier=true;geometry.userData.sectionCount=sections.length;return geometry;
}
