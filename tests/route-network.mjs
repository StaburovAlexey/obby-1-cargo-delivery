import assert from 'node:assert/strict';
import * as R from '../dist/route-network.js';
const near=(a,b,e=1e-7,message='')=>assert.ok(Math.abs(a-b)<=e,`${message} ${a} != ${b} (±${e})`);
const groups=[];const test=(name,fn)=>{fn();groups.push(name);};

test('all16 graph paths visit ordered biome gates and equal physical length',()=>{
  const paths=[];function visit(node,edges,seen){assert.ok(!seen.has(node),'Graph cycles');if(node==='finish'){paths.push(edges);return;}for(const e of R.NETWORK_EDGES.filter(e=>e.from===node))visit(e.to,[...edges,e],new Set([...seen,node]));}visit('start',[],new Set());assert.equal(paths.length,16);
  for(const path of paths){const biomes=path.map(e=>e.biome).filter((b,i,a)=>!i||b!==a[i-1]);assert.deepEqual(biomes,['city','forest','desert','snow','volcanic']);near(path.reduce((s,e)=>s+e.length,0)+R.ROUTE_DISTANCE_START,R.ROUTE_LENGTH,1e-8);for(const q of R.CHECKPOINT_PROGRESS)assert.equal(path.filter(e=>e.progressFrom<q&&e.progressTo>q).length,1);}
  assert.ok(R.ROUTE_LENGTH>10800&&R.ROUTE_LENGTH<11000);assert.equal(R.FORKS.length,4);
});
test('unchangedspawn/apron, 30m road and continuous height support',()=>{
  const p=R.routePointAtProgress(0);near(p.x,0);near(p.z,6);near(p.height,0);near(p.heading,0);near(R.routePointAtProgress(-17).z,23);
  for(const x of [-57,0,31])for(const z of [26,50,90])near(R.getSurface(x,z).height,0);
  for(const e of R.NETWORK_EDGES)for(let s=5;s<e.length-5;s+=19){const p=R.pointOnEdge(e.id,s),a={x:p.x-14.9*p.right.x,z:p.z-14.9*p.right.z},b={x:p.x+14.9*p.right.x,z:p.z+14.9*p.right.z};assert.ok(R.pointInRoad(a.x,a.z));assert.ok(R.pointInRoad(b.x,b.z));near(Math.hypot(a.x-b.x,a.z-b.z),29.8);assert.ok(R.truckInRoad(p.x,p.z,p.heading));}
});
test('true90degree turns, boundedgrade/radius and no nonlocal crossings',()=>{
  let maxGrade=0,maxK=0;const points=[];for(let q=0;q<=10800;q+=2){const p=R.routePointAtProgress(q);maxGrade=Math.max(maxGrade,Math.hypot(p.gradient.x,p.gradient.z));maxK=Math.max(maxK,Math.abs(p.curvature));if(q%20===0)points.push(p);}
  assert.ok(maxGrade<=.07500001);assert.ok(1/maxK>237);for(const t of R.TURN_DEFINITIONS)near(Math.abs(R.routePointAtProgress(t[1]).heading-R.routePointAtProgress(t[0]).heading),Math.PI/2,1e-10);
  let clearance=Infinity;for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)if(points[j].progress-points[i].progress>120)clearance=Math.min(clearance,Math.hypot(points[j].x-points[i].x,points[j].z-points[i].z));assert.ok(clearance>120,`Nonlocal clearance${clearance}`);
});
test('physical arc inverse and numerical path length agree',()=>{
  for(let d=R.ROUTE_DISTANCE_START;d<=R.ROUTE_LENGTH;d+=1.37){const p=R.routePointAtDistance(d);near(R.routeDistanceAt(p.progress),d,2e-9);}
  for(const e of R.NETWORK_EDGES){let distance=0,previous=R.pointOnEdge(e.id,0);const n=Math.ceil(e.length/.25);for(let i=1;i<=n;i++){const p=R.pointOnEdge(e.id,e.length*i/n);distance+=Math.hypot(p.x-previous.x,p.z-previous.z,p.height-previous.height);previous=p;}near(distance,e.length,.0001,e.id);}
});
test('shared union triangles point upward with exact visibleheight/normal',()=>{
  for(const mesh of [R.ROAD_MESH,R.GROUND_MESH])for(let i=0;i<mesh.indices.length;i+=3){const [a,b,c]=mesh.indices.slice(i,i+3).map(j=>mesh.positions.slice(j*3,j*3+3)),x=(a[0]+b[0]+c[0])/3,z=(a[2]+b[2]+c[2])/3,h=(a[1]+b[1]+c[1])/3,dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],ex=c[0]-a[0],ey=c[1]-a[1],ez=c[2]-a[2],normal=[dy*ez-dz*ey,dz*ex-dx*ez,dx*ey-dy*ex],n=Math.hypot(...normal);assert.ok(normal[1]>0);const surface=R.getSurface(x,z);near(surface.height,h,2e-6);near(surface.normal.x,normal[0]/n,2e-5);near(surface.normal.y,normal[1]/n,2e-5);near(surface.normal.z,normal[2]/n,2e-5);}
});
test('forward/reverse history chooses both arms without distant branch flips',()=>{
  for(const f of R.FORKS)for(const branch of ['main','alternate'])for(const direction of [1,-1]){let history=R.routePointAtProgress(direction>0?f.from-10:f.to+10);const start=direction>0?f.from-9:f.to+9,end=direction>0?f.to+10:f.from-10;for(let q=start;direction>0?q<end:q>end;q+=direction){const p=R.routePointAtProgress(q,{branch}),hit=R.projectRoad(p.x,p.z,history);near(hit.progress,q,.001);if(q>f.splitOverlapEnd+15&&q<f.mergeOverlapStart-15)assert.equal(hit.edgeId,`${f.id}-${branch}`);history=hit;}}
  for(const f of R.FORKS){const q=(f.from+f.to)/2,a=R.routePointAtProgress(q,{branch:'alternate'}),b=R.routePointAtProgress(q),hit=R.projectRoad(b.x,b.z,a);assert.equal(hit.edgeId,a.edgeId);assert.ok(hit.distanceSquared>(2*f.offset-1)**2);}
});
test('full footprint catches median tips even when all corners are onroad',()=>{
  for(const f of R.FORKS){const q=f.splitOverlapEnd+1,a=R.routePointAtProgress(q,{branch:'alternate'}),b=R.routePointAtProgress(q),x=(a.x+b.x)/2,z=(a.z+b.z)/2,heading=R.routePointAtProgress(f.from).heading,body=R.truckFootprint(x,z,heading);assert.ok(body.every(p=>R.pointInRoad(p.x,p.z)),`${f.id} fixturecorners`);assert.ok(R.corridorContact(x,z,heading),`${f.id} median escapedbodytest`);assert.ok(!R.truckInRoad(x,z,heading));}
  for(const q of [0,1100,2450,3500,4250,6700,8000,10300]){const p=R.routePointAtProgress(q);assert.ok(R.truckInRoad(p.x,p.z,p.heading));for(const side of [-1,1])assert.ok(R.corridorContact(p.x+side*13*p.right.x,p.z+side*13*p.right.z,p.heading));}
});
test('safe common checkpoints and smooth fork joins',()=>{
  for(const q of R.CHECKPOINT_PROGRESS){assert.ok(!R.FORKS.some(f=>q>f.from&&q<f.to));const p=R.routePointAtProgress(q);for(const side of [-1,1])assert.ok(R.truckInRoad(p.x+side*8*p.right.x,p.z+side*8*p.right.z,p.heading));}
  for(const f of R.FORKS)for(const q of [f.from,f.to]){const main=R.routePointAtProgress(q),alt=R.routePointAtProgress(q,{branch:'alternate'});near(main.x,alt.x,1e-8);near(main.z,alt.z,1e-8);near(main.height,alt.height);near(main.heading,alt.heading);for(const delta of [-.01,.01])near(R.routeHeight(q+delta),main.height,1e-8);}
});
console.log(`Route network: ${groups.length}/${groups.length} groups passed. ${JSON.stringify(R.NETWORK_STATS)}`);
console.log(groups.map(g=>`- ${g}`).join('\n'));
