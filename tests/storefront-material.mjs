#!/usr/bin/env node


import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.js';
import { BUILDING_TEXTURE as B, STOREFRONT_STYLE as S, buildingAtlasRegion,
  createBuildingTextureData, createBrickPlasticMaterial, projectBuildingSurface,
  sampleBuildingSurface, sampleStorefront, storefrontVariant } from '../dist/building-material.js';
import { createBuildingTextureData as oldAtlas,
  sampleBuildingSurface as oldSample } from './fixtures/baseline-v7/building-material.js';
import { buildCity } from '../dist/scene.js';
import {createGrassCheckerTextureData} from '../dist/square-stud-texture.js';

const report = { audit: 'Node/actual Three.js + CPU atlas/projection, not WebGL', checks: [] };
const check = (name, fn) => { const details = fn(); report.checks.push({ name, details }); console.log(`PASS ${name}`); };
const near = (a,b,e=1e-8) => assert.ok(Math.abs(a-b)<e, `${a} != ${b}`);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const atlas = createBuildingTextureData();
const pixel = (x,y) => Array.from(atlas.data.subarray((y*atlas.width+x)*4,(y*atlas.width+x)*4+4));
check('One deterministic bounded atlas preserves original upper-facade/checker pixels', () => {
  assert.equal(atlas.data.length, 2097152);
  assert.equal(hash(atlas.data), hash(createBuildingTextureData().data));
  const old = oldAtlas(), checker = createGrassCheckerTextureData();
  for(let tile=0;tile<3;tile++) {
    const r=buildingAtlasRegion(tile);
    for(let y=0;y<128;y++)for(let x=0;x<128;x++) {
      const offset=(y*old.width+tile*128+x)*4;
      const expected = tile === 0 ? old.data.subarray(offset,offset+4) : checker.data.subarray((y*128+x)*4,(y*128+x)*4+4);
      assert.deepEqual(pixel(r.x+x,r.y+y),Array.from(expected));
    }
  }
  return { width:atlas.width,height:atlas.height,baseBytes:atlas.data.length,
    fullMipChainBytes:2796204,originalPixelsPreserved:49152,sha256:hash(atlas.data) };
});
check('Five shop styles bake directly from the same metric CPU sampler', () => {
  const checksums=[];
  for(let variant=0;variant<S.variants.length;variant++) {
    const r=buildingAtlasRegion(B.shopTileStart+variant),bytes=[];
    let letters=0;
    for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++) {
      const expected=sampleStorefront((x+.5)/r.width*S.width,(y+.5)/r.height*S.height,variant)
        .map(v=>Math.max(0,Math.min(255,Math.round(v))));
      const actual=pixel(r.x+x,r.y+y); assert.deepEqual(actual,expected); bytes.push(...actual);
      if(actual[0]===255&&actual[1]===242&&actual[2]===211)letters++;
    }
    assert.ok(letters>350,'Sign letters must have visible coverage');
    checksums.push(hash(Buffer.from(bytes)));
  }
  assert.equal(new Set(checksums).size,5);
  assert.equal(new Set(Array.from({length:20},(_,i)=>storefrontVariant(i+1))).size,5);
  return { styles:S.variants.map(v=>v.name),physicalWidth:S.width,physicalHeight:S.height,checksums };
});
check('Padded atlas UVs cannot reach another slot through mip level four', () => {
  let samples=0;
  for(let tile=0;tile<8;tile++) {
    const r=buildingAtlasRegion(tile),sx=(tile%4)*256,sy=Math.floor(tile/4)*256;

    for(let y=0;y<256;y++)for(let x=0;x<256;x++) {
      const cx=Math.max(r.x,Math.min(r.x+r.width-1,sx+x));
      const cy=Math.max(r.y,Math.min(r.y+r.height-1,sy+y));
      if(sx+x!==cx||sy+y!==cy)assert.deepEqual(pixel(sx+x,sy+y),pixel(cx,cy));
    }
    for(let lod=0;lod<=B.maxAtlasLod;lod++)for(const u of [0,.01,.5,.99,1])for(const v of [0,.01,.5,.99,1]) {
      const divisor=2**lod;
      const x=(r.x+.5+u*(r.width-1))/divisor-.5,y=(r.y+.5+v*(r.height-1))/divisor-.5;
      assert.ok(Math.floor(x)>=sx/divisor&&Math.floor(x)+1<(sx+256)/divisor);
      assert.ok(Math.floor(y)>=sy/divisor&&Math.floor(y)+1<(sy+256)/divisor);samples++;
    }
  }
  return {bilinearFootprints:samples,maxLod:4,shopGutterPixels:16,clampedMaxDerivativeTexels:16};
});
check('World-metric groundfloor width, height, mirroring and grade anchors stay stable', () => {
  let points=0;
  for(const normal of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]])for(const scale of [[7.5,20,6],[12,28,12]]) {
    const side=Math.abs(normal[0])>.5,axis=side?2:0,face=side?0:2;
    const reverse=side?normal[0]>0:normal[2]<0;
    const wallWidth=scale[axis],bays=Math.floor(wallWidth/S.width),margin=(wallWidth-bays*S.width)/2;
    const shopBase=.43,shopId=19;
    const point=(x,y)=>{const p=[0,0,0];p[face]=normal[face]*.5;p[axis]=(reverse?wallWidth-x:x)/wallWidth-.5;p[1]=(shopBase+y)/scale[1]-.5;return p;};
    for(const y of [-.49,0,.7,2.79,3.09])for(const x of [.5,1.4,3.7,4.3]) {
      const p=point(margin+x,y),projected=projectBuildingSurface(p,normal,scale,{shopBase,shopId});
      assert.equal(projected.shopVariant,storefrontVariant(shopId));
      near(projected.surfaceUv[0],x/S.width);near(projected.surfaceUv[1],Math.max(0,y)/S.height);
      sampleBuildingSurface(p,normal,scale,{shopBase,shopId}).forEach((n,i)=>near(n,sampleStorefront(x,Math.max(0,y),projected.shopVariant)[i]));points++;
    }
    for(const y of [3.1001,4.4,7.9,14.3]) {
      const p=point(margin+1.9,y);
      assert.deepEqual(sampleBuildingSurface(p,normal,scale,{shopBase,shopId}),sampleBuildingSurface(p,normal,scale));
    }
    const a=projectBuildingSurface(point(margin+1,.8),normal,scale,{shopBase,shopId});
    const b=projectBuildingSurface(point(margin+1.96,.8),normal,scale,{shopBase,shopId});near(b.surfaceUv[0]-a.surfaceUv[0],.96/4.8);
    const buried=projectBuildingSurface(point(margin+1,-.51),normal,scale,{shopBase,shopId});assert.equal(buried.tile,B.plainTile);
  }
  for(const normal of [[0,1,0],[0,-1,0]])for(const p of [[.1,.5,.2],[-.2,-.5,-.3]])
    assert.deepEqual(sampleBuildingSurface(p,normal,[7.5,20,6],{shopBase:.4,shopId:1}),sampleBuildingSurface(p,normal,[7.5,20,6]));
  return { groundfloorPoints:points,faces:4,physicalDoorWidth:S.doorWidth,belowGradePlinth:S.belowGrade,roofAndUpperFloorUnchanged:true };
});
check('Actual Three material patches one opaque instanced shader and disposes its atlas once', () => {
  const material=createBrickPlasticMaterial(THREE);
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  material.onBeforeCompile(shader);
  assert.match(shader.vertexShader,/attribute vec2 urShopData/);
  assert.match(shader.vertexShader,/modelMatrix \* instanceMatrix/);
  assert.match(shader.vertexShader,/urWall.y - urShopData.x/);
  assert.match(shader.fragmentShader,/textureGrad\(map/);
  assert.match(shader.fragmentShader,/16.0 \/ max\(urFootprint/);
  assert.match(shader.fragmentShader,/smoothstep\(16.0, 32.0/);
  assert.equal(material.transparent,false);assert.equal(material.depthWrite,true);
  assert.equal(material.map.anisotropy,1);assert.equal(material.map.wrapS,THREE.ClampToEdgeWrapping);
  assert.equal(material.map.generateMipmaps,true);assert.equal(material.map.minFilter,THREE.LinearMipmapLinearFilter);
  assert.equal(material.displacementMap,null);assert.equal(material.normalMap,null);
  assert.deepEqual(material.defaultAttributeValues.urShopData,[0,0]);
  let disposed=0;material.map.addEventListener('dispose',()=>disposed++);material.dispose();material.dispose();assert.equal(disposed,1);
  return {threeRevision:THREE.REVISION,opaque:true,textures:'one building atlas + existing shared checker',glslCompile:'Not run; no WebGL available'};
});
check('Actual scene assigns grade metadata to every residence using one shared material', () => {
  const scene=buildCity(THREE,{seed:42}),materials=new Set();let residences=0;const variants=new Set();
  try {
    scene.group.traverse(mesh=>{if(!mesh.isMesh)return;
      for(const part of mesh.geometry.userData.parts||[]){if(!/^Residence /.test(part.name))continue;
        const data=mesh.geometry.getAttribute('urShopData');assert.ok(data,`${mesh.name}: missing urShopData`);
        assert.equal(data.itemSize,2);assert.equal(data.count,mesh.geometry.attributes.position.count);
        const index=part.start;assert.ok(Number.isFinite(data.getX(index))&&data.getX(index)>=0);assert.ok(data.getY(index)>0);
        for(let j=index;j<index+part.count;j++){assert.equal(data.getX(j),data.getX(index));assert.equal(data.getY(j),data.getY(index));}
        variants.add(storefrontVariant(data.getY(index)));materials.add(mesh.material);residences++;
      }
    });
    assert.ok(residences>0);assert.equal(materials.size,1);assert.equal(variants.size,5);
    return {residences,sharedMaterials:materials.size,stylesUsed:variants.size};
  } finally {scene.dispose();}
});
console.log(JSON.stringify(report,null,2));
