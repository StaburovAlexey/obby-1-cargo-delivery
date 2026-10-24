import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
const api=await import('../dist/display-quality.js').catch(error=>{if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;});
const profile={displayShadowDistance:32,materialDistance:34};
function manager(){assert.equal(typeof api.createDisplayQuality,'function','display quality controller is available');return api.createDisplayQuality(THREE);}
function vehicle(id='car',x=0,material=new THREE.MeshStandardMaterial({color:0x336699}),count=5){
 const group=new THREE.Group(),meshes=[];group.position.x=x;
 for(let i=0;i<count;i++){
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,24,12),material);mesh.position.set((i%2)*1.5,1,(i-2)*1.2);mesh.castShadow=i!==1;mesh.receiveShadow=true;group.add(mesh);meshes.push(mesh);
 }
 return {id,root:group,visual:{group,locked:false},meshes};
}
const camera=()=>new THREE.PerspectiveCamera();
const proxies=group=>group.children.filter(child=>child.userData.displayQualityProxy);
const update=(quality,vehicles,extras={})=>quality.update({vehicles,characters:[],camera:camera(),profile,...extras});

test('near and selected vehicles keep exact source assets; distant parked vehicles use shared cheap shading and one invisible shadow proxy',()=>{
 const q=manager(),car=vehicle(),material=car.meshes[0].material,geometry=car.meshes[0].geometry,vertices=geometry.attributes.position.array.slice();
 update(q,[car]);assert.equal(car.meshes[0].material,material);assert.equal(car.meshes[0].castShadow,true);assert.equal(car.meshes[1].castShadow,false);assert.equal(proxies(car.root).length,0);
 car.root.position.x=60;update(q,[car]);const proxy=proxies(car.root)[0];
 assert.ok(car.meshes[0].material.isMeshLambertMaterial);assert.notEqual(car.meshes[0].material,material);assert.equal(car.meshes[0].castShadow,false);
 assert.ok(proxy);assert.equal(proxies(car.root).length,1);assert.equal(proxy.castShadow,true);assert.equal(proxy.material.colorWrite,false);assert.equal(proxy.material.depthWrite,false);assert.equal(proxy.material.transparent,false);
 assert.equal(proxy.layers.test(camera().layers),true,'proxy participates in Three shadow filtering through the main camera layers');
 assert.ok(proxy.geometry.attributes.position.count/3<500,'one merged proxy has a small triangle budget');assert.equal(proxy.geometry.groups.length,0);
 assert.equal(q.stats.proxies,1);assert.equal(q.stats.proxyDraws,2,'one invisible main pass plus one shadow pass before frustum culling');
 update(q,[car],{selectedId:car.id});assert.equal(car.meshes[0].material,material);assert.equal(car.meshes[0].castShadow,true);assert.equal(car.meshes[1].castShadow,false);assert.equal(proxy.visible,false);
 assert.equal(car.meshes[0].geometry,geometry);assert.deepEqual(geometry.attributes.position.array,vertices,'collision/source geometry is unchanged');q.dispose();
});

test('cheap materials retain maps, alpha and vertex colors and are shared without mutating source resources',()=>{
 const q=manager(),map=new THREE.Texture(),alphaMap=new THREE.Texture(),original=new THREE.MeshStandardMaterial({color:0x54789a,map,alphaMap,alphaTest:.25,opacity:.5,transparent:true,vertexColors:true,side:THREE.DoubleSide,depthWrite:false});
 const a=vehicle('a',80,original),b=vehicle('b',90,original);update(q,[a,b]);const cheap=a.meshes[0].material;
 assert.equal(cheap,b.meshes[0].material);assert.equal(cheap.map,map);assert.equal(cheap.alphaMap,alphaMap);assert.equal(cheap.alphaTest,.25);assert.equal(cheap.opacity,.5);assert.equal(cheap.transparent,true);assert.equal(cheap.vertexColors,true);assert.equal(cheap.side,THREE.DoubleSide);assert.equal(cheap.depthWrite,false);assert.ok(cheap.color.equals(original.color));assert.equal(original.isMeshStandardMaterial,true);
 a.root.position.x=1;update(q,[a,b]);assert.equal(a.meshes[0].material,original);assert.equal(b.meshes[0].material,cheap);q.dispose();
});

test('custom hooks, liveries, lamps, physical materials and locked visuals retain their original material paths',()=>{
 const q=manager(),materials=[new THREE.MeshStandardMaterial(),new THREE.MeshStandardMaterial(),new THREE.MeshStandardMaterial(),new THREE.MeshPhysicalMaterial(),new THREE.MeshStandardMaterial()];
 materials[0].onBeforeCompile=()=>{};materials[1].userData.vehicleLivery=true;materials[2].userData.vehicleBrakeLamp=true;materials[4].customProgramCacheKey=()=> 'custom';
 const cars=materials.map((material,i)=>vehicle(String(i),80+i,material));const locked=vehicle('locked',80),lockedOriginal=locked.meshes[0].material;locked.visual.locked=true;cars.push(locked);update(q,cars);
 cars.forEach((car,i)=>assert.equal(car.meshes[0].material,i<materials.length?materials[i]:lockedOriginal));assert.equal(locked.meshes[0].material.isMeshStandardMaterial,true);
 const safe=new THREE.MeshStandardMaterial(),mixed=vehicle('mixed',80);mixed.meshes[0].material=[safe,materials[2]];const sourceArray=mixed.meshes[0].material;
 update(q,[mixed]);assert.ok(mixed.meshes[0].material[0].isMeshLambertMaterial);assert.equal(mixed.meshes[0].material[1],materials[2]);mixed.root.position.x=0;update(q,[mixed]);assert.equal(mixed.meshes[0].material,sourceArray);q.dispose();
});

test('material and shadow distances use independent three-metre hysteresis and profile changes restore detail',()=>{
 const q=manager(),car=vehicle(),original=car.meshes[0].material,p={displayShadowDistance:20,materialDistance:30};
 const at=x=>{car.root.position.x=x;update(q,[car],{profile:p});};at(35);assert.equal(car.meshes[0].castShadow,false);assert.ok(car.meshes[0].material.isMeshLambertMaterial);
 at(32);assert.ok(car.meshes[0].material.isMeshLambertMaterial);at(26);assert.equal(car.meshes[0].material,original);assert.equal(car.meshes[0].castShadow,false);
 at(18);assert.equal(car.meshes[0].castShadow,false);at(16);assert.equal(car.meshes[0].castShadow,true);
 at(35);update(q,[car],{profile:{displayShadowDistance:80,materialDistance:55}});assert.equal(car.meshes[0].castShadow,true);assert.equal(car.meshes[0].material,original);q.dispose();
});

test('distant frozen characters lose only shadows and single-batch cars avoid adding a proxy draw',()=>{
 const q=manager(),character=vehicle('skin',80),single=vehicle('single',80,undefined,1);const visible=character.meshes[0].visible;
 q.update({vehicles:[single],characters:[{group:character.root}],camera:camera(),profile});assert.equal(character.meshes[0].castShadow,false);assert.equal(character.meshes[0].visible,visible);assert.equal(proxies(character.root).length,0);assert.equal(proxies(single.root).length,0);assert.equal(single.meshes[0].castShadow,false);
 character.root.position.x=0;q.update({vehicles:[],characters:[{group:character.root}],camera:camera(),profile});assert.equal(character.meshes[0].castShadow,true);assert.equal(single.meshes[0].castShadow,true,'removed records restore source state');q.dispose();
});

test('async visuals and newly attached descendants are discovered while stable updates reuse the mesh registry',()=>{
 const q=manager(),pending={id:'async',visual:null};update(q,[pending]);assert.equal(q.stats.vehicles,0);
 const loaded=vehicle('async',80);pending.root=loaded.root;pending.visual=loaded.visual;update(q,[pending]);assert.ok(loaded.meshes[0].material.isMeshLambertMaterial);
 const traverse=loaded.root.traverse;loaded.root.traverse=()=>{throw Error('stable quality updates must not traverse every display');};update(q,[pending]);loaded.root.traverse=traverse;
 const nested=new THREE.Group(),late=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());late.castShadow=true;nested.add(late);loaded.root.add(nested);update(q,[pending]);assert.ok(late.material.isMeshLambertMaterial);assert.equal(late.castShadow,false);
 const replacement=vehicle('async',90),old=loaded.meshes[0];pending.root=replacement.root;pending.visual=replacement.visual;update(q,[pending]);assert.equal(old.material.isMeshStandardMaterial,true);assert.equal(old.castShadow,true);assert.equal(proxies(loaded.root).length,0);assert.ok(replacement.meshes[0].material.isMeshLambertMaterial);q.dispose();
});

test('external material changes win over an older LOD snapshot',()=>{
 const q=manager(),car=vehicle('car',80);update(q,[car]);const replacement=new THREE.MeshStandardMaterial();replacement.userData.vehicleLivery=true;car.meshes[0].material=replacement;
 update(q,[car]);assert.equal(car.meshes[0].material,replacement);car.root.position.x=0;update(q,[car]);assert.equal(car.meshes[0].material,replacement);q.dispose();
});

test('clear restores originals and disposes only generated resources; disposal is idempotent and clear permits reuse',()=>{
 const q=manager(),car=vehicle('car',80),original=car.meshes[0].material;let originalsDisposed=0;original.addEventListener('dispose',()=>originalsDisposed++);
 update(q,[car]);const generated=[car.meshes[0].material,proxies(car.root)[0].material,proxies(car.root)[0].geometry],counts=new Map(generated.map(value=>[value,0]));for(const resource of generated)resource.addEventListener('dispose',()=>counts.set(resource,counts.get(resource)+1));
 q.clear();q.clear();assert.equal(car.meshes[0].material,original);assert.equal(car.meshes[0].castShadow,true);assert.equal(proxies(car.root).length,0);for(const count of counts.values())assert.equal(count,1);assert.equal(originalsDisposed,0);assert.equal(q.stats.proxies,0);
 update(q,[car]);assert.ok(car.meshes[0].material.isMeshLambertMaterial);q.dispose();q.dispose();assert.equal(car.meshes[0].material,original);assert.equal(originalsDisposed,0);update(q,[car]);assert.equal(car.meshes[0].material,original);
});

test('a simplified replacement visual does not keep a proxy with more triangles than its remaining source',()=>{
 const q=manager(),car=vehicle('car',80);update(q,[car]);const proxy=proxies(car.root)[0];assert.equal(proxy.visible,true);
 for(const mesh of car.meshes)car.root.remove(mesh);
 for(let i=0;i<3;i++){const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());mesh.castShadow=true;car.root.add(mesh);}
 update(q,[car]);assert.equal(proxy.visible,false,'proxy is disabled when asynchronous replacement removes its geometry savings');assert.equal(q.stats.proxies,0);q.dispose();
});

test('materials with custom clipping, stencil or polygon offset keep their original render state',()=>{
 const q=manager(),materials=[new THREE.MeshStandardMaterial({clippingPlanes:[new THREE.Plane(new THREE.Vector3(1,0,0),0)]}),new THREE.MeshStandardMaterial({stencilWrite:true}),new THREE.MeshStandardMaterial({polygonOffset:true,polygonOffsetFactor:2})];
 const cars=materials.map((material,i)=>vehicle(String(i),80,material));update(q,cars);cars.forEach((car,i)=>assert.equal(car.meshes[0].material,materials[i],'unsupported custom render state is not replaced'));q.dispose();
});

test('mesh and material visibility changes stop proxy shadows without requiring scene-tree changes',()=>{
 const q=manager(),car=vehicle('car',80),source=car.meshes[0].material;update(q,[car]);const proxy=proxies(car.root)[0];assert.equal(proxy.visible,true);
 for(const mesh of car.meshes)mesh.visible=false;update(q,[car]);assert.equal(proxy.visible,false,'hidden source meshes do not leave a ghost shadow');
 for(const mesh of car.meshes){mesh.visible=true;mesh.material.visible=false;}update(q,[car]);assert.equal(proxy.visible,false,'hidden current materials do not cast a proxy shadow');update(q,[car]);assert.equal(proxy.visible,false,'current material visibility remains authoritative across stable frames');
 for(const mesh of car.meshes)mesh.material.visible=true;update(q,[car]);assert.equal(proxy.visible,true);
 source.visible=false;update(q,[car]);assert.equal(proxy.visible,false,'changes to retained source materials also refresh visibility');source.visible=true;update(q,[car]);assert.equal(proxy.visible,true);q.dispose();
});
