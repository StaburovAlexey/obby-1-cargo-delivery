import assert from 'node:assert/strict';
import {test} from 'node:test';
import {isAdvertisingSafe} from '../dist/advertising.js';
import {BRIDGES} from '../dist/road-bridges.js';
import {buildRoadHazards,createRoadHazards} from '../dist/road-hazards.js';
import {routePointAtProgress,pointOnEdge} from '../dist/route-network.js';

const player={position:[0,0,0],heading:0,speed:0,footprint:{halfWidth:1,halfLength:2},bridges:[],hazards:[]};
const safe = changes => isAdvertisingSafe({...player,...changes});
const obstacle={x:0,z:0,heading:0,width:4,length:6};

test('an unobstructed grounded player can receive advertising', () => {
  assert.equal(safe({}),true);
  assert.equal(safe({position:{x:0,z:0},radius:.4,footprint:undefined}),true);
});

test('all transient unsafe states defer advertising', () => {
  for (const key of ['jumping','falling','teleporting','loading','modal']) {
    assert.equal(safe({[key]:true}),false,key);
  }
  for (const changes of [{position:[NaN,0,0]},{speed:Infinity},{heading:NaN},{footprint:{halfWidth:-1,halfLength:2}}]) {
    assert.equal(safe(changes),false,JSON.stringify(changes));
  }
});

test('the fifty metre margin starts at the full body and obstacle bounds', () => {
  assert.equal(safe({position:[0,0,55],hazards:[obstacle]}),false,'body back edge is exactly 50m from obstacle');
  assert.equal(safe({position:[0,0,55.01],hazards:[obstacle]}),true);
  assert.equal(safe({position:[53,0,0],hazards:[obstacle]}),false,'lateral body edge at 50m');
  assert.equal(safe({position:[53.01,0,0],hazards:[obstacle]}),true);
  assert.equal(safe({position:[0,0,54],hazards:[obstacle],heading:Math.PI/2}),false,'rotation exchanges body dimensions');
  assert.equal(safe({position:[0,0,54.01],hazards:[obstacle],heading:Math.PI/2}),true);
  assert.equal(safe({position:[0,0,53.5],hazards:[obstacle],footprint:{radius:.5}}),false);
  assert.equal(safe({position:[0,0,53.51],hazards:[obstacle],footprint:{radius:.5}}),true);
});

test('diagonal margins use polygon distance instead of inflated axis aligned boxes', () => {
  assert.equal(safe({position:[39,0,41],hazards:[obstacle]}),true,'corner gap is sqrt(36²+36²), over 50m');
  assert.equal(safe({position:[38,0,40],hazards:[obstacle]}),false,'corner gap is sqrt(35²+35²), under 50m');
  assert.equal(safe({position:[0,0,0],hazards:[obstacle]}),false,'overlapping polygons');
});

test('five seconds of speed overrides the minimum margin in reverse and lateral approaches', () => {
  for (const speed of [20,-20]) {
    assert.equal(safe({position:[0,0,104],speed,hazards:[obstacle]}),false);
    assert.equal(safe({position:[0,0,105.01],speed,hazards:[obstacle]}),true);
    assert.equal(safe({position:[103,0,0],speed,hazards:[obstacle]}),false,'same speed buffer applies laterally');
    assert.equal(safe({position:[103.01,0,0],speed,hazards:[obstacle]}),true);
  }
});

test('moving hazards exclude their whole sweep independently of their current side', () => {
  const moving={...obstacle,x:-100,offset:-100,roadHeading:0,motion:{minOffset:-100,maxOffset:100}};
  assert.equal(safe({position:[120,0,0],hazards:[moving]}),false,'distant current pose cannot hide future sweep');
  assert.equal(safe({position:[153,0,0],hazards:[moving]}),false,'full sweep plus width plus vehicle width plus 50m');
  assert.equal(safe({position:[153.01,0,0],hazards:[moving]}),true);
  assert.equal(safe({position:[120,0,0],hazards:[{...moving,x:100,offset:100}]}),false);
  const rotated={...moving,x:0,z:100,heading:Math.PI/2,roadHeading:Math.PI/2};
  assert.equal(safe({position:[0,0,-140],hazards:[rotated]}),false,'sweep follows road right, not world X');
});

test('a rotated obstacle keeps its complete footprint while sweeping on road axes', () => {
  const moving={...obstacle,x:-100,offset:-100,heading:Math.PI/2,roadHeading:0,motion:{minOffset:-100,maxOffset:100}};
  assert.equal(safe({position:[154,0,0],hazards:[moving]}),false);
  assert.equal(safe({position:[154.01,0,0],hazards:[moving]}),true);
});

test('each real bridge excludes both ends, both sides and every curved deck sample', () => {
  let samples=0;
  for (const bridge of BRIDGES) {
    for (let q=bridge.from;q<=bridge.to;q+=.5) {
      const p=routePointAtProgress(q);
      for (const side of [-1,1]) {
        const position=[p.x+p.right.x*(bridge.offset+side*bridge.halfWidth),0,p.z+p.right.z*(bridge.offset+side*bridge.halfWidth)];
        assert.equal(safe({position,bridges:[bridge],footprint:{radius:.5}}),false,bridge.id+' deck '+q);
        samples++;
      }
    }
    for (const q of [bridge.from,bridge.to]) {
      const p=routePointAtProgress(q);
      for (const side of [-1,1]) {
        const offset=bridge.offset+side*(bridge.halfWidth+49);
        assert.equal(safe({position:[p.x+p.right.x*offset,0,p.z+p.right.z*offset],bridges:[bridge]}),false,bridge.id+' side margin');
      }
    }
    const middle=routePointAtProgress((bridge.from+bridge.to)/2);
    assert.equal(safe({position:[middle.x+middle.right.x*(bridge.offset+bridge.halfWidth+80),0,middle.z+middle.right.z*(bridge.offset+bridge.halfWidth+80)],bridges:[bridge]}),true,bridge.id+' outside margin');
  }
  assert(samples>2000);
});

test('the fixed seed map still has safe road spans for deferred advertising', () => {
  const hazards=buildRoadHazards(42),snapshot=JSON.stringify({bridges:BRIDGES,hazards});
  let safeSamples=0,unsafeSamples=0;
  for (let q=0;q<=14000;q+=20) {
    const p=routePointAtProgress(q);
    if(safe({position:[p.x,p.height,p.z],heading:p.heading,speed:20,bridges:BRIDGES,hazards}))safeSamples++;
    else unsafeSamples++;
  }
  assert(safeSamples>100,`safe map samples: ${safeSamples}`);
  assert(unsafeSamples>100,`unsafe map samples: ${unsafeSamples}`);
  assert.equal(JSON.stringify({bridges:BRIDGES,hazards}),snapshot,'policy never mutates world descriptors');
});

test('real moving poses cannot change the excluded future range', () => {
  const system=createRoadHazards(42),h=system.movers[0],p=pointOnEdge(h.edgeId,h.edgeDistance);
  const position=[p.x+p.right.x*(h.motion.maxOffset+45),0,p.z+p.right.z*(h.motion.maxOffset+45)];
  for(let i=0;i<200;i++) {
    system.update(.1,{x:0,z:0,heading:0},true);
    assert.equal(safe({position,hazards:[h]}),false);
  }
});
