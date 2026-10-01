/** One bounded 2048² map: wider ahead while driving, original detail in the hangar. */
export const SHADOW_LAYOUT=Object.freeze({halfExtent:150,localHalfExtent:75,lookAhead:80,mapSize:2048,near:.5,far:420,offset:Object.freeze({x:-72,y:160,z:60}),bias:-.00003,normalBias:.015});
const p=SHADOW_LAYOUT,n=Math.hypot(p.offset.x,p.offset.y,p.offset.z),h=Math.hypot(p.offset.x,p.offset.z);
const axisZ={x:p.offset.x/n,y:p.offset.y/n,z:p.offset.z/n};
const axisX={x:p.offset.z/h,y:0,z:-p.offset.x/h};
const axisY={x:axisZ.y*axisX.z,y:axisZ.z*axisX.x-axisZ.x*axisX.z,z:-axisZ.y*axisX.x};
export function followShadowLight(light,position,viewDirection=null){
 // Use the rendered camera's horizontal view, never throttle or car heading:
 // manual orbit and reverse keep extra coverage in the direction being seen.
 const extent=viewDirection?p.halfExtent:p.localHalfExtent,camera=light.shadow.camera;
 if(camera.right!==extent||camera.left!==-extent||camera.top!==extent||camera.bottom!==-extent){Object.assign(camera,{left:-extent,right:extent,top:extent,bottom:-extent});camera.updateProjectionMatrix();}
 const dx=Number.isFinite(viewDirection?.x)?viewDirection.x:0,dz=Number.isFinite(viewDirection?.z)?viewDirection.z:0;
 const length=Math.hypot(dx,dz),ahead=length>1e-6?p.lookAhead/length:0;
 const x=(Number.isFinite(position?.x)?position.x:0)+dx*ahead,y=Number.isFinite(position?.y)?position.y:0,z=(Number.isFinite(position?.z)?position.z:0)+dz*ahead;
 // Keep the sun angle fixed, and snap only its transverse axes to texels.
 // Doubling the light offset and depth range includes elevated casters over
 // the enlarged receiver area without spending another shadow map.
 const texel=extent*2/p.mapSize;
 const u=Math.round((x*axisX.x+y*axisX.y+z*axisX.z)/texel)*texel;
 const v=Math.round((x*axisY.x+y*axisY.y+z*axisY.z)/texel)*texel;
 const depth=x*axisZ.x+y*axisZ.y+z*axisZ.z;
 const tx=axisX.x*u+axisY.x*v+axisZ.x*depth,ty=axisX.y*u+axisY.y*v+axisZ.y*depth,tz=axisX.z*u+axisY.z*v+axisZ.z*depth;
 light.target.position.set(tx,ty,tz);light.position.set(tx+p.offset.x,ty+p.offset.y,tz+p.offset.z);
 light.target.updateMatrixWorld();light.updateMatrixWorld();
}
