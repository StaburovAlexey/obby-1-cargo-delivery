// Reuse the original red lens pixels: no floating quads, added lights or
// whole-body recoloring. The source positions are already normalized to -Z.
export function attachShowcaseBrakeLights(THREE,{id,body,bounds,wheels,originalMaterials,materials}){
 const rear=wheels.filter(w=>!w.front),rearZ=rear.reduce((sum,w)=>sum+w.localPosition.z,0)/rear.length;
 const radius=rear.reduce((sum,w)=>sum+w.radius,0)/rear.length;
 const width=bounds.max.x-bounds.min.x,height=bounds.max.y-bounds.min.y;
 const region=new THREE.Vector4(rearZ+radius*.5,width*.16,bounds.min.y+height*.14,bounds.min.y+height*.76);
 const amount={value:0},entries=[];
 body.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const source=originalMaterials.get(mesh);if(!source?.map||!source.emissive)return;
  if(id==='bmwe30'&&source.name!=='Glass')return;
  // Audited Koenigsegg taillight rings; red body paint and low reflectors
  // live in other materials and must never brighten with the brakes.
  if(id==='koenigseggone1'&&source.name!=='lambert16SG')return;
  if(id==='phoenixinterceptor'&&!mesh.name.includes('Brakelights'))return;
  mesh.geometry.computeBoundingBox();
  if(mesh.geometry.boundingBox.max.z<region.x)return;
  const material=source.clone(),hook=source.onBeforeCompile,key=source.customProgramCacheKey();
  const dedicatedLens=id==='phoenixinterceptor';
  material.userData.vehicleBrakeLamp=true;material.userData.vehicleBrakeModel=id;
  material.customProgramCacheKey=()=>key+'|showcase-rear-red-lens-v1';
  material.onBeforeCompile=shader=>{
   hook.call(source,shader);
   shader.uniforms.showcaseBrakeAmount=amount;shader.uniforms.showcaseBrakeRegion={value:region};
   shader.uniforms.showcaseDedicatedBrakeLens={value:dedicatedLens?1:0};
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 showcaseBrakePosition; varying vec3 showcaseBrakeNormal;')
    .replace('#include <begin_vertex>','#include <begin_vertex>\nshowcaseBrakePosition=position; showcaseBrakeNormal=normal;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float showcaseBrakeAmount; uniform float showcaseDedicatedBrakeLens; uniform vec4 showcaseBrakeRegion; varying vec3 showcaseBrakePosition; varying vec3 showcaseBrakeNormal;')
    .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
float showcaseRearLens=step(showcaseBrakeRegion.x,showcaseBrakePosition.z)*step(showcaseBrakeRegion.y,abs(showcaseBrakePosition.x))*step(showcaseBrakeRegion.z,showcaseBrakePosition.y)*step(showcaseBrakePosition.y,showcaseBrakeRegion.w)*step(0.25,abs(normalize(showcaseBrakeNormal).z));
float showcaseRedLens=smoothstep(0.02,0.12,diffuseColor.r)*smoothstep(1.6,2.5,diffuseColor.r/max(max(diffuseColor.g,diffuseColor.b),0.001));
// Phoenix has a separate audited stop-lamp mesh (reverse/amber lamps are
// separate nodes); its diffuse map is dark and its red comes from emission.
float showcaseBrakeMask=mix(showcaseRearLens*showcaseRedLens,1.0,showcaseDedicatedBrakeLens);
totalEmissiveRadiance+=vec3(1.0,0.008,0.004)*3.0*showcaseBrakeAmount*showcaseBrakeMask;`);
  };
  materials.add(material);mesh.material=material;originalMaterials.set(mesh,material);entries.push(mesh);
 });
 if(!entries.length)throw new Error(`No rear lamp geometry found for ${id}`);
 return {metadata:Object.freeze({meshCount:entries.length,emission:3,region:Object.freeze(region.toArray()),source:'original rear red lens pixels'}),
  set(active){amount.value=Math.max(0,Math.min(1,Number(active)||0));},dispose(){amount.value=0;}};
}
