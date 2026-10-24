// These values match the existing Rapier springs; visual correction never
// changes tire forces or the BMW handling model. Distances are metres.
export const WHEEL_SUSPENSION=Object.freeze({rayLift:.10,rayReach:.32,restRayLength:.22,staticCompression:.12,maxVisualDroop:.22,maxVisualCompression:.22});
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const rotate=(x,y,z,q)=>{
 const tx=2*(q.y*z-q.z*y),ty=2*(q.z*x-q.x*z),tz=2*(q.x*y-q.y*x);
 return {x:x+q.w*tx+q.y*tz-q.z*ty,y:y+q.w*ty+q.z*tx-q.x*tz,z:z+q.w*tz+q.x*ty-q.y*tx};
};

/** Project the rendered tire onto its own real contact plane, including pitch
 * and roll. A fixed-step hit must not lag behind an interpolated render root. */
export function wheelContactVisual(wheel,contacts,pose){
 const contact=contacts?.find(c=>c.name===wheel.name),hit=contact?.point,position=pose?.position,q=pose?.quaternion;
 if(!contact?.grounded||!hit||!position||!q||![hit.x,hit.y,hit.z].every(Number.isFinite))return null;
 const normal=contact.normal,length=normal&&Math.hypot(normal.x,normal.y,normal.z);
 const nx=length>0?normal.x/length:0,ny=length>0?normal.y/length:1,nz=length>0?normal.z/length:0;
 const center=wheel.center??wheel.localPosition;
 if(!center)return null;
 const local=Array.isArray(center)?center:[center.x,center.y,center.z],radius=wheel.radius;
 if(!local.every(Number.isFinite)||!Number.isFinite(radius)||radius<=0)return null;
 const rotated=rotate(...local,q),up=rotate(0,1,0,q);
 let x=position.x+rotated.x,y=position.y+rotated.y,z=position.z+rotated.z;
 const distance=(x-hit.x)*nx+(y-hit.y)*ny+(z-hit.z)*nz,alignment=up.x*nx+up.y*ny+up.z*nz;
 const suspensionOffset=alignment>.2?clamp((radius-distance)/alignment,-WHEEL_SUSPENSION.maxVisualDroop,WHEEL_SUSPENSION.maxVisualCompression):0;
 x+=up.x*suspensionOffset;y+=up.y*suspensionOffset;z+=up.z*suspensionOffset;
 const remaining=(x-hit.x)*nx+(y-hit.y)*ny+(z-hit.z)*nz;
 return {x:x-nx*remaining,y:y-ny*remaining,z:z-nz*remaining,nx,ny,nz,radius,
  width:(wheel.halfWidth??.23)*2,scale:clamp(radius/.68,.6,1.5),suspensionOffset};
}

export function updateVisualSuspension(wheels,pose){
 for(const wheel of wheels){
  const patch=wheelContactVisual(wheel,pose.wheelContacts,pose.rootPose);
  wheel.pivot.position.y=wheel.localPosition.y+(patch?.suspensionOffset??0);
 }
}
