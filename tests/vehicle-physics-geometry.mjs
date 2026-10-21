import assert from 'node:assert/strict';
import test from 'node:test';
import {vehiclePhysicsGeometry, rearTireSlip} from '../dist/vehicle-physics.js';

const metadata = {
  dimensions: [4, 3, 8.6],
  wheels: [
    {name:'fl',front:true,center:[-1.6,.7,-2.2]},
    {name:'fr',front:true,center:[1.6,.7,-2.2]},
    {name:'rl',front:false,center:[-1.6,.7,3.1]},
    {name:'rr',front:false,center:[1.6,.7,3.1]},
  ],
};
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-10, `${a} != ${b}`);

test('physical wheels and inertia follow model dimensions and static axle balance', () => {
  const g=vehiclePhysicsGeometry(metadata);
  near(g.wheelbase,5.3);near(g.frontZ,-2.2);near(g.rearZ,3.1);
  near(g.yawInertia,1600*(4**2+8.6**2)/12);
  near(g.halfWidth,2);near(g.halfLength,4.3);
  near(g.wheels.reduce((sum,w)=>sum+w.loadShare,0),1);
  near(g.wheels.reduce((sum,w)=>sum+w.z*w.loadShare,0),0);
  assert.deepEqual(g.wheels.map(w=>[w.x,w.z]),metadata.wheels.map(w=>[w.center[0],w.center[2]]));
  assert.ok(Object.isFrozen(g)&&g.wheels.every(Object.isFrozen));
});

test('invalid or not yet loaded metadata uses the established fallback', () => {
  for(const bad of [null,{}, {...metadata,wheels:[]}, {...metadata,dimensions:[]}, {...metadata,dimensions:[4,2]}, {...metadata,dimensions:[NaN,3,8]},
    {...metadata,wheels:metadata.wheels.map(w=>({...w,center:[w.center[0],.7,2]}))}])
    assert.equal(vehiclePhysicsGeometry(bad),null);
});

test('rear slip excludes the normal sideways motion of the body centre in a turn', () => {
  const state={heading:0,velocityX:.8,velocityZ:-5,angularVelocity:-.8/3.1};
  near(rearTireSlip(state,3.1),0);
  assert.ok(Math.atan2(state.velocityX,5)>.15,'COM angle alone would falsely report a skid');
  state.velocityX+=1;
  near(rearTireSlip(state,3.1),Math.atan2(1,5));
});

test('asymmetric wheel placement balances both horizontal load moments', () => {
  const wheels=metadata.wheels.map((w,i)=>({...w,center:[w.center[0]+.03*i,.7,w.center[2]+.01*i]}));
  const g=vehiclePhysicsGeometry({...metadata,wheels});
  near(g.wheels.reduce((sum,w)=>sum+w.loadShare,0),1);
  near(g.wheels.reduce((sum,w)=>sum+w.x*w.loadShare,0),0);
  near(g.wheels.reduce((sum,w)=>sum+w.z*w.loadShare,0),0);
});
