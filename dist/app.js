import {createMusicMenu} from './music-menu.js';
import {updatePurchaseNotifications} from './purchase-notifications.js';
import {TYRE_CONFIG,ADVERTISING_INTERVAL_SECONDS} from './economy-balance.js';
import {createFleetNeon} from './vehicle-neon.js';
import {getVehicleNeon} from './vehicle-neon-catalog.js';
import {DEFAULT_VEHICLE_SMOKE_ID,getVehicleSmokeStyle} from './vehicle-smoke-catalog.js';
import {DEFAULT_VEHICLE_TRACK_ID,getVehicleTrackStyle} from './vehicle-track-catalog.js';
import {createFinishCelebration} from './finish-celebration.js';
import {createSpatialRenderer} from './spatial-render.js';
import {createRenderZones} from './render-zones.js';
import {createRenderProfiler} from './render-profiler.js';
import {createGpuTimer} from './gpu-timer.js';
import {createRenderQuality,isMobileRenderer} from './render-quality.js';
import {createDisplayQuality} from './display-quality.js';
import {createModelWarmup} from './model-warmup.js';
import {createStartupGate} from './startup-gate.js';
import {createProgressiveAssets} from './progressive-assets.js';
import {configureModelLoading} from './model-loader.js';
import {createLocalization} from './localization.js';
import {createSettingsMenu} from './settings-menu.js';
import {createVehicleAudio} from './vehicle-audio.js';
import {createBackgroundMusic} from './background-music.js';
import {MUSIC_TRACKS} from './music-catalog.js';
import {createSettingsMusic} from './settings-music.js';
import {projectLabelPixel,createViewportRectCache} from './world-label-projection.js';
import {createUiCache} from './ui-cache.js';
import {createFinishLine} from './finish-line.js';
import {vehicleFootprint} from './vehicle-contact.js';
import {attachCosmoGarage} from './cosmo-garage.js';
import {createRetentionUi} from './retention-ui.js';
import {createCareerRouteTracker,HARD_BRANCHES} from './career-route-tracker.js';
import {FORK_DEFINITIONS} from './route-network-config.js';
import {createPauseState} from './pause-state.js';
import {createOnlineSession} from './online-session.js';
import {createAdvertising,isAdvertisingSafe} from './advertising.js';
import {createVehicleLiveryShop} from './vehicle-livery-shop.js';
import {createVehicleLiveryController} from './vehicle-livery-materials.js';
import {getVehicleLivery} from './vehicle-livery-catalog.js';
import {createHangarDriftLeaderboard} from './hangar-drift-leaderboard.js';
import {createCanyonLeaderboard} from './canyon-leaderboard.js';
import {createCanyonMode} from './canyon-mode.js';
import {PREMIUM_SKIN_IDS} from './premium-skins.js';
import {SHADOW_LAYOUT,followShadowLight} from './scene-lighting.js';
import {createBiomeWeather} from './biome-weather.js';
import {BRIDGES} from './road-bridges.js';
import {initializeRapier} from './rapier-runtime.js';
import {createRapierDrivingModel} from './rapier-vehicle.js';
import {createPhysicsWorld} from './physics-world.js';
import {buildRoadPits,roadPitAt,roadPitRampHeight,roadPitRampBoost,roadPitReservations} from './road-pits.js';
import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { buildCity } from "./network-scene.js";
import { vehicleConfig, BIOME_SEQUENCE, ECONOMY_CONFIG } from "./economy-config.js";
import { createCareerStore } from "./career-save.js";
import { createGarageScene, GARAGE_LAYOUT, rewardDisplayPose } from "./garage-scene.js";
import { loadCharacter, createCharacterDisplay, CHARACTER_CATALOG } from "./character.js";
import { createWalkInput } from "./walk-input.js";
import { createJumpInput } from "./jump-input.js";
import { createFollowCameraState, computeFollowOffset, drivingCameraScale } from "./follow-camera.js";
import { createLookInput } from "./look-input.js";
import { createGameplay, garageRoadContact, parkedVehicleContact, isInGarage, GAMEPLAY } from "./gameplay.js";
import { createVehicleInput } from "./vehicle-input.js";
import { TOW_DRIVING } from "./driving-model.js";
import { projectRoad, routePointAtProgress } from "./road-layout.js";
import { roadGroundGradient, roadGroundSurface } from "./driving-ground.js";
import {
  fitTruckToGround,
  collectObstacles,
  getTruckContact,
  groundHeight,
} from "./city-driving.js";
import { BIOME_DESTINATIONS, safeBiomeDestination } from "./biome-travel.js";
import { createWheelParticles } from "./wheel-particles.js";
import { createRoadHazards } from "./road-hazards.js";
import { createRoadHazardsScene } from "./road-hazards-scene.js";
import { PROGRESSION_CONFIG, SCHOOL_CONFIG, SKIN_CONFIG, schoolConfig, skinConfig } from "./progression-config.js";
import { UPGRADE_STATS, getVehiclePerformance } from "./vehicle-upgrades.js";
import { updateProgressionHud, updateProgressionWorldLabels, WORLD_LABEL_DROP } from "./progression-hud.js";

async function startApplication(){
await initializeRapier();































const services=window.__urbanServices;
const driftLeaderboard=createCanyonLeaderboard({platform:services?.platform});
void driftLeaderboard.load();
const pauseState=services?.pause??createPauseState();
const vehicleAudio=createVehicleAudio();
let audioVolume=services?.settings?.audioVolume??1,lastAudibleVolume=services?.settings?.lastAudibleVolume??1,selectedLanguage=services?.settings?.language??'ru',settingsUi=null,musicUi=null;
vehicleAudio.setVolume?.(audioVolume);vehicleAudio.setMuted(audioVolume===0);
const backgroundMusic=createBackgroundMusic({tracks:MUSIC_TRACKS,volume:audioVolume});
backgroundMusic.setSuspended(true);
const localization=createLocalization(document,{language:selectedLanguage});
function setAudioVolume(value){
 audioVolume=Math.max(0,Math.min(1,Number(value)||0));if(audioVolume>0)lastAudibleVolume=audioVolume;
 vehicleAudio.setVolume?.(audioVolume);vehicleAudio.setMuted(audioVolume===0);backgroundMusic.setVolume(audioVolume);
 services?.cloud?.setSettings({audioVolume,lastAudibleVolume,language:selectedLanguage});
 settingsUi?.setVolume(audioVolume);syncAudioButton();
}
function syncAudioButton(){const button=document.getElementById('audio-toggle');button.setAttribute('aria-pressed',String(vehicleAudio.muted));button.setAttribute('aria-label',vehicleAudio.muted?'Включить звук':'Выключить звук');button.title=vehicleAudio.muted?'Включить звук':'Выключить звук';button.classList.toggle('muted',vehicleAudio.muted);localization?.refresh();}
function stopVehicleEffects(){vehicleAudio.stop();for(const v of garage?.vehicles||[])v.visual?.setBrakeLights?.(0);}
window.addEventListener('pointerdown',()=>{if(!vehicleAudio.muted)vehicleAudio.unlock();},{capture:true});
window.addEventListener('keydown',()=>{if(!vehicleAudio.muted)vehicleAudio.unlock();},{capture:true});
document.getElementById('audio-toggle').addEventListener('pointerdown',e=>e.stopPropagation());
document.getElementById('audio-toggle').addEventListener('click',e=>{e.stopPropagation();setAudioVolume(vehicleAudio.muted?lastAudibleVolume:0);if(!vehicleAudio.muted)vehicleAudio.unlock();});
syncAudioButton();
const careerRouteTracker=createCareerRouteTracker();































const memoryRecords=new Map();
const careerStore=services?.cloud?.store??createCareerStore({storage:{getItem:key=>memoryRecords.get(key)??null,setItem:(key,value)=>memoryRecords.set(key,value)}});

const devQuery=new URLSearchParams(window.location?.search||'').get('dev');
const devServer=typeof __URBAN_DEV_SERVER__!=='undefined'&&__URBAN_DEV_SERVER__===true;
const renderQuery=new URLSearchParams(window.location?.search||'');
const renderDiagnosticsAllowed=devServer&&(!services||services.development!==false);
const baselineRendering=renderDiagnosticsAllowed&&renderQuery.get('render')==='baseline';
const developerMode=(!services||services.development)&&(devQuery==='1'||devServer&&devQuery!=='0');
const renderProfiler=createRenderProfiler({document,enabled:renderDiagnosticsAllowed&&renderQuery.get('perf')!=='0'&&(developerMode||renderQuery.get('perf')==='1'),baseline:baselineRendering,onReset:()=>gpuTimer.reset()});
document.body.classList.toggle('developer-mode',developerMode);
const viewport = document.getElementById("viewport");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x329dff);
scene.fog = new THREE.Fog(0x329dff, 500, 1600);
const camera = new THREE.PerspectiveCamera(
  53,
  innerWidth / innerHeight,
  0.5,
  1800,
);
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance",
});
configureModelLoading(renderer);
const rendererNavigator=globalThis.navigator??{};
const renderQuality=createRenderQuality({devicePixelRatio,
  mobile:isMobileRenderer({userAgent:rendererNavigator.userAgent,userAgentData:rendererNavigator.userAgentData,
    maxTouchPoints:rendererNavigator.maxTouchPoints,coarsePointer:window.matchMedia?.('(pointer: coarse)').matches??false}),
  mode:renderDiagnosticsAllowed?(renderQuery.get('quality')||'auto'):'auto'});
let qualityProfile=renderQuality.profile,previousQualityNow=null;
const gpuTimer=createGpuTimer(renderer.getContext?.(),{enabled:renderQuality.profile.adaptive||!!renderProfiler});
const displayQuality=createDisplayQuality(THREE);
let modelWarmup=createModelWarmup({renderer,scene,camera,schedule:requestAnimationFrame});
renderer.setSize(innerWidth, innerHeight,false);
renderer.setPixelRatio(qualityProfile.pixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
viewport.appendChild(renderer.domElement);
renderer.domElement.setAttribute(
  "aria-label",
  "3D город. Перетаскивайте, чтобы повернуть камеру.",
);
renderer.domElement.setAttribute("tabindex", "0");
const ambient = new THREE.HemisphereLight(0xffffff, 0xb4c0c9, 1.6);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(qualityProfile.shadowSize,qualityProfile.shadowSize);
Object.assign(sun.shadow.camera,{left:-SHADOW_LAYOUT.halfExtent,right:SHADOW_LAYOUT.halfExtent,top:SHADOW_LAYOUT.halfExtent,bottom:-SHADOW_LAYOUT.halfExtent,near:SHADOW_LAYOUT.near,far:SHADOW_LAYOUT.far});
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.normalBias=SHADOW_LAYOUT.normalBias;sun.shadow.bias=SHADOW_LAYOUT.bias;
followShadowLight(sun,{x:0,y:0,z:GARAGE_LAYOUT.spawn.z});
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xc3e4ff, 0.55);
fill.position.set(40, 25, -20);
scene.add(fill);
const garageFill=new THREE.PointLight(0xf0f5ff,280,70,2);
garageFill.position.set(0,12,GARAGE_LAYOUT.spawn.z);scene.add(garageFill);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 7;
controls.maxDistance = 16000;
controls.autoRotateSpeed = 0.48;
controls.target.set(1, 6, -20);
controls.screenSpacePanning = true;
const viewPresets = {
  street: { p: [10, 32, 40], t: [1, 9, -25], label: "УЛИЦА" },
  overview: { p: [1800, 3800, 700], t: [0, 8, -2650], label: "ДИОРАМА" },
  delivery: { p: [190, 230, -950], t: [0, 8, -1350], label: "ЛЕС / ПУСТЫНЯ" },
  fuel: { p: [190, 230, -3700], t: [0, 12, -4100], label: "СНЕГ / ВУЛКАН" },
};
let city,
  rig,
  model,
  inputController,
  obstacles = [],
  driving = false,
  playing = true,
  finishLine, finishCelebration, pendingFinishReceipt=null, garage, gameplay, character, walkInput, jumpInput, lookInput, wheelParticles, roadHazards, roadHazardsScene, biomeWeather,
  biomeMenuOpen=false, upgradeMenuOpen=false, careerMenuOpen=false, settingsMenuOpen=false, hangarLeaderboardOpen=false, liveryShopOpen=false, appFocused=true,
  characterReady = false,
  characterRequest = 0, displayGeneration = 0, characterDisplays = [],
  displayLoading = null, lastDisplayUpdate = -Infinity, vehicleEntryRequest = 0,
  lastTime = 0,
  graphicsLost = false;
let liveryShop=null;
// Keep session cosmetics outside the rebuilt world, like the shop controller.
let selectedSmokeId=DEFAULT_VEHICLE_SMOKE_ID;
let selectedTrackId=DEFAULT_VEHICLE_TRACK_ID;
const selectedDeveloperLiveries=new Map(),developerLiveryControllers=new Map(),developerLiveryRequests=new Map();
let developerLiveryGeneration=0,developerLiveryRequest=0;
const selectedFleetNeonId=()=>gameplay?.state.selectedNeonId;
function developerLiveryController(visual,vehicleId){
 let entry=developerLiveryControllers.get(vehicleId);
 if(entry?.visual===visual)return entry;
 entry?.controller.restore();entry?.controller.dispose();
 entry={visual,controller:createVehicleLiveryController(THREE,visual,vehicleId,{beforePrepare:()=>displayQuality.clear()}),pending:false};
 developerLiveryControllers.set(vehicleId,entry);return entry;
}
function syncDeveloperLivery(visual,vehicleId){
 if(!visual||(!vehicleConfig(vehicleId).rewardOnly&&!gameplay.isOwned(vehicleId))||!selectedDeveloperLiveries.has(vehicleId)||developerLiveryControllers.get(vehicleId)?.visual===visual)return;
 const entry=developerLiveryController(visual,vehicleId);
 void entry.controller.preview(selectedDeveloperLiveries.get(vehicleId)).catch(error=>console.warn('Developer livery could not load',error));
}
function restoreDeveloperLiveryApplication(id,entry){
 if(!entry?.pending)return;
 entry.pending=false;entry.controller.restore();
 const selected=selectedDeveloperLiveries.get(id);
 if(selected)void entry.controller.preview(selected).catch(error=>console.warn('Developer livery could not restore',error));
}
function cancelDeveloperLiveryApplications(){
 developerLiveryGeneration++;developerLiveryRequests.clear();
 for(const [id,entry]of developerLiveryControllers)restoreDeveloperLiveryApplication(id,entry);
}
function disposeDeveloperLiveries(){
 developerLiveryGeneration++;developerLiveryRequests.clear();
 for(const entry of developerLiveryControllers.values()){entry.controller.restore();entry.controller.dispose();}
 developerLiveryControllers.clear();
}
const fleetNeon=createFleetNeon(THREE);
function parkedNeonSupport(vehicle){return vehicle.neonSupport??={groundPlane:{point:{x:vehicle.park.x,y:vehicle.pedestal?.topY??groundHeight(vehicle.park.x,vehicle.park.z),z:vehicle.park.z},normal:{x:0,y:1,z:0}}};}
function syncFleetNeon(){if(!gameplay||!garage)return;fleetNeon.setColor(selectedFleetNeonId());for(const vehicle of garage.vehicles){vehicle.visual?.setLocked?.(!gameplay.isOwned(vehicle.id));fleetNeon.attach(vehicle.visual,driving&&vehicle.model===model?vehicle.model.state:parkedNeonSupport(vehicle));syncDeveloperLivery(vehicle.visual,vehicle.id);}}
function syncPremiumNeon(){if(!gameplay)return;for(const id of services?.neon?.ownedIds||[])gameplay.grantPremiumNeon(id);liveryShop?.refresh();}
let physicsWorld=null,overturnedSeconds=0;
let roadPits=[];
let fallenSeconds=0;
let hangarLeaderboardUi=null,canyonMode=null,onlineSession=null,advertising=null,spatialRenderer=null,renderZones=null,teleportId=0,onlineClock=0,lastWalkSpeed=0,disposedOnline=false,lastEconomyFrame=-Infinity;
const gameplayPaused=()=>pauseState.paused||!appFocused||document.hidden||graphicsLost||!playing||biomeMenuOpen||upgradeMenuOpen||careerMenuOpen||settingsMenuOpen||hangarLeaderboardOpen||liveryShopOpen;
pauseState.subscribe(paused=>{syncBackgroundMusic();if(paused){physicsWorld?.resetTime();canyonMode?.pause();stopVehicleEffects();inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();}lastTime=0;onlineClock=0;advertising?.setSuspended(gameplay.state.eventMode==='finish'||!!canyonMode?.active||document.hidden||!appFocused||graphicsLost||pauseState.reasons.has('platform')||(pauseState.reasons.has('payment')||pauseState.reasons.has('neon-payment')));onlineSession?.update(0);});
const startup=createStartupGate({
  onReady(){
    lastTime=0;inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();
    document.body.classList.remove('is-loading');document.getElementById('loading').hidden=true;
    document.getElementById('audio-toggle').hidden=false;syncMode(true);
    updateHangarAssets(performance.now());
    syncBackgroundMusic();services?.platform.ready();onlineSession?.start();
  },
  onError(error){
    lastTime=0;stopVehicleEffects();syncBackgroundMusic();syncMode();
    document.getElementById('loading').hidden=true;document.getElementById('error').hidden=false;
    document.getElementById('error-text').textContent='Не удалось полностью загрузить мир. Проверьте соединение и нажмите «Повторить».';
    console.error('World startup failed',error);
  },
});
// Settings pause driving; music follows only platform, page and renderer interruptions.
function syncBackgroundMusic(){backgroundMusic.setSuspended(pauseState.paused||!appFocused||document.hidden||graphicsLost||!startup.ready);}
syncBackgroundMusic();
for(const type of ['pointerdown','click','keydown'])window.addEventListener(type,event=>{
  if((!startup.ready||pauseState.paused)&&!event.target?.closest?.('#error')){event.preventDefault();event.stopImmediatePropagation?.();}
},{capture:true});
const cameraState=createFollowCameraState({mode:'walking',heading:0});
const desiredCamera = new THREE.Vector3(),
  desiredTarget = new THREE.Vector3(),
  shadowView = new THREE.Vector3(),
  worldUp = new THREE.Vector3(0, 1, 0);
let wire = false,
  transition = null,
  dragging = false;
function view(name, instant = false) {
  if(!developerMode||settingsMenuOpen||hangarLeaderboardOpen||liveryShopOpen||gameplay?.state.eventMode==='finish')return false;
  const preset = viewPresets[name];
  if (!preset) return;
  if (playing) setDriving(false, false);
  const p = new THREE.Vector3(...preset.p),
    t = new THREE.Vector3(...preset.t);
  camera.near=5;camera.far=18000;scene.fog.near=10000;scene.fog.far=18000;
  if(name==='overview'&&city){
    const bounds=city.group.getObjectByName('Continuous 30m-wide road').geometry.boundingBox;
    const back=p.clone().sub(t).normalize(),right=new THREE.Vector3().crossVectors(worldUp,back).normalize(),up=new THREE.Vector3().crossVectors(back,right);
    const vertical=Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*.88,horizontal=vertical*Math.max(.1,innerWidth/innerHeight);
    let distance=0;
    for(const x of[bounds.min.x-130,bounds.max.x+130])for(const y of[bounds.min.y,bounds.max.y+70])for(const z of[bounds.min.z-130,bounds.max.z+130]){
      const delta=new THREE.Vector3(x,y,z).sub(t);
      distance=Math.max(distance,delta.dot(back)+Math.max(Math.abs(delta.dot(right))/horizontal,Math.abs(delta.dot(up))/vertical));
    }
    p.copy(t).addScaledVector(back,distance);
    const diagonal=bounds.getSize(new THREE.Vector3()).length()+400;
    camera.near=Math.max(5,distance/1000);camera.far=distance+diagonal*2;
    scene.fog.near=camera.far*.9;scene.fog.far=camera.far;
    controls.maxDistance=Math.max(16000,distance*2);

  }
  camera.updateProjectionMatrix();
  if (instant || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    camera.position.copy(p);
    controls.target.copy(t);
    transition = null;
  } else
    transition = {
      fromP: camera.position.clone(),
      fromT: controls.target.clone(),
      toP: p,
      toT: t,
      start: performance.now(),
    };
  document.querySelectorAll("[data-view]").forEach((b) => {
    const active = b.dataset.view === name;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", String(active));
  });
  document.getElementById("view-name").textContent = preset.label;
  controls.update();
}
function setWire(value) {
  wire = value;
  city.group.traverse((o) => {
    if (o.isMesh) o.material.wireframe = value;
  });
  document.getElementById("wire").setAttribute("aria-pressed", String(value));
}
function rebuild(value) {
  cancelVehicleEntry();
  displayQuality.clear();modelWarmup.dispose();modelWarmup=createModelWarmup({renderer,scene,camera,schedule:requestAnimationFrame});
  liveryShop?.close();
  disposeDeveloperLiveries();
  renderZones?.dispose();renderZones=null;lastEconomyFrame=-Infinity;
  spatialRenderer?.dispose();spatialRenderer=null;
  const seed = developerMode ? Math.max(1, Math.min(4294967295, Number(value) || 42)) >>> 0 : 42;
  for(const v of garage?.vehicles||[])v.model?.dispose?.();
  physicsWorld?.dispose();physicsWorld=null;
  canyonMode?.dispose();canyonMode=null;
  inputController?.reset();
  biomeMenuOpen=false;upgradeMenuOpen=false;document.getElementById("biome-menu").hidden=true;document.getElementById("upgrade-menu").hidden=true;
  if(biomeWeather){biomeWeather.dispose();}
  if(wheelParticles){scene.remove(wheelParticles.mesh);wheelParticles.dispose();}
  if(roadHazardsScene){scene.remove(roadHazardsScene.group);roadHazardsScene.dispose();}
  walkInput?.reset();jumpInput?.reset();lookInput?.reset();
  const nextPits=buildRoadPits(seed);
  const next = buildCity(THREE, { seed,roadPits:nextPits });
  gameplay?.flushProgress();
  const previousCareer=gameplay?.snapshot();
  displayGeneration++;
  characterRequest++;characterReady=!!character;displayLoading?.dispose();displayLoading=null;
  for(const d of characterDisplays){scene.remove(d.group);d.dispose();}characterDisplays=[];
  if (city) {
    scene.remove(garage?.group);
    finishLine?.dispose();finishCelebration?.dispose();pendingFinishReceipt=null;
    fleetNeon.clear();garage?.dispose();
    scene.remove(city.group);
    city.dispose();
  }
  city = next;
  roadPits=nextPits;


  const roadBounds=city.group.getObjectByName('Continuous 30m-wide road').geometry;
  roadBounds.computeBoundingBox();
  const box=roadBounds.boundingBox,centre=box.getCenter(new THREE.Vector3()),span=box.getSize(new THREE.Vector3()),extent=Math.max(span.x,span.z);
  viewPresets.overview={p:[centre.x+extent*.28,extent*.94,centre.z+extent*.45],t:[centre.x,8,centre.z],label:'ДИОРАМА'};
  for(const [name,q,label]of [['delivery',3980,'ЛЕС / ПУСТЫНЯ'],['fuel',8380,'СНЕГ / ВУЛКАН']]){const p=routePointAtProgress(q);viewPresets[name]={p:[p.x+190,p.height+230,p.z+200],t:[p.x,p.height+8,p.z],label};}
  scene.add(city.group);
  finishLine=createFinishLine(THREE);scene.add(finishLine.group);
  finishCelebration=createFinishCelebration(THREE);scene.add(finishCelebration.group);
  biomeWeather=createBiomeWeather(THREE);scene.add(biomeWeather.group);
  wheelParticles=createWheelParticles(THREE,{groundHeight});scene.add(wheelParticles.mesh);
  obstacles = collectObstacles(THREE, city);
  roadHazards=createRoadHazards(seed,{reservedIntervals:roadPitReservations(roadPits)});
  roadHazardsScene=createRoadHazardsScene(THREE,{system:roadHazards,groundHeight});
  scene.add(roadHazardsScene.group);
  garage = createGarageScene(THREE, city, {document});
  attachCosmoGarage(THREE,garage,{autoLoad:false,concurrency:1,prepare:(adapter,id)=>{
    adapter.setLocked?.(!gameplay?.isOwned(id));return modelWarmup.prepare(adapter.group);
  }});
  scene.add(garage.group);
  gameplay = createGameplay({vehicles:garage.vehicles,stations:garage.stations,deliveries:garage.deliveries,desks:garage.desks,stands:garage.stands,solids:garage.walkingSolids||garage.classroomSolids,career:previousCareer??services?.initialCareer??(developerMode?careerStore.load():undefined),persistence:developerMode?undefined:careerStore,developerMode,hardBranches:HARD_BRANCHES,walkable:(x,z,radius)=>!roadPitAt(roadPits,x,z,radius)});
  if(developerMode&&!previousCareer){
    gameplay.state.brains=Math.min(PROGRESSION_CONFIG.maxBrains,gameplay.state.brains+10_000_000);
    const amount=Math.min(1_000_000,ECONOMY_CONFIG.maxSavedMoney-gameplay.state.money);
    gameplay.state.money+=amount;
    gameplay.state.retention.testCashGranted=Math.min(ECONOMY_CONFIG.maxSavedMoney,gameplay.state.retention.testCashGranted+amount);
  }
  selectedSmokeId=gameplay.state.cosmetics.smoke;
  selectedTrackId=gameplay.state.cosmetics.tracks;
  selectedDeveloperLiveries.clear();
  for(const [id,livery]of Object.entries(gameplay.state.cosmetics.liveries))selectedDeveloperLiveries.set(id,livery);
  onlineSession?.bindGameplay(gameplay);
  canyonMode=createCanyonMode(THREE,{scene,document,platform:services?.platform,leaderboard:driftLeaderboard,language:()=>selectedLanguage,
    getContext:()=>({garage,gameplay,city,finishLine,roadHazardsScene,biomeWeather,model,rig,driving,online:onlineSession}),
    onEnter:()=>{careerRouteTracker.reset();wheelParticles?.clear();updateEconomyHud();},
    onExit:()=>{careerRouteTracker.reset();updateEconomyHud();},onTimeout:()=>returnToGarage('canyon-timeout')});
  canyonMode.effects.setSmokeStyle(selectedSmokeId);
  canyonMode.effects.setTrackStyle(selectedTrackId);
  canyonMode.clouds.setQuality(qualityProfile);
  biomeWeather.setQuality(qualityProfile);canyonMode.effects.setQuality({smokeScale:qualityProfile.weatherScale});
  physicsWorld=createPhysicsWorld({THREE,city,garage,canyon:canyonMode,roadHazards});
  for(const vehicle of garage.vehicles){
    const parkPose=fitTruckToGround(THREE,vehicle.park.x,vehicle.park.z,vehicle.park.heading,null,vehicle.visual?.metadata);
    vehicle.model=createRapierDrivingModel({
      world:physicsWorld.world,...vehicle.park,y:parkPose.position.y,maxSpeed:vehicleConfig(vehicle.id).maxSpeed,
      vehicleId:vehicle.id,getUpgrades:()=>gameplay.state.upgrades[vehicle.id],
      getVehicleMetadata:()=>vehicle.visual?.metadata,
      getRampBoost:(x,z)=>roadPitRampBoost(roadPits,x,z),
      getSurfaceHazard:(x,z,margin)=>canyonMode?.active?null:roadHazards.patchAt(x,z,margin),
      onSurfaceHazard:()=>{if(driving&&gameplay.state.selectedId===vehicle.id)gameplay.applyRoadHazardPenalty(.1);},
      groundSurface:(x,z,id)=>canyonMode?.surface(x,z,8)?canyonMode.groundSurface():roadHazards.surfaceAt(x,z,roadGroundSurface(x,z,id,vehicle.routeContext,gameplay.state.tyreTier)),
      onCollision:()=>{if(driving&&gameplay.state.selectedId===vehicle.id)gameplay.recordRunCollision({runId:gameplay.state.run?.id});},
    });
    vehicle.model.setEnabled(false);vehicle.position=vehicle.model.state;poseVehicle(vehicle);
  }
  rig=garage.vehicles[0].rig;model=garage.vehicles[0].model;
  gameplay.returnToGarage('start');gameplay.events();
  displayLoading=createDisplayLoading(garage.stands,displayGeneration);lastDisplayUpdate=-Infinity;
  playing=true;driving=false;
  if(!baselineRendering){
    spatialRenderer=createSpatialRenderer(THREE,{roots:[city.group,canyonMode.environment.group]});
    renderZones=createRenderZones(THREE);
    renderZones.register(city.group);
    renderZones.register(canyonMode.environment.group);
    renderZones.register(garage.hangar,{margin:2});
    // Models arrive asynchronously. Conservative local boxes follow the current
    // rig transform, including the selected vehicle away from its parking bay.
    for(const vehicle of garage.vehicles){
      const record=renderZones.register(vehicle.root,{box:new THREE.Box3(new THREE.Vector3(-15,-5,-15),new THREE.Vector3(15,15,15)),margin:2});
      record.castShadow=true;
    }
    for(const station of [...garage.stations,...garage.deliveries])renderZones.register(station.group,{margin:2});
    for(const display of characterDisplays)registerDisplayZone(display);
  }
  inputController?.setGear("D");
  syncMode(true);
  document.getElementById("seed").value = seed;
  setWire(wire);
  document.getElementById("metrics").textContent =
    `${Math.round(city.stats.triangles / 1000)}K + ГАРАЖ / 5 БИОМОВ`;
  window.__sceneDebug = {
    scene,
    camera,
    renderer,
    controls,
    city,
    get roadPits(){return roadPits;},
    get spatialRenderer(){return spatialRenderer;},
    get renderZones(){return renderZones;},renderScene,
    renderProfiler,gpuTimer,renderQuality,displayQuality,
    finishCelebration, vehicleAudio, backgroundMusic, settingsUi, localization, get settingsMenuOpen(){return settingsMenuOpen}, get hangarLeaderboardOpen(){return hangarLeaderboardOpen},get hangarLeaderboardUi(){return hangarLeaderboardUi}, developerMode, get rig(){return rig}, get model(){return model}, obstacles,
    get garage(){return garage}, get gameplay(){return gameplay},
    get startup(){return startup}, get character(){return character}, get characterReady(){return characterReady},
    get physics(){return physicsWorld},get canyon(){return canyonMode},get driftLeaderboard(){return driftLeaderboard},get online(){return onlineSession},get advertising(){return advertising},pauseState,
    get input(){return inputController}, get walkInput(){return walkInput}, get lookInput(){return lookInput}, cameraState, requestJump,
    get driving(){return driving}, get playing(){return playing},
    get biomeMenuOpen(){return biomeMenuOpen}, get wheelParticles(){return wheelParticles}, get roadHazards(){return roadHazards}, get roadHazardsScene(){return roadHazardsScene}, get biomeWeather(){return biomeWeather}, setBiomeMenu, travelToBiome,
    enterVehicle, returnToGarage, followTruck, followCharacter, applyTruckPose,
    rebuild, setDriving, selectCharacter, standCharacter, setUpgradeMenu, get careerMenuOpen(){return careerMenuOpen}, get upgradeMenuOpen(){return upgradeMenuOpen}, get appFocused(){return appFocused}, get characterDisplays(){return characterDisplays},

  };
}
function poseVehicle(vehicle) {
  if(vehicle.rewardDisplay && gameplay?.state.selectedId!==vehicle.id){
    const pose=rewardDisplayPose(THREE,vehicle,0);
    vehicle.rig.update({...pose,steerAngle:0,wheelSpin:0,bodyPitch:0,bodyRoll:0,bodyBob:0});return;
  }
  const state=vehicle.model.state;
  vehicle.routeContext=projectRoad(state.x,state.z,vehicle.routeContext);state.routeContext=vehicle.routeContext;
  const pose=fitTruckToGround(THREE,state.x,state.z,state.heading,vehicle.routeContext,vehicle.visual?.metadata);
  vehicle.rig.update({position:pose.position,quaternion:pose.quaternion,steerAngle:state.frontWheelAngle,wheelSpin:state.wheelSpin,bodyPitch:-state.bodyPitch,bodyRoll:-state.bodyRoll,bodyBob:state.bodyBob});
}
function applyTruckPose() {
  const state = model.state,vehicle=garage.vehicles.find(v=>v.model===model);
  const rendered=model.getRenderState(physicsWorld?.alpha??1);
  if(!canyonMode?.surface(state.x,state.z,8)){vehicle.routeContext=projectRoad(state.x,state.z,vehicle.routeContext);state.routeContext=vehicle.routeContext;}
  rig.update({
    position:new THREE.Vector3(rendered.x,rendered.y,rendered.z),
    quaternion:new THREE.Quaternion(rendered.quaternion.x,rendered.quaternion.y,rendered.quaternion.z,rendered.quaternion.w),
    steerAngle:rendered.frontWheelAngle,wheelSpin:rendered.wheelSpin,
    wheelContacts:state.wheelContacts,
    bodyPitch:0,bodyRoll:0,bodyBob:0,
  });
  document.getElementById("speed-value").textContent = String(
    Math.round(state.linearSpeed * 3.6),
  );
  document.getElementById("drive-status").textContent = state.blocked
    ? "СТОП"
    : "";
  const data = document.body.dataset;
  data.vehicleSpeed = state.speed.toFixed(3);
  data.vehicleGear = state.gear;
  data.vehicleThrottle = String(state.active);
  data.vehicleTurn = state.frontWheelAngle.toFixed(3);
  data.wheelRotation = state.wheelSpin.toFixed(3);
  data.vehicleWallBlocked = String(state.blocked);
  const biome = canyonMode?.active?{id:'canyon',name:'Каньон'}:city.biomeAt?.(state.x, -state.z);
  updateFuelHud();
  const biomeLabel = document.getElementById("biome-name");
  if (biomeLabel) biomeLabel.textContent = biome?.name || biome?.label || "Город";
  data.biome = biome?.id || "city";
}


const smoothedCameraTarget=new THREE.Vector3();
const previousTruckTarget=new THREE.Vector3();
let followedModel,previousTruckHeading=0;
let renderedCameraScale=1;
function followTruck(dt,snap=false,distance=0){
  const rendered=model.getRenderState(physicsWorld?.alpha??1);
  const turn=rendered.heading-previousTruckHeading;
  // A rendered translation or spin can continue between fixed physics ticks.
  const moving=!snap&&dt>0&&dt<=TOW_DRIVING.maxDelta&&followedModel===model&&
    (previousTruckTarget.distanceToSquared(rig.root.position)>1e-12||Math.abs(Math.atan2(Math.sin(turn),Math.cos(turn)))>1e-9);
  previousTruckTarget.copy(rig.root.position);previousTruckHeading=rendered.heading;followedModel=model;
  if(snap)cameraState.reset({mode:'driving',heading:rendered.heading});
  cameraState.update({dt,heading:rendered.heading,distance,moving,drifting:rendered.driftIntensity>.15,velocityX:rendered.velocityX,velocityZ:rendered.velocityZ});
  const offset=computeFollowOffset(cameraState.state);
  const scale=drivingCameraScale(camera.aspect);
  desiredTarget.copy(rig.root.position);desiredTarget.y+=1.7;
  desiredCamera.set(offset.x*scale,offset.y*scale,offset.z*scale).add(desiredTarget);


  const blend=snap?1:1-Math.exp(-7*Math.max(0,dt));
  smoothedCameraTarget.lerp(desiredTarget,blend);
  camera.position.set(offset.x*scale,offset.y*scale,offset.z*scale).add(smoothedCameraTarget);
  camera.lookAt(smoothedCameraTarget);
  controls.target.copy(smoothedCameraTarget);renderedCameraScale=scale;
}

const retentionUi=createRetentionUi(document,{onOpenChange:open=>{if(open)canyonMode?.pause();careerMenuOpen=!!open;inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();model?.pause();gameplay?.flushProgress();lastTime=0;syncMode();},onSelectGoal:id=>{gameplay?.setVehicleGoal(id);updateEconomyHud();},onSkipMission:()=>{gameplay?.skipMission();updateEconomyHud();}});

// Settings and the music window share the existing preferences pause gate.
function onPreferencesOpenChange(open){
  settingsMenuOpen=!!open;transition=null;
  if(open){liveryShop?.close();hangarLeaderboardUi?.close({restoreFocus:false});canyonMode?.pause();retentionUi.close();biomeMenuOpen=false;upgradeMenuOpen=false;}
  inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();model?.pause();stopVehicleEffects();gameplay?.flushProgress();lastTime=0;syncMode();
}
settingsUi=createSettingsMenu(document,{volume:audioVolume,language:selectedLanguage,
 onOpenChange:open=>{
  if(open)musicUi?.close({restoreFocus:false});
  onPreferencesOpenChange(open);
 },
 onVolumeChange:value=>setAudioVolume(value),
 onLanguageChange:value=>{selectedLanguage=value==='en'?'en':'ru';localization.setLanguage(selectedLanguage);settingsMusic.setLanguage(selectedLanguage);musicUi.setLanguage(selectedLanguage);canyonMode?.entrance.refreshSign();hangarLeaderboardUi?.refresh();liveryShop?.refresh();services?.cloud?.setSettings({audioVolume,lastAudibleVolume,language:selectedLanguage});}
});
musicUi=createMusicMenu(document,{canOpen:()=>startup.ready&&!pauseState.paused,onOpenChange:open=>{if(open)settingsUi.close({restoreFocus:false});onPreferencesOpenChange(open);}});
musicUi.setLanguage(selectedLanguage);
const settingsMusic=createSettingsMusic(document,{music:backgroundMusic,tracks:MUSIC_TRACKS,language:selectedLanguage,canControl:()=>musicUi.isOpen()&&!pauseState.paused&&startup.ready});
function hangarLeaderboardAvailable(){
 return startup.ready&&characterReady&&playing&&!graphicsLost&&!canyonMode?.active&&gameplay?.state.mode==='walking'&&gameplay.state.eventMode!=='finish'&&isInGarage(gameplay.state.player.x,gameplay.state.player.z);
}
hangarLeaderboardUi=createHangarDriftLeaderboard(document,{platform:services?.platform,leaderboard:driftLeaderboard,language:()=>selectedLanguage,
 canOpen:()=>hangarLeaderboardAvailable()&&!liveryShopOpen&&!settingsMenuOpen&&!careerMenuOpen&&!biomeMenuOpen&&!upgradeMenuOpen&&!pauseState.paused,
 onOpenChange:open=>{
  hangarLeaderboardOpen=!!open;transition=null;
  inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();model?.pause();stopVehicleEffects();gameplay?.flushProgress();lastTime=0;syncMode();
 }
});
liveryShop=createVehicleLiveryShop(document,{
 button:document.getElementById('livery-shop-button'),language:()=>selectedLanguage,autoPreview:true,
 canUseLiveries:()=>true,
 getSelectedLiveryId:id=>gameplay?.state.cosmetics.liveries[id]||'base',
 getSelectedNeonId:()=>selectedFleetNeonId(),
 canUseSmoke:()=>true,
 canUseTracks:()=>true,
 getSelectedSmokeId:()=>selectedSmokeId,
 getSelectedTrackId:()=>selectedTrackId,
 getCosmeticOffer(type,id,vehicleId){
  const offer=gameplay?.getCosmeticOffer(type,id,vehicleId);if(!offer||!offer.premium||offer.owned)return offer;
  const product=services?.liveries?.catalog.get(offer.key);let currencyImage=null;
  try{currencyImage=product?.getPriceCurrencyImage?.('small');}catch{}
  const label=product?.price||(product?.priceValue?`${product.priceValue}${currencyImage?'':` ${product.priceCurrencyCode||'₽'}`}`:'39 ₽');
  return {...offer,label,currencyImage,disabled:offer.disabled||!product||!!services?.liveries?.status.busy};
 },
 async onTrackApply(id){
  if(!liveryShopOpen||!hangarLeaderboardAvailable())return false;
  const current=gameplay,offer=current.getCosmeticOffer('tracks',id);if(!offer||offer.disabled)return false;
  if(offer.premium&&!offer.owned){
   const paid=await services?.liveries?.purchase(offer.key);if(!paid)return false;
   current.grantPremiumCosmetic(offer.key);
  }
  if(gameplay!==current||!liveryShopOpen||!hangarLeaderboardAvailable()||!current.buyCosmetic('tracks',id))return false;
  selectedTrackId=id;canyonMode.effects.setTrackStyle(id);updateEconomyHud();return true;
 },
 onSmokeApply(id){
  if(!liveryShopOpen||!hangarLeaderboardAvailable()||!gameplay.buyCosmetic('smoke',id))return false;
  selectedSmokeId=id;canyonMode.effects.setSmokeStyle(id);updateEconomyHud();return true;
 },
 canOpen:()=>hangarLeaderboardAvailable()&&!settingsMenuOpen&&!careerMenuOpen&&!biomeMenuOpen&&!upgradeMenuOpen&&!hangarLeaderboardOpen&&!pauseState.paused,
 onOpenChange:open=>{
  liveryShopOpen=!!open;transition=null;
  inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();model?.pause();stopVehicleEffects();lastTime=0;syncMode();
 },
 onSectionChange:()=>cancelDeveloperLiveryApplications(),
 getNeonOffer(id){
  const item=getVehicleNeon(id),owned=gameplay?.state.ownedNeonIds.includes(id),product=services?.neon?.catalog.get(id);
  let currencyImage=null;try{currencyImage=product?.getPriceCurrencyImage?.('small');}catch{}
  return {owned,coins:item.currency==='coins',selected:gameplay?.state.selectedNeonId===id,label:item.currency==='coins'?item.price.toLocaleString(selectedLanguage==='en'?'en-US':'ru-RU'):product?.priceValue||product?.price||'—',currencyImage,
   disabled:owned?false:item.currency==='coins'?gameplay?.state.money<item.price:!product||services?.neon?.status.busy};
 },
 async onNeonApply(id){
  if(!liveryShopOpen||!hangarLeaderboardAvailable()||!getVehicleNeon(id))return false;
  if(gameplay.state.ownedNeonIds.includes(id))return gameplay.selectNeon(id);
  let ok;
  if(getVehicleNeon(id)?.currency==='coins')ok=gameplay.buyNeon(id);
  else {ok=await services?.neon?.purchase(id);if(ok){gameplay.grantPremiumNeon(id);gameplay.selectNeon(id);}}
  syncFleetNeon();updateEconomyHud();return !!ok;
 },
 onNeonDisable(){if(!liveryShopOpen||!hangarLeaderboardAvailable())return false;gameplay.selectNeon(null);syncFleetNeon();return true;},
 onNeonPreview(colorId){
  return liveryShopOpen&&liveryShop.getSection()==='neon'&&hangarLeaderboardAvailable()&&!!getVehicleNeon(colorId);
 },
 onPreview(vehicleId,liveryId){
  return liveryShopOpen&&liveryShop.getSection()==='liveries'&&hangarLeaderboardAvailable()&&!!getVehicleLivery(vehicleId,liveryId);
 },
 async onApply(vehicleId,liveryId){
  if(!getVehicleLivery(vehicleId,liveryId)||!liveryShopOpen||!hangarLeaderboardAvailable()||(!vehicleConfig(vehicleId).rewardOnly&&!gameplay.isOwned(vehicleId)))return false;
  const offer=gameplay.getCosmeticOffer('livery',liveryId,vehicleId);if(!offer||offer.disabled)return false;
  if(offer.premium&&!offer.owned&&!services?.liveries?.catalog.has(offer.key))return false;
  const currentGarage=garage,currentGameplay=gameplay,generation=developerLiveryGeneration;
  await currentGarage.vehicleVisuals.ensure(vehicleId);
  if(garage!==currentGarage||gameplay!==currentGameplay||generation!==developerLiveryGeneration||!liveryShopOpen)return false;
  const visual=garage.vehicles.find(v=>v.id===vehicleId)?.visual;if(!visual)return false;
  const entry=developerLiveryController(visual,vehicleId);entry.pending=true;
  try{
   const loaded=await entry.controller.preview(liveryId);
   if(loaded===false||loaded?.applied===false||generation!==developerLiveryGeneration||gameplay!==currentGameplay||!liveryShopOpen){
    restoreDeveloperLiveryApplication(vehicleId,entry);return false;
   }
   if(offer.premium&&!offer.owned){
    const paid=await services?.liveries?.purchase(offer.key);
    if(paid)currentGameplay.grantPremiumCosmetic(offer.key);
    if(!paid||gameplay!==currentGameplay||generation!==developerLiveryGeneration||!liveryShopOpen){restoreDeveloperLiveryApplication(vehicleId,entry);return false;}
   }
   if(!gameplay.buyCosmetic('livery',liveryId,vehicleId)){
    restoreDeveloperLiveryApplication(vehicleId,entry);return false;
   }
   selectedDeveloperLiveries.set(vehicleId,liveryId);entry.pending=false;updateEconomyHud();return true;
  }catch{restoreDeveloperLiveryApplication(vehicleId,entry);return false;}
 },
 onClose:()=>cancelDeveloperLiveryApplications(),
});
function notify(){}
function updateFuelHud(){
  const id=gameplay?.state.selectedId;
  const capacity=getVehiclePerformance(vehicleConfig(id).id,gameplay?.state.upgrades[id]).capacity;
  const value=Math.max(0,Math.min(capacity,id ? gameplay.state.fuels[id] : capacity));


  const displayCapacity=Math.ceil(capacity-1e-7);
  const display=value>0 ? Math.min(displayCapacity,Math.max(1,Math.ceil(value-1e-7))) : 0;
  for(const [elementId,number] of [['fuel-current',display],['fuel-capacity',displayCapacity]]){
    const element=document.getElementById(elementId),text=String(number);
    if(element.textContent!==text)element.textContent=text;
  }
  const readout=document.getElementById('fuel-value'),digits=String(Math.max(3,String(displayCapacity).length));
  if(readout.dataset.digits!==digits){
    readout.dataset.digits=digits;
    readout.style.setProperty('--fuel-digits',digits);
    readout.style.setProperty('--fuel-characters',String(Number(digits)*2+1));
  }
  document.getElementById('fuel-fill').style.width=`${100*value/capacity}%`;
  document.getElementById('fuel-meter').setAttribute('aria-valuemax',String(capacity));
  document.getElementById('fuel-meter').setAttribute('aria-valuenow',String(value));
  document.getElementById('fuel-meter').setAttribute('aria-valuetext',`${display} из ${displayCapacity}`);
  document.getElementById('fuel-meter').classList.toggle('low-fuel',value<capacity*.2);
  document.body.dataset.fuel=value.toFixed(3);
}

const hudUi=createUiCache(document);
function updateEconomyHud(){
  if(!gameplay||!garage)return;
  const state=gameplay.state,el=id=>hudUi.get(id),hangarAvailable=hangarLeaderboardAvailable();
  updatePurchaseNotifications(document,{gameplay});
  const rankingsButton=el('hangar-drift-button');
  hudUi.hidden(rankingsButton,!hangarAvailable);
  if(hangarLeaderboardOpen&&!hangarAvailable)hangarLeaderboardUi?.close({restoreFocus:false});
  liveryShop?.setVisible(hangarAvailable);
  if(liveryShopOpen&&!hangarAvailable)liveryShop?.close();
  garage.setVehicleDisplayMode?.(state.mode==='driving'?state.selectedId:null);
  updateProgressionHud(document,{gameplay,playing,driving,upgradeMenuOpen,premium:services?.premium,purchaseMenuOpen:careerMenuOpen||settingsMenuOpen||hangarLeaderboardOpen||liveryShopOpen||biomeMenuOpen,vehicleFundsAvailable:developerMode,controlsHidden:!!canyonMode?.active});
  retentionUi.update({gameplay,playing,driving,inGarage:!!gameplay&&isInGarage(gameplay.state.player.x,gameplay.state.player.z),menuOpen:!!canyonMode?.active||upgradeMenuOpen||biomeMenuOpen||settingsMenuOpen||hangarLeaderboardOpen||liveryShopOpen});
  if(careerMenuOpen||settingsMenuOpen||hangarLeaderboardOpen||liveryShopOpen||biomeMenuOpen)for(const id of ['buy-vehicle','buy-skin','buy-school'])hudUi.hidden(el(id),true);
  const money=String(state.money),wallet=el('wallet-hud');
  hudUi.text(el('wallet-value'),money);
  hudUi.hidden(el('biome-test-note'),true);
  hudUi.data(wallet,'long',String(money.length>6));
  hudUi.style(wallet,'--wallet-digits',String(money.length));
  const warning=el('save-notice');hudUi.hidden(warning,!(services?.cloud?.status?.unsaved||services?.cloud?.status?.failed||state.saveFailed));hudUi.text(warning,'Не сохранено');hudUi.attribute(warning,'aria-label','Изменения ещё не сохранены в облаке. При закрытии страницы они могут пропасть.');
  hudUi.hidden(el('vehicle-funds-button'),!developerMode||el('vehicle-funds-button').hidden);
  refreshPremiumUi();
  if(canyonMode?.active)for(const id of ['upgrade-button','biome-button','career-mission-button','career-goal-button'])hudUi.hidden(el(id),true);
  hudUi.attribute(wallet,'aria-label',`Заработанные деньги: ${state.money}`);
  const candidate=state.purchaseCandidateId,button=el('buy-vehicle');
  const devUnlockCandidate=developerMode&&!!candidate&&vehicleConfig(candidate).devUnlock;
  hudUi.hidden(button,liveryShopOpen||hangarLeaderboardOpen||settingsMenuOpen||careerMenuOpen||!playing||state.mode!=='walking'||!candidate||!!state.seatedId||state.jump.airborne||!!(candidate&&vehicleConfig(candidate).rewardOnly&&!devUnlockCandidate));
  if(devUnlockCandidate){
    hudUi.property(button,'disabled',false);hudUi.data(button,'affordable','true');hudUi.text(el('buy-label'),'Разблокировать');
    hudUi.attribute(button,'aria-label','Разблокировать секретную машину');
  }else if(candidate&&!vehicleConfig(candidate).rewardOnly){
    const spec=vehicleConfig(candidate),availability=gameplay.getVehicleAvailability(candidate),affordable=availability.purchasable&&state.money>=spec.price;
    const locked=availability.reason==='previous-vehicle';hudUi.property(button,'disabled',!availability.purchasable);
    hudUi.text(el('buy-label'),locked?`Сначала: ${availability.previousVehicleName}`:`Купить ${spec.price}`);
    hudUi.data(button,'affordable',String(affordable));
    hudUi.attribute(button,'aria-label',locked?`Сначала купите ${availability.previousVehicleName}.`:`Купить ${spec.name} за ${spec.price}. ${affordable?'Средств достаточно':'Недостаточно денег'}`);
  }
  for(let i=0;i<garage.vehicles.length;i++){
    const v=garage.vehicles[i],owned=gameplay.isOwned(v.id),label=el(`vehicle-price-${i+1}`);
    // Projection owns showing vehicle labels. Economy polling only hides them,
    // so out-of-view labels do not toggle twice on every walking frame.
    if(!playing||state.mode!=='walking')hudUi.hidden(label,true);
    hudUi.hidden(el(`vehicle-cost-${i+1}`),owned);
    hudUi.hidden(el(`vehicle-cost-icon-${i+1}`),!!v.rewardDisplay);
    const rate=v.config.rewardOnly?0:v.config.brainRate;
    hudUi.text(el(`vehicle-income-value-${i+1}`),String(rate));
    hudUi.text(el(`vehicle-price-value-${i+1}`),v.rewardDisplay?'Заблокировано':String(vehicleConfig(v.id).price));
    if(v.cargo.visible)v.cargo.visible=false;
  }
}
const labelProjection=new THREE.Vector3();
let labelCanvasRect={left:0,top:0,width:innerWidth,height:innerHeight},labelLayerRect={left:0,top:0};
let renderWidth=innerWidth,renderHeight=innerHeight,viewportLayoutKey='',viewportLayoutGarage=null;
const viewportRects=createViewportRectCache({viewport,canvas:renderer.domElement,layer:hudUi.get('world-labels'),window,document,fallback:()=>({left:0,top:0,width:innerWidth,height:innerHeight})});
window.addEventListener('pagehide',event=>{if(!event.persisted)viewportRects.dispose();});
function syncRenderViewport(){
  const layoutKey=[playing,driving,biomeMenuOpen,upgradeMenuOpen,careerMenuOpen,settingsMenuOpen,hangarLeaderboardOpen,liveryShopOpen,!!canyonMode?.active].join('|');
  if(viewportLayoutKey!==layoutKey||viewportLayoutGarage!==garage){viewportRects.invalidate();viewportLayoutKey=layoutKey;viewportLayoutGarage=garage;}
  let rects=viewportRects.read();const rect=rects.viewport;
  if(Math.abs(renderWidth-rect.width)>.01||Math.abs(renderHeight-rect.height)>.01){
    renderWidth=rect.width;renderHeight=rect.height;
    renderer.setSize(renderWidth,renderHeight,false);
    camera.aspect=renderWidth/renderHeight;camera.updateProjectionMatrix();
    viewportRects.invalidate();rects=viewportRects.read();
  }
  labelCanvasRect=rects.canvas;labelLayerRect=rects.layer;
}

function projectWorldLabel(element,x,y,z,visible,maxDistance=220){
  if(!visible||camera.position.distanceToSquared(labelProjection.set(x,y,z))>maxDistance*maxDistance){hudUi.hidden(element,true);return;}
  labelProjection.project(camera);
  hudUi.hidden(element,labelProjection.z< -1||labelProjection.z>1||Math.abs(labelProjection.x)>1.08||Math.abs(labelProjection.y)>1.08);
  if(element.hidden)return;
  const pixel=projectLabelPixel(labelProjection,labelCanvasRect,labelLayerRect),left=`${pixel.x}px`,top=`${pixel.y}px`;
  if(element.style.left!==left)element.style.left=left;
  if(element.style.top!==top)element.style.top=top;
  return labelProjection.z;
}
const forkWorldLabels=FORK_DEFINITIONS.map(fork=>{const q=fork.from+(fork.to-fork.from)*.25;return {fork,q,p:routePointAtProgress(q,{branch:HARD_BRANCHES[fork.id]}),element:hudUi.get('hard-route-'+fork.id)};});
let worldLabelGarage=null,deliveryWorldLabels=[],vehicleWorldLabels=[];
function updateWorldLabels(){
  if(!garage||!gameplay)return;
  hudUi.hidden(hudUi.get('world-labels'),!!canyonMode?.active);if(canyonMode?.active)return;
  camera.updateMatrixWorld();canyonMode?.refreshAccess();
  if(worldLabelGarage!==garage){
    worldLabelGarage=garage;
    deliveryWorldLabels=garage.deliveries.map((delivery,i)=>({delivery,element:hudUi.get(`delivery-label-${i+1}`),value:hudUi.get(`delivery-value-${i+1}`)}));
    vehicleWorldLabels=garage.vehicles.map((vehicle,i)=>({vehicle,element:hudUi.get(`vehicle-price-${i+1}`),anchor:vehicle.priceAnchor||{x:vehicle.park.x,y:groundHeight(vehicle.park.x,vehicle.park.z)+6.1,z:vehicle.park.z}}));
  }
  updateProgressionWorldLabels(document,{gameplay,garage,playing,project:projectWorldLabel,viewportWidth:labelCanvasRect.width,premium:services?.premium});
  const drivingLabels=playing&&driving&&!gameplay.state.testMode;
  const routeProgress=drivingLabels?projectRoad(model.state.x,model.state.z,model.state.routeContext).progress:-Infinity;
  for(const {fork,q,p,element}of forkWorldLabels){
    if(!element)continue;
    if(!drivingLabels){hudUi.hidden(element,true);continue;}
    projectWorldLabel(element,p.x,p.height+7,p.z,routeProgress>fork.from-400&&routeProgress<q+40,1000);
  }
  for(const {delivery:d,element,value}of deliveryWorldLabels){
    if(!drivingLabels){hudUi.hidden(element,true);continue;}
    projectWorldLabel(element,d.x,d.y+7.2,d.z,true);
    if(element.hidden)continue;
    const availability=gameplay.getDeliveryAvailability(d.id);
    hudUi.text(value,!availability.allowed?`${availability.biomeName} · ${d.reward}`:String(d.reward));
  }
  const walkingLabels=playing&&gameplay.state.mode==='walking';
  for(const {vehicle,element,anchor}of vehicleWorldLabels){
    if(!walkingLabels){hudUi.hidden(element,true);continue;}
    projectWorldLabel(element,anchor.x,anchor.y-WORLD_LABEL_DROP,anchor.z,true,45);
  }
}
function handleGameplayEvents(){
  let delivered;
  for(const event of gameplay.events()){
    if(event.type==='finish-reward'&&gameplay.state.finishKind==='main')pendingFinishReceipt=event;
    if(event.type==='finish'){
      // Keep the current controls, velocity and follow-camera state through the finish.
      finishCelebration.start({x:event.x,y:(event.kind==='canyon'?rig.root.position.y:groundHeight(event.x,event.z))+1,z:event.z});
    }
    if(event.type==='delivery'){delivered=event;retentionUi.showDelivery({...event.breakdown,unlockedVehicleId:event.unlockedVehicleId});}
    if(event.type==='garage'){const receipt=pendingFinishReceipt;returnToGarage(event.reason);if(event.reason==='finish'&&receipt)retentionUi.showDelivery({...receipt.breakdown,unlockedVehicleId:receipt.unlockedVehicleId});if(delivered)notify(`Груз доставлен! +${delivered.reward} · Всего ${gameplay.state.money}`);}
    if(event.type==='refuel'){const id=gameplay.state.selectedId,capacity=getVehiclePerformance(id,gameplay.state.upgrades[id]).capacity;notify(gameplay.state.testMode?`Бак заправлен · ${capacity}/${capacity}. Тестовая поездка.`:`Бак заправлен · ${capacity}/${capacity}. Груз сохранён.`);}
    if(event.type==='enter'&&!driving)enterVehicle(event.id);
    if(event.type==='purchase-prompt'){const v=vehicleConfig(event.id);notify(v.devUnlock?(developerMode?'Секретная машина. Подойдите к маркеру и нажмите «Разблокировать».':'Секретная машина пока заблокирована.'):`${v.name} · ${v.price}. Покупка только кнопкой.`);}
    if(event.type==='vehicle-unlocked'&&event.reason==='developer'){notify(`${vehicleConfig(event.id).name} разблокирован. Отойдите и подойдите снова, чтобы сесть.`);syncFleetNeon();}
    if(event.type==='purchase'){notify(`${vehicleConfig(event.id).name} куплен. Отойдите и подойдите снова, чтобы сесть.`);syncFleetNeon();}
    if(event.type==='purchase-denied')notify(event.reason==='previous-vehicle'?`Сначала купите ${gameplay.getVehicleAvailability(event.id).previousVehicleName}.`:event.reason==='funds'||event.reason==='insufficient'||event.reason==='insufficient-funds'?'Недостаточно денег. Выполните доставку на пикапе.':'Подойдите к машине для покупки.');
    if(event.type==='skin-purchase-prompt'){const skin=skinConfig(event.id);if(skin?.premium&&services?.platform?.id==='vk'&&!services.premium.status.busy)void services.premium.initialize();notify(skin?.premium?`${skin.name}. Покупка через ${services?.platform?.name||'Яндекс Игры'}.`:`${skin?.name} · ${event.price}. Покупка только кнопкой.`);}
    if(event.type==='school-purchase-prompt')notify(`${schoolConfig(event.id)?.name} · ${event.price}. Доступ покупается один раз.`);
    if(event.type==='skin-purchase')notify('Образ куплен. Нажмите «Выбрать» или подойдите снова.');
    if(event.type==='school-purchase')notify('Доступ открыт. Нажмите «Сесть» или подойдите снова.');
    if(event.type==='skin-purchase-denied'||event.type==='school-purchase-denied')notify(event.reason==='previous-school'?`Сначала купите ${gameplay.getSchoolAvailability(event.id).previousSchoolName}.`:event.reason==='funds'?'Недостаточно игровых денег.':'Подойдите к нужному маркеру.');
    if(event.type==='upgrade-purchase')notify(`Улучшение куплено · уровень ${event.level}`);
    if(event.type==='upgrade-denied')notify(event.reason==='funds'?'Недостаточно XP. Езжайте или учитесь.':event.reason==='maxed'?'Максимальный уровень.':'Улучшения доступны только в машине.');
    if(event.type==='tyre-purchase')notify(`Шины куплены: ${TYRE_CONFIG.find(tyre=>tyre.tier===event.tier)?.name||TYRE_CONFIG[gameplay.state.tyreTier].name}.`);
    if(event.type==='tyre-purchase-denied')notify(event.reason==='brains'?'Недостаточно XP. Езжайте или учитесь.':event.reason==='previous-tyres'?'Сначала купите предыдущие шины.':event.reason==='owned'?'Эти шины уже куплены.':'Шины доступны в купленной обычной машине.');
    if(event.type==='vehicle-funds')notify(`Добавлено ${event.amount} игровых денег. Одноразовая выдача использована.`);
    if(event.type==='vehicle-funds-denied')notify('Одноразовая выдача уже использована.');
    if(event.type==='save-warning')notify('Сохранение недоступно. Прогресс сохранится только до закрытия этой страницы.');
    if(event.type==='door')notify('Для выезда выбери машину');
    if(event.type==='character')selectCharacter(event.id||CHARACTER_CATALOG[event.index]?.id);
    if(event.type==='sit'){walkInput.reset();syncMode();followCharacter(1,false);notify('Класс ПДД · движение или «Встать», чтобы выйти из класса.');}
    if(event.type==='classroom-full')notify('Все 20 мест заняты. Подойдите позже.');
    if(event.type==='stand'){walkInput.reset();syncMode();followCharacter(1,false);notify('Вы рядом с классом. Выберите вход с нужной скоростью обучения.');}
    if(event.type==='jump'||event.type==='land')updateJumpHud();
  }
}
function refreshPremiumUi(){
  if(services?.platform?.id==='vk'&&services.premium?.status.entitlementsConfirmed){gameplay.reconcilePremiumSkins(services.premium.ownedIds);return;}
  for(const id of services?.premium?.ownedIds||[])gameplay.grantPremiumSkin(id);
}
services?.neon?.subscribe?.(()=>{syncPremiumNeon();syncFleetNeon();});
services?.liveries?.subscribe?.(()=>{if(gameplay)for(const key of services.liveries.ownedIds)gameplay.grantPremiumCosmetic(key);liveryShop?.refresh();});
services?.premium?.subscribe?.(()=>{if(gameplay){refreshPremiumUi();handleGameplayEvents();updateEconomyHud();}});
function followCharacter(dt,snap=false){
  const p=gameplay.state.player,y=(roadPitRampHeight(roadPits,p.x,p.z)??groundHeight(p.x,p.z))+gameplay.state.jump.height;
  if(snap)cameraState.reset({mode:'walking',heading:p.heading});
  cameraState.update({dt,heading:p.heading,distance:0});
  const offset=computeFollowOffset(cameraState.state),scale=camera.aspect<.8?1.12:1;
  desiredTarget.set(p.x,y+1.6,p.z);
  desiredCamera.set(offset.x*scale,offset.y*scale,offset.z*scale).add(desiredTarget);
  const blend=snap?1:1-Math.exp(-8*Math.max(0,dt));
  smoothedCameraTarget.lerp(desiredTarget,blend);
  camera.position.set(offset.x*scale,offset.y*scale,offset.z*scale).add(smoothedCameraTarget);
  camera.lookAt(smoothedCameraTarget);
  controls.target.copy(smoothedCameraTarget);renderedCameraScale=scale;
}
function requestJump(){
  if(careerMenuOpen||settingsMenuOpen||hangarLeaderboardOpen||liveryShopOpen||gameplay?.state.eventMode==='finish')return false;
  if(!startup.ready||!playing||!characterReady||graphicsLost)return false;
  if(gameplay.state.seatedId){notify('Сначала встаньте из-за парты');return false;}
  const jumped=gameplay.jump();if(jumped)updateJumpHud();else if(!gameplay.state.jump.airborne)notify('Для прыжка нужно немного места');return jumped;
}
function updateJumpHud(){
  const walking=playing&&gameplay?.state.mode==='walking';
  const button=document.getElementById('jump-button');button.hidden=!walking||!!gameplay?.state.seatedId;
  button.disabled=!!gameplay?.state.jump.airborne;button.setAttribute('aria-disabled',String(button.disabled));
}
function updateCharacter(dt,speed=0){
  if(!character)return;
  const p=gameplay.state.player;
  const desk=garage.desks.find(d=>d.id===gameplay.state.seatedId);
  character.setSeated?.(!!desk);
  const jump=gameplay.state.jump;character.setAirborne?.({airborne:jump.airborne,elapsed:jump.elapsed,duration:GAMEPLAY.jumpDuration,verticalVelocity:jump.velocity,height:jump.height});
  character.group.position.set(p.x,(roadPitRampHeight(roadPits,p.x,p.z)??groundHeight(p.x,p.z))+gameplay.state.jump.height,p.z);
  character.group.visible=gameplay.state.mode==='walking';
  character.update(dt,speed,p.heading);
  if(desk&&character.seatAnchor){
    const w=character.seatedWeight??1,a=character.seatAnchor,c=Math.cos(p.heading),s=Math.sin(p.heading);
    character.group.position.x-=(a.x*c+a.z*s)*w;
    character.group.position.z-=(-a.x*s+a.z*c)*w;
    character.group.position.y+=(desk.seat.height-a.y)*w;
  }
}
function syncMode(snap=false){
  if(!playing||!driving||biomeMenuOpen||upgradeMenuOpen||careerMenuOpen||settingsMenuOpen||hangarLeaderboardOpen||liveryShopOpen||graphicsLost)stopVehicleEffects();
  driving=playing&&gameplay?.state.mode==='driving';
  canyonMode?.refreshAccess();
  const walking=playing&&gameplay?.state.mode==='walking';
  controls.enabled=!playing&&!settingsMenuOpen&&!hangarLeaderboardOpen&&!liveryShopOpen;
  scene.fog.near=playing?500:10000;scene.fog.far=playing?1600:18000;


  camera.near=playing?.5:5;camera.far=playing?1800:18000;camera.updateProjectionMatrix();
  const vehicleLocked=gameplay?.state.mode==='driving';
  document.getElementById('regenerate').disabled=vehicleLocked||!developerMode;
  document.getElementById('seed').disabled=vehicleLocked||!developerMode;
  controls.autoRotate=false;
  document.body.classList.toggle('is-driving',driving);
  document.body.classList.toggle('is-walking',walking);
  document.getElementById('walk-ui').hidden=!walking;
  document.getElementById('biome-button').hidden=!developerMode||!driving||!!canyonMode?.active;
  document.getElementById('mode-toggle').hidden=!developerMode;
  document.getElementById('biome-menu').hidden=!biomeMenuOpen;
  document.getElementById('biome-button').setAttribute('aria-expanded',String(biomeMenuOpen));
  document.getElementById('fuel-hud').hidden=!driving;
  document.getElementById('stand-up').hidden=!walking||!gameplay.state.seatedId;
  document.getElementById('vehicle-name').textContent=driving ? garage.vehicles.find(v=>v.id===gameplay.state.selectedId).name : `${character?.name||'BACON'} / ${gameplay.state.seatedId?'КЛАСС ПДД':isInGarage(gameplay.state.player.x,gameplay.state.player.z)?'АНГАР':'ПЕШКОМ'}`;
  (document.getElementById('mode-label')||document.getElementById('mode-toggle')).textContent=playing?'Обзор':'Вернуться';
  document.getElementById('mode-toggle').setAttribute('aria-pressed',String(playing));
  inputController?.setEnabled(driving&&!canyonMode?.controlsLocked&&startup.ready&&characterReady&&!graphicsLost&&!biomeMenuOpen&&!upgradeMenuOpen&&!careerMenuOpen&&!settingsMenuOpen&&!hangarLeaderboardOpen&&!liveryShopOpen);
  inputController?.setDriftEnabled?.(driving&&!!vehicleConfig(gameplay.state.selectedId).rewardDrift);
  walkInput?.setEnabled(walking&&startup.ready&&characterReady&&!graphicsLost&&!upgradeMenuOpen&&!careerMenuOpen&&!settingsMenuOpen&&!hangarLeaderboardOpen&&!liveryShopOpen);
  jumpInput?.setEnabled(walking&&startup.ready&&characterReady&&!graphicsLost&&!upgradeMenuOpen&&!careerMenuOpen&&!settingsMenuOpen&&!hangarLeaderboardOpen&&!liveryShopOpen);
  lookInput?.setEnabled(playing&&startup.ready&&characterReady&&!graphicsLost&&!biomeMenuOpen&&!upgradeMenuOpen&&!careerMenuOpen&&!settingsMenuOpen&&!hangarLeaderboardOpen&&!liveryShopOpen);
  cameraState.setMode(driving?'driving':'walking',{heading:driving?model.state.heading:gameplay.state.player.heading});
  updateJumpHud();
  camera.fov=playing?TOW_DRIVING.cameraFov:53;camera.updateProjectionMatrix();
  if(snap)character?.resetMotion?.(gameplay.state.player.heading);
  updateCharacter(0);updateFuelHud();updateEconomyHud();
  if(playing&&!liveryShopOpen){if(driving){applyTruckPose();followTruck(1,snap);}else followCharacter(1,snap);}
  onlineSession?.update(0);
}
function cancelVehicleEntry(){
  vehicleEntryRequest++;pauseState.set('vehicle-loading',false);
}
function enterVehicle(id,loadedRequest=false){
  if(liveryShopOpen||hangarLeaderboardOpen||canyonMode?.active||gameplay?.state.eventMode==='finish')return false;
  if(pauseState.paused&&!loadedRequest)return false;
  if(!startup.ready)return false;
  const vehicle=garage.vehicles.find(v=>v.id===id);
  if(!vehicle||!gameplay.isOwned(id)||(gameplay.state.mode==='driving'&&gameplay.state.selectedId!==id))return false;
  if(!vehicle.visual){
    const currentGarage=garage,generation=displayGeneration,request=++vehicleEntryRequest;
    // Walking entry may already have emitted its gameplay event. Hold simulation
    // until this exact vehicle has metadata and a visible model.
    pauseState.set('vehicle-loading',true);
    void currentGarage.vehicleVisuals.ensure(id,{retry:true,priority:true}).then(()=>{
      if(disposedOnline||request!==vehicleEntryRequest||generation!==displayGeneration||garage!==currentGarage)return;
      pauseState.set('vehicle-loading',false);
      if(vehicle.visual)enterVehicle(id,true);
    }).catch(error=>{
      if(disposedOnline||request!==vehicleEntryRequest||generation!==displayGeneration||garage!==currentGarage)return;
      returnToGarage('loading');
      document.getElementById('error').hidden=false;
      document.getElementById('error-text').textContent='Не удалось загрузить машину. Проверьте соединение и нажмите «Повторить».';
      console.error('Selected vehicle loading failed',error);
    }).finally(()=>{if(request===vehicleEntryRequest)pauseState.set('vehicle-loading',false);});
    return false;
  }
  cancelVehicleEntry();
  physicsWorld?.resetTime();wheelParticles?.clear();roadHazards?.reset();roadHazardsScene?.update(0);
  const spawn=GAMEPLAY.roadSpawn;

  const footprint=vehicleFootprint(vehicle.visual?.metadata,0,vehicle.contactFootprint??={});
  if(roadPitAt(roadPits,spawn.x,spawn.z,Math.hypot(footprint?.halfWidth??3,footprint?.halfLength??5))||getTruckContact(spawn.x,spawn.z,spawn.heading,obstacles,undefined,footprint)||roadHazards.contact(spawn.x,spawn.z,spawn.heading,footprint)){
    returnToGarage('blocked');notify('Стартовая полоса занята. Вы возвращены в ангар.');return false;
  }
  liveryShop?.close();
  if(gameplay.state.mode!=='driving'&&!gameplay.enter(id))return false;
  inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();lastTime=0;


  for(const v of garage.vehicles){v.model.setEnabled(false);v.model.reset();v.routeContext=null;poseVehicle(v);}
  model=vehicle.model;rig=vehicle.rig;
  const spawnPose=fitTruckToGround(THREE,spawn.x,spawn.z,spawn.heading,null,vehicle.visual?.metadata);
  model.setPose({...spawn,y:spawnPose.position.y,quaternion:spawnPose.quaternion});model.setEnabled(true);vehicle.routeContext=null;model.setGear('D');
  inputController?.setGear('D');applyTruckPose();
  teleportId++;syncMode(true);notify(`${vehicle.name} · груз загружен. Слева выгрузка, справа заправка.`);return true;
}
function returnToGarage(reason='garage'){
  if(gameplay?.state.eventMode==='finish'&&reason!=='finish')return false;
  cancelVehicleEntry();
  finishCelebration?.clear();pendingFinishReceipt=null;
  canyonMode?.leave();overturnedSeconds=fallenSeconds=0;
  teleportId++;
  liveryShop?.close();
  settingsUi?.close();
  stopVehicleEffects();
  biomeWeather?.clear();
  physicsWorld?.resetTime();
  roadHazards?.reset();roadHazardsScene?.update(0);
  biomeMenuOpen=false;upgradeMenuOpen=false;gameplay?.flushProgress();wheelParticles?.clear();
  inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();
  for(const v of garage.vehicles){v.model.setEnabled(false);v.model.reset();v.routeContext=null;poseVehicle(v);}
  gameplay.returnToGarage(reason);
  void driftLeaderboard.load();
  gameplay.events();lastTime=0;playing=true;model=garage.vehicles[0].model;rig=garage.vehicles[0].rig;
  inputController?.setGear('D');syncMode(true);
  notify(reason==='canyon-timeout'?'Время вышло. Вы возвращены в ангар.':reason==='bridge'?'Вы в ангаре. За потерянный груз награда не начисляется.':reason==='empty'?'Топливо закончилось. Вы в ангаре — выберите машину.':'Подойдите к купленной машине, чтобы сесть.');
}
function checkPhysicsRecovery(dt){
  if(!driving||gameplay.state.eventMode==='finish')return false;
  const s=model.state;
  overturnedSeconds=s.upY<.2?overturnedSeconds+dt:0;
  const reference=canyonMode?.active?canyonMode.height(s.x,s.z):groundHeight(s.x,s.z);
  const fallen=s.y<reference-12||(!canyonMode?.active&&s.y< -250);
  fallenSeconds=fallen?fallenSeconds+dt:0;
  if(fallenSeconds>.65||overturnedSeconds>2.5){
    returnToGarage('bridge');
    return true;
  }
  return false;
}
function setDriving(value,useOverview=true){
  if(liveryShopOpen||hangarLeaderboardOpen||canyonMode?.active||gameplay?.state.eventMode==='finish')return false;
  if(!value&&!developerMode)return false;
  biomeMenuOpen=false;upgradeMenuOpen=false;gameplay?.flushProgress();wheelParticles?.clear();
  playing=!!value;transition=null;dragging=false;
  inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();model?.pause();
  document.getElementById('rotate').setAttribute('aria-pressed','false');
  syncMode(true);
  if(!playing){controls.target.copy(smoothedCameraTarget);controls.update();if(useOverview)view('overview');}
}
function setBiomeMenu(open){
  if(liveryShopOpen||hangarLeaderboardOpen||canyonMode?.active||gameplay?.state.eventMode==='finish')return false;
  if(!developerMode)return false;
  if(careerMenuOpen||settingsMenuOpen||hangarLeaderboardOpen||liveryShopOpen||gameplay?.state.eventMode==='finish')return false;
  if(!!model?.state.airborne)return false;
  if(open)upgradeMenuOpen=false;
  biomeMenuOpen=!!open&&playing&&driving&&startup.ready&&characterReady&&!graphicsLost;
  inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();model?.pause();lastTime=0;
  document.getElementById('biome-button').setAttribute('aria-expanded',String(biomeMenuOpen));
  syncMode();
  if(biomeMenuOpen)document.getElementById('biome-go-city').focus?.();
  else document.getElementById('biome-button').focus?.();
  return biomeMenuOpen;
}
function setUpgradeMenu(open){
  if(liveryShopOpen||hangarLeaderboardOpen||canyonMode?.active||gameplay?.state.eventMode==='finish')return false;
  if(careerMenuOpen||settingsMenuOpen||hangarLeaderboardOpen||liveryShopOpen||gameplay?.state.eventMode==='finish')return false;
  if(driving&&!!model?.state.airborne)return false;
  upgradeMenuOpen=!!open&&playing&&startup.ready&&characterReady&&!graphicsLost;
  if(upgradeMenuOpen)biomeMenuOpen=false;
  inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();model?.pause();
  gameplay.flushProgress();lastTime=0;syncMode();
  const focusTarget=upgradeMenuOpen
    ? [...UPGRADE_STATS.map(s=>document.getElementById('upgrade-'+s.id+'-buy')),...TYRE_CONFIG.map(tyre=>document.getElementById('tyre-'+tyre.tier+'-buy'))].find(b=>!b.disabled&&!b.closest('[hidden]'))||document.getElementById('upgrade-close')
    : document.getElementById('upgrade-button');
  focusTarget.focus?.();
  return upgradeMenuOpen;
}
function travelToBiome(id){
  if(!developerMode||!biomeMenuOpen||!playing||!driving||!characterReady||graphicsLost)return false;
  const vehicle=garage.vehicles.find(v=>v.model===model),footprint=vehicleFootprint(vehicle?.visual?.metadata,0,vehicle.contactFootprint??={});
  const target=safeBiomeDestination(id,(x,z,h)=>roadPitAt(roadPits,x,z,Math.hypot(footprint?.halfWidth??3,footprint?.halfLength??5))||getTruckContact(x,z,h,obstacles,undefined,footprint)||roadHazards.contact(x,z,h,footprint));
  if(!target){notify('Точка перехода недоступна');return false;}
  if(!gameplay.beginBiomeTest(target.biomeId||id))return false;
  roadHazards.reset();roadHazardsScene.update(0);
  inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();wheelParticles?.clear();
  const targetPose=fitTruckToGround(THREE,target.x,target.z,target.heading,null,vehicle.visual?.metadata);
  model.reset();model.setPose({x:target.x,y:targetPose.position.y,z:target.z,heading:target.heading,quaternion:targetPose.quaternion});model.setEnabled(true);
  garage.vehicles.find(v=>v.model===model).routeContext=null;
  model.pause();model.setGear('D');
  inputController?.setGear('D');biomeMenuOpen=false;lastTime=0;transition=null;
  document.getElementById('biome-button').setAttribute('aria-expanded','false');
  gameplay.events();syncMode(true);notify(`${target.name} · тестовая поездка без оплаты груза. Новый рейс — из ангара.`);
  return true;
}
rebuild(42);
inputController=createVehicleInput({root:document.getElementById('drive-ui'),
  getTelemetry:()=>model?.state,
  onInput:input=>{if(driving)model?.setInput(input)},
  onGear:gear=>{if(driving)model?.setGear(gear)},
  onSafetyReset:()=>{model?.pause();lastTime=0}});
const walkCameraForward=new THREE.Vector3();
walkInput=createWalkInput({root:document.getElementById('walk-ui'),joystick:document.getElementById('walk-stick'),thumb:document.getElementById('walk-thumb'),
  getCameraForward:()=>camera.getWorldDirection(walkCameraForward),onSafetyReset:()=>{lastTime=0}});
jumpInput=createJumpInput({button:document.getElementById('jump-button'),onJump:requestJump});
lookInput=createLookInput({canvas:renderer.domElement,onBegin:()=>cameraState.lookBegin({position:camera.position,target:smoothedCameraTarget,scale:renderedCameraScale}),onDelta:(yaw,pitch)=>cameraState.lookDelta(yaw,pitch),onEnd:()=>cameraState.lookEnd(),onSafetyReset:()=>{cameraState.lookEnd();lastTime=0}});
syncMode(true);
function selectCharacter(id,initial=false){
  const entry=CHARACTER_CATALOG.find(c=>c.id===id);if(!entry||!gameplay.isSkinOwned(id))return Promise.resolve(false);
  if(character?.id===id){characterRequest++;characterReady=true;syncMode();notify(`${entry.name} уже выбран`);return Promise.resolve(true);}
  const request=++characterRequest,generation=displayGeneration;
  inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();model?.pause();characterReady=false;syncMode();
  if(!initial)notify(`Загружаем ${entry.name}…`);
  return loadCharacter(THREE,{id}).then(result=>{
    if(disposedOnline||request!==characterRequest||generation!==displayGeneration){result.dispose();return false;}
    if(character){scene.remove(character.group);character.dispose();}
    character=result;scene.add(character.group);gameplay.setCharacter(id);characterReady=true;
    character.resetMotion?.(gameplay.state.player.heading);syncMode(initial);
    notify(initial?'Справа машины, слева класс ПДД, позади персонажи.':`${entry.name} выбран`);
    return true;
  }).catch(error=>{
    if(disposedOnline||request!==characterRequest||generation!==displayGeneration)return false;
    characterReady=!!character;syncMode();
    if(initial){document.getElementById('error').hidden=false;document.getElementById('error-text').textContent='Не удалось загрузить персонажа. Проверьте соединение и нажмите «Повторить».';}
    else {document.getElementById('error').hidden=false;document.getElementById('error-text').textContent='Модель не загрузилась. Текущий персонаж не изменён. Проверьте соединение и повторите загрузку.';}
    console.error('Character loading failed',error);if(initial)throw error;return false;
  });
}
function createDisplayLoading(stands,generation){
  const items=stands.flatMap(stand=>{
    const spec=CHARACTER_CATALOG[stand.index];return spec?[{id:spec.id,stand,spec}]:[];
  });
  return createProgressiveAssets({items,concurrency:1,
    load:({id})=>createCharacterDisplay(THREE,{id}),
    prepare:display=>modelWarmup.prepare(display.group),
    onLoad(display,{stand,spec}){
      if(generation!==displayGeneration||disposedOnline){display.dispose();return;}
      display.group.position.set(stand.x,(stand.y??.16)+.01,stand.z);display.group.name=`Выбор · ${spec.name}`;
      if(!baselineRendering)display.group.traverse(node=>{node.updateMatrix();node.matrixAutoUpdate=false;});
      scene.add(display.group);characterDisplays.push(display);registerDisplayZone(display);
    },
    onError:(error,{id})=>console.error(`Character display ${id} loading failed`,error),
  });
}
function updateHangarAssets(now){
  if(!startup.ready||disposedOnline||document.hidden||graphicsLost||!appFocused||now-lastDisplayUpdate<250)return;
  lastDisplayUpdate=now;
  const anchor=playing?(driving?model.state:gameplay.state.player):camera.position;
  const distance=position=>Math.hypot(position.x-anchor.x,position.z-anchor.z);
  // Keep nearby rows progressive; remote biomes do not pull the whole hangar in.
  const vehicles=garage.vehicles.filter(vehicle=>distance(vehicle.park)<=36)
    .sort((a,b)=>distance(a.park)-distance(b.park)).map(vehicle=>vehicle.id);
  if(gameplay.state.selectedId)vehicles.unshift(gameplay.state.selectedId);
  else if(isInGarage(anchor.x,anchor.z))vehicles.unshift('pickup');
  garage.vehicleVisuals.request(vehicles);
  const stands=garage.stands.filter(stand=>distance(stand)<=34)
    .sort((a,b)=>distance(a)-distance(b));
  displayLoading?.request(stands.map(stand=>CHARACTER_CATALOG[stand.index]?.id).filter(Boolean));
}
function registerDisplayZone(display){
  if(!renderZones)return;
  const record=renderZones.register(display.group,{box:new THREE.Box3(new THREE.Vector3(-5,-2,-5),new THREE.Vector3(5,10,5)),margin:1});
  record.castShadow=true;
}
function isRenderVisible(object){return renderZones?.isVisible(object)??true;}
function standCharacter(){if(careerMenuOpen||settingsMenuOpen||hangarLeaderboardOpen||liveryShopOpen)return;if(gameplay.stand()){gameplay.events();walkInput.reset();character?.resetMotion?.(gameplay.state.player.heading);syncMode(false);followCharacter(1,false);notify('Вы рядом с классом. Выберите вход с нужной скоростью обучения.');}}
const initialCharacter=selectCharacter(gameplay.state.characterId,true);
for(const id of ['biome-button','biome-menu',...BIOME_DESTINATIONS.map(b=>'biome-go-'+b.id),'biome-close']){
  const el=document.getElementById(id);for(const type of ['pointerdown','pointerup','pointercancel','touchstart','touchmove'])el.addEventListener(type,e=>e.stopPropagation());
}
document.getElementById('biome-button').addEventListener('click',e=>{e.stopPropagation();setBiomeMenu(!biomeMenuOpen)});
document.getElementById('biome-close').addEventListener('click',e=>{e.stopPropagation();setBiomeMenu(false)});
document.getElementById('biome-menu').addEventListener('click',e=>{if(e.target===e.currentTarget)setBiomeMenu(false)});
for(const b of BIOME_DESTINATIONS)document.getElementById('biome-go-'+b.id).addEventListener('click',e=>{e.stopPropagation();travelToBiome(b.id)});
window.addEventListener('keydown',e=>{
  if(!biomeMenuOpen)return;
  if(e.key==='Escape'){e.preventDefault();setBiomeMenu(false);return;}
  if(e.key==='Tab'){e.preventDefault();const items=[...BIOME_DESTINATIONS.map(b=>document.getElementById('biome-go-'+b.id)),document.getElementById('biome-close')],i=items.indexOf(document.activeElement);items[(i+(e.shiftKey?-1:1)+items.length)%items.length].focus?.();}
});
for(const id of ['upgrade-button','upgrade-menu','upgrade-close','vehicle-funds-button','buy-skin','buy-school',...UPGRADE_STATS.map(s=>'upgrade-'+s.id+'-buy'),...TYRE_CONFIG.map(tyre=>'tyre-'+tyre.tier+'-buy')]){
  const el=document.getElementById(id);for(const type of ['pointerdown','pointerup','pointercancel','touchstart','touchmove'])el.addEventListener(type,e=>e.stopPropagation());
}
document.getElementById('upgrade-button').addEventListener('click',e=>{e.stopPropagation();setUpgradeMenu(!upgradeMenuOpen)});
document.getElementById('upgrade-close').addEventListener('click',e=>{e.stopPropagation();setUpgradeMenu(false)});
document.getElementById('upgrade-menu').addEventListener('click',e=>{if(e.target===e.currentTarget)setUpgradeMenu(false)});
for(const stat of UPGRADE_STATS)document.getElementById('upgrade-'+stat.id+'-buy').addEventListener('click',e=>{e.stopPropagation();if(!upgradeMenuOpen||!playing||!characterReady)return;gameplay.buyUpgrade(stat.id);handleGameplayEvents();updateEconomyHud();updateFuelHud();});
for(const tyre of TYRE_CONFIG)document.getElementById('tyre-'+tyre.tier+'-buy').addEventListener('click',e=>{e.stopPropagation();if(!upgradeMenuOpen||!playing||!characterReady)return;gameplay.buyTyres(tyre.tier);handleGameplayEvents();updateEconomyHud();updateFuelHud();});
for(const kind of ['skin','school'])document.getElementById('buy-'+kind).addEventListener('click',e=>{
  e.stopPropagation();if(careerMenuOpen||settingsMenuOpen||hangarLeaderboardOpen||liveryShopOpen||!playing||!characterReady||gameplay.state.mode!=='walking')return;
  const id=gameplay.state[kind+'PurchaseCandidateId'];if(!id)return;
  walkInput.reset();lookInput.reset();jumpInput.reset();
  if(pauseState.paused)return;
  if(kind==='skin'){if(gameplay.isSkinOwned(id))selectCharacter(id);else if(PREMIUM_SKIN_IDS.includes(id)){
    if(services?.premium)void services.premium.purchase(id).then(ok=>{if(ok)gameplay.grantPremiumSkin(id);updateEconomyHud();}).catch(error=>{console.warn('Purchase failed',error);updateEconomyHud();});
  }else gameplay.buySkin(id);}
  else {if(gameplay.isSchoolOwned(id))gameplay.sitAtSchool(id);else gameplay.buySchool(id);}
  handleGameplayEvents();updateEconomyHud();
});
document.getElementById('vehicle-funds-button').addEventListener('click',e=>{
  e.stopPropagation();if(careerMenuOpen||settingsMenuOpen||hangarLeaderboardOpen||liveryShopOpen||!playing||driving||!characterReady||gameplay.state.seatedId)return;
  walkInput.reset();lookInput.reset();gameplay.claimVehicleFunds();handleGameplayEvents();updateEconomyHud();
});
window.addEventListener('keydown',e=>{
  if(!upgradeMenuOpen)return;
  if(e.key==='Escape'){e.preventDefault();setUpgradeMenu(false);return;}
  if(e.key==='Tab'){e.preventDefault();const items=[...UPGRADE_STATS.map(s=>document.getElementById('upgrade-'+s.id+'-buy')).filter(b=>!b.disabled),...TYRE_CONFIG.map(tyre=>document.getElementById('tyre-'+tyre.tier+'-buy')).filter(b=>!b.disabled&&!b.closest('[hidden]')),document.getElementById('upgrade-close')],i=items.indexOf(document.activeElement);items[(i+(e.shiftKey?-1:1)+items.length)%items.length].focus?.();}
});
const pauseProgression=()=>{canyonMode?.pause();stopVehicleEffects();appFocused=false;syncBackgroundMusic();advertising?.setSuspended(true);onlineClock=0;gameplay?.flushProgress();void services?.cloud?.flush();inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();model?.pause();lastTime=0;onlineSession?.update(0);};
window.addEventListener('blur',pauseProgression);
window.addEventListener('pagehide',pauseProgression);
window.addEventListener('focus',()=>{appFocused=true;syncBackgroundMusic();lastTime=0;onlineClock=0;onlineSession?.update(0);});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseProgression();else {appFocused=document.hasFocus?.()??true;syncBackgroundMusic();lastTime=0;onlineClock=0;onlineSession?.update(0);}});
document.getElementById('buy-vehicle').addEventListener('click',event=>{event.stopPropagation();if(careerMenuOpen||settingsMenuOpen||hangarLeaderboardOpen||liveryShopOpen||!playing||!characterReady||gameplay.state.mode!=='walking')return;const id=gameplay.state.purchaseCandidateId;if(!id)return;walkInput?.reset();lookInput?.reset();if(vehicleConfig(id).devUnlock)gameplay.unlockDeveloperVehicle(id);else gameplay.buy(id);handleGameplayEvents();updateEconomyHud();});
document.getElementById('stand-up').addEventListener('click',standCharacter);
document.getElementById('mode-toggle').addEventListener('click',()=>{if(!careerMenuOpen&&!settingsMenuOpen&&!hangarLeaderboardOpen&&!liveryShopOpen)setDriving(!playing)});
document.getElementById('garage-button').addEventListener('click',()=>{if(!careerMenuOpen&&!settingsMenuOpen&&!hangarLeaderboardOpen&&!liveryShopOpen)returnToGarage()});
document
  .querySelectorAll("[data-view]")
  .forEach((b) => b.addEventListener("click", () => view(b.dataset.view)));
document.getElementById("regenerate").addEventListener("click", () => {
  if(gameplay.state.mode==='driving')return;
  let seed = (Number(document.getElementById("seed").value) + 1) >>> 0;
  rebuild(seed || 1);
});
document
  .getElementById("seed")
  .addEventListener("change", (e) => { if(gameplay.state.mode!=='driving')rebuild(e.target.value); });
document.getElementById("rotate").addEventListener("click", (e) => {
  controls.autoRotate = !controls.autoRotate;
  e.currentTarget.setAttribute("aria-pressed", String(controls.autoRotate));
});
document.getElementById("wire").addEventListener("click", () => setWire(!wire));
window.addEventListener("keydown", (e) => {
  if (biomeMenuOpen || upgradeMenuOpen || careerMenuOpen || settingsMenuOpen || hangarLeaderboardOpen || liveryShopOpen || e.target.tagName === "INPUT") return;
  const names = ["street", "overview", "delivery", "fuel"];
  if (names[Number(e.key) - 1]) view(names[Number(e.key) - 1]);
});
controls.addEventListener("start", () => {
  transition = null;
  dragging = true;
});
controls.addEventListener("end", () => (dragging = false));
window.addEventListener("resize", () => {
  syncRenderViewport();
  renderer.setPixelRatio(renderQuality.profile.pixelRatio);
});
renderer.domElement.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  startup.fail(new Error('WebGL context lost during startup'));
  graphicsLost=true;syncBackgroundMusic();inputController.reset();walkInput.reset();jumpInput.reset();lookInput.reset();model.pause();lastTime=0;syncMode();
  document.getElementById("error").hidden = false;
  document.getElementById("error-text").textContent =
    "Браузер потерял графический контекст. Нажмите «Повторить», чтобы пересобрать сцену.";
});

function frame(now) {
  if(disposedOnline)return;
  requestAnimationFrame(frame);
  const frameStarted=performance.now();
  const timings=renderProfiler?{network:0,physics:0,ui:0}:null;
  const physicsStepsBefore=physicsWorld?.stats.steps??0;
  const networkDt=onlineClock?Math.max(0,(now-onlineClock)/1000):0;onlineClock=now;
  const baseActive=startup.ready&&characterReady&&!gameplayPaused();
  const actor=driving?model.state:gameplay.state.player;
  const speed=driving?Math.hypot(model.state.velocityX||0,model.state.velocityZ||0):lastWalkSpeed;
  const footprint=driving?vehicleFootprint(garage.vehicles.find(v=>v.model===model)?.visual?.metadata,model.state.frontWheelAngle):{radius:2.1};
  const adState=advertising?.getState();
  const checkSafety=!canyonMode?.active&&adState&&(adState.pending||adState.phase==='countdown'||adState.activeSeconds+networkDt>=ADVERTISING_INTERVAL_SECONDS);
  const safe=!!checkSafety&&isAdvertisingSafe({position:actor,heading:actor.heading||0,speed,footprint,
    bridges:BRIDGES,hazards:roadHazards.hazards,roadPits,jumping:gameplay.state.jump.airborne,falling:!!model?.state.airborne,
    loading:!startup.ready||!characterReady,modal:biomeMenuOpen||upgradeMenuOpen||careerMenuOpen||settingsMenuOpen||hangarLeaderboardOpen||liveryShopOpen});
  advertising?.setSuspended(gameplay.state.eventMode==='finish'||!!canyonMode?.active||document.hidden||!appFocused||graphicsLost||pauseState.reasons.has('platform')||(pauseState.reasons.has('payment')||pauseState.reasons.has('neon-payment')));
  advertising?.update(networkDt,{active:baseActive,safe,visible:!document.hidden&&appFocused});
  onlineSession?.update(networkDt);
  if(services?.platform){if(startup.ready&&characterReady&&!gameplayPaused()&&!canyonMode?.controlsLocked)services.platform.gameplayStart();else services.platform.gameplayStop();}
  if(timings)timings.network=performance.now()-frameStarted;
  if (!startup.ready || document.hidden || graphicsLost || !appFocused) {
    renderProfiler?.suspend();
    stopVehicleEffects();
    lastTime = 0;
    return;
  }
  syncRenderViewport();
  updateHangarAssets(now);
  if(!lastTime)renderProfiler?.suspend();
  const rawDelta=lastTime?(now-lastTime)/1000:0;
  const rewardFrameValid=Number.isFinite(rawDelta)&&rawDelta>0&&rawDelta<=.100001;
  const dt=Number.isFinite(rawDelta)?Math.min(.1,Math.max(0,rawDelta)):0;
  lastTime = now;
  garage.animate(now/1000,{isVisible:isRenderVisible});
  for(const vehicle of garage.vehicles)if(vehicle.rewardDisplay&&isRenderVisible(vehicle.root)&&(!driving||gameplay.state.selectedId!==vehicle.id)){
    vehicle.rig.update({...rewardDisplayPose(THREE,vehicle,now/1000),steerAngle:0,wheelSpin:0,bodyPitch:0,bodyRoll:0,bodyBob:0});
  }
  if (playing && startup.ready && characterReady && !gameplayPaused()) {
    if(driving){
      const physicsStarted=timings?performance.now():0;
      canyonMode?.refreshAccess();physicsWorld.updateGate(canyonMode?.entrance.unlocked);
      physicsWorld.syncParkedVehicles(gameplay.state.selectedId);physicsWorld.step(dt,model);
      if(timings)timings.physics+=performance.now()-physicsStarted;
      applyTruckPose();roadHazardsScene.update(dt);
      if(checkPhysicsRecovery(dt)){
        handleGameplayEvents();
      }else if(gameplay.state.eventMode==='finish'){
        followTruck(dt,false,model.state.pathDistance||0);
        finishCelebration.update(dt,{position:{x:model.state.x,y:rig.root.position.y+1,z:model.state.z}});
        gameplay.advanceFinish(dt);handleGameplayEvents();
      }else if(canyonMode?.active){
        canyonMode.step(rawDelta,{simulatedSeconds:physicsWorld.frameSeconds});handleGameplayEvents();if(driving)followTruck(dt,false,model.state.pathDistance||0);
      }else{
        const actualDistance=model.state.pathDistance||0;
        gameplay.tickProgress(model.state.movingSeconds||0,{distance:actualDistance,active:rewardFrameValid});
        careerRouteTracker.update(gameplay,model.state,dt);
        gameplay.drive(actualDistance,model.state.x,model.state.z);handleGameplayEvents();
        if(driving){
          wheelParticles.update(dt,model.state,model.state.grounded,garage.vehicles.find(v=>v.model===model)?.visual?.metadata,{position:rig.root.position,quaternion:rig.root.quaternion});
          followTruck(dt,false,actualDistance);
          if(gameplay.state.eventMode!=='finish')canyonMode?.tryEnter();
        }
      }
    }else{
      const move=walkInput.sample(),p=gameplay.state.player,before={x:p.x,z:p.z};
      gameplay.walk(dt,move);


      gameplay.tickProgress(rewardFrameValid?Math.min(rawDelta,.1):0,{distance:0,active:rewardFrameValid});
      handleGameplayEvents();
      lastWalkSpeed=dt?Math.hypot(p.x-before.x,p.z-before.z)/dt:0;updateCharacter(dt,lastWalkSpeed);
      if(!driving)followCharacter(dt);
    }
    const uiStarted=timings?performance.now():0;
    updateFuelHud();updateJumpHud();
    // Walking interactions need next-frame availability updates. Driving polls
    // can be limited; explicit gameplay/menu events still refresh immediately.
    if(!driving||now-lastEconomyFrame>=100||now<lastEconomyFrame){updateEconomyHud();lastEconomyFrame=now;}
    if(timings)timings.ui+=performance.now()-uiStarted;
  }
  if (!playing && !settingsMenuOpen && !hangarLeaderboardOpen&&!liveryShopOpen && transition && !dragging) {
    let t = Math.min(1, (now - transition.start) / 950),
      k = t * t * (3 - 2 * t);
    camera.position.lerpVectors(transition.fromP, transition.toP, k);
    controls.target.lerpVectors(transition.fromT, transition.toT, k);
    if (t === 1) transition = null;
  }
  if (!playing&&!settingsMenuOpen&&!hangarLeaderboardOpen&&!liveryShopOpen) controls.update();
  const effectsActive=playing&&driving&&startup.ready&&characterReady&&!gameplayPaused()&&!canyonMode?.controlsLocked&&!model?.state.airborne&&(gameplay.state.fuels[gameplay.state.selectedId]??0)>0;
  const motion=model.state,lateral=Math.cos(motion.heading)*motion.velocityX-Math.sin(motion.heading)*motion.velocityZ;
  vehicleAudio.update(dt,{active:effectsActive,speed:motion.linearSpeed,slip:Math.abs(lateral),throttle:motion.active?1:0,braking:motion.braking||0,impact:Math.max(0,Math.min(1,((motion.impactSpeed||0)-1)/12))});
  syncFleetNeon();
  for(const v of garage.vehicles)v.visual?.setBrakeLights?.(effectsActive&&v.model===model?motion.braking||0:0);
  canyonMode?.updateEffects(dt,{paused:gameplayPaused(),grounded:model.state.grounded!==false,camera});
  const labelsStarted=timings?performance.now():0;
  updateWorldLabels();
  if(timings)timings.ui+=performance.now()-labelsStarted;
  const weatherRoad=driving&&!canyonMode?.active?projectRoad(model.state.x,model.state.z,model.state.routeContext):null;
  biomeWeather?.update(dt,{camera,biome:weatherRoad?.biome??'city',progress:weatherRoad?.progress,x:camera.position.x,y:camera.position.y,z:camera.position.z,active:!canyonMode?.active&&playing&&driving&&startup.ready&&characterReady,paused:gameplayPaused()});
  const weatherFog=canyonMode?.cloudFog??biomeWeather?.fog;
  scene.fog.color.setHex(weatherFog?.color ?? 0x329dff);
  scene.background.setHex(weatherFog?.color ?? 0x329dff);
  scene.fog.near=weatherFog?.near ?? 500;
  scene.fog.far=weatherFog?.far ?? 1600;
  const lightAnchor=driving?model.state:gameplay.state.player;
  garage.roomBoard?.update({now,anchor:lightAnchor,snapshot:onlineSession?.client.roomSnapshot,leaderboard:driftLeaderboard.state,language:selectedLanguage,active:playing});
  camera.getWorldDirection(shadowView);
  followShadowLight(sun,{x:lightAnchor.x,y:canyonMode?.active?rig.root.position.y:groundHeight(lightAnchor.x,lightAnchor.z),z:lightAnchor.z},driving?shadowView:null);
  onlineSession?.render(dt,{now,camera,anchor:driving?model.state:gameplay.state.player});
  if(timings)timings.logic=Math.max(0,performance.now()-frameStarted-timings.network-timings.physics-timings.ui);
  renderScene(now,true,timings,frameStarted,(physicsWorld?.stats.steps??0)-physicsStepsBefore);
}
function applyRenderQuality(profile){
  qualityProfile=profile;
  if(renderer.getPixelRatio?.()!==profile.pixelRatio){renderer.setPixelRatio(profile.pixelRatio);viewportRects.invalidate();}
  if(sun.shadow.mapSize.x!==profile.shadowSize){
    sun.shadow.map?.dispose();sun.shadow.map=null;
    sun.shadow.mapPass?.dispose();sun.shadow.mapPass=null;
    sun.shadow.mapSize.set(profile.shadowSize,profile.shadowSize);
    sun.shadow.needsUpdate=true;renderer.shadowMap.needsUpdate=true;
  }
  biomeWeather?.setQuality?.(profile);
  canyonMode?.effects.setQuality?.({smokeScale:profile.weatherScale});
  canyonMode?.clouds.setQuality(profile);
}
function renderScene(now=performance.now(),sample=false,timings=null,frameStarted=0,physicsSteps=0){
  const started=performance.now();
  camera.updateWorldMatrix(true,false);
  sun.updateWorldMatrix(true,false);sun.target.updateWorldMatrix(true,false);sun.shadow.updateMatrices(sun);
  const shadowCameras=renderer.shadowMap.enabled&&sun.castShadow?[sun.shadow.camera]:[];
  const maxDistance=scene.fog?.isFog?scene.fog.far:Infinity;
  renderZones?.update({camera,shadowCameras,maxDistance});
  spatialRenderer?.update({camera,shadowCameras,maxDistance});
  displayQuality.update({vehicles:garage?.vehicles,characters:characterDisplays,selectedId:gameplay?.state.selectedId,camera,profile:qualityProfile});
  const renderStarted=performance.now();
  if(timings)timings.culling=renderStarted-started;
  gpuTimer.begin();
  try{renderer.render(scene,camera);}finally{gpuTimer.end();}
  const finished=performance.now();
  if(timings){timings.render=finished-renderStarted;timings.frame=finished-frameStarted;}
  const active=sample&&startup.ready&&characterReady&&!gameplayPaused()&&!(onlineSession?.remotes.loading>0);
  const changed=renderQuality.observe({now,frameMs:previousQualityNow===null?0:now-previousQualityNow,
    workMs:finished-frameStarted,gpuMs:gpuTimer.lastMs,active});
  previousQualityNow=active?now:null;
  if(changed)applyRenderQuality(changed);
  renderProfiler?.record({now,active,
    info:renderer.info,roomCount:onlineSession?.client.roomSnapshot?.players.length??1,loadedPeers:onlineSession?.remotes.loaded??0,
    renderCpuMs:finished-started,spatial:{...spatialRenderer?.stats,zones:renderZones?.stats},timings,physicsSteps,pixelRatio:renderer.getPixelRatio(),gpu:gpuTimer.report()});
}
advertising=services?createAdvertising({showAd:callbacks=>services.platform.showAd(callbacks),
  pause:()=>{pauseState.set('advertising',true);gameplay.flushProgress();void services.cloud.flush();},
  resume:()=>pauseState.set('advertising',false),onCountdown:value=>{
    const overlay=document.getElementById('ad-countdown');if(overlay){overlay.hidden=value===null;overlay.textContent=value===null?'':selectedLanguage==='en'?`Advertisement in ${value}`:`Реклама через ${value}`;}
  }}):null;
if(services?.serverUrl){
  onlineSession=createOnlineSession({THREE,scene,document,serverUrl:services.serverUrl,pause:pauseState,
    onSeatChange:()=>{handleGameplayEvents();updateEconomyHud();updateJumpHud();},
    getContext:()=>({gameplay,garage,character,model,rig,paused:gameplayPaused(),walkSpeed:lastWalkSpeed,teleportId})});
  onlineSession.bindGameplay(gameplay);
}
window.addEventListener('pagehide',event=>{
  if(event.persisted||disposedOnline)return;
  disposedOnline=true;displayGeneration++;characterRequest++;cancelVehicleEntry();
  displayLoading?.dispose();displayLoading=null;
  for(const display of characterDisplays){scene.remove(display.group);display.dispose();}characterDisplays=[];
  if(character){scene.remove(character.group);character.dispose();character=null;}
  musicUi.dispose();settingsMusic.dispose();backgroundMusic.dispose();
  displayQuality.clear();
  disposeDeveloperLiveries();
  for(const v of garage?.vehicles||[])v.model?.dispose?.();
  physicsWorld?.dispose();fleetNeon.dispose();garage?.dispose();
  modelWarmup.dispose();displayQuality.dispose();gpuTimer.dispose();renderProfiler?.dispose();renderZones?.dispose();renderZones=null;spatialRenderer?.dispose();
  liveryShop?.dispose();hangarLeaderboardUi?.dispose();
  canyonMode?.dispose();driftLeaderboard.dispose();onlineSession?.dispose();advertising?.destroy();
});
window.addEventListener('pageshow',event=>{if(!event.persisted)return;viewportRects.invalidate();renderQuality.reset();previousQualityNow=null;gpuTimer.reset();appFocused=document.hasFocus?.()??true;syncBackgroundMusic();lastTime=0;onlineClock=0;inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();syncMode();});
requestAnimationFrame(frame);



const initialAssets=Promise.all([
  initialCharacter,
  // The session starts on foot; parked vehicles and character stands are requested
  // after the first frame, then by proximity or an explicit entry/shop preview.
  document.fonts?.ready,
  // Unopened carousels load their icons on demand and may not have a source yet.
  ...Array.from(document.images||[]).filter(image=>image.src&&image.getAttribute('loading')!=='lazy').map(image=>image.decode?.()),
]);
startup.start(initialAssets,{
  async prepare(){
    syncRenderViewport();updateCharacter(0);followCharacter(1,true);updateWorldLabels();
    scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
    if(renderer.compileAsync)await renderer.compileAsync(scene,camera);else renderer.compile?.(scene,camera);
  },
  render(){renderScene();},
});

}
void startApplication().catch(error=>{
 console.error("World initialization failed",error);
 document.getElementById("loading").hidden=true;
 document.getElementById("error").hidden=false;
 document.getElementById("error-text").textContent="Не удалось загрузить физику и мир. Нажмите «Повторить».";
});
