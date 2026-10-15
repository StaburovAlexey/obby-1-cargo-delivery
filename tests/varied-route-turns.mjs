
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as C from '../dist/route-network-config.js';
import * as N from '../dist/route-network.js';
import {BRIDGES,bridgeSupport} from '../dist/road-bridges.js';

const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b} (tolerance ${e})`);
const degrees=a=>a*180/Math.PI;
const report={scope:'Offline analytic and actual road-mesh geometry; no browser or human driving claim.',turnCount:C.TURN_DEFINITIONS.length,biomes:[],samples:0,bridgeSamples:0,seams:0};
assert.deepEqual(C.CHECKPOINT_PROGRESS,[180,440,780,1140,1540,1980,2480,3040,3670,4380,5180,6080,7520,9390,11830,15830]);
near(N.ROUTE_LENGTH,15868.841887310184,1e-8);
assert.equal(C.NETWORK_CONFIG.halfWidth,15);
assert.ok(C.TURN_DEFINITIONS.length>=24,'Meaningful bends throughout the route');
assert.ok(C.TURN_DEFINITIONS[0][0]<=100,'Do not restore the 800 m straight city start');
assert.ok(degrees(N.routePointAtProgress(180).heading)>=4,'Visible steering before first checkpoint');
for(let q=-17;q<=80;q++){const p=N.routePointAtProgress(q);near(p.x,0);near(p.heading,0);near(p.z,6-q);}
let previous=0,end=-17;
for(const [a,b,x,y] of C.TURN_DEFINITIONS){
 assert.ok(a>=end&&b>a);near(x,previous);assert.ok(Math.abs(degrees(y-x))>=8-1e-8,'Avoid microscopic artificial wiggles');
 for(const f of C.FORK_DEFINITIONS)assert.ok(b<=f.from||a>=f.to,`Turn overlaps welded fork ${f.id}`);
 for(const q of [a,b]){const l=N.routePointAtProgress(q-1e-3),p=N.routePointAtProgress(q),r=N.routePointAtProgress(q+1e-3);near(l.heading,r.heading,1e-10);near(l.curvature,0,1e-10);near(r.curvature,0,1e-10);near(Math.hypot(r.x-l.x,r.z-l.z),.002,2e-8);assert.ok(N.pointInRoad(p.x,p.z));report.seams++;}
 previous=y;end=b;
}
let maxCurve=0,maxBridgeCurve=0,maxBridgeGrade=0,maxDerivativeError=0;
for(const biome of C.BIOME_DEFINITIONS){
 const turns=C.TURN_DEFINITIONS.filter(([a,b])=>(a+b)/2>=biome.from&&(a+b)/2<biome.to);
 const signs=turns.map(([, ,a,b])=>Math.sign(b-a));
 const reversals=signs.slice(1).filter((s,i)=>s!==signs[i]).length;
 assert.ok(turns.length>=4,`${biome.id} gets several distinct bends`);
 assert.ok(reversals>=2,`${biome.id} has both left and right turns`);
 report.biomes.push({id:biome.id,turns:turns.length,reversals,headingChangeDegrees:turns.reduce((sum,[,,a,b])=>sum+Math.abs(degrees(b-a)),0)});
}
for(let q=0;q<=C.NETWORK_CONFIG.end;q+=2){
 const p=N.routePointAtProgress(q),k=Math.abs(p.curvature);maxCurve=Math.max(maxCurve,k);
 if(q<C.NETWORK_CONFIG.end-4)assert.ok(N.truckInRoad(p.x,p.z,p.heading,p),`Centered body inside actual mesh at ${q}`);
 assert.ok(p.tangent.z<-.7,'Forward-only sweep prevents loops or backwards long straights');
 if(!C.FORK_DEFINITIONS.some(f=>q>=f.from&&q<=f.to)){
  assert.ok(k<=.0023+1e-9,`Drivable bend at ${q}: ${k}`);
  if(q>0&&q<C.NETWORK_CONFIG.end){const a=N.routePointAtProgress(q-.01),b=N.routePointAtProgress(q+.01);const error=Math.hypot((b.x-a.x)/.02-p.tangent.x,(b.z-a.z)/.02-p.tangent.z);maxDerivativeError=Math.max(maxDerivativeError,error);assert.ok(error<1e-6,`Actual centerline tangent agrees at ${q} within 6 m Simpson integration tolerance`);}
 }
 report.samples++;
}
assert.equal(BRIDGES.length,25);
for(const b of BRIDGES){assert.equal(b.to-b.from,24);assert.equal(b.halfWidth,2.5);for(let q=b.from-60;q<=b.to+60;q+=.5){const p=N.routePointAtProgress(q),k=Math.abs(p.curvature),g=Math.hypot(p.gradient.x,p.gradient.z);maxBridgeCurve=Math.max(maxBridgeCurve,k);maxBridgeGrade=Math.max(maxBridgeGrade,g);assert.ok(k<=.0013+1e-9,`${b.id} curvature ${k}`);assert.ok(g<=.065+1e-9);assert.equal(p.biome,b.biome);if(q>=b.from&&q<=b.to)for(const reverse of [0,Math.PI])for(const yaw of [-5,0,5])assert.equal(bridgeSupport({x:p.x+p.right.x*b.offset,z:p.z+p.right.z*b.offset,heading:p.heading+reverse+yaw*Math.PI/180},p).fall,false);report.bridgeSamples++;}}
const shifted=(p,o)=>({x:p.x+p.right.x*o,z:p.z+p.right.z*o});
const refill=shifted(N.routePointAtProgress(440),8),third=N.routePointAtProgress(780);
const starterShortcut=Math.min(...[8,-8].map(o=>{const p=shifted(third,o);return Math.hypot(p.x-refill.x,p.z-refill.z)-8.8;}));
assert.ok(starterShortcut>330,'Starter still cannot shortcut from CP2 to CP3');
Object.assign(report,{passed:true,routeLength:N.ROUTE_LENGTH,firstTurnStart:C.TURN_DEFINITIONS[0][0],maxCurve,maxBridgeCurve,maxBridgeGrade,maxDerivativeError,starterShortcut,configHash:createHash('sha256').update(fs.readFileSync(new URL('../dist/route-network-config.js',import.meta.url))).digest('hex')});
fs.mkdirSync(new URL('../qa/varied-turns/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../qa/varied-turns/geometry.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
