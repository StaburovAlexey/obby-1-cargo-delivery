import assert from 'node:assert/strict';
import {createRoadHazards} from '../dist/road-hazards.js';
import {createDrivingModel} from '../dist/driving-model.js';
import {VEHICLE_CONFIG} from '../dist/economy-config.js';
const system=createRoadHazards(42),rock=system.hazards.find(h=>h.type==='rock');let cases=0;
for(const car of VEHICLE_CONFIG)for(const reverse of [false,true]){
 const sign=reverse?-1:1,m=createDrivingModel({vehicleId:car.id,maxSpeed:car.maxSpeed,x:rock.x+Math.sin(rock.heading)*14*sign,z:rock.z+Math.cos(rock.heading)*14*sign,heading:rock.heading,contact:system.contact});
 Object.assign(m.state,{velocityX:-Math.sin(rock.heading)*20*sign,velocityZ:-Math.cos(rock.heading)*20*sign});m.setGear(reverse?'R':'D');m.setInput({active:true,steering:0});let blocked=0;
 for(let i=0;i<240;i++){m.step(1/60);blocked+=Number(m.state.blocked);assert.ok(!system.contact(m.state.x,m.state.z,m.state.heading));}
 assert.ok(blocked>0,car.id+' must collide with static rock');cases++;
}
console.log('PASS',cases,'static rock swept collisions; no falling timers');
