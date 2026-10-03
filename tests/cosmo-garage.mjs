import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.js';
import {attachCosmoGarage} from '../dist/cosmo-garage.js';
import {createAppDom} from './fixtures/app-dom.mjs';
const flush=()=>new Promise(r=>setImmediate(r));
function adapter(){const group=new THREE.Group();group.name='Test imported car';return {group,cargoPosition:new THREE.Vector3(0,2,0),calls:[],disposed:false,update(p){this.calls.push({...p})},dispose(){this.disposed=true;group.removeFromParent()}}}
let controls,active=0,peak=0;const pending=[],loaded=[];
const f=createAppDom({startDriving:false,attachVehicleVisuals:(T,g)=>{controls=attachCosmoGarage(T,g,{load:async(T,id)=>{active++;peak=Math.max(peak,active);await new Promise(r=>pending.push(r));active--;const a=adapter();loaded.push(a);return a;}});return controls;}});
try{
 const g=f.debug.garage,identities=g.vehicles.map(v=>[v.id,v.rig,v.root,v.config]),money=f.debug.gameplay.state.money;
 assert.equal(pending.length,2);
 g.vehicles[0].rig.update({steerAngle:.3,wheelSpin:4,bodyRoll:.2});
 while(pending.length){pending.splice(0).forEach(r=>r());await flush();}
 assert.deepEqual(await controls.ready,{loaded:11,total:11});assert.equal(peak,2);
 for(let i=0;i<g.vehicles.length;i++){
  const v=g.vehicles[i];assert.equal(v.id,identities[i][0]);assert.equal(v.rig,identities[i][1]);assert.equal(v.root,identities[i][2]);assert.equal(v.config,identities[i][3]);
  assert.equal(v.visual.group.parent,v.root);assert.equal(v.root.children.filter(c=>c.isInstancedMesh).length,0);assert.equal(v.cargo.position.y,2);
  v.rig.update({steerAngle:-.4,wheelSpin:9,bodyPitch:.1});assert.equal(v.visual.calls.at(-1).steerAngle,-.4);
  v.rig.reset();assert.equal(v.visual.calls.at(-1).wheelSpin,0);
 }
 assert.equal(loaded[0].calls[0].wheelSpin,4);assert.equal(f.debug.gameplay.state.money,money);
 // Rebuild disposes every imported visual and starts a new bounded loader.
 f.ids.get('regenerate').dispatch('click');assert(loaded.every(a=>a.disposed));
 while(pending.length){pending.splice(0).forEach(r=>r());await flush();}
 await controls.ready;
}finally{f.dispose()}
assert(loaded.every(a=>a.disposed));
// Late decoder results cannot attach to destroyed scenes; failures are explicit.
for(const fail of [false,true]){
 let resolve,reject;const warnings=[];
 const stub={vehicles:[{id:'pickup',root:new THREE.Group(),cargo:new THREE.Group(),rig:{update(){return this},dispose(){this.dead=true}}}],dispose(){this.vehicles.forEach(v=>v.rig.dispose())}};
 const c=attachCosmoGarage(THREE,stub,{load:()=>new Promise((r,j)=>{resolve=r;reject=j}),onError:(...a)=>warnings.push(a)});
 if(fail){
  reject(new Error('expected load failure'));
  await assert.rejects(c.ready,error=>error instanceof AggregateError&&error.vehicleIds[0]==='pickup'&&error.errors[0].cause.message==='expected load failure');
  assert.equal(c.failed,1);assert.equal(c.loaded,0);assert.equal(warnings.length,1);assert.equal(stub.vehicles[0].root.children.length,0);
 }else{
  stub.dispose();const a=adapter();resolve(a);await c.ready;assert(a.disposed);assert.equal(a.group.parent,null);assert.equal(c.disposed,true);
 }
}
// A failed adapter initialization releases its GLB resources, and all failed
// vehicle IDs are reported together after the bounded queue finishes.
{
 const broken=[],warnings=[];
 const stub={vehicles:['pickup','rover','van'].map(id=>({id,root:new THREE.Group(),cargo:new THREE.Group(),rig:{update(){return this},dispose(){}}})),dispose(){this.vehicles.forEach(v=>v.rig.dispose())}};
 const c=attachCosmoGarage(THREE,stub,{load:async(T,id)=>{const a=adapter();if(id!=='van'){a.update=()=>{throw Error(`${id} articulation failed`)};broken.push(a)}return a},onError:(...args)=>warnings.push(args)});
 await assert.rejects(c.ready,error=>error instanceof AggregateError&&error.vehicleIds.join(',')==='pickup,rover');
 assert.equal(c.loaded,1);assert.equal(c.failed,2);assert(broken.every(a=>a.disposed));assert.equal(warnings.length,2);
 assert.equal(stub.vehicles[0].root.children.length,0);assert.equal(stub.vehicles[1].root.children.length,0);stub.dispose();
}
console.log('PASS Cosmo GLB-only garage, actual application hook, bounded loading, stable identities, pose/reset, rebuild, explicit failures and late-disposal. CPU/mock DOM only.');
