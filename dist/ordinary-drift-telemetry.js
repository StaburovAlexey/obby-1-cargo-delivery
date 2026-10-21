import {rearTireSlip} from './vehicle-physics.js';

const smooth=(a,b,value)=>{
 const t=Math.max(0,Math.min(1,(value-a)/(b-a)));
 return t*t*(3-2*t);
};

// Measure motion at the rear axle, where rolling through a turn can cancel
// body-sideways velocity. Center-of-mass slip alone also describes normal turns.
export function ordinaryDriftTelemetry(state,geometry){
 const rearZ=geometry?.rearZ??1.73;
 const c=Math.cos(state.heading),s=Math.sin(state.heading);
 const forward=-s*state.velocityX-c*state.velocityZ;
 const slipAngle=rearTireSlip(state,rearZ);
 const rearSideSpeed=Math.abs(Math.tan(slipAngle)*Math.max(2,Math.abs(forward)));
 const driftIntensity=forward>6&&rearSideSpeed>.2
  ?smooth(.025,.15,Math.abs(slipAngle))*smooth(6,10,forward):0;
 return {slipAngle,driftIntensity};
}
