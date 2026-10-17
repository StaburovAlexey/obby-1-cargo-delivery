import {createCanyonEntrance,canEnterCanyon} from './canyon-entrance.js';
import {createCanyonScene} from './canyon-scene.js';
import {CANYON_TRACK,canyonPointAt,projectCanyon,canyonContact,canyonHeight,canyonPose} from './canyon-track.js';
import {createDrivingModel} from './driving-model.js';
import {surfaceForBiome} from './biome-surfaces.js';
import {vehicleFootprint} from './vehicle-contact.js';
import {createDriftScore} from './drift-score.js';
import {createDriftEffects} from './drift-effects.js';
import {createCanyonUi} from './canyon-ui.js';
import {createCanyonLeaderboard} from './canyon-leaderboard.js';
import {vehicleConfig} from './economy-config.js';
import {groundHeight} from './city-driving.js';

export function createCanyonMode(THREE,{scene,document:doc,platform,language,getContext,onEnter=()=>{},onExit=()=>{},onControlsChanged=()=>{}}){
 const entrance=createCanyonEntrance(THREE);scene.add(entrance.group);
 const effects=createDriftEffects(THREE,{height:(x,z)=>active?canyonHeight(x,z):groundHeight(x,z)});scene.add(effects.group);
 const leaderboard=createCanyonLeaderboard({platform});
 let active=false,phase='idle',disposed=false,epoch=0,countdown=3,environment=null,vehicle=null,original=null,scorer=null,runId=null,runReady=Promise.resolve(null),result=null,rankings=false,accessProof=Symbol('initial'),accessDevelopment=null;
 const account=()=>platform?.accountGeneration??0;
 const current=(token,owner)=>!disposed&&active&&token===epoch&&owner===account()&&!platform?.status?.reloadRequired;
 const client=()=>getContext().online?.client;
 const ui=createCanyonUi(doc,{language,rankingsEnabled:platform?.id==='yandex',onRetry:()=>api.retry(),onExit,onRankings:()=>api.showRankings(),onLogin:()=>api.login()});
 const solids=getContext().garage.walkingSolids||getContext().garage.classroomSolids;
 solids?.push(...entrance.solids);
 const model=createDrivingModel({...canyonPointAt(CANYON_TRACK.spawn),vehicleId:'bmwreward',maxSpeed:42,getUpgrades:()=>undefined,
  groundSurface:()=>surfaceForBiome('city','bmwreward'),groundGradient:(x,z)=>projectCanyon(x,z).gradient,
  contact:(x,z,h)=>canyonContact(x,z,h,vehicleFootprint(vehicle?.visual?.metadata,model.state.frontWheelAngle))});
 const developerMode=()=>getContext().gameplay.state.developerMode===true;
 function access(){const career=getContext().gameplay.state,development=developerMode();if(career.routeCompletion!==accessProof||development!==accessDevelopment){accessProof=career.routeCompletion;accessDevelopment=development;entrance.updateAccess(getContext().gameplay.snapshot(),{developerMode:development});}}
 function place(){const start=canyonPointAt(CANYON_TRACK.spawn);model.reset();Object.assign(model.state,{x:start.x,z:start.z,heading:start.heading});model.pause();vehicle.rig.update({...canyonPose(THREE,model.state,vehicle.visual?.metadata),steerAngle:0,wheelSpin:0,bodyPitch:0,bodyRoll:0,bodyBob:0});}
 function prepare(){
  epoch++;leaderboard.cancelPending();client()?.cancelDriftRun();runId=null;runReady=Promise.resolve(null);result=null;rankings=false;phase='countdown';countdown=3;effects.clear();place();scorer=createDriftScore();
  getContext().gameplay.state.fuels.bmwreward=vehicleConfig('bmwreward').capacity;
  onEnter({model,vehicle});ui.update({phase,countdown});
 }
 function start(){
  phase='running';scorer.start(model.state);const token=epoch;
  if(developerMode()){scorer.disqualify('development');onControlsChanged();return;}
  runReady=Promise.resolve(client()?.startDriftRun()).then(reply=>{if(token!==epoch||!active)return null;runId=reply?.ok?reply.runId:null;if(!runId)scorer.disqualify('offline');return runId;}).catch(()=>{if(token===epoch)scorer.disqualify('offline');return null;});
  onControlsChanged();
 }
 const api={entrance,model,effects,leaderboard,get active(){return active;},get phase(){return phase;},get controlsLocked(){return active&&phase!=='running';},get score(){return scorer?.state;},
  refreshAccess:access,
  enter(){
   access();const c=getContext();if(disposed||active||!canEnterCanyon(c.gameplay.snapshot(),'bmwreward',{developerMode:developerMode()})||!c.gameplay.beginCanyonRun())return false;
   vehicle=c.garage.vehicles.find(v=>v.id==='bmwreward');if(!vehicle)return false;
   original={parent:vehicle.group.parent,model:vehicle.model,position:vehicle.position,groups:[c.city.group,c.garage.group,c.finishLine.group,c.roadHazardsScene.group].map(group=>[group,group.visible])};
   if(!environment){environment=createCanyonScene(THREE);scene.add(environment.group);}environment.group.visible=true;
   for(const [group]of original.groups)group.visible=false;
   c.biomeWeather?.clear();scene.add(vehicle.group);vehicle.model=model;vehicle.position=model.state;vehicle.group.visible=true;active=true;documentClass(true);prepare();return true;
  },
  retry(){if(!active||disposed||platform?.status?.reloadRequired)return false;prepare();return true;},
  tryEnter(){access();const c=getContext();return !active&&c.driving&&entrance.shouldEnter(c.model.state,c.gameplay.state.selectedId)?api.enter():false;},
  pose(){return canyonPose(THREE,model.state,vehicle?.visual?.metadata);},
  step(rawDelta){
   if(!active||disposed)return;
   const dt=Number.isFinite(rawDelta)?Math.max(0,Math.min(.1,rawDelta)):0;
   if(phase==='countdown'){model.pause();countdown-=dt;if(countdown<=0)start();}
   else if(phase==='running'&&dt>0){
    if(rawDelta>.100001)api.pause('time-gap');
    model.step(dt);scorer.update(dt,model.state);
    const g=getContext().gameplay;g.state.fuels.bmwreward=Math.max(0,g.state.fuels.bmwreward-model.state.pathDistance*vehicleConfig('bmwreward').consumption);
    if(scorer.state.finished||!scorer.state.valid||g.state.fuels.bmwreward<=0)void api.complete();
   }
   if(phase==='countdown'||phase==='running')ui.update({phase,countdown,score:scorer?.state.score,multiplier:scorer?.state.multiplier,progress:scorer?.state.progress,angle:model.state.slipAngle,length:CANYON_TRACK.finish});
  },
  pause(reason='paused'){if(!active)return;scorer?.disqualify(reason);client()?.cancelDriftRun();runId=null;effects.clear();},
  async complete(){
   if(!active||phase!=='running')return null;
   const token=epoch,owner=account(),local=scorer.result();phase='checking';result=local;ui.showResult(local,{status:'checking'});onControlsChanged();
   // The last on-road pose must reach the room verifier before the result freezes the car.
   vehicle.rig.update({...api.pose(),steerAngle:model.state.frontWheelAngle,wheelSpin:model.state.wheelSpin,bodyPitch:-model.state.bodyPitch,bodyRoll:-model.state.bodyRoll,bodyBob:model.state.bodyBob});
   let verified=null;
   try{const ticket=await runReady;if(current(token,owner)&&local&&scorer.state.rankedEligible&&ticket)verified=await client()?.finishDriftRun(ticket);else client()?.cancelDriftRun();}catch{}
   if(!current(token,owner))return null;
   result=verified||local;model.pause();phase='result';
   if(result)getContext().gameplay.recordDriftResult(result);
   let status=local?(scorer.state.rankedEligible?'unverified':'practice'):'cancelled';
   if(verified){ui.showResult(result,{status:'checking'});const submission=await leaderboard.submit(verified);if(!current(token,owner))return null;status=submission.status;}
   ui.showResult(result,{status});onControlsChanged();return result;
  },
  async showRankings(){if(!active)return;rankings=true;const token=epoch;ui.showRankings({...leaderboard.state,status:'loading'});const board=await leaderboard.load();if(active&&token===epoch&&rankings)ui.showRankings(board);},
  async login(){const token=epoch;ui.setLoginBusy(true);const status=await leaderboard.login();if(!active||token!==epoch)return;ui.setLoginBusy(false);if(status.status==='authorized'&&result?.verified){const submitted=await leaderboard.submit(result);if(active&&token===epoch)ui.showResult(result,{status:submitted.status});}else if(status.status!=='authorized')ui.showResult(result,status);},
  updateEffects(dt,{paused=false,grounded=true,camera}={}){const c=getContext(),v=active?vehicle:c.garage.vehicles.find(v=>v.model===c.model);effects.update(dt,active?model.state:c.model.state,{enabled:c.driving&&c.gameplay.state.selectedId==='bmwreward'&&!paused&&!api.controlsLocked,grounded,metadata:v?.visual?.metadata,pose:v?.rig.pose,camera});},
  leave(){
   if(!active)return;epoch++;leaderboard.cancelPending();client()?.cancelDriftRun();runId=null;active=false;phase='idle';model.pause();effects.clear();ui.hide();if(environment)environment.group.visible=false;
   for(const [group,visible]of original.groups)group.visible=visible;
   original.parent.add(vehicle.group);vehicle.model=original.model;vehicle.position=original.position;original=null;documentClass(false);
  },
  dispose(){if(disposed)return;api.leave();disposed=true;epoch++;leaderboard.dispose();ui.dispose();effects.dispose();entrance.group.removeFromParent();entrance.dispose();environment?.group.removeFromParent();environment?.dispose();for(const solid of entrance.solids){const index=solids?.indexOf(solid)??-1;if(index>=0)solids.splice(index,1);}},
 };
 function documentClass(value){doc.body.classList.toggle('is-canyon',value);}
 access();return api;
}
