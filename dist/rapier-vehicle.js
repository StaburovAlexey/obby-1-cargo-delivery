import {getRapier} from './rapier-runtime.js';
import {vehicleConfig} from './economy-config.js';
import {CITY_SURFACE, normalizeSurfaceDynamics} from './biome-surfaces.js';
import {getUpgradeModifiers, steeringResponseSeconds} from './vehicle-upgrades.js';
import {TOW_DRIVING, VEHICLE_DYNAMICS, VEHICLE_WHEELS, CONTROLLED_SKID,
  evaluateVehicleForces, roadWheelTarget} from './driving-model.js';
import {BMW_DRIFT, evaluateDriftDynamics, driftTelemetry, driftWheelTarget} from './drift-dynamics.js';
import {vehiclePhysicsGeometry} from './vehicle-physics.js';

const MASS = VEHICLE_DYNAMICS.mass;
const GRAVITY = VEHICLE_DYNAMICS.gravity;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const finite = (v,fallback=0) => Number.isFinite(v) ? v : fallback;
const vec = (x=0,y=0,z=0) => ({x,y,z});
const add = (a,b) => vec(a.x+b.x,a.y+b.y,a.z+b.z);
const sub = (a,b) => vec(a.x-b.x,a.y-b.y,a.z-b.z);
const scale = (a,s) => vec(a.x*s,a.y*s,a.z*s);
const dot = (a,b) => a.x*b.x+a.y*b.y+a.z*b.z;
const cross = (a,b) => vec(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
const unit = a => scale(a,1/Math.max(1e-12,Math.hypot(a.x,a.y,a.z)));
const rotate = (v,q) => {
  const t=scale(cross(q,v),2);
  return add(v,add(scale(t,q.w),cross(q,t)));
};
const identity = () => ({x:0,y:0,z:0,w:1});
const headingQuaternion = heading => ({x:0,y:Math.sin(heading/2),z:0,w:Math.cos(heading/2)});
const quaternion = q => {
  const source=Array.isArray(q) ? {x:q[0],y:q[1],z:q[2],w:q[3]} : q;
  if (!source || ![source.x,source.y,source.z,source.w].every(Number.isFinite))
    throw new TypeError('Vehicle quaternion must have four finite components.');
  const length=Math.hypot(source.x,source.y,source.z,source.w);
  if (length<1e-12) throw new TypeError('Vehicle quaternion must be nonzero.');
  return {x:source.x/length,y:source.y/length,z:source.z/length,w:source.w/length};
};
const RENDER_FIELDS = ['x','y','z','heading','velocityX','velocityY','velocityZ','angularVelocity',
  'speed','linearSpeed','frontWheelAngle','wheelSpin','bodyPitch','bodyRoll','bodyBob',
  'slipAngle','driftIntensity','driftBlend','upY'];

// A body's translation always denotes the GLB root. Bounds and wheel positions
// retain that origin; the mass centre and collider are offsets inside the body.
function physicalGeometry(metadata, bmw=false) {
  const measured=vehiclePhysicsGeometry(metadata,MASS);
  const source=measured ? (metadata.wheels ?? metadata.wheelContacts) : null;
  const wheels=(measured?.wheels ?? VEHICLE_WHEELS).map((wheel,index) => {
    const contact=source?.[index];
    return {...wheel, y:finite(contact?.center?.[1],.73),
      radius:Math.max(.1,finite(contact?.radius,TOW_DRIVING.wheelRadius)),
      loadShare:wheel.loadShare ?? .25};
  });
  const dimensions=measured ? metadata.dimensions : [3.1,2.7,5.76];
  const bounds=metadata?.bounds;
  const min=Array.isArray(bounds?.min) && bounds.min.every(Number.isFinite) ? bounds.min : [-dimensions[0]/2,0,-dimensions[2]/2];
  const max=Array.isArray(bounds?.max) && bounds.max.every(Number.isFinite) ? bounds.max : [dimensions[0]/2,dimensions[1],dimensions[2]/2];
  const wheelY=wheels.reduce((n,w)=>n+w.y*w.loadShare,0);
  const radius=wheels.reduce((n,w)=>n+w.radius*w.loadShare,0);
  const axleZ=front=>{
    const axle=wheels.filter(w=>w.front===front);
    return axle.reduce((sum,w)=>sum+w.z,0)/axle.length;
  };
  const frontZ=measured?.frontZ ?? axleZ(true),rearZ=measured?.rearZ ?? axleZ(false);
  // The chassis excludes the tires. Its belly can strike real geometry when the
  // suspension bottoms out, without supporting the car instead of its wheels.
  const bottom=Math.max(min[1],Math.min(...wheels.map(w=>w.y-w.radius*.3)));
  const top=Math.max(bottom+.25,max[1]);
  return {...measured, wheels, frontZ, rearZ, wheelbase:rearZ-frontZ,
    halfWidth:dimensions[0]/2,halfLength:dimensions[2]/2,
    yawInertia:bmw ? BMW_DRIFT.yawInertia : measured?.yawInertia ?? VEHICLE_DYNAMICS.yawInertia,
    dimensions:[...dimensions],bounds:{min:[...min],max:[...max]},
    colliderHalf:vec(Math.max(.3,(max[0]-min[0])*.48),(top-bottom)/2,Math.max(.5,(max[2]-min[2])*.49)),
    colliderCenter:vec((max[0]+min[0])/2,(top+bottom)/2,(max[2]+min[2])/2),
    centerOfMass:vec(0,wheelY-.12,0),wheelRadius:radius,
    lowestWheelPoint:Math.min(...wheels.map(w=>w.y-w.radius)),
  };
}

export function createRapierDrivingModel({
  world, x=1.8, z=9.8, y, heading=0, vehicleId='pickup',
  maxSpeed=TOW_DRIVING.maxSpeed, getUpgrades=()=>undefined,
  getVehicleMetadata=()=>undefined, groundSurface=()=>CITY_SURFACE,
  onCollision=()=>{}, getRampBoost=()=>null, getSurfaceHazard=()=>null, onSurfaceHazard=()=>{},
}={}) {
  const R=getRapier();
  if (!world?.createRigidBody) throw new TypeError('Vehicle requires the shared Rapier World.');
  const spec=vehicleConfig(vehicleId);
  maxSpeed=clamp(finite(Number(maxSpeed),spec.maxSpeed),1,spec.rewardDrift?50:40);
  const catalogAcceleration=maxSpeed===spec.maxSpeed ? spec.acceleration : Math.min(VEHICLE_DYNAMICS.maximumAcceleration,maxSpeed/VEHICLE_DYNAMICS.accelerationTimeScale);
  let metadataSource=getVehicleMetadata(), geometry=physicalGeometry(metadataSource,!!spec.rewardDrift);
  if (!Number.isFinite(y)) {
    // Direct casts see newly created static shapes before the world's first
    // broad-phase update. This happens once at spawn, never during simulation.
    const ray=new R.Ray(vec(x,10000,z),vec(0,-1,0));
    let distance=Infinity;
    world.colliders.forEach(collider=>{
      if(collider.isSensor() || collider.parent()?.isDynamic()) return;
      const hit=collider.castRayAndGetNormal(ray,20000,true);
      if(hit && hit.normal.y>.2 && hit.timeOfImpact<distance) distance=hit.timeOfImpact;
    });
    y=(Number.isFinite(distance)?10000-distance:0)-geometry.lowestWheelPoint+.012;
  }
  const spawn={x,y,z,heading};
  const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x,y,z)
    .setRotation(headingQuaternion(heading)).setCanSleep(false).setCcdEnabled(true)
    .setLinearDamping(0).setAngularDamping(0));
  body.userData={tag:'vehicle',vehicleId};
  let collider, disposed=false, enabled=true, gearBraking=false;
  // Rapier clears these public sets when World.free() releases its WASM data.
  // Late UI callbacks can outlive a scene, including during development HMR.
  const isLive=()=>!disposed && !!world.bodies && !!world.colliders;
  const state={x,y,z,heading,velocityX:0,velocityY:0,velocityZ:0,angularVelocity:0,
    angularVelocity3D:vec(),quaternion:headingQuaternion(heading),
    speed:0,linearSpeed:0,frontWheelAngle:0,wheelSpin:0,gear:'D',steering:0,
    active:false,speedDemand:null,moving:false,blocked:false,braking:0,impactSpeed:0,
    brake:0,handbrake:0,slipAngle:0,driftIntensity:0,driftBlend:0,
    travel:0,pathDistance:0,movingSeconds:0,bodyPitch:0,bodyRoll:0,bodyBob:0,
    grounded:false,airborne:true,wheelContacts:[],upY:1};
  const previousRender={},currentRender={},renderState={quaternion:identity(),angularVelocity3D:vec()};
  let previousStep=vec(x,y,z),previousHeading=heading,preStepVelocity=vec();
  const enteredPatches=new Set();
  let hazardSpin=null;
  const copyRender=target=>{
    for(const key of RENDER_FIELDS) target[key]=state[key];
    target.quaternion={...state.quaternion};
    target.angularVelocity3D={...state.angularVelocity3D};
    target.grounded=state.grounded;target.airborne=state.airborne;
  };
  const resetRender=()=>{copyRender(previousRender);copyRender(currentRender);};
  const rebuildCollider=()=>{
    if(collider) world.removeCollider(collider,false);
    const h=geometry.colliderHalf,c=geometry.colliderCenter;
    collider=world.createCollider(R.ColliderDesc.cuboid(h.x,h.y,h.z)
      .setTranslation(c.x,c.y,c.z).setDensity(0).setFriction(.35).setRestitution(.02),body);
    collider.userData={tag:'vehicle',vehicleId};
    const d=geometry.dimensions;
    const inertia=vec(MASS*(d[1]**2+d[2]**2)/12,geometry.yawInertia,MASS*(d[0]**2+d[1]**2)/12);
    body.setAdditionalMassProperties(MASS,geometry.centerOfMass,inertia,identity(),true);
    body.recomputeMassPropertiesFromColliders();
  };
  const syncGeometry=()=>{
    if(!isLive()) return;
    const metadata=getVehicleMetadata();
    if(metadata===metadataSource) return;
    metadataSource=metadata;geometry=physicalGeometry(metadata,!!spec.rewardDrift);rebuildCollider();
  };
  rebuildCollider();

  const readBody=()=>{
    const position=body.translation(),q=body.rotation(),velocity=body.linvel(),angular=body.angvel();
    const forward=rotate(vec(0,0,-1),q),up=rotate(vec(0,1,0),q);
    state.x=position.x;state.y=position.y;state.z=position.z;
    state.velocityX=velocity.x;state.velocityY=velocity.y;state.velocityZ=velocity.z;
    Object.assign(state.quaternion,q);Object.assign(state.angularVelocity3D,angular);
    const nextHeading=Math.atan2(-forward.x,-forward.z);
    state.heading+=Math.atan2(Math.sin(nextHeading-state.heading),Math.cos(nextHeading-state.heading));
    state.angularVelocity=angular.y;state.upY=up.y;
    state.speed=dot(velocity,forward);state.linearSpeed=Math.hypot(velocity.x,velocity.z);
    state.moving=state.linearSpeed>TOW_DRIVING.movingThreshold || Math.abs(angular.y)>VEHICLE_DYNAMICS.sleepYawSpeed;
    Object.assign(state,driftTelemetry(state));
    state.driftBlend=state.driftIntensity;
    // The render root already carries the physical pitch, roll and suspension
    // heave. Cosmetic body offsets would apply those motions a second time.
    state.bodyPitch=state.bodyRoll=state.bodyBob=0;
  };
  const inverseMassAt=(point,direction)=>{
    const r=sub(point,body.worldCom()),axis=cross(r,direction),m=body.effectiveWorldInvInertia();
    const rotated=vec(m.m11*axis.x+m.m12*axis.y+m.m13*axis.z,
      m.m21*axis.x+m.m22*axis.y+m.m23*axis.z,m.m31*axis.x+m.m32*axis.y+m.m33*axis.z);
    return 1/MASS+dot(axis,rotated);
  };
  const supportVelocity=(contact,point)=>contact.collider.parent()?.velocityAtPoint(point) ?? vec();
  const surfaceAt=(point,upgrades)=>{
    const surface=normalizeSurfaceDynamics(groundSurface(point.x,point.z,vehicleId,point));
    surface.frictionFactor*=upgrades.grip;surface.lateralDampingFactor*=upgrades.grip;
    return surface;
  };
  const castWheels=()=>{
    const position=body.translation(),q=body.rotation(),down=rotate(vec(0,-1,0),q);
    return geometry.wheels.map(wheel=>{
      const origin=add(position,rotate(vec(wheel.x,wheel.y+.10,wheel.z),q));
      const contact={...wheel,grounded:false,normalLoad:0,longitudinalForce:0,lateralForce:0,
        suspensionLength:.32,suspensionCompression:0};
      if(down.y>-.15) return contact;
      const ray=new R.Ray(origin,down);
      const hit=world.castRayAndGetNormal(ray,wheel.radius+.32,true,R.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,collider,body,c=>!c.isSensor() && c.parent()?.handle!==body.handle);
      if(!hit || hit.normal.y<.15 || dot(hit.normal,down)>-.2) return contact;
      const point=add(origin,scale(down,hit.timeOfImpact));
      Object.assign(contact,{grounded:true,point,normal:{...hit.normal},collider:hit.collider,
        suspensionLength:hit.timeOfImpact-wheel.radius,
        suspensionCompression:wheel.radius+.22-hit.timeOfImpact});
      return contact;
    });
  };
  const controlState=(dt,surface,upgrades)=>{
    const effectiveMaxSpeed=maxSpeed*upgrades.speed;
    const stockSurfaceSpeed=Math.max(CONTROLLED_SKID.startSpeed,maxSpeed*surface.speedFactor);
    const speedAssistRatio=!spec.rewardDrift && state.gear==='D' ? clamp(state.speed/stockSurfaceSpeed,1,1.10):1;
    const load=clamp((speedAssistRatio-1)/.10,0,1),loadBlend=load*load*(3-2*load);
    const requestingReverse=Number.isFinite(state.speedDemand) && state.speedDemand<-.001;
    const rawLoad=!spec.rewardDrift && state.gear==='D' && !requestingReverse ? clamp((state.linearSpeed/stockSurfaceSpeed-1)/.10,0,1):0;
    const onset=clamp((rawLoad-.001)/.009,0,1),speedDemand=rawLoad*onset*onset*(3-2*onset);
    const supportedTire=clamp(2/surface.longitudinalGripFactor-1,0,1);
    const rearGripDeficit=Math.max(0,speedDemand-clamp((upgrades.grip-1)/.2,0,1))*supportedTire;
    const handlingDeficit=Math.max(0,speedDemand-clamp((upgrades.handling-1)/.3,0,1))*supportedTire;
    const response=(spec.rewardDrift ? .22/(spec.handling*upgrades.handling**1.35) :
      steeringResponseSeconds(spec.handling*upgrades.handling,state.linearSpeed)) /
      surface.handlingFactor*(1+.20*loadBlend+handlingDeficit);
    const gripScale=Math.sqrt(Math.min(1,surface.frictionFactor*surface.longitudinalGripFactor));
    const reverseScale=state.gear==='R' ? Math.min(1,surface.frictionFactor):1;
    const target=spec.rewardDrift && state.gear!=='R' ? driftWheelTarget(state.steering,state.linearSpeed) :
      roadWheelTarget(state.steering,state.linearSpeed/speedAssistRatio/gripScale,
        9+7*Math.min(1,1/surface.longitudinalGripFactor))*reverseScale;
    state.frontWheelAngle+=(target-state.frontWheelAngle)*(1-Math.exp(-dt/response));
    const analog=Number.isFinite(state.speedDemand),demand=analog ? state.speedDemand:0;
    if(analog && Math.abs(demand)>.001) {
      const gear=demand<0?'R':'D';
      if(state.gear!==gear) gearBraking=false;
      state.gear=gear;
    }
    const direction=state.gear==='R'?-1:1;
    if(!state.active) gearBraking=false;
    else if(state.speed*direction<-.08) gearBraking=true;
    if(gearBraking && Math.abs(state.speed)<.08 && state.linearSpeed<.10) gearBraking=false;
    const speedFraction=analog ? Math.abs(demand):1;
    const targetSpeed=effectiveMaxSpeed*surface.speedFactor*speedFraction;
    const excess=state.speed*direction-targetSpeed;
    const analogBrake=analog ? (speedFraction<.001?1:clamp((excess-.04)*.7,0,1)):0;
    const serviceBraking=Math.max(state.brake,gearBraking?1:analogBrake);
    state.braking=Math.max(serviceBraking,state.handbrake);
    return {effectiveMaxSpeed,speedFraction,targetSpeed,speedAssistRatio,rearGripDeficit,serviceBraking,
      bmwForward:!!spec.rewardDrift && state.gear==='D' && !gearBraking};
  };
  const tireImpulse=(contact,dt,upgrades,controls,snapshot,defer=false)=>{
    const n=contact.normal,q=body.rotation();
    const bodyForward=rotate(vec(0,0,-1),q);
    const forward=unit(sub(bodyForward,scale(n,dot(bodyForward,n))));
    const right=unit(cross(forward,n));
    const angular=dot(snapshot?.angular ?? body.angvel(),n);
    const pointVelocity=snapshot ? add(snapshot.linear,cross(snapshot.angular,sub(contact.point,snapshot.center))) : body.velocityAtPoint(contact.point);
    const relative=sub(pointVelocity,supportVelocity(contact,contact.point));
    const virtual={...state,heading:0,angularVelocity:angular,
      velocityX:dot(relative,right)-angular*contact.z,
      velocityZ:-dot(relative,forward)+angular*contact.x};
    const surface=surfaceAt(contact.point,upgrades);
    const loadRatio=contact.normalLoad/(MASS*GRAVITY*contact.loadShare);
    let forces;
    if(controls.bmwForward) {
      // The BMW's engine drives only its rear axle. Normal load changes its
      // traction limit, while engine torque remains the catalog engine torque.
      surface.frictionFactor=Math.min(surface.frictionFactor/upgrades.grip,1.4)*upgrades.grip;
      forces=evaluateDriftDynamics(virtual,{maxSpeed:controls.targetSpeed,
        engineAcceleration:catalogAcceleration*upgrades.engine*surface.engineFactor,
        surface,gradient:{x:0,z:0},braking:controls.serviceBraking,dt,mass:MASS});
    } else forces=evaluateVehicleForces(virtual,{maxSpeed:controls.effectiveMaxSpeed,
      gradient:{x:0,z:0},braking:state.braking,speedFraction:controls.speedFraction,surface,
      engineAcceleration:catalogAcceleration*upgrades.engine,brakeFactor:spec.grip*upgrades.grip,
      rewardDrift:spec.rewardDrift,skidGrip:upgrades.grip,
      geometry,speedAssistRatio:controls.speedAssistRatio,rearGripDeficit:controls.rearGripDeficit});
    const index=geometry.wheels.findIndex(w=>w.name===contact.name);
    const tire=forces.tires.find(t=>t.name===contact.name) ?? forces.tires[index];
    if(!tire || contact.normalLoad<=0) return;
    const angle=contact.front?state.frontWheelAngle:0;
    const tireForward=add(scale(forward,Math.cos(angle)),scale(right,-Math.sin(angle)));
    const tireRight=add(scale(right,Math.cos(angle)),scale(forward,Math.sin(angle)));
    const limitResistance=(force,direction)=>{
      let impulse=force*dt;
      const velocity=dot(sub(body.velocityAtPoint(contact.point),supportVelocity(contact,contact.point)),direction);
      // Implicit contact damping: a resisting tire cannot reverse its own point
      // velocity in one tick, even with upgraded grip and the 60 Hz world step.
      if(impulse*velocity<0) {
        const stopping=Math.abs(velocity)/Math.max(1e-9,inverseMassAt(contact.point,direction));
        impulse=Math.sign(impulse)*Math.min(Math.abs(impulse),stopping*.85);
      }
      body.applyImpulseAtPoint(scale(direction,impulse),contact.point,true);
      return impulse/dt;
    };
    const apply=(longitudinalForce,lateralForce)=>{
      contact.longitudinalForce=limitResistance(longitudinalForce,tireForward);
      contact.lateralForce=limitResistance(lateralForce,tireRight);
    };
    if(defer) return {contact,forward:tireForward,right:tireRight,loadRatio,
      longitudinalForce:tire.longitudinalForce,lateralForce:tire.lateralForce,apply};
    apply(tire.longitudinalForce*loadRatio,tire.lateralForce*loadRatio);
  };
  const applyBmwAxles=(tires,controls)=>{
    const center=body.worldCom();
    for(const front of [true,false]) {
      const axle=tires.filter(t=>t.contact.front===front);
      if(!axle.length) continue;
      const load=axle.reduce((sum,t)=>sum+t.contact.normalLoad,0);
      const staticLoad=MASS*GRAVITY*geometry.wheels.filter(w=>w.front===front).reduce((sum,w)=>sum+w.loadShare,0);
      // The BMW is intentionally calibrated with quarter-car tire loads. Keep
      // its nonlinear axle force and yaw budget, then distribute lateral force
      // by real spring load. Merely scaling steered tires adds a new yaw couple.
      // This algebraic allocation preserves the tire-law result, not a target
      // heading, yaw rate or slip angle. Impulses retain their 3D contact points.
      // Full arcade grip needs 90% of static axle support; below that it fades
      // linearly to zero. Missing tires never contribute to the force budget.
      const support=clamp(load/(staticLoad*.9),0,1);
      const brake=Math.max(controls.serviceBraking,front?0:state.handbrake);
      const longitudinal=axle.map(t=>t.longitudinalForce*(support*(1-brake)+t.loadRatio*brake));
      const lateral=axle.map(t=>t.lateralForce*support);
      if(axle.length!==2) {axle.forEach((t,i)=>t.apply(longitudinal[i],lateral[i]));continue;}
      const axis=unit(axle.reduce((n,t)=>add(n,t.contact.normal),vec()));
      const lever=(t,direction)=>dot(cross(sub(t.contact.point,center),direction),axis);
      const a=axle.map(t=>lever(t,t.forward)),b=axle.map(t=>lever(t,t.right));
      if(Math.abs(a[0]-a[1])<.05) {axle.forEach((t,i)=>t.apply(longitudinal[i],lateral[i]));continue;}
      const totalLongitudinal=longitudinal[0]+longitudinal[1],totalLateral=lateral[0]+lateral[1];
      const yaw=a[0]*longitudinal[0]+a[1]*longitudinal[1]+b[0]*lateral[0]+b[1]*lateral[1];
      const distributedLateral=axle.map(t=>totalLateral*t.contact.normalLoad/load);
      const firstLongitudinal=(yaw-b[0]*distributedLateral[0]-b[1]*distributedLateral[1]-a[1]*totalLongitudinal)/(a[0]-a[1]);
      axle[0].apply(firstLongitudinal,distributedLateral[0]);
      axle[1].apply(totalLongitudinal-firstLongitudinal,distributedLateral[1]);
    }
  };
  const stopMotion=()=>{
    body.setLinvel(vec(),true);body.setAngvel(vec(),true);readBody();
  };
  const setPose=(pose={}, {clearMotion=true}={})=>{
    if(!isLive()) return;
    syncGeometry();
    const position=body.translation();
    for(const key of ['x','y','z']) if(pose[key]!==undefined && !Number.isFinite(pose[key]))
      throw new TypeError(`Vehicle ${key} must be finite.`);
    const q=pose.quaternion!==undefined ? quaternion(pose.quaternion) :
      pose.heading!==undefined ? headingQuaternion(finite(pose.heading)) : body.rotation();
    body.setTranslation(vec(pose.x??position.x,pose.y??position.y,pose.z??position.z),true);
    body.setRotation(q,true);
    if(clearMotion) stopMotion();else readBody();
    enteredPatches.clear();hazardSpin=null;
    previousStep=vec(state.x,state.y,state.z);previousHeading=state.heading;
    state.travel=state.pathDistance=state.movingSeconds=0;
    state.blocked=false;state.impactSpeed=0;state.grounded=false;state.airborne=true;
    state.wheelContacts=[];resetRender();
    world.propagateModifiedBodyPositionsToColliders();
    return state;
  };

  readBody();resetRender();
  return {
    state,body,
    get physicsGeometry(){syncGeometry();return geometry;},
    get enabled(){return enabled && isLive();},
    setInput({steering=0,active=false,speedDemand,brake=0,handbrake=0}={}) {
      if(!isLive()) return;
      state.steering=clamp(finite(Number(steering)),-1,1);
      state.speedDemand=Number.isFinite(speedDemand)?clamp(speedDemand,-1,1):null;
      state.active=state.speedDemand===null?!!active:Math.abs(state.speedDemand)>.001;
      state.brake=clamp(finite(Number(brake)),0,1);
      state.handbrake=spec.rewardDrift?clamp(finite(Number(handbrake)),0,1):0;
    },
    setGear(gear) {
      if(!isLive()) return;
      if(gear!=='D' && gear!=='R') throw new Error('Gear must be D or R');
      if(state.gear!==gear) gearBraking=false;
      state.gear=gear;
    },
    setPose,
    setEnabled(value) {
      if(!isLive()) return;
      enabled=!!value;
      body.setEnabled(enabled);
      if(!enabled) {state.travel=state.pathDistance=state.movingSeconds=0;state.blocked=false;}
    },
    pause() {
      if(!isLive()) return;
      state.active=false;state.speedDemand=Number.isFinite(state.speedDemand)?0:null;
      state.steering=state.frontWheelAngle=state.brake=state.handbrake=state.braking=0;
      state.travel=state.pathDistance=state.movingSeconds=state.impactSpeed=0;
      state.blocked=false;gearBraking=false;hazardSpin=null;stopMotion();resetRender();
    },
    reset() {
      if(!isLive()) return;
      Object.assign(state,{gear:'D',steering:0,frontWheelAngle:0,wheelSpin:0,
        active:false,speedDemand:null,brake:0,handbrake:0,braking:0});
      gearBraking=false;setPose(spawn);
    },
    beginFrame() {
      if(!isLive()) return;
      state.travel=state.pathDistance=state.movingSeconds=0;
      state.blocked=false;state.impactSpeed=0;
    },
    beforeStep(dt) {
      if(!isLive() || !enabled || !(dt>0)) return;
      syncGeometry();readBody();
      Object.assign(previousRender,currentRender);
      previousStep=vec(state.x,state.y,state.z);previousHeading=state.heading;
      preStepVelocity={...body.linvel()};
      let levels;try{levels=getUpgrades();}catch{}
      const upgrades=getUpgradeModifiers(levels);
      const surface=surfaceAt(previousStep,upgrades),controls=controlState(dt,surface,upgrades);
      const contacts=castWheels();state.wheelContacts=contacts;
      body.resetForces(false);body.resetTorques(false);
      for(const contact of contacts) {
        if(!contact.grounded) continue;
        const nominal=MASS*GRAVITY*contact.loadShare;
        const stiffness=nominal/.12;
        const damping=2*Math.sqrt(stiffness*MASS*contact.loadShare)*.8;
        const relative=sub(body.velocityAtPoint(contact.point),supportVelocity(contact,contact.point));
        const inverse=inverseMassAt(contact.point,contact.normal);
        const predicted=dot(relative,contact.normal)+dot(world.gravity,contact.normal)*dt;
        const force=(stiffness*contact.suspensionCompression-(damping+stiffness*dt)*predicted)/
          (1+(damping*dt+stiffness*dt*dt)*inverse);
        contact.normalLoad=clamp(force,0,nominal*5);
        body.addForceAtPoint(scale(contact.normal,contact.normalLoad),contact.point,true);
      }
      // Ordinary parking dampers use sequential velocities so four stiff tires
      // cannot each cancel the same slip. The BMW's finite slip-angle law uses
      // one velocity snapshot, retaining its simultaneous four-tire yaw budget.
      const tireSnapshot=controls.bmwForward ? {linear:{...body.linvel()},angular:{...body.angvel()},center:body.worldCom()} : null;
      if(controls.bmwForward) applyBmwAxles(contacts.filter(c=>c.grounded).map(c=>tireImpulse(c,dt,upgrades,controls,tireSnapshot,true)).filter(Boolean),controls);
      else for(const contact of contacts) if(contact.grounded) tireImpulse(contact,dt,upgrades,controls);
      state.grounded=contacts.some(c=>c.grounded && c.normalLoad>0);
      state.airborne=!state.grounded;
      // Keep an entry latched through wheel bounce and through the whole car
      // crossing the patch. Only a fresh supported entry takes fuel again.
      const nearby=new Set(),position=body.translation(),rotation=body.rotation();
      for(const wheel of [vec(),...geometry.wheels]){
        const point=add(position,rotate(vec(wheel.x,0,wheel.z),rotation));
        const patch=getSurfaceHazard(point.x,point.z,2);
        if(patch)nearby.add(patch.id);
      }
      for(const id of enteredPatches)if(!nearby.has(id))enteredPatches.delete(id);
      if(state.grounded&&state.linearSpeed>.8&&state.upY>.65){
        for(const contact of contacts){
          if(!contact.grounded||contact.normalLoad<=0)continue;
          const patch=getSurfaceHazard(contact.point.x,contact.point.z,0);
          if(!patch||enteredPatches.has(patch.id))continue;
          enteredPatches.add(patch.id);
          if(!hazardSpin)hazardSpin={remaining:Math.PI,direction:patch.offset<0?1:-1,seconds:0};
          onSurfaceHazard(patch);
        }
      }
      if(hazardSpin){
        const angular=body.angvel();
        body.setAngvel(vec(angular.x,hazardSpin.direction*Math.min(3.8,hazardSpin.remaining/dt),angular.z),true);
        hazardSpin.seconds+=dt;
      }
      // The pad supplies a bounded impulse along its uphill direction. Query
      // actual loaded wheel contacts so passing above/beside it gives no boost.
      if(state.grounded&&state.gear==='D'&&state.active&&state.braking<.1&&state.upY>.65){
        const contact=contacts.find(c=>c.grounded&&c.normalLoad>0&&getRampBoost(c.point.x,c.point.z));
        const boost=contact&&getRampBoost(contact.point.x,contact.point.z);
        if(boost&&Math.cos(state.heading-boost.heading)>.85){
          const direction=unit(vec(-Math.sin(boost.heading),boost.slope,-Math.cos(boost.heading)));
          const speed=dot(body.linvel(),direction),gain=Math.min(boost.acceleration*dt,Math.max(0,boost.speed-speed));
          if(gain>0)body.applyImpulse(scale(direction,MASS*gain),true);
        }
      }
    },
    afterStep(dt) {
      if(!isLive() || !enabled || !(dt>0)) return;
      readBody();
      const dx=state.x-previousStep.x,dy=state.y-previousStep.y,dz=state.z-previousStep.z;
      if(hazardSpin){
        const turn=Math.atan2(Math.sin(state.heading-previousHeading),Math.cos(state.heading-previousHeading));
        hazardSpin.remaining=Math.max(0,hazardSpin.remaining-turn*hazardSpin.direction);
        if(hazardSpin.remaining<.025||hazardSpin.seconds>=1.5){
          const angular=body.angvel();body.setAngvel(vec(angular.x,0,angular.z),true);hazardSpin=null;readBody();
        }
      }
      const middle=(previousHeading+state.heading)/2;
      const travel=-Math.sin(middle)*dx-Math.cos(middle)*dz;
      const distance=Math.hypot(dx,dy,dz);
      state.travel+=travel;state.pathDistance+=distance;
      if(distance/dt>=.15) state.movingSeconds+=dt;
      state.wheelSpin+=travel/geometry.wheelRadius;
      world.contactPairsWith(collider,other=>{
        if(other.isSensor()) return;
        world.contactPair(collider,other,(manifold)=>{
          // Rapier's triangle manifolds can retain real penetrating contacts
          // while exposing no solver contacts after CCD. Read contact distance
          // too, so rendered facades report the collision the solver resolved.
          let touching=manifold.numSolverContacts()>0;
          for(let i=0;i<manifold.numContacts() && !touching;i++) touching=manifold.contactDist(i)<=.002;
          if(!touching) return;
          const normal=manifold.normal();
          if(Math.abs(normal.y)>.65) return;
          const speed=Math.abs(dot(preStepVelocity,normal));
          state.blocked=true;state.impactSpeed=Math.max(state.impactSpeed,speed);
          onCollision({collider:other,normal:{...normal},impactSpeed:speed,vehicleId,state});
        });
      });
      copyRender(currentRender);
      return state;
    },
    captureRender() {if(isLive()) copyRender(currentRender);return currentRender;},
    getRenderState(alpha=1) {
      alpha=isLive()?clamp(finite(alpha,1),0,1):1;
      for(const key of RENDER_FIELDS) renderState[key]=previousRender[key]+(currentRender[key]-previousRender[key])*alpha;
      const turn=currentRender.heading-previousRender.heading;
      renderState.heading=previousRender.heading+Math.atan2(Math.sin(turn),Math.cos(turn))*alpha;
      const a=previousRender.quaternion,b=currentRender.quaternion;
      const sign=a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w<0?-1:1;
      const cosine=clamp((a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w)*sign,-1,1);
      const theta=Math.acos(cosine),sine=Math.sin(theta);
      const wa=sine>1e-6?Math.sin((1-alpha)*theta)/sine:1-alpha;
      const wb=(sine>1e-6?Math.sin(alpha*theta)/sine:alpha)*sign;
      for(const key of ['x','y','z','w']) renderState.quaternion[key]=a[key]*wa+b[key]*wb;
      for(const key of ['x','y','z']) renderState.angularVelocity3D[key]=previousRender.angularVelocity3D[key]+(currentRender.angularVelocity3D[key]-previousRender.angularVelocity3D[key])*alpha;
      renderState.grounded=state.grounded;renderState.airborne=state.airborne;
      return renderState;
    },
    dispose() {
      if(disposed) return;
      const live=isLive();
      disposed=true;enabled=false;
      if(live && world.bodies.contains(body.handle)) world.removeRigidBody(body);
      state.wheelContacts=[];
    },
  };
}
