import {canyonPointAt,projectCanyon} from '../../dist/canyon-track.js';
import {BMW_DRIFT} from '../../dist/drift-dynamics.js';
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Wheelbase-curvature feed-forward and travel-direction feedback.
// Gentle rear brake in bends creates genuine tire slip; no target slip servo.
export function canyonDriverInput(s,{speed=26,look=.7,gain=1.5,offsetGain=.08}={}){
 const p=projectCanyon(s.x,s.z),v=s.linearSpeed,lead=canyonPointAt(p.progress+Math.max(4,v*look));
 const curvature=wrap(canyonPointAt(lead.progress+1).heading-canyonPointAt(lead.progress-1).heading)/2;
 const wheel=Math.atan(BMW_DRIFT.wheelbase*curvature);
 const steer0=-wheel*(1+(v/38)**2)/.58;
 const motionHeading=v>2?Math.atan2(-s.velocityX,-s.velocityZ):s.heading;
 const error=wrap(lead.heading+Math.atan(p.offset*offsetGain)-motionHeading);
 const steering=clamp(steer0-error*gain,-1,1);
 return {steering,speedDemand:speed/42,handbrake:v>12&&Math.abs(steering)>.06&&Math.abs(s.slipAngle)<.38?.3:0};
}
