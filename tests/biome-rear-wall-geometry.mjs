import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {barrierTierDepth} from '../dist/roadside-barrier.js';
import {buildCity,polygonIntersectionArea} from '../dist/network-scene.js';

const scales={forest:[1,.97,.76,.5],desert:[1,.89,.67,.4],snow:[1,.88,.89,.47],volcanic:[1,.96,.9,.62,.44]};
test('overlapping biome tiers retain their widths but have distinct front and rear planes',()=>{
 for(const [biome,tiers] of Object.entries(scales)){
  const ranges=tiers.map(scale=>barrierTierDepth(18,12,scale));
  assert.deepEqual(ranges[0],{near:18,far:30},'full-width base and collision envelope stay unchanged');
  for(let i=0;i<tiers.length;i++){
   assert.ok(Math.abs(ranges[i].far-ranges[i].near-12*tiers[i])<1e-10);
   assert.ok(Math.abs((ranges[i].far+ranges[i].near)/2-24)<1e-10);
   for(let j=0;j<i;j++)for(const face of ['near','far'])assert.ok(Math.abs(ranges[i][face]-ranges[j][face])>.05,`${biome}: tier ${i}/${j} ${face} separation`);
  }
 }
});

test('actual Float32 biome wall meshes have no overlapping coplanar rear strips',()=>{
 const city=buildCity(THREE),mesh=city.group.getObjectByName('Massive biome barriers'),g=mesh.geometry,p=g.getAttribute('position');
 const segments=new Map(),biomes=new Set();let tested=0;
 try{
  assert.equal(mesh.material.polygonOffset,false,'geometry fix needs no depth bias');
  for(const part of g.userData.parts.filter(part=>part.continuous)){
   biomes.add(part.name.split(' ')[2]);
   const n=part.sectionCount;
   for(const face of [0,1])for(let i=0;i<n-1;i++){
    const a=part.start+face*n*2+i*2,b=a+2;
    const endpoints=[a,b].map(j=>[p.getX(j),p.getZ(j)]);
    const key=endpoints.map(q=>q.join(',')).sort().join('|');
    const length=Math.hypot(endpoints[1][0]-endpoints[0][0],endpoints[1][1]-endpoints[0][1]);
    const reversed=endpoints[0].join(',')>endpoints[1].join(',');
    const quad=[{x:reversed?length:0,z:p.getY(a)},{x:reversed?length:0,z:p.getY(a+1)},{x:reversed?0:length,z:p.getY(b+1)},{x:reversed?0:length,z:p.getY(b)}];
    for(const prior of segments.get(key)||[])assert.ok(polygonIntersectionArea(quad,prior.quad)<1e-5,`overlapping outer faces: ${part.name} and ${prior.name}`);
    const list=segments.get(key)||[];list.push({name:part.name,quad});segments.set(key,list);tested++;
   }
  }
  assert.deepEqual([...biomes].sort(),['desert','forest','snow','volcanic']);assert.ok(tested>10000);
  // Crest prisms must also be inset from the feature's outer rear edge.
  let crests=0;
  for(const part of g.userData.parts.filter(part=>!part.continuous&&/^Biome barrier \w+ \d+ /.test(part.name))){
   const index=Number(part.name.split(' ')[3]),feature=city.features.find(f=>f.type==='barrier'&&f.index===index&&f.side);
   assert.ok(feature);const [a,b]=[feature.footprint[1],feature.footprint[2]],dx=b.x-a.x,dz=-b.y+a.y,len=Math.hypot(dx,dz);
   for(let i=part.start;i<part.start+part.count;i++){
    const distance=Math.abs(dx*(p.getZ(i)+a.y)-dz*(p.getX(i)-a.x))/len;
    assert.ok(distance>1,`${part.name} still shares the rear plane`);
   }
   crests++;
  }
  assert.ok(crests>50);
 }finally{city.dispose();}
});
