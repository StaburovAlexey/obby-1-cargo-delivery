const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};

export const BMW_DRIFT=Object.freeze({
  wheelbase:4.804521067916265,yawInertia:10800,halfWidth:1.7,halfLength:4.05,
  wheels:Object.freeze([
    Object.freeze({name:'front-left',x:-1.30250780845,z:-2.58302943097,front:true}),
    Object.freeze({name:'front-right',x:1.30250780845,z:-2.58302943097,front:true}),
    Object.freeze({name:'rear-left',x:-1.30250780845,z:2.22149163694,front:false}),
    Object.freeze({name:'rear-right',x:1.30250780845,z:2.22149163694,front:false}),
  ]),
});

export function driftTelemetry(state){
  const c=Math.cos(state.heading),s=Math.sin(state.heading);
  const forward=-s*state.velocityX-c*state.velocityZ,lateral=c*state.velocityX-s*state.velocityZ;
  const speed=Math.hypot(state.velocityX,state.velocityZ);
  const slipAngle=speed>.5?Math.atan2(lateral,forward):0;
  return {slipAngle,driftIntensity:forward>2?smooth(.07,.5,Math.abs(slipAngle))*smooth(3,10,speed):0};
}

// All yaw and lateral motion come from the four tire contact forces. There is
// no requested slip angle, velocity rotation, steering-to-yaw servo or sideways
// acceleration assist. Tire resistance always opposes contact-patch motion.
export function evaluateDriftDynamics(state,{maxSpeed,engineAcceleration,surface,gradient,braking=0,dt,mass=1600}){
  const c=Math.cos(state.heading),s=Math.sin(state.heading);
  const forward=-s*state.velocityX-c*state.velocityZ;
  const handbrake=clamp(state.handbrake||0,0,1);
  const gx=Number.isFinite(gradient?.x)?gradient.x:0,gz=Number.isFinite(gradient?.z)?gradient.z:0,den=1+gx*gx+gz*gz;
  const load=mass*9.81/4/Math.sqrt(den),grip=load*1.25*clamp(surface.frictionFactor,.35,1.4);
  const drive=state.active&&!braking?clamp((maxSpeed-forward)*2,0,Math.min(engineAcceleration,4.8)):0;
  let forceX=-mass*9.81*gx/den,forceZ=-mass*9.81*gz/den,torque=0;
  const tires=[];
  for(const wheel of BMW_DRIFT.wheels){
    const rx=c*wheel.x+s*wheel.z,rz=-s*wheel.x+c*wheel.z;
    const vx=state.velocityX+state.angularVelocity*rz,vz=state.velocityZ-state.angularVelocity*rx;
    const angle=state.heading+(wheel.front?state.frontWheelAngle:0),fx=-Math.sin(angle),fz=-Math.cos(angle),rightX=Math.cos(angle),rightZ=-Math.sin(angle);
    const longitudinal=vx*fx+vz*fz,lateral=vx*rightX+vz*rightZ;
    const rearBrake=wheel.front?0:handbrake;
    const tireGrip=grip*(wheel.front?.925:1.075);
    let longitudinalForce=(wheel.front?0:mass*drive/2)*(1-rearBrake)-mass*(state.active?.045:.16)*longitudinal/4-load*.018*Math.tanh(longitudinal/.18);
    longitudinalForce-=Math.tanh(longitudinal/.4)*tireGrip*Math.max(braking,rearBrake);
    // Slip-angle saturation keeps grip finite at speed; the low-speed divisor
    // prevents a discontinuity when a wheel stops or rolls backwards.
    let lateralForce=-tireGrip*Math.tanh(lateral/Math.max(3,Math.abs(longitudinal))*(wheel.front?6.5:8))*(1-.55*rearBrake);
    const scale=Math.min(1,tireGrip/Math.max(1e-12,Math.hypot(longitudinalForce,lateralForce)));
    longitudinalForce*=scale;lateralForce*=scale;
    const tx=fx*longitudinalForce+rightX*lateralForce,tz=fz*longitudinalForce+rightZ*lateralForce;
    const tireTorque=rz*tx-rx*tz;forceX+=tx;forceZ+=tz;torque+=tireTorque;
    tires.push({name:wheel.name,rx,rz,longitudinalSpeed:longitudinal,lateralSpeed:lateral,longitudinalForce,lateralForce,forceX:tx,forceZ:tz,torque:tireTorque,grip:tireGrip});
  }
  return {forceX,forceZ,torque,tires};
}

export function driftWheelTarget(steer,speed){
  return clamp(-steer*.58/(1+(Math.abs(speed)/38)**2),-.65,.65);
}
