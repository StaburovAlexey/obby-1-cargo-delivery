// Collision envelope follows normalized imported geometry, including steered
// tire overhang. It does not alter the driving solver's forces or coefficients.
export function vehicleFootprint(metadata,steerAngle=0,out={}){
 if(!metadata?.bounds)return undefined;
 const {min,max}=metadata.bounds;
 out.halfWidth=Math.max(Math.abs(min[0]),Math.abs(max[0]));
 out.halfLength=Math.max(Math.abs(min[2]),Math.abs(max[2]));
 for(const wheel of metadata.wheels||[]){
  const angle=wheel.front&&Number.isFinite(steerAngle)?steerAngle:0,c=Math.abs(Math.cos(angle)),s=Math.abs(Math.sin(angle));
  out.halfWidth=Math.max(out.halfWidth,Math.abs(wheel.center[0])+wheel.halfWidth*c+wheel.radius*s);
  out.halfLength=Math.max(out.halfLength,Math.abs(wheel.center[2])+wheel.halfWidth*s+wheel.radius*c);
 }
 return out;
}
