import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDrivingModel} from '../../dist/driving-model.js';
import {createDriftScore} from '../../dist/drift-score.js';
import {createDriftVerifier} from '../../server/drift-verifier.mjs';
import {canyonPointAt,projectCanyon,canyonContact} from '../../dist/canyon-track.js';
import {surfaceForBiome} from '../../dist/biome-surfaces.js';
import {createInitialPlayerState} from '../../dist/online-protocol.js';
import {canyonDriverInput} from '../../tests/fixtures/canyon-driver.mjs';

// QA inputs only. No changes to runtime dynamics, scoring, position, heading or
// velocities after the ordinary canyon starting pose. Upgraded grip permits a
// quicker pace and needs less rear braking; upgraded steering needs lower gain.
const profiles=[
 {name:'maximum-handling',upgrades:{handling:10},speed:25,gain:1.5,handbrake:.3},
 {name:'maximum-grip',upgrades:{grip:10},speed:28,gain:1.5,handbrake:.15},
 {name:'all-maximum',upgrades:{handling:10,grip:10,speed:10,fuel:10},speed:28,gain:1,handbrake:.15},
];
const rows=[];
for(const profile of profiles)for(const fps of [60,30,15]){
 const model=createDrivingModel({...canyonPointAt(12),vehicleId:'bmwreward',maxSpeed:42,getUpgrades:()=>profile.upgrades,groundGradient:(x,z)=>projectCanyon(x,z).gradient,groundSurface:()=>surfaceForBiome('city','bmwreward'),contact:canyonContact});
 const score=createDriftScore();score.start(model.state);
 const network=()=>({...createInitialPlayerState(),mode:'driving',vehicleId:'bmwreward',position:[model.state.x,projectCanyon(model.state.x,model.state.z).height,model.state.z],heading:model.state.heading,speed:model.state.linearSpeed});
 const verifier=createDriftVerifier(network(),0);
 let elapsed=0,contactSeconds=0,distance=0,netTime=0,maxSlipDegrees=0,scoringSeconds=0;
 for(let frame=0;frame<fps*180;frame++){
  const input=canyonDriverInput(model.state,{speed:profile.speed,gain:profile.gain});
  input.speedDemand/=1+.01*(profile.upgrades.speed||0);
  if(input.handbrake)input.handbrake=profile.handbrake;
  model.setInput(input);model.step(1/fps);elapsed+=1/fps;distance+=model.state.pathDistance;
  score.update(1/fps,model.state);if(model.state.blocked)contactSeconds+=1/fps;
  const slip=Math.abs(model.state.slipAngle)*180/Math.PI;maxSlipDegrees=Math.max(maxSlipDegrees,slip);
  if(slip>=12&&model.state.linearSpeed>=9&&!model.state.blocked)scoringSeconds+=1/fps;
  if(elapsed-netTime>=.0999){verifier.observe(network(),elapsed*1000);netTime=elapsed;}
  assert.equal(score.state.valid,true,`${profile.name}/${fps}: ${score.state.reason||'invalid trajectory'}`);
  if(score.state.finished)break;
 }
 const result=score.result(),verified=verifier.finish(elapsed*1000,network());
 assert.ok(result&&result.score>20,`${profile.name}/${fps}: must complete a genuinely scored drift run`);
 assert.ok(elapsed>60&&elapsed<180,`${profile.name}/${fps}: duration`);
 assert.ok(contactSeconds<3,`${profile.name}/${fps}: rail contacts are not a driving substitute`);
 assert.ok(distance>1700&&distance<2200,`${profile.name}/${fps}: actual distance`);
 assert.equal(verified?.verified,true,`${profile.name}/${fps}: same trajectory must satisfy server verification`);
 rows.push({profile:profile.name,upgrades:profile.upgrades,fps,pilot:{speed:profile.speed,gain:profile.gain,handbrake:profile.handbrake},score:result.score,serverVerified:verified.verified,elapsed,contactSeconds,distance,maxSlipDegrees,scoringSeconds});
}
const report={pass:true,scope:'CPU simulations with actual canyon contact, scoring and server-verifier modules; no browser or visual playtesting',note:'Uses ordinary steering, throttle and handbrake controls with upgrade-aware QA pilot settings. A stock-tuned pilot is not expected to drift identically after grip or steering upgrades.',rows};
fs.writeFileSync(new URL('./independent-bmw-journeys.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
