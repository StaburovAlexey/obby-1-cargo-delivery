import assert from 'node:assert/strict';
import test from 'node:test';
import {createInitialPlayerState,sanitizePlayerState,encodeStatePacket,decodeStatePacket,encodeDeltaPacket,decodeDeltaPacket,
  encodeDeltaPacketFromRecords,sameMovement,STATE_PACKET_BYTES,MOVEMENT_BYTES,DELTA_HEADER_BYTES,DELTA_ENTRY_BYTES,PROTOCOL_VERSION} from '../dist/online-protocol.js';
const state=overrides=>({...createInitialPlayerState(),seq:1,...overrides});
const roundtrip=input=>decodeStatePacket(encodeStatePacket(input),input,{seatId:input.seatId});

test('v2 fixed layout preserves bounds and useful visual accuracy',()=>{
  const source=state({mode:'driving',vehicleId:'pickup',position:[100000,-100000,1234.5678],quaternion:[.1,.2,.3,Math.sqrt(.86)],heading:12345,speed:499.999,steer:Math.PI,wheelSpin:12345.678,bodyPitch:-Math.PI,bodyRoll:Math.PI,bodyBob:-10,jumpElapsed:60,teleportId:0xffffffff,seq:0xffffffff,paused:true,airborne:true,braking:true});
  const packet=encodeStatePacket(source),result=roundtrip(source);assert.equal(packet.length,51);assert.equal(STATE_PACKET_BYTES,51);assert.equal(MOVEMENT_BYTES,47);assert.equal(packet[1],PROTOCOL_VERSION);
  for(let i=0;i<3;i++)assert.ok(Math.abs(source.position[i]-result.position[i])<=.00501);
  assert.ok(Math.abs(Math.hypot(...result.quaternion)-1)<1e-12);assert.ok(result.quaternion.every((q,i)=>Math.abs(q-source.quaternion[i])<.00004));
  assert.ok(Math.abs(Math.atan2(Math.sin(result.heading-source.heading),Math.cos(result.heading-source.heading)))<Math.PI/32767);
  assert.ok(Math.abs(source.speed-result.speed)<=1/128);assert.ok(Math.abs(source.steer-result.steer)<.0001);assert.ok(Math.abs(source.wheelSpin-result.wheelSpin)<.001);
  assert.equal(result.seq,0xffffffff);assert.equal(result.teleportId,0xffffffff);assert.equal(result.jumpElapsed,60);assert.equal(result.bodyBob,-10);
  assert.equal(result.paused,true);assert.equal(result.airborne,true);assert.equal(result.braking,true);assert.equal(result.characterId,source.characterId);
  const normalized=roundtrip(state({quaternion:[0,0,0,1.01]}));assert.deepEqual(normalized.quaternion,[0,0,0,1]);
});
test('rejects malformed size, versions, flags, numeric encodings and stale state sequences',()=>{
  const packet=encodeStatePacket(state());
  for(const size of [0,3,50,52,999])assert.equal(decodeStatePacket(new Uint8Array(size)),null);
  for(const [offset,value]of [[0,0],[1,1],[2,2],[3,0],[12,0x20],[12,3]]){const bad=packet.slice();bad[offset]=value;assert.equal(decodeStatePacket(bad),null);}
  for(const [offset,type,value]of [[13,'setInt32',10000001],[25,'setInt16',0],[35,'setInt16',32767],[37,'setInt16',32767],[39,'setFloat32',NaN],[49,'setUint16',60001]]){
    const bad=packet.slice(),view=new DataView(bad.buffer);view[type](offset,value,true);
    if(offset===25){for(let i=0;i<4;i++)view.setInt16(25+i*2,0,true);}
    assert.equal(decodeStatePacket(bad),null,`invalid scalar at ${offset}`);
  }
  assert.equal(decodeStatePacket(packet,createInitialPlayerState(),{previousSeq:1}),null);
  for(const patch of [{position:[Infinity,0,0]},{wheelSpin:Infinity},{quaternion:[0,0,0,0]},{speed:501},{mode:'driving',vehicleId:null},{seq:-1},{seq:2,extra:1}])assert.equal(encodeStatePacket(state(patch)),null);
  assert.equal(sanitizePlayerState(state({mode:'studying',seatId:'desk-01'})).mode,'walking');
});
test('delta packets carry only changed slots and reject unknown/duplicate records atomically',()=>{
  const input={sequence:0xffffffff,time:12345,players:[{slot:0,cadenceMs:100,state:state()},{slot:19,cadenceMs:500,state:state({seq:22,position:[-9,0,7]})}]};
  const packet=encodeDeltaPacket(input),decoded=decodeDeltaPacket(packet);assert.equal(packet.length,16+49*2);assert.equal(packet.length,DELTA_HEADER_BYTES+DELTA_ENTRY_BYTES*2);assert.equal(decoded.sequence,0xffffffff);assert.deepEqual(decoded.players.map(p=>[p.slot,p.cadenceMs,p.state.seq]),[[0,100,1],[19,500,22]]);
  for(const [offset,value]of [[3,0],[3,21],[16,20],[17,2],[16+49,0]]){const bad=packet.slice();bad[offset]=value;assert.equal(decodeDeltaPacket(bad),null);}
  const badTime=packet.slice();new DataView(badTime.buffer).setFloat64(8,NaN,true);assert.equal(decodeDeltaPacket(badTime),null);
  assert.equal(decodeDeltaPacket(packet.subarray(0,-1)),null);assert.equal(decodeDeltaPacket(new Uint8Array(packet.length+1)),null);
  assert.equal(encodeDeltaPacket({...input,players:[input.players[0],input.players[0]]}),null);
  assert.equal(encodeDeltaPacket({...input,players:[]}),null);assert.equal(encodeDeltaPacketFromRecords({...input,players:[{slot:0,cadenceMs:100,movement:new Uint8Array(46)}]}),null);
  const offset=Buffer.concat([Buffer.alloc(7),Buffer.from(packet),Buffer.alloc(9)]).subarray(7,-9);assert.deepEqual(decodeDeltaPacket(offset),decoded,'Node Buffer byteOffset is respected');
});
test('stationary equality ignores only sequence and includes all visible state changes',()=>{
  const original=encodeStatePacket(state());assert.ok(sameMovement(original,encodeStatePacket(state({seq:99}))));
  for(const patch of [{position:[.02,0,0]},{teleportId:1},{paused:true},{braking:true},{airborne:true},{speed:1}])assert.equal(sameMovement(original,encodeStatePacket(state(patch))),false);
});

test('randomized finite states roundtrip and arbitrary binary input never throws',()=>{
  let seed=0x51ac1e;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/0x100000000);
  for(let i=0;i<500;i++){
    const q=Array.from({length:4},()=>random()*2-1),length=Math.hypot(...q);
    const input=state({seq:i+1,position:Array.from({length:3},()=>random()*200000-100000),quaternion:q.map(n=>n/length),heading:random()*2e9-1e9,speed:random()*1000-500,steer:random()*Math.PI*2-Math.PI,wheelSpin:random()*2e9-1e9,bodyPitch:random()*Math.PI*2-Math.PI,bodyRoll:random()*Math.PI*2-Math.PI,bodyBob:random()*20-10,jumpElapsed:random()*60});
    const result=roundtrip(input);assert.ok(result);assert.equal(result.seq,i+1);assert.ok(result.position.every((value,j)=>Math.abs(value-input.position[j])<=.00501));
    const garbage=Uint8Array.from({length:Math.floor(random()*1200)},()=>Math.floor(random()*256));assert.doesNotThrow(()=>decodeStatePacket(garbage));assert.doesNotThrow(()=>decodeDeltaPacket(garbage));
  }
});
