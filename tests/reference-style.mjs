#!/usr/bin/env node
// Visual policy checks on real Three materials; not a WebGL screenshot test.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {buildCity} from '../dist/scene.js';
import {createGarageScene} from '../dist/garage-scene.js';
import {BIOMES} from '../dist/road-layout.js';
import {createAppDom} from './fixtures/app-dom.mjs';
const hsv=(c)=>{const a=[c.r,c.g,c.b];const max=Math.max(...a),min=Math.min(...a),d=max-min;let h=0;if(d){const i=a.indexOf(max);h=((i===0?(a[1]-a[2])/d+(a[1]<a[2]?6:0):i===1?(a[2]-a[0])/d+2:(a[0]-a[1])/d+4)/6);}return{h,s:max?d/max:0,v:max};};
const srgb=hex=>new THREE.Color(hex).convertLinearToSRGB();
const grass=hsv(srgb(BIOMES[0].color));assert.ok(grass.h>.29&&grass.h<.35&&grass.s>.95&&grass.v>.85);
const app=createAppDom({startDriving:false}),d=app.debug;
assert.equal(d.scene.background.getHex(),0x329dff);assert.equal(d.scene.fog.near,500);assert.equal(d.scene.fog.far,1600);
assert.equal(d.renderer.toneMapping,THREE.NeutralToneMapping);assert.equal(d.renderer.toneMappingExposure,1);
assert.ok(hsv(srgb(d.scene.background.getHex())).s>.75);
console.log('PASS reference palette uses saturated lime grass and blue sky with neutral tone mapping and distant fog');
const city=buildCity(THREE,{seed:42});city.group.getObjectByName('Orange delivery truck').visible=false;
const garage=createGarageScene(THREE,city),shell=garage.hangar.children[0],color=new THREE.Color();
for(const name of ['Garage left wall','Garage right wall','Garage rear wall']){const i=shell.userData.partNames.indexOf(name);shell.getColorAt(i,color);const q=hsv(color.clone().convertLinearToSRGB());assert.ok(q.h>.065&&q.h<.11&&q.s>.5&&q.v>.6,name);}
console.log('PASS actual hangar wall instances use warm saturated ochre instead of grey-green');
const root=new THREE.Group();root.add(city.group,garage.group);let triangles=0,batches=0,instances=0;
root.traverse(m=>{if(!m.isMesh)return;let p=m;while(p){if(!p.visible)return;p=p.parent;}const n=m.isInstancedMesh?m.count:1;triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3*n;batches++;instances+=m.isInstancedMesh?m.count:0;});
assert.deepEqual({triangles,batches,instances},{triangles:66752,batches:64,instances:1460});
assert.equal(garage.vehicles.length,3);assert.equal(garage.stands.length,17);assert.equal(garage.desks.length,20);assert.equal(garage.stations.length,11);
for(const f of ['style.css','vehicle-controls.css'])assert.doesNotMatch(fs.readFileSync(new URL('../dist/'+f,import.meta.url),'utf8'),/(?:filter\s*:[^;]*saturate\(|backdrop-filter\s*:[^;]*saturate\()/i);
console.log('PASS scene geometry/instances remain exact in count; no global CSS saturation filter');
app.dispose();garage.dispose();city.dispose();
