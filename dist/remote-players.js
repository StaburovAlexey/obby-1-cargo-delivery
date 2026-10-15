import {loadCharacter} from './character.js';
import {loadCosmoVehicle} from './cosmo-vehicles.js';
import {loadBMWVehicle} from './bmw-vehicle.js';
import {createRemoteMotion} from './remote-motion.js';


export function createRemotePlayers(THREE,{scene,onError=console.warn}={}){
  const group=new THREE.Group();group.name='Online visual replicas';scene.add(group);
  const motion=createRemoteMotion(),records=new Map(),queue=[];
  let active=0,disposed=false;
  function clearVisual(record){
    record.generation++;record.character?.dispose();record.vehicle?.dispose();
    record.character=null;record.vehicle=null;record.key=null;record.loading=false;
  }
  function remove(record){clearVisual(record);record.root.removeFromParent();records.delete(record.id);}
  function pump(){
    while(active<2&&queue.length){
      const job=queue.shift();if(disposed||!records.has(job.record.id)||job.record.generation!==job.generation)continue;
      active++;Promise.resolve().then(job.load).then(asset=>{
        if(disposed||!records.has(job.record.id)||job.record.generation!==job.generation){asset.dispose();return;}
        const record=job.record;record[job.kind]=asset;record.loading=false;
        asset.group.traverse(node=>{if(node.isMesh){node.castShadow=false;node.receiveShadow=false;}});
        record.root.add(asset.group);
      }).catch(error=>{
        if(records.has(job.record.id)&&job.record.generation===job.generation){job.record.loading=false;job.record.key=null;job.record.retryAt=performance.now()+5000;onError('Remote player visual could not load',error);}
      }).finally(()=>{active--;pump();});
    }
  }
  function ensure(record,state,time){
    const driving=state.mode==='driving',key=driving?`car:${state.vehicleId}`:`skin:${state.characterId}`;
    if(record.key===key||time<(record.retryAt||0))return;
    clearVisual(record);record.key=key;record.loading=true;
    const generation=record.generation;
    queue.push({record,generation,kind:driving?'vehicle':'character',load:()=>driving
      ?(state.vehicleId==='bmwreward'?loadBMWVehicle:loadCosmoVehicle)(THREE,state.vehicleId)
      :loadCharacter(THREE,{id:state.characterId})});pump();
  }
  return {
    receive(players,time=performance.now()){
      motion.receive(players,time);const present=new Set(players.map(p=>p.id));
      for(const record of records.values())if(!present.has(record.id))remove(record);
      for(const {id}of players)if(!records.has(id)){
        const root=new THREE.Group();group.add(root);
        records.set(id,{id,root,generation:0,key:null,character:null,vehicle:null});
      }
    },
    update(dt,{now=performance.now(),anchor}={}){
      for(const record of records.values()){
        const state=motion.sample(record.id,now);if(!state)continue;
        const distance=Math.hypot(state.position[0]-anchor.x,state.position[2]-anchor.z);
        record.root.visible=distance<350;
        if(distance>450){if(record.key)clearVisual(record);continue;}
        if(!record.root.visible)continue;
        ensure(record,state,now);record.root.position.fromArray(state.position);record.root.quaternion.fromArray(state.quaternion);
        if(record.character){
          record.character.setSeated(state.mode==='studying');
          record.character.setAirborne?.({airborne:state.airborne,elapsed:state.jumpElapsed,duration:16/22});
          record.character.update(dt,state.paused?0:state.speed,0);
        }
        record.vehicle?.update({steerAngle:state.steer,wheelSpin:state.wheelSpin,bodyPitch:state.bodyPitch,bodyRoll:state.bodyRoll,bodyBob:state.bodyBob});
        record.vehicle?.setBrakeLights?.(state.braking);

      }
    },
    dispose(){disposed=true;queue.length=0;for(const record of [...records.values()])remove(record);motion.clear();group.removeFromParent();},
    get size(){return records.size;},get loaded(){return [...records.values()].filter(r=>r.character||r.vehicle).length;},
  };
}
