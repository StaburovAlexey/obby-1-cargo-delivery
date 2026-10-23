import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';

const worldUrl = new URL('../dist/physics-world.js', import.meta.url);
assert.ok(fs.existsSync(worldUrl), 'The shared physics world module must exist');
const {initializeRapier,getRapier}=await import('../dist/rapier-runtime.js');
await initializeRapier();
const {createPhysicsWorld}=await import(worldUrl);
const R=getRapier();
const fixture=()=>({group:new THREE.Group()});
function surface(parent,name,vertices,indices){
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);
 const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());mesh.name=name;parent.add(mesh);return mesh;
}
const plane=(x0,x1,z0,z1,y=0)=>({vertices:[x0,y,z0,x0,y,z1,x1,y,z1,x1,y,z0],indices:[0,1,2,0,2,3]});
const options=(city=fixture(),extra={})=>({THREE,city,...extra});
const fallBody=(w,x,y,z)=>{const b=w.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x,y,z));w.world.createCollider(R.ColliderDesc.ball(.25),b);return b;};
const run=(w,n=180)=>{for(let i=0;i<n;i++)w.step(1/60);};

test('visible road is finite with a real unsupported hole',()=>{
 const city=fixture();for(const [lo,hi]of [[-8,-2],[2,8]]){const p=plane(lo,hi,-8,8);surface(city.group,'Continuous 30m-wide road',p.vertices,p.indices);}
 const w=createPhysicsWorld(options(city));const supported=fallBody(w,-4,2,0),hole=fallBody(w,0,2,0),outside=fallBody(w,12,2,0);run(w);
 assert.ok(Math.abs(supported.translation().y-.25)<.03);assert.ok(hole.translation().y < -10);assert.ok(outside.translation().y < -10);w.dispose();
});

test('128m chunks preserve every transformed triangle once',()=>{
 const city=fixture();const p=plane(-180,180,-5,5);const mesh=surface(city.group,'Continuous 30m-wide road',p.vertices,p.indices);
 mesh.position.set(300,7,-40);mesh.rotation.y=.4;mesh.scale.set(1.2,1,2);
 const w=createPhysicsWorld(options(city));assert.equal(w.stats.staticTriangles,2);assert.equal(w.stats.chunks,2);
 const triangleKey=points=>points.map(p=>p.map(v=>Math.round(v*1000)/1000).join(',')).sort().join('|');
 const expected=[];for(let i=0;i<p.indices.length;i+=3)expected.push(triangleKey(p.indices.slice(i,i+3).map(index=>new THREE.Vector3(...p.vertices.slice(index*3,index*3+3)).applyMatrix4(mesh.matrixWorld).toArray())));
 const actual=[];w.world.colliders.forEach(c=>{const shape=c.shape;for(let i=0;i<shape.indices.length;i+=3)actual.push(triangleKey(Array.from(shape.indices.slice(i,i+3),index=>Array.from(shape.vertices.slice(index*3,index*3+3)))));});assert.deepEqual(actual.sort(),expected.sort());
 const body=fallBody(w,300,10,-40);run(w);assert.ok(Math.abs(body.translation().y-7.25)<.03);w.dispose();
});

test('removed visual cliff sections remain open to physics queries',()=>{
 const city=fixture(),vertices=[];
 for(const x of [0,20])for(let i=0;i<28;i++)vertices.push(x+(i%2)*10,i<2?0:-48,0);
 surface(city.group,'Layered earth and rock cliffs',vertices,[28,29,30]);
 const w=createPhysicsWorld(options(city));w.step(1/60);
 const cast=x=>w.world.castRay(new R.Ray({x,y:-2,z:2},{x:0,y:0,z:-1}),4,true);
 assert.equal(cast(5),null,'cut branch section must not have an invisible cliff collider');
 assert.ok(cast(25),'retained cliff section must remain solid');w.dispose();
});

test('fixed clock performs one raw world step per tick at 30/60/120fps',()=>{
 for(const fps of [30,60,120]){
  const w=createPhysicsWorld(options());let raw=0,before=0,after=0,frames=0,alpha=-1;const original=w.world.step.bind(w.world);w.world.step=(...args)=>{raw++;return original(...args);};
  const model={beginFrame(){frames++;},beforeStep(dt){assert.equal(dt,1/60);before++;},afterStep(dt){assert.equal(dt,1/60);after++;},getRenderState(a){alpha=a;return {alpha:a};}};
  for(let i=0;i<fps;i++)w.step(1/fps,model);
  assert.ok(w.frameSeconds>=0&&w.frameSeconds<=1/fps+1/60);assert.equal(raw,60);assert.equal(before,60);assert.equal(after,60);assert.equal(frames,fps);assert.ok(alpha>=0&&alpha<1);assert.equal(w.alpha,alpha);
  const prior=raw;w.step(5,model);assert.equal(raw-prior,6);assert.ok(Math.abs(w.frameSeconds-.1)<1e-10);w.step(1/120,model);w.resetTime();assert.equal(w.alpha,0);w.step(1/120,model);assert.equal(raw-prior,6);w.dispose();
 }
});

test('visible walls stop dynamic bodies and retain contact tags',()=>{
 const city=fixture(),wall=new THREE.Mesh(new THREE.BoxGeometry(1,8,8),new THREE.MeshBasicMaterial());
 wall.name='Continuous storefront residences';wall.position.set(2,2,0);city.group.add(wall);
 const w=createPhysicsWorld(options(city));
 const body=fallBody(w,0,2,0);body.setLinvel({x:8,y:0,z:0},true);run(w,20);assert.ok(body.translation().x<1.3);let tag;w.world.colliders.forEach(c=>{if(c.userData?.tag==='wall')tag=c.userData.tag;});assert.equal(tag,'wall');w.dispose();w.dispose();assert.equal(w.stats.disposed,true);
});

test('parked vehicles block driving while the selected parking proxy is disabled',()=>{
 const garage=fixture(),root=new THREE.Group();root.position.set(3,1,0);garage.group.add(root);
 garage.vehicles=[{id:'parked',rig:{root},visual:{metadata:{bounds:{min:[-1,-1,-2],max:[1,1,2]}}}}];
 const w=createPhysicsWorld(options(fixture(),{garage}));
 assert.equal(typeof w.syncParkedVehicles,'function');w.syncParkedVehicles(null);w.step(1/60);
 const ray=new R.Ray({x:0,y:1,z:0},{x:1,y:0,z:0});
 assert.ok(w.world.castRay(ray,6,true),'displayed car has a solid parking proxy');
 w.syncParkedVehicles('parked');w.step(1/60);
 assert.equal(w.world.castRay(ray,6,true),null,'selected car must not hit its own parked proxy');w.dispose();
});

test('moving hazards update once per fixed tick and match kinematic pose',()=>{
 const pose={id:'moving',x:0,z:0,heading:0,groundHeight:0,width:2,height:2,length:2,solid:true};let calls=0;
 const roadHazards={movers:[pose],poses:[pose],poseFor:()=>pose,update(dt,player){assert.ok(Number.isFinite(player.heading));calls++;pose.x+=dt;}};
 const w=createPhysicsWorld(options(fixture(),{roadHazards}));w.step(1/30,{state:{x:0,z:0,heading:0}});assert.equal(calls,2);assert.equal(w.stats.kinematicBodies,1);
 let body;w.world.bodies.forEach(b=>{if(b.isKinematic())body=b;});assert.ok(Math.abs(body.translation().x-1/30)<1e-6);assert.ok(Math.abs(body.translation().y-1)<1e-6);w.dispose();
});

test('garage colliders use visible instance transforms and keep the exit open',()=>{
 const garage=fixture(),geometry=new THREE.BoxGeometry(1,1,1),mesh=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial(),3),obj=new THREE.Object3D();
 const parts=[['Garage floor',[0,-.2,5],[20,.4,20]],['Garage left wall',[-10,3,5],[.5,6,20]],['Garage rear stripe',[0,3,14],[20,.5,.1]]];
 mesh.userData.partNames=parts.map(p=>p[0]);parts.forEach(([,p,s],i)=>{obj.position.set(...p);obj.scale.set(...s);obj.updateMatrix();mesh.setMatrixAt(i,obj.matrix);});garage.group.add(mesh);
 const w=createPhysicsWorld(options(fixture(),{garage}));assert.equal(w.stats.boxes,2);const b=fallBody(w,0,2,0);run(w);assert.ok(Math.abs(b.translation().y-.25)<.03);w.dispose();
});

test('locked canyon barrier enables and disables its real arm collider',()=>{
 const entrance=fixture();entrance.unlocked=false;const arm=new THREE.Mesh(new THREE.BoxGeometry(20,.32,.35),new THREE.MeshBasicMaterial());arm.name='Closed red and white barrier arm';arm.position.set(0,1.65,0);entrance.group.add(arm);
 const w=createPhysicsWorld(options(fixture(),{canyon:{entrance}}));let armCollider;w.world.colliders.forEach(c=>{if(c.userData?.tag==='gate')armCollider=c;});assert.ok(armCollider.isEnabled());w.updateGate(true);assert.equal(armCollider.isEnabled(),false);w.updateGate(false);assert.equal(armCollider.isEnabled(),true);w.dispose();
});

test('actual city bridge gaps stay empty and simplified cliffs preserve exposed edges',async()=>{
 const {buildCity}=await import('../dist/network-scene.js');const {BRIDGES}=await import('../dist/road-bridges.js');const {routePointAtProgress}=await import('../dist/route-network.js');
 const city=buildCity(THREE),start=performance.now(),w=createPhysicsWorld(options(city));
 const road=city.group.getObjectByName('Continuous 30m-wide road');const terrain=city.group.getObjectByName('Closed continuous terrain foundation');
 const cliffs=city.group.getObjectByName('Layered earth and rock cliffs');const expectedCliffTriangles=new Set(Array.from(cliffs.geometry.index.array,index=>Math.floor(index/28))).size*2;
 let realCliffTriangles=0;w.world.colliders.forEach(c=>{if(c.userData?.name.startsWith('Simplified exposed terrain cliffs'))realCliffTriangles+=c.shape.indices.length/3;});assert.equal(realCliffTriangles,expectedCliffTriangles);
 assert.ok(w.stats.staticTriangles>=road.geometry.index.count/3+terrain.geometry.index.count/3);assert.ok(w.stats.staticTriangles<150000);
 const bridge=BRIDGES[0],point=routePointAtProgress((bridge.from+bridge.to)/2);
 const on=fallBody(w,point.x+point.right.x*bridge.offset,point.height+3,point.z+point.right.z*bridge.offset);
 const off=fallBody(w,point.x+point.right.x*(bridge.offset+bridge.halfWidth+1.5),point.height+3,point.z+point.right.z*(bridge.offset+bridge.halfWidth+1.5));
 run(w,100);assert.ok(on.translation().y>point.height-1);assert.ok(off.translation().y<point.height-5);
 console.log('actual physics city:',JSON.stringify({...w.stats,buildMilliseconds:Math.round(performance.now()-start)}));w.dispose();city.dispose();
});

test('actual garage, canyon roads, rails, gate and ninety movers build together',async()=>{
 const {createGarageScene}=await import('../dist/garage-scene.js');const {createCanyonScene}=await import('../dist/canyon-scene.js');const {createCanyonEntrance}=await import('../dist/canyon-entrance.js');const {createRoadHazards}=await import('../dist/road-hazards.js');const {canyonPointAt}=await import('../dist/canyon-track.js');
 const city=fixture(),garage=createGarageScene(THREE,city,{document:null}),entrance=createCanyonEntrance(THREE,{document:null}),environment=createCanyonScene(THREE),roadHazards=createRoadHazards();
 const w=createPhysicsWorld(options(city,{garage,canyon:{entrance,environment},roadHazards}));assert.equal(w.stats.kinematicBodies,90);assert.ok(w.stats.boxes>=10);assert.ok(w.stats.staticTriangles<100000);
 const point=canyonPointAt(100),canyonBody=fallBody(w,point.x,point.height+2,point.z),spawn=fallBody(w,garage.spawn.x,garage.spawn.y+2,garage.spawn.z),connector=fallBody(w,0,2,24);
 run(w,90);assert.ok(canyonBody.translation().y>point.height-2);assert.ok(spawn.translation().y>garage.spawn.y);assert.ok(connector.translation().y>-.1);assert.ok(Math.abs(roadHazards.elapsed-1.5)<1e-10);
 const tags=new Set();w.world.colliders.forEach(c=>tags.add(c.userData?.tag));assert.ok(tags.has('gate')&&tags.has('wall')&&tags.has('road')&&tags.has('support')&&tags.has('obstacle'));
 console.log('garage/canyon/hazards physics:',JSON.stringify(w.stats));w.dispose();garage.dispose();entrance.dispose();environment.dispose();
});

 test('frame interpolation runs once after all fixed ticks and hooks retain their order',()=>{
 const w=createPhysicsWorld(options()),events=[];const model={beginFrame(){events.push('begin');},beforeStep(){events.push('model-before');},afterStep(){events.push('model-after');},getRenderState(){events.push('render');return {};}},raw=w.world.step.bind(w.world);w.world.step=()=>{events.push('world');raw();};
 w.step(1/30,model,{onBeforeStep(){events.push('before');},onAfterStep(){events.push('after');}});assert.deepEqual(events,['begin','model-before','before','world','model-after','after','model-before','before','world','model-after','after','render']);w.dispose();
});
