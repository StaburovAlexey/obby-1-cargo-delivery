import fs from 'node:fs';
import * as THREE from '../../dist/vendor/three.module.js';
import {VEHICLE_CONFIG} from '../../dist/economy-config.js';
import {loadCosmoVehicle} from '../../dist/cosmo-vehicles.js';
import {loadBMWVehicle} from '../../dist/bmw-vehicle.js';

let pending;

// Decode the real local GLBs. Only browser image/file transport is adapted;
// dimensions, wheel contacts, bounds and vehicle adapters remain production code.
export function loadRoadPitVehicleMetadata(){
  if(pending)return pending;
  pending=(async()=>{
    const oldFetch=globalThis.fetch,oldSelf=globalThis.self,oldBitmap=globalThis.createImageBitmap;
    globalThis.self=globalThis;
    globalThis.createImageBitmap=async blob=>{
      const bytes=Buffer.from(await blob.arrayBuffer());
      return{width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),close(){}};
    };
    globalThis.fetch=async request=>{
      const url=typeof request==='string'?request:request.url;
      return url.startsWith('blob:')?oldFetch(request):new Response(fs.readFileSync(new URL(url)));
    };
    try{
      const result=new Map();
      for(const spec of VEHICLE_CONFIG){
        const adapter=spec.id==='bmwreward'?await loadBMWVehicle(THREE):await loadCosmoVehicle(THREE,spec.id);
        result.set(spec.id,adapter.metadata);adapter.dispose();
      }
      return result;
    }finally{
      globalThis.fetch=oldFetch;
      if(oldSelf===undefined)delete globalThis.self;else globalThis.self=oldSelf;
      if(oldBitmap===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=oldBitmap;
    }
  })();
  return pending;
}
