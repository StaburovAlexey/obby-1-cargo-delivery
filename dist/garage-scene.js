



import { createEnvironmentMaterial } from './building-material.js';
import { createVehicleRig } from './vehicle-rig.js';
import { groundHeight, fitTruckToGround } from './city-driving.js';
import { routePointAtDistance, biomeAt, TRUCK_HALF_WIDTH, TRUCK_HALF_LENGTH } from './road-layout.js';
import { DELIVERY_CHECKPOINTS, ECONOMY_CONFIG, vehicleConfig } from './economy-config.js';

const HANGAR_BOUNDS = Object.freeze({ minX: -57, maxX: 31, minZ: 26, maxZ: 90 });
const PARKING_BAYS = Object.freeze(Array.from({length:10},(_,i)=>Object.freeze({
  id:`parking-${String(i+1).padStart(2,'0')}`,row:'right',column:i+1,
  x:24,z:30+i*4.8,heading:Math.PI/2,halfWidth:4.5,halfLength:2.25,
})));




const REWARD_CENTER_Z=(75.169616825+HANGAR_BOUNDS.maxZ)/2;
export const REWARD_PEDESTAL = Object.freeze({
  id:'reward-pedestal',x:24,z:REWARD_CENTER_Z,heading:Math.PI/2,radius:4.9,height:.65,
  restPitch:-.09,rotationSpeed:.14,tiltClearance:.4,
  approach:Object.freeze({x:16.8,z:REWARD_CENTER_Z-1.8}),approachRadius:.9,
});
export const CHARACTER_STANDS = Object.freeze(Array.from({length:17},(_,i)=>Object.freeze({


  index:i,x:-46+i*3.5,z:85,
  heading:0,triggerRadius:1.25,
})).map(s=>Object.freeze({...s,trigger:Object.freeze({x:s.x,z:s.z-3})})));



export const CLASSROOM_DESKS = Object.freeze([38,44,50,56].flatMap((z,row)=>[-51,-46,-41,-36,-31].map((x,col)=>Object.freeze({
  id:`desk-${String(row*5+col+1).padStart(2,'0')}`,row:row+1,column:col+1,x,z,width:2.4,depth:2,
  seat:Object.freeze({x,z:z+1.5,heading:0,height:.50}),
  bounds:Object.freeze({minX:x-1.2,maxX:x+1.2,minZ:z-1,maxZ:z+1,minY:0,maxY:1.35}),
}))));


const CLASSROOM_EXIT = Object.freeze({x:-22,z:65.5,heading:0});
const SCHOOL_COLORS = [0x80d46b,0x52c7e8,0x779dff,0xc18af3,0xffb65b];
export const CLASSROOM_ENTRIES = Object.freeze([-51,-46,-41,-36,-31].map((x,index)=>Object.freeze({
  id:`school-${index+1}`,x,z:64,radius:1.6,rearmRadius:2.1,
  exit:CLASSROOM_EXIT,color:SCHOOL_COLORS[index],labelAnchor:Object.freeze({x,y:3.6,z:64}),
})));
export const CLASSROOM_ENTRY = CLASSROOM_ENTRIES[0];
export const GARAGE_LAYOUT = Object.freeze({
  ...HANGAR_BOUNDS,bounds:HANGAR_BOUNDS,center:Object.freeze({x:-13,z:58}),
  frontZ:26,rearZ:90,entranceZ:26,entranceHalfWidth:8,detached:true,roadside:true,roadGap:3,
  roofHeight:20,spawn:Object.freeze({x:0,z:60}),bays:PARKING_BAYS,
  rewardPedestal:REWARD_PEDESTAL,
});



export const FUEL_STATION_SPECS = Object.freeze(DELIVERY_CHECKPOINTS.map(p=>Object.freeze({...p,id:`fuel-${p.id}`,checkpointId:p.id,branch:'main'})));
export const DELIVERY_SPECS = Object.freeze(DELIVERY_CHECKPOINTS.map(p=>Object.freeze({...p,id:`delivery-${p.id}`,checkpointId:p.id,branch:'main'})));

const VEHICLES = Object.freeze([
  { id: 'pickup', color: 0xf38c27, shape: 'pickup', bay: 0 },
  { id: 'rover', color: 0x268ac1, shape: 'rover', bay: 2 },
  { id: 'van', color: 0xe8e1c4, shape: 'van', bay: 4 },
  { id: 'citycourier', color: 0xd84343, shape: 'rover', bay: 1 },
  { id: 'foresthauler', color: 0x467540, shape: 'pickup', bay: 3 },
  { id: 'desertscout', color: 0xe2b349, shape: 'rover', bay: 5 },
  { id: 'snowgrip', color: 0x43c5db, shape: 'rover', bay: 6 },
  { id: 'snowrunner', color: 0xa5b8db, shape: 'van', bay: 7 },
  { id: 'lavacrawler', color: 0x554e56, shape: 'pickup', bay: 8 },
  { id: 'ashhauler', color: 0x914a5e, shape: 'van', bay: 9 },
  { id: 'bmwreward', color: 0x274c86, shape: 'rover', rewardDisplay: true },
].map(spec=>Object.freeze({...spec,name:vehicleConfig(spec.id).name})));







export function rewardDisplayPose(THREE, vehicle, time = 0) {
  if (!vehicle?.rewardDisplay || !vehicle.pedestal) return null;
  const pedestal=vehicle.pedestal;
  let lift=pedestal.tiltClearance;
  const bounds=vehicle.visual?.metadata?.bounds;
  if (bounds?.min?.length===3 && bounds?.max?.length===3 &&
      [...bounds.min,...bounds.max].every(Number.isFinite)) {
    const c=Math.cos(pedestal.restPitch),s=Math.sin(pedestal.restPitch);
    const bottom=Math.min(...[bounds.min[1],bounds.max[1]].flatMap(y=>
      [bounds.min[2],bounds.max[2]].map(z=>y*c-z*s)));
    lift=Math.max(lift,.05-bottom);
  }
  const yaw=pedestal.heading+(Number.isFinite(time)?time:0)*pedestal.rotationSpeed;
  return {
    position:new THREE.Vector3(pedestal.x,pedestal.topY+lift,pedestal.z),
    quaternion:new THREE.Quaternion().setFromEuler(new THREE.Euler(pedestal.restPitch,yaw,0,'YXZ')),
    steerAngle:0,wheelSpin:0,bodyPitch:0,bodyRoll:0,bodyBob:0,
  };
}





export function garageWallContact(x, z, heading = 0, walls = [], {
  halfWidth = TRUCK_HALF_WIDTH, halfLength = TRUCK_HALF_LENGTH, padding = 0.04,
} = {}) {
  if (![x, z, heading, halfWidth, halfLength, padding].every(Number.isFinite) ||
      halfWidth < 0 || halfLength < 0 || padding < 0) return undefined;
  const c = Math.cos(heading), s = Math.sin(heading);
  const axes = [[1, 0], [0, 1], [c, -s], [-s, -c]];
  let deepest;
  for (const wall of walls) {
    const dx = x - (wall.minX + wall.maxX) / 2;
    const dz = z - (wall.minZ + wall.maxZ) / 2;
    const ex = (wall.maxX - wall.minX) / 2 + padding;
    const ez = (wall.maxZ - wall.minZ) / 2 + padding;
    let depth = Infinity, normalX = 0, normalZ = 0;
    for (const [ax, az] of axes) {
      const projected = dx * ax + dz * az;
      const overlap = halfWidth * Math.abs(c * ax - s * az) +
        halfLength * Math.abs(-s * ax - c * az) + ex * Math.abs(ax) + ez * Math.abs(az) - Math.abs(projected);
      if (overlap <= 0) { depth = 0; break; }
      if (overlap < depth) {
        depth = overlap;
        const side = projected < 0 ? -1 : 1;
        normalX = ax * side; normalZ = az * side;
      }
    }
    if (depth > 0 && Number.isFinite(depth) && (!deepest || depth > deepest.depth))
      deepest = { normalX, normalZ, depth, name: wall.name };
  }
  return deepest;
}

export function createGarageScene(THREE, city) {
  if (!city?.group?.isGroup) throw new TypeError('Garage scene requires a built city.');
  const group = new THREE.Group();
  group.name = 'Garage and roadside fuel';
  const hangar = new THREE.Group();
  hangar.name = 'Open-door ten-bay hangar, reward pedestal and classroom';
  group.add(hangar);
  const geometries = new Set(), materials = new Set(), batches = [];
  const ownGeometry = geometry => (geometries.add(geometry), geometry);
  const ownMaterial = material => (materials.add(material), material);
  const boxGeometry = ownGeometry(new THREE.BoxGeometry(1, 1, 1));
  const environmentMaterial = ownMaterial(createEnvironmentMaterial(THREE));
  const matrixObject = new THREE.Object3D();
  const entry = (name, position, scale, color, rotation = [0, 0, 0]) => ({ name, position, scale, color, rotation });

  function batch(parent, name, geometry, material, parts, origin = [0, 0, 0]) {
    const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
    mesh.name = name;
    parts.forEach((part, i) => {
      matrixObject.position.set(...part.position).add(new THREE.Vector3(...origin));
      matrixObject.scale.set(...part.scale);
      matrixObject.rotation.set(...part.rotation);
      matrixObject.updateMatrix();
      mesh.setMatrixAt(i, matrixObject.matrix);
      mesh.setColorAt(i, new THREE.Color(part.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.userData.partNames = parts.map(part => part.name);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    parent.add(mesh); batches.push(mesh);
    return mesh;
  }

  const floorY = groundHeight(0, GARAGE_LAYOUT.center.z);
  const rewardPedestal={...REWARD_PEDESTAL,baseY:floorY,topY:floorY+REWARD_PEDESTAL.height,
    pose:Object.freeze({x:REWARD_PEDESTAL.x,y:floorY+REWARD_PEDESTAL.height+REWARD_PEDESTAL.tiltClearance,z:REWARD_PEDESTAL.z})};
  const hangarParts = [
    entry('Flush roadside entrance apron',[0,floorY-.05,24],[16,.1,2],0x8a806b),
    entry('Garage floor', [-13, floorY - 0.2, 58], [90, 0.4, 66], 0x8a806b),
    entry('Garage left wall', [-57.4, 10, 58], [0.8, 20, 65.6], 0xb87b3c),
    entry('Garage right wall', [31.4, 10, 58], [0.8, 20, 65.6], 0xb87b3c),
    entry('Garage front left wall', [-32.9, 10, 25.6], [49.8, 20, 0.8], 0xa1662e),
    entry('Garage front right wall', [19.9, 10, 25.6], [23.8, 20, 0.8], 0xa1662e),
    entry('Garage door lintel', [0, 15, 25.6], [16, 10, .8], 0xa1662e),
    entry('Garage rear wall', [-13, 10, 90.4], [89.6, 20, 0.8], 0xa1662e),
    entry('Garage roof', [-13, 20.3, 58], [90, 0.6, 66], 0xc99550),
    entry('Open door left trim', [-8.1,5,26.06],[.2,10,.16],0xe3d4a6),
    entry('Open door right trim', [8.1,5,26.06],[.2,10,.16],0xe3d4a6),
    entry('Open door threshold', [0,floorY+.012,26.5],[16,.014,.24],0xefbc55),
    entry('Garage rear stripe', [-13, 3.5, 89.98], [88, 0.5, 0.025], 0xefbc55),
  ];
  const walls = [
    { name: 'Garage left wall', minX: -57.8, maxX: -57, minZ: 25.2, maxZ: 90.8 },
    { name: 'Garage right wall', minX: 31, maxX: 31.8, minZ: 25.2, maxZ: 90.8 },
    { name: 'Garage front left wall', minX: -57.8, maxX: -8, minZ: 25.2, maxZ: 26 },
    { name: 'Garage front right wall', minX: 8, maxX: 31.8, minZ: 25.2, maxZ: 26 },
    { name: 'Garage rear wall', minX: -57.8, maxX: 31.8, minZ: 90, maxZ: 90.8 },
  ];
  for (const bay of GARAGE_LAYOUT.bays) {
    for (const side of [-1, 1]) {
      hangarParts.push(entry(`Parking bay ${bay.id} ${side < 0 ? 'left' : 'right'} edge`,
        [bay.x + side * bay.halfWidth, floorY + 0.009, bay.z],
        [0.13, 0.012, bay.halfLength * 2], 0xe8e3be));
      hangarParts.push(entry(`Parking bay ${bay.id} ${side < 0 ? 'front' : 'rear'} edge`,
        [bay.x, floorY + 0.009, bay.z + side * bay.halfLength],
        [bay.halfWidth * 2 + 0.13, 0.012, 0.13], 0xe8e3be));
    }
  }
  for (const x of [-48,-36,-24,-12,0,12,24])
    hangarParts.push(entry('Garage ceiling strip', [x, 19.85, 58], [0.22, 0.08, 55], 0xe8f5cc));
  const classroomSolids=[];
  hangarParts.push(entry('Separate classroom floor',[-41,floorY+.007,47],[26,.012,32],0xc69b4d));


  const digitSegments = ['bc','abged','abgcd','fgbc','afgcd'];
  const segmentShapes = {
    a:[0,-.68,.76,.15],b:[.38,-.34,.15,.57],c:[.38,.34,.15,.57],
    d:[0,.68,.76,.15],e:[-.38,.34,.15,.57],f:[-.38,-.34,.15,.57],g:[0,0,.76,.15],
  };
  for(const [index,school] of CLASSROOM_ENTRIES.entries()){
    for(const segment of digitSegments[index]){
      const [dx,dz,width,depth]=segmentShapes[segment];
      hangarParts.push(entry(`School ${school.id} floor number ${index+1}`,[school.x+dx,floorY+.035,school.z+dz],[width,.012,depth],0xfff4d6));
    }
  }
  for(const desk of CLASSROOM_DESKS){
    const {x,z,seat}=desk;
    hangarParts.push(entry(`Classroom ${desk.id} tabletop`,[x,1.25,z],[desk.width,.2,desk.depth],0xd9ac64));
    for(const dx of [-1.05,1.05])for(const dz of [-.8,.8])hangarParts.push(entry('Desk leg',[x+dx,.575,z+dz],[.12,1.15,.12],0x453024));
    hangarParts.push(entry(`Classroom ${desk.id} chair seat`,[x,.43,seat.z+.04],[1.8,.14,.32],0x168cc7));
    for(const side of [-1,1])hangarParts.push(entry('Chair rear seat wing',[x+side*.45,.43,seat.z+.41],[.40,.14,.42],0x168cc7));
    hangarParts.push(entry('Chair upper back rail',[x,1.8,seat.z+.83],[1.8,.5,.15],0x168cc7));
    for(const side of [-1,1])hangarParts.push(entry('Chair back sidepost',[x+side*.8,1.0,seat.z+.83],[.12,1.5,.12],0x453024));
    for(const side of [-1,1])hangarParts.push(entry('Chair rear side connector',[x+side*.65,.43,seat.z+.69],[.30,.10,.28],0x453024));
    for(const dx of [-.75,.75])for(const dz of [-.05,.55])hangarParts.push(entry('Chair leg',[x+dx,.18,seat.z+dz],[.12,.36,.12],0x453024));
    classroomSolids.push({...desk.bounds,id:desk.id,type:'desk'});
    classroomSolids.push({id:desk.id,type:'chair',minX:x-.92,maxX:x+.92,minZ:seat.z-.12,maxZ:seat.z+.92,minY:0,maxY:2.05});
  }
  hangarParts.push(entry('PDD classroom board',[-41,4.2,32],[16,5,.25],0x104b30));

  hangarParts.push(entry('Board road vertical',[-41,4.2,32.15],[1.1,4.4,.03],0xd4e5d5));
  hangarParts.push(entry('Board road horizontal',[-41,4.2,32.16],[14,1.1,.03],0xd4e5d5));
  for(const [y,color] of [[5.7,0xe44934],[4.8,0xe9bb3f],[3.9,0x58b577]])hangarParts.push(entry('PDD traffic light',[-35,y,32.2],[.55,.55,.06],color));
  hangarParts.push(entry('PDD crossing sign',[-47.5,4.2,32.2],[1.4,1.4,.08],0x298dc5));
  for(let i=0;i<5;i++)hangarParts.push(entry('PDD crossing marking',[-47.5,3.85+i*.16,32.26],[1,.065,.035],0xf1efd7));
  for(const stand of CHARACTER_STANDS){
    hangarParts.push(entry(`Character stand ${stand.index+1}`,[stand.x,.08,stand.z],[3,.16,3],0xd3b77a));
    hangarParts.push(entry('Character approach marker',[stand.trigger.x,.018,stand.trigger.z],[1.7,.02,1.1],0xeec45e));
  }
  const shell = batch(hangar, 'Garage shell and flush bay markings', boxGeometry, environmentMaterial, hangarParts);
  shell.userData.parkingBayIds = GARAGE_LAYOUT.bays.map(bay => bay.id);
  hangar.userData = { detached: true, closed: false, parkingBayCount: GARAGE_LAYOUT.bays.length, rewardDisplayCount:1 };

  const pedestalGeometry=ownGeometry(new THREE.CylinderGeometry(1,1,1,64));
  const pedestalMesh=batch(hangar,'BMW reward display pedestal',pedestalGeometry,environmentMaterial,[
    entry('Reward pedestal foundation',[rewardPedestal.x,floorY+.25,rewardPedestal.z],[4.9,.5,4.9],0x233342),
    entry('Reward pedestal silver rim',[rewardPedestal.x,floorY+.515,rewardPedestal.z],[4.82,.03,4.82],0xdce8f0),
    entry('Reward pedestal top',[rewardPedestal.x,floorY+.59,rewardPedestal.z],[4.75,.12,4.75],0x34495b),
  ]);
  pedestalMesh.userData.rewardDisplay=true;
  const pedestalSolids=[{id:rewardPedestal.id,type:'pedestal',
    minX:rewardPedestal.x-rewardPedestal.radius,maxX:rewardPedestal.x+rewardPedestal.radius,
    minZ:rewardPedestal.z-rewardPedestal.radius,maxZ:rewardPedestal.z+rewardPedestal.radius,
    minY:floorY,maxY:rewardPedestal.topY}];
  const rewardMarkerGeometry=ownGeometry(new THREE.RingGeometry(.6,.82,48));rewardMarkerGeometry.rotateX(-Math.PI/2);
  const rewardMarkerMaterial=ownMaterial(new THREE.MeshBasicMaterial({color:0x89c6ff,side:THREE.DoubleSide,toneMapped:false}));
  const rewardMarker=new THREE.Mesh(rewardMarkerGeometry,rewardMarkerMaterial);
  rewardMarker.name='BMW reward display approach';
  rewardMarker.position.set(rewardPedestal.approach.x,floorY+.035,rewardPedestal.approach.z);
  rewardMarker.userData={nonBlocking:true,vehicleId:'bmwreward',triggerRadius:rewardPedestal.approachRadius};
  hangar.add(rewardMarker);

  const markerGeometry=ownGeometry(new THREE.RingGeometry(1.3,1.6,48));markerGeometry.rotateX(-Math.PI/2);
  const classMarkers=CLASSROOM_ENTRIES.map(school=>{
    const markerMaterial=ownMaterial(new THREE.MeshBasicMaterial({color:school.color,side:THREE.DoubleSide,toneMapped:false}));
    const marker=new THREE.Mesh(markerGeometry,markerMaterial);
    marker.name=`Classroom entry ${school.id}: choose a free seat`;
    marker.position.set(school.x,floorY+.035,school.z);
    marker.userData={nonBlocking:true,schoolId:school.id,labelAnchor:school.labelAnchor};
    hangar.add(marker);return marker;
  });
  const classMarker=classMarkers[0];

  const cargoMaterial=ownMaterial(createEnvironmentMaterial(THREE));cargoMaterial.color.setHex(0xe5ab46);
  const vehicles = VEHICLES.map(spec => {
    const root = new THREE.Group();
    const parked = spec.rewardDisplay?{id:rewardPedestal.id,row:'right',column:11,
      x:rewardPedestal.x,z:rewardPedestal.z,heading:rewardPedestal.heading,
      halfWidth:rewardPedestal.radius,halfLength:rewardPedestal.radius}:GARAGE_LAYOUT.bays[spec.bay];
    const pose = fitTruckToGround(THREE, parked.x, parked.z, parked.heading);
    const rigContainer = new THREE.Group();
    rigContainer.add(root); group.add(rigContainer);
    const initialPose=spec.rewardDisplay?rewardDisplayPose(THREE,{rewardDisplay:true,pedestal:rewardPedestal}):pose;
    root.position.copy(initialPose.position);
    root.quaternion.copy(initialPose.quaternion);
    const rig = createVehicleRig(THREE, root);
    root.name = `Garage vehicle · ${spec.id}`;
    root.userData.vehicleId = spec.id;
    root.userData.specialty = vehicleConfig(spec.id).specialty;
    root.userData.pairRole = vehicleConfig(spec.id).pairRole;

    const cargo=new THREE.Group();cargo.name='Delivery cargo anchor';cargo.visible=false;root.add(cargo);
    return { id: spec.id, name: spec.name, color: spec.color, shape: spec.shape,
      rig, root, cargo, config:vehicleConfig(spec.id), group: rigContainer, parkingId: parked.id, park: { ...parked },
      ...(spec.rewardDisplay?{rewardDisplay:true,pedestal:rewardPedestal,
        parkedFootprint:{halfWidth:rewardPedestal.radius,halfLength:rewardPedestal.radius},
        approachRadius:rewardPedestal.approachRadius}:{}),
      priceAnchor: { x: parked.x, y: groundHeight(parked.x,parked.z)+6.1+(spec.rewardDisplay?rewardPedestal.height+rewardPedestal.tiltClearance:0), z: parked.z },
      approach: spec.rewardDisplay?{...rewardPedestal.approach}:{ x: parked.x-5.15, z: parked.z },
      footprint: { halfWidth: TRUCK_HALF_WIDTH, halfLength: TRUCK_HALF_LENGTH } };
  });
  const vehicleMarkers=vehicles.filter(vehicle=>!vehicle.rewardDisplay).map(vehicle=>{
    const marker=new THREE.Mesh(rewardMarkerGeometry,rewardMarkerMaterial);
    marker.name=`Vehicle approach · ${vehicle.id}`;
    marker.position.set(vehicle.approach.x,floorY+.035,vehicle.approach.z);
    marker.userData={nonBlocking:true,vehicleId:vehicle.id};
    hangar.add(marker);vehicle.approachMarker=marker;
    return marker;
  });

  const bright = ownMaterial(new THREE.MeshBasicMaterial({ color: 0x6dffd1, side: THREE.DoubleSide, toneMapped: false }));
  const aura = ownMaterial(new THREE.MeshBasicMaterial({ color: 0x54ffc9, transparent: true, opacity: 0.17,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  const canMaterial = ownMaterial(createEnvironmentMaterial(THREE));
  canMaterial.emissive.setHex(0x720d09); canMaterial.emissiveIntensity = 0.45;
  const canParts = [
    entry('Fuel canister body', [0, 0, 0], [1.32, 1.63, 0.62], 0xe83b32),
    entry('Fuel canister base', [0, -0.79, 0], [1.39, 0.16, 0.68], 0x4d1e1c),
    entry('Fuel canister handle left', [-0.4, 1.02, 0], [0.14, 0.57, 0.25], 0x302527),
    entry('Fuel canister handle right', [0.32, 1.02, 0], [0.14, 0.57, 0.25], 0x302527),
    entry('Fuel canister handle top', [-0.04, 1.31, 0], [0.86, 0.16, 0.25], 0x302527),
    entry('Fuel canister spout', [0.7, 0.83, 0], [0.3, 0.69, 0.31], 0xe83b32, [0, 0, -0.5]),
    entry('Fuel canister cap', [0.87, 1.14, 0], [0.37, 0.19, 0.37], 0x302527, [0, 0, -0.5]),
    entry('Fuel canister emboss A', [0, 0, -0.33], [0.075, 1.13, 0.045], 0x8e211b, [0, 0, 0.62]),
    entry('Fuel canister emboss B', [0, 0, -0.33], [0.075, 1.13, 0.045], 0x8e211b, [0, 0, -0.62]),
  ];
  const deliveryBright=ownMaterial(new THREE.MeshBasicMaterial({color:0xffd539,side:THREE.DoubleSide,toneMapped:false}));
  const deliveryAura=ownMaterial(new THREE.MeshBasicMaterial({color:0xffbe28,transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}));
  const crateParts=[entry('Delivery crate',[0,0,0],[1.7,1.6,1.5],0xe6aa44),entry('Crate vertical band',[0,0,-.765],[.25,1.64,.045],0xffe29a),entry('Crate horizontal band',[0,0,-.79],[1.72,.25,.04],0xffe29a),entry('Crate top band',[0,.815,0],[.25,.035,1.52],0xffe29a)];
  function checkpoint(spec,index,kind) {
    const route=routePointAtDistance(spec.distance),side=kind==='delivery'?-1:1;
    const x=route.x+side*ECONOMY_CONFIG.checkpointOffset*route.right.x,z=route.z+side*ECONOMY_CONFIG.checkpointOffset*route.right.z;
    const isDelivery=kind==='delivery',rimMaterial=isDelivery?deliveryBright:bright,glowMaterial=isDelivery?deliveryAura:aura;
    const stationGroup = new THREE.Group();
    stationGroup.name = `${isDelivery?'Delivery':'Fuel'} checkpoint · ${spec.id}`;
    stationGroup.position.set(x, 0, z);
    stationGroup.userData.nonBlocking = true;
    group.add(stationGroup);
    function ring(inner, outer, material, name, lift) {
      const points = [], uvs = [], indices = [], segments = 48;
      for (let i = 0; i <= segments; i++) {
        const angle = i / segments * Math.PI * 2;
        for (const radius of [inner, outer]) {
          const dx = Math.cos(angle) * radius, dz = Math.sin(angle) * radius;
          points.push(dx, groundHeight(x + dx, z + dz) + lift, dz);
          uvs.push((dx / outer + 1) / 2, (dz / outer + 1) / 2);
        }
        if (i < segments) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      const geometry = ownGeometry(new THREE.BufferGeometry());
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices); geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name; mesh.userData.nonBlocking = true; mesh.userData.groundLift = lift;
      mesh.renderOrder = 2; stationGroup.add(mesh);
      return mesh;
    }
    const glow = ring(4.38, 4.85, glowMaterial, 'Checkpoint circle soft outer glow', 0.04);
    ring(0.001, 4.24, glowMaterial, 'Checkpoint circle translucent center', 0.026);
    const circle = ring(4.24, 4.4, rimMaterial, 'Checkpoint circle luminous rim', 0.044);
    const canister = new THREE.Group();
    canister.name = isDelivery?'Floating delivery crate':'Floating fuel canister';
    canister.position.y = groundHeight(x, z) + 5.2;
    batch(canister, isDelivery?'Procedural delivery crate':'Procedural fuel canister', boxGeometry, isDelivery?cargoMaterial:canMaterial, isDelivery?crateParts:canParts);
    canister.children[0].castShadow = false;
    stationGroup.add(canister);
    return { ...spec, x, z, y: groundHeight(x, z), radius: 4.4,
      kind, route, biome: route.biome, group: stationGroup, circle, glow, canister,
      phase: index * 0.91, nonBlocking: true };
  }
  const stations=FUEL_STATION_SPECS.map((spec,index)=>checkpoint(spec,index,'fuel'));
  const deliveries=DELIVERY_SPECS.map((spec,index)=>checkpoint(spec,index,'delivery'));
  group.userData = { garage: { ...GARAGE_LAYOUT }, parkingBayCount: GARAGE_LAYOUT.bays.length, vehicleCount: vehicles.length,
    fuelStationCount: stations.length, deliveryPointCount: deliveries.length, procedural: true, sharedMaterialPattern: 'grass-checker' };
  let disposed = false;
  return {
    group, hangar, vehicles, stations, deliveries, walls, classroomSolids,
    pedestalSolids,walkingSolids:[...classroomSolids,...pedestalSolids],rewardPedestal,rewardMarker,vehicleMarkers,
    desks:CLASSROOM_DESKS, stands:CHARACTER_STANDS,
    classroomEntries:CLASSROOM_ENTRIES, classMarkers, classroomEntry:CLASSROOM_ENTRY, classMarker,
    layout: GARAGE_LAYOUT,
    bounds: GARAGE_LAYOUT.bounds,
    spawn: { ...GARAGE_LAYOUT.spawn, y: floorY },
    getContact(x, z, heading = 0, options) { return garageWallContact(x, z, heading, walls, options); },
    animate(time) {
      if (disposed || !Number.isFinite(time)) return;
      for (const station of [...stations,...deliveries]) {
        station.canister.rotation.y = time * 0.68 + station.phase;
        station.canister.position.y = station.y + 5.2 + 0.24 * Math.sin(time * 2.1 + station.phase);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const vehicle of vehicles) vehicle.rig.dispose();
      for (const mesh of batches) mesh.dispose();
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      group.removeFromParent();
    },
  };
}
