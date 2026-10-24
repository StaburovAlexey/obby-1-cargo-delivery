// Offline metadata from original geometry: parked collisions need no model download.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import * as THREE from '../dist/vendor/three.module.js';
import {COSMO_VEHICLES} from '../dist/cosmo-vehicles.js';
import {BMW_VEHICLE} from '../dist/bmw-vehicle.js';
import {SHOWCASE_VEHICLES} from '../dist/showcase-vehicle-catalog.js';

const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),bounds={};
for(const spec of [...COSMO_VEHICLES,BMW_VEHICLE,...SHOWCASE_VEHICLES]){
  const url=new URL(spec.url);
  // Catalogs point at runtime copies after optimization; always use originals.
  url.pathname=url.pathname.replace('/assets/optimized/','/assets/');
  const doc=await io.read(fileURLToPath(url));
  const box=new THREE.Box3(),point=new THREE.Vector3();
  const rotation=new THREE.Matrix4().makeRotationY(spec.rotation??Math.PI);
  for(const node of doc.getRoot().listNodes()){
    const matrix=new THREE.Matrix4().fromArray(node.getWorldMatrix()).premultiply(rotation);
    for(const primitive of node.getMesh()?.listPrimitives()??[]){
      const position=primitive.getAttribute('POSITION').getArray();
      for(let i=0;i<position.length;i+=3)box.expandByPoint(point.fromArray(position,i).applyMatrix4(matrix));
    }
  }
  const size=box.getSize(new THREE.Vector3());
  const passenger=COSMO_VEHICLES.some(v=>v.id===spec.id);
  const scale=Math.min((passenger?4.1:4.65)/size.x,(passenger?8.64:8)/size.z);
  bounds[spec.id]={min:[-size.x*scale/2,.05,-size.z*scale/2],max:[size.x*scale/2,.05+size.y*scale,size.z*scale/2]};
}
const content='// Generated from untouched source GLBs by scripts/prepare-vehicle-bounds.mjs.\n'+
  '// Available before visual downloads so lazy loading never removes parked collisions.\n'+
  'export const VEHICLE_SOURCE_BOUNDS=Object.freeze('+JSON.stringify(bounds,null,2)+');\n';
await writeFile(new URL('../dist/vehicle-source-bounds.js',import.meta.url),content);
console.log(`Prepared source collision bounds for ${Object.keys(bounds).length} vehicles.`);
