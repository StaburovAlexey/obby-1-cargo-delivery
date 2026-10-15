import {CHARACTER_CATALOG, DEFAULT_CHARACTER_ID} from './character-catalog.js';
import {VEHICLE_CONFIG} from './economy-config.js';

export const PROTOCOL_VERSION = 1;
export const ROOM_CAPACITY = 20;
export const SNAPSHOT_HZ = 10;
export const WORLD_ID = 'current-seed-42';
export const SEAT_IDS = Object.freeze(Array.from({length:20},(_,i)=>`desk-${String(i+1).padStart(2,'0')}`));
export const STATE_LIMITS = Object.freeze({position:100_000,heading:1_000_000_000,speed:500,steer:Math.PI,wheelSpin:1_000_000_000,bodyPitch:Math.PI,bodyRoll:Math.PI,bodyBob:10,jumpElapsed:60,sequence:0xffffffff,teleportId:0xffffffff});
const characterIds=new Set(CHARACTER_CATALOG.map(item=>item.id));
const vehicleIds=new Set(VEHICLE_CONFIG.map(item=>item.id));
const seats=new Set(SEAT_IDS);
const modes=new Set(['walking','driving','studying']);
const keys=new Set(['seq','mode','characterId','vehicleId','position','quaternion','heading','speed','steer','wheelSpin','bodyPitch','bodyRoll','bodyBob','braking','airborne','jumpElapsed','paused','teleportId','seatId']);
const finite=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
const integer=(value,max)=>Number.isSafeInteger(value)&&value>=0&&value<=max;

export function createInitialPlayerState() {
  return {seq:0,mode:'walking',characterId:DEFAULT_CHARACTER_ID,vehicleId:null,position:[0,0,0],quaternion:[0,0,0,1],heading:0,speed:0,steer:0,wheelSpin:0,bodyPitch:0,bodyRoll:0,bodyBob:0,braking:false,airborne:false,jumpElapsed:0,paused:false,teleportId:0,seatId:null};
}


export function sanitizePlayerState(input,{seatId=null,previousSeq=-1}={}) {
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==keys.size||Object.keys(input).some(key=>!keys.has(key)))return null;
  if(!integer(input.seq,STATE_LIMITS.sequence)||input.seq<=previousSeq||!integer(input.teleportId,STATE_LIMITS.teleportId))return null;
  if(!modes.has(input.mode)||!characterIds.has(input.characterId)||(input.vehicleId!==null&&!vehicleIds.has(input.vehicleId)))return null;
  if(input.seatId!==null&&!seats.has(input.seatId))return null;
  if(!Array.isArray(input.position)||input.position.length!==3||!input.position.every(v=>finite(v,-STATE_LIMITS.position,STATE_LIMITS.position)))return null;
  if(!Array.isArray(input.quaternion)||input.quaternion.length!==4||!input.quaternion.every(v=>finite(v,-1.01,1.01)))return null;
  const norm=Math.hypot(...input.quaternion);if(norm<.9||norm>1.1)return null;
  for(const key of ['heading','speed','steer','wheelSpin','bodyPitch','bodyRoll','bodyBob'])if(!finite(input[key],-STATE_LIMITS[key],STATE_LIMITS[key]))return null;
  if(!finite(input.jumpElapsed,0,STATE_LIMITS.jumpElapsed)||['braking','airborne','paused'].some(key=>typeof input[key]!=='boolean'))return null;
  if(input.mode==='driving'&&input.vehicleId===null)return null;
  return {...input,mode:input.mode==='studying'&&!seatId?'walking':input.mode,position:[...input.position],quaternion:input.quaternion.map(v=>v/norm),seatId:seats.has(seatId)?seatId:null};
}
