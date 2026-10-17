import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {createCanyonEntrance} from '../dist/canyon-entrance.js';
function fixture(){const words=[],context={fillRect(){},strokeRect(){},fillText(text){words.push(text);}},canvas={getContext:()=>context};return {words,document:{createElement:()=>canvas}};}
test('canvas lettering is bound to physical board faces, with fixed world geometry and ordinary depth',()=>{
 const f=fixture(),entrance=createCanyonEntrance(THREE,f),board=entrance.group.getObjectByName('Canyon sign board'),face=board.material[4],map=face.map;
 assert.ok(map.isCanvasTexture);assert.equal(map.image.width,1024);assert.equal(map.image.height,256);assert.equal(map.colorSpace,THREE.SRGBColorSpace);
 assert.equal(board.material[5],face);assert.equal(face.depthTest,true);assert.equal(face.depthWrite,true);assert.equal(face.transparent,false);assert.equal(board.children.length,0);
 assert.deepEqual([board.geometry.parameters.width,board.geometry.parameters.height,board.geometry.parameters.depth],[12,3,.35]);
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
