import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {createSpatialRenderer} from '../dist/spatial-render.js';

function fixture({castShadow=false,instanced=false}={}){
 const scene=new THREE.Scene(),root=new THREE.Group();scene.add(root);
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute([-2,-2,-10,2,-2,-10,0,2,-10,-2,-2,-1200,2,-2,-1200,0,2,-1200],3));
 geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,.5,1,0,0,1,0,.5,1],2));
 geometry.setIndex([0,1,2,3,4,5]);geometry.computeVertexNormals();
 const material=new THREE.MeshStandardMaterial({color:0x487e65});
 const mesh=instanced?new THREE.InstancedMesh(new THREE.BoxGeometry(2,2,2),material,3):new THREE.Mesh(geometry,material);
 if(instanced){
  const matrix=new THREE.Matrix4();
  for(const [i,z]of [-10,-1200,-20].entries()){mesh.setMatrixAt(i,matrix.makeTranslation(0,0,z));mesh.setColorAt(i,new THREE.Color(i===0?'red':i===1?'green':'blue'));}
 }
 mesh.name='Canonical static mesh';mesh.castShadow=castShadow;mesh.receiveShadow=true;mesh.userData.spatialStatic=true;root.add(mesh);
 const camera=new THREE.PerspectiveCamera(60,1,.5,100);camera.updateMatrixWorld();
 const controller=createSpatialRenderer(THREE,{roots:[root],cellSize:256});
 const proxy=root.children.find(o=>o.userData.spatialRenderProxy);
 const update=(extra={})=>{scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);controller.update({camera,...extra});};
 return{scene,root,mesh,geometry,material,camera,controller,proxy,update};
}
const indices=mesh=>Array.from(mesh.geometry.index.array.slice(0,mesh.geometry.drawRange.count));

test('only visible triangles render through one proxy while canonical geometry and attributes stay intact',()=>{
 const f=fixture();f.update();
 assert.equal(f.root.children.length,2);assert.equal(f.mesh.visible,false);
 assert.equal(f.proxy.material,f.material);assert.equal(f.proxy.receiveShadow,true);
 assert.deepEqual(indices(f.proxy),[0,1,2]);
 assert.deepEqual(Array.from(f.mesh.geometry.index.array),[0,1,2,3,4,5]);
 for(const name of ['position','normal','uv'])assert.equal(f.proxy.geometry.attributes[name],f.mesh.geometry.attributes[name]);
 assert.equal(f.controller.stats.sourceTriangles,2);assert.equal(f.controller.stats.submittedTriangles,1);
 f.controller.dispose();
});
test('camera plus shadow view retains offscreen casters; receivers do not keep unnecessary shadow geometry',()=>{
 for(const castShadow of [true,false]){
  const f=fixture({castShadow}),shadow=new THREE.OrthographicCamera(-20,20,20,-20,.1,50);
  shadow.position.set(0,0,-1170);shadow.updateMatrixWorld();f.update({shadowCameras:[shadow]});
  assert.deepEqual(indices(f.proxy),castShadow?[0,1,2,3,4,5]:[0,1,2]);f.controller.dispose();
 }
});
test('a crossing triangle is retained using its whole bounds even when its centroid is offscreen',()=>{
 const f=fixture();
 f.controller.dispose();
 f.geometry.attributes.position.setXYZ(3,-900,-2,-10);
 f.geometry.attributes.position.setXYZ(4,2,-2,-10);
 f.geometry.attributes.position.setXYZ(5,0,2,-10);
 const c=createSpatialRenderer(THREE,{roots:[f.root]});f.scene.updateMatrixWorld(true);c.update({camera:f.camera});
 const p=f.root.children.find(o=>o.userData.spatialRenderProxy);assert.deepEqual(indices(p),[0,1,2,3,4,5]);c.dispose();
});
test('full view preserves exact index order and empty view draws zero triangles',()=>{
 const f=fixture(),wide=new THREE.OrthographicCamera(-2000,2000,2000,-2000,.1,4000);
 wide.position.z=2000;wide.updateMatrixWorld();f.update({camera:wide});
 assert.deepEqual(indices(f.proxy),Array.from(f.geometry.index.array));
 f.camera.position.x=5000;f.update();assert.equal(f.proxy.geometry.drawRange.count,0);f.controller.dispose();
});
test('unchanged visibility performs no upload; original typed array and proxy capacity are stable',()=>{
 const f=fixture();f.update();const buffer=f.proxy.geometry.index,version=buffer.version;
 f.camera.position.x=.01;f.update();assert.equal(buffer.version,version);assert.equal(f.proxy.geometry.index,buffer);
 f.camera.position.set(0,0,-1190);f.update();assert.deepEqual(indices(f.proxy),[3,4,5]);assert.ok(buffer.version>version);
 f.controller.dispose();
});
test('instanced batches retain original instance order, matrices, colors and canonical count',()=>{
 const f=fixture({instanced:true});f.update();assert.equal(f.mesh.count,3);assert.equal(f.proxy.count,2);
 const matrix=new THREE.Matrix4(),color=new THREE.Color();f.proxy.getMatrixAt(1,matrix);assert.equal(matrix.elements[14],-20);
 f.proxy.getColorAt(1,color);assert.deepEqual(color.toArray(),new THREE.Color('blue').toArray());
 const version=f.proxy.instanceMatrix.version;f.update();assert.equal(f.proxy.instanceMatrix.version,version);f.controller.dispose();
});
test('parent transforms and layer masks are respected',()=>{
 const f=fixture();f.root.position.x=600;f.camera.position.x=600;f.update();assert.deepEqual(indices(f.proxy),[0,1,2]);
 f.camera.layers.set(2);f.update();assert.equal(f.proxy.geometry.drawRange.count,0);
 f.controller.dispose();
});
test('shadow caster layers follow the main camera as in WebGLShadowMap, not the shadow camera layers',()=>{
 const f=fixture({castShadow:true}),shadow=new THREE.OrthographicCamera(-20,20,20,-20,.1,50);
 f.mesh.layers.set(2);f.camera.layers.set(2);shadow.position.z=-1170;shadow.updateMatrixWorld();
 f.update({shadowCameras:[shadow]});assert.deepEqual(indices(f.proxy),[0,1,2,3,4,5]);f.controller.dispose();
});
test('dispose restores canonical visibility and matrix settings without disposing shared assets',()=>{
 const f=fixture();let geometryDisposals=0,materialDisposals=0,proxyDisposals=0;
 f.geometry.addEventListener('dispose',()=>geometryDisposals++);f.material.addEventListener('dispose',()=>materialDisposals++);
 f.proxy.geometry.addEventListener('dispose',()=>proxyDisposals++);
 f.controller.dispose();f.controller.dispose();
 assert.equal(f.root.children.length,1);assert.equal(f.mesh.visible,true);assert.equal(f.mesh.matrixAutoUpdate,true);
 assert.equal(geometryDisposals,0);assert.equal(materialDisposals,0);assert.equal(proxyDisposals,1);
});
test('unmarked dynamic objects are never replaced or frozen',()=>{
 const f=fixture();f.controller.dispose();delete f.mesh.userData.spatialStatic;
 const c=createSpatialRenderer(THREE,{roots:[f.root]});assert.equal(f.root.children.length,1);assert.equal(f.mesh.visible,true);assert.equal(f.mesh.matrixAutoUpdate,true);c.dispose();
});
