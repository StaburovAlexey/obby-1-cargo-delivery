import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {CHARACTER_CATALOG} from '../dist/character-catalog.js';

assert.ok(CHARACTER_CATALOG.every(entry=>entry.textured), 'Every character, including the formerly untextured Spider-Man, must have color maps');
const directory=new URL('../art/character-textures/',import.meta.url);
const manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',directory)));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(manifest.characters.length,16);
assert.deepEqual(manifest.characters.map(c=>c.id),CHARACTER_CATALOG.filter(c=>c.id!=='jeff-the-killer').map(c=>c.id));
const jeff=CHARACTER_CATALOG.find(c=>c.id==='jeff-the-killer');
assert.equal(sha(fs.readFileSync(jeff.url)),'ce20af73f26dd3c81746b9a01496e8b0bf1d77409e5034252b375f7c5e808231','Jeff must remain byte-identical');
for(const c of manifest.characters){
 const entry=CHARACTER_CATALOG.find(e=>e.id===c.id),bytes=fs.readFileSync(entry.url);
 assert.equal(sha(bytes),c.sha256,c.id);assert.equal(bytes.length,c.bytes,c.id);
 assert.notEqual(c.sha256,c.originalSha256,c.id);
 const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength)),bin=bytes.subarray(28+jsonLength);
 assert.equal(sha(bin.subarray(0,c.originalBinBytes)),c.originalBinSha256,`${c.id} original binary geometry and motion must remain intact`);
 const contract={meshes:json.meshes,accessors:json.accessors,skins:json.skins,animations:json.animations,nodes:json.nodes,scenes:json.scenes};
 assert.equal(sha(Buffer.from(JSON.stringify(contract))),c.geometryContract,`${c.id} geometry, UV, hierarchy, rig and clips must remain intact`);
 assert.equal(c.textures.length,json.images.length,`${c.id} all image slots must be redesigned`);
 const coveredImages=[];
 for(const spec of c.textures){
  const png=fs.readFileSync(new URL(spec.file,directory));assert.equal(sha(png),spec.sha256,spec.file);
  if(spec.originalImageSha256)assert.notEqual(spec.sha256,spec.originalImageSha256,`${c.id} image must be redesigned`);
  assert.equal(png.readUInt32BE(16),spec.width);assert.equal(png.readUInt32BE(20),spec.height);
  const imageIndex=spec.imageIndex??json.textures[json.materials[spec.materialIndex].pbrMetallicRoughness.baseColorTexture.index].source;
  coveredImages.push(imageIndex);
  if(spec.materialIndex!==undefined)assert.deepEqual(json.materials[spec.materialIndex].pbrMetallicRoughness.baseColorFactor,[1,1,1,1],`${c.id} new texture must not be darkened by the original solid tint`);
  const image=json.images[imageIndex],view=json.bufferViews[image.bufferView];
  assert.equal(image.mimeType,'image/png');assert.equal(image.uri,undefined);
  assert.equal(sha(bin.subarray(view.byteOffset,view.byteOffset+view.byteLength)),spec.sha256,`${c.id} embedded atlas must match delivered PNG`);
 }
 assert.deepEqual(coveredImages.sort((a,b)=>a-b),json.images.map((_,index)=>index),`${c.id} each image slot must be covered once`);
 console.log(`PASS ${c.id}: complete new texture set; original geometry, UV, rig and animation bytes retained`);
}
console.log('PASS all 16 redesigned characters and byte-identical Jeff the Killer');
