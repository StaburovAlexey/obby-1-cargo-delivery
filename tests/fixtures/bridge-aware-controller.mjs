import assert from 'node:assert/strict';
import {projectRoad,routePointAtDistance} from '../../dist/road-layout.js';
import {roadGroundSurface} from '../../dist/driving-ground.js';
import {VEHICLE_DYNAMICS} from '../../dist/driving-model.js';
import {getUpgradeModifiers} from '../../dist/vehicle-upgrades.js';
import {biomeSurfaceAt} from '../../dist/biome-surfaces.js';
import {BRIDGES} from '../../dist/road-bridges.js';
import {graphBranch} from './network-route-controller.mjs';
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export function createBridgeAwareController({branch,stations,target,vehicleId,levels,hazards,bridgeControl={speed:8,approach:80,exit:15},moverSpeed=8,serviceSpeed=Infinity,cruiseSpeed=Infinity}){
 let history;const obstacleIds=new Set(),moverPlans=new Map();let avoidanceFrames=0;
 const predictOffset=(m,elapsed)=>{
  const t=(Math.max(0,elapsed-m.startPause)+m.phase*m.period)%m.period,d=m.pauseSeconds,v=m.travelSeconds;
  const a=t<d?0:t<d+v?smooth((t-d)/v):t<2*d+v?1:1-smooth((t-2*d-v)/v);
  return m.minOffset+(m.maxOffset-m.minOffset)*a;
 };
 return {get obstacleIds(){return [...obstacleIds];},get avoidanceFrames(){return avoidanceFrames;},sample(state){
  history=projectRoad(state.x,state.z,history);
  const distance=history.distance+12+Math.abs(state.speed)*.65,next=routePointAtDistance(distance,{branch:graphBranch(branch)});
  let offset=0,obstacleWeight=0,nearMovingObstacle=false;



  for(const descriptor of hazards.hazards){
   if(!descriptor.expanded||!descriptor.solid||descriptor.edgeId!==next.edgeId)continue;
   const pose=hazards.poseFor?.(descriptor.id)||descriptor;
   const separation=distance-descriptor.distance;
   if(Math.abs(separation)>100)continue;
   const width=Math.abs(Math.cos(descriptor.headingDelta||0))*descriptor.width/2+Math.abs(Math.sin(descriptor.headingDelta||0))*descriptor.length/2;
   const low=(descriptor.motion?.minOffset??pose.offset)-width,high=(descriptor.motion?.maxOffset??pose.offset)+width;



   if(low>3.1||high< -3.1)continue;
   let choices=[low-2.3,high+2.3].filter(value=>Math.abs(value)<12.2).sort((a,b)=>Math.abs(a)-Math.abs(b));
   if(descriptor.motion?.travelSeconds){



    const remaining=descriptor.distance-history.distance;
    const eta=Math.max(0,remaining/Math.max(3,Math.min(moverSpeed,Math.abs(state.speed))));
    const predicted=[-.8,0,.8].map(t=>predictOffset(descriptor.motion,hazards.elapsed+Math.max(0,eta+t)));
    const score=side=>Math.min(...predicted.map(o=>Math.abs(o-side)));
    const best=score(-10)>score(10)?-10:10;
    let plan=moverPlans.get(descriptor.id);
    if(plan===undefined||(remaining>25&&score(best)>score(plan)+2.5))plan=best;
    moverPlans.set(descriptor.id,plan);choices=[plan];
   }
   assert.ok(choices.length,`No bypass plan for ${descriptor.id}`);
   const weight=smooth((90-Math.abs(separation))/60);
   if(weight>obstacleWeight){offset=choices[0]*weight;obstacleWeight=weight;}
   if(weight>0)obstacleIds.add(descriptor.id);
   if(history.distance>descriptor.distance-125&&history.distance<descriptor.distance+35)nearMovingObstacle=true;
  }
  for(const station of stations){if(station.distance>=target.distance)break;{const weight=smooth((95-Math.abs(distance-station.distance))/45);offset=offset*(1-weight)+8*weight;}}
  {const weight=smooth((distance-(target.distance-95))/50);offset=offset*(1-weight)-8*weight;}
  for(const b of BRIDGES){const q=next.progress;if(q<b.from-80||q>b.to+100)continue;
   const weight=q<b.from-20?smooth((q-(b.from-80))/60):q<=b.to+20?1:1-smooth((q-(b.to+20))/80);
   offset=offset*(1-weight)+b.offset*weight;
  }
  const dx=next.x+offset*next.right.x-state.x,dz=next.z+offset*next.right.z-state.z,desired=Math.atan2(-dx,-dz);
  const error=Math.atan2(Math.sin(desired-state.heading),Math.cos(desired-state.heading)),wheel=Math.atan(2*3.2*Math.sin(error)/Math.max(1,Math.hypot(dx,dz)));
  const surface=hazards.surfaceAt(state.x,state.z,roadGroundSurface(state.x,state.z,vehicleId,history)),grip=Math.sqrt(Math.min(1,surface.frictionFactor*(surface.longitudinalGripFactor||1)*getUpgradeModifiers(levels).grip));
  const response=Math.min(1,Math.abs(wheel)*(1+(state.linearSpeed/(grip*VEHICLE_DYNAMICS.steeringSpeedScale))**2)/.48),magnitude=(-.55+Math.sqrt(.55*.55+1.8*response))/.9;
  const nearBridge=BRIDGES.some(b=>history.progress>b.from-bridgeControl.approach&&history.progress<b.to+bridgeControl.exit);
  const futureUnsupported=biomeSurfaceAt(history.progress+350,vehicleId).handlingFactor<.99;
  if(nearMovingObstacle)avoidanceFrames++;
  const nearService=stations.some(s=>s.distance<target.distance&&Math.abs(history.distance-s.distance)<95)||Math.abs(history.distance-target.distance)<95;
  const desiredSpeed=Math.min(cruiseSpeed,nearService?serviceSpeed:Infinity,nearBridge?bridgeControl.speed:futureUnsupported?4:nearMovingObstacle?moverSpeed:Infinity);
  const onBridge=BRIDGES.some(b=>history.progress>=b.from&&history.progress<=b.to);
  const timingCategory=onBridge?'bridge-deck':nearBridge?'bridge-approach':futureUnsupported?'unsuitable-terrain':nearMovingObstacle?'moving-obstacle-approach':nearService?'service-approach':'cruise';
  return {active:Math.abs(state.speed)<desiredSpeed,steering:-Math.sign(wheel)*(.08+.92*magnitude),carefulPedal:Number.isFinite(desiredSpeed),timingCategory};
 }};
}
