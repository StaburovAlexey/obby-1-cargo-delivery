import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {createRenderZones} from '../dist/render-zones.js';

const box=(size=1)=>new THREE.Box3(new THREE.Vector3(-size,-size,-size),new THREE.Vector3(size,size,size));
function fixture(){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(60,1,.1,2000);
 return{scene,camera,zones:createRenderZones(THREE)};
}
function groupAt(scene,x,y,z,{castShadow=false,receiveShadow=false}={}){
 const group=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshBasicMaterial());
 mesh.castShadow=castShadow;mesh.receiveShadow=receiveShadow;group.add(mesh);group.position.set(x,y,z);scene.add(group);
 return group;
}

test('whole groups hide on camera turn and return on reentry without changing descendant visibility',()=>{
 const f=fixture(),group=groupAt(f.scene,0,0,-10),child=group.children[0];
 const record=f.zones.register(group,{box:box()});
 f.zones.update({camera:f.camera});assert.equal(group.visible,true);assert.equal(record.visible,true);
 f.camera.rotation.y=Math.PI;f.zones.update({camera:f.camera});
 assert.equal(group.visible,false);assert.equal(child.visible,true);assert.equal(f.zones.isVisible(group),false);
 assert.deepEqual(f.zones.stats,{registered:1,visible:0,hidden:1});
 f.camera.rotation.y=0;f.zones.update({camera:f.camera});assert.equal(group.visible,true);
 assert.deepEqual(f.zones.stats,{registered:1,visible:1,hidden:0});f.zones.dispose();
});

test('fixed local bounds follow moving scaled parents without traversing dynamic descendants during update',()=>{
 const f=fixture(),parent=new THREE.Group();f.scene.add(parent);parent.position.x=100;parent.scale.set(2,2,2);
 const group=groupAt(parent,0,0,-10),local=box();f.camera.position.x=100;
 f.zones.register(group,{box:local});
 group.traverse=()=>{throw Error('dynamic descendants must not be scanned per frame');};
 group.children[0].geometry.computeBoundingBox=()=>{throw Error('dynamic geometry must not be bounded per frame');};
 f.zones.update({camera:f.camera});assert.equal(group.visible,true);
 parent.position.x=1000;f.zones.update({camera:f.camera});assert.equal(group.visible,false);
 f.camera.position.x=1000;f.zones.update({camera:f.camera});assert.equal(group.visible,true);
 assert.deepEqual(local.min.toArray(),[-1,-1,-1]);assert.deepEqual(local.max.toArray(),[1,1,1]);f.zones.dispose();
});

test('shadow frusta retain offscreen descendant casters beyond fog but exclude ordinary receivers',()=>{
 const f=fixture(),caster=groupAt(f.scene,0,0,10,{castShadow:true}),receiver=groupAt(f.scene,0,0,10,{receiveShadow:true});
 const shadow=new THREE.OrthographicCamera(-5,5,5,-5,.1,30);shadow.position.z=20;
 f.zones.register(caster,{box:box()});f.zones.register(receiver,{box:box()});
 f.zones.update({camera:f.camera,shadowCameras:[shadow],maxDistance:2});
 assert.equal(caster.visible,true);assert.equal(receiver.visible,false);
 f.zones.update({camera:f.camera,maxDistance:2});assert.equal(caster.visible,false);f.zones.dispose();
});

test('fog uses camera depth so screen corners and boxes crossing the full-fog plane remain visible',()=>{
 const f=fixture();f.camera.fov=100;f.camera.updateProjectionMatrix();
 const corner=groupAt(f.scene,80,0,-90),crossing=groupAt(f.scene,0,0,-101),distant=groupAt(f.scene,0,0,-105);
 f.zones.register(corner,{box:box()});f.zones.register(crossing,{box:box(2)});f.zones.register(distant,{box:box()});
 f.zones.update({camera:f.camera,maxDistance:100});
 assert.equal(corner.visible,true);assert.equal(crossing.visible,true);assert.equal(distant.visible,false);
 f.zones.update({camera:f.camera});assert.equal(distant.visible,true);f.zones.dispose();
});

test('world-unit margin retains near-edge groups without changing camera projection',()=>{
 const f=fixture(),plain=groupAt(f.scene,7,0,-10),padded=groupAt(f.scene,7,0,-10);
 f.zones.register(plain,{box:box(.1)});f.zones.register(padded,{box:box(.1),margin:2});
 f.zones.update({camera:f.camera});assert.equal(plain.visible,false);assert.equal(padded.visible,true);f.zones.dispose();
});

test('owner enabled flag and hidden ancestors stay authoritative when culling is disabled',()=>{
 const f=fixture(),parent=new THREE.Group();f.scene.add(parent);
 const group=groupAt(parent,0,0,-10),record=f.zones.register(group,{box:box()});
 record.enabled=false;f.zones.update({camera:f.camera,enabled:false});assert.equal(group.visible,false);
 record.enabled=true;parent.visible=false;f.zones.update({camera:f.camera});assert.equal(parent.visible,false);
 assert.equal(f.zones.isVisible(group),false);assert.equal(record.visible,false);
 assert.deepEqual(f.zones.stats,{registered:1,visible:0,hidden:1});
 parent.visible=true;f.camera.rotation.y=Math.PI;f.zones.update({camera:f.camera});assert.equal(group.visible,false);
 f.zones.update({camera:f.camera,enabled:false});assert.equal(group.visible,true);f.zones.dispose();
});

test('initial automatic bounds are local snapshots and disposal restores initial visibility without disposing assets',()=>{
 const f=fixture(),group=groupAt(f.scene,10,0,-10),hidden=groupAt(f.scene,0,0,-10);hidden.visible=false;
 let disposals=0;group.children[0].geometry.addEventListener('dispose',()=>disposals++);
 f.zones.register(group);f.zones.register(hidden,{box:box()});
 f.zones.update({camera:f.camera});assert.equal(group.visible,false);assert.equal(hidden.visible,false);
 group.position.x=0;f.zones.update({camera:f.camera});assert.equal(group.visible,true);
 group.position.x=1000;f.zones.update({camera:f.camera});assert.equal(group.visible,false);
 f.zones.dispose();f.zones.dispose();assert.equal(group.visible,true);assert.equal(hidden.visible,false);assert.equal(disposals,0);
 assert.deepEqual(f.zones.stats,{registered:0,visible:0,hidden:0});
 f.zones.update({camera:f.camera});assert.equal(group.visible,true);
});

test('empty groups fail open until bounded explicitly and repeated registration does not double count',()=>{
 const f=fixture(),group=new THREE.Group();group.position.z=10;f.scene.add(group);
 const first=f.zones.register(group);assert.equal(f.zones.register(group),first);
 f.zones.update({camera:f.camera});assert.equal(group.visible,true);assert.equal(f.zones.stats.registered,1);f.zones.dispose();
});

test('async display owners can retain future casters and unregister restores a removed display',()=>{
 const f=fixture(),group=groupAt(f.scene,0,0,10),record=f.zones.register(group,{box:box()});
 const shadow=new THREE.OrthographicCamera(-5,5,5,-5,.1,30);shadow.position.z=20;
 record.castShadow=true;f.zones.update({camera:f.camera,shadowCameras:[shadow]});assert.equal(group.visible,true);
 f.zones.update({camera:f.camera});assert.equal(group.visible,false);
 assert.equal(f.zones.unregister(group),true);assert.equal(f.zones.unregister(group),false);
 assert.equal(group.visible,true);assert.deepEqual(f.zones.stats,{registered:0,visible:0,hidden:0});
 f.zones.update({camera:f.camera});assert.equal(group.visible,true);f.zones.dispose();
});
