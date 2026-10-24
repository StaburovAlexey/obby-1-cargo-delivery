import {pathToFileURL} from 'node:url';
import * as THREE from '../../dist/vendor/three.module.js';
import {buildCity} from '../../dist/network-scene.js';
import {routePointAtDistance} from '../../dist/route-network.js';
import {SHADOW_LAYOUT,followShadowLight} from '../../dist/scene-lighting.js';
import {createSpatialRenderer} from '../../dist/spatial-render.js';

export function measureGeometry({cellSize=128,maxDistance=Infinity}={}){
 const scene=new THREE.Scene(),city=buildCity(THREE);scene.add(city.group);const sources=[];
 city.group.traverse(o=>{if(o.isMesh)sources.push(o);});
 const spatial=createSpatialRenderer(THREE,{roots:[city.group],cellSize}),camera=new THREE.PerspectiveCamera(53,1,.5,1800),sun=new THREE.DirectionalLight();
 scene.add(sun,sun.target);sun.shadow.mapSize.set(SHADOW_LAYOUT.mapSize,SHADOW_LAYOUT.mapSize);
 Object.assign(sun.shadow.camera,{near:SHADOW_LAYOUT.near,far:SHADOW_LAYOUT.far});
 const samples=[],frustum=c=>new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse),c.coordinateSystem,c.reversedDepth);
 try{
  for(const [width,height]of [[375,812],[812,375]])for(const distance of [100,500,1500,4000,8000,12000,15000])for(const turn of [0,Math.PI/2,Math.PI]){
   const p=routePointAtDistance(distance),yaw=p.heading+turn;camera.aspect=width/height;camera.updateProjectionMatrix();
   camera.position.set(p.x+Math.sin(yaw)*13,p.height+8.3,p.z+Math.cos(yaw)*13);camera.lookAt(p.x,p.height+1.4,p.z);camera.updateMatrixWorld();
   followShadowLight(sun,{x:p.x,y:p.height,z:p.z},camera.getWorldDirection(new THREE.Vector3()));sun.updateMatrixWorld();sun.target.updateMatrixWorld();sun.shadow.updateMatrices(sun);
   spatial.update({camera,shadowCameras:[sun.shadow.camera],maxDistance});
   const view=frustum(camera),shadow=frustum(sun.shadow.camera);let before=0,after=0,beforeCalls=0,afterCalls=0;
   for(const source of sources){
    const proxy=source.parent.children.find(o=>o.userData.spatialRenderProxy&&o.name===source.name+' (spatial render)');
    const passes=Number(view.intersectsSphere(source.geometry.boundingSphere))+Number(source.castShadow&&shadow.intersectsSphere(source.geometry.boundingSphere));
    before+=passes*source.geometry.index.count/3;beforeCalls+=passes;
    if(proxy.geometry.drawRange.count){after+=passes*proxy.geometry.drawRange.count/3;afterCalls+=passes;}
   }
   samples.push({width,height,distance,turn,before,after,beforeCalls,afterCalls,reduction:1-after/before});
  }
  return{scope:'CPU geometry/frustum accounting including shadow pass, not measured FPS',sourceTriangles:city.stats.triangles,cellMeters:cellSize,samples,
   minimumReduction:Math.min(...samples.map(x=>x.reduction)),meanReduction:samples.reduce((n,x)=>n+x.reduction,0)/samples.length};
 }finally{spatial.dispose();city.dispose();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(measureGeometry(),null,2));
