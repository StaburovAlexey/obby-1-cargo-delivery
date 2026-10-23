import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {COSMO_VEHICLES, loadCosmoVehicle} from '../dist/cosmo-vehicles.js';
import {loadBMWVehicle} from '../dist/bmw-vehicle.js';
import {vehicleConfig} from '../dist/economy-config.js';
import {CITY_SURFACE, surfaceForBiome} from '../dist/biome-surfaces.js';
import {createDrivingModel} from '../dist/driving-model.js';
import {rearTireSlip} from '../dist/vehicle-physics.js';
import {createPhysicsWorld} from '../dist/physics-world.js';

const runtime = await import('../dist/rapier-runtime.js').catch(() => null);
assert.ok(runtime, 'Rapier runtime must be available to the static game and tests');
assert.throws(() => runtime.getRapier(), /initializ/i);
const first = runtime.initializeRapier(), second = runtime.initializeRapier();
assert.equal(first, second, 'initialization shares one promise');
const R = await first;
assert.equal(runtime.getRapier(), R);
const {createRapierDrivingModel} = await import('../dist/rapier-vehicle.js');

const originalFetch = globalThis.fetch;
globalThis.self = globalThis;
globalThis.createImageBitmap = async blob => {
  const b = Buffer.from(await blob.arrayBuffer());
  return {width:b.readUInt32BE(16), height:b.readUInt32BE(20), close(){}};
};
globalThis.fetch = async request => {
  const url = typeof request === 'string' ? request : request.url;
  return url.startsWith('blob:') ? originalFetch(request) : new Response(fs.readFileSync(new URL(url)));
};
const metadata = new Map();
for (const spec of COSMO_VEHICLES) {
  const adapter = await loadCosmoVehicle(THREE, spec.id);
  metadata.set(spec.id, adapter.metadata);
  adapter.dispose();
}
const bmw = await loadBMWVehicle(THREE);
metadata.set('bmwreward', bmw.metadata);
bmw.dispose();
globalThis.fetch = originalFetch;

const DT = 1/60;
function fixture({id='pickup', floor=true, floorHalfSize=300, y, groundSurface, onCollision, getVehicleMetadata,getUpgrades}={}) {
  const world = new R.World({x:0,y:-9.81,z:0});
  world.timestep = DT;
  if (floor) world.createCollider(R.ColliderDesc.cuboid(floorHalfSize,.5,floorHalfSize).setTranslation(0,-.5,0));
  const model = createRapierDrivingModel({world, x:0, z:0, y, vehicleId:id,
    maxSpeed:vehicleConfig(id).maxSpeed, getVehicleMetadata:getVehicleMetadata ?? (()=>metadata.get(id)),
    groundSurface, onCollision,getUpgrades});
  const tick = (input, seconds=DT) => {
    if (input) model.setInput(input);
    for (let i=0;i<Math.round(seconds/DT);i++) {
      model.beginFrame(); model.beforeStep(DT); world.step(); model.afterStep(DT); model.captureRender();
    }
    return model.state;
  };
  const dispose = () => {model.dispose(); world.free();};
  return {world,model,tick,dispose};
}
const finiteState = state => {
  for (const key of ['x','y','z','heading','velocityX','velocityY','velocityZ','angularVelocity','speed','upY'])
    assert.ok(Number.isFinite(state[key]), `${key} must remain finite`);
  assert.ok(Object.values(state.quaternion).every(Number.isFinite));
};

test('all eleven real vehicle geometries settle on their four suspension contacts', () => {
  assert.equal(metadata.size, 11);
  for (const id of metadata.keys()) {
    const f=fixture({id}), identity=f.model.state;
    try {
      f.tick(null, 4);
      const s=f.model.state, m=metadata.get(id);
      finiteState(s);
      assert.equal(s, identity);
      assert.equal(s.wheelContacts.filter(c=>c.grounded).length,4, id);
      assert.equal(s.grounded,true,id);
      assert.ok(s.upY>.995, `${id} rests upright`);
      const lowest=Math.min(...m.wheels.map(w=>w.center[1]-w.radius));
      assert.ok(Math.abs(s.y+lowest)<.075,`${id} wheel height ${s.y+lowest}`);
      assert.ok(Math.abs(s.velocityY)<.015,`${id} suspension rests without bouncing`);
      assert.ok(Math.hypot(s.velocityX,s.velocityZ)<.015,`${id} cannot creep at rest`);
      assert.equal(f.world.bodies.len(),1, 'one rigid chassis per model');
    } finally {f.dispose();}
  }
});

test('ordinary drive, brakes, reverse and steering act through grounded tires', () => {
  const f=fixture();
  try {
    f.tick(null,2);
    let s=f.tick({active:true},3);
    assert.ok(s.speed>9 && s.speed<11.5,`speed ${s.speed}`);
    assert.ok(s.z < -15);
    s=f.tick({brake:1},1.5);
    // Stock pickup brakes have grip=.5: the old force model is still moving at
    // 1.148 m/s after this interval. Keep that calibrated stopping curve.
    assert.ok(s.speed>1 && s.speed<1.3,`braking speed ${s.speed}`);
    s=f.tick({brake:1},1);
    assert.ok(Math.abs(s.speed)<.02,`full braking stop ${s.speed}`);
    f.model.setGear('R');
    s=f.tick({active:true},2);
    assert.ok(s.speed < -5,`reverse speed ${s.speed}`);
    f.model.setGear('D');
    f.tick({active:true},3);
    const heading=s.heading;
    s=f.tick({active:true,steering:.5},2);
    assert.ok(Math.abs(s.heading-heading)>.15,'steered contact forces produce yaw');
    assert.ok(s.upY>.8,'ordinary corner stays on its wheels');
    finiteState(s);
  } finally {f.dispose();}
});

test('catalog engine curves remain calibrated for ordinary and rear drive cars', () => {
  // Independent literal outputs recorded from the existing 120 Hz force model,
  // using these actual GLB wheel geometries on CITY_SURFACE with stock upgrades.
  for(const [id,first,third] of [['pickup',5.765564,10.992905],['ashhauler',12.879239,34.981051],['bmwreward',4.526952,12.981778]]) {
    const f=fixture({id});
    try {
      f.tick(null,2);
      const one=f.tick({active:true},1).speed;
      assert.ok(Math.abs(one-first)<.11,`${id} first second ${one} vs ${first}`);
      const three=f.tick({active:true},2).speed;
      assert.ok(Math.abs(three-third)<.14,`${id} third second ${three} vs ${third}`);
    } finally {f.dispose();}
  }
});

test('BMW handbrake removes rear drive and changes actual tire slip', () => {
  const f=fixture({id:'bmwreward'});
  try {
    f.tick(null,1);
    f.tick({active:true},4);
    f.tick({active:true,steering:.7},.6);
    const speed=f.model.state.speed;
    const s=f.tick({active:true,steering:.7,handbrake:1},.7);
    assert.equal(s.handbrake,1);
    assert.ok(s.speed<speed,'rear handbrake slows the car');
    assert.ok(Math.abs(s.slipAngle)>.04,'handbrake slide emerges from contact forces');
    assert.ok(s.wheelContacts.filter(c=>!c.front).every(c=>c.longitudinalForce<=0));
    finiteState(s);
  } finally {f.dispose();}
});

test('finite world edge produces real airborne fall, with no hidden floor', () => {
  const f=fixture({floor:false,y:.02});
  f.world.createCollider(R.ColliderDesc.cuboid(8,.5,8).setTranslation(0,-.5,0));
  try {
    f.tick(null,1);
    const s=f.tick({active:true},5);
    assert.equal(s.airborne,true);
    assert.equal(s.grounded,false);
    assert.ok(s.y < -8,`car falls below the road: ${s.y}`);
    finiteState(s);
  } finally {f.dispose();}
});

test('airborne throttle, steering and handbrake cannot create tire acceleration', () => {
  const f=fixture({floor:false,id:'bmwreward',y:25});
  try {
    const s=f.tick({active:true,steering:1,handbrake:1},1);
    assert.ok(Math.abs(s.velocityX)<1e-6 && Math.abs(s.velocityZ)<1e-6);
    assert.ok(Math.abs(s.angularVelocity)<1e-6);
    assert.equal(s.wheelContacts.some(c=>c.grounded),false);
    assert.ok(s.velocityY<-9);
  } finally {f.dispose();}
});

test('a physical ramp launches and lands the full rotating chassis', () => {
  const f=fixture();
  const vertices=new Float32Array([-8,0,-8, 8,0,-8, -8,3,-20, 8,3,-20]);
  f.world.createCollider(R.ColliderDesc.trimesh(vertices,new Uint32Array([0,2,1,1,2,3])));
  let airborne=false,landed=false,maxY=0,tilted=false;
  try {
    f.tick(null,1);
    for(let i=0;i<600;i++) {
      const s=f.tick({active:true});
      if(s.z<-10 && s.y>2) tilted ||= s.upY<.995;
      if(s.z<-20 && s.airborne && s.y>1) airborne=true;
      if(airborne && s.z<-25 && s.grounded) landed=true;
      maxY=Math.max(maxY,s.y);
      finiteState(s);
    }
    assert.ok(tilted,'ramp rotates pitch through suspension forces');
    assert.ok(airborne,`launched above ramp end; maxY ${maxY}`);
    assert.ok(landed,'chassis lands on the lower ground');
  } finally {f.dispose();}
});

test('high grip low speed contacts settle without fixed-step damping reversal', () => {
  const f=fixture({groundSurface:()=>({...CITY_SURFACE,frictionFactor:3,lateralDampingFactor:3})});
  try {
    f.tick(null,1);
    f.model.body.setLinvel({x:.11,y:0,z:-.1},true);
    f.model.body.setAngvel({x:0,y:.035,z:0},true);
    let peak=0;
    for(let i=0;i<180;i++) {const s=f.tick({brake:1}); peak=Math.max(peak,s.linearSpeed);finiteState(s);}
    assert.ok(peak<.2,`dampers cannot add energy: ${peak}`);
    assert.ok(f.model.state.linearSpeed<.002,'rests after damping');
    assert.ok(Math.abs(f.model.state.angularVelocity)<.002,'yaw rests after damping');
  } finally {f.dispose();}
});

test('pose changes clear interpolation and do not charge teleports as driven distance', () => {
  const f=fixture();
  try {
    f.tick(null,1);
    f.model.beginFrame();
    f.model.setPose({x:30,y:12,z:50,quaternion:{x:.12,y:.25,z:0,w:.96}});
    assert.equal(f.model.state.pathDistance,0);
    const render=f.model.getRenderState(.3);
    assert.equal(render.x,30);assert.equal(render.y,12);assert.equal(render.z,50);
    assert.ok(Math.abs(render.quaternion.x)>.1,'full quaternion survives interpolation');
    assert.equal(f.model.state.velocityY,0);
    const old=f.model.state;
    f.model.reset();
    assert.equal(f.model.state,old);
    assert.ok(Math.abs(old.x)<.01 && Math.abs(old.z)<.01);
  } finally {f.dispose();}
});

test('late real metadata rebuilds collider without replacing or teleporting the body', () => {
  let current;
  const f=fixture({getVehicleMetadata:()=>current});
  try {
    f.tick(null,1);
    f.model.setPose({x:4,y:9,z:3});
    f.model.body.setLinvel({x:1,y:-2,z:3},true);
    const body=f.model.body, pose={...body.translation()}, velocity={...body.linvel()};
    current=metadata.get('ashhauler');
    const g=f.model.physicsGeometry;
    assert.ok(g.wheelbase>4);
    assert.equal(f.model.body,body);
    assert.deepEqual({...body.translation()},pose);
    assert.deepEqual({...body.linvel()},velocity);
    assert.equal(f.world.colliders.len(),2);
  } finally {f.dispose();}
});

test('vehicle remains finite when settling, driving and turning before metadata arrives', () => {
  const f=fixture({getVehicleMetadata:()=>undefined});
  try {
    finiteState(f.tick(null,2));
    assert.equal(f.model.state.grounded,true);
    finiteState(f.tick({active:true},2));
    assert.ok(f.model.state.speed>7,'fallback tires drive the chassis');
    const heading=f.model.state.heading;
    finiteState(f.tick({active:true,steering:.6},2));
    assert.ok(Math.abs(f.model.state.heading-heading)>.2,'fallback axles support real steering forces');
    assert.ok(f.model.state.wheelContacts.every(c=>Number.isFinite(c.longitudinalForce) && Number.isFinite(c.lateralForce)));
  } finally {f.dispose();}
});

test('disabled vehicles stop participating in the shared world', () => {
  const f=fixture();
  try {
    f.model.setEnabled(false);
    const y=f.model.state.y;
    f.tick({active:true},1);
    assert.equal(f.model.state.y,y);
    assert.equal(f.model.state.pathDistance,0);
    f.model.setEnabled(true);
    f.tick({active:true},1);
    assert.ok(f.model.state.speed>1);
  } finally {f.dispose();}
});

test('chassis obstacle contacts report collisions while road support does not block', () => {
  const hits=[];
  const f=fixture({onCollision:hit=>hits.push(hit)});
  f.world.createCollider(R.ColliderDesc.cuboid(8,2,.5).setTranslation(0,2,-15));
  try {
    f.tick(null,1);
    assert.equal(f.model.state.blocked,false);
    let blocked=false,impact=0;
    for(let i=0;i<300;i++) {const s=f.tick({active:true}); blocked ||=s.blocked;impact=Math.max(impact,s.impactSpeed);}
    assert.ok(blocked,'wall contacts reach gameplay');
    assert.ok(impact>1,'impact speed measured before solver response');
    assert.ok(hits.length>0);
    assert.ok(f.model.state.z>-15,'solid collider prevents passing through wall');
  } finally {f.dispose();}
});

test('triangle facade impacts report contact even when Rapier exposes no solver contacts', () => {
  const f=fixture(),wallX=-8;
  f.world.createCollider(R.ColliderDesc.trimesh(new Float32Array([
    wallX,-2,-100,wallX,10,-100,wallX,-2,100,wallX,10,100,
  ]),new Uint32Array([0,1,2,2,1,3])));
  try {
    f.tick(null,1);
    const g=f.model.physicsGeometry,heading=-.12,c=Math.cos(heading),s=Math.sin(heading);
    const reach=g.colliderHalf.x*Math.abs(c)+g.colliderHalf.z*Math.abs(s)-g.colliderCenter.x*c-g.colliderCenter.z*s;
    f.model.setPose({x:wallX+reach+.1,z:0,heading});
    f.model.body.setLinvel({x:-9,y:0,z:-4},true);
    let blocked=false,impact=0;
    for(let i=0;i<45;i++) {const state=f.tick();blocked ||=state.blocked;impact=Math.max(impact,state.impactSpeed);}
    assert.ok(blocked,'actual triangle facade must be reported to gameplay');
    assert.ok(impact>5,'pre-impact wall-normal speed is retained');
    assert.ok(Math.abs(f.model.state.velocityX)<1,'real contact removes wall-normal momentum');
  } finally {f.dispose();}
});

test('suspension rays ignore sensors and query each tire surface at its actual hit', () => {
  const calls=[];
  const f=fixture({groundSurface:(x,z,id,point)=>{
    calls.push({x,z,id,point});
    return {...CITY_SURFACE,frictionFactor:x<0?.025:2};
  }});
  f.world.createCollider(R.ColliderDesc.cuboid(15,.05,15).setTranslation(0,.2,0).setSensor(true));
  try {
    f.tick(null,2);
    f.tick({active:true},.25);
    assert.ok(f.model.state.wheelContacts.every(c=>c.grounded && Math.abs(c.point.y)<1e-5));
    const left=f.model.state.wheelContacts.filter(c=>c.x<0);
    const right=f.model.state.wheelContacts.filter(c=>c.x>0);
    assert.ok(right.reduce((n,c)=>n+c.longitudinalForce,0)>left.reduce((n,c)=>n+c.longitudinalForce,0)*2);
    assert.ok(calls.some(c=>c.x<-1 && Math.abs(c.point.y)<1e-5));
    assert.ok(calls.some(c=>c.x>1 && Math.abs(c.point.y)<1e-5));
  } finally {f.dispose();}
});

test('shared step controls translation and interpolates free pitch and roll in three dimensions', () => {
  const f=fixture({floor:false,y:10});
  try {
    f.model.body.setLinvel({x:3,y:2,z:-1},true);
    f.model.body.setAngvel({x:.4,y:.3,z:.2},true);
    f.model.beginFrame();
    f.model.beforeStep(DT);
    assert.equal(f.model.body.translation().x,0,'vehicle hook must never step the shared world');
    f.world.step();f.model.afterStep(DT);
    const before=JSON.parse(JSON.stringify(f.model.getRenderState(0)));
    const after=JSON.parse(JSON.stringify(f.model.getRenderState(1)));
    const middle=f.model.getRenderState(.5);
    assert.ok(Math.abs(middle.x-(before.x+after.x)/2)<1e-8);
    assert.ok(Math.abs(middle.y-(before.y+after.y)/2)<1e-8);
    assert.ok(middle.quaternion.x>0 && middle.quaternion.z>0,'free pitch and roll reach the render pose');
    assert.ok(middle.quaternion.x<after.quaternion.x);
    assert.ok(Math.abs(Math.hypot(...Object.values(middle.quaternion))-1)<1e-6);
    assert.ok(f.model.state.angularVelocity3D.x>.35 && f.model.state.angularVelocity3D.z>.15);
    const distance=f.model.state.pathDistance;
    assert.ok(distance>.04 && distance<.08,'actual XYZ translation is recorded once');
    f.model.beginFrame();
    assert.equal(f.model.state.pathDistance,0,'frame motion is cleared even if the accumulator has no tick');
  } finally {f.dispose();}
});

test('real shared world keeps the same vehicle motion at 30, 60 and 120 fps', () => {
  const results=[];
  for(const fps of [30,60,120]) {
    const manager=createPhysicsWorld({THREE});
    manager.world.createCollider(R.ColliderDesc.cuboid(100,.5,100).setTranslation(0,-.5,0).setFriction(.85));
    const model=createRapierDrivingModel({world:manager.world,x:0,z:0,
      getVehicleMetadata:()=>metadata.get('pickup')});
    try {
      model.setInput({active:true});
      for(let frame=0;frame<fps*3;frame++) manager.step(1/fps,model);
      results.push({x:model.state.x,y:model.state.y,z:model.state.z,speed:model.state.speed,steps:manager.stats.steps});
    } finally {model.dispose();manager.dispose();}
  }
  assert.equal(results[0].steps,180);
  for(const result of results.slice(1)) {
    assert.equal(result.steps,180);
    for(const key of ['x','y','z','speed']) assert.ok(Math.abs(result[key]-results[0][key])<1e-6, `${key} changes with render cadence`);
  }
});

test('late callbacks safely ignore a disposed vehicle after its world is freed', () => {
  let current=metadata.get('pickup');
  const f=fixture({getVehicleMetadata:()=>current});
  f.tick({active:true,steering:.3},.5);
  const render=JSON.parse(JSON.stringify(f.model.getRenderState(1)));
  f.model.dispose();
  f.world.free();
  current=metadata.get('ashhauler');
  assert.doesNotThrow(()=>f.model.pause(),'late pause must not access a freed body');
  assert.doesNotThrow(()=>f.model.reset());
  assert.doesNotThrow(()=>f.model.setEnabled(true));
  assert.doesNotThrow(()=>f.model.setPose({x:100,y:100,z:100}));
  assert.doesNotThrow(()=>f.model.setInput({active:true,steering:1}));
  assert.doesNotThrow(()=>f.model.setGear('R'));
  assert.doesNotThrow(()=>f.model.physicsGeometry,'late metadata must not rebuild a freed collider');
  assert.doesNotThrow(()=>{f.model.beforeStep(DT);f.model.afterStep(DT);f.model.captureRender();});
  assert.doesNotThrow(()=>f.model.dispose(),'dispose is idempotent');
  assert.equal(f.model.enabled,false);
  assert.equal(f.model.state.gear,'D','late input cannot reactivate a disposed controller');
  const last=f.model.getRenderState(1);
  for(const key of ['x','y','z','heading','frontWheelAngle']) assert.equal(last[key],render[key]);
  finiteState(f.model.state);
});

test('vehicle disposal also tolerates the world having already been freed', () => {
  const f=fixture();
  f.world.free();
  assert.doesNotThrow(()=>f.model.dispose());
  assert.doesNotThrow(()=>f.model.pause());
  assert.doesNotThrow(()=>f.model.reset());
  assert.doesNotThrow(()=>f.model.setEnabled(true));
  assert.equal(f.model.enabled,false);
});

const handlingReport={
  scope:'CPU tests with all actual GLB metadata, real Rapier bodies and a finite 6 km flat support. Legacy 120 Hz solver is used only as the comparison oracle. No browser or device performance claim.',
  inputs:{upgrades:'speed, handling, grip and fuel at the stated level',straightSeconds:25,cornerSeconds:3,steering:.7,steadyCornerWindowSeconds:[2,3],brakeEntrySpeed:10,brakeStopSpeed:.1},
  tolerances:{speed:.05,braking:.05,turning:.10,rearSlip:.10},representative:[],matrix:[],
  bmwCalibration:{yawInertia:10800,angularDamping:0,
    reason:'The legacy BMW uses equal quarter-car tire budgets. Applying physical load transfer before its nonlinear combined-slip saturation changed its drift radius by over 200%.',
    allocation:'Evaluate the unchanged four-tire law from one velocity snapshot. Preserve each supported axle longitudinal/lateral force and yaw moment while distributing lateral contact force by spring load; solve longitudinal sharing to retain that same moment. Apply every impulse at its real 3D contact point.',
    support:'Full axle budget at or above 90% of static support; linear fade below that load; absent contacts supply no force. Braking follows real load transfer; engine torque does not grow with axle loading.',
    limit:'This retains the calibrated axle friction budget rather than independently applying a second friction-circle saturation to each redistributed contact. Uneven contact planes, jumps and chassis rotation have no legacy planar equivalent.'},
};
const handlingReportPath=process.env.RAPIER_HANDLING_REPORT || (process.env.RAPIER_HANDLING_MATRIX==='1'
  ? '/tmp/obby-rapier-handling-comparison.json' : '/tmp/obby-rapier-handling-representative.json');
const writeHandlingReport=()=>{
  const metrics=new Set(handlingReport.representative.flatMap(r=>Object.keys(r.deviations)));
  handlingReport.summary={representativeCases:handlingReport.representative.length,
    maximumRelativeDeviations:Object.fromEntries([...metrics].map(key=>[key,Math.max(...handlingReport.representative.map(r=>r.deviations[key] ?? 0))])),
    matrixCases:handlingReport.matrix.length,matrixFiniteCases:handlingReport.matrix.filter(r=>r.finite).length,
    matrixOverturnedCornerCases:handlingReport.matrix.filter(r=>r.minimumUpY<.2).map(r=>`${r.id}/${r.biome}/${r.level}`),
    matrixAirborneCornerCases:handlingReport.matrix.filter(r=>r.airborneCornerTicks>0).map(r=>`${r.id}/${r.biome}/${r.level}`)};
  fs.writeFileSync(handlingReportPath,JSON.stringify(handlingReport,null,2)+'\n');
};
const upgradeSet=level=>({speed:level,handling:level,grip:level,fuel:level});
function comparisonPair(id,biome,level) {
  const levels=upgradeSet(level),groundSurface=()=>surfaceForBiome(biome,id);
  const f=fixture({id,floorHalfSize:3000,groundSurface,getUpgrades:()=>levels});
  const legacy=createDrivingModel({x:0,z:0,vehicleId:id,maxSpeed:vehicleConfig(id).maxSpeed,
    getVehicleMetadata:()=>metadata.get(id),getUpgrades:()=>levels,groundSurface});
  const models=[legacy,f.model];
  const rears=metadata.get(id).wheels.filter(w=>!w.front),rearZ=rears.reduce((n,w)=>n+w.center[2],0)/2;
  const read=model=>{
    const s=model.state;
    return {speed:s.speed,linearSpeed:s.linearSpeed,yawRate:s.angularVelocity,frontWheelAngle:s.frontWheelAngle,
      rearSlip:rearTireSlip(s,rearZ),heading:s.heading,upY:s.upY ?? 1,x:s.x,z:s.z};
  };
  const tick=input=>{for(const m of models)m.setInput(input);legacy.step(DT);f.tick(null);};
  const run=(seconds,input)=>{for(let i=0;i<Math.round(seconds/DT);i++)tick(input);};
  f.tick(null,1);
  return {...f,legacy,models,read,tickPair:tick,runPair:run};
}
function representativeComparison(id,level) {
  const p=comparisonPair(id,'city',level);
  try {
    p.runPair(25,{active:true});
    const straight=p.models.map(p.read);
    const corner=p.models.map(()=>({peakRearSlip:0,meanRearSlip:0,meanSpeed:0,meanYawRate:0,minUpY:1}));
    let rack100ms;
    for(let i=0;i<180;i++) {
      p.tickPair({active:true,steering:.7});
      if(i===5) rack100ms=p.models.map(m=>Math.abs(m.state.frontWheelAngle));
      p.models.forEach((model,index)=>{
        const s=p.read(model),c=corner[index];
        c.peakRearSlip=Math.max(c.peakRearSlip,Math.abs(s.rearSlip));c.minUpY=Math.min(c.minUpY,s.upY);
        if(i>=120) {c.meanRearSlip+=Math.abs(s.rearSlip)/60;c.meanSpeed+=s.linearSpeed/60;c.meanYawRate+=Math.abs(s.yawRate)/60;}
      });
    }
    corner.forEach((c,i)=>{c.radius=c.meanSpeed/c.meanYawRate;c.rack100ms=rack100ms[i];c.final=p.read(p.models[i]);});
    let handbrake;
    if(vehicleConfig(id).rewardDrift) {
      const peaks=[0,0];
      for(let i=0;i<36;i++) {p.tickPair({active:true,steering:.7,handbrake:1});p.models.forEach((m,n)=>peaks[n]=Math.max(peaks[n],Math.abs(p.read(m).rearSlip)));}
      handbrake=p.models.map((m,i)=>({peakRearSlip:peaks[i],final:p.read(m)}));
    }
    p.legacy.reset();p.model.reset();p.runPair(1,{});
    p.legacy.state.velocityZ=-10;p.model.body.setLinvel({x:0,y:0,z:-10},true);
    const braking=p.models.map(()=>({distance:0,seconds:0,stopped:false}));
    for(let i=0;i<1200 && braking.some(b=>!b.stopped);i++) {
      const before=p.models.map(p.read);p.tickPair({brake:1});
      p.models.forEach((m,n)=>{if(braking[n].stopped)return;const s=p.read(m),b=braking[n];b.distance+=Math.hypot(s.x-before[n].x,s.z-before[n].z);b.seconds+=DT;b.stopped=s.linearSpeed<.1;});
    }
    const relative=(old,current)=>Math.abs(current-old)/Math.max(1e-9,Math.abs(old));
    const deviations={topSpeed:relative(straight[0].speed,straight[1].speed),cornerSpeed:relative(corner[0].meanSpeed,corner[1].meanSpeed),
      radius:relative(corner[0].radius,corner[1].radius),rearSlip:relative(corner[0].peakRearSlip,corner[1].peakRearSlip),
      meanRearSlip:relative(corner[0].meanRearSlip,corner[1].meanRearSlip),rack100ms:relative(rack100ms[0],rack100ms[1]),
      brakingDistance:relative(braking[0].distance,braking[1].distance),brakingSeconds:relative(braking[0].seconds,braking[1].seconds)};
    if(handbrake) deviations.handbrakeRearSlip=relative(handbrake[0].peakRearSlip,handbrake[1].peakRearSlip);
    return {id,biome:'city',level,legacy:{straight:straight[0],corner:corner[0],braking:braking[0],handbrake:handbrake?.[0]},
      rapier:{straight:straight[1],corner:corner[1],braking:braking[1],handbrake:handbrake?.[1]},deviations};
  } finally {p.dispose();}
}

test('handling preservation audit bounds city turning, rear slip and braking against actual GLB legacy behavior', () => {
  const failures=[];
  for(const id of ['pickup','ashhauler','bmwreward'])for(const level of [0,10]) {
    const row=representativeComparison(id,level);handlingReport.representative.push(row);
    for(const [metric,deviation] of Object.entries(row.deviations)) {
      const tolerance=['topSpeed','cornerSpeed','brakingDistance','brakingSeconds'].includes(metric)?.05:.10;
      if(deviation>tolerance) failures.push(`${id}/${level} ${metric}: ${(100*deviation).toFixed(2)}% > ${100*tolerance}%`);
    }
    assert.ok(row.rapier.corner.minUpY>.9,`${id}/${level} remains upright`);
  }
  handlingReport.failures=failures;writeHandlingReport();
  assert.deepEqual(failures,[],`Handling comparison report: ${handlingReportPath}`);
});

test('handling preservation audit keeps all eleven vehicles finite across five biomes and three upgrade levels',
  {skip:process.env.RAPIER_HANDLING_MATRIX!=='1'},()=>{
  const failures=[];
  for(const id of metadata.keys())for(const biome of ['city','forest','desert','snow','volcanic'])for(const level of [0,5,10]) {
    const p=comparisonPair(id,biome,level);
    const row={id,biome,level,finite:true,legacy:{},rapier:{},minimumUpY:1,airborneCornerTicks:0};
    try {
      const check=()=>{
        finiteState(p.model.state);
        for(const value of Object.values(p.legacy.state))if(typeof value==='number')assert.ok(Number.isFinite(value));
      };
      p.runPair(4,{active:true});check();
      row.legacy.accelerationSpeed=p.legacy.state.speed;row.rapier.accelerationSpeed=p.model.state.speed;
      const corner=p.models.map(()=>({peakRearSlip:0,meanSpeed:0,meanYawRate:0}));
      for(let i=0;i<180;i++) {
        p.tickPair({active:true,steering:.7});check();
        row.minimumUpY=Math.min(row.minimumUpY,p.model.state.upY);
        if(p.model.state.airborne)row.airborneCornerTicks++;
        p.models.forEach((m,n)=>{const s=p.read(m),c=corner[n];c.peakRearSlip=Math.max(c.peakRearSlip,Math.abs(s.rearSlip));if(i>=120){c.meanSpeed+=s.linearSpeed/60;c.meanYawRate+=Math.abs(s.yawRate)/60;}});
      }
      p.models.forEach((m,n)=>{const target=n?row.rapier:row.legacy;target.corner=corner[n];target.corner.radius=corner[n].meanSpeed/Math.max(1e-9,corner[n].meanYawRate);});
      p.runPair(3,{});check();
      row.legacy.release=p.read(p.legacy);row.rapier.release=p.read(p.model);
      p.legacy.reset();p.model.reset();p.runPair(1,{});
      p.legacy.state.velocityZ=-10;p.model.body.setLinvel({x:0,y:0,z:-10},true);
      p.runPair(3,{brake:1});check();
      row.legacy.brakingSpeedAfter3s=p.legacy.state.linearSpeed;row.rapier.brakingSpeedAfter3s=p.model.state.linearSpeed;
      p.legacy.reset();p.model.reset();p.runPair(1,{});
      p.legacy.setGear('R');p.model.setGear('R');p.runPair(3,{active:true,steering:.25});check();
      row.legacy.reverseSpeed=p.legacy.state.speed;row.rapier.reverseSpeed=p.model.state.speed;
      assert.ok(row.rapier.accelerationSpeed>.05,'positive throttle moves forward');
      assert.ok(row.rapier.brakingSpeedAfter3s<10,'service brakes reduce actual motion');
      assert.ok(row.rapier.reverseSpeed<-.05,'reverse gear moves backward');
    } catch(error) {row.finite=false;row.failure=error.message;failures.push(`${id}/${biome}/${level}: ${error.message}`);}
    finally {p.dispose();}
    handlingReport.matrix.push(row);
    if(handlingReport.matrix.length%33===0)console.log(`Rapier qualitative handling matrix: ${handlingReport.matrix.length}/165`);
  }
  handlingReport.matrixFailures=failures;writeHandlingReport();
  assert.equal(handlingReport.matrix.length,165);
  assert.deepEqual(failures,[],`Handling matrix report: ${handlingReportPath}`);
});
