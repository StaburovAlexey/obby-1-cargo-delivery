#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]||fileURLToPath(new URL('../..',import.meta.url)));
const output=path.resolve(process.argv[3]||fileURLToPath(new URL('route-geometry-report.json',import.meta.url)));
const at=name=>import(pathToFileURL(path.join(root,'dist',name+'.js')));
const C=await at('route-network-config'),N=await at('route-network');
const baselineRoot=path.resolve(process.argv[4]||'/tmp/controlled-skid-baseline');
const baselineN=await import(pathToFileURL(path.join(baselineRoot,'dist/route-network.js')));
const {BRIDGES}=await at('road-bridges');
const {buildRoadHazards,ROAD_HAZARD_EXCLUSIONS,ROAD_HAZARD_RULES:R,rockApproachIsClear}=await at('road-hazards');
const failures=[],check=(condition,label,row)=>{if(!condition)failures.push({label,row});};
const files=['route-network-config.js','route-network.js','road-bridges.js','road-hazards.js','economy-config.js'];
const hashes=()=>Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'dist',f))).digest('hex')]));
const sourceHashes=hashes(),biomes=[],bridges=[],hazards=buildRoadHazards(42);
let samples=0,maximumGrade=0,maximumCurvature=0,minimumForwardTangent=Infinity;
for(const biome of C.BIOME_DEFINITIONS){
 const turns=C.TURN_DEFINITIONS.filter(([a,b])=>(a+b)/2>=biome.from&&(a+b)/2<biome.to);
 const turnsDegrees=turns.map(([a,b,from,to])=>({from:a,to:b,length:b-a,angle:Math.abs((to-from)*180/Math.PI),sign:Math.sign(to-from)}));
 const changes=turnsDegrees.slice(1).filter((t,i)=>t.sign!==turnsDegrees[i].sign).length;
 biomes.push({id:biome.id,turns:turnsDegrees,changes});check(turns.length>=4&&changes>=2,'each biome has distinct alternating bends',{biome:biome.id,turnsDegrees,changes});
 for(let q=Math.max(0,biome.from);q<biome.to;q+=2)for(const branch of ['main','alternate']){
  const p=N.routePointAtProgress(q,{branch});samples++;
  const grade=Math.hypot(p.gradient.x,p.gradient.z);
  maximumGrade=Math.max(maximumGrade,grade);maximumCurvature=Math.max(maximumCurvature,Math.abs(p.curvature));minimumForwardTangent=Math.min(minimumForwardTangent,-p.tangent.z);
  check([p.x,p.z,p.height,p.heading,p.curvature,grade].every(Number.isFinite),'finite road samples',{q,branch,p});
  const oldPoint=baselineN.routePointAtProgress(q,{branch}),oldGrade=Math.hypot(oldPoint.gradient.x,oldPoint.gradient.z);
  check(grade<=Math.max(.075,oldGrade)+1e-6,'centerline grade does not increase over baseline',{q,branch,grade,oldGrade});
  check(p.tangent.z<-.7,'no backwards loops or hairpins',{q,branch,tangent:p.tangent});
  if(q<C.NETWORK_CONFIG.end-5)check(N.truckInRoad(p.x,p.z,p.heading,p),'centered full footprint stays in road',{q,branch});
 }
}
check(BRIDGES.length===25&&BRIDGES.every(b=>b.halfWidth===2.5&&b.to-b.from===24),'25 unchanged 5m ×24m bridges');
for(const b of BRIDGES){
 let grade=0,curve=0;
 for(let q=b.from-60;q<=b.to+60;q+=.5){const p=N.routePointAtProgress(q);grade=Math.max(grade,Math.hypot(p.gradient.x,p.gradient.z));curve=Math.max(curve,Math.abs(p.curvature));}
 bridges.push({id:b.id,grade,curvature:curve});check(grade<=.06500001&&curve<=.001300001,'bridge approach gentle and visible',bridges.at(-1));
}
let shelfSamples=0;
for(const q of [...C.CHECKPOINT_PROGRESS,...C.PREVIEW_PROGRESS.map(p=>p.progress)])for(let d=-20;d<=20;d+=1){
 const p=N.routePointAtProgress(q+d);shelfSamples++;
 check(Math.abs(p.height-N.routeHeight(q))<1e-7&&Math.hypot(p.gradient.x,p.gradient.z)<1e-7,'service/preview shelf unchanged and level',{q,d});
}
let minimumHazardMargin=Infinity,maximumMoverCurve=0,maximumMoverGrade=0;
check(hazards.length===R.count&&hazards.filter(h=>h.motion).length===R.movingCount,'configured hazard totals retained',{count:hazards.length,moving:hazards.filter(h=>h.motion).length,expected:R.count});
for(const h of hazards){
 const extent=Math.hypot(h.width,h.length)/2+1;
 for(const e of ROAD_HAZARD_EXCLUSIONS){const margin=Math.abs(h.distance-e.distance)-e.radius-extent;minimumHazardMargin=Math.min(minimumHazardMargin,margin);check(margin>=-1e-7,'hazard exclusion preserved',{hazard:h.id,exclusion:e.id,margin});}
 if(h.type==='rock')check(rockApproachIsClear(h),'rock has usable approach',{hazard:h.id});
 if(h.motion)for(let d=-R.moverSightlineMetres;d<=R.moverSightlineMetres;d+=1){const p=N.pointOnEdge(h.edgeId,h.edgeDistance+d),g=Math.hypot(p.gradient.x,p.gradient.z),k=Math.abs(p.curvature);maximumMoverGrade=Math.max(maximumMoverGrade,g);maximumMoverCurve=Math.max(maximumMoverCurve,k);check(g<=R.maximumApproachGrade+1e-9&&k<=R.maximumApproachCurvature+1e-9,'moving hazard sightline preserved',{hazard:h.id,d,g,k});}
}
const finalHashes=hashes();check(JSON.stringify(sourceHashes)===JSON.stringify(finalHashes),'route sources stable during test',{sourceHashes,finalHashes});
const report={passed:failures.length===0,scope:'Independent analytic and sampled CPU route safety audit. This does not establish visual readability or human driving feel.',generatedAt:new Date().toISOString(),sourceHashes,finalHashes,baselineRoot,samples,shelfSamples,maximumGrade,maximumCurvature,minimumForwardTangent,minimumHazardMargin,maximumMoverCurve,maximumMoverGrade,biomes,bridges,hazardCount:hazards.length,failures};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,biomes:undefined,bridges:undefined},null,2));process.exitCode=report.passed?0:1;
