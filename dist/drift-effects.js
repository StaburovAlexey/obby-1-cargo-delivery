import {DEFAULT_VEHICLE_SMOKE_ID,getVehicleSmokeStyle} from './vehicle-smoke-catalog.js';
import {createSmokeSpriteAtlas,SMOKE_SPRITE_INDEX} from './vehicle-smoke-sprites.js';

export const DRIFT_EFFECTS=Object.freeze({smokeCapacity:72,skidCapacity:1024,skidLife:26});
const fallbackWheels=[{center:[-1.3025,.615,2.2215],halfWidth:.23},{center:[1.3025,.615,2.2215],halfWidth:.23}];
const vertex='attribute float opacity; varying float fade; void main(){fade=opacity; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';
const fragment='varying float fade; void main(){if(fade<0.003)discard;gl_FragColor=vec4(vec3(0.045,0.05,0.055),fade); #include <colorspace_fragment>\n}';
export function createDriftEffects(THREE,{height=()=>0}={}){
 const group=new THREE.Group();group.name='Vehicle tire smoke and skid trails';
 const smokeGeometry=new THREE.PlaneGeometry(1,1),smokeAlpha=new Float32Array(DRIFT_EFFECTS.smokeCapacity);
 smokeGeometry.setAttribute('opacity',new THREE.InstancedBufferAttribute(smokeAlpha,1));
 const pixels=new Uint8Array(32*32*4);
 for(let y=0;y<32;y++)for(let x=0;x<32;x++){const d=Math.hypot((x-15.5)/15.5,(y-15.5)/15.5),i=(y*32+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=255;pixels[i+3]=Math.round(Math.max(0,1-d)**1.7*255);}
 const texture=new THREE.DataTexture(pixels,32,32);texture.needsUpdate=true;texture.magFilter=texture.minFilter=THREE.LinearFilter;
 const smokeMaterial=new THREE.ShaderMaterial({uniforms:{cloud:{value:texture},spriteIndex:{value:0},spriteColumns:{value:1},spriteMode:{value:0}},vertexShader:'attribute float opacity; varying float fade; varying vec2 cloudUv; void main(){fade=opacity;cloudUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}',fragmentShader:'uniform sampler2D cloud; uniform float spriteIndex; uniform float spriteColumns; uniform float spriteMode; varying float fade; varying vec2 cloudUv; void main(){vec4 texel=texture2D(cloud,vec2((cloudUv.x+spriteIndex)/spriteColumns,cloudUv.y));float a=texel.a*fade;if(a<0.003)discard;gl_FragColor=vec4(mix(vec3(0.83,0.84,0.85),texel.rgb,spriteMode),a);\n#include <colorspace_fragment>\n}',transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});
 const smoke=new THREE.InstancedMesh(smokeGeometry,smokeMaterial,DRIFT_EFFECTS.smokeCapacity);smoke.name='Soft rear tire smoke';smoke.count=0;smoke.frustumCulled=false;smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(smoke);
 const positions=new Float32Array(DRIFT_EFFECTS.skidCapacity*12),opacity=new Float32Array(DRIFT_EFFECTS.skidCapacity*4),indices=new Uint16Array(DRIFT_EFFECTS.skidCapacity*6);
 for(let i=0;i<DRIFT_EFFECTS.skidCapacity;i++){const v=i*4;indices.set([v,v+1,v+2,v+1,v+3,v+2],i*6);}
 const skidGeometry=new THREE.BufferGeometry();skidGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));skidGeometry.setAttribute('opacity',new THREE.BufferAttribute(opacity,1).setUsage(THREE.DynamicDrawUsage));skidGeometry.setIndex(new THREE.BufferAttribute(indices,1));
 const skidMaterial=new THREE.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment.replace(' #include','\n#include'),transparent:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
 // Ground decals blend before airborne particles. Neither writes depth, so
 // drawing the tracks later would paint them across the smoke above the road.
 const skids=new THREE.Mesh(skidGeometry,skidMaterial);skids.name='Surface aligned fading skid marks';skids.frustumCulled=false;skids.renderOrder=-1;group.add(skids);
 const clouds=Array.from({length:DRIFT_EFFECTS.smokeCapacity},()=>({life:0})),marks=Array.from({length:DRIFT_EFFECTS.skidCapacity},()=>({life:0,strength:0}));
 const object=new THREE.Object3D(),point=new THREE.Vector3();
 let cloudCursor=0,markCursor=0,credit=0,sequence=1234,rear=fallbackWheels,lastMetadata=null,previous=[null,null],lastRoot=null,smokeCount=0,skidCount=0,disposed=false,smokeStyleId=DEFAULT_VEHICLE_SMOKE_ID,spriteAtlas=null;
 const random=()=>{sequence=(Math.imul(sequence,1664525)+1013904223)>>>0;return sequence/4294967296;};
 const surface=(x,z)=>{const h=height(x,z);return Number.isFinite(h)?h:0;};
 function clearSmoke(){clouds.forEach(p=>p.life=0);smokeAlpha.fill(0);smoke.count=smokeCount=credit=0;smokeGeometry.attributes.opacity.needsUpdate=true;}
 function clear(){clearSmoke();marks.forEach(p=>p.life=0);opacity.fill(0);skidCount=0;previous=[null,null];lastRoot=null;group.visible=false;skidGeometry.attributes.opacity.needsUpdate=true;}
 function setSmokeStyle(id){
  if(disposed||!getVehicleSmokeStyle(id)||(id!==DEFAULT_VEHICLE_SMOKE_ID&&!Object.hasOwn(SMOKE_SPRITE_INDEX,id)))return false;
  if(id===smokeStyleId)return true;
  const custom=id!==DEFAULT_VEHICLE_SMOKE_ID;if(custom&&!spriteAtlas)spriteAtlas=createSmokeSpriteAtlas(THREE);
  smokeStyleId=id;smokeMaterial.uniforms.cloud.value=custom?spriteAtlas:texture;
  smokeMaterial.uniforms.spriteIndex.value=custom?SMOKE_SPRITE_INDEX[id]:0;smokeMaterial.uniforms.spriteColumns.value=custom?5:1;smokeMaterial.uniforms.spriteMode.value=custom?1:0;
  clearSmoke();group.visible=skidCount>0;return true;
 }
 function addMark(a,b,width,strength,wheel){
  const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);if(length<.035)return;if(length>5){previous[wheel]=b;return;}
  const nx=-dz/length*width/2,nz=dx/length*width/2;
  const end=[{x:b.x-nx,z:b.z-nz},{x:b.x+nx,z:b.z+nz}],start=a.edges||[{x:a.x-nx,z:a.z-nz},{x:a.x+nx,z:a.z+nz}];
  const i=markCursor;markCursor=(markCursor+1)%marks.length;if(marks[i].life<=0)skidCount++;marks[i].life=DRIFT_EFFECTS.skidLife;marks[i].strength=Math.min(.75,strength*.8);
  [...start,...end].forEach((p,n)=>{positions[i*12+n*3]=p.x;positions[i*12+n*3+1]=surface(p.x,p.z)+.02;positions[i*12+n*3+2]=p.z;});
  b.edges=end;previous[wheel]=b;skidGeometry.attributes.position.needsUpdate=true;
 }
 function update(dt,state,{enabled=true,grounded=true,metadata,pose,camera}={}){
  if(disposed||!Number.isFinite(dt)||dt<=0)return;dt=Math.min(.05,dt);
  if(metadata!==lastMetadata){lastMetadata=metadata;rear=metadata?.wheelContacts?.filter(w=>!w.front)||fallbackWheels;previous=[null,null];}
  for(const p of clouds)if(p.life>0){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;}
  skidCount=0;for(let i=0;i<marks.length;i++){const p=marks[i];if(p.life>0){p.life=Math.max(0,p.life-dt);if(p.life>0)skidCount++;}const a=p.life>0?p.strength*Math.min(1,p.life/5):0;opacity.fill(a,i*4,i*4+4);}
  const jumped=lastRoot&&state&&Math.hypot(state.x-lastRoot.x,state.z-lastRoot.z)>8;
  const active=enabled&&grounded&&state&&state.linearSpeed>3&&state.driftIntensity>.08&&!jumped;
  if(active){
   const strength=Math.min(1,state.driftIntensity),c=Math.cos(state.heading),s=Math.sin(state.heading);
   for(let i=0;i<2;i++){
    const wheel=rear[i]||fallbackWheels[i],center=wheel.center;
    if(pose?.quaternion&&pose?.position)point.set(...center).applyQuaternion(pose.quaternion).add(pose.position);else point.set(state.x+c*center[0]+s*center[2],0,state.z-s*center[0]+c*center[2]);
    const p={x:point.x,z:point.z};if(previous[i])addMark(previous[i],p,Math.max(.24,(wheel.halfWidth||.23)*2),strength,i);else previous[i]=p;
   }
   const custom=smokeStyleId!==DEFAULT_VEHICLE_SMOKE_ID;
   credit+=dt*(custom?4+3*strength:12+22*strength);
   while(credit>=1){credit--;
    if(custom){
     // One wave fills both rear patches; the fixed ring reuses every particle.
     for(let wheelIndex=0;wheelIndex<2;wheelIndex++){
      const center=(rear[wheelIndex]||fallbackWheels[wheelIndex]).center;
      if(pose?.quaternion&&pose?.position)point.set(...center).applyQuaternion(pose.quaternion).add(pose.position);else point.set(state.x+c*center[0]+s*center[2],0,state.z-s*center[0]+c*center[2]);
      const y=surface(point.x,point.z)+.22;
      for(let member=0;member<4;member++){
       const p=clouds[cloudCursor];cloudCursor=(cloudCursor+1)%clouds.length;
       const angle=random()*Math.PI*2,speed=.45+random()*1.8;
       p.x=point.x;p.y=y;p.z=point.z;p.vx=state.velocityX*.07+Math.cos(angle)*speed;p.vz=state.velocityZ*.07+Math.sin(angle)*speed;
       p.vy=.35+random()*1.5;p.life=.75+((member+wheelIndex*2)%4+random())*.2;p.total=p.life;p.size=.22+(member+random())*.13;
      }
     }
    }else{
     const wheel=rear[cloudCursor%2]||fallbackWheels[cloudCursor%2],center=wheel.center,p=clouds[cloudCursor];cloudCursor=(cloudCursor+1)%clouds.length;
     if(pose?.quaternion&&pose?.position)point.set(...center).applyQuaternion(pose.quaternion).add(pose.position);else point.set(state.x+c*center[0]+s*center[2],0,state.z-s*center[0]+c*center[2]);
     Object.assign(p,{x:point.x,y:surface(point.x,point.z)+.22,z:point.z,vx:state.velocityX*.1+(random()-.5)*.6,vz:state.velocityZ*.1+(random()-.5)*.6,vy:.5+random()*.6,life:1.1+random()*.5,size:.45+random()*.45});p.total=p.life;
    }
   }
  }else{previous=[null,null];credit=0;}
  lastRoot=state?{x:state.x,z:state.z}:null;smokeCount=0;
  const custom=smokeStyleId!==DEFAULT_VEHICLE_SMOKE_ID;
  for(const p of clouds)if(p.life>0){const age=1-p.life/p.total;object.position.set(p.x,p.y,p.z);if(camera?.quaternion)object.quaternion.copy(camera.quaternion);else object.quaternion.identity();object.scale.setScalar(p.size*(1+age*(custom?.4:2.5)));object.updateMatrix();smoke.setMatrixAt(smokeCount,object.matrix);const fade=Math.min(1,Math.max(0,(age-.35)/.65));smokeAlpha[smokeCount]=custom?.95*Math.min(1,age*12)*(1-fade*fade*(3-2*fade)):.43*Math.sin(Math.PI*Math.min(1,age*1.4))*(1-age);smokeCount++;}
  smoke.count=smokeCount;smoke.instanceMatrix.needsUpdate=true;smokeGeometry.attributes.opacity.needsUpdate=true;skidGeometry.attributes.opacity.needsUpdate=true;group.visible=smokeCount>0||skidCount>0;
 }
 clear();return {group,smoke,skids,update,clear,setSmokeStyle,get smokeStyleId(){return smokeStyleId;},get smokeCount(){return smokeCount;},get skidCount(){return skidCount;},smokeCapacity:clouds.length,skidCapacity:marks.length,dispose(){if(disposed)return;disposed=true;clear();smoke.dispose();smokeGeometry.dispose();smokeMaterial.dispose();texture.dispose();spriteAtlas?.dispose();skidGeometry.dispose();skidMaterial.dispose();group.removeFromParent();}};
}
