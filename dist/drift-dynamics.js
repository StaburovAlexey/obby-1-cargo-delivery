const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));

export const BMW_DRIFT=Object.freeze({
  wheelbase:4.804521067916265,yawInertia:10800,halfWidth:1.7,halfLength:4.05,
  maximumSlip:.62,gripResponse:.45,yawResponse:8,coastingDrag:.16,
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

export function evaluateDriftDynamics(state,{maxSpeed,engineAcceleration,surface,gradient,braking=0,dt,mass=1600,inertia=BMW_DRIFT.yawInertia}){
  const speed=Math.hypot(state.velocityX,state.velocityZ),heading=state.heading;
  const telemetry=driftTelemetry(state),steer=state.steering;
  const magnitude=Math.max(0,(Math.abs(steer)-.08)/.92),intent=Math.sign(steer)*magnitude*(.55+.45*magnitude);
  const handbrake=state.handbrake||0;
  const targetBlend=smooth(6,13,speed)*smooth(.15,.65,Math.abs(steer))*Math.max(state.active?1:0,handbrake);
  state.driftBlend+=(targetBlend-state.driftBlend)*(1-Math.exp(-dt/.22));
  const targetSlip=-Math.sign(steer)*BMW_DRIFT.maximumSlip*state.driftBlend*(1-.5*braking);
  const friction=9.81*clamp(surface.frictionFactor,.35,1.4);
  const yawLimit=friction/Math.max(6,speed)*.78;
  const targetYaw=clamp(-intent*(4.5/BMW_DRIFT.wheelbase)/(1+(speed/45)**2),-yawLimit,yawLimit)*smooth(.5,5,speed);
  const torque=inertia*clamp((targetYaw-state.angularVelocity)*BMW_DRIFT.yawResponse,-3.5,3.5);
  const betaRate=clamp(wrap(targetSlip-telemetry.slipAngle)/BMW_DRIFT.gripResponse,-.9,.9);
  const lateralAcceleration=clamp(speed*(state.angularVelocity-betaRate),-friction,friction);
  const turnLimit=maxSpeed*(1-.37*Math.abs(intent));
  let acceleration=state.active?clamp((turnLimit-speed)*2,-2.2,engineAcceleration):-.18-speed*BMW_DRIFT.coastingDrag;
  acceleration-=braking*9.5+handbrake*4;
  if(braking>.01||handbrake>.01)acceleration=Math.min(acceleration,-braking*9.5-handbrake*4);
  const traction=Math.sqrt(Math.max(0,friction*friction-lateralAcceleration*lateralAcceleration));
  acceleration=clamp(acceleration,-Math.max(traction,braking*9.5+handbrake*4),traction);
  acceleration=Math.max(acceleration,-speed/Math.max(dt,1e-5));
  const motionHeading=speed>.05?Math.atan2(-state.velocityX,-state.velocityZ):heading;
  const gx=Number.isFinite(gradient?.x)?gradient.x:0,gz=Number.isFinite(gradient?.z)?gradient.z:0,den=1+gx*gx+gz*gz;
  return {forceX:mass*(-Math.sin(motionHeading)*acceleration-Math.cos(motionHeading)*lateralAcceleration-9.81*gx/den),
    forceZ:mass*(-Math.cos(motionHeading)*acceleration+Math.sin(motionHeading)*lateralAcceleration-9.81*gz/den),torque};
}

export function driftWheelTarget(steer,speed,slipAngle){
  return clamp(-steer*.52/(1+(Math.abs(speed)/32)**2)-slipAngle*.7,-.65,.65);
}
