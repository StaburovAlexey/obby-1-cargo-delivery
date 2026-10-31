import test from 'node:test';import assert from 'node:assert/strict';
import {initializeRapier} from '../dist/rapier-runtime.js';
import {createRapierDrivingModel} from '../dist/rapier-vehicle.js';
import {createNitro} from '../dist/vehicle-nitro.js';
const R=await initializeRapier();
function run(boost,vehicleId='bmwreward'){
 const world=new R.World({x:0,y:-9.81,z:0});world.timestep=1/60;
 const floor=world.createCollider(R.ColliderDesc.cuboid(1000,.5,1000).setTranslation(0,-.5,0));floor.physicsTag='road';
 const nitro=createNitro();nitro.start(1);
 const model=createRapierDrivingModel({world,x:0,y:1,z:0,vehicleId,maxSpeed:42,getNitro:()=>nitro});
 const step=()=>{model.beforeStep(1/60);world.step();model.afterStep(1/60);};
 try{
 for(let i=0;i<120;i++)step();model.setInput({active:true});for(let i=0;i<240;i++)step();
 if(boost)assert.equal(nitro.activate(model.state),true);
 for(let i=0;i<120;i++)step();return {speed:model.state.speed,remaining:nitro.state.remaining};
 }finally{model.dispose();world.free();}
}
test('nitro adds acceleration and expires after 120 physics steps',()=>{
 const stock=run(false),boost=run(true);assert.ok(boost.speed>stock.speed+1,`${boost.speed} > ${stock.speed}`);assert.equal(boost.remaining,0);
});
test('ordinary vehicles ignore nitro',()=>{assert.equal(run(true,'pickup').speed,run(false,'pickup').speed);});

function coastFixture(){
 const world=new R.World({x:0,y:-9.81,z:0});world.timestep=1/60;
 const floor=world.createCollider(R.ColliderDesc.cuboid(1000,.5,1000).setTranslation(0,-.5,0));floor.physicsTag='road';
 const nitro=createNitro();nitro.start(2);
 const model=createRapierDrivingModel({world,x:0,y:1,z:0,vehicleId:'bmwreward',maxSpeed:42,getNitro:()=>nitro});
 const step=count=>{for(let i=0;i<count;i++){model.beforeStep(1/60);world.step();model.afterStep(1/60);}};
 step(120);model.setInput({active:true});step(180);model.setInput({active:false});
 return {model,nitro,step,dispose(){model.dispose();world.free();}};
}
test('nitro drives with released gas, accepts steering updates, then returns to coasting',()=>{
 const f=coastFixture();try{
 const initial=f.model.state.speed;assert.equal(f.nitro.activate(f.model.state),true);
 f.step(60);assert.ok(f.model.state.speed>initial+1);
 f.model.setInput({active:false,steering:.05});f.step(60);
 assert.equal(f.nitro.state.remaining,0);assert.equal(f.model.state.active,false);
 const end=f.model.state.speed;f.step(60);assert.ok(f.model.state.speed<end,'no latched automatic gas after nitro');
 }finally{f.dispose();}
});
test('real brake input immediately interrupts auto-throttle, releasing brake does not restart it',()=>{
 const f=coastFixture();try{
 assert.equal(f.nitro.activate(f.model.state),true);f.step(30);
 f.model.setInput({active:false,handbrake:1});assert.equal(f.nitro.state.remaining,0);
 f.step(30);f.model.setInput({active:false});const speed=f.model.state.speed;f.step(30);
 assert.equal(f.nitro.state.remaining,0);assert.ok(f.model.state.speed<speed);assert.equal(f.nitro.state.charges,1);
 }finally{f.dispose();}
});
test('gas pressed during nitro remains active after the charge ends',()=>{
 const f=coastFixture();try{
 assert.equal(f.nitro.activate(f.model.state),true);f.step(30);f.model.setInput({active:true});f.step(90);
 assert.equal(f.nitro.state.remaining,0);assert.equal(f.model.state.active,true);
 const speed=f.model.state.speed;f.step(60);assert.ok(f.model.state.speed>speed);
 }finally{f.dispose();}
});
