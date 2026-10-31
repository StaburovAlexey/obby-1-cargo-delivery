import {createCanyonEntrance,canEnterCanyon} from './canyon-entrance.js';
import {createCanyonScene} from './canyon-scene.js';
import {createCanyonClouds} from './canyon-clouds.js';
import {CANYON_TRACK,canyonContact,canyonHeight,canyonPose,canyonSurface,projectCanyon} from './canyon-track.js';
import {surfaceForBiome} from './biome-surfaces.js';
import {createDriftScore} from './drift-score.js';
import {createDriftEffects} from './drift-effects.js';
import {ordinaryDriftTelemetry} from './ordinary-drift-telemetry.js';
import {createCanyonUi} from './canyon-ui.js';
import {createCanyonLeaderboard} from './canyon-leaderboard.js';
import {vehicleConfig} from './economy-config.js';
import {groundHeight} from './city-driving.js';
import {createCanyonCheckpointRun} from './canyon-checkpoints.js';
import {createCanyonCheckpointGates} from './canyon-checkpoint-gates.js';

let canyonAttemptSequence=0;

export function createCanyonMode(THREE,{scene,document:doc,platform,leaderboard:sharedLeaderboard,language,getContext,onEnter=()=>{},onExit=()=>{},onComplete=()=>{},onControlsChanged=()=>{},onTimeout=()=>getContext().gameplay.returnToGarage('canyon-timeout')}){
 const entrance=createCanyonEntrance(THREE,{document:doc,language});scene.add(entrance.group);
 const environment=createCanyonScene(THREE);scene.add(environment.group);
 const clouds=createCanyonClouds(THREE);scene.add(clouds.group);
 const checkpointRun=createCanyonCheckpointRun(),checkpointGates=createCanyonCheckpointGates(THREE);scene.add(checkpointGates.group);
 const effects=createDriftEffects(THREE,{height:(x,z)=>canyonSurface(x,z,12)?canyonHeight(x,z):groundHeight(x,z)});scene.add(effects.group);
 const leaderboard=sharedLeaderboard??createCanyonLeaderboard({platform});
 let attemptId=null;
 let active=false,phase='idle',disposed=false,epoch=0,vehicle=null,scorer=null,result=null,resultEligible=false,rankings=false,accessProof=Symbol('initial'),accessDevelopment=null,accessVehicle=null,accessUnlocked=null;
 const account=()=>platform?.accountGeneration??0;
 const current=(token,owner)=>!disposed&&active&&token===epoch&&owner===account()&&!platform?.status?.reloadRequired;
 const ui=createCanyonUi(doc,{language,rankingsEnabled:platform?.id==='yandex',onRetry:()=>api.retry(),onExit:()=>api.retry(),onRankings:()=>api.showRankings(),onLogin:()=>api.login()});
 const solids=getContext().garage.walkingSolids||getContext().garage.classroomSolids;
 solids?.push(...entrance.solids);
 const drivingModel=()=>vehicle?.model??getContext().model;
 const developerMode=()=>getContext().gameplay.state.developerMode===true;
 function access(){
  const gameplay=getContext().gameplay,career=gameplay.state,development=developerMode(),vehicleId=career.selectedId,vehicleUnlocked=gameplay.isOwned(vehicleId);
  if(career.routeCompletion!==accessProof||development!==accessDevelopment||vehicleId!==accessVehicle||vehicleUnlocked!==accessUnlocked){
   accessProof=career.routeCompletion;accessDevelopment=development;accessVehicle=vehicleId;accessUnlocked=vehicleUnlocked;
   entrance.updateAccess(gameplay.snapshot(),{developerMode:development,vehicleId,vehicleUnlocked});
  }
 }
 function prepare(){
  epoch++;attemptId=`canyon-${++canyonAttemptSequence}`;result=null;resultEligible=false;rankings=false;scorer=createDriftScore();
  checkpointRun.start(drivingModel().state);
  phase='running';start();ui.update({phase});syncCheckpoints();
 }
 function syncCheckpoints(){
  const state=checkpointRun.state;
  ui.updateCheckpoint({...state,active:active&&state.active});
  checkpointGates.setTarget(active&&state.active?state.index:null);
 }
 function start(){
  phase='running';if(!scorer.start(drivingModel().state)){phase='arming';ui.hide();return;}
  if(developerMode()){scorer.disqualify('development');onControlsChanged();return;}
  onControlsChanged();
 }
 const api={entrance,environment,clouds,get cloudFog(){return clouds.fog;},get model(){return drivingModel();},effects,leaderboard,get active(){return active;},get phase(){return phase;},get controlsLocked(){return false;},get score(){return scorer?.state;},get checkpoints(){return checkpointRun.state;},
  refreshAccess:access,
  surface(x,z,padding=0){return canyonSurface(x,z,padding);},
  height(x,z){return canyonHeight(x,z);},
  contact(x,z,h,footprint){return canyonContact(x,z,h,footprint);},
  groundSurface(){return surfaceForBiome('city',vehicle?.id??getContext().gameplay.state.selectedId??'bmwreward');},
  enter(){
   access();const c=getContext(),p=c.model?.state;
   if(disposed||active||!c.driving||!p||!canyonSurface(p.x,p.z,2)||!canEnterCanyon(c.gameplay.snapshot(),c.gameplay.state.selectedId,{developerMode:developerMode(),vehicleUnlocked:c.gameplay.isOwned(c.gameplay.state.selectedId)}))return false;
   if(Number.isFinite(p.y)&&Math.abs(p.y-canyonHeight(p.x,p.z))>3)return false;
   vehicle=c.garage.vehicles.find(v=>v.model===c.model);if(!vehicle||!c.gameplay.beginCanyonRun())return false;
   active=true;documentClass(true);prepare();onEnter({model:vehicle.model,vehicle});return true;
  },
  retry(){if(!active||disposed||phase==='celebrating'||platform?.status?.reloadRequired)return false;epoch++;phase='touring';scorer=null;result=null;resultEligible=false;ui.hide();syncCheckpoints();return true;},
  tryEnter(){access();const c=getContext();return !active&&c.driving?api.enter():false;},
  pose(state=drivingModel().state){const model=drivingModel(),currentVehicle=vehicle??getContext().garage.vehicles.find(v=>v.model===model);return canyonPose(THREE,state,currentVehicle?.visual?.metadata);},
  step(rawDelta,{simulatedSeconds=rawDelta}={}){
   if(!active||disposed||phase==='celebrating'||phase==='timeout')return;
   const model=drivingModel(),g=getContext().gameplay,id=vehicle.id,dt=Number.isFinite(simulatedSeconds)?Math.max(0,Math.min(.1,simulatedSeconds)):0;
   if(g.state.fuels[id]<=0)model.setInput({active:false});
   // The application advances the shared Rapier world before canyon scoring.
   g.state.player.x=model.state.x;g.state.player.z=model.state.z;
   g.state.fuels[id]=Math.max(0,g.state.fuels[id]-model.state.pathDistance*vehicleConfig(id).consumption);
   const road=projectCanyon(model.state.x,model.state.z);
   const along=(model.state.x-road.x)*-Math.sin(road.heading)+(model.state.z-road.z)*-Math.cos(road.heading);
   // Only the upstream road connection returns to career mode. An open cliff
   // keeps this physical car in the canyon until the shared fall recovery.
   if(road.progress<1e-6&&along< -3&&Math.abs(road.offset)<=CANYON_TRACK.halfWidth+3&&(!Number.isFinite(model.state.y)||Math.abs(model.state.y-road.height)<3)){api.leave({preserveApproachClouds:true});return;}
   const timed=checkpointRun.update(dt,model.state);
   if(timed.failed){
    scorer?.invalidate('checkpoint-timeout');epoch++;phase='timeout';result=null;resultEligible=false;
    ui.hide();checkpointGates.setTarget(null);onTimeout();return;
   }
   if((phase==='running'||phase==='arming')&&(!canyonSurface(model.state.x,model.state.z,3)||model.state.y<road.height-3)){
    scorer.invalidate('off-track');phase='touring';result=null;resultEligible=false;ui.hide();
   }
   // An edge-of-road entry can precede the score start zone. Keep arming
   // until the same physical car reaches it; a dismissed run stays touring.
   if(phase==='arming')start();
   if(phase==='running'&&dt>0){
    if(rawDelta>.100001)api.pause('time-gap');
    scorer.update(dt,model.state);
   }
   if(timed.finished||(phase==='running'&&dt>0&&(!scorer.state.valid||g.state.fuels[id]<=0)))void api.complete();
   if(phase==='running')ui.update({phase,score:scorer?.state.score,multiplier:scorer?.state.multiplier,progress:scorer?.state.progress,angle:model.state.slipAngle,length:CANYON_TRACK.finish});
   syncCheckpoints();
  },
  pause(reason='paused'){if(!active||phase==='celebrating')return;scorer?.disqualify(reason);ui.suspend();effects.clear();},
  async complete(){
   if(!active||phase==='celebrating'||phase==='timeout'||(phase!=='running'&&!checkpointRun.state.finished))return null;
   const model=drivingModel(),token=++epoch,owner=account(),local=checkpointRun.state.finished&&phase==='running'?scorer.result():null,g=getContext().gameplay,runScorer=scorer,development=developerMode();
   ui.setLoginBusy(false);
   // Finalize locally at the line. A completed score never depends on a room
   // connection, and its Yandex write may finish after the timed hangar return.
   result=local;resultEligible=!!local&&runScorer.state.rankedEligible&&!development;
   const celebrating=checkpointRun.state.finished&&g.beginFinish?.('canyon',model.state)===true;
   phase=celebrating?'celebrating':'result';
   if(celebrating){ui.hide();ui.update({phase:'celebrating',score:local?.score??0,multiplier:runScorer?.state.multiplier??1,progress:CANYON_TRACK.finish,length:CANYON_TRACK.finish,angle:model.state.slipAngle});}
   else ui.showResult(local,{status:local?'checking':'cancelled'});
   onControlsChanged();
   const valid=()=>celebrating?!disposed&&token===epoch&&owner===account()&&!platform?.status?.reloadRequired:current(token,owner);
   if(!valid())return null;
   if(local){
    const ownedBefore=new Set(g.state.ownedVehicleIds);
    if(!development){
     if(resultEligible&&g.recordCanyonFinish)g.recordCanyonFinish(local,attemptId);
     else g.recordDriftResult(local);
    }
    onComplete({result:local,development,newlyUnlockedVehicleIds:g.state.ownedVehicleIds.filter(id=>!ownedBefore.has(id))});
   }
   let status=local?(development?'development':'practice'):'cancelled';
   if(resultEligible){const submission=await leaderboard.submit(local,{isCurrent:valid});if(!valid())return null;status=submission.status;}
   if(!celebrating&&valid()){ui.showResult(local,{status});onControlsChanged();}return local;
  },
  async showRankings(){if(!active||phase==='celebrating')return;rankings=true;const token=epoch;ui.showRankings({...leaderboard.state,status:'loading'});const board=await leaderboard.load();if(active&&token===epoch&&rankings)ui.showRankings(board);},
  async login(){if(!active||phase==='celebrating')return;const token=epoch;ui.setLoginBusy(true);const status=await leaderboard.login();if(!active||token!==epoch)return;ui.setLoginBusy(false);if(status.status==='authorized'&&resultEligible&&result){const submitted=await leaderboard.submit(result,{isCurrent:()=>active&&token===epoch});if(active&&token===epoch)ui.showResult(result,{status:submitted.status});}else if(status.status!=='authorized')ui.showResult(result,status);},
  updateEffects(dt,{paused=false,grounded=true,camera}={}){
   const c=getContext(),v=active?vehicle:c.garage.vehicles.find(v=>v.model===c.model);
   const state=active?drivingModel().state:c.model.state;
   clouds.update(dt,{active,driving:c.driving,car:state,paused,camera,baseFog:c.biomeWeather?.fog});
   // Ordinary effects follow rear contact slip rather than the body angle in
   // a normal tight turn. Preserve the BMW's published drift telemetry.
   let effectState=state;
   if(!vehicleConfig(c.gameplay.state.selectedId).rewardDrift){
    let geometry=v?.model?.physicsGeometry;
    if(!geometry){
     const rear=v?.visual?.metadata?.wheelContacts?.filter(w=>!w.front&&Number.isFinite(w.center?.[2]));
     if(rear?.length)geometry={rearZ:rear.reduce((z,w)=>z+w.center[2],0)/rear.length};
    }
    effectState={...state,...ordinaryDriftTelemetry(state,geometry)};
   }
   effects.update(dt,effectState,{enabled:c.driving&&!paused&&!api.controlsLocked,grounded,metadata:v?.visual?.metadata,pose:v?.rig.root?{position:v.rig.root.position,quaternion:v.rig.root.quaternion}:v?.rig.pose,camera});
  },
  leave({preserveApproachClouds=false}={}){
   checkpointRun.reset();checkpointGates.setTarget(null);ui.updateCheckpoint({active:false});
   if(!preserveApproachClouds)clouds.update(0);
   if(!active)return;if(phase!=='celebrating')epoch++;active=false;phase='idle';ui.hide();effects.clear();
   getContext().gameplay.endCanyonRun?.();vehicle=null;documentClass(false);onExit();
  },
  dispose(){if(disposed)return;api.leave();disposed=true;epoch++;if(!sharedLeaderboard)leaderboard.dispose();ui.dispose();effects.dispose();clouds.dispose();checkpointGates.dispose();entrance.group.removeFromParent();entrance.dispose();environment?.group.removeFromParent();environment?.dispose();for(const solid of entrance.solids){const index=solids?.indexOf(solid)??-1;if(index>=0)solids.splice(index,1);}},
 };
 function documentClass(value){doc.body.classList.toggle('is-canyon',value);}
 access();return api;
}
