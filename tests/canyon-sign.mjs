import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {createCanyonEntrance} from '../dist/canyon-entrance.js';
function fixture(){const words=[],context={fillRect(){},strokeRect(){},fillText(text){words.push(text);}},canvas={getContext:()=>context};return {words,document:{createElement:()=>canvas}};}
test('canvas lettering is bound to physical board faces, with fixed world geometry and ordinary depth',()=>{
 const f=fixture(),entrance=createCanyonEntrance(THREE,f),board=entrance.group.getObjectByName('Canyon sign board'),face=board.material[4],map=face.map;
 assert.ok(map.isCanvasTexture);assert.equal(map.image.width,768);assert.equal(map.image.height,256);assert.equal(map.colorSpace,THREE.SRGBColorSpace);
 assert.equal(board.material[5],face);assert.equal(face.depthTest,true);assert.equal(face.depthWrite,true);assert.equal(face.transparent,false);assert.equal(board.children.length,0);
 assert.deepEqual([board.geometry.parameters.width,board.geometry.parameters.height,board.geometry.parameters.depth],[9,3,.9]);
 const transform=board.matrix.toArray(),scale=board.scale.toArray(),rotation=board.quaternion.toArray();
 for(const [aspect,distance]of [[.45,10],[2,120],[1,40]]){const camera=new THREE.PerspectiveCamera(50,aspect,.1,2000);camera.position.set(distance,10,distance);camera.lookAt(board.position);camera.updateProjectionMatrix();entrance.refreshSign();assert.deepEqual(board.scale.toArray(),scale);assert.deepEqual(board.quaternion.toArray(),rotation);assert.deepEqual(board.matrix.toArray(),transform);}
 assert.deepEqual(f.words,['Каньон · дрифт','Пройдите основной маршрут']);entrance.dispose();
});
test('only meaningful access/language changes repaint; resource disposal is idempotent',()=>{
 const f=fixture();let language='ru';const entrance=createCanyonEntrance(THREE,{...f,language:()=>language}),texture=entrance.group.getObjectByName('Canyon sign board').material[4].map,version=texture.version;
 for(let i=0;i<100;i++)entrance.refreshSign();assert.equal(texture.version,version);
 entrance.updateAccess({}, {developerMode:true});assert.equal(f.words.at(-1),'Въезжайте на BMW');assert.equal(texture.version,version+1);
 entrance.updateAccess({}, {developerMode:true});assert.equal(texture.version,version+1);
 language='en';entrance.refreshSign();assert.deepEqual(f.words.slice(-2),['Canyon Drift','Enter in your BMW']);assert.equal(texture.version,version+2);
 entrance.updateAccess({},{});assert.equal(f.words.at(-1),'Complete the main route');
 let disposed=0;texture.addEventListener('dispose',()=>disposed++);entrance.dispose();entrance.dispose();assert.equal(disposed,1);const last=texture.version;language='ru';entrance.refreshSign();assert.equal(texture.version,last);
});
test('old screen-space label and styles are removed; language settings refresh paint',()=>{
 for(const path of ['dist/index.html','dist/app.js','dist/canyon-ui.css'])assert.doesNotMatch(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'),/canyon-entry-label|canyon-entry-note|entrance\.labelAnchor/);
 assert.match(fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8'),/localization\.setLanguage\(selectedLanguage\);canyonMode\?\.entrance\.refreshSign\(\)/);
});

test('narrow thick sign fully contains its post socket from front, back, and oblique views',()=>{
 const entrance=createCanyonEntrance(THREE,fixture()),board=entrance.group.getObjectByName('Canyon sign board'),post=entrance.group.getObjectByName('Canyon sign upright');
 entrance.group.updateMatrixWorld(true);
 assert.equal(board.geometry.parameters.width/board.geometry.parameters.height,board.material[4].map.image.width/board.material[4].map.image.height);
 assert.ok(board.geometry.parameters.width<=12*.8);assert.ok(board.geometry.parameters.depth>=.8);
 assert.deepEqual(post.quaternion.toArray(),board.quaternion.toArray());
 const p=post.geometry.parameters,b=board.geometry.parameters,postTop=post.position.y+p.height/2,boardBottom=board.position.y-b.height/2;
 assert.ok(postTop>boardBottom&&postTop<boardBottom+.4);
 assert.ok(p.depth<b.depth&&p.width<b.width);
 // Every corner of the portion intersecting the panel must lie strictly inside it.
 for(const x of [-p.width/2,p.width/2])for(const z of [-p.depth/2,p.depth/2]){
  const corner=board.worldToLocal(post.localToWorld(new THREE.Vector3(x,p.height/2,z)));
  assert.ok(Math.abs(corner.x)<b.width/2&&Math.abs(corner.z)<b.depth/2&&Math.abs(corner.y)<b.height/2);
 }
 const target=new THREE.Vector3(0,boardBottom+.15-board.position.y,0);board.localToWorld(target);
 for(const side of [-1,1])for(const angle of [-1.1,-.55,0,.55,1.1]){
  const offset=new THREE.Vector3(Math.sin(angle)*15,0,side*Math.cos(angle)*15).applyQuaternion(board.quaternion),origin=target.clone().add(offset);
  const ray=new THREE.Raycaster(origin,target.clone().sub(origin).normalize()),hits=ray.intersectObjects([board,post],false);
  assert.ok(hits.length);assert.equal(hits[0].object,board,`board hides socket: side ${side}, angle ${angle}`);
 }
 entrance.dispose();
});
