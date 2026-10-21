import {createFleetNeon} from './vehicle-neon.js';
import {getVehicleNeon} from './vehicle-neon-catalog.js';
import {DEFAULT_VEHICLE_SMOKE_ID,getVehicleSmokeStyle} from './vehicle-smoke-catalog.js';
import { createVehicleNeonPreview } from './vehicle-neon-preview.js';
import {createFinishCelebration} from './finish-celebration.js';
import {createSpatialRenderer} from './spatial-render.js';
import {createRenderProfiler} from './render-profiler.js';
import {createStartupGate} from './startup-gate.js';
import {createLocalization} from './localization.js';
import {createSettingsMenu} from './settings-menu.js';
import {createVehicleAudio} from './vehicle-audio.js';
import {createBackgroundMusic} from './background-music.js';
import {MUSIC_TRACKS} from './music-catalog.js';
import {createSettingsMusic} from './settings-music.js';
import {projectLabelPixel,usableViewportRect} from './world-label-projection.js';
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
import {createVehicleLiveryGallery} from './vehicle-livery-preview.js';
import {createHangarDriftLeaderboard} from './hangar-drift-leaderboard.js';
import {createCanyonLeaderboard} from './canyon-leaderboard.js';
import {createCanyonMode} from './canyon-mode.js';
import {PREMIUM_SKIN_IDS} from './premium-skins.js';

const services=window.__urbanServices;
const driftLeaderboard=createCanyonLeaderboard({platform:services?.platform});
void driftLeaderboard.load();
const pauseState=services?.pause??createPauseState();
const vehicleAudio=createVehicleAudio();
let audioVolume=services?.settings?.audioVolume??1,lastAudibleVolume=services?.settings?.lastAudibleVolume??1,selectedLanguage=services?.settings?.language??'ru',settingsUi=null;
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
import {SHADOW_LAYOUT,followShadowLight} from './scene-lighting.js';
import {createBiomeWeather} from './biome-weather.js';
import {BRIDGES,bridgeAtProgress,bridgeSupport,bridgeFallPose,createBridgeFall} from './road-bridges.js';
const bridgeFall=createBridgeFall();
import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { buildCity } from "./network-scene.js";
import { vehicleConfig, BIOME_SEQUENCE } from "./economy-config.js";
import { createCareerStore } from "./career-save.js";
import { createGarageScene, GARAGE_LAYOUT, rewardDisplayPose } from "./garage-scene.js";
import { loadCharacter, createCharacterDisplay, CHARACTER_CATALOG } from "./character.js";
import { createWalkInput } from "./walk-input.js";
import { createJumpInput } from "./jump-input.js";
import { createFollowCameraState, computeFollowOffset, drivingCameraScale } from "./follow-camera.js";
import { createLookInput } from "./look-input.js";
import { createGameplay, garageRoadContact, parkedVehicleContact, isInGarage, GAMEPLAY } from "./gameplay.js";
import { createVehicleInput } from "./vehicle-input.js";
import { createDrivingModel, TOW_DRIVING } from "./driving-model.js";
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
const memoryRecords=new Map();
const careerStore=services?.cloud?.store??createCareerStore({storage:{getItem:key=>memoryRecords.get(key)??null,setItem:(key,value)=>memoryRecords.set(key,value)}});

const devQuery=new URLSearchParams(window.location?.search||'').get('dev');
const devServer=typeof __URBAN_DEV_SERVER__!=='undefined'&&__URBAN_DEV_SERVER__===true;
const renderQuery=new URLSearchParams(window.location?.search||'');
const renderDiagnosticsAllowed=devServer&&(!services||services.development!==false);
const baselineRendering=renderDiagnosticsAllowed&&renderQuery.get('render')==='baseline';
const renderProfiler=createRenderProfiler({document,enabled:renderDiagnosticsAllowed&&renderQuery.get('perf')==='1',baseline:baselineRendering});
const developerMode=(!services||services.development)&&(devQuery==='1'||devServer&&devQuery!=='0');
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
renderer.setSize(innerWidth, innerHeight,false);
renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 600 ? 1.6 : 2));
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
sun.shadow.mapSize.set(SHADOW_LAYOUT.mapSize,SHADOW_LAYOUT.mapSize);
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
  lastTime = 0,
  graphicsLost = false;
let liveryShop=null,liveryPreview=null,neonPreview=null;
// Developer cosmetics are session-only and shared by every driven vehicle.
// Keep the choice outside the rebuilt world, like the shop controller itself.
let selectedSmokeId=DEFAULT_VEHICLE_SMOKE_ID;
const fleetNeon=createFleetNeon(THREE);
function syncFleetNeon(){if(!gameplay||!garage)return;fleetNeon.setColor(gameplay.state.selectedNeonId);for(const vehicle of garage.vehicles)fleetNeon.attach(vehicle.visual);}
function syncPremiumNeon(){if(!gameplay)return;for(const id of services?.neon?.ownedIds||[])gameplay.grantPremiumNeon(id);liveryShop?.refresh();}
let hangarLeaderboardUi=null,canyonMode=null,onlineSession=null,advertising=null,spatialRenderer=null,teleportId=0,onlineClock=0,lastWalkSpeed=0,disposedOnline=false;
const gameplayPaused=()=>pauseState.paused||!appFocused||document.hidden||graphicsLost||!playing||biomeMenuOpen||upgradeMenuOpen||careerMenuOpen||settingsMenuOpen||hangarLeaderboardOpen||liveryShopOpen;
pauseState.subscribe(paused=>{syncBackgroundMusic();if(paused){canyonMode?.pause();stopVehicleEffects();inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();}lastTime=0;onlineClock=0;advertising?.setSuspended(gameplay.state.eventMode==='finish'||!!canyonMode?.active||document.hidden||!appFocused||graphicsLost||pauseState.reasons.has('platform')||(pauseState.reasons.has('payment')||pauseState.reasons.has('neon-payment')));onlineSession?.update(0);});
const startup=createStartupGate({
  onReady(){
    lastTime=0;inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();
    document.body.classList.remove('is-loading');document.getElementById('loading').hidden=true;
    document.getElementById('audio-toggle').hidden=false;syncMode(true);
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
  liveryShop?.close();restoreLiveryPreviews();
  spatialRenderer?.dispose();spatialRenderer=null;
  const seed = developerMode ? Math.max(1, Math.min(4294967295, Number(value) || 42)) >>> 0 : 42;
  canyonMode?.dispose();canyonMode=null;
  inputController?.reset();
  biomeMenuOpen=false;upgradeMenuOpen=false;document.getElementById("biome-menu").hidden=true;document.getElementById("upgrade-menu").hidden=true;
  if(biomeWeather){biomeWeather.dispose();}
  if(wheelParticles){scene.remove(wheelParticles.mesh);wheelParticles.dispose();}
  if(roadHazardsScene){scene.remove(roadHazardsScene.group);roadHazardsScene.dispose();}
  walkInput?.reset();jumpInput?.reset();lookInput?.reset();
  const next = buildCity(THREE, { seed });
  gameplay?.flushProgress();
  const previousCareer=gameplay?.snapshot();
  displayGeneration++;
  for(const d of characterDisplays){scene.remove(d.group);d.dispose();}characterDisplays=[];
  if (city) {
    scene.remove(garage?.group);
    finishLine?.dispose();finishCelebration?.dispose();pendingFinishReceipt=null;
    fleetNeon.clear();garage?.dispose();
    scene.remove(city.group);
    city.dispose();
  }
  city = next;


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
  roadHazards=createRoadHazards(seed);
  roadHazardsScene=createRoadHazardsScene(THREE,{system:roadHazards,groundHeight});
  scene.add(roadHazardsScene.group);
  garage = createGarageScene(THREE, city, {document});
  attachCosmoGarage(THREE,garage);
  scene.add(garage.group);
  gameplay = createGameplay({vehicles:garage.vehicles,stations:garage.stations,deliveries:garage.deliveries,desks:garage.desks,stands:garage.stands,solids:garage.walkingSolids||garage.classroomSolids,career:previousCareer??services?.initialCareer??(developerMode?careerStore.load():undefined),persistence:developerMode?undefined:careerStore,developerMode,hardBranches:HARD_BRANCHES});
  if(developerMode&&!previousCareer)gameplay.state.brains=Math.min(PROGRESSION_CONFIG.maxBrains,gameplay.state.brains+10_000_000);
  onlineSession?.bindGameplay(gameplay);
  for(const vehicle of garage.vehicles){
    vehicle.model=createDrivingModel({
      ...vehicle.park,maxSpeed:vehicleConfig(vehicle.id).maxSpeed,
      groundGradient:(x,z)=>{
        const canyonSurface=canyonMode?.surface(x,z,8);if(canyonSurface)return canyonSurface.gradient;
        vehicle.routeContext=projectRoad(x,z,vehicle.routeContext);
        return roadGroundGradient(x,z,vehicle.routeContext);
      },
      groundSurface:(x,z,id)=>canyonMode?.surface(x,z,8)?canyonMode.groundSurface():roadHazards.surfaceAt(x,z,roadGroundSurface(x,z,id,vehicle.routeContext)),
      vehicleId:vehicle.id,getUpgrades:()=>gameplay.state.upgrades[vehicle.id],
      getVehicleMetadata:()=>vehicle.visual?.metadata,
      contact:(x,z,h)=>{
        const footprint=vehicleFootprint(vehicle.visual?.metadata,vehicle.model?.state.frontWheelAngle,vehicle.contactFootprint??={});
        if(canyonMode?.entrance.near(x,z))return canyonMode.entrance.contact(x,z,h,footprint);
        if(canyonMode?.surface(x,z,24))return canyonMode.contact(x,z,h,footprint);
        if(bridgeAtProgress(projectRoad(x,z,vehicle.routeContext).progress))return null;
        let hit=garageRoadContact(x,z,h,(a,b,c)=>getTruckContact(a,b,c,obstacles,vehicle.routeContext,footprint));
        const parked=parkedVehicleContact(x,z,h,garage.vehicles,vehicle.id,footprint);
        const hazard=roadHazards.contact(x,z,h,footprint);
        if(parked&&(!hit||parked.depth>hit.depth))hit=parked;
        if(hazard&&(!hit||hazard.depth>hit.depth))hit=hazard;
        if(hit&&hit.depth>.002&&driving&&gameplay.state.selectedId===vehicle.id)gameplay.recordRunCollision({runId:gameplay.state.run?.id});
        return hit;
      },
    });
    vehicle.position=vehicle.model.state;
    poseVehicle(vehicle);
  }
  rig=garage.vehicles[0].rig; model=garage.vehicles[0].model;
  gameplay.returnToGarage('start');gameplay.events();
  if(character)populateDisplays();
  playing=true;driving=false;
  canyonMode=createCanyonMode(THREE,{scene,document,platform:services?.platform,leaderboard:driftLeaderboard,language:()=>selectedLanguage,
    getContext:()=>({garage,gameplay,city,finishLine,roadHazardsScene,biomeWeather,model,rig,driving,online:onlineSession}),
    onEnter:()=>{careerRouteTracker.reset();wheelParticles?.clear();updateEconomyHud();},
    onExit:()=>{careerRouteTracker.reset();updateEconomyHud();}});
  canyonMode.effects.setSmokeStyle(selectedSmokeId);
  if(!baselineRendering)spatialRenderer=createSpatialRenderer(THREE,{roots:[city.group,canyonMode.environment.group]});
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
    get spatialRenderer(){return spatialRenderer;},
    renderProfiler,
    finishCelebration, vehicleAudio, backgroundMusic, settingsUi, localization, get settingsMenuOpen(){return settingsMenuOpen}, get hangarLeaderboardOpen(){return hangarLeaderboardOpen},get hangarLeaderboardUi(){return hangarLeaderboardUi}, developerMode, get rig(){return rig}, get model(){return model}, obstacles,
    get garage(){return garage}, get gameplay(){return gameplay},
    get startup(){return startup}, get character(){return character}, get characterReady(){return characterReady},
    get canyon(){return canyonMode},get driftLeaderboard(){return driftLeaderboard},get online(){return onlineSession},get advertising(){return advertising},pauseState,
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
  const rendered=model.getRenderState();
  if(!canyonMode?.surface(state.x,state.z,8)){vehicle.routeContext=projectRoad(state.x,state.z,vehicle.routeContext);state.routeContext=vehicle.routeContext;}
  const pose = canyonMode?.surface(rendered.x,rendered.z,8)?canyonMode.pose(rendered):bridgeFall.active ? bridgeFallPose(THREE,bridgeFall.state) : fitTruckToGround(THREE, rendered.x, rendered.z, rendered.heading,vehicle.routeContext,vehicle.visual?.metadata);
  const visual=bridgeFall.active?bridgeFall.state:rendered;
  rig.update({
    position: pose.position,
    quaternion: pose.quaternion,
    steerAngle: visual.frontWheelAngle,
    wheelSpin: visual.wheelSpin,
    bodyPitch: -visual.bodyPitch,
    bodyRoll: -visual.bodyRoll,
    bodyBob: visual.bodyBob,
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
  const rendered=model.getRenderState();
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

settingsUi=createSettingsMenu(document,{volume:audioVolume,language:selectedLanguage,
 onOpenChange:open=>{
  settingsMenuOpen=!!open;transition=null;
  if(open){liveryShop?.close();hangarLeaderboardUi?.close({restoreFocus:false});canyonMode?.pause();retentionUi.close();biomeMenuOpen=false;upgradeMenuOpen=false;}
  inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();model?.pause();stopVehicleEffects();gameplay?.flushProgress();lastTime=0;syncMode();
 },
 onVolumeChange:value=>setAudioVolume(value),
 onLanguageChange:value=>{selectedLanguage=value==='en'?'en':'ru';localization.setLanguage(selectedLanguage);settingsMusic.setLanguage(selectedLanguage);canyonMode?.entrance.refreshSign();hangarLeaderboardUi?.refresh();liveryShop?.refresh();services?.cloud?.setSettings({audioVolume,lastAudibleVolume,language:selectedLanguage});}
});
const settingsMusic=createSettingsMusic(document,{music:backgroundMusic,tracks:MUSIC_TRACKS,language:selectedLanguage,canControl:()=>settingsUi.isOpen()&&!pauseState.paused&&startup.ready});
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
function restoreLiveryPreviews(){
 liveryPreview?.close();neonPreview?.close();
}
liveryShop=createVehicleLiveryShop(document,{
 button:document.getElementById('livery-shop-button'),language:()=>selectedLanguage,autoPreview:true,
 canUseSmoke:()=>developerMode,
 getSelectedSmokeId:()=>selectedSmokeId,
 onSmokeApply(id){
  if(!developerMode||!liveryShopOpen||!hangarLeaderboardAvailable()||!getVehicleSmokeStyle(id))return false;
  if(canyonMode?.effects.setSmokeStyle(id)!==true)return false;
  selectedSmokeId=id;return true;
 },
 canOpen:()=>hangarLeaderboardAvailable()&&!settingsMenuOpen&&!careerMenuOpen&&!biomeMenuOpen&&!upgradeMenuOpen&&!hangarLeaderboardOpen&&!pauseState.paused,
 onOpenChange:open=>{
  liveryShopOpen=!!open;transition=null;
  inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();model?.pause();stopVehicleEffects();lastTime=0;syncMode();
 },
 onSectionChange:()=>restoreLiveryPreviews(),
 getNeonOffer(id){
  const item=getVehicleNeon(id),owned=gameplay?.state.ownedNeonIds.includes(id),product=services?.neon?.catalog.get(id);
  let currencyImage=null;try{currencyImage=product?.getPriceCurrencyImage?.('small');}catch{}
  return {owned,selected:gameplay?.state.selectedNeonId===id,label:item.currency==='coins'?'50 000':product?.priceValue||product?.price||'—',currencyImage,
   disabled:owned?false:item.currency==='coins'?gameplay?.state.money<item.price:!product||services?.neon?.status.busy};
 },
 async onNeonApply(id){
  if(!liveryShopOpen||!hangarLeaderboardAvailable())return false;
  if(gameplay.state.ownedNeonIds.includes(id))return gameplay.selectNeon(id);
  let ok;
  if(getVehicleNeon(id)?.currency==='coins')ok=gameplay.buyNeon(id);
  else {ok=await services?.neon?.purchase(id);if(ok){gameplay.grantPremiumNeon(id);gameplay.selectNeon(id);}}
  syncFleetNeon();updateEconomyHud();return !!ok;
 },
 onNeonDisable(){gameplay.selectNeon(null);syncFleetNeon();},
 onNeonPreview(colorId){
  if(!liveryShopOpen||liveryShop.getSection()!=='neon'||!hangarLeaderboardAvailable())return false;
  const vehicle=garage.vehicles.find(v=>v.id==='bmwreward');
  if(!vehicle?.visual)throw new Error('BMW is not loaded');
  if(!neonPreview)neonPreview=createVehicleNeonPreview(THREE,liveryShop.getNeonPreviewHost());
  return neonPreview.show(vehicle.visual,colorId);
 },
 async onPreview(vehicleId,liveryId){
  if(!liveryShopOpen||!hangarLeaderboardAvailable())return false;
  const vehicle=garage.vehicles.find(v=>v.id===vehicleId);
  if(!vehicle?.visual)throw new Error('Vehicle is not loaded');
  if(!liveryPreview)liveryPreview=createVehicleLiveryGallery(THREE,vehicleId=>liveryShop.getPreviewHost(vehicleId));
  return liveryPreview.show(vehicle.visual,vehicleId,liveryId);
 },
 onApply(vehicleId,liveryId){
  // Only the free original finish is owned until purchase currency is decided.
  if(liveryId!=='base'||!liveryShopOpen||!hangarLeaderboardAvailable())return false;
  return true;
 },
 onClose:()=>restoreLiveryPreviews(),
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

function updateEconomyHud(){
  if(!gameplay||!garage)return;
  const state=gameplay.state;
  const rankingsButton=document.getElementById('hangar-drift-button');
  rankingsButton.hidden=liveryShopOpen||!hangarLeaderboardAvailable()||settingsMenuOpen||careerMenuOpen||biomeMenuOpen||upgradeMenuOpen;
  if(hangarLeaderboardOpen&&!hangarLeaderboardAvailable())hangarLeaderboardUi?.close({restoreFocus:false});
  liveryShop?.setVisible(hangarLeaderboardAvailable()&&!settingsMenuOpen&&!careerMenuOpen&&!biomeMenuOpen&&!upgradeMenuOpen&&!hangarLeaderboardOpen);
  if(liveryShopOpen&&!hangarLeaderboardAvailable())liveryShop?.close();
  garage.setVehicleDisplayMode?.(state.mode==='driving'?state.selectedId:null);
  updateProgressionHud(document,{gameplay,playing,driving,upgradeMenuOpen,premium:services?.premium});
  retentionUi.update({gameplay,playing,driving,inGarage:!!gameplay&&isInGarage(gameplay.state.player.x,gameplay.state.player.z),menuOpen:!!canyonMode?.active||upgradeMenuOpen||biomeMenuOpen||settingsMenuOpen||hangarLeaderboardOpen||liveryShopOpen});
  if(careerMenuOpen||settingsMenuOpen||hangarLeaderboardOpen||liveryShopOpen||biomeMenuOpen)for(const id of ['buy-vehicle','buy-skin','buy-school'])document.getElementById(id).hidden=true;
  document.getElementById('wallet-value').textContent=String(state.money);
  document.getElementById('biome-test-note').hidden=true;
  document.getElementById('wallet-hud').dataset.long=String(String(state.money).length>6);
  document.getElementById('wallet-hud').style.setProperty('--wallet-digits',String(String(state.money).length));
  const warning=document.getElementById('save-notice');warning.hidden=!(services?.cloud?.status?.unsaved||services?.cloud?.status?.failed||state.saveFailed);warning.textContent='Не сохранено';warning.setAttribute('aria-label','Изменения ещё не сохранены в облаке. При закрытии страницы они могут пропасть.');
  document.getElementById('vehicle-funds-button').hidden=!developerMode||document.getElementById('vehicle-funds-button').hidden;
  refreshPremiumUi();
  if(canyonMode?.active)for(const id of ['upgrade-button','biome-button','career-mission-button','career-goal-button']){const el=document.getElementById(id);if(el)el.hidden=true;}
  document.getElementById('wallet-hud').setAttribute('aria-label',`Заработанные деньги: ${state.money}`);
  const candidate=state.purchaseCandidateId,button=document.getElementById('buy-vehicle');
  button.hidden=liveryShopOpen||hangarLeaderboardOpen||settingsMenuOpen||careerMenuOpen||!playing||state.mode!=='walking'||!candidate||!!state.seatedId||state.jump.airborne||!!(candidate&&vehicleConfig(candidate).rewardOnly);
  if(candidate&&!vehicleConfig(candidate).rewardOnly){
    const spec=vehicleConfig(candidate),availability=gameplay.getVehicleAvailability(candidate),affordable=availability.purchasable&&state.money>=spec.price;
    const locked=availability.reason==='discover-biome';button.disabled=!availability.purchasable;
    document.getElementById('buy-label').textContent=locked?`Откройте: ${availability.biomeName}`:`Купить ${spec.price}`;
    button.dataset.affordable=String(affordable);
    button.setAttribute('aria-label',locked?`Сначала доедьте до биома «${availability.biomeName}» на машине прошлого биома.`:`Купить ${spec.name} за ${spec.price}. ${affordable?'Средств достаточно':'Недостаточно денег'}`);
  }
  for(let i=0;i<garage.vehicles.length;i++){
    const v=garage.vehicles[i],owned=gameplay.isOwned(v.id),label=document.getElementById(`vehicle-price-${i+1}`);
    label.hidden=owned||!playing||state.mode!=='walking';
    document.getElementById(`vehicle-price-value-${i+1}`).textContent=v.rewardDisplay?'Заблокировано':String(vehicleConfig(v.id).price);
    v.cargo.visible=false;
  }
}
const labelProjection=new THREE.Vector3();
let labelCanvasRect={left:0,top:0,width:innerWidth,height:innerHeight},labelLayerRect={left:0,top:0};
let renderWidth=innerWidth,renderHeight=innerHeight;
function syncRenderViewport(){
  const fallback={left:0,top:0,width:innerWidth,height:innerHeight};
  const rect=usableViewportRect(viewport,fallback);
  if(Math.abs(renderWidth-rect.width)>.01||Math.abs(renderHeight-rect.height)>.01){
    renderWidth=rect.width;renderHeight=rect.height;
    renderer.setSize(renderWidth,renderHeight,false);
    camera.aspect=renderWidth/renderHeight;camera.updateProjectionMatrix();
  }
  labelCanvasRect=usableViewportRect(renderer.domElement,rect);
  labelLayerRect=usableViewportRect(document.getElementById('world-labels'),fallback);
}

function projectWorldLabel(element,x,y,z,visible,maxDistance=220){
  if(!visible||camera.position.distanceToSquared(labelProjection.set(x,y,z))>maxDistance*maxDistance){element.hidden=true;return;}
  labelProjection.project(camera);
  element.hidden=labelProjection.z< -1||labelProjection.z>1||Math.abs(labelProjection.x)>1.08||Math.abs(labelProjection.y)>1.08;
  if(element.hidden)return;
  const pixel=projectLabelPixel(labelProjection,labelCanvasRect,labelLayerRect);
  element.style.left=`${pixel.x}px`;
  element.style.top=`${pixel.y}px`;
  return labelProjection.z;
}
function updateWorldLabels(){
  if(!garage||!gameplay)return;camera.updateMatrixWorld();
  document.getElementById('world-labels').hidden=!!canyonMode?.active;if(canyonMode?.active)return;
  canyonMode?.refreshAccess();
  updateProgressionWorldLabels(document,{gameplay,garage,playing,project:projectWorldLabel,viewportWidth:labelCanvasRect.width,premium:services?.premium});
  const routeProgress=driving?projectRoad(model.state.x,model.state.z,model.state.routeContext).progress:-Infinity;
  for(const fork of FORK_DEFINITIONS){const q=fork.from+(fork.to-fork.from)*.25,p=routePointAtProgress(q,{branch:HARD_BRANCHES[fork.id]}),el=document.getElementById('hard-route-'+fork.id);if(el)projectWorldLabel(el,p.x,p.height+7,p.z,playing&&driving&&!gameplay.state.testMode&&routeProgress>fork.from-400&&routeProgress<q+40,1000);}
  for(let i=0;i<garage.deliveries.length;i++){
    const d=garage.deliveries[i],el=document.getElementById(`delivery-label-${i+1}`),availability=gameplay.getDeliveryAvailability(d.id);
    document.getElementById(`delivery-value-${i+1}`).textContent=driving&&!availability.allowed?`${availability.biomeName} · ${d.reward}`:String(d.reward);
    projectWorldLabel(el,d.x,d.y+7.2,d.z,driving&&!gameplay.state.testMode);
  }
  for(let i=0;i<garage.vehicles.length;i++){const v=garage.vehicles[i],anchor=v.priceAnchor||{x:v.park.x,y:groundHeight(v.park.x,v.park.z)+6.1,z:v.park.z};projectWorldLabel(document.getElementById(`vehicle-price-${i+1}`),anchor.x,anchor.y-WORLD_LABEL_DROP,anchor.z,playing&&gameplay.state.mode==='walking'&&!gameplay.isOwned(v.id),45);}
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
    if(event.type==='purchase-prompt'){const v=vehicleConfig(event.id);notify(`${v.name} · ${v.price}. Покупка только кнопкой.`);}
    if(event.type==='purchase')notify(`${vehicleConfig(event.id).name} куплен. Отойдите и подойдите снова, чтобы сесть.`);
    if(event.type==='purchase-denied')notify(event.reason==='funds'||event.reason==='insufficient'||event.reason==='insufficient-funds'?'Недостаточно денег. Выполните доставку на пикапе.':'Подойдите к машине для покупки.');
    if(event.type==='skin-purchase-prompt'){const skin=skinConfig(event.id);if(skin?.premium&&services?.platform?.id==='vk'&&!services.premium.status.busy)void services.premium.initialize();notify(skin?.premium?`${skin.name}. Покупка через ${services?.platform?.name||'Яндекс Игры'}.`:`${skin?.name} · ${event.price}. Покупка только кнопкой.`);}
    if(event.type==='school-purchase-prompt')notify(`${schoolConfig(event.id)?.name} · ${event.price}. Доступ покупается один раз.`);
    if(event.type==='skin-purchase')notify('Образ куплен. Нажмите «Выбрать» или подойдите снова.');
    if(event.type==='school-purchase')notify('Доступ открыт. Нажмите «Сесть» или подойдите снова.');
    if(event.type==='skin-purchase-denied'||event.type==='school-purchase-denied')notify(event.reason==='funds'?'Недостаточно игровых денег.':'Подойдите к нужному маркеру.');
    if(event.type==='upgrade-purchase')notify(`Улучшение куплено · уровень ${event.level}`);
    if(event.type==='upgrade-denied')notify(event.reason==='funds'?'Недостаточно мозгов. Езжайте или учитесь.':event.reason==='maxed'?'Максимальный уровень.':'Улучшения доступны только в машине.');
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
services?.premium?.subscribe?.(()=>{if(gameplay){refreshPremiumUi();handleGameplayEvents();updateEconomyHud();}});
function followCharacter(dt,snap=false){
  const p=gameplay.state.player,y=groundHeight(p.x,p.z)+gameplay.state.jump.height;
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
  character.group.position.set(p.x,groundHeight(p.x,p.z)+gameplay.state.jump.height,p.z);
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
  inputController?.setDriftEnabled?.(driving&&gameplay.state.selectedId==='bmwreward');
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
function enterVehicle(id){
  if(liveryShopOpen||hangarLeaderboardOpen||canyonMode?.active||gameplay?.state.eventMode==='finish')return false;
  if(pauseState.paused)return false;
  if(!startup.ready)return false;
  const vehicle=garage.vehicles.find(v=>v.id===id);
  if(!vehicle||!gameplay.isOwned(id)||(gameplay.state.mode==='driving'&&gameplay.state.selectedId!==id))return false;
  bridgeFall.reset();wheelParticles?.clear();roadHazards?.reset();roadHazardsScene?.update(0);
  const spawn=GAMEPLAY.roadSpawn;

  const footprint=vehicleFootprint(vehicle.visual?.metadata,0,vehicle.contactFootprint??={});
  if(getTruckContact(spawn.x,spawn.z,spawn.heading,obstacles,undefined,footprint)||roadHazards.contact(spawn.x,spawn.z,spawn.heading,footprint)){
    returnToGarage('blocked');notify('Стартовая полоса занята. Вы возвращены в ангар.');return false;
  }
  liveryShop?.close();restoreLiveryPreviews();
  if(gameplay.state.mode!=='driving'&&!gameplay.enter(id))return false;
  inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();lastTime=0;


  for(const v of garage.vehicles){v.model.reset();v.routeContext=null;poseVehicle(v);}
  model=vehicle.model;rig=vehicle.rig;
  Object.assign(model.state,spawn);vehicle.routeContext=null;model.pause();model.setGear('D');
  inputController?.setGear('D');applyTruckPose();
  teleportId++;syncMode(true);notify(`${vehicle.name} · груз загружен. Слева выгрузка, справа заправка.`);return true;
}
function returnToGarage(reason='garage'){
  if(gameplay?.state.eventMode==='finish'&&reason!=='finish')return false;
  finishCelebration?.clear();pendingFinishReceipt=null;
  canyonMode?.leave();
  teleportId++;
  liveryShop?.close();restoreLiveryPreviews();
  settingsUi?.close();
  stopVehicleEffects();
  biomeWeather?.clear();
  bridgeFall.reset();
  roadHazards?.reset();roadHazardsScene?.update(0);
  biomeMenuOpen=false;upgradeMenuOpen=false;gameplay?.flushProgress();wheelParticles?.clear();
  inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();
  for(const v of garage.vehicles){v.model.reset();v.routeContext=null;poseVehicle(v);}
  gameplay.returnToGarage(reason);
  void driftLeaderboard.load();
  gameplay.events();lastTime=0;playing=true;model=garage.vehicles[0].model;rig=garage.vehicles[0].rig;
  inputController?.setGear('D');syncMode(true);
  notify(reason==='bridge'?'Вы в ангаре. За потерянный груз награда не начисляется.':reason==='empty'?'Топливо закончилось. Вы в ангаре — выберите машину.':'Подойдите к купленной машине, чтобы сесть.');
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
  if(bridgeFall.active)return false;
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
  if(bridgeFall.active)return false;
  upgradeMenuOpen=!!open&&playing&&driving&&startup.ready&&characterReady&&!graphicsLost;
  if(upgradeMenuOpen)biomeMenuOpen=false;
  inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();model?.pause();
  gameplay.flushProgress();lastTime=0;syncMode();
  const focusTarget=upgradeMenuOpen
    ? UPGRADE_STATS.map(s=>document.getElementById('upgrade-'+s.id+'-buy')).find(b=>!b.disabled)||document.getElementById('upgrade-close')
    : document.getElementById('upgrade-button');
  focusTarget.focus?.();
  return upgradeMenuOpen;
}
function travelToBiome(id){
  if(!developerMode||!biomeMenuOpen||!playing||!driving||!characterReady||graphicsLost)return false;
  const vehicle=garage.vehicles.find(v=>v.model===model),footprint=vehicleFootprint(vehicle?.visual?.metadata,0,vehicle.contactFootprint??={});
  const target=safeBiomeDestination(id,(x,z,h)=>getTruckContact(x,z,h,obstacles,undefined,footprint)||roadHazards.contact(x,z,h,footprint));
  if(!target){notify('Точка перехода недоступна');return false;}
  if(!gameplay.beginBiomeTest(target.biomeId||id))return false;
  roadHazards.reset();roadHazardsScene.update(0);
  inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();wheelParticles?.clear();
  model.reset();Object.assign(model.state,{x:target.x,z:target.z,heading:target.heading});
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
  if(character?.id===id){notify(`${entry.name} уже выбран`);return Promise.resolve(true);}
  const request=++characterRequest;
  inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();model?.pause();characterReady=false;syncMode();
  if(!initial)notify(`Загружаем ${entry.name}…`);
  return loadCharacter(THREE,{id}).then(result=>{
    if(request!==characterRequest){result.dispose();return false;}
    if(character){scene.remove(character.group);character.dispose();}
    character=result;scene.add(character.group);gameplay.setCharacter(id);characterReady=true;
    character.resetMotion?.(gameplay.state.player.heading);syncMode(initial);
    notify(initial?'Справа машины, слева класс ПДД, позади персонажи.':`${entry.name} выбран`);
    return true;
  }).catch(error=>{
    if(request!==characterRequest)return false;
    characterReady=!!character;syncMode();
    if(initial){document.getElementById('error').hidden=false;document.getElementById('error-text').textContent='Не удалось загрузить персонажа. Проверьте соединение и нажмите «Повторить».';}
    else {document.getElementById('error').hidden=false;document.getElementById('error-text').textContent='Модель не загрузилась. Текущий персонаж не изменён. Проверьте соединение и повторите загрузку.';}
    console.error('Character loading failed',error);if(initial)throw error;return false;
  });
}
async function populateDisplays({required=false}={}){
  const generation=displayGeneration,stands=garage.stands,loaded=[];
  let next=0,failed=false;
  async function worker(){
    while(next<stands.length&&generation===displayGeneration&&!failed){
      const index=next++,stand=stands[index],spec=CHARACTER_CATALOG[stand.index];if(!spec)continue;
      try{
        const display=await createCharacterDisplay(THREE,{id:spec.id});
        if(generation!==displayGeneration||failed){display.dispose();return;}
        display.group.position.set(stand.x,.17,stand.z);display.group.name=`Выбор · ${spec.name}`;
        if(!baselineRendering)display.group.traverse(node=>{node.updateMatrix();node.matrixAutoUpdate=false;});
        loaded[index]=display;
      }catch(error){console.error('Character display loading failed',error);if(required){failed=true;throw error;}}
    }
  }
  // Bound decoding work on phones, overlap network waits, retain stand order.
  try{await Promise.all([worker(),worker(),worker()]);}
  catch(error){for(const display of loaded)display?.dispose();throw error;}
  if(generation!==displayGeneration){for(const display of loaded)display?.dispose();return;}
  for(const display of loaded)if(display){scene.add(display.group);characterDisplays.push(display);}
}
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
for(const id of ['upgrade-button','upgrade-menu','upgrade-close','vehicle-funds-button','buy-skin','buy-school',...UPGRADE_STATS.map(s=>'upgrade-'+s.id+'-buy')]){
  const el=document.getElementById(id);for(const type of ['pointerdown','pointerup','pointercancel','touchstart','touchmove'])el.addEventListener(type,e=>e.stopPropagation());
}
document.getElementById('upgrade-button').addEventListener('click',e=>{e.stopPropagation();setUpgradeMenu(!upgradeMenuOpen)});
document.getElementById('upgrade-close').addEventListener('click',e=>{e.stopPropagation();setUpgradeMenu(false)});
document.getElementById('upgrade-menu').addEventListener('click',e=>{if(e.target===e.currentTarget)setUpgradeMenu(false)});
for(const stat of UPGRADE_STATS)document.getElementById('upgrade-'+stat.id+'-buy').addEventListener('click',e=>{e.stopPropagation();if(!upgradeMenuOpen||!playing||!driving||!characterReady)return;gameplay.buyUpgrade(stat.id);handleGameplayEvents();updateEconomyHud();updateFuelHud();});
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
  if(e.key==='Tab'){e.preventDefault();const items=[...UPGRADE_STATS.map(s=>document.getElementById('upgrade-'+s.id+'-buy')).filter(b=>!b.disabled),document.getElementById('upgrade-close')],i=items.indexOf(document.activeElement);items[(i+(e.shiftKey?-1:1)+items.length)%items.length].focus?.();}
});
const pauseProgression=()=>{canyonMode?.pause();stopVehicleEffects();appFocused=false;syncBackgroundMusic();advertising?.setSuspended(true);onlineClock=0;gameplay?.flushProgress();void services?.cloud?.flush();inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();model?.pause();lastTime=0;onlineSession?.update(0);};
window.addEventListener('blur',pauseProgression);
window.addEventListener('pagehide',pauseProgression);
window.addEventListener('focus',()=>{appFocused=true;syncBackgroundMusic();lastTime=0;onlineClock=0;onlineSession?.update(0);});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseProgression();else {appFocused=document.hasFocus?.()??true;syncBackgroundMusic();lastTime=0;onlineClock=0;onlineSession?.update(0);}});
document.getElementById('buy-vehicle').addEventListener('click',event=>{event.stopPropagation();if(careerMenuOpen||settingsMenuOpen||hangarLeaderboardOpen||liveryShopOpen||!playing||!characterReady||gameplay.state.mode!=='walking')return;const id=gameplay.state.purchaseCandidateId;if(!id)return;walkInput?.reset();lookInput?.reset();gameplay.buy(id);handleGameplayEvents();updateEconomyHud();});
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
  renderer.setPixelRatio(
    Math.min(devicePixelRatio, innerWidth < 600 ? 1.6 : 2),
  );
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
  requestAnimationFrame(frame);
  const networkDt=onlineClock?Math.max(0,(now-onlineClock)/1000):0;onlineClock=now;
  const baseActive=startup.ready&&characterReady&&!gameplayPaused();
  const actor=driving?model.state:gameplay.state.player;
  const speed=driving?Math.hypot(model.state.velocityX||0,model.state.velocityZ||0):lastWalkSpeed;
  const footprint=driving?vehicleFootprint(garage.vehicles.find(v=>v.model===model)?.visual?.metadata,model.state.frontWheelAngle):{radius:2.1};
  const adState=advertising?.getState();
  const checkSafety=!canyonMode?.active&&adState&&(adState.pending||adState.phase==='countdown'||adState.activeSeconds+networkDt>=240);
  const safe=!!checkSafety&&isAdvertisingSafe({position:actor,heading:actor.heading||0,speed,footprint,
    bridges:BRIDGES,hazards:roadHazards.hazards,jumping:gameplay.state.jump.airborne,falling:bridgeFall.active,
    loading:!startup.ready||!characterReady,modal:biomeMenuOpen||upgradeMenuOpen||careerMenuOpen||settingsMenuOpen||hangarLeaderboardOpen||liveryShopOpen});
  advertising?.setSuspended(gameplay.state.eventMode==='finish'||!!canyonMode?.active||document.hidden||!appFocused||graphicsLost||pauseState.reasons.has('platform')||(pauseState.reasons.has('payment')||pauseState.reasons.has('neon-payment')));
  advertising?.update(networkDt,{active:baseActive,safe,visible:!document.hidden&&appFocused});
  onlineSession?.update(networkDt);
  if(services?.platform){if(startup.ready&&characterReady&&!gameplayPaused()&&!canyonMode?.controlsLocked)services.platform.gameplayStart();else services.platform.gameplayStop();}
  if (!startup.ready || document.hidden || graphicsLost || !appFocused) {
    renderProfiler?.suspend();
    stopVehicleEffects();
    lastTime = 0;
    return;
  }
  syncRenderViewport();
  if(!lastTime)renderProfiler?.suspend();
  const rawDelta=lastTime?(now-lastTime)/1000:0;
  const rewardFrameValid=Number.isFinite(rawDelta)&&rawDelta>0&&rawDelta<=.100001;
  const dt=Number.isFinite(rawDelta)?Math.min(.05,Math.max(0,rawDelta)):0;
  lastTime = now;
  garage.animate(now/1000);
  for(const vehicle of garage.vehicles)if(vehicle.rewardDisplay&&(!driving||gameplay.state.selectedId!==vehicle.id)){
    vehicle.rig.update({...rewardDisplayPose(THREE,vehicle,now/1000),steerAngle:0,wheelSpin:0,bodyPitch:0,bodyRoll:0,bodyBob:0});
  }
  if (playing && startup.ready && characterReady && !gameplayPaused()) {
    if(gameplay.state.eventMode==='finish'){
      // The finish result is captured: drive normally without fuel, progression or
      // failure transitions competing with the single timed hangar return.
      model.step(dt);applyTruckPose();roadHazardsScene.update(dt);
      wheelParticles.update(dt,model.state,true,garage.vehicles.find(v=>v.model===model)?.visual?.metadata);
      followTruck(dt,false,dt?model.state.pathDistance:0);
      finishCelebration.update(dt,{position:{x:model.state.x,y:rig.root.position.y+1,z:model.state.z}});
      gameplay.advanceFinish(dt);handleGameplayEvents();
    }else if(driving){
      canyonMode?.refreshAccess();
      if(canyonMode?.active){canyonMode.step(rawDelta);applyTruckPose();handleGameplayEvents();followTruck(dt,false,model.state.pathDistance||0);}else{
      roadHazards.update(dt,model.state,true);
      if(!bridgeFall.active){
        model.step(dt);
        const vehicle=garage.vehicles.find(v=>v.model===model);
        const support=canyonMode?.entrance.near(model.state.x,model.state.z)||canyonMode?.surface(model.state.x,model.state.z,8)?{fall:false}:bridgeSupport(model.state,model.state.routeContext,vehicle?.visual?.metadata);
        if(support.fall){bridgeFall.begin(model.state,support,fitTruckToGround(THREE,model.state.x,model.state.z,model.state.heading,model.state.routeContext,vehicle?.visual?.metadata));model.pause();inputController?.reset();wheelParticles?.clear();notify('Машина упала с моста. Груз потерян.');}
      }
      const fell=bridgeFall.active;
      if(fell&&bridgeFall.step(dt)){returnToGarage('bridge');}
      else applyTruckPose();
      roadHazardsScene.update(dt);


      const actualDistance=dt&&!fell?model.state.pathDistance:0;
      if(!fell)gameplay.tickProgress(model.state.movingSeconds||0,{distance:actualDistance,active:rewardFrameValid});
      if(!fell)careerRouteTracker.update(gameplay,model.state,dt);
      if(!fell)gameplay.drive(actualDistance,model.state.x,model.state.z);
      handleGameplayEvents();
      if(driving&&!fell&&gameplay.state.eventMode!=='finish')wheelParticles.update(dt,model.state,true,garage.vehicles.find(v=>v.model===model)?.visual?.metadata);
      if(driving)followTruck(dt,false,dt?actualDistance:0);
      if(gameplay.state.eventMode!=='finish')canyonMode?.tryEnter();
      }
    }else{
      const move=walkInput.sample(),p=gameplay.state.player,before={x:p.x,z:p.z};
      gameplay.walk(dt,move);


      gameplay.tickProgress(rewardFrameValid?Math.min(rawDelta,.1):0,{distance:0,active:rewardFrameValid});
      handleGameplayEvents();
      lastWalkSpeed=dt?Math.hypot(p.x-before.x,p.z-before.z)/dt:0;updateCharacter(dt,lastWalkSpeed);
      if(!driving)followCharacter(dt);
    }
    updateFuelHud();updateJumpHud();updateEconomyHud();
  }
  if (!playing && !settingsMenuOpen && !hangarLeaderboardOpen&&!liveryShopOpen && transition && !dragging) {
    let t = Math.min(1, (now - transition.start) / 950),
      k = t * t * (3 - 2 * t);
    camera.position.lerpVectors(transition.fromP, transition.toP, k);
    controls.target.lerpVectors(transition.fromT, transition.toT, k);
    if (t === 1) transition = null;
  }
  if (!playing&&!settingsMenuOpen&&!hangarLeaderboardOpen&&!liveryShopOpen) controls.update();
  const effectsActive=playing&&driving&&startup.ready&&characterReady&&!gameplayPaused()&&!canyonMode?.controlsLocked&&!bridgeFall.active&&(gameplay.state.fuels[gameplay.state.selectedId]??0)>0;
  const motion=model.state,lateral=Math.cos(motion.heading)*motion.velocityX-Math.sin(motion.heading)*motion.velocityZ;
  vehicleAudio.update(dt,{active:effectsActive,speed:motion.linearSpeed,slip:Math.abs(lateral),throttle:motion.active?1:0,braking:motion.braking||0,impact:Math.max(0,Math.min(1,((motion.impactSpeed||0)-1)/12))});
  syncFleetNeon();
  for(const v of garage.vehicles)v.visual?.setBrakeLights?.(effectsActive&&v.model===model?motion.braking||0:0);
  canyonMode?.updateEffects(dt,{paused:gameplayPaused(),grounded:!bridgeFall.active,camera});
  updateWorldLabels();
  const weatherRoad=driving&&!canyonMode?.active?projectRoad(model.state.x,model.state.z,model.state.routeContext):null;
  biomeWeather?.update(dt,{camera,biome:weatherRoad?.biome??'city',progress:weatherRoad?.progress,x:camera.position.x,y:camera.position.y,z:camera.position.z,active:!canyonMode?.active&&playing&&driving&&startup.ready&&characterReady,paused:gameplayPaused()});
  const weatherFog=biomeWeather?.fog;
  scene.fog.color.setHex(weatherFog?.color ?? 0x329dff);
  scene.background.setHex(weatherFog?.color ?? 0x329dff);
  scene.fog.near=weatherFog?.near ?? 500;
  scene.fog.far=weatherFog?.far ?? 1600;
  const lightAnchor=driving?model.state:gameplay.state.player;
  garage.roomBoard?.update({now,anchor:lightAnchor,snapshot:onlineSession?.client.roomSnapshot,leaderboard:driftLeaderboard.state,language:selectedLanguage,active:playing});
  camera.getWorldDirection(shadowView);
  followShadowLight(sun,{x:lightAnchor.x,y:canyonMode?.active?rig.root.position.y:groundHeight(lightAnchor.x,lightAnchor.z),z:lightAnchor.z},driving?shadowView:null);
  onlineSession?.render(dt,{now,camera,anchor:driving?model.state:gameplay.state.player});
  renderScene(now,true);
}
function renderScene(now=performance.now(),sample=false){
  const started=renderProfiler?performance.now():0;
  camera.updateWorldMatrix(true,false);
  sun.updateWorldMatrix(true,false);sun.target.updateWorldMatrix(true,false);sun.shadow.updateMatrices(sun);
  spatialRenderer?.update({camera,shadowCameras:renderer.shadowMap.enabled&&sun.castShadow?[sun.shadow.camera]:[]});
  renderer.render(scene,camera);
  renderProfiler?.record({now,active:sample&&startup.ready&&characterReady&&!gameplayPaused()&&!(onlineSession?.remotes.loading>0),
    info:renderer.info,roomCount:onlineSession?.client.roomSnapshot?.players.length??1,loadedPeers:onlineSession?.remotes.loaded??0,
    renderCpuMs:performance.now()-started,spatial:spatialRenderer?.stats});
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
window.addEventListener('pagehide',event=>{if(event.persisted||disposedOnline)return;disposedOnline=true;settingsMusic.dispose();backgroundMusic.dispose();fleetNeon.dispose();renderProfiler?.dispose();spatialRenderer?.dispose();liveryShop?.dispose();liveryPreview?.dispose();neonPreview?.dispose();hangarLeaderboardUi?.dispose();canyonMode?.dispose();driftLeaderboard.dispose();onlineSession?.dispose();advertising?.destroy();});
window.addEventListener('pageshow',event=>{if(!event.persisted)return;appFocused=document.hasFocus?.()??true;syncBackgroundMusic();lastTime=0;onlineClock=0;inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();syncMode();});
requestAnimationFrame(frame);



const initialAssets=Promise.all([
  initialCharacter,
  populateDisplays({required:true}),
  garage.vehicleVisuals?.ready.then(result=>{if(result.loaded!==result.total)throw new Error('Vehicle models incomplete');}),
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
