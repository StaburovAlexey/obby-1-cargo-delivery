import test from 'node:test';
import assert from 'node:assert/strict';
import {createDrivingModel} from '../dist/driving-model.js';
import {createDriftScore} from '../dist/drift-score.js';
import {createDriftVerifier} from '../server/drift-verifier.mjs';
import {canyonPointAt,projectCanyon,canyonContact} from '../dist/canyon-track.js';
import {surfaceForBiome} from '../dist/biome-surfaces.js';
import {createInitialPlayerState} from '../dist/online-protocol.js';
import {canyonDriverInput} from './fixtures/canyon-driver.mjs';

for(const fps of [60,30,15])test(`a physical BMW journey finishes and receives a server-confirmed score at ${fps} fps`,()=>{
 const model=createDrivingModel({...canyonPointAt(12),vehicleId:'bmwreward',maxSpeed:42,groundGradient:(x,z)=>projectCanyon(x,z).gradient,groundSurface:()=>surfaceForBiome('city','bmwreward'),contact:canyonContact});
 const score=createDriftScore();score.start(model.state);
 const network=()=>({...createInitialPlayerState(),mode:'driving',vehicleId:'bmwreward',position:[model.state.x,projectCanyon(model.state.x,model.state.z).height,model.state.z],heading:model.state.heading,speed:model.state.linearSpeed});
 const verifier=createDriftVerifier(network(),0);let elapsed=0,contactSeconds=0,distance=0,netTime=0;
 for(let frame=0;frame<fps*240;frame++){
  // Reduce the sampled driver's pace at 15 Hz; physics itself remains fixed-step.
  model.setInput(canyonDriverInput(model.state,{speed:fps===15?25:26}));model.step(1/fps);elapsed+=1/fps;distance+=model.state.pathDistance;
  score.update(1/fps,model.state);if(model.state.blocked)contactSeconds+=1/fps;
  if(elapsed-netTime>=.0999){verifier.observe(network(),elapsed*1000);netTime=elapsed;}
  assert.equal(score.state.valid,true,score.state.reason||'valid physical trajectory');if(score.state.finished)break;
 }
 const result=score.result();assert.ok(result,'inputs alone reach the finish');assert.ok(result.score>20);assert.ok(elapsed>60&&elapsed<180);assert.ok(contactSeconds<3,'short rail touches cannot replace steering through the circuit');assert.ok(distance>1700&&distance<2200,`actual traveled distance ${distance}`);
 assert.equal(verifier.finish(elapsed*1000,network())?.verified,true,'the same physically simulated journey passes the room verifier');
});
