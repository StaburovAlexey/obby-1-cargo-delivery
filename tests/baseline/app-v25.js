import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { buildCity } from "./scene.js";
import { vehicleConfig, BIOME_SEQUENCE } from "./economy-config.js";
import { createCareerStore } from "./career-save.js";
import { createGarageScene, GARAGE_LAYOUT } from "./garage-scene.js";
import { loadCharacter, createCharacterDisplay, CHARACTER_CATALOG } from "./character.js";
import { createWalkInput } from "./walk-input.js";
import { createJumpInput } from "./jump-input.js";
import { createFollowCameraState, computeFollowOffset } from "./follow-camera.js";
import { createLookInput } from "./look-input.js";
import { createGameplay, garageRoadContact, parkedVehicleContact, isInGarage, GAMEPLAY } from "./gameplay.js";
import { createVehicleInput } from "./vehicle-input.js";
import { createDrivingModel, TOW_DRIVING } from "./driving-model.js";
import {
  fitTruckToGround,
  collectObstacles,
  getTruckContact,
  groundHeight,
} from "./city-driving.js";
const careerStore=createCareerStore();
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
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 600 ? 1.6 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
viewport.appendChild(renderer.domElement);
renderer.domElement.setAttribute(
  "aria-label",
  "3D город. Перетаскивайте, чтобы повернуть камеру.",
);
renderer.domElement.setAttribute("tabindex", "0");
const ambient = new THREE.HemisphereLight(0xffffff, 0xab8d55, 1.6);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xfff5dc, 2.6);
sun.position.set(-35, 60, 30);
sun.target.position.set(0, 0, -28);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -68;
sun.shadow.camera.right = 68;
sun.shadow.camera.top = 78;
sun.shadow.camera.bottom = -65;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 190;
sun.shadow.normalBias = 0.04;
sun.shadow.bias = -0.00012;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight(0xc3e4ff, 0.55);
fill.position.set(40, 25, -20);
scene.add(fill);
const garageFill=new THREE.PointLight(0xffe7ba,280,70,2);
garageFill.position.set(0,12,GARAGE_LAYOUT.spawn.z);scene.add(garageFill);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 7;
controls.maxDistance = 8000;
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
  garage, gameplay, character, walkInput, jumpInput, lookInput,
  characterReady = false,
  characterRequest = 0, displayGeneration = 0, characterDisplays = [],
  noticeUntil = 0,
  lastTime = 0,
  graphicsLost = false;
const cameraState=createFollowCameraState({mode:'walking',heading:0});
const desiredCamera = new THREE.Vector3(),
  desiredTarget = new THREE.Vector3(),
  worldUp = new THREE.Vector3(0, 1, 0);
let wire = false,
  transition = null,
  dragging = false;
function view(name, instant = false) {
  const preset = viewPresets[name];
  if (!preset) return;
  if (playing) setDriving(false, false);
  const p = new THREE.Vector3(...preset.p),
    t = new THREE.Vector3(...preset.t);
  if (innerWidth < 600 && name === "overview") p.set(2300, 5100, 1700);
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
  const seed = Math.max(1, Math.min(4294967295, Number(value) || 42)) >>> 0;
  inputController?.reset();
  walkInput?.reset();jumpInput?.reset();lookInput?.reset();
  const next = buildCity(THREE, { seed });
  const previousCareer=gameplay?.snapshot();
  displayGeneration++;
  for(const d of characterDisplays){scene.remove(d.group);d.dispose();}characterDisplays=[];
  if (city) {
    scene.remove(garage?.group);
    garage?.dispose();
    scene.remove(city.group);
    city.dispose();
  }
  city = next;
  scene.add(city.group);
  obstacles = collectObstacles(THREE, city);
  city.group.getObjectByName("Orange delivery truck").visible=false;
  garage = createGarageScene(THREE, city);
  scene.add(garage.group);
  gameplay = createGameplay({vehicles:garage.vehicles,stations:garage.stations,deliveries:garage.deliveries,desks:garage.desks,stands:garage.stands,solids:garage.classroomSolids,career:previousCareer,persistence:careerStore});
  for(const vehicle of garage.vehicles){
    vehicle.model=createDrivingModel({...vehicle.park,maxSpeed:vehicleConfig(vehicle.id).maxSpeed,contact:(x,z,h)=>{const road=garageRoadContact(x,z,h,(a,b,c)=>getTruckContact(a,b,c,obstacles)),other=parkedVehicleContact(x,z,h,garage.vehicles,vehicle.id);return !road?other:!other?road:road.depth>other.depth?road:other}});
    vehicle.position=vehicle.model.state;
    poseVehicle(vehicle);
  }
  rig=garage.vehicles[0].rig; model=garage.vehicles[0].model;
  gameplay.returnToGarage('start');gameplay.events();
  if(character)populateDisplays();
  playing=true;driving=false;
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
    get rig(){return rig}, get model(){return model}, obstacles,
    get garage(){return garage}, get gameplay(){return gameplay},
    get character(){return character}, get characterReady(){return characterReady},
    get input(){return inputController}, get walkInput(){return walkInput}, get lookInput(){return lookInput}, cameraState, requestJump,
    get driving(){return driving}, get playing(){return playing},
    enterVehicle, returnToGarage, followTruck, followCharacter, applyTruckPose,
    rebuild, setDriving, selectCharacter, standCharacter, get characterDisplays(){return characterDisplays},

  };
}
function poseVehicle(vehicle) {
  const state=vehicle.model.state, pose=fitTruckToGround(THREE,state.x,state.z,state.heading);
  vehicle.rig.update({position:pose.position,quaternion:pose.quaternion,steerAngle:state.frontWheelAngle,wheelSpin:state.wheelSpin,bodyPitch:-state.bodyPitch,bodyRoll:-state.bodyRoll,bodyBob:state.bodyBob});
}
function applyTruckPose() {
  const state = model.state,
    pose = fitTruckToGround(THREE, state.x, state.z, state.heading);
  rig.update({
    position: pose.position,
    quaternion: pose.quaternion,
    steerAngle: state.frontWheelAngle,
    wheelSpin: state.wheelSpin,
    bodyPitch: -state.bodyPitch,
    bodyRoll: -state.bodyRoll,
    bodyBob: state.bodyBob,
  });
  document.getElementById("speed-value").textContent = String(
    Math.round(Math.abs(state.speed) * 3.6),
  );
  document.getElementById("drive-status").textContent = state.blocked
    ? "СТОП"
    : state.gear;
  const data = document.body.dataset;
  data.vehicleSpeed = state.speed.toFixed(3);
  data.vehicleGear = state.gear;
  data.vehicleThrottle = String(state.active);
  data.vehicleTurn = state.frontWheelAngle.toFixed(3);
  data.wheelRotation = state.wheelSpin.toFixed(3);
  data.vehicleWallBlocked = String(state.blocked);
  const biome = city.biomeAt?.(state.x, -state.z);
  updateFuelHud();
  const biomeLabel = document.getElementById("biome-name");
  if (biomeLabel) biomeLabel.textContent = biome?.name || biome?.label || "Город";
  data.biome = biome?.id || "city";
}


const smoothedCameraTarget=new THREE.Vector3();
let renderedCameraScale=1;
function followTruck(dt,snap=false,distance=0){
  if(snap)cameraState.reset({mode:'driving',heading:model.state.heading});
  cameraState.update({dt,heading:model.state.heading,distance});
  const offset=computeFollowOffset(cameraState.state);
  const scale=innerWidth/innerHeight<.8?1.2:1;
  desiredTarget.copy(rig.root.position);desiredTarget.y+=1.7;
  desiredCamera.set(offset.x*scale,offset.y*scale,offset.z*scale).add(desiredTarget);


  const blend=snap?1:1-Math.exp(-7*Math.max(0,dt));
  smoothedCameraTarget.lerp(desiredTarget,blend);
  camera.position.set(offset.x*scale,offset.y*scale,offset.z*scale).add(smoothedCameraTarget);
  camera.lookAt(smoothedCameraTarget);
  controls.target.copy(smoothedCameraTarget);renderedCameraScale=scale;
}
function notify(text){
  document.getElementById('session-note').textContent=text;
  noticeUntil=performance.now()+4200;
}
function updateFuelHud(){
  const id=gameplay?.state.selectedId;
  const capacity=vehicleConfig(id).capacity;
  const value=Math.max(0,Math.min(capacity,id ? gameplay.state.fuels[id] : capacity));
  const display=value>0 ? Math.max(1,Math.ceil(value)) : 0;
  document.getElementById('fuel-value').textContent=`${display}/${capacity}`;
  document.getElementById('fuel-fill').style.width=`${100*value/capacity}%`;
  document.getElementById('fuel-meter').setAttribute('aria-valuemax',String(capacity));
  document.getElementById('fuel-meter').setAttribute('aria-valuenow',String(value));
  document.getElementById('fuel-meter').setAttribute('aria-valuetext',`${display} из ${capacity}`);
  document.getElementById('fuel-meter').classList.toggle('low-fuel',value<capacity*.2);
  document.body.dataset.fuel=value.toFixed(3);
}

function updateEconomyHud(){
  if(!gameplay||!garage)return;
  const state=gameplay.state;
  document.getElementById('wallet-value').textContent=String(state.money);
  document.getElementById('wallet-hud').dataset.long=String(String(state.money).length>6);
  document.getElementById('wallet-hud').style.setProperty('--wallet-digits',String(String(state.money).length));
  const warning=document.getElementById('save-notice');warning.hidden=!state.saveFailed;warning.textContent=['corrupt','version'].includes(careerStore.status?.reason)?'Сохранение сброшено':'Не сохранено';warning.setAttribute('aria-label','Локальное сохранение недоступно. Прогресс может пропасть после закрытия страницы.');
  document.getElementById('wallet-hud').setAttribute('aria-label',`Заработанные деньги: ${state.money}`);
  const candidate=state.purchaseCandidateId,button=document.getElementById('buy-vehicle');
  button.hidden=!playing||state.mode!=='walking'||!candidate||!!state.seatedId||state.jump.airborne;
  if(candidate){const spec=vehicleConfig(candidate),affordable=state.money>=spec.price;document.getElementById('buy-label').textContent=`Купить ${spec.price}`;button.dataset.affordable=String(affordable);button.setAttribute('aria-label',`Купить ${spec.name} за ${spec.price}. ${affordable?'Средств достаточно':'Недостаточно денег'}`);}
  for(let i=0;i<garage.vehicles.length;i++){
    const v=garage.vehicles[i],owned=gameplay.isOwned(v.id),label=document.getElementById(`vehicle-price-${i+1}`);
    label.classList.toggle('owned',owned);document.getElementById(`vehicle-price-value-${i+1}`).textContent=owned?'КУПЛЕНО':String(vehicleConfig(v.id).price);
    v.cargo.visible=state.mode==='driving'&&state.selectedId===v.id&&!!state.run?.loaded;
  }
}
const labelProjection=new THREE.Vector3();
function projectWorldLabel(element,x,y,z,visible,maxDistance=220){
  if(!visible||camera.position.distanceToSquared(labelProjection.set(x,y,z))>maxDistance*maxDistance){element.hidden=true;return;}
  labelProjection.project(camera);
  element.hidden=labelProjection.z< -1||labelProjection.z>1||Math.abs(labelProjection.x)>1.08||Math.abs(labelProjection.y)>1.08;
  if(element.hidden)return;
  element.style.left=`${(labelProjection.x*.5+.5)*innerWidth}px`;
  element.style.top=`${(-labelProjection.y*.5+.5)*innerHeight}px`;
}
function updateWorldLabels(){
  if(!garage||!gameplay)return;camera.updateMatrixWorld();
  for(let i=0;i<garage.deliveries.length;i++){const d=garage.deliveries[i],el=document.getElementById(`delivery-label-${i+1}`);document.getElementById(`delivery-value-${i+1}`).textContent=String(d.reward);projectWorldLabel(el,d.x,d.y+7.2,d.z,driving);}
  for(let i=0;i<garage.vehicles.length;i++){const v=garage.vehicles[i];projectWorldLabel(document.getElementById(`vehicle-price-${i+1}`),v.park.x,groundHeight(v.park.x,v.park.z)+6.1,v.park.z,playing&&gameplay.state.mode==='walking',75);}
}
function handleGameplayEvents(){
  let delivered;
  for(const event of gameplay.events()){
    if(event.type==='delivery')delivered=event;
    if(event.type==='garage'){returnToGarage(event.reason);if(delivered)notify(`Груз доставлен! +${delivered.reward} · Всего ${gameplay.state.money}`);}
    if(event.type==='refuel'){const capacity=vehicleConfig(gameplay.state.selectedId).capacity;notify(`Бак заправлен · ${capacity}/${capacity}. Груз сохранён.`);}
    if(event.type==='enter'&&!driving)enterVehicle(event.id);
    if(event.type==='purchase-prompt'){const v=vehicleConfig(event.id);notify(`${v.name} · ${v.price}. Покупка только кнопкой.`);}
    if(event.type==='purchase')notify(`${vehicleConfig(event.id).name} куплен. Отойдите и подойдите снова, чтобы сесть.`);
    if(event.type==='purchase-denied')notify(event.reason==='funds'||event.reason==='insufficient'||event.reason==='insufficient-funds'?'Недостаточно денег. Выполните доставку на пикапе.':'Подойдите к машине для покупки.');
    if(event.type==='save-warning')notify('Сохранение недоступно. Прогресс сохранится только до закрытия этой страницы.');
    if(event.type==='door')notify('Для выезда выбери машину');
    if(event.type==='character')selectCharacter(CHARACTER_CATALOG[event.index]?.id);
    if(event.type==='sit'){walkInput.reset();syncMode();followCharacter(1,false);notify('Класс ПДД · движение или «Встать», чтобы выйти из класса.');}
    if(event.type==='classroom-full')notify('Все 20 мест заняты. Подойдите к кругу позже.');
    if(event.type==='stand'){walkInput.reset();syncMode();followCharacter(1,false);notify('Вы рядом с классом. Жёлтый круг выбирает свободное место.');}
    if(event.type==='jump'||event.type==='land')updateJumpHud();
  }
}
function followCharacter(dt,snap=false){
  const p=gameplay.state.player,y=groundHeight(p.x,p.z)+gameplay.state.jump.height;
  if(snap)cameraState.reset({mode:'walking',heading:p.heading});
  cameraState.update({dt,heading:p.heading,distance:0});
  const offset=computeFollowOffset(cameraState.state),scale=innerWidth/innerHeight<.8?1.12:1;
  desiredTarget.set(p.x,y+1.6,p.z);
  desiredCamera.set(offset.x*scale,offset.y*scale,offset.z*scale).add(desiredTarget);
  const blend=snap?1:1-Math.exp(-8*Math.max(0,dt));
  smoothedCameraTarget.lerp(desiredTarget,blend);
  camera.position.set(offset.x*scale,offset.y*scale,offset.z*scale).add(smoothedCameraTarget);
  camera.lookAt(smoothedCameraTarget);
  controls.target.copy(smoothedCameraTarget);renderedCameraScale=scale;
}
function requestJump(){
  if(!playing||!characterReady||graphicsLost)return false;
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
  driving=playing&&gameplay?.state.mode==='driving';
  const walking=playing&&gameplay?.state.mode==='walking';
  controls.enabled=!playing;
  scene.fog.near=playing?500:5000;scene.fog.far=playing?1600:12000;


  camera.near=playing?.5:2;camera.far=playing?1800:10000;camera.updateProjectionMatrix();
  const vehicleLocked=gameplay?.state.mode==='driving';
  document.getElementById('regenerate').disabled=vehicleLocked;
  document.getElementById('seed').disabled=vehicleLocked;
  controls.autoRotate=false;
  document.body.classList.toggle('is-driving',driving);
  document.body.classList.toggle('is-walking',walking);
  document.getElementById('walk-ui').hidden=!walking;
  document.getElementById('fuel-hud').hidden=!driving;
  document.getElementById('stand-up').hidden=!walking||!gameplay.state.seatedId;
  document.getElementById('vehicle-name').textContent=driving ? garage.vehicles.find(v=>v.id===gameplay.state.selectedId).name : `${character?.name||'BACON'} / ${gameplay.state.seatedId?'КЛАСС ПДД':isInGarage(gameplay.state.player.x,gameplay.state.player.z)?'АНГАР':'ПЕШКОМ'}`;
  (document.getElementById('mode-label')||document.getElementById('mode-toggle')).textContent=playing?'Обзор':'Вернуться';
  document.getElementById('mode-toggle').setAttribute('aria-pressed',String(playing));
  inputController?.setEnabled(driving&&characterReady&&!graphicsLost);
  walkInput?.setEnabled(walking&&characterReady&&!graphicsLost);
  jumpInput?.setEnabled(walking&&characterReady&&!graphicsLost);
  lookInput?.setEnabled(playing&&characterReady&&!graphicsLost);
  cameraState.setMode(driving?'driving':'walking',{heading:driving?model.state.heading:gameplay.state.player.heading});
  updateJumpHud();
  camera.fov=playing?TOW_DRIVING.cameraFov:53;camera.updateProjectionMatrix();
  if(snap)character?.resetMotion?.(gameplay.state.player.heading);
  updateCharacter(0);updateFuelHud();updateEconomyHud();
  if(playing){if(driving){applyTruckPose();followTruck(1,snap);}else followCharacter(1,snap);}
}
function enterVehicle(id){
  const vehicle=garage.vehicles.find(v=>v.id===id);
  if(!vehicle||!gameplay.isOwned(id)||(gameplay.state.mode==='driving'&&gameplay.state.selectedId!==id))return false;
  const spawn=GAMEPLAY.roadSpawn;

  if(getTruckContact(spawn.x,spawn.z,spawn.heading,obstacles)){
    returnToGarage('blocked');notify('Стартовая полоса занята. Вы возвращены в ангар.');return false;
  }
  if(gameplay.state.mode!=='driving'&&!gameplay.enter(id))return false;
  inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();lastTime=0;


  for(const v of garage.vehicles){v.model.reset();poseVehicle(v);}
  model=vehicle.model;rig=vehicle.rig;
  Object.assign(model.state,spawn);model.pause();model.setGear('D');
  inputController?.setGear('D');applyTruckPose();
  syncMode(true);notify(`${vehicle.name} · груз загружен. Слева выгрузка, справа заправка.`);return true;
}
function returnToGarage(reason='garage'){
  inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();
  for(const v of garage.vehicles){v.model.reset();poseVehicle(v);}
  gameplay.returnToGarage(reason);
  gameplay.events();lastTime=0;playing=true;model=garage.vehicles[0].model;rig=garage.vehicles[0].rig;
  inputController?.setGear('D');syncMode(true);
  notify(reason==='empty'?'Топливо закончилось. Вы в ангаре — выберите машину.':'Подойдите к одной из трёх машин, чтобы сесть.');
}
function setDriving(value,useOverview=true){
  playing=!!value;transition=null;dragging=false;
  inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();model?.pause();
  document.getElementById('rotate').setAttribute('aria-pressed','false');
  syncMode(true);
  if(!playing){controls.target.copy(smoothedCameraTarget);controls.update();if(useOverview)view('overview');}
}
rebuild(42);
inputController=createVehicleInput({root:document.getElementById('drive-ui'),
  onInput:input=>{if(driving)model?.setInput(input)},
  onGear:gear=>{model?.setGear(gear);document.getElementById('gear-note').textContent=gear==='D'?'D · ВПЕРЁД':'R · НАЗАД'},
  onSafetyReset:()=>{model?.pause();lastTime=0}});
const walkCameraForward=new THREE.Vector3();
walkInput=createWalkInput({root:document.getElementById('walk-ui'),joystick:document.getElementById('walk-stick'),thumb:document.getElementById('walk-thumb'),
  getCameraForward:()=>camera.getWorldDirection(walkCameraForward),onSafetyReset:()=>{lastTime=0}});
jumpInput=createJumpInput({button:document.getElementById('jump-button'),onJump:requestJump});
lookInput=createLookInput({canvas:renderer.domElement,onBegin:()=>cameraState.lookBegin({position:camera.position,target:smoothedCameraTarget,scale:renderedCameraScale}),onDelta:(yaw,pitch)=>cameraState.lookDelta(yaw,pitch),onEnd:()=>cameraState.lookEnd(),onSafetyReset:()=>{cameraState.lookEnd();lastTime=0}});
syncMode(true);
function selectCharacter(id,initial=false){
  const entry=CHARACTER_CATALOG.find(c=>c.id===id);if(!entry)return Promise.resolve(false);
  if(character?.id===id){notify(`${entry.name} уже выбран`);return Promise.resolve(true);}
  const request=++characterRequest;
  inputController?.reset();walkInput?.reset();jumpInput?.reset();lookInput?.reset();model?.pause();characterReady=false;syncMode();
  if(!initial)notify(`Загружаем ${entry.name}…`);
  return loadCharacter(THREE,{id}).then(result=>{
    if(request!==characterRequest){result.dispose();return false;}
    if(character){scene.remove(character.group);character.dispose();}
    character=result;scene.add(character.group);gameplay.setCharacter(id);characterReady=true;
    character.resetMotion?.(gameplay.state.player.heading);syncMode(initial);document.getElementById('loading').hidden=true;
    notify(initial?'Справа машины, слева класс ПДД, позади персонажи.':`${entry.name} выбран`);
    if(initial)populateDisplays();return true;
  }).catch(error=>{
    if(request!==characterRequest)return false;
    characterReady=!!character;syncMode();document.getElementById('loading').hidden=true;
    if(initial){document.getElementById('error').hidden=false;document.getElementById('error-text').textContent='Не удалось загрузить персонажа. Проверьте соединение и нажмите «Повторить».';}
    else notify('Модель не загрузилась. Текущий персонаж сохранён. Отойдите и попробуйте снова.');
    console.error('Character loading failed',error);return false;
  });
}
async function populateDisplays(){
  const generation=displayGeneration,stands=garage.stands;

  for(const stand of stands){
    try{
      const spec=CHARACTER_CATALOG[stand.index];if(!spec)continue;
      const display=await createCharacterDisplay(THREE,{id:spec.id,height:3.5});
      if(generation!==displayGeneration){display.dispose();return;}
      display.group.scale.multiplyScalar(.82);
      display.group.position.set(stand.x,.17,stand.z);display.group.name=`Выбор · ${spec.name}`;
      scene.add(display.group);characterDisplays.push(display);
    }catch(error){console.error('Character display loading failed',error);}
  }
}
function standCharacter(){if(gameplay.stand()){gameplay.events();walkInput.reset();character?.resetMotion?.(gameplay.state.player.heading);syncMode(false);followCharacter(1,false);notify('Вы рядом с классом. Жёлтый круг выбирает свободное место.');}}
selectCharacter(gameplay.state.characterId,true);
document.getElementById('buy-vehicle').addEventListener('click',event=>{event.stopPropagation();if(!playing||!characterReady||gameplay.state.mode!=='walking')return;const id=gameplay.state.purchaseCandidateId;if(!id)return;walkInput?.reset();lookInput?.reset();gameplay.buy(id);handleGameplayEvents();updateEconomyHud();});
document.getElementById('stand-up').addEventListener('click',standCharacter);
document.getElementById('mode-toggle').addEventListener('click',()=>setDriving(!playing));
document.getElementById('garage-button').addEventListener('click',()=>returnToGarage());
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
  if (e.target.tagName === "INPUT") return;
  const names = ["street", "overview", "delivery", "fuel"];
  if (names[Number(e.key) - 1]) view(names[Number(e.key) - 1]);
});
controls.addEventListener("start", () => {
  transition = null;
  dragging = true;
});
controls.addEventListener("end", () => (dragging = false));
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(
    Math.min(devicePixelRatio, innerWidth < 600 ? 1.6 : 2),
  );
});
renderer.domElement.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  graphicsLost=true;inputController.reset();walkInput.reset();jumpInput.reset();lookInput.reset();model.pause();lastTime=0;syncMode();
  document.getElementById("error").hidden = false;
  document.getElementById("error-text").textContent =
    "Браузер потерял графический контекст. Нажмите «Повторить», чтобы пересобрать сцену.";
});
let first = true;
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden || graphicsLost) {
    lastTime = 0;
    return;
  }
  const dt = lastTime
    ? Math.min(0.05, Math.max(0, (now - lastTime) / 1000))
    : 0;
  lastTime = now;
  garage.animate(now/1000);
  if (playing && characterReady) {
    if(driving){
      const beforeDrive={x:model.state.x,z:model.state.z};
      model.step(dt);applyTruckPose();
      const actualDistance=Math.hypot(model.state.x-beforeDrive.x,model.state.z-beforeDrive.z);
      gameplay.drive(dt?model.state.travel:0,model.state.x,model.state.z);
      handleGameplayEvents();
      if(driving)followTruck(dt,false,dt?actualDistance:0);
    }else{
      const move=walkInput.sample(),p=gameplay.state.player,before={x:p.x,z:p.z};
      gameplay.walk(dt,move);
      handleGameplayEvents();
      updateCharacter(dt,dt?Math.hypot(p.x-before.x,p.z-before.z)/dt:0);
      if(!driving)followCharacter(dt);
    }
    updateFuelHud();updateJumpHud();updateEconomyHud();
  }
  if (!playing && transition && !dragging) {
    let t = Math.min(1, (now - transition.start) / 950),
      k = t * t * (3 - 2 * t);
    camera.position.lerpVectors(transition.fromP, transition.toP, k);
    controls.target.lerpVectors(transition.fromT, transition.toT, k);
    if (t === 1) transition = null;
  }
  if (!playing) controls.update();
  updateWorldLabels();
  renderer.render(scene, camera);
  if (first) {
    first = false;
    if(characterReady)document.getElementById("loading").hidden = true;
  }
}
requestAnimationFrame(frame);
