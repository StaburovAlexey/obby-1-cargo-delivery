#!/usr/bin/env node


import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import * as N from '../dist/route-network.js';
import {buildCity} from '../dist/network-scene.js';
import {createGarageScene} from '../dist/garage-scene.js';
import {buildRoadHazards,rockApproachIsClear} from '../dist/road-hazards.js';
import {groundHeight,fitTruckToGround} from '../dist/city-driving.js';
import {DELIVERY_CHECKPOINTS} from '../dist/economy-config.js';
import {BIOME_DESTINATIONS,safeBiomeDestination} from '../dist/biome-travel.js';
const directory=new URL('../qa/route-hills/',import.meta.url);
fs.mkdirSync(directory,{recursive:true});
const baseline=JSON.parse(fs.readFileSync(new URL('baseline.json',directory),'utf8'));
const sha=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const near=(a,b,e=1e-8,message='')=>assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=e,`${message}: ${a} != ${b} (+/-${e})`);
const meshPlan=m=>sha({xz:m.positions.filter((_,i)=>i%3!==1),indices:m.indices,progress:m.progress,across:m.across,paintMask:m.paintMask,fringeMask:m.fringeMask});
const profileStats=P=>({minimum:Math.min(...P.map(p=>p[1])),maximum:Math.max(...P.map(p=>p[1])),totalAscent:P.slice(1).reduce((n,p,i)=>n+Math.max(0,p[1]-P[i][1]),0),totalDescent:P.slice(1).reduce((n,p,i)=>n+Math.max(0,P[i][1]-p[1]),0),maximumGrade:P.slice(1).reduce((n,p,i)=>Math.max(n,1.875*Math.abs(p[1]-P[i][1])/(p[0]-P[i][0])),0)});
const report={generatedAt:new Date().toISOString(),scope:'Actual Float32 road/terrain triangles and Three.js procedural structures, offline CPU only. No browser, GPU, gameplay screenshot or mobile validation.',baseline:{...baseline.stats,routeLength:baseline.routeLength},after:{...profileStats(N.ELEVATION_PROFILE),routeLength:N.ROUTE_LENGTH},checks:[]};
const check=(name,fn)=>{const start=performance.now();try{const details=fn();report.checks.push({name,passed:true,milliseconds:Math.round(performance.now()-start),details});console.log('PASS',name,JSON.stringify(details));}catch(error){report.checks.push({name,passed:false,error:error.stack});console.error('FAIL',name,error.message);}};
check('Plan mesh, graph, width, checkpoints, forks and preview anchors are unchanged',()=>{
 assert.deepEqual(N.NETWORK_CONFIG,baseline.networkConfig);assert.deepEqual(N.TURN_DEFINITIONS,baseline.turns);assert.deepEqual(N.FORK_DEFINITIONS,baseline.forks);assert.deepEqual(N.CHECKPOINT_PROGRESS,baseline.checkpoints);assert.deepEqual(N.PREVIEW_PROGRESS,baseline.previews);
 assert.deepEqual(N.NETWORK_EDGES.map(e=>({id:e.id,from:e.from,to:e.to,progressFrom:e.progressFrom,progressTo:e.progressTo,branch:e.branch,biome:e.biome,forkId:e.forkId})),baseline.networkGraph);
 assert.deepEqual({road:meshPlan(N.ROAD_MESH),ground:meshPlan(N.GROUND_MESH)},baseline.meshPlan);
 return{nodes:N.NETWORK_NODES.length,edges:N.NETWORK_EDGES.length,forks:N.FORKS.length,width:2*N.ROUTE.halfWidth,roadTriangles:N.ROAD_MESH.indices.length/3,groundTriangles:N.GROUND_MESH.indices.length/3,planHashes:baseline.meshPlan};
});
check('Higher sustained hills retain the 7.5% analytic cap and C2 height joins',()=>{
 const stats=profileStats(N.ELEVATION_PROFILE);assert.ok(stats.maximum>=60&&stats.maximum<=70);assert.ok(stats.maximum>baseline.stats.maximum*2);assert.ok(stats.totalAscent>baseline.stats.totalAscent*1.4);assert.ok(stats.maximumGrade<=.075000001);
 let maxHeightJoin=0,maxGradeJoin=0,maxSecondDerivativeJoin=0;
 for(const [q,h]of N.ELEVATION_PROFILE){near(N.routeHeight(q),h);near(N.routeHeight(q,1),0);near(N.routeHeight(q,2),0);if(q<=N.ROUTE.start||q>=N.ROUTE.end)continue;const epsilon=.001,dh=Math.abs(N.routeHeight(q-epsilon)-N.routeHeight(q+epsilon)),dg=Math.abs(N.routeHeight(q-epsilon,1)-N.routeHeight(q+epsilon,1)),dd=Math.abs(N.routeHeight(q-epsilon,2)-N.routeHeight(q+epsilon,2));maxHeightJoin=Math.max(maxHeightJoin,dh);maxGradeJoin=Math.max(maxGradeJoin,dg);maxSecondDerivativeJoin=Math.max(maxSecondDerivativeJoin,dd);assert.ok(dh<1e-8&&dg<1e-8&&dd<1e-6);}
 for(const q of [-17,0,30,80,120,160,180,200])near(N.routeHeight(q),0);
 return{...stats,maxHeightJoin,maxGradeJoin,maxSecondDerivativeJoin,knots:N.ELEVATION_PROFILE.length};
});
check('All 11 horizontal service shelves and all 5 preview shelves support full vehicles',()=>{
 const shelves=[];let maxServiceHeightError=0,maxServiceGradient=0;
 for(const q of N.CHECKPOINT_PROGRESS){const height=N.routeHeight(q);for(let d=-20;d<=20;d+=.5){near(N.routeHeight(q+d),height);near(N.routeGrade(q+d),0);for(const lateral of [-14,-8,0,8,14]){const p=N.routePointAtProgress(q+d),s=N.getSurface(p.x+p.right.x*lateral,p.z+p.right.z*lateral,p),dh=Math.abs(s.height-height),g=Math.hypot(s.gradient.x,s.gradient.z);maxServiceHeightError=Math.max(maxServiceHeightError,dh);maxServiceGradient=Math.max(maxServiceGradient,g);assert.ok(s.onRoad);assert.ok(dh<1e-5&&g<1e-7);}}shelves.push({progress:q,height,from:q-20,to:q+20});}
 for(const p of BIOME_DESTINATIONS){assert.ok(safeBiomeDestination(p.id));for(let d=-20;d<=20;d++)near(N.routeHeight(p.progress+d),p.height);for(const gear of [0,Math.PI]){const fit=fitTruckToGround(THREE,p.x,p.z,p.heading+gear,p);near(fit.normal.y,1,1e-9);assert.ok(fit.clearances.every(c=>c>=.011999));}}
 return{shelves,previews:BIOME_DESTINATIONS.map(p=>({id:p.id,progress:p.progress,height:p.height})),maxServiceHeightError,maxServiceGradient};
});
check('Fork arms, islands and shoulders use the same symmetric transverse height field',()=>{
 let samples=0,maxHeightError=0,maxNormalError=0,maxSymmetryError=0;const rows=[];
 for(const f of N.FORKS){const origin=N.routePointAtProgress(f.from),end=N.routePointAtProgress(f.to),t=origin.tangent,r=origin.right;let min=Infinity,max=-Infinity;
  for(let q=f.from;q<=f.to;q+=2){const left=N.routePointAtProgress(q,{branch:'alternate'}),right=N.routePointAtProgress(q),hl=N.getSurface(left.x,left.z,left),hr=N.getSurface(right.x,right.z,right);maxSymmetryError=Math.max(maxSymmetryError,Math.abs(hl.height-hr.height));assert.ok(Math.abs(hl.height-hr.height)<.001);near(left.height,right.height);near(left.gradient.x,right.gradient.x);near(left.gradient.z,right.gradient.z);min=Math.min(min,left.height);max=Math.max(max,left.height);
   for(const lateral of [-100,-50,-15,0,15,50,100]){const x=origin.x+t.x*(q-f.from)+r.x*lateral,z=origin.z+t.z*(q-f.from)+r.z*lateral,s=N.getSurface(x,z),h=N.routeHeight(q),grade=N.routeGrade(q),normal=new THREE.Vector3(-t.x*grade,1,-t.z*grade).normalize(),dh=Math.abs(s.height-h),dn=normal.distanceTo(new THREE.Vector3(s.normal.x,s.normal.y,s.normal.z));maxHeightError=Math.max(maxHeightError,dh);maxNormalError=Math.max(maxNormalError,dn);assert.ok(dh<.002,`${f.id} q${q} v${lateral} height`);assert.ok(dn<.004,`${f.id} q${q} v${lateral} normal ${dn}`);samples++;}}
  for(const q of [f.from,f.to])for(const branch of ['main','alternate']){const p=N.routePointAtProgress(q,{branch});near(p.height,N.routeHeight(q));near(N.routeGrade(q),0);for(const delta of [-.001,.001])near(N.routeHeight(q+delta),p.height,1e-8);}
  const a=N.NETWORK_EDGES.find(e=>e.id===`${f.id}-main`),b=N.NETWORK_EDGES.find(e=>e.id===`${f.id}-alternate`);near(a.length,b.length);rows.push({id:f.id,heightRange:[min,max],lengthPerArm:a.length,startHeight:origin.height,endHeight:end.height});
 }
 assert.ok(rows.filter(f=>f.heightRange[1]-f.heightRange[0]>8).length===3);
 return{forks:rows,samples,maxHeightError,maxNormalError,maxSymmetryError};
});
check('Every road and terrain triangle is the authoritative collision support with no invisible steps',()=>{
 let samples=0,maxHeightError=0,maxNormalError=0,maxRoadGrade=0,maxTerrainGrade=0;
 for(const [name,m]of [['road',N.ROAD_MESH],['terrain',N.GROUND_MESH]])for(let i=0;i<m.indices.length;i+=3){const [a,b,c]=m.indices.slice(i,i+3).map(j=>new THREE.Vector3(...m.positions.slice(j*3,j*3+3))),p=a.clone().add(b).add(c).multiplyScalar(1/3),normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize(),s=N.getSurface(p.x,p.z),dh=Math.abs(s.height-p.y),dn=normal.distanceTo(new THREE.Vector3(s.normal.x,s.normal.y,s.normal.z)),grade=Math.hypot(normal.x,normal.z)/normal.y;maxHeightError=Math.max(maxHeightError,dh);maxNormalError=Math.max(maxNormalError,dn);if(name==='road')maxRoadGrade=Math.max(maxRoadGrade,grade);else maxTerrainGrade=Math.max(maxTerrainGrade,grade);assert.ok(normal.y>.98);assert.ok(dh<.000003&&dn<.00003,`${name} triangle ${i/3} height ${dh}, normal ${dn}`);samples++;}
 assert.ok(maxRoadGrade<=.075000001);let joins=0,maxSeamStep=0;
 for(const b of N.ROAD_BOUNDARY_SEGMENTS){const x=(b.a.x+b.b.x)/2,z=(b.a.z+b.b.z)/2,p=N.projectRoad(x,z);if(p.progress<N.ROUTE.start+.1||p.progress>N.ROUTE.end-.1)continue;const e=.0005,a=N.getSurface(x+b.normalX*e,z+b.normalZ*e),c=N.getSurface(x-b.normalX*e,z-b.normalZ*e),step=Math.abs(a.height-c.height);maxSeamStep=Math.max(maxSeamStep,step);assert.ok(step<.0002);joins++;}
 return{samples,joins,maxHeightError,maxNormalError,maxSeamStep,maxRoadGrade,maxTerrainGrade,note:'Outside-curve terrain grades reflect unchanged 110m shoulders; the full 30m driving surface stays at or below 7.5%.'};
});
check('Four-wheel chassis fit stays continuous over curved hills and tiny fork rows',()=>{
 let fits=0,maxStepNormal=0,maxTinyRowStepNormal=0,minClearance=Infinity,maxClearance=0,maxSupportResidual=0;
 for(const f of N.FORKS)for(const branch of ['main','alternate'])for(const lateral of [-10,0,10]){
  let previous;
  const stations=[...new Set([f.from-4,f.to+4,...Array.from({length:Math.ceil((f.to-f.from)/4)+1},(_,i)=>Math.min(f.to,f.from+i*4)),...[2,4,6,8,10,f.to-f.from-10,f.to-f.from-8,f.to-f.from-6,f.to-f.from-4,f.to-f.from-2].flatMap(d=>[-.01,0,.01].map(delta=>f.from+d+delta))])].sort((a,b)=>a-b);
  for(const q of stations){const p=N.routePointAtProgress(q,{branch}),x=p.x+p.right.x*lateral,z=p.z+p.right.z*lateral,fit=fitTruckToGround(THREE,x,z,p.heading,p),surface=N.getSurface(x,z,p),heightResidual=fit.position.y-surface.height,stepNormal=previous?fit.normal.distanceTo(previous.normal):0;maxStepNormal=Math.max(maxStepNormal,stepNormal);if(previous&&q-previous.q<.03){maxTinyRowStepNormal=Math.max(maxTinyRowStepNormal,stepNormal);assert.ok(stepNormal<.00005,`Tiny-row fit normal jump ${stepNormal} ${f.id}`);}if(previous)maxSupportResidual=Math.max(maxSupportResidual,Math.abs(heightResidual-previous.heightResidual));assert.ok(stepNormal<.01);assert.ok(fit.clearances.every(c=>c>=.011999&&c<.04));minClearance=Math.min(minClearance,...fit.clearances);maxClearance=Math.max(maxClearance,...fit.clearances);previous={q,normal:fit.normal,heightResidual};fits++;}
 }
 return{fits,maxStepNormal,maxTinyRowStepNormal,maxSupportResidual,minClearance,maxClearance,note:'Four-wheel fit samples real triangle heights; tiny-row normal changes checked at 1cm offsets around split/join rows.'};
});
check('True three-dimensional arc remains invertible and equal on both branches',()=>{
 let maxInverseError=0,maxLengthError=0;
 for(let q=N.ROUTE.start;q<=N.ROUTE.end;q+=1.37){const error=Math.abs(N.progressAtDistance(N.routeDistanceAt(q))-q);maxInverseError=Math.max(maxInverseError,error);assert.ok(error<1e-8);}
 for(const e of N.NETWORK_EDGES){let previous=N.pointOnEdge(e.id,0),length=0;const count=Math.ceil(e.length/.5);for(let i=1;i<=count;i++){const p=N.pointOnEdge(e.id,e.length*i/count);length+=Math.hypot(p.x-previous.x,p.z-previous.z,p.height-previous.height);previous=p;}const error=Math.abs(e.length-length);maxLengthError=Math.max(maxLengthError,error);assert.ok(error<.0005);}
 const checkpoints=DELIVERY_CHECKPOINTS.map((p,i)=>({...p,beforeDistance:baseline.checkpointsWithArc[i].distance,arcChange:p.distance-baseline.checkpointsWithArc[i].distance,beforeReward:baseline.checkpointsWithArc[i].reward}));
 return{beforeArc:baseline.routeLength,afterArc:N.ROUTE_LENGTH,arcChange:N.ROUTE_LENGTH-baseline.routeLength,maxInverseError,maxLengthError,checkpoints};
});
check('256 hazard seeds retain protected stops and unobstructed two-way rock sightlines',()=>{
 let hazards=0,rocks=0;for(let seed=0;seed<256;seed++){const list=buildRoadHazards(seed);assert.equal(list.length,68);for(const h of list.filter(h=>h.type==='rock')){assert.ok(rockApproachIsClear(h));rocks++;}hazards+=list.length;}
 for(let q=8790;q<=9540;q++)near(N.routeHeight(q),66);
 return{seeds:256,hazards,rocks,flatRockSightline:[8790,9540],height:66};
});
check('Actual buildings, barrier foundations and all 22 service rings remain grounded',()=>{
 const city=buildCity(THREE,{seed:42}),garage=createGarageScene(THREE,city);city.group.updateMatrixWorld(true);garage.group.updateMatrixWorld(true);
 try{let foundations=0,groundSamples=0,minBurial=Infinity,maxBurial=0,ringVertices=0,maxRingHeightSpread=0;
  for(const f of city.features.filter(f=>f.type==='building'||f.type==='barrier'&&f.side)){const points=f.footprint.map(p=>({x:p.x,z:-p.y})),bottom=f.bottom??f.position[2];for(let i=0;i<4;i++)for(let j=0;j<=16;j++){const a=points[i],b=points[(i+1)%4],t=j/16,height=N.getSurface(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t).height,burial=height-bottom;minBurial=Math.min(minBurial,burial);maxBurial=Math.max(maxBurial,burial);assert.ok(burial>.13,`${f.type} ${f.index} floating ${burial}`);groundSamples++;}foundations++;}
  for(const gate of [...garage.deliveries,...garage.stations])for(const mesh of gate.group.children.filter(c=>c.isMesh)){const a=mesh.geometry.attributes.position;let min=Infinity,max=-Infinity;for(let i=0;i<a.count;i++){const p=new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(mesh.matrixWorld),h=groundHeight(p.x,p.z),lift=p.y-h;min=Math.min(min,p.y);max=Math.max(max,p.y);assert.ok(lift>.024&&lift<.046);ringVertices++;}maxRingHeightSpread=Math.max(maxRingHeightSpread,max-min);assert.ok(max-min<.00001);}
  return{foundations,groundSamples,minBurial,maxBurial,rings:66,ringVertices,maxRingHeightSpread};
 }finally{garage.dispose();city.dispose();}
});
function sampleProfile(profile,q){const b=profile.findIndex(p=>p[0]>=q);if(b<=0)return profile[0][1];const [a,h]=profile[b-1],[c,k]=profile[b],t=(q-a)/(c-a);return h+(k-h)*t*t*t*(10+t*(-15+6*t));}
const csv=['progress_m,before_height_m,after_height_m,after_grade_percent'];for(let q=0;q<=N.ROUTE.end;q+=2)csv.push([q,sampleProfile(baseline.profile,q).toFixed(6),N.routeHeight(q).toFixed(6),(N.routeGrade(q)*100).toFixed(6)].join(','));fs.writeFileSync(new URL('elevation-profile.csv',directory),csv.join('\n')+'\n');
const W=1600,H=920,left=70,right=1530,top=130,bottom=435,X=q=>left+q/N.ROUTE.end*(right-left),Y=h=>bottom-h/70*(bottom-top),poly=profile=>Array.from({length:1081},(_,i)=>`${X(i*10).toFixed(2)},${Y(sampleProfile(profile,i*10)).toFixed(2)}`).join(' ');
let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#0e1826"/><g font-family="system-ui,Arial,sans-serif" fill="#f1f5fb"><text x="60" y="48" font-size="30" font-weight="700">Higher hills. The same route. Level stops.</text><text x="60" y="80" font-size="17" fill="#becddd">Actual route geometry · 0–66 m elevation · ≤7.5% across road width · 40 m horizontal service shelves</text>`;
const colors=['#345944','#285744','#775729','#345e7b','#60425c'];for(const [i,b]of N.BIOME_DEFINITIONS.entries()){svg+=`<rect x="${X(Math.max(0,b.from))}" y="108" width="${X(b.to)-X(Math.max(0,b.from))}" height="344" fill="${colors[i]}" opacity=".25"/><text x="${X((Math.max(0,b.from)+b.to)/2)}" y="124" text-anchor="middle" font-size="13" fill="#a9bbc9">${b.id.toUpperCase()}</text>`;}
for(let h=0;h<=70;h+=10)svg+=`<path d="M${left} ${Y(h)}H${right}" stroke="#415168" stroke-width=".7"/><text x="${left-14}" y="${Y(h)+5}" text-anchor="end" font-size="13" fill="#becddd">${h} m</text>`;
svg+=`<polyline points="${poly(baseline.profile)}" fill="none" stroke="#718297" stroke-width="2.5" stroke-dasharray="7 5"/><polyline points="${poly(N.ELEVATION_PROFILE)}" fill="none" stroke="#6ce3b5" stroke-width="3.5"/>`;
for(const [i,q]of N.CHECKPOINT_PROGRESS.entries())svg+=`<circle cx="${X(q)}" cy="${Y(N.routeHeight(q))}" r="5.5" fill="#f7d475" stroke="#0e1826" stroke-width="2"/><text x="${X(q)}" y="${Y(N.routeHeight(q))-12}" text-anchor="middle" font-size="12" fill="#f7d475">${i+1}</text>`;
for(let q=0;q<=N.ROUTE.end;q+=1000)svg+=`<text x="${X(q)}" y="474" text-anchor="middle" font-size="13" fill="#becddd">${q/1000} km</text>`;
svg+=`<text x="60" y="515" font-size="15" fill="#6ce3b5">New profile</text><text x="195" y="515" font-size="15" fill="#8fa0b4">Dashed: previous 0–28 m</text><text x="465" y="515" font-size="15" fill="#f7d475">Dots: all 11 delivery / fuel platforms</text><text x="60" y="559" font-size="20" font-weight="600">Unchanged road footprint, colored by elevation</text>`;
const ps=N.ROAD_MESH.positions,minX=Math.min(...ps.filter((_,i)=>i%3===0)),maxX=Math.max(...ps.filter((_,i)=>i%3===0)),minZ=Math.min(...ps.filter((_,i)=>i%3===2)),maxZ=Math.max(...ps.filter((_,i)=>i%3===2)),scale=Math.min(1460/(maxZ-minZ),240/(maxX-minX)),PX=z=>left+(maxZ-z)*scale,PY=x=>595+(x-minX)*scale;
for(let i=0;i<N.ROAD_MESH.indices.length;i+=3){const tri=N.ROAD_MESH.indices.slice(i,i+3).map(j=>ps.slice(j*3,j*3+3)),height=tri.reduce((sum,p)=>sum+p[1],0)/3,color=`hsl(${195-height/66*155},80%,65%)`;svg+=`<polygon points="${tri.map(p=>`${PX(p[2]).toFixed(2)},${PY(p[0]).toFixed(2)}`).join(' ')}" fill="${color}"/>`;}
for(const [i,q]of N.CHECKPOINT_PROGRESS.entries()){const p=N.routePointAtProgress(q);svg+=`<circle cx="${PX(p.z)}" cy="${PY(p.x)}" r="3.5" fill="#f7d475"/>`;}
svg+=`<text x="990" y="625" font-size="29" fill="#6ce3b5">66 m highest point</text><text x="990" y="666" font-size="18" fill="#becddd">2.36× the previous elevation range</text><text x="990" y="712" font-size="18" fill="#becddd">Forest: 34 → 44 → 36 m</text><text x="990" y="746" font-size="18" fill="#becddd">Desert: 40 → 60 → 42 m</text><text x="990" y="780" font-size="18" fill="#becddd">Snow: 16 → 38 m</text><text x="990" y="814" font-size="18" fill="#becddd">Volcanic: level 66 m rock sightlines</text><text x="60" y="873" font-size="15" fill="#becddd">Offline CPU geometry diagram; not a browser or gameplay screenshot. Profile uses independent vertical scale.</text><text x="60" y="899" font-size="15" fill="#becddd">Route: ${baseline.routeLength.toFixed(3)} → ${N.ROUTE_LENGTH.toFixed(3)} m. Both arms remain equal. Volcanic warning sightlines stay level.</text></g></svg>`;
fs.writeFileSync(new URL('elevation-profile-and-route.svg',directory),svg);
report.runtimeHashes=Object.fromEntries(['route-network-config.js','route-network.js','network-scene.js','road-hazards.js','economy-config.js','career-save.js'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(new URL('../dist/'+f,import.meta.url))).digest('hex')]));report.passed=report.checks.every(c=>c.passed);fs.writeFileSync(new URL('report.json',directory),JSON.stringify(report,null,2)+'\n');console.log(`${report.checks.filter(c=>c.passed).length}/${report.checks.length} hill groups passed.`);process.exitCode=report.passed?0:1;
