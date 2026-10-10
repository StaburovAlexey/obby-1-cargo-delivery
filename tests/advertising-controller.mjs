import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAdvertising} from '../dist/advertising.js';

function harness(options={}){
  const events=[],shows=[];
  const controller=createAdvertising({
    showAd(callbacks){shows.push(callbacks);events.push('show');return options.result;},
    pause(){events.push('pause');},resume(){events.push('resume');},
    onCountdown(value){events.push(value===null?'clear':value);},
    onStatus(status){events.push(status);},...options,
  });
  return {controller,events,shows};
}
const active={active:true,safe:true};
const finishCountdown=c=>{for(let i=0;i<3;i++)c.update(1,{active:false,safe:true});};

test('advertising starts after 240 active seconds and pauses before showing the full three second warning',()=>{
  const {controller:c,events,shows}=harness();
  assert.ok(c,'createAdvertising returns a controller');
  c.update(239,active);
  assert.equal(shows.length,0);
  assert.equal(events.includes('pause'),false);
  c.update(1,active);
  assert.equal(c.getState().phase,'countdown');
  assert.equal(events.filter(e=>e==='pause').length,1);
  assert.deepEqual(events.filter(e=>typeof e==='number'),[3]);
  c.update(.99,{active:false,safe:true});
  assert.equal(shows.length,0);
  c.update(.01,{active:false,safe:true});
  assert.deepEqual(events.filter(e=>typeof e==='number'),[3,2]);
  c.update(.99,{active:false,safe:true});
  assert.equal(shows.length,0);
  c.update(.01,{active:false,safe:true});
  assert.deepEqual(events.filter(e=>typeof e==='number'),[3,2,1]);
  assert.equal(shows.length,0);
  c.update(.99,{active:false,safe:true});
  assert.equal(shows.length,0);
  c.update(.01,{active:false,safe:true});
  assert.equal(shows.length,1);
  assert(events.indexOf('pause')<events.indexOf(3));
  assert(events.indexOf(1)<events.indexOf('show'));
});

test('menus, loading, hidden time, SDK pause and ads never accumulate active time',()=>{
  const {controller:c,shows}=harness();
  c.update(100,active);
  for(const reason of ['menu','loading','SDK pause'])c.update(10000,{active:false,safe:true,reason});
  c.update(10000,{active:true,safe:true,visible:false});
  assert.equal(c.getState().activeSeconds,100);
  c.update(139,active);
  assert.equal(c.getState().phase,'idle');
  c.update(1,active);finishCountdown(c);
  c.update(10000,active);
  assert.equal(shows.length,1);
  shows[0].onClose(true);
  assert.equal(c.getState().activeSeconds,0);
  c.update(239,active);
  assert.equal(shows.length,1);
});

test('one pending attempt waits indefinitely for an active safe moment',()=>{
  const {controller:c,shows,events}=harness();
  c.update(240,{active:true,safe:false});
  for(let i=0;i<20;i++)c.update(240,{active:true,safe:false});
  assert.equal(c.getState().phase,'pending');
  assert.equal(shows.length,0);
  assert.equal(events.includes('pause'),false);
  c.update(0,{active:false,safe:true});
  assert.equal(c.getState().phase,'pending');
  c.update(0,active);finishCountdown(c);
  assert.equal(shows.length,1);
});

test('direct suspension cancels a partial warning and restarts all three seconds on return',()=>{
  const {controller:c,shows,events}=harness();
  c.update(240,active);c.update(1.8,{active:false,safe:true});
  c.setSuspended(true);
  assert.equal(c.getState().phase,'pending');
  assert.equal(c.getState().countdown,null);
  assert.equal(c.getState().activeSeconds,240);
  assert.equal(events.filter(e=>e==='resume').length,1);
  c.update(1000,active);
  assert.equal(shows.length,0);
  c.setSuspended(false);c.update(0,active);
  assert.equal(c.getState().countdown,3);
  c.update(1,{active:false,safe:true});
  assert.equal(shows.length,0);
  c.update(1,{active:false,safe:true});
  assert.equal(c.getState().countdown,1);
  assert.equal(shows.length,0);
  c.update(.99,{active:false,safe:true});
  assert.equal(shows.length,0);
  c.update(.01,{active:false,safe:true});
  assert.equal(shows.length,1);
  assert.deepEqual(events.filter(e=>typeof e==='number'),[3,2,3,2,1]);
  shows[0].onClose();
  assert.equal(events.filter(e=>e==='resume').length,2);
});

test('visibility and unsafe context are rechecked before dispatching the SDK',()=>{
  for(const context of [{active:false,safe:true,visible:false},{active:false,safe:false}]){
    const {controller:c,shows,events}=harness();
    c.update(240,active);c.update(3,context);
    assert.equal(shows.length,0);
    assert.equal(c.getState().phase,'pending');
    assert.equal(events.filter(e=>e==='resume').length,1);
  }
});

test('callback duplication and a late promise settle release the pause exactly once',async()=>{
  let resolve;
  const result=new Promise(done=>{resolve=done;});
  const {controller:c,shows,events}=harness({result});
  c.update(240,active);finishCountdown(c);
  shows[0].onOpen();shows[0].onClose(true);shows[0].onError(new Error('late'));shows[0].onClose(false);
  resolve({shown:true});await Promise.resolve();
  assert.equal(events.filter(e=>e==='resume').length,1);
  assert.equal(c.getState().phase,'idle');
  assert.equal(c.getState().activeSeconds,0);
  c.update(240,active);finishCountdown(c);
  assert.equal(shows.length,2);
  shows[0].onClose(true);
  assert.equal(c.getState().phase,'showing','stale callback cannot close the new attempt');
  shows[1].onError(new Error('network'));
  assert.equal(events.filter(e=>e==='resume').length,2);
});

test('a refused or offline attempt resets the entire active interval',async()=>{
  for(const result of [false,Promise.resolve({shown:false,reason:'offline'})]){
    const {controller:c,events}=harness({result});
    c.update(240,active);finishCountdown(c);await Promise.resolve();
    assert.equal(c.getState().phase,'idle');
    assert.equal(c.getState().activeSeconds,0);
    assert.equal(events.filter(e=>e==='resume').length,1);
    c.update(239,active);
    assert.equal(c.getState().phase,'idle');
  }
});

test('synchronous SDK failure and promise rejection cannot leave gameplay paused',async()=>{
  for(const showAd of [()=>{throw new Error('offline');},()=>Promise.reject(new Error('denied'))]){
    const {controller:c,events}=harness({showAd});
    c.update(240,active);finishCountdown(c);await Promise.resolve();
    assert.equal(c.getState().phase,'idle');
    assert.equal(events.filter(e=>e==='resume').length,1);
  }
});

test('destroy cancels owned work and ignores subsequent SDK completion',()=>{
  const {controller:c,events,shows}=harness();
  c.update(240,active);finishCountdown(c);
  c.destroy();c.destroy();shows[0].onClose();c.update(10000,active);
  assert.equal(c.getState().phase,'destroyed');
  assert.equal(events.filter(e=>e==='resume').length,1);
  assert.equal(shows.length,1);
});

test('invalid time deltas cannot bypass the active interval or warning',()=>{
  const {controller:c,shows}=harness({intervalSeconds:4});
  for(const dt of [NaN,Infinity,-4])c.update(dt,active);
  assert.equal(c.getState().activeSeconds,0);
  c.update(4,active);
  for(const dt of [NaN,Infinity,-4])c.update(dt,{active:false,safe:true});
  assert.equal(c.getState().countdown,3);
  assert.equal(shows.length,0);
  finishCountdown(c);
  assert.equal(shows.length,1);
});

test('fractional frames never repeat earlier countdown numbers',()=>{
  const {controller:c,events,shows}=harness();
  c.update(240,active);c.update(2.4,{active:false,safe:true});
  c.update(.3,{active:false,safe:true});
  assert.deepEqual(events.filter(e=>typeof e==='number'),[3,2,1]);
  assert.equal(shows.length,0);
  c.update(.3,{active:false,safe:true});
  assert.equal(shows.length,1);
});

test('an SDK offline callback finishes and resets an unavailable attempt',()=>{
  const {controller:c,events,shows}=harness();
  c.update(240,active);finishCountdown(c);
  assert.equal(typeof shows[0].onOffline,'function');
  shows[0].onOffline();shows[0].onError(new Error('duplicate offline'));
  assert.equal(c.getState().phase,'idle');
  assert.equal(c.getState().activeSeconds,0);
  assert.equal(events.filter(e=>e==='resume').length,1);
});
