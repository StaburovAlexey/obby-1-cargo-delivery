import { biomeSurfaceAt } from './biome-surfaces.js';
import { projectRoad, pointInRoad, TRUCK_HALF_WIDTH, TRUCK_HALF_LENGTH } from './road-layout.js';
import { GARAGE_LAYOUT, CLASSROOM_ENTRY, CLASSROOM_ENTRIES } from './garage-scene.js';
import { ECONOMY_CONFIG, VEHICLE_CONFIG, vehicleConfig, BIOME_SEQUENCE, DELIVERY_CHECKPOINTS, REWARD_VEHICLE_ID, ROUTE_COMPLETION_PROOF, FINAL_DELIVERY_CHECKPOINT } from './economy-config.js';
import { CHARACTER_CATALOG } from './character-catalog.js';
import { freshCareer, sanitizeCareer } from './career-save.js';
import { PROGRESSION_CONFIG, schoolConfig, skinConfig } from './progression-config.js';
import { getUpgradeOffer, getVehiclePerformance } from './vehicle-upgrades.js';
import { BRIDGES, bridgeAtProgress } from './road-bridges.js';
import { FORK_DEFINITIONS } from './route-network-config.js';
import { getActiveMission, advanceCareerMission, calculateDeliveryReward, capDeliveryReward, getVehicleGoal, MAX_MISSION_SEQUENCE } from './career-missions.js';

const runtimeId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
let runSequence = 0;
const characterIds = new Set(CHARACTER_CATALOG.map(character => character.id));
const premiumSkinIds = new Set(['spider-man','spyder-sammy','kreekcraft','jandel','dancing-npc-girl']);

export const GAMEPLAY = Object.freeze({ spawn: Object.freeze({...GARAGE_LAYOUT.spawn,heading:0}), roadSpawn: Object.freeze({x:0,z:6,heading:0}), walkSpeed:4.5, runSpeed:7, entryRadius:5.2, fuelRange:460, fuelCapacity:100, exitCooldown:1.1,jumpSpeed:8,gravity:22,jumpDuration:16/22 });
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));


export function garageRoadContact(x,z,heading,roadContact) {
  return roadContact(x,z,heading);
}
export function isInGarage(x,z) {
  return x>=GARAGE_LAYOUT.minX&&x<=GARAGE_LAYOUT.maxX&&z>=GARAGE_LAYOUT.frontZ&&z<=GARAGE_LAYOUT.rearZ;
}
export function walkPointAllowed(x,z,r=1.6) {
  if(isInGarage(x,z))return x>=GARAGE_LAYOUT.minX+r&&x<=GARAGE_LAYOUT.maxX-r&&z>=GARAGE_LAYOUT.frontZ+r&&z<=GARAGE_LAYOUT.rearZ-r;
  return pointInRoad(x,z,r);
}
export function parkedVehicleContact(x,z,heading,vehicles,selectedId,footprint) {
  const c=Math.cos(heading),s=Math.sin(heading),halfWidth=footprint?.halfWidth??TRUCK_HALF_WIDTH,halfLength=footprint?.halfLength??TRUCK_HALF_LENGTH;let result;
  for(const v of vehicles){if(v.id===selectedId)continue;const p=v.position||v.park;
    const b=Math.cos(p.heading||0),t=Math.sin(p.heading||0),dx=x-p.x,dz=z-p.z;
    const parked=v.parkedFootprint||{halfWidth:TRUCK_HALF_WIDTH,halfLength:TRUCK_HALF_LENGTH};
    let depth=Infinity,nx=0,nz=0;
    for(const [ax,az] of [[c,-s],[-s,-c],[b,-t],[-t,-b]]){
      const d=dx*ax+dz*az;
      const overlap=halfWidth*Math.abs(c*ax-s*az)+halfLength*Math.abs(-s*ax-c*az)+parked.halfWidth*Math.abs(b*ax-t*az)+parked.halfLength*Math.abs(-t*ax-b*az)+.05-Math.abs(d);
      if(overlap<=0){depth=0;break;}if(overlap<depth){depth=overlap;const sign=d<0?-1:1;nx=ax*sign;nz=az*sign;}
    }
    if(depth>0&&(!result||depth>result.depth))result={depth,normalX:nx,normalZ:nz,name:'Parked '+v.id};
  }return result;
}

export function resolveFreeClassroomSeat(desks,occupiedSeatIds=[]) {
  const occupied=new Set(occupiedSeatIds);
  return [...desks].sort((a,b)=>a.id.localeCompare(b.id)).find(d=>!occupied.has(d.id))||null;
}


export function createGameplay({vehicles=[],stations=[],deliveries=[],desks=[],stands=[],solids=[],characterId='bacon',occupiedSeatIds=[],career,persistence,hardBranches={},developerMode=false}={}) {
  const developerSession=developerMode===true;
  let loadedCareer=career, loadFailed=!!persistence?.status?.failed;
  if(loadedCareer===undefined&&persistence){
    try {loadedCareer=persistence.load();loadFailed=!!persistence.status?.failed;}
    catch {loadFailed=true;}
  }
  const saved=loadedCareer===undefined?freshCareer(characterId):sanitizeCareer(loadedCareer,characterId);
  const state={mode:'walking',selectedId:null,player:{...GAMEPLAY.spawn},fuels:Object.fromEntries(vehicles.map(v=>[v.id,getVehiclePerformance(vehicleConfig(v.id).id,saved.upgrades[v.id]).capacity])),cooldown:0,blockedEntry:null,walked:0,stationId:null,elapsed:0,lastEvent:'start',characterId:saved.characterId,seatedId:null,interactionCooldown:0,classroomArmed:true,occupiedSeatIds:[...new Set(occupiedSeatIds)],blockedStand:null,doorNotified:false,landingCooldown:0,jump:{height:0,velocity:0,elapsed:0,airborne:false},money:saved.money,ownedVehicleIds:saved.ownedVehicleIds,completedRuns:saved.completedRuns,purchaseCandidateId:null,run:null,testMode:false,testBiome:null,saveFailed:loadFailed};
  Object.assign(state,{developerMode:developerSession,routeCompletion:saved.routeCompletion,brains:saved.brains,ownedSkinIds:saved.ownedSkinIds,ownedSchoolIds:saved.ownedSchoolIds,upgrades:saved.upgrades,vehicleGrantClaimed:saved.vehicleGrantClaimed,retention:saved.retention,skinPurchaseCandidateId:null,schoolPurchaseCandidateId:null,seatedSchoolId:null});
  const fuelCapacity=id=>getVehiclePerformance(vehicleConfig(id).id,state.upgrades[id]).capacity;
  let events=[],progressDirty=false,progressSinceSave=0,rewardEarned=!!saved.routeCompletion;
  const emit=(type,extra={})=>{state.lastEvent=type;events.push({type,...extra});};
  const pose=v=>v.position || v.park;
  const snapshot=()=>sanitizeCareer({version:ECONOMY_CONFIG.saveVersion,money:state.money,ownedVehicleIds:state.ownedVehicleIds,characterId:state.characterId,completedRuns:state.completedRuns,routeCompletion:state.routeCompletion,brains:state.brains,ownedSkinIds:state.ownedSkinIds,ownedSchoolIds:state.ownedSchoolIds,upgrades:state.upgrades,vehicleGrantClaimed:state.vehicleGrantClaimed,retention:state.retention});
  let saveWarningSent=false;
  const warnSave=()=>{state.saveFailed=true;if(!saveWarningSent){saveWarningSent=true;emit('save-warning',{reason:persistence?.status?.reason||'storage'});}};
  const persist=()=>{


    progressDirty=true;progressSinceSave=0;
    if(developerSession||!persistence){progressDirty=false;progressSinceSave=0;return true;}
    try {const result=persistence.save(snapshot());if(result===false||result?.ok===false||persistence.status?.failed){warnSave();return false;}state.saveFailed=false;progressDirty=false;progressSinceSave=0;return true;}
    catch {warnSave();return false;}
  };
  const developerReward=id=>developerSession&&id===REWARD_VEHICLE_ID&&!rewardEarned;
  const isOwned=id=>developerReward(id)||(state.ownedVehicleIds.includes(id)&&(id!==REWARD_VEHICLE_ID||rewardEarned));
  const getVehicleAvailability=id=>{
    const spec=VEHICLE_CONFIG.find(vehicle=>vehicle.id===id);
    if(!spec)return null;
    const owned=isOwned(id),rewardOnly=spec.rewardOnly===true;
    return {id,owned,rewardOnly,purchasable:!owned&&!rewardOnly,
      status:owned?'owned':rewardOnly?'locked':'purchasable',price:rewardOnly?null:spec.price,
      reason:!owned&&rewardOnly?'complete-full-route':null};
  };
  const isSkinOwned=id=>state.ownedSkinIds.includes(id);
  const isSchoolOwned=id=>state.ownedSchoolIds.includes(id);
  const canShop=()=>state.mode==='walking'&&!state.seatedId&&!state.jump.airborne&&state.jump.height===0;
  const schoolEntry=id=>CLASSROOM_ENTRIES.find(entry=>(entry.schoolId||entry.id)===id);
  const skinStand=id=>stands.find(stand=>CHARACTER_CATALOG[stand.index]?.id===id);
  const nearSchool=id=>{const entry=schoolEntry(id);return !!entry&&Math.hypot(state.player.x-entry.x,state.player.z-entry.z)<=entry.radius;};
  const nearSkin=id=>{const stand=skinStand(id);return !!stand&&Math.hypot(state.player.x-stand.trigger.x,state.player.z-stand.trigger.z)<stand.triggerRadius;};
  const clearPurchase=()=>{state.purchaseCandidateId=null;};
  const clearShopPrompts=()=>{clearPurchase();state.skinPurchaseCandidateId=null;state.schoolPurchaseCandidateId=null;};
  const updateShopPrompts=()=>{
    if(!canShop()){clearShopPrompts();return;}
    if(state.skinPurchaseCandidateId&&!nearSkin(state.skinPurchaseCandidateId))state.skinPurchaseCandidateId=null;
    if(state.schoolPurchaseCandidateId&&!nearSchool(state.schoolPurchaseCandidateId))state.schoolPurchaseCandidateId=null;
  };



  const vehicleDistance=v=>{
    const point=v.approachRadius>0&&v.approach?v.approach:pose(v);
    return Math.hypot(state.player.x-point.x,state.player.z-point.z);
  };
  const vehicleEntryRadius=v=>v.approachRadius>0?v.approachRadius:GAMEPLAY.entryRadius;
  const nearbyVehicle=(exclude=null)=>vehicles.map(v=>({v,d:vehicleDistance(v)}))
    .filter(a=>a.v.id!==exclude&&a.d<vehicleEntryRadius(a.v)).sort((a,b)=>a.d-b.d)[0]?.v;
  const updatePurchase=()=>{
    if(state.mode!=='walking'||state.seatedId||state.jump.airborne||state.jump.height>0){clearPurchase();return;}
    const near=nearbyVehicle(),id=near&&!isOwned(near.id)?near.id:null;
    if(state.purchaseCandidateId===id)return;
    state.purchaseCandidateId=id;
    if(id){const {price}=vehicleConfig(id),availability=getVehicleAvailability(id);emit('purchase-prompt',{id,price,affordable:availability.purchasable&&state.money>=price,...availability});}
  };
  const radius=()=>state.jump.airborne||state.landingCooldown>0?(state.characterId==='jandel'?2.05:1.8):(state.characterId==='jandel'?1.85:1.6);
  const canWalk=(x,z)=>walkPointAllowed(x,z,radius())&&!solids.some(b=>x>b.minX-radius()&&x<b.maxX+radius()&&z>b.minZ-radius()&&z<b.maxZ+radius())&&!stands.some(b=>Math.hypot(x-b.x,z-b.z)<1+radius())&&!vehicles.some(v=>{const p=pose(v),h=p.heading||0,dx=x-p.x,dz=z-p.z;const footprint=v.parkedFootprint||{halfWidth:1.75,halfLength:3.05};return Math.abs(dx*Math.cos(h)-dz*Math.sin(h))<footprint.halfWidth+radius()&&Math.abs(-dx*Math.sin(h)-dz*Math.cos(h))<footprint.halfLength+radius();});
  const bridgeIds=new Set(BRIDGES.map(bridge=>bridge.id));


  const checkpointIds=new Map(DELIVERY_CHECKPOINTS.flatMap(checkpoint=>[
    [checkpoint.id,checkpoint.id],[`delivery-${checkpoint.id}`,checkpoint.id],
  ]));
  const allowedHardBranches=new Map(FORK_DEFINITIONS.flatMap(fork=>{


    const descriptor=hardBranches&&typeof hardBranches==='object'?Object.getOwnPropertyDescriptor(hardBranches,fork.id):null;
    const branch=descriptor&&Object.hasOwn(descriptor,'value')?descriptor.value:null;
    return branch==='main'||branch==='alternate'?[[fork.id,branch]]:[];
  }));
  let runProgress=null;
  const acceptsTelemetry=input=>!!input&&typeof input==='object'&&state.mode==='driving'&&!state.testMode&&
    !!state.run?.loaded&&state.run.vehicleId===state.selectedId&&isOwned(state.selectedId)&&
    input.runId===state.run.id&&runProgress?.runId===state.run.id;
  const resetJump=()=>Object.assign(state.jump,{height:0,velocity:0,elapsed:0,airborne:false});
  const routeProofComplete=(progress,x,z)=>{
    const route=progress?.route,previous=route?.previous;
    return !!previous&&route.samples>=Math.ceil((previous.progress-route.startProgress)/9)&&
      previous.progress>=FINAL_DELIVERY_CHECKPOINT.progress-ECONOMY_CONFIG.checkpointRadius-1&&
      Math.hypot(x-previous.x,z-previous.z)<.05&&
      BRIDGES.filter(bridge=>bridge.to<FINAL_DELIVERY_CHECKPOINT.progress).every(bridge=>route.bridgeIds.has(bridge.id));
  };
  const api={state,canWalk,isOwned,isSkinOwned,isSchoolOwned,snapshot,getVehicleAvailability,




    recordRouteSample(input){
      if(!acceptsTelemetry(input))return false;
      const fail=()=>{api.invalidateRun({runId:input.runId});return false;};
      const {x,z,dt}=input;
      if(!Number.isFinite(x)||!Number.isFinite(z)||!Number.isFinite(dt)||dt<=0||dt>.1)return fail();
      const route=runProgress.route,previous=route.previous;
      if(!previous&&Math.hypot(x-GAMEPLAY.roadSpawn.x,z-GAMEPLAY.roadSpawn.z)>12)return fail();
      const step=previous?Math.hypot(x-previous.x,z-previous.z):0;
      if(step>80*dt+.5)return fail();
      const count=Math.max(1,Math.ceil(step));let projection=previous?.projection;
      for(let index=1;index<=count;index++){
        const t=index/count,sx=previous?previous.x+(x-previous.x)*t:x,sz=previous?previous.z+(z-previous.z)*t:z;
        const point=projectRoad(sx,sz,projection);
        if(!point||!pointInRoad(sx,sz)||!Number.isFinite(point.progress)||
          (projection&&Math.abs(point.progress-projection.progress)>9))return fail();
        const bridge=bridgeAtProgress(point.progress);
        if(bridge){if(Math.abs(point.offset-bridge.offset)>bridge.halfWidth+.015)return fail();route.bridgeIds.add(bridge.id);}
        projection=point;
      }
      if(!previous){
        if(projection.progress < -17||projection.progress>12)return fail();
        route.startProgress=projection.progress;
      }
      route.samples++;route.previous={x,z,progress:projection.progress,projection};return true;
    },
    getCareerMission(){return getActiveMission(state.retention);},
    getVehicleGoal(){return getVehicleGoal(state.retention,state.money,state.ownedVehicleIds);},
    setVehicleGoal(id){
      const vehicle=VEHICLE_CONFIG.find(spec=>spec.id===id&&spec.price>0&&!isOwned(spec.id));
      if(!vehicle)return false;
      if(state.retention.goalVehicleId===id)return true;
      state.retention.goalVehicleId=id;const saved=persist();
      emit('vehicle-goal',{goal:api.getVehicleGoal(),saved:!developerSession&&!!persistence&&saved});return true;
    },
    skipMission(){
      if(state.mode!=='walking'||state.run||state.testMode||state.retention.missionSequence>=MAX_MISSION_SEQUENCE)return false;
      state.retention.missionSequence++;state.retention.missionProgress=0;state.retention.missionBridgeIds=[];
      const saved=persist();emit('mission-changed',{mission:api.getCareerMission(),saved:!developerSession&&!!persistence&&saved});return true;
    },
    invalidateRun(input){
      if(!acceptsTelemetry(input))return false;
      const runId=state.run.id;state.run.loaded=false;state.run=null;runProgress=null;
      emit('run-invalidated',{runId,reason:'movement'});return true;
    },
    recordRunCollision(input){
      if(!acceptsTelemetry(input))return false;
      runProgress.collisions=Math.min(1_000_000,runProgress.collisions+1);return true;
    },
    recordBridgeCrossing(input){
      if(!acceptsTelemetry(input)||!bridgeIds.has(input.bridgeId)||runProgress.bridgeIds.has(input.bridgeId))return false;
      runProgress.bridgeIds.add(input.bridgeId);return true;
    },
    recordHardBranch(input){
      if(!acceptsTelemetry(input)||allowedHardBranches.get(input.forkId)!==input.branch||
        !allowedHardBranches.has(input.forkId)||runProgress.hardBranchIds.has(input.forkId))return false;
      runProgress.hardBranchIds.add(input.forkId);return true;
    },
    flushProgress(){if(!progressDirty)return true;return persist();},
    tickProgress(dt,{distance=0,active=false}={}){


      if(developerReward(state.selectedId))return 0;
      if(active!==true||typeof dt!=='number'||!Number.isFinite(dt)||dt<=0||dt>PROGRESSION_CONFIG.maxFrameSeconds)return 0;
      let rate=0;
      if(state.mode==='walking'&&state.seatedId&&state.seatedSchoolId&&isSchoolOwned(state.seatedSchoolId)){
        const desk=desks.find(d=>d.id===state.seatedId);
        if(desk)rate=schoolConfig(state.seatedSchoolId)?.rate||0;
      }else if(state.mode==='driving'&&isOwned(state.selectedId)&&typeof distance==='number'&&Number.isFinite(distance)){
        const movement=Math.abs(distance);
        if(movement>=Math.max(PROGRESSION_CONFIG.movementEpsilon,PROGRESSION_CONFIG.minMovementSpeed*dt)&&movement<=PROGRESSION_CONFIG.maxMovementSpeed*dt+.002)rate=PROGRESSION_CONFIG.drivingRate;
      }
      const earned=Math.min(PROGRESSION_CONFIG.maxBrains-state.brains,rate*dt);
      if(earned<=0)return 0;
      state.brains+=earned;


      const whole=Math.round(state.brains);
      if(Math.abs(state.brains-whole)<1e-9)state.brains=whole;
      progressDirty=true;progressSinceSave+=dt;
      if(progressSinceSave>=PROGRESSION_CONFIG.saveInterval)persist();
      return earned;
    },
    buySkin(id){
      const spec=skinConfig(id),deny=reason=>{emit('skin-purchase-denied',{id,reason});return false;};
      if(!spec)return deny('unknown');
      if(premiumSkinIds.has(id))return deny('platform-purchase');
      if(isSkinOwned(id))return deny('owned');
      if(!canShop())return deny('unavailable');
      if(!nearSkin(id))return deny('distance');
      if(state.money<spec.price)return deny('funds');
      state.money-=spec.price;state.ownedSkinIds.push(id);state.skinPurchaseCandidateId=id;
      persist();emit('skin-purchase',{id,price:spec.price,money:state.money});return true;
    },
    buySchool(id){
      const spec=schoolConfig(id),deny=reason=>{emit('school-purchase-denied',{id,reason});return false;};
      if(!spec)return deny('unknown');
      if(isSchoolOwned(id))return deny('owned');
      if(!canShop())return deny('unavailable');
      if(!nearSchool(id))return deny('distance');
      if(state.money<spec.price)return deny('funds');
      state.money-=spec.price;state.ownedSchoolIds.push(id);state.schoolPurchaseCandidateId=id;
      persist();emit('school-purchase',{id,price:spec.price,money:state.money});return true;
    },
    grantPremiumSkin(id){
      if(!premiumSkinIds.has(id))return false;
      if(!isSkinOwned(id)){state.ownedSkinIds.push(id);persist();}
      return true;
    },
    reassignSeat(seatId){
      const desk=desks.find(d=>d.id===seatId);
      if(!state.seatedId||!desk)return false;
      state.seatedId=seatId;state.player={x:desk.seat.x,z:desk.seat.z,heading:desk.seat.heading};return true;
    },
    sitAtSchool(id,reservedSeatId=null){
      if(!canShop()||!isSchoolOwned(id)||!nearSchool(id))return false;
      const desk=reservedSeatId?desks.find(d=>d.id===reservedSeatId&&!state.occupiedSeatIds.includes(d.id)):resolveFreeClassroomSeat(desks,state.occupiedSeatIds);
      state.classroomArmed=false;state.interactionCooldown=1.2;state.walked=0;
      if(!desk){emit('classroom-full',{schoolId:id});return false;}
      clearShopPrompts();state.seatedId=desk.id;state.seatedSchoolId=id;
      state.player={x:desk.seat.x,z:desk.seat.z,heading:desk.seat.heading};
      emit('sit',{id:desk.id,schoolId:id,rate:schoolConfig(id).rate});return true;
    },
    buyUpgrade(stat){
      const id=state.selectedId,deny=reason=>{emit('upgrade-denied',{id,stat,reason});return false;};
      if(state.mode!=='driving'||!isOwned(id))return deny('unavailable');
      const offer=getUpgradeOffer(id,stat,state.upgrades[id]);
      if(!offer)return deny('unknown');
      if(offer.maxed)return deny('maxed');
      if(state.brains<offer.price)return deny('funds');


      state.brains-=offer.price;state.upgrades[id][stat]=offer.nextLevel;
      persist();emit('upgrade-purchase',{id,stat,level:offer.nextLevel,price:offer.price,brains:state.brains,before:offer.current,after:offer.next,currentPerformance:offer.currentPerformance,nextPerformance:offer.nextPerformance});return true;
    },
    claimVehicleFunds(){
      if(state.vehicleGrantClaimed){emit('vehicle-funds-denied',{reason:'claimed'});return false;}
      const needed=VEHICLE_CONFIG.reduce((sum,v)=>sum+(isOwned(v.id)||v.rewardOnly?0:v.price),0);
      const amount=Math.max(0,needed-state.money);
      state.vehicleGrantClaimed=true;state.money+=amount;
      state.retention.testCashGranted=Math.min(ECONOMY_CONFIG.maxSavedMoney,state.retention.testCashGranted+amount);
      persist();emit('vehicle-funds',{amount,money:state.money,testCashGranted:state.retention.testCashGranted,careerCashEarned:state.retention.careerCashEarned});return true;
    },
    jump(){if(state.mode!=='walking'||state.seatedId||state.jump.airborne)return false;state.jump.airborne=true;if(!canWalk(state.player.x,state.player.z)){resetJump();return false;}clearShopPrompts();Object.assign(state.jump,{height:0,velocity:GAMEPLAY.jumpSpeed,elapsed:0,airborne:true});state.interactionCooldown=Math.max(state.interactionCooldown,.25);emit('jump');return true;},
    setCharacter(id){if(!characterIds.has(id)||!isSkinOwned(id))return false;if(state.characterId!==id){state.characterId=id;persist();}return true;},
    buy(id){
      const vehicle=vehicles.find(v=>v.id===id),spec=VEHICLE_CONFIG.find(v=>v.id===id);
      const deny=reason=>{updatePurchase();emit('purchase-denied',{id,reason});return false;};
      if(!vehicle||!spec)return deny('unknown');
      if(isOwned(id))return deny('owned');
      if(spec.rewardOnly)return deny('reward-locked');
      if(state.mode!=='walking'||state.seatedId||state.jump.airborne||state.jump.height>0)return deny('unavailable');
      if(vehicleDistance(vehicle)>=vehicleEntryRadius(vehicle))return deny('distance');
      if(state.money<spec.price)return deny('funds');


      state.money-=spec.price;state.ownedVehicleIds.push(id);state.blockedEntry=id;
      if(state.retention.goalVehicleId===id)state.retention.goalVehicleId=null;
      state.walked=0;clearPurchase();persist();emit('purchase',{id,price:spec.price,money:state.money});return true;
    },
    setOccupiedSeatIds(ids){state.occupiedSeatIds=[...new Set(ids)].filter(id=>desks.some(d=>d.id===id));},
    stand(){
      if(!state.seatedId)return false;
      const target={...(schoolEntry(state.seatedSchoolId)||CLASSROOM_ENTRY).exit};
      if(!canWalk(target.x,target.z))return false;
      api.flushProgress();resetJump();clearShopPrompts();state.landingCooldown=0;state.player=target;state.seatedId=null;state.seatedSchoolId=null;state.classroomArmed=false;
      state.interactionCooldown=1.2;state.walked=0;emit('stand');return true;
    },
    events(){const e=events;events=[];return e;},
    returnToGarage(reason='garage') { if(reason!=='delivery')api.flushProgress();clearShopPrompts();state.run=null;runProgress=null;state.testMode=false;state.testBiome=null;resetJump();state.landingCooldown=0;state.mode='walking';state.selectedId=null;state.seatedId=null;state.seatedSchoolId=null;state.classroomArmed=true;state.blockedStand=null;state.interactionCooldown=1;state.doorNotified=false;state.player={...GAMEPLAY.spawn};state.cooldown=GAMEPLAY.exitCooldown;state.blockedEntry=null;state.walked=0;state.stationId=null;for(const v of vehicles)state.fuels[v.id]=fuelCapacity(v.id);emit('garage',{reason}); },
    enter(id) {
      if(state.mode!=='walking'||state.seatedId||state.jump.airborne||state.cooldown>0)return false;
      const v=vehicles.find(v=>v.id===id);if(!v||!isOwned(id))return false;
      clearShopPrompts();resetJump();state.landingCooldown=0;state.selectedId=id;state.mode='driving';state.stationId=null;state.testBiome=null;


      const preview=developerReward(id);state.testMode=preview;
      state.run=preview?null:{id:`${runtimeId}-${++runSequence}`,vehicleId:id,loaded:true};
      runProgress=preview?null:{runId:state.run.id,collisions:0,bridgeIds:new Set(),hardBranchIds:new Set(),route:{previous:null,startProgress:null,samples:0,bridgeIds:new Set()}};
      emit('enter',{id,runId:state.run?.id??null,...(preview?{developerPreview:true}:{})});return true;
    },
    beginBiomeTest(id){
      if(state.mode!=='driving'||!BIOME_SEQUENCE.some(b=>b.id===id))return false;


      state.testMode=true;state.testBiome=id;state.run=null;runProgress=null;state.stationId=null;
      emit('biome-test',{id});return true;
    },


    exit() { return false; },
    walk(dt,input={}) {dt=clamp(Number(dt)||0,0,.05);state.elapsed+=dt;state.cooldown=Math.max(0,state.cooldown-dt);state.interactionCooldown=Math.max(0,state.interactionCooldown-dt);state.landingCooldown=Math.max(0,state.landingCooldown-dt);if(state.mode!=='walking'){clearShopPrompts();return;}
      const airborneAtStart=state.jump.airborne;
      if(state.jump.airborne){const j=state.jump;j.height+=j.velocity*dt-.5*GAMEPLAY.gravity*dt*dt;j.velocity-=GAMEPLAY.gravity*dt;j.elapsed+=dt;
        if(j.height<=0&&j.velocity<0){resetJump();state.landingCooldown=.25;state.interactionCooldown=Math.max(state.interactionCooldown,.25);state.walked=0;emit('land');}
      }
      if(state.seatedId){clearShopPrompts();if(Math.hypot(input.x||0,input.z||0)>.15)api.stand();return;}
      const p=state.player,mag=Math.min(1,Math.hypot(input.x||0,input.z||0)),speed=(input.running?GAMEPLAY.runSpeed:GAMEPLAY.walkSpeed);
      if(mag>0){
        if(isInGarage(p.x,p.z)&&Math.abs(p.x)<GARAGE_LAYOUT.entranceHalfWidth&&p.z<GARAGE_LAYOUT.frontZ+2.5&&(input.z||0)<0&&!state.doorNotified){emit('door');state.doorNotified=true;}
        if(p.z>GARAGE_LAYOUT.frontZ+4)state.doorNotified=false;
        const length=Math.hypot(input.x,input.z),dx=input.x/Math.max(1,length)*speed*dt,dz=input.z/Math.max(1,length)*speed*dt;const before={x:p.x,z:p.z};
        if(canWalk(p.x+dx,p.z+dz)){p.x+=dx;p.z+=dz;}else {if(canWalk(p.x+dx,p.z))p.x+=dx;if(canWalk(p.x,p.z+dz))p.z+=dz;}
        state.walked+=Math.hypot(p.x-before.x,p.z-before.z);p.heading=Math.atan2(-input.x,-input.z);
      }
      if(state.blockedEntry){const v=vehicles.find(v=>v.id===state.blockedEntry);if(!v||vehicleDistance(v)>vehicleEntryRadius(v)+1)state.blockedEntry=null;}
      if(CLASSROOM_ENTRIES.every(entry=>Math.hypot(p.x-entry.x,p.z-entry.z)>entry.rearmRadius))state.classroomArmed=true;
      if(state.blockedStand!==null){const d=stands.find(d=>d.index===state.blockedStand);if(!d||Math.hypot(p.x-d.trigger.x,p.z-d.trigger.z)>3.3)state.blockedStand=null;}
      updatePurchase();updateShopPrompts();
      if(airborneAtStart||state.jump.airborne)return;
      if(mag>.02&&state.walked>.4&&state.interactionCooldown===0){
        const stand=stands.find(d=>d.index!==state.blockedStand&&Math.hypot(p.x-d.trigger.x,p.z-d.trigger.z)<d.triggerRadius);
        if(stand){
          const id=CHARACTER_CATALOG[stand.index]?.id;state.blockedStand=stand.index;state.interactionCooldown=1.2;
          if(isSkinOwned(id))emit('character',{id,index:stand.index});
          else if(skinConfig(id)){state.skinPurchaseCandidateId=id;const {price}=skinConfig(id);emit('skin-purchase-prompt',{id,index:stand.index,price,affordable:state.money>=price});}
          return;
        }
        const entry=CLASSROOM_ENTRIES.find(entry=>Math.hypot(p.x-entry.x,p.z-entry.z)<=entry.radius);
        if(state.classroomArmed&&entry){
          const id=entry.schoolId||entry.id;
          if(isSchoolOwned(id)){api.sitAtSchool(id);return;}
          state.classroomArmed=false;state.interactionCooldown=1.2;state.walked=0;state.schoolPurchaseCandidateId=id;
          const {price,rate}=schoolConfig(id);emit('school-purchase-prompt',{id,price,rate,affordable:state.money>=price});return;
        }

      }
      if(state.cooldown>0||state.interactionCooldown>0||state.walked<.4)return;
      const near=nearbyVehicle(state.blockedEntry);
      if(near&&isOwned(near.id))api.enter(near.id);
    },
    drive(distance,x,z) {
      if(state.mode!=='driving')return;
      clearPurchase();
      const id=state.selectedId,spec=vehicleConfig(id);


      const travelled=typeof distance==='number'&&Number.isFinite(distance)?Math.abs(distance):0;
      state.fuels[id]=Math.max(0,state.fuels[id]-travelled*spec.consumption*biomeSurfaceAt(Number.isFinite(x)&&Number.isFinite(z)?projectRoad(x,z).progress:0,id).fuelFactor);

      if(state.fuels[id]<=1e-9){api.returnToGarage('empty');return;}
      if(!Number.isFinite(x)||!Number.isFinite(z))return;
      const delivery=deliveries.find(d=>Number.isFinite(d.x)&&Number.isFinite(d.z)&&Number.isFinite(d.radius)&&d.radius>=0&&Number.isFinite(d.reward)&&d.reward>=0&&Math.hypot(x-d.x,z-d.z)<=d.radius);
      if(delivery&&!state.testMode&&state.run?.loaded){
        const runId=state.run.id;
        const checkpointId=checkpointIds.get(delivery.id)||null;
        const telemetry=runProgress?.runId===runId?runProgress:null;
        const finalDelivery=checkpointId===FINAL_DELIVERY_CHECKPOINT.id;
        if(finalDelivery&&!routeProofComplete(telemetry,x,z)){api.invalidateRun({runId});return;}


        state.run.loaded=false;
        const clean=!!telemetry&&telemetry.collisions===0;
        const hard=!!telemetry&&telemetry.hardBranchIds.size>0;
        const first=!!checkpointId&&!state.retention.claimedCheckpointIds.includes(checkpointId);
        const missionCompleted=advanceCareerMission(state.retention,{clean,hard,bridgeIds:telemetry?[...telemetry.bridgeIds]:[]});
        if(first)state.retention.claimedCheckpointIds.push(checkpointId);
        const breakdown=capDeliveryReward(calculateDeliveryReward(delivery.reward,{clean,hard,first,mission:missionCompleted}),
          ECONOMY_CONFIG.maxSavedMoney-state.money,PROGRESSION_CONFIG.maxBrains-state.brains);
        const reward=breakdown.totalCash;
        state.money+=reward;state.brains+=breakdown.brains.total;
        state.retention.careerCashEarned=Math.min(ECONOMY_CONFIG.maxSavedMoney,state.retention.careerCashEarned+reward);
        state.completedRuns=Math.min(ECONOMY_CONFIG.maxSavedMoney,state.completedRuns+1);
        let unlockedVehicleId=null;
        if(finalDelivery&&!state.routeCompletion){
          const route=telemetry.route;
          state.routeCompletion={version:1,proof:ROUTE_COMPLETION_PROOF,checkpointId,runId,
            startProgress:route.startProgress,endProgress:route.previous.progress,sampleCount:route.samples,
            bridgeIds:BRIDGES.filter(bridge=>bridge.to<FINAL_DELIVERY_CHECKPOINT.progress).map(bridge=>bridge.id)};
          rewardEarned=true;
          if(!state.ownedVehicleIds.includes(REWARD_VEHICLE_ID))state.ownedVehicleIds.push(REWARD_VEHICLE_ID);
          unlockedVehicleId=REWARD_VEHICLE_ID;
        }
        const saved=persist();
        emit('delivery',{id:delivery.id,checkpointId,reward,money:state.money,brains:state.brains,runId,distance:delivery.distance,
          unlockedVehicleId,routeCompleted:finalDelivery,breakdown,clean,hard,first,missionCompleted,mission:api.getCareerMission(),goal:api.getVehicleGoal(),saved:!developerSession&&!!persistence&&saved});
        if(unlockedVehicleId)emit('vehicle-unlocked',{id:unlockedVehicleId,reason:'full-route',runId,saved:!developerSession&&!!persistence&&saved});
        api.returnToGarage('delivery');return;
      }
      const station=stations.find(s=>Math.hypot(x-s.x,z-s.z)<=s.radius);
      if(station){const previous=state.stationId;state.stationId=station.id;const capacity=fuelCapacity(id);if(state.fuels[id]<capacity){state.fuels[id]=capacity;if(previous!==station.id)emit('refuel',{id:station.id});}}
      else if(state.stationId){const old=stations.find(s=>s.id===state.stationId);if(!old||Math.hypot(x-old.x,z-old.z)>old.radius+1.5)state.stationId=null;}
    },
  };
  if(loadFailed)warnSave();
  return api;
}
