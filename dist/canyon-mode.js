import {createCanyonEntrance,canEnterCanyon} from './canyon-entrance.js';
import {createCanyonScene} from './canyon-scene.js';
import {CANYON_TRACK,canyonContact,canyonHeight,canyonPose,canyonSurface} from './canyon-track.js';
import {surfaceForBiome} from './biome-surfaces.js';
import {createDriftScore} from './drift-score.js';
import {createDriftEffects} from './drift-effects.js';
import {createCanyonUi} from './canyon-ui.js';
import {createCanyonLeaderboard} from './canyon-leaderboard.js';
import {vehicleConfig} from './economy-config.js';
import {groundHeight} from './city-driving.js';

export function createCanyonMode(THREE,{scene,document:doc,platform,language,getContext,onEnter=()=>{},onExit=()=>{},onControlsChanged=()=>{}}){
 const entrance=createCanyonEntrance(THREE,{document:doc,language});scene.add(entrance.group);
 const environment=createCanyonScene(THREE);scene.add(environment.group);
 const effects=createDriftEffects(THREE,{height:(x,z)=>canyonSurface(x,z,12)?canyonHeight(x,z):groundHeight(x,z)});scene.add(effects.group);
 const leaderboard=createCanyonLeaderboard({platform});
 let active=false,phase='idle',disposed=false,epoch=0,vehicle=null,scorer=null,runId=null,runReady=Promise.resolve(null),result=null,rankings=false,accessProof=Symbol('initial'),accessDevelopment=null,accessVehicle=null;
 const account=()=>platform?.accountGeneration??0;
 const current=(token,owner)=>!disposed&&active&&token===epoch&&owner===account()&&!platform?.status?.reloadRequired;
 const client=()=>getContext().online?.client;
 const ui=createCanyonUi(doc,{language,rankingsEnabled:platform?.id==='yandex',onRetry:()=>api.retry(),onExit:()=>api.retry(),onRankings:()=>api.showRankings(),onLogin:()=>api.login()});
 const solids=getContext().garage.walkingSolids||getContext().garage.classroomSolids;
 solids?.push(...entrance.solids);
 const drivingModel=()=>vehicle?.model??getContext().model;
 const developerMode=()=>getContext().gameplay.state.developerMode===true;
 function access(){const career=getContext().gameplay.state,development=developerMode(),vehicleId=career.selectedId;if(career.routeCompletion!==accessProof||development!==accessDevelopment||vehicleId!==accessVehicle){accessProof=career.routeCompletion;accessDevelopment=development;accessVehicle=vehicleId;entrance.updateAccess(getContext().gameplay.snapshot(),{developerMode:development,vehicleId});}}
 function prepare(){
  epoch++;leaderboard.cancelPending();client()?.cancelDriftRun();runId=null;runReady=Promise.resolve(null);result=null;rankings=false;scorer=createDriftScore();
  phase='running';start();ui.update({phase});
 }
 function start(){
  phase='running';if(!scorer.start(drivingModel().state)){phase='arming';ui.hide();return;}const token=epoch;
  if(developerMode()){scorer.disqualify('development');onControlsChanged();return;}
  runReady=Promise.resolve(client()?.startDriftRun()).then(reply=>{if(token!==epoch||!active)return null;runId=reply?.ok?reply.runId:null;if(!runId)scorer.disqualify('offline');return runId;}).catch(()=>{if(token===epoch)scorer.disqualify('offline');return null;});
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
  retry(){if(!active||disposed||phase==='celebrating'||platform?.status?.reloadRequired)return false;epoch++;leaderboard.cancelPending();client()?.cancelDriftRun();phase='touring';scorer=null;result=null;ui.hide();return true;},
  tryEnter(){access();const c=getContext();return !active&&c.driving?api.enter():false;},
  pose(){const model=drivingModel(),currentVehicle=vehicle??getContext().garage.vehicles.find(v=>v.model===model);return canyonPose(THREE,model.state,currentVehicle?.visual?.metadata);},
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
  pause(reason='paused'){if(!active||phase==='celebrating')return;scorer?.disqualify(reason);client()?.cancelDriftRun();runId=null;effects.clear();},
  async complete(){
   if(!active||phase!=='running')return null;
   const model=drivingModel(),token=epoch,owner=account(),local=scorer.result(),g=getContext().gameplay,runScorer=scorer,runClient=client(),development=developerMode();
   // Snapshot the completed run at the line. Its asynchronous verification may
   // finish after the two-second celebration has already returned to the hangar.
   phase='checking';result=local;
   const celebrating=!!local&&g.beginFinish?.('canyon',model.state)===true;
   if(celebrating){phase='celebrating';ui.update({phase:'running',score:local.score,multiplier:runScorer.state.multiplier,progress:CANYON_TRACK.finish,length:CANYON_TRACK.finish,angle:model.state.slipAngle});}
   else ui.showResult(local,{status:'checking'});
   onControlsChanged();
   vehicle.rig.update({...api.pose(),steerAngle:model.state.frontWheelAngle,wheelSpin:model.state.wheelSpin,bodyPitch:-model.state.bodyPitch,bodyRoll:-model.state.bodyRoll,bodyBob:model.state.bodyBob});
   const valid=()=>celebrating?!disposed&&token===epoch&&owner===account()&&!platform?.status?.reloadRequired:current(token,owner);
   let verified=null;
   try{const ticket=await runReady;if(!valid())return null;if(local&&runScorer.state.rankedEligible&&ticket)verified=await runClient?.finishDriftRun(ticket);else runClient?.cancelDriftRun();}catch{}
   if(!valid())return null;
   const settled=verified||local;result=settled;if(!celebrating)phase='result';
   if(settled&&!development)g.recordDriftResult(settled);
   let status=local?(development?'development':runScorer.state.rankedEligible?'unverified':'practice'):'cancelled';
   if(verified&&!development){if(!celebrating)ui.showResult(settled,{status:'checking'});const submission=await leaderboard.submit(verified);if(!valid())return null;status=submission.status;}
   if(!celebrating){ui.showResult(settled,{status});onControlsChanged();}return settled;
  },
  async showRankings(){if(!active||phase==='celebrating')return;rankings=true;const token=epoch;ui.showRankings({...leaderboard.state,status:'loading'});const board=await leaderboard.load();if(active&&token===epoch&&rankings)ui.showRankings(board);},
  async login(){if(!active||phase==='celebrating')return;const token=epoch;ui.setLoginBusy(true);const status=await leaderboard.login();if(!active||token!==epoch)return;ui.setLoginBusy(false);if(status.status==='authorized'&&result?.verified){const submitted=await leaderboard.submit(result);if(active&&token===epoch)ui.showResult(result,{status:submitted.status});}else if(status.status!=='authorized')ui.showResult(result,status);},
  updateEffects(dt,{paused=false,grounded=true,camera}={}){const c=getContext(),v=active?vehicle:c.garage.vehicles.find(v=>v.model===c.model);effects.update(dt,active?drivingModel().state:c.model.state,{enabled:c.driving&&c.gameplay.state.selectedId==='bmwreward'&&!paused&&!api.controlsLocked,grounded,metadata:v?.visual?.metadata,pose:v?.rig.pose,camera});},
  leave(){
   if(!active)return;if(phase!=='celebrating'){epoch++;leaderboard.cancelPending();client()?.cancelDriftRun();}runId=null;active=false;phase='idle';ui.hide();effects.clear();
   getContext().gameplay.endCanyonRun?.();vehicle=null;documentClass(false);onExit();
  },
  dispose(){if(disposed)return;api.leave();disposed=true;epoch++;client()?.cancelDriftRun();leaderboard.dispose();ui.dispose();effects.dispose();entrance.group.removeFromParent();entrance.dispose();environment?.group.removeFromParent();environment?.dispose();for(const solid of entrance.solids){const index=solids?.indexOf(solid)??-1;if(index>=0)solids.splice(index,1);}},
 };
 function documentClass(value){doc.body.classList.toggle('is-canyon',value);}
 access();return api;
}
