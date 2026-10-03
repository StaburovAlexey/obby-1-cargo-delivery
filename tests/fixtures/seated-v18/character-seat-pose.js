// Runtime-authored sitting pose, independent of the source locomotion clips.
// Targets use each rig's own joints, lengths, and bone coordinate frames.
export function makeSeatPose(THREE, model, options = {}) {
  const initial = new Map();
  model.traverse(o => { if (o.isBone) initial.set(o, o.quaternion.clone()); });
  const parentQ = new THREE.Quaternion();
  const find = suffix => { let found; model.traverse(o => { if (o.isBone && o.name.endsWith(suffix)) found = o; }); return found; };
  const position = bone => bone.getWorldPosition(new THREE.Vector3());
  function worldRotation(bone,q) {
    bone.parent.getWorldQuaternion(parentQ).invert();
    bone.quaternion.copy(parentQ.multiply(q)); model.updateWorldMatrix(true,true);
  }
  function aim(boneName, childName, direction) {
    const bone=find(boneName), child=find(childName);if(!bone||!child)return;
    model.updateWorldMatrix(true,true);
    const current=position(child).sub(position(bone)).normalize();
    const turn=new THREE.Quaternion().setFromUnitVectors(current,new THREE.Vector3(...direction).normalize());
    worldRotation(bone,turn.multiply(bone.getWorldQuaternion(new THREE.Quaternion())));
  }
  for (const [side,sign] of [['Left',-1],['Right',1]]) {
    aim(side+'UpLeg',side+'Leg',[sign*.08,options.thighSlope ?? 0,-1]);
    aim(side+'Leg',side+'Foot',[sign*.015,-1,-.025]);
    aim(side+'Foot',side+'ToeBase',[0,0,-1]);
    aim(side+'Arm',side+'ForeArm',[sign*.10,-.90,-.42]);
    aim(side+'ForeArm',side+'Hand',[sign*.03,.02,-1]);
    if (options.wristTargets) {
      const shoulder=find(side+'Arm'),elbow=find(side+'ForeArm'),hand=find(side+'Hand');
      const hip=position(find('Hips')),root=position(shoulder);
      const target=hip.add(new THREE.Vector3(...options.wristTargets[side]));
      const upper=position(elbow).distanceTo(root),lower=position(hand).distanceTo(position(elbow));
      const reach=target.clone().sub(root),distance=reach.length();
      const axis=reach.normalize();
      const along=(upper*upper-lower*lower+distance*distance)/(2*distance);
      const height=Math.sqrt(Math.max(0,upper*upper-along*along));
      const pole=new THREE.Vector3(0,-1,0).addScaledVector(axis,axis.y).normalize();
      const joint=root.clone().addScaledVector(axis,along).addScaledVector(pole,height);
      aim(side+'Arm',side+'ForeArm',joint.clone().sub(root).toArray());
      aim(side+'ForeArm',side+'Hand',target.clone().sub(position(elbow)).toArray());
    }
    worldRotation(find(side+'Hand'),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),options.handAngle ?? -1.5));
  }
  const targets=new Map();
  model.traverse(o=>{if(o.isBone)targets.set(o,o.quaternion.clone());});
  for (const [bone,q]of initial)bone.quaternion.copy(q);
  model.updateWorldMatrix(true,true);
  return targets;
}
