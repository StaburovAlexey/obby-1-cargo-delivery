

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


  const inverseBinds = new Map();
  model.traverse(mesh => { if(mesh.isSkinnedMesh) mesh.skeleton.bones.forEach((bone,i)=> {
    if(!inverseBinds.has(bone)) inverseBinds.set(bone,mesh.skeleton.boneInverses[i].clone().invert());
  }); });
  function frame(longitudinal, transverse) {
    const y=longitudinal.clone().normalize();
    const x=transverse.clone().addScaledVector(y,-transverse.dot(y)).normalize();
    const z=new THREE.Vector3().crossVectors(x,y).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
  }
  function anatomicalAim(bone,child,direction) {
    const bind=inverseBinds.get(bone);if(!bind)return;
    const bindQ=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(bind));
    const localLong=child?child.position.clone().normalize():new THREE.Vector3(0,1,0);
    const localSide=new THREE.Vector3(1,0,0).applyQuaternion(bindQ.clone().invert());
    const localFrame=frame(localLong,localSide);
    const desiredFrame=frame(direction,new THREE.Vector3(-1,0,0));
    worldRotation(bone,desiredFrame.multiply(localFrame.invert()));
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
      const pole=new THREE.Vector3(sign*(options.elbowOutward ?? 0),options.elbowDown ?? -1,0);
      pole.addScaledVector(axis,-pole.dot(axis)).normalize();
      const joint=root.clone().addScaledVector(axis,along).addScaledVector(pole,height);
      anatomicalAim(shoulder,elbow,joint.clone().sub(root));
      anatomicalAim(elbow,hand,target.clone().sub(position(elbow)));
    }
    anatomicalAim(find(side+'Hand'),null,new THREE.Vector3(0,-Math.sin(options.handPitch ?? Math.PI/12),-Math.cos(options.handPitch ?? Math.PI/12)));
  }
  const targets=new Map();
  model.traverse(o=>{if(o.isBone)targets.set(o,o.quaternion.clone());});
  for (const [bone,q]of initial)bone.quaternion.copy(q);
  model.updateWorldMatrix(true,true);
  return targets;
}
