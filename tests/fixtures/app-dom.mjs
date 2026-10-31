import {createStudyRewardUi} from '../../dist/study-reward-ui.js';
import {createNitroUi,createNitroScreenEffect} from '../../dist/nitro-ui.js';
import {createMusicMenu} from '../../dist/music-menu.js';
import {updatePurchaseNotifications} from '../../dist/purchase-notifications.js';
import {TYRE_CONFIG,ADVERTISING_INTERVAL_SECONDS} from '../../dist/economy-balance.js';
import {createUiCache} from '../../dist/ui-cache.js';
import {createProgressiveAssets} from '../../dist/progressive-assets.js';
import {buildRoadPits,roadPitAt,roadPitRampHeight,roadPitRampBoost,roadPitReservations} from '../../dist/road-pits.js';
import {createFleetNeon} from '../../dist/vehicle-neon.js';
import {getVehicleNeon} from '../../dist/vehicle-neon-catalog.js';
import {DEFAULT_VEHICLE_SMOKE_ID,getVehicleSmokeStyle} from '../../dist/vehicle-smoke-catalog.js';
import {DEFAULT_VEHICLE_TRACK_ID,getVehicleTrackStyle} from '../../dist/vehicle-track-catalog.js';
import {createCanyonLeaderboard} from '../../dist/canyon-leaderboard.js';
import {createVehicleLiveryShop} from '../../dist/vehicle-livery-shop.js';
import {createVehicleLiveryController} from '../../dist/vehicle-livery-materials.js';
import {getVehicleLivery} from '../../dist/vehicle-livery-catalog.js';
import {createHangarDriftLeaderboard} from '../../dist/hangar-drift-leaderboard.js';
import {createSpatialRenderer} from '../../dist/spatial-render.js';
import {createRenderZones} from '../../dist/render-zones.js';
import {createRenderProfiler} from '../../dist/render-profiler.js';
import {createGpuTimer} from '../../dist/gpu-timer.js';
import {createRenderQuality,isMobileRenderer} from '../../dist/render-quality.js';
import {createDisplayQuality} from '../../dist/display-quality.js';
import {createModelWarmup} from '../../dist/model-warmup.js';
import {createFinishCelebration} from '../../dist/finish-celebration.js';
import {createStartupGate} from '../../dist/startup-gate.js';
import {driftUnlockScore} from '../../dist/drift-unlocks.js';
import {createCanyonMode} from '../../dist/canyon-mode.js';
import {createPauseState} from '../../dist/pause-state.js';
import {createOnlineSession} from '../../dist/online-session.js';
import {createAdvertising,isAdvertisingSafe} from '../../dist/advertising.js';
import {PREMIUM_SKIN_IDS} from '../../dist/premium-skins.js';
import {createSettingsMenu} from '../../dist/settings-menu.js';
import {createLocalization} from '../../dist/localization.js';
import {createVehicleAudio} from '../../dist/vehicle-audio.js';
import {createBackgroundMusic} from '../../dist/background-music.js';
import {MUSIC_TRACKS} from '../../dist/music-catalog.js';
import {createSettingsMusic} from '../../dist/settings-music.js';
import {projectLabelPixel,usableViewportRect,createViewportRectCache} from '../../dist/world-label-projection.js';
import {createFinishLine} from '../../dist/finish-line.js';
import {vehicleFootprint} from '../../dist/vehicle-contact.js';
import {FORK_DEFINITIONS} from '../../dist/route-network-config.js';
import {createRetentionUi} from '../../dist/retention-ui.js';
import {createCareerRouteTracker,HARD_BRANCHES} from '../../dist/career-route-tracker.js';
import {SHADOW_LAYOUT,followShadowLight} from '../../dist/scene-lighting.js';
import {createBiomeWeather} from '../../dist/biome-weather.js';
import {BRIDGES,bridgeAtProgress,bridgeSupport,bridgeFallPose,createBridgeFall} from '../../dist/road-bridges.js';
import { projectRoad, routePointAtProgress } from '../../dist/road-layout.js';
import {initializeRapier} from '../../dist/rapier-runtime.js';
import {createRapierDrivingModel} from '../../dist/rapier-vehicle.js';
import {createPhysicsWorld} from '../../dist/physics-world.js';

await initializeRapier();


import fs from 'node:fs';
import * as THREE from '../../dist/vendor/three.module.js';
import { buildCity } from '../../dist/network-scene.js';
import { createVehicleRig } from '../../dist/vehicle-rig.js';
import { createGarageScene, GARAGE_LAYOUT, rewardDisplayPose } from '../../dist/garage-scene.js';
import { createGameplay,garageRoadContact,parkedVehicleContact,isInGarage,GAMEPLAY } from '../../dist/gameplay.js';
import { createWalkInput } from '../../dist/walk-input.js';
import { createJumpInput } from '../../dist/jump-input.js';
import {createFollowCameraState,computeFollowOffset,drivingCameraScale} from '../../dist/follow-camera.js';
import {createLookInput} from '../../dist/look-input.js';
import { createVehicleInput } from '../../dist/vehicle-input.js';
import { TOW_DRIVING } from '../../dist/driving-model.js';
import { roadGroundGradient, roadGroundSurface } from '../../dist/driving-ground.js';
import { fitTruckToGround, collectObstacles, getTruckContact, groundHeight } from '../../dist/city-driving.js';
import { createCareerStore } from '../../dist/career-save.js';
import { vehicleConfig, BIOME_SEQUENCE, ECONOMY_CONFIG } from '../../dist/economy-config.js';
import { createInputDom } from './vehicle-input-dom.mjs';
import {BIOME_DESTINATIONS,safeBiomeDestination} from '../../dist/biome-travel.js';
import { PROGRESSION_CONFIG, SCHOOL_CONFIG, SKIN_CONFIG, schoolConfig, skinConfig } from '../../dist/progression-config.js';
import { UPGRADE_STATS, getVehiclePerformance } from '../../dist/vehicle-upgrades.js';
import { updateProgressionHud, updateProgressionWorldLabels, WORLD_LABEL_DROP } from '../../dist/progression-hud.js';
import {createWheelParticles} from '../../dist/wheel-particles.js';
import {createRoadHazards} from '../../dist/road-hazards.js';
import {createRoadHazardsScene} from '../../dist/road-hazards-scene.js';
function attachFixtureVehicleVisuals(_,garage){
 for(const vehicle of garage.vehicles)vehicle.visual={group:vehicle.root};
 garage.vehicleVisuals={request(){},ensure:id=>Promise.resolve(garage.vehicles.find(vehicle=>vehicle.id===id)?.visual),status:()=>"loaded"};
}
export function createAppDom({width=390,height=844,startDriving=true,realStartup=false,loadFailure=false,deferCharacters=false,career,storage,attachVehicleVisuals=attachFixtureVehicleVisuals,search='',services,createAudio=createVehicleAudio,createMusic=createBackgroundMusic,createCanvasContext,decodeImage,loadDisplay,devServer=false,createLiveryShop=createVehicleLiveryShop,createLiveryController=createVehicleLiveryController,createNeonPreview=()=>({show:()=>true,close(){},dispose(){}}),createLiveryPreview=()=>({show:()=>true,close(){},dispose(){}})}={}){
 const stored=new Map();if(career)stored.set(ECONOMY_CONFIG.saveKey,JSON.stringify(career));
 const testStorage=storage||{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v)};
 const dom=createInputDom(),Element=dom.wheel.constructor,Target=dom.win.constructor,ids=new Map([['drive-ui',dom.root]]),frames=[];let now=1000;
 dom.win.location={search};dom.win.localStorage=testStorage;dom.win.__urbanServices=services;
 dom.doc.body=new Element();dom.doc.body.ownerDocument=dom.doc;dom.doc.documentElement=dom.doc.body;dom.doc.body.append(dom.root);
 for(const id of['biome-button','biome-menu','biome-panel','biome-close','biome-test-note',...BIOME_SEQUENCE.map(b=>'biome-go-'+b.id),'viewport','seed','wire','regenerate','metrics','speed-value','biome-name','drive-status','mode-toggle','mode-label','rotate','view-name','gear-note','error','error-text','loading','walk-ui','walk-stick','walk-thumb','session-note','vehicle-name','fuel-hud','fuel-value','fuel-fill','fuel-meter','garage-button','stand-up','jump-button','wallet-hud','wallet-value','save-notice','buy-vehicle','buy-label','world-labels',...Array.from({length:8},(_,i)=>`delivery-label-${i+1}`),...Array.from({length:8},(_,i)=>`delivery-value-${i+1}`),...Array.from({length:10},(_,i)=>`vehicle-price-${i+1}`),...Array.from({length:10},(_,i)=>`vehicle-price-value-${i+1}`),...Array.from({length:10},(_,i)=>`vehicle-spec-${i+1}`)]){const el=new Element();el.ownerDocument=dom.doc;el.id=id;ids.set(id,el);dom.doc.body.append(el);}
 const html=fs.readFileSync(new URL('../../dist/index.html',import.meta.url),'utf8');
 for(const [,id]of html.matchAll(/\bid="([^"]+)"/g)){if(ids.has(id))continue;const el=new Element();el.ownerDocument=dom.doc;el.id=id;ids.set(id,el);dom.doc.body.append(el);}
 const nest=(id,parent)=>{const child=ids.get(id),target=ids.get(parent);if(!child||!target)return;dom.doc.body.children=dom.doc.body.children.filter(n=>n!==child);target.append(child);};
 nest('career-panel','career-menu');nest('career-close','career-panel');nest('career-title','career-panel');nest('career-mission-summary','career-panel');
 nest('career-mission-section','career-panel');nest('career-mission-list','career-mission-section');
 nest('hangar-drift-panel','hangar-drift-menu');
 for(const id of ['title','close','note','table','rows','self','rank','player','score'])nest(`hangar-drift-${id}`,'hangar-drift-panel');
 nest('settings-panel','settings-menu');nest('settings-close','settings-panel');nest('settings-scroll','settings-panel');
 for(const id of ['settings-volume','settings-volume-value','settings-language','settings-music','settings-music-track','settings-music-previous','settings-music-toggle','settings-music-next'])nest(id,'settings-scroll');


 nest('fuel-current','fuel-value');
 const fuelSeparator=new Element(['fuel-separator']);fuelSeparator.textContent='/';ids.get('fuel-value').append(fuelSeparator);
 nest('fuel-capacity','fuel-value');
 Object.defineProperty(ids.get('fuel-value'),'textContent',{get(){return this.children.map(child=>child.textContent??'').join('');}});
 const reverse=ids.get('reverse-pedal');if(reverse){reverse.classList.add('gas-pedal','reverse-pedal');dom.root.append(reverse);}
 for(const el of ids.values())el.focus=()=>{dom.doc.activeElement=el;};
 ids.get('viewport').bounds={left:0,top:0,width,height};ids.get('world-labels').bounds={left:0,top:0,width,height};
 ids.get('error').hidden=true;ids.get('seed').value=42;ids.get('viewport').appendChild=el=>ids.get('viewport').append(el);
 const views=['street','overview','delivery','fuel'].map(view=>{const el=new Element([],{view});el.ownerDocument=dom.doc;return el;});
 dom.doc.getElementById=id=>ids.get(id)||null;dom.doc.querySelectorAll=selector=>selector==='[data-view]'?views:[];
 class Renderer {constructor(){this.domElement=new Element();this.domElement.ownerDocument=dom.doc;this.shadowMap={};this.renderCount=0;}setSize(w,h){this.size=[w,h];this.domElement.bounds={left:ids.get('viewport').bounds.left,top:ids.get('viewport').bounds.top,width:w,height:h};}setPixelRatio(value){this.pixelRatio=value;}getPixelRatio(){return this.pixelRatio;}initTexture(){}compileAsync(){return Promise.resolve();}render(){this.renderCount++;}}
 class Orbit extends Target {constructor(camera,element){super();this.camera=camera;this.domElement=element;this.target=new THREE.Vector3();this.enabled=true;this.updates=0;}update(){this.updates++;}}
 const CHARACTER_CATALOG=['bacon','pack1','pack2','pack3','pack4','pack5','pack6','pack7','pack9','pirate','robux-man','jeff-the-killer','spider-man','spyder-sammy','kreekcraft','jandel','dancing-npc-girl'].map(id=>({id,name:id}));
 const createCharacterDisplay=loadDisplay|| (async()=>({group:new THREE.Group(),dispose(){}}));
 const pendingCharacters=new Map();
 const loadCharacter=(_,{id='bacon'}={})=>deferCharacters&&id!=='bacon'?new Promise((resolve,reject)=>pendingCharacters.set(id,{resolve,reject})):({then(callback){if(!loadFailure)callback({id,name:id,group:new THREE.Group(),seatAnchor:new THREE.Vector3(0,1.05,0),seatedWeight:1,setSeated(){},update(){},dispose(){}});return {catch(onError){if(loadFailure){try{onError(new Error('Fixture load failure'));}catch(e){return Promise.reject(e);}}return Promise.resolve(!loadFailure);}}}});
 // Keep fixture construction synchronous after the real shared WASM runtime is
 // ready. The application body still creates its own real Rapier world.
 const source=fs.readFileSync(new URL('../../dist/app.js',import.meta.url),'utf8')
  .replace(/^import[\s\S]*?;\r?\n/gm,'')
  .replace(/async function startApplication\(\)\{\s*await initializeRapier\(\);/,'')
  .replace(/\n\}\s*void startApplication\(\)\.catch\(error=>\{[\s\S]*?\n\}\);\s*$/,'');
 const deps={createGpuTimer,createRenderQuality,isMobileRenderer,createDisplayQuality,createModelWarmup,configureModelLoading:()=>{},createProgressiveAssets,createUiCache,createViewportRectCache,createFinishCelebration,createStartupGate:options=>realStartup?createStartupGate({...options,schedule:callback=>frames.push(callback)}):{ready:true,start:assets=>Promise.resolve(assets).catch(()=>{}),fail(){}},createSettingsMenu,createLocalization,createVehicleAudio:createAudio,projectLabelPixel,usableViewportRect,createFinishLine,rewardDisplayPose,vehicleFootprint,attachCosmoGarage:attachVehicleVisuals,FORK_DEFINITIONS,createRetentionUi,createCareerRouteTracker,HARD_BRANCHES,SHADOW_LAYOUT,followShadowLight,createBiomeWeather,BRIDGES,bridgeAtProgress,bridgeSupport,bridgeFallPose,createBridgeFall,projectRoad,routePointAtProgress,SCHOOL_CONFIG,SKIN_CONFIG,schoolConfig,skinConfig,UPGRADE_STATS,getVehiclePerformance,WORLD_LABEL_DROP,updateProgressionHud,updateProgressionWorldLabels,createCareerStore:()=>createCareerStore({storage:testStorage}),vehicleConfig,BIOME_SEQUENCE,THREE:{...THREE,WebGLRenderer:Renderer},OrbitControls:Orbit,createGarageScene,GARAGE_LAYOUT,createGameplay,garageRoadContact,parkedVehicleContact,isInGarage,GAMEPLAY,createWalkInput,createJumpInput,createLookInput,createFollowCameraState,computeFollowOffset,drivingCameraScale,loadCharacter,createCharacterDisplay,CHARACTER_CATALOG,console,buildCity,createVehicleRig,createVehicleInput,TOW_DRIVING,roadGroundGradient,roadGroundSurface,BIOME_DESTINATIONS,safeBiomeDestination,createWheelParticles,createRoadHazards,createRoadHazardsScene,fitTruckToGround,collectObstacles,getTruckContact,groundHeight,document:dom.doc,window:dom.win,innerWidth:width,innerHeight:height,devicePixelRatio:2,matchMedia:()=>({matches:false}),performance:{now:()=>now},requestAnimationFrame:callback=>frames.push(callback)};
 dom.doc.createElement=tag=>{
  const el=new Element();el.tagName=tag.toUpperCase();el.ownerDocument=dom.doc;
  el.focus=()=>{dom.doc.activeElement=el;};
  el.remove=()=>{if(el.parent)el.parent.children=el.parent.children.filter(node=>node!==el);if(ids.get(el.id)===el)ids.delete(el.id);el.parent=null;};
  el.replaceChildren=(...children)=>{for(const child of el.children)child.parent=null;el.children=[];for(const child of children)el.append(child);};
  const setAttribute=el.setAttribute.bind(el);
  el.setAttribute=(key,value)=>{setAttribute(key,value);if(key==='id'){el.id=String(value);ids.set(el.id,el);}if(key.startsWith('data-'))el.dataset[key.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=String(value);};
  if(tag==='canvas'&&createCanvasContext){const context=createCanvasContext();el.getContext=()=>context;}
  if(tag==='img'&&decodeImage)el.decode=()=>decodeImage(el);
  return el;
 };
 dom.doc.createElementNS=(namespace,tag)=>dom.doc.createElement(tag);
 Object.defineProperty(dom.doc,'images',{get:()=>dom.doc.body.all().filter(node=>node.tagName==='IMG')});
 for(const el of ids.values())el.replaceChildren=(...children)=>{el.children=[];children.forEach(child=>el.append(child));};
 Object.assign(deps,{createFleetNeon,getVehicleNeon,getVehicleLivery,createVehicleNeonPreview:createNeonPreview,createVehicleLiveryGallery:createLiveryPreview,createVehicleLiveryPreview:createLiveryPreview,createVehicleLiveryShop:createLiveryShop,createVehicleLiveryController:createLiveryController,createCanyonLeaderboard,createRenderProfiler,createSpatialRenderer,createRenderZones,createHangarDriftLeaderboard,createCanyonMode,createPauseState,createOnlineSession,createAdvertising,isAdvertisingSafe,PREMIUM_SKIN_IDS,__URBAN_DEV_SERVER__:devServer});
 deps.driftUnlockScore=driftUnlockScore;deps.PROGRESSION_CONFIG=PROGRESSION_CONFIG;deps.ECONOMY_CONFIG=ECONOMY_CONFIG;
 Object.assign(deps,{createStudyRewardUi,createNitroUi,createNitroScreenEffect,createMusicMenu,updatePurchaseNotifications,TYRE_CONFIG,ADVERTISING_INTERVAL_SECONDS,DEFAULT_VEHICLE_SMOKE_ID,getVehicleSmokeStyle,DEFAULT_VEHICLE_TRACK_ID,getVehicleTrackStyle,createBackgroundMusic:createMusic,MUSIC_TRACKS,createSettingsMusic});
 Object.assign(deps,{createRapierDrivingModel,createPhysicsWorld,buildRoadPits,roadPitAt,roadPitRampHeight,roadPitRampBoost,roadPitReservations});
 new Function(...Object.keys(deps),source)(...Object.values(deps));
 if(startDriving&&!loadFailure){const d=dom.win.__sceneDebug;d.gameplay.state.cooldown=0;d.enterVehicle('pickup');d.model.setPose({x:1.8,z:9.8});d.applyTruckPose();d.followTruck(1,true);}
 return{...dom,ids,views,storage:testStorage,resolveCharacter(id,fail=false){const p=pendingCharacters.get(id);if(fail)p.reject(new Error('Deferred load failed'));else p.resolve({id,name:id,group:new THREE.Group(),update(){},setSeated(){},dispose(){}});pendingCharacters.delete(id);},get debug(){return dom.win.__sceneDebug;},frame(time=now+1000/60){now=time;const callback=frames.shift();if(!callback)throw Error('No queued animation frame');callback(time);},dispose(){dom.win.dispatch('pagehide');const {garage,city}=dom.win.__sceneDebug;dom.win.__sceneDebug.wheelParticles?.dispose();dom.win.__sceneDebug.roadHazardsScene?.dispose();garage.dispose();city.dispose();}};
}
