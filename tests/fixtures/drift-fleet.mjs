import fs from 'node:fs';
const base=new URL('../../dist/',import.meta.url);
const imp=name=>import(new URL(name,base));
const THREE=await imp('vendor/three.module.js');
const {loadBMWVehicle}=await imp('bmw-vehicle.js');
const {loadShowcaseVehicle}=await imp('showcase-vehicles.js');
const {SHOWCASE_VEHICLES}=await imp('showcase-vehicle-catalog.js');
const {initializeRapier}=await imp('rapier-runtime.js');
const {createRapierDrivingModel}=await imp('rapier-vehicle.js');
const {vehicleConfig}=await imp('economy-config.js');
const {CITY_SURFACE}=await imp('biome-surfaces.js');
// Only the in-memory material JSON changes: physics geometry and wheel vertices stay intact.
function geometryOnly(bytes){
 const len=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+len).toString());
 if(json.textures?.length){
 json.images=[{uri:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5mQAAAAASUVORK5CYII='}];
 json.textures=json.textures.map(t=>({source:0,sampler:t.sampler}));
 }
 json.extensionsRequired=(json.extensionsRequired||[]).filter(e=>e!=='KHR_texture_basisu');
 const text=Buffer.from(JSON.stringify(json)),padded=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(padded);
 const tail=bytes.subarray(20+len),out=Buffer.alloc(20+padded.length+tail.length);bytes.copy(out,0,0,20);
 out.writeUInt32LE(out.length,8);out.writeUInt32LE(padded.length,12);padded.copy(out,20);tail.copy(out,20+padded.length);return out;
}
const originals={fetch:globalThis.fetch,self:globalThis.self,createImageBitmap:globalThis.createImageBitmap};
const originalFetch=globalThis.fetch;globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}});
globalThis.fetch=async request=>{const url=typeof request==='string'?request:request.url;if(url.startsWith('blob:')||url.startsWith('data:'))return originalFetch(request);let bytes=fs.readFileSync(new URL(url));if(url.endsWith('.glb'))bytes=geometryOnly(bytes);return new Response(bytes);};
const adapters=[];
try{
 adapters.push(await loadBMWVehicle(THREE));
 for(const spec of SHOWCASE_VEHICLES)adapters.push(await loadShowcaseVehicle(THREE,spec.id));
}finally{
 for(const [key,value] of Object.entries(originals)){
  if(value===undefined)delete globalThis[key];else globalThis[key]=value;
 }
}
export const driftFleetMetadata=new Map(adapters.map(adapter=>[adapter.metadata.id,adapter.metadata]));
for(const adapter of adapters)adapter.dispose();
const R=await initializeRapier(),dt=1/60;
export function measureDrift(id,{steering=.7,levels}={}){
 const metadata=driftFleetMetadata.get(id),world=new R.World({x:0,y:-9.81,z:0});world.timestep=dt;
 world.createCollider(R.ColliderDesc.cuboid(1500,.5,1500).setTranslation(0,-.5,0));
 const model=createRapierDrivingModel({world,vehicleId:id,maxSpeed:vehicleConfig(id).maxSpeed,getVehicleMetadata:()=>metadata,getUpgrades:()=>levels,groundSurface:()=>CITY_SURFACE});
 const step=(seconds,input)=>{if(input)model.setInput(input);const rows=[];for(let i=0;i<Math.round(seconds/dt);i++){model.beforeStep(dt);world.step();model.afterStep(dt);const s=model.state;rows.push({speed:s.linearSpeed,slip:s.slipAngle,yaw:s.angularVelocity,ground:s.grounded,up:s.upY});}return rows;};
 step(2);step(5,{active:true});
 const entrySpeed=model.state.linearSpeed;
 const corner=step(3,{active:true,steering});
 const handbrake=step(.6,{active:true,steering,handbrake:1});
 const recovery=step(3,{active:true,steering:-steering/2});
 const avg=(rows,key)=>rows.reduce((s,r)=>s+Math.abs(r[key]),0)/rows.length;
 const g=model.physicsGeometry;
 const result={id,dimensions:metadata.dimensions,wheels:metadata.wheels.map(w=>({name:w.name,center:w.center,radius:w.radius})),wheelbase:g.wheelbase,inertia:g.yawInertia,entrySpeed,corner:{speed:avg(corner,'speed'),slipDegrees:avg(corner,'slip')*180/Math.PI,yaw:avg(corner,'yaw')},handbrake:{slipDegrees:avg(handbrake,'slip')*180/Math.PI,yaw:avg(handbrake,'yaw')},recovery:{speed:model.state.speed,slipDegrees:Math.abs(model.state.slipAngle)*180/Math.PI},unsupported:[...corner,...handbrake,...recovery].filter(r=>!r.ground).length};
 model.dispose();world.free();return result;
}
