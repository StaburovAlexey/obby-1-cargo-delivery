#!/usr/bin/env node
// Actual deformed vertices across complete idle/run cycles, without a renderer.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {loadCharacter,CHARACTER_CATALOG} from '../dist/character.js';
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1024,height:512,close(){}});
const report=[];
for(const entry of CHARACTER_CATALOG){
 const b=fs.readFileSync(entry.url),c=await loadCharacter(THREE,{id:entry.id,data:b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)});
 let maxRadius=0,maxX=0,maxZ=0;const v=new THREE.Vector3();
 function sample(){c.group.updateMatrixWorld(true);c.group.traverse(o=>{if(!o.isMesh)return;for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,v).applyMatrix4(o.matrixWorld);maxRadius=Math.max(maxRadius,Math.hypot(v.x,v.z));maxX=Math.max(maxX,Math.abs(v.x));maxZ=Math.max(maxZ,Math.abs(v.z));}});}
 for(let i=0;i<900;i++){c.update(1/30,i<270?0:i<540?7:i<630?0:4.5,0);if(i%2===0)sample();}
 const limit=entry.id==='jandel'?1.85:1.6;assert.ok(maxRadius<limit,`${entry.id} footprint ${maxRadius} exceeds ${limit}`);
 const row={id:entry.id,maxRadius,maxX,maxZ,capsule:limit};report.push(row);console.log(`PASS ${entry.id}: sampled horizontal radius ${maxRadius.toFixed(4)} < capsule ${limit}`);c.dispose();
}
fs.writeFileSync(new URL('./latest-character-footprints-report.json',import.meta.url),JSON.stringify(report,null,2));
