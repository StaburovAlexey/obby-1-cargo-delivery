import {loadCosmoVehicle} from './cosmo-vehicles.js';
import {loadBMWVehicle} from './bmw-vehicle.js';
const loadGarageVehicle=(THREE,id)=>id==='bmwreward'?loadBMWVehicle(THREE,id):loadCosmoVehicle(THREE,id);

// The adapter now owns the full 1.5× geometry/contact scale in every mode.
// Keep the display-mode lifecycle API, with no extra showroom enlargement.
export const PARKED_COSMO_SCALE=1;
const PARKED_APPROACH_DISTANCE=6.55;
const PARKED_APPROACH_RADIUS=.9;

// Keep gameplay/root identities stable while attaching the required GLB visuals.
// Missing visuals are a loading error; there is no generated vehicle fallback.
export function attachCosmoGarage(THREE,garage,{load=loadGarageVehicle,onError=console.warn}={}){
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
    const record={vehicle,adapter:null,lastPose:{...rig.pose},error:null,cancelled:false,displayScale:null};
    // Reserve the existing full-size footprint before decoding. This prevents a
    // late model from growing around somebody already standing beside it.
    if(!vehicle.rewardDisplay)vehicle.parkedFootprint={halfWidth:2.25,halfLength:4.32};
    if(vehicle.park&&!vehicle.rewardDisplay){
      const heading=vehicle.park.heading||0;
      vehicle.approach={x:vehicle.park.x-Math.sin(heading)*PARKED_APPROACH_DISTANCE,
        z:vehicle.park.z-Math.cos(heading)*PARKED_APPROACH_DISTANCE};
      vehicle.approachRadius=PARKED_APPROACH_RADIUS;
    }
    rig.update=function(pose={}){
      const result=originalUpdate.call(rig,pose);
      for(const key of ['steerAngle','wheelSpin','bodyPitch','bodyRoll','bodyBob'])if(pose[key]!==undefined)record.lastPose[key]=pose[key];
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
  // Bound decode concurrency to avoid ten simultaneous texture uploads on phones.
  let next=0;
  async function worker(){
    while(next<records.length&&!disposed){
      const record=records[next++],vehicle=record.vehicle;
      let adapter;
      try{
        adapter=await load(THREE,vehicle.id);
        if(disposed||record.cancelled){adapter.dispose();continue;}
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
      }catch(error){
        adapter?.dispose();record.adapter=null;vehicle.visual=null;
        if(!disposed&&!record.cancelled){
          record.error=new Error(`Vehicle visual ${vehicle.id} could not load.`,{cause:error});
          record.error.vehicleId=vehicle.id;
          onError(record.error.message,error);
        }
      }
    }
  }
  const ready=Promise.all([worker(),worker()]).then(()=>{
    const errors=records.filter(record=>record.error).map(record=>record.error);
    if(errors.length&&!disposed){
      const error=new AggregateError(errors,`Required vehicle models failed to load: ${errors.map(error=>error.vehicleId).join(', ')}.`);
      error.vehicleIds=errors.map(error=>error.vehicleId);
      throw error;
    }
    return {loaded:records.filter(record=>record.adapter).length,total:records.length};
  });
  const originalGarageDispose=garage.dispose;
  garage.dispose=function(){disposed=true;return originalGarageDispose.call(garage);};
  const controller={ready,get disposed(){return disposed;},get loaded(){return records.filter(r=>r.adapter).length;},get failed(){return records.filter(r=>r.error).length;}};
  garage.vehicleVisuals=controller;
  return controller;
}
