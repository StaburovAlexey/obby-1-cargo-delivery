import {getRapier} from './rapier-runtime.js';
import {CANYON_ROCKFALL,canyonPointAt,canyonRockfallHeight,canyonShoulderWidth,projectCanyon} from './canyon-track.js';

const SPAWN_INTERVAL=2.2,ACTIVATION_DISTANCE=300;
const ROCKS=[{progress:1808,radius:1.25,mass:650,color:0xb78158},
  {progress:1830,radius:1.45,mass:850,color:0x9d6d4a},
  {progress:1852,radius:1.3,mass:700,color:0xc59165}];
const ZERO={x:0,y:0,z:0},IDENTITY={x:0,y:0,z:0,w:1};
const planarDistance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

/** Three reusable spheres share the vehicle's fixed physics clock. */
export function createCanyonRockfall(THREE,{world,parent}={}){
  const R=getRapier(),group=new THREE.Group();group.name='Canyon rolling rocks';
  // The scenery root is spatially batched and has fixed render-zone bounds.
  // Moving rocks instead remain ordinary meshes directly below the scene.
  parent?.add(group);
  const geometry=new THREE.IcosahedronGeometry(1,1),materials=[];
  const center=canyonPointAt((CANYON_ROCKFALL.start+CANYON_ROCKFALL.end)/2);
  const slope=CANYON_ROCKFALL.slopeRise/CANYON_ROCKFALL.slopeWidth;
  const rocks=ROCKS.map((spec,index)=>{
    const road=canyonPointAt(spec.progress);
    const offset=(canyonShoulderWidth(spec.progress,CANYON_ROCKFALL.side)+28)*CANYON_ROCKFALL.side;
    const spawn={x:road.x+road.right.x*offset,z:road.z+road.right.z*offset,
      y:canyonRockfallHeight(spec.progress,offset)+spec.radius*Math.sqrt(1+slope*slope)+.15};
    const material=new THREE.MeshStandardMaterial({color:spec.color,roughness:.98,flatShading:true});materials.push(material);
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`Canyon rolling rock ${index+1}`;
    mesh.scale.setScalar(spec.radius);mesh.castShadow=mesh.receiveShadow=true;mesh.visible=false;group.add(mesh);
    const body=world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(spawn.x,spawn.y,spawn.z)
      .setEnabled(false).setCanSleep(true).setCcdEnabled(true).setLinearDamping(.02).setAngularDamping(.03));
    body.userData={tag:'canyon-rock'};
    const collider=world.createCollider(R.ColliderDesc.ball(spec.radius).setMass(spec.mass).setFriction(.6).setRestitution(.02),body);
    collider.userData={tag:'canyon-rock',name:mesh.name,obstacle:true,support:false,preStepVelocity:{...ZERO}};
    collider.physicsTag='canyon-rock';
    const position=new THREE.Vector3(spawn.x,spawn.y,spawn.z),rotation=new THREE.Quaternion();
    return {...spec,spawn,road,mesh,body,collider,active:false,age:0,
      previousPosition:position.clone(),position,previousRotation:rotation.clone(),rotation};
  });
  let disposed=false,running=false,spawnDelay=0,nextRock=0;
  const live=()=>!disposed&&!!world.bodies&&!!world.colliders;

  function park(rock){
    rock.active=false;rock.age=0;rock.mesh.visible=false;
    rock.body.setEnabled(false);rock.body.resetForces(false);rock.body.resetTorques(false);
    rock.body.setLinvel(ZERO,false);rock.body.setAngvel(ZERO,false);
    rock.body.setTranslation(rock.spawn,false);rock.body.setRotation(IDENTITY,false);
    rock.position.set(rock.spawn.x,rock.spawn.y,rock.spawn.z);rock.previousPosition.copy(rock.position);
    rock.rotation.identity();rock.previousRotation.copy(rock.rotation);
    Object.assign(rock.collider.userData.preStepVelocity,ZERO);
  }
  function release(rock){
    // Reset only while hidden; after release gravity and contacts own the pose.
    park(rock);rock.active=true;rock.mesh.visible=true;
    rock.body.setEnabled(true);rock.body.wakeUp();
  }
  function reset(){
    if(!live())return;
    running=false;spawnDelay=0;nextRock=0;
    for(const rock of rocks)park(rock);
  }
  return {
    group,bodyCount:rocks.length,reset,
    beforeStep(dt,player,{active=false}={}){
      if(!live())return;
      const nearby=active&&Number.isFinite(player?.x)&&Number.isFinite(player?.z)&&planarDistance(player,center)<ACTIVATION_DISTANCE;
      if(!nearby){if(running)reset();return;}
      running=true;spawnDelay=Math.max(0,spawnDelay-dt);
      if(spawnDelay<=0){
        for(let i=0;i<rocks.length;i++){
          const index=(nextRock+i)%rocks.length,rock=rocks[index];
          if(rock.active)continue;
          release(rock);nextRock=(index+1)%rocks.length;spawnDelay=SPAWN_INTERVAL;break;
        }
      }
      for(const rock of rocks){
        if(!rock.active)continue;
        rock.previousPosition.copy(rock.position);rock.previousRotation.copy(rock.rotation);
        Object.assign(rock.collider.userData.preStepVelocity,rock.body.linvel());
      }
    },
    afterStep(dt,player){
      if(!live()||!running)return;
      for(const rock of rocks){
        if(!rock.active)continue;
        const position=rock.body.translation(),rotation=rock.body.rotation();
        rock.position.set(position.x,position.y,position.z);rock.rotation.set(rotation.x,rotation.y,rotation.z,rotation.w);rock.age+=dt;
        rock.road=projectCanyon(position.x,position.z,rock.road)||rock.road;
        const hiddenBelowClouds=position.y+rock.radius<rock.road.height-8;
        const abandoned=rock.age>20&&Number.isFinite(player?.x)&&Number.isFinite(player?.z)&&planarDistance(position,player)>220;
        if(hiddenBelowClouds||abandoned)park(rock);
      }
    },
    render(alpha){
      if(!live())return;
      for(const rock of rocks){
        if(!rock.active)continue;
        rock.mesh.position.lerpVectors(rock.previousPosition,rock.position,alpha);
        rock.mesh.quaternion.slerpQuaternions(rock.previousRotation,rock.rotation,alpha);
      }
    },
    dispose(){
      if(disposed)return;
      if(live())for(const rock of rocks)if(world.bodies.contains(rock.body.handle))world.removeRigidBody(rock.body);
      disposed=true;running=false;group.removeFromParent();geometry.dispose();materials.forEach(material=>material.dispose());
    },
  };
}
