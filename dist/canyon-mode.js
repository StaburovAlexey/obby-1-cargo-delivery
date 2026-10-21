import {createCanyonEntrance,canEnterCanyon} from './canyon-entrance.js';
import {createCanyonScene} from './canyon-scene.js';
import {CANYON_TRACK,canyonContact,canyonHeight,canyonPose,canyonSurface} from './canyon-track.js';
import {surfaceForBiome} from './biome-surfaces.js';
import {createDriftScore} from './drift-score.js';
import {createDriftEffects} from './drift-effects.js';
import {driftTelemetry} from './drift-dynamics.js';
import {createCanyonUi} from './canyon-ui.js';
import {createCanyonLeaderboard} from './canyon-leaderboard.js';
import {vehicleConfig} from './economy-config.js';
import {groundHeight} from './city-driving.js';

export function createCanyonMode(THREE,{scene,document:doc,platform,leaderboard:sharedLeaderboard,language,getContext,onEnter=()=>{},onExit=()=>{},onControlsChanged=()=>{}}){
 const entrance=createCanyonEntrance(THREE,{document:doc,language});scene.add(entrance.group);
 const environment=createCanyonScene(THREE);scene.add(environment.group);
 const effects=createDriftEffects(THREE,{height:(x,z)=>canyonSurface(x,z,12)?canyonHeight(x,z):groundHeight(x,z)});scene.add(effects.group);
 const leaderboard=sharedLeaderboard??createCanyonLeaderboard({platform});
 let active=false,phase='idle',disposed=false,epoch=0,vehicle=null,scorer=null,result=null,resultEligible=false,rankings=false,accessProof=Symbol('initial'),accessDevelopment=null,accessVehicle=null;
 const account=()=>platform?.accountGeneration??0;
 const current=(token,owner)=>!disposed&&active&&token===epoch&&owner===account()&&!platform?.status?.reloadRequired;
 const ui=createCanyonUi(doc,{language,rankingsEnabled:platform?.id==='yandex',onRetry:()=>api.retry(),onExit:()=>api.retry(),onRankings:()=>api.showRankings(),onLogin:()=>api.login()});
 const solids=getContext().garage.walkingSolids||getContext().garage.classroomSolids;
 solids?.push(...entrance.solids);
 const drivingModel=()=>vehicle?.model??getContext().model;
 const developerMode=()=>getContext().gameplay.state.developerMode===true;
 function access(){const career=getContext().gameplay.state,development=developerMode(),vehicleId=career.selectedId;if(career.routeCompletion!==accessProof||development!==accessDevelopment||vehicleId!==accessVehicle){accessProof=career.routeCompletion;accessDevelopment=development;accessVehicle=vehicleId;entrance.updateAccess(getContext().gameplay.snapshot(),{developerMode:development,vehicleId});}}
 function prepare(){
  epoch++;result=null;resultEligible=false;rankings=false;scorer=createDriftScore();
  phase='running';start();ui.update({phase});
 }
 function start(){
  phase='running';if(!scorer.start(drivingModel().state)){phase='arming';ui.hide();return;}
  if(developerMode()){scorer.disqualify('development');onControlsChanged();return;}
  onControlsChanged();
 }
 const api={entrance,environment,get model(){return drivingModel();},effects,leaderboard,get active(){return active;},get phase(){return phase;},get controlsLocked(){return false;},get score(){return scorer?.state;},
  refreshAccess:access,
  surface(x,z,padding=0){return canyonSurface(x,z,padding);},
  contact(x,z,h,footprint){return canyonContact(x,z,h,footprint);},
  groundSurface(){return surfaceForBiome('city','bmwreward');},
  enter(){
   access();const c=getContext(),p=c.model?.state;
   if(disposed||active||!c.driving||!p||!canyonSurface(p.x,p.z,2)||!canEnterCanyon(c.gameplay.snapshot(),c.gameplay.state.selectedId,{developerMode:developerMode()}))return false;
   vehicle=c.garage.vehicles.find(v=>v.model===c.model);if(!vehicle||!c.gameplay.beginCanyonRun())return false;
   active=true;documentClass(true);prepare();onEnter({model:vehicle.model,vehicle});return true;
  },
  retry(){if(!active||disposed||phase==='celebrating'||platform?.status?.reloadRequired)return false;epoch++;phase='touring';scorer=null;result=null;resultEligible=false;ui.hide();return true;},
  tryEnter(){access();const c=getContext();return !active&&c.driving?api.enter():false;},
  pose(state=drivingModel().state){const model=drivingModel(),currentVehicle=vehicle??getContext().garage.vehicles.find(v=>v.model===model);return canyonPose(THREE,state,currentVehicle?.visual?.metadata);},
  step(rawDelta){
   if(!active||disposed||phase==='celebrating')return;
   const model=drivingModel(),g=getContext().gameplay,dt=Number.isFinite(rawDelta)?Math.max(0,Math.min(.05,rawDelta)):0;
   if(g.state.fuels.bmwreward<=0)model.setInput({active:false});
   model.step(dt);
   g.state.player.x=model.state.x;g.state.player.z=model.state.z;
   g.state.fuels.bmwreward=Math.max(0,g.state.fuels.bmwreward-model.state.pathDistance*vehicleConfig('bmwreward').consumption);
   if(!canyonSurface(model.state.x,model.state.z,3)){api.leave();return;}
   // An edge-of-road entry can precede the score start zone. Keep arming
   // until the same physical car reaches it; a dismissed run stays touring.
   if(phase==='arming')start();
   if(phase==='running'&&dt>0){
    if(rawDelta>.100001)api.pause('time-gap');
    scorer.update(dt,model.state);
    if(scorer.state.finished||!scorer.state.valid||g.state.fuels.bmwreward<=0)void api.complete();
   }
   if(phase==='running')ui.update({phase,score:scorer?.state.score,multiplier:scorer?.state.multiplier,progress:scorer?.state.progress,angle:model.state.slipAngle,length:CANYON_TRACK.finish});
  },
  pause(reason='paused'){if(!active||phase==='celebrating')return;scorer?.disqualify(reason);ui.suspend();effects.clear();},
  async complete(){
   if(!active||phase!=='running')return null;
   const model=drivingModel(),token=epoch,owner=account(),local=scorer.result(),g=getContext().gameplay,runScorer=scorer,development=developerMode();
   // Finalize locally at the line. A completed score never depends on a room
   // connection, and its Yandex write may finish after the timed hangar return.
   result=local;resultEligible=!!local&&runScorer.state.rankedEligible&&!development;
   const celebrating=!!local&&g.beginFinish?.('canyon',model.state)===true;
   phase=celebrating?'celebrating':'result';
   if(celebrating)ui.update({phase:'celebrating',score:local.score,multiplier:runScorer.state.multiplier,progress:CANYON_TRACK.finish,length:CANYON_TRACK.finish,angle:model.state.slipAngle});
   else ui.showResult(local,{status:local?'checking':'cancelled'});
   onControlsChanged();
   vehicle.rig.update({...api.pose(),steerAngle:model.state.frontWheelAngle,wheelSpin:model.state.wheelSpin,bodyPitch:-model.state.bodyPitch,bodyRoll:-model.state.bodyRoll,bodyBob:model.state.bodyBob});
   const valid=()=>celebrating?!disposed&&token===epoch&&owner===account()&&!platform?.status?.reloadRequired:current(token,owner);
   if(!valid())return null;
   if(local&&!development)g.recordDriftResult(local);
   let status=local?(development?'development':'practice'):'cancelled';
   if(resultEligible){const submission=await leaderboard.submit(local,{isCurrent:valid});if(!valid())return null;status=submission.status;}
   if(!celebrating&&valid()){ui.showResult(local,{status});onControlsChanged();}return local;
  },
  async showRankings(){if(!active||phase==='celebrating')return;rankings=true;const token=epoch;ui.showRankings({...leaderboard.state,status:'loading'});const board=await leaderboard.load();if(active&&token===epoch&&rankings)ui.showRankings(board);},
  async login(){if(!active||phase==='celebrating')return;const token=epoch;ui.setLoginBusy(true);const status=await leaderboard.login();if(!active||token!==epoch)return;ui.setLoginBusy(false);if(status.status==='authorized'&&resultEligible&&result){const submitted=await leaderboard.submit(result,{isCurrent:()=>active&&token===epoch});if(active&&token===epoch)ui.showResult(result,{status:submitted.status});}else if(status.status!=='authorized')ui.showResult(result,status);},
  updateEffects(dt,{paused=false,grounded=true,camera}={}){
   const c=getContext(),v=active?vehicle:c.garage.vehicles.find(v=>v.model===c.model);
   const state=active?drivingModel().state:c.model.state;
   // Ordinary cars do not publish BMW drift telemetry. Measure their actual
   // slip for visuals only, preserving physics and camera state.
   const effectState=c.gameplay.state.selectedId==='bmwreward'?state:{...state,...driftTelemetry(state)};
   // The fleet's controlled skids have smaller slip angles than the BMW.
   if(effectState!==state)effectState.driftIntensity=Math.min(1,effectState.driftIntensity*2);
   effects.update(dt,effectState,{enabled:c.driving&&!paused&&!api.controlsLocked,grounded,metadata:v?.visual?.metadata,pose:v?.rig.pose,camera});
  },
  leave(){
   if(!active)return;if(phase!=='celebrating')epoch++;active=false;phase='idle';ui.hide();effects.clear();
   getContext().gameplay.endCanyonRun?.();vehicle=null;documentClass(false);onExit();
  },
  dispose(){if(disposed)return;api.leave();disposed=true;epoch++;if(!sharedLeaderboard)leaderboard.dispose();ui.dispose();effects.dispose();entrance.group.removeFromParent();entrance.dispose();environment?.group.removeFromParent();environment?.dispose();for(const solid of entrance.solids){const index=solids?.indexOf(solid)??-1;if(index>=0)solids.splice(index,1);}},
 };
 function documentClass(value){doc.body.classList.toggle('is-canyon',value);}
 access();return api;
}
