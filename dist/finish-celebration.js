import {FINISH_LINE_SPEC} from './finish-line.js';

export const FINISH_CELEBRATION_SECONDS = 2;

// Require a short, forward segment through the painted line, inside the road.
// A first sample, a teleport or crossing beside the road never finishes a run.
export function crossesFinishLine(previous, current, spec=FINISH_LINE_SPEC) {
  if(!previous||!current||![previous.x,previous.z,current.x,current.z].every(Number.isFinite))return false;
  if(Math.hypot(current.x-previous.x,current.z-previous.z)>9)return false;
  const forward={x:-Math.sin(spec.heading),z:-Math.cos(spec.heading)};
  const side=p=>(p.x-spec.x)*forward.x+(p.z-spec.z)*forward.z;
  const a=side(previous),b=side(current);
  if(a>=0||b<0)return false;
  const t=-a/(b-a),x=previous.x+(current.x-previous.x)*t,z=previous.z+(current.z-previous.z)*t;
  return Math.abs((x-spec.x)*spec.right.x+(z-spec.z)*spec.right.z)<=spec.lineWidth/2;
}

export function createFinishCelebration(THREE) {
  const count=160,group=new THREE.Group();group.name='Finish confetti celebration';group.visible=false;
  const geometry=new THREE.PlaneGeometry(.3,.65),material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.frustumCulled=false;group.add(mesh);
  const dummy=new THREE.Object3D(),color=new THREE.Color(),palette=[0xffdc36,0xff497a,0x50ddff,0x86ee62,0xa78aff];
  const pieces=Array.from({length:count},(_,i)=>{
    mesh.setColorAt(i,color.setHex(palette[i%palette.length]));
    const angle=i*2.399963,spread=3+(i%13)*.65;
    return {x:Math.cos(angle)*spread,z:Math.sin(angle)*spread,y:2+(i%9)*.35,vx:Math.cos(angle)*2,vz:Math.sin(angle)*2,vy:7+(i%11)*.45};
  });
  let elapsed=0,disposed=false;
  const draw=()=>{pieces.forEach((p,i)=>{dummy.position.set(p.x+p.vx*elapsed,p.y+p.vy*elapsed-4.9*elapsed*elapsed,p.z+p.vz*elapsed);dummy.rotation.set(elapsed*(i%5+1),i+elapsed*3,elapsed*(i%7+1));dummy.scale.setScalar(Math.max(.05,1-Math.max(0,elapsed-1.5)*1.8));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.instanceMatrix.needsUpdate=true;};
  return {group,get active(){return group.visible;},get elapsed(){return elapsed;},
    start(position){if(disposed)return;elapsed=0;group.position.set(position.x,position.y??0,position.z);group.visible=true;draw();},
    update(dt,{paused=false}={}){if(disposed||!group.visible||paused)return;elapsed=Math.min(FINISH_CELEBRATION_SECONDS,elapsed+Math.max(0,Math.min(.05,Number.isFinite(dt)?dt:0)));draw();},
    clear(){group.visible=false;elapsed=0;},
    dispose(){if(disposed)return;disposed=true;group.visible=false;mesh.dispose();geometry.dispose();material.dispose();group.removeFromParent();group.clear();},
  };
}
