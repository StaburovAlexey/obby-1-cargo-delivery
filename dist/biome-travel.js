import {FINISH_LINE_SPEC} from './finish-line.js';
import { PREVIEW_PROGRESS } from './route-network-config.js';
import { BIOME_SEQUENCE } from './economy-config.js';
import { routePointAtProgress, truckInRoad } from './road-layout.js';
/** Preview anchors are on common edges, well clear of forks and checkpoints. */
export const BIOME_DESTINATIONS=Object.freeze([...BIOME_SEQUENCE.map((b,i)=>{
  const progress=PREVIEW_PROGRESS[i].progress,p=routePointAtProgress(progress);
  return Object.freeze({...p,id:b.id,name:b.name,progress});
}),Object.freeze({...routePointAtProgress(FINISH_LINE_SPEC.progress-55),id:'finish',biomeId:'volcanic',name:'Перед финишем',progress:FINISH_LINE_SPEC.progress-55})]);
export function safeBiomeDestination(id,contact=()=>undefined){
  const p=BIOME_DESTINATIONS.find(b=>b.id===id);
  return p&&truckInRoad(p.x,p.z,p.heading,p)&&!contact(p.x,p.z,p.heading)?p:null;
}
