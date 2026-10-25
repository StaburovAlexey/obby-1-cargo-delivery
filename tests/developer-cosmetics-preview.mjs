import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {createDisplayQuality} from '../dist/display-quality.js';
import {createVehicleLiveryPreview} from '../dist/vehicle-livery-preview.js';
import {clearVehicleLiveryTextureCache} from '../dist/vehicle-livery-materials.js';

test('a deferred gallery restores display-quality source materials at the exact time its first preview clones are made',async()=>{
 const group=new THREE.Group(),material=new THREE.MeshStandardMaterial();material.name='Material.015';
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,2),material);group.add(mesh);
 const source={group,body:group,metadata:{id:'bmwreward'}},quality=createDisplayQuality(THREE),camera=new THREE.PerspectiveCamera();camera.position.z=100;
 quality.update({vehicles:[{id:'bmwreward',visual:source}],camera,profile:{materialDistance:0}});
 assert.equal(mesh.material.isMeshLambertMaterial,true);
 const host={clientWidth:360,clientHeight:240,append(){},ownerDocument:{hidden:false,defaultView:{requestAnimationFrame:()=>1,cancelAnimationFrame(){}},addEventListener(){},removeEventListener(){}}};
 const preview=createVehicleLiveryPreview(THREE,host,{
  beforeClone:()=>quality.clear(),textureLoader:async()=>new THREE.Texture(),
  createRenderer:()=>({domElement:{setAttribute(){},remove(){}},setPixelRatio(){},setSize(){},setClearColor(){},render(){},dispose(){}}),
 });
 try{assert.equal(await preview.show(source,'bmwreward','anime'),true);assert.equal(mesh.material,material);}
 finally{preview.dispose();quality.dispose();clearVehicleLiveryTextureCache();mesh.geometry.dispose();material.dispose();}
});
