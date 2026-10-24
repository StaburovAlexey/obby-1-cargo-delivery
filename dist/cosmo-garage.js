import {createProgressiveAssets} from './progressive-assets.js';
import {VEHICLE_SOURCE_BOUNDS} from './vehicle-source-bounds.js';
import {loadShowcaseVehicle} from './showcase-vehicles.js';
import {isShowcaseVehicle} from './showcase-vehicle-catalog.js';
import {loadCosmoVehicle} from './cosmo-vehicles.js';
import {loadBMWVehicle} from './bmw-vehicle.js';
const loadGarageVehicle=(THREE,id)=>isShowcaseVehicle(id)?loadShowcaseVehicle(THREE,id):id==='bmwreward'?loadBMWVehicle(THREE,id):loadCosmoVehicle(THREE,id);



export const PARKED_COSMO_SCALE=1;
const PARKED_APPROACH_DISTANCE=6.55;
const PARKED_APPROACH_RADIUS=.9;



export function attachCosmoGarage(THREE,garage,{load=loadGarageVehicle,prepare,onError=console.warn,autoLoad=true,concurrency=2}={}){
  let disposed=false,selectedId=null;
  function applyDisplay(record){
    if(!record.adapter)return;
    const {group,metadata}=record.adapter,scale=record.vehicle.id===selectedId?1:PARKED_COSMO_SCALE;
    if(record.displayScale===scale)return;
    const ground=metadata?.groundClearance??.05;
    group.scale.copy(record.baseScale).multiplyScalar(scale);
    group.position.copy(record.basePosition).multiplyScalar(scale);
    group.position.y+=ground*(1-scale);
    group.userData.parkedDisplayScale=scale;
    record.displayScale=scale;
    group.updateWorldMatrix(true,true);
  }
  garage.setVehicleDisplayMode=function(id=null){
    if(disposed)return;
    selectedId=records.some(record=>record.vehicle.id===id)?id:null;
    for(const record of records)applyDisplay(record);
  };
  const records=garage.vehicles.map(vehicle=>{
    const rig=vehicle.rig,originalUpdate=rig.update,originalDispose=rig.dispose;
    const record={id:vehicle.id,vehicle,adapter:null,lastPose:{...rig.pose},error:null,cancelled:false,displayScale:null};


    const bounds=VEHICLE_SOURCE_BOUNDS[vehicle.id];
    vehicle.physicsBounds=bounds;
    if(bounds&&!vehicle.rewardDisplay)vehicle.parkedFootprint={
      halfWidth:Math.max(Math.abs(bounds.min[0]),Math.abs(bounds.max[0]))*PARKED_COSMO_SCALE,
      halfLength:Math.max(Math.abs(bounds.min[2]),Math.abs(bounds.max[2]))*PARKED_COSMO_SCALE,
    };
    else if(!vehicle.rewardDisplay)vehicle.parkedFootprint={halfWidth:2.25,halfLength:4.32};
    if(vehicle.park&&!vehicle.rewardDisplay){
      const heading=vehicle.park.heading||0;
      vehicle.approach={x:vehicle.park.x-Math.sin(heading)*PARKED_APPROACH_DISTANCE,
        z:vehicle.park.z-Math.cos(heading)*PARKED_APPROACH_DISTANCE};
      vehicle.approachRadius=PARKED_APPROACH_RADIUS;
      vehicle.approachMarker?.position.set(vehicle.approach.x,vehicle.approachMarker.position.y,vehicle.approach.z);
    }
    rig.update=function(pose={}){
      const result=originalUpdate.call(rig,pose);
      for(const key of ['steerAngle','wheelSpin','bodyPitch','bodyRoll','bodyBob'])if(pose[key]!==undefined)record.lastPose[key]=pose[key];
      record.lastPose.wheelContacts=pose.wheelContacts;
      record.lastPose.rootPose=pose.position&&pose.quaternion?{position:pose.position,quaternion:pose.quaternion}:undefined;
      record.adapter?.update(record.lastPose);
      return result;
    };
    rig.dispose=function(){
      if(record.cancelled)return;
      record.cancelled=true;
      record.adapter?.dispose();record.adapter=null;vehicle.visual=null;
      return originalDispose.call(rig);
    };
    return record;
  });

  const loading=createProgressiveAssets({items:records,concurrency,
    load:record=>load(THREE,record.vehicle.id),
    prepare:prepare?(adapter,record)=>prepare(adapter,record.vehicle.id):undefined,
    onLoad(adapter,record){
      const vehicle=record.vehicle;
      if(record.cancelled){adapter.dispose();return;}
      try{
        adapter.update(record.lastPose);
        vehicle.root.add(adapter.group);
        if(adapter.cargoPosition)vehicle.cargo.position.copy(adapter.cargoPosition);
        if(adapter.body)adapter.body.add(vehicle.cargo);
        record.adapter=adapter;vehicle.visual=adapter;
        record.baseScale=adapter.group.scale.clone();record.basePosition=adapter.group.position.clone();
        const bounds=adapter.metadata?.bounds;
        if(bounds&&!vehicle.rewardDisplay)vehicle.parkedFootprint={
          halfWidth:Math.max(Math.abs(bounds.min[0]),Math.abs(bounds.max[0]))*PARKED_COSMO_SCALE,
          halfLength:Math.max(Math.abs(bounds.min[2]),Math.abs(bounds.max[2]))*PARKED_COSMO_SCALE,
        };
        applyDisplay(record);
        vehicle.root.updateWorldMatrix(true,true);
        record.error=null;
      }catch(error){record.adapter=null;vehicle.visual=null;throw error;}
    },
    onError(error,record){
      if(disposed||record.cancelled)return;
      record.error=new Error(`Vehicle visual ${record.vehicle.id} could not load.`,{cause:error});
      record.error.vehicleId=record.vehicle.id;
      onError(record.error.message,error);
    },
  });
  // Preserve eager loading for standalone callers; the app opts into per-ID work.
  const ready=autoLoad?Promise.allSettled(records.map(record=>loading.ensure(record.id))).then(()=>{
    const errors=records.filter(record=>record.error).map(record=>record.error);
    if(errors.length&&!disposed){
      const error=new AggregateError(errors,`Required vehicle models failed to load: ${errors.map(error=>error.vehicleId).join(', ')}.`);
      error.vehicleIds=errors.map(error=>error.vehicleId);
      throw error;
    }
    return {loaded:records.filter(record=>record.adapter).length,total:records.length};
  }):Promise.resolve({loaded:0,total:records.length});
  const originalGarageDispose=garage.dispose;
  const cancel=()=>{disposed=true;loading.dispose();};
  garage.dispose=function(){cancel();return originalGarageDispose.call(garage);};
  const controller={ready,ensure:loading.ensure,request:loading.request,status:loading.status,dispose:cancel,
    get disposed(){return disposed;},get loaded(){return records.filter(r=>r.adapter).length;},get failed(){return records.filter(r=>r.error).length;}};
  garage.vehicleVisuals=controller;
  return controller;
}
