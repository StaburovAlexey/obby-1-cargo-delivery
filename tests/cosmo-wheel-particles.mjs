import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {createWheelParticles} from '../dist/wheel-particles.js';
import {routePointAtProgress} from '../dist/road-layout.js';
const p=routePointAtProgress(3800),contacts=[[-.8,.4,-1.1],[.8,.4,-1.1],[-.8,.4,1.2],[.8,.4,1.2]],metadata={wheels:contacts.map(center=>({center}))};
for(const heading of [0,.8,Math.PI]){
 const particles=createWheelParticles(THREE);particles.update(.05,{x:p.x,z:p.z,heading,pathDistance:10,linearSpeed:10,velocityX:0,velocityZ:0},true,metadata);
 assert.equal(particles.count,2);const m=new THREE.Matrix4(),v=new THREE.Vector3();
 for(let i=0;i<2;i++){particles.mesh.getMatrixAt(i,m);v.setFromMatrixPosition(m);const [x,,z]=contacts[i];assert(Math.abs(v.x-(p.x+Math.cos(heading)*x+Math.sin(heading)*z))<.001);assert(Math.abs(v.z-(p.z-Math.sin(heading)*x+Math.cos(heading)*z))<.001)}
 particles.clear();assert.equal(particles.count,0);particles.dispose();
}
console.log('PASS imported wheel dirt emitters use actual contact centers forward/reverse/yaw; same bounded pool.');
