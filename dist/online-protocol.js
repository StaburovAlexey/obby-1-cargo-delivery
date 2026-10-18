import {CHARACTER_CATALOG, DEFAULT_CHARACTER_ID} from './character-catalog.js';
import {VEHICLE_CONFIG} from './economy-config.js';

export const PROTOCOL_VERSION = 2;
export const ROOM_CAPACITY = 20;
export const SNAPSHOT_HZ = 10;
export const FAR_SNAPSHOT_HZ = 2;
export const NEAR_ENTER_DISTANCE = 80;
export const NEAR_EXIT_DISTANCE = 100;
export const STATE_HEARTBEAT_MS = 1000;
export const WORLD_ID = 'current-seed-42';
export const SEAT_IDS = Object.freeze(Array.from({length:20},(_,i)=>`desk-${String(i+1).padStart(2,'0')}`));
export const STATE_LIMITS = Object.freeze({position:100_000,heading:1_000_000_000,speed:500,steer:Math.PI,wheelSpin:1_000_000_000,bodyPitch:Math.PI,bodyRoll:Math.PI,bodyBob:10,jumpElapsed:60,sequence:0xffffffff,teleportId:0xffffffff});
const characterIds=new Set(CHARACTER_CATALOG.map(item=>item.id));
const vehicleIds=new Set(VEHICLE_CONFIG.map(item=>item.id));
const seats=new Set(SEAT_IDS),modes=['walking','driving','studying'];
const keys=new Set(['seq','mode','characterId','vehicleId','position','quaternion','heading','speed','steer','wheelSpin','bodyPitch','bodyRoll','bodyBob','braking','airborne','jumpElapsed','paused','teleportId','seatId']);
const finite=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
const integer=(value,max)=>Number.isSafeInteger(value)&&value>=0&&value<=max;
export const nextPacketSequence=sequence=>(sequence+1)>>>0;

export function createInitialPlayerState() {
  return {seq:0,mode:'walking',characterId:DEFAULT_CHARACTER_ID,vehicleId:null,position:[0,0,0],quaternion:[0,0,0,1],heading:0,speed:0,steer:0,wheelSpin:0,bodyPitch:0,bodyRoll:0,bodyBob:0,braking:false,airborne:false,jumpElapsed:0,paused:false,teleportId:0,seatId:null};
}
export function sanitizePlayerState(input,{seatId=null,previousSeq=-1}={}) {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==keys.size||Object.keys(input).some(key=>!keys.has(key)))return null;
  if(!integer(input.seq,STATE_LIMITS.sequence)||input.seq<=previousSeq||!integer(input.teleportId,STATE_LIMITS.teleportId))return null;
  if(!modes.includes(input.mode)||!characterIds.has(input.characterId)||(input.vehicleId!==null&&!vehicleIds.has(input.vehicleId)))return null;
  if(input.seatId!==null&&!seats.has(input.seatId))return null;
  if(!Array.isArray(input.position)||input.position.length!==3||!input.position.every(v=>finite(v,-STATE_LIMITS.position,STATE_LIMITS.position)))return null;
  if(!Array.isArray(input.quaternion)||input.quaternion.length!==4||!input.quaternion.every(v=>finite(v,-1.01,1.01)))return null;
  const norm=Math.hypot(...input.quaternion);if(norm<.9||norm>1.1)return null;
  for(const key of ['heading','speed','steer','wheelSpin','bodyPitch','bodyRoll','bodyBob'])if(!finite(input[key],-STATE_LIMITS[key],STATE_LIMITS[key]))return null;
  if(!finite(input.jumpElapsed,0,STATE_LIMITS.jumpElapsed)||['braking','airborne','paused'].some(key=>typeof input[key]!=='boolean'))return null;
  if(input.mode==='driving'&&input.vehicleId===null)return null;
  return {...input,mode:input.mode==='studying'&&!seatId?'walking':input.mode,position:[...input.position],quaternion:input.quaternion.map(v=>v/norm),seatId:seats.has(seatId)?seatId:null};
}

// Fixed little-endian records: position 1cm, normalized quaternion 1/32767,
// heading pi/32767, speed 1/64 m/s, steer/pitch/roll .0001 rad, bob/jump .001.
// Wheel rotation stays float32 because it is unbounded and must interpolate through
// multiple full turns. Static character/vehicle IDs and seats travel only on control updates.
export const MOVEMENT_BYTES=47;
export const STATE_PACKET_BYTES=4+MOVEMENT_BYTES;
export const DELTA_HEADER_BYTES=16;
export const DELTA_ENTRY_BYTES=2+MOVEMENT_BYTES;
const MAGIC=0xd7,STATE=1,DELTA=2,TAU=Math.PI*2;
const wrap=angle=>((angle+Math.PI)%TAU+TAU)%TAU-Math.PI;
function viewOf(bytes){
  try{
    if(bytes instanceof ArrayBuffer)return new DataView(bytes);
    if(ArrayBuffer.isView(bytes))return new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  }catch{}
  return null;
}
function writeMovement(v,o,s){
  v.setUint32(o,s.seq,true);o+=4;v.setUint32(o,s.teleportId,true);o+=4;
  v.setUint8(o++,modes.indexOf(s.mode)|(s.braking?4:0)|(s.airborne?8:0)|(s.paused?16:0));
  for(const p of s.position){v.setInt32(o,Math.round(p*100),true);o+=4;}
  for(const q of s.quaternion){v.setInt16(o,Math.round(q*32767),true);o+=2;}
  v.setInt16(o,Math.round(wrap(s.heading)*32767/Math.PI),true);o+=2;
  v.setInt16(o,Math.round(s.speed*64),true);o+=2;
  v.setInt16(o,Math.max(-31415,Math.min(31415,Math.round(s.steer*10000))),true);o+=2;
  v.setFloat32(o,s.wheelSpin,true);o+=4;
  for(const key of ['bodyPitch','bodyRoll']){v.setInt16(o,Math.max(-31415,Math.min(31415,Math.round(s[key]*10000))),true);o+=2;}
  v.setInt16(o,Math.round(s.bodyBob*1000),true);o+=2;
  v.setUint16(o,Math.round(s.jumpElapsed*1000),true);
}
function readMovement(v,o){
  const seq=v.getUint32(o,true);o+=4;const teleportId=v.getUint32(o,true);o+=4;
  const flags=v.getUint8(o++);if((flags&0xe0)||(flags&3)>2)return null;
  const position=[],quaternion=[];
  for(let i=0;i<3;i++){position.push(v.getInt32(o,true)/100);o+=4;}
  for(let i=0;i<4;i++){quaternion.push(v.getInt16(o,true)/32767);o+=2;}
  const heading=v.getInt16(o,true)*Math.PI/32767;o+=2;
  const speed=v.getInt16(o,true)/64;o+=2;
  const steer=v.getInt16(o,true)/10000;o+=2;
  const wheelSpin=v.getFloat32(o,true);o+=4;
  const bodyPitch=v.getInt16(o,true)/10000;o+=2;const bodyRoll=v.getInt16(o,true)/10000;o+=2;
  const bodyBob=v.getInt16(o,true)/1000;o+=2;const jumpElapsed=v.getUint16(o,true)/1000;
  const state={seq,teleportId,mode:modes[flags&3],braking:!!(flags&4),airborne:!!(flags&8),paused:!!(flags&16),position,quaternion,heading,speed,steer,wheelSpin,bodyPitch,bodyRoll,bodyBob,jumpElapsed};
  // Fixed-width fields already establish their types. Validate the same numerical
  // bounds as JSON without creating and discarding a complete metadata-bearing state.
  const norm=Math.hypot(...quaternion);
  if(position.some(value=>Math.abs(value)>STATE_LIMITS.position)||norm<.9||norm>1.1||
    Math.abs(speed)>STATE_LIMITS.speed||Math.abs(steer)>STATE_LIMITS.steer||
    !finite(wheelSpin,-STATE_LIMITS.wheelSpin,STATE_LIMITS.wheelSpin)||
    Math.abs(bodyPitch)>STATE_LIMITS.bodyPitch||Math.abs(bodyRoll)>STATE_LIMITS.bodyRoll||
    Math.abs(bodyBob)>STATE_LIMITS.bodyBob||jumpElapsed>STATE_LIMITS.jumpElapsed)return null;
  for(let i=0;i<4;i++)quaternion[i]/=norm;
  return state;
}
function header(v,type,count){v.setUint8(0,MAGIC);v.setUint8(1,PROTOCOL_VERSION);v.setUint8(2,type);v.setUint8(3,count);}
function validHeader(v,type){return v&&v.byteLength>=4&&v.getUint8(0)===MAGIC&&v.getUint8(1)===PROTOCOL_VERSION&&v.getUint8(2)===type;}
export function encodeStatePacket(state){
  const clean=sanitizePlayerState(state,{seatId:state?.seatId});return clean?encodeValidatedStatePacket(clean):null;
}
// Internal fast path: callers must first validate with sanitizePlayerState/decodeStatePacket.
export function encodeValidatedStatePacket(state){
  const bytes=new Uint8Array(STATE_PACKET_BYTES),view=new DataView(bytes.buffer);header(view,STATE,1);writeMovement(view,4,state);return bytes;
}
export function decodeStatePacket(bytes,metadata=createInitialPlayerState(),options={}){
  const view=viewOf(bytes);if(!validHeader(view,STATE)||view.byteLength!==STATE_PACKET_BYTES||view.getUint8(3)!==1)return null;
  const motion=readMovement(view,4);return motion?sanitizePlayerState({...metadata,...motion},options):null;
}
export function encodeDeltaPacket({sequence,time,players}){
  if(!Array.isArray(players))return null;
  const records=[];
  for(const player of players){const packet=encodeStatePacket(player.state);if(!packet)return null;records.push({...player,movement:packet.subarray(4)});}
  return encodeDeltaPacketFromRecords({sequence,time,players:records});
}
// The room server caches these locally encoded records once per accepted state.
// This entry point never receives raw client bytes: decodeStatePacket validates those first.
export function encodeDeltaPacketFromRecords({sequence,time,players}){
  if(!integer(sequence,0xffffffff)||!finite(time,0,Number.MAX_SAFE_INTEGER)||!Array.isArray(players)||!players.length||players.length>ROOM_CAPACITY)return null;
  const ids=new Set(),bytes=new Uint8Array(DELTA_HEADER_BYTES+players.length*DELTA_ENTRY_BYTES),view=new DataView(bytes.buffer);header(view,DELTA,players.length);view.setUint32(4,sequence,true);view.setFloat64(8,time,true);
  let offset=DELTA_HEADER_BYTES;
  for(const player of players){
    if(!integer(player.slot,ROOM_CAPACITY-1)||ids.has(player.slot)||![100,500].includes(player.cadenceMs)||!(player.movement instanceof Uint8Array)||player.movement.length!==MOVEMENT_BYTES)return null;ids.add(player.slot);
    view.setUint8(offset++,player.slot);view.setUint8(offset++,player.cadenceMs===500?5:1);bytes.set(player.movement,offset);offset+=MOVEMENT_BYTES;
  }
  return bytes;
}
export function decodeDeltaPacket(bytes){
  const view=viewOf(bytes);if(!validHeader(view,DELTA))return null;const count=view.getUint8(3);
  if(!count||count>ROOM_CAPACITY||view.byteLength!==DELTA_HEADER_BYTES+count*DELTA_ENTRY_BYTES)return null;
  const time=view.getFloat64(8,true);if(!finite(time,0,Number.MAX_SAFE_INTEGER))return null;
  const players=[],ids=new Set();let offset=DELTA_HEADER_BYTES;
  for(let i=0;i<count;i++){
    const slot=view.getUint8(offset++),cadence=view.getUint8(offset++),state=readMovement(view,offset);offset+=MOVEMENT_BYTES;
    if(slot>=ROOM_CAPACITY||ids.has(slot)||![1,5].includes(cadence)||!state)return null;ids.add(slot);
    players.push({slot,cadenceMs:cadence*100,state});
  }
  return {type:'delta',sequence:view.getUint32(4,true),time,players};
}
export function sameMovement(a,b){
  if(!a||!b||a.length!==b.length)return false;
  // Sequence is an envelope counter, not a visual change.
  for(let i=8;i<a.length;i++)if(a[i]!==b[i])return false;return true;
}
export function isImmediateStateChange(a,b){
  return !a||['mode','characterId','vehicleId','teleportId','paused','airborne','braking','seatId'].some(key=>a[key]!==b[key]);
}
