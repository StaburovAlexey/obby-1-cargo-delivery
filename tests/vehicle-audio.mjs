import assert from 'node:assert/strict';
import { createVehicleAudio, VEHICLE_AUDIO_ASSETS } from '../dist/vehicle-audio.js';

class Param {
  constructor(value = 1) { this.value = value; this.writes = []; }
  cancelScheduledValues(time) { this.writes.push(['cancel', time]); }
  setValueAtTime(value, time) { assert.ok(Number.isFinite(value)); this.value = value; this.writes.push(['immediate', value, time]); }
  setTargetAtTime(value, time, constant) { assert.ok(Number.isFinite(value)); assert.ok(constant > 0); this.value = value; this.writes.push(['smooth', value, time]); }
}
class Node {
  constructor(context) { this.context = context; this.connections = []; this.disconnected = false; }
  connect(target) { this.connections.push(target); return target; }
  disconnect() { this.disconnected = true; this.connections = []; }
}
class Gain extends Node { constructor(context) { super(context); this.gain = new Param(); } }
class Source extends Node {
  constructor(context) { super(context); this.playbackRate = new Param(); this.loop = false; this.started = false; this.stopped = false; this.stopCalls = []; this.onended = null; }
  start() { if (this.context.options.startThrows) throw Error('device start failed'); assert.equal(this.started, false); this.started = true; }
  stop(time) { this.stopCalls.push(time); if (time === undefined || time <= this.context.currentTime) this.stopped = true; }
  end() { this.stopped = true; this.onended?.(); }
}
class Context {
  constructor(options = {}) { this.options = options; this.state = options.initialState || 'suspended'; this.currentTime = 0; this.destination = {}; this.sources = []; this.gains = []; this.resumeCalls = 0; this.closeCalls = 0; this.decodeCalls = 0; }
  createGain() { if (this.options.gainThrows) throw Error('no output'); const node = new Gain(this); this.gains.push(node); return node; }
  createBufferSource() { const source = new Source(this); this.sources.push(source); return source; }
  resume() {
    this.resumeCalls++;
    if (this.options.resume) return this.options.resume(this);
    this.state = 'running'; return Promise.resolve();
  }
  close() { this.closeCalls++; this.state = 'closed'; return this.options.close ? this.options.close(this) : Promise.resolve(); }
  decodeAudioData(data, resolve, reject) {
    this.decodeCalls++;
    if (this.options.decode) return this.options.decode(data, resolve, reject);
    return Promise.resolve({ kind: ['engine', 'tire', 'impact'][new Uint8Array(data)[0]], duration: .7 });
  }
}
class Timers {
  callbacks = new Map(); next = 1;
  set = (fn, delay) => { assert.ok(delay <= 30000); const id = this.next++; this.callbacks.set(id, fn); return id; };
  clear = id => this.callbacks.delete(id);
  expire() { for (const [id, fn] of [...this.callbacks]) { this.callbacks.delete(id); fn(); } }
}
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const pump = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function harness(options = {}) {
  const contexts = [], requests = [], timers = new Timers();
  let time = 0;
  const audio = createVehicleAudio({
    AudioContextClass: class extends Context { constructor() { super(options.context); contexts.push(this); } },
    fetch: (url, init) => {
      requests.push({ url, init });
      if (options.fetch) return options.fetch(url, init);
      return Promise.resolve({ ok: true, arrayBuffer: async () => Uint8Array.of(Object.values(VEHICLE_AUDIO_ASSETS).indexOf(url)).buffer });
    },
    now: () => time,
    setTimeout: timers.set,
    clearTimeout: timers.clear,
    ...options.audio,
  });
  return { audio, contexts, requests, timers, get context() { return contexts[0]; }, advance(dt) { time += dt; if (contexts[0]) contexts[0].currentTime += dt; } };
}
const active = { active: true, speed: 15, slip: 0, throttle: .6, braking: 0, impact: 0 };
const live = (context, kind) => context.sources.filter(s => s.started && !s.stopped && !s.disconnected && (!kind || s.buffer.kind === kind));
const update = (h, state = active, frames = 1, dt = 1 / 60) => {
  for (let i = 0; i < frames; i++) { h.advance(dt); h.audio.update(dt, state); }
};
const unhandled = [];
const onUnhandled = error => unhandled.push(error);
process.on('unhandledRejection', onUnhandled);


{
  const h = harness();
  update(h); h.audio.stop(); h.audio.setMuted(true); h.audio.setMuted(false);
  assert.equal(h.contexts.length, 0); assert.equal(h.requests.length, 0);
  await h.audio.dispose(); assert.equal(await h.audio.unlock(), false);
  assert.equal(h.contexts.length, 0);
  const unsupported = createVehicleAudio({ AudioContextClass: null, fetch: null });
  assert.equal(await unsupported.unlock(), false); unsupported.update(.02, active); await unsupported.dispose();
}


{
  const h = harness(), first = h.audio.unlock();
  assert.equal(h.contexts.length, 1); assert.equal(h.context.resumeCalls, 1, 'resume called before awaiting gesture');
  assert.equal(live(h.context).length, 0, 'unlock alone does not start audio');
  assert.equal(await first, true); assert.equal(await h.audio.unlock(), true);
  assert.equal(h.requests.length, 3); assert.equal(h.context.decodeCalls, 3); assert.equal(h.timers.callbacks.size, 0);
  assert.deepEqual(h.requests.map(r => r.url), Object.values(VEHICLE_AUDIO_ASSETS));
  update(h, { ...active, speed: 0, throttle: 0 }, 120);
  assert.equal(live(h.context, 'engine').length, 1); assert.equal(live(h.context, 'tire').length, 0);
  const engine = live(h.context, 'engine')[0], gain = engine.connections[0];
  const idleRate = engine.playbackRate.value, idleGain = gain.gain.value;
  update(h, { ...active, speed: 34, throttle: 1 });
  assert.ok(engine.playbackRate.value > idleRate && engine.playbackRate.value < 2.2, 'pitch eases into acceleration');
  assert.ok(gain.gain.value > idleGain && gain.gain.value < .44, 'load eases into acceleration');
  update(h, { ...active, speed: 34, throttle: 1 }, 300);
  assert.ok(Math.abs(engine.playbackRate.value - 2.2) < .001);
  assert.ok(engine.playbackRate.writes.some(x => x[0] === 'smooth'));
  assert.equal(h.context.sources.length, 1, 'hundreds of updates reuse one engine');
  assert.equal(h.context.gains[0].gain.value, .6);
  assert.ok((.44 + .41 + .7) * h.context.gains[0].gain.value < 1, 'maximum combined voice gains leave headroom');
  update(h, { ...active, speed: -30, slip: 0, steer: 1 }, 30);
  assert.equal(live(h.context, 'tire').length, 0, 'steering input alone never squeals');
  update(h, { ...active, slip: 4 }, 180);
  assert.equal(live(h.context, 'tire').length, 1);
  const tire = live(h.context, 'tire')[0];
  assert.ok(tire.connections[0].gain.value > .1);
  assert.equal(h.context.sources.length, 2, 'one tire loop alongside one engine');
  update(h, active, 100);
  assert.equal(live(h.context, 'tire').length, 0, 'grip recovery fades then releases tire loop');
  update(h, { ...active, speed: 24, braking: 1 }, 20);
  assert.equal(live(h.context, 'tire').length, 1, 'real hard braking at speed can squeal');
  update(h, { ...active, speed: 0, slip: 10, braking: 1 }, 100);
  assert.equal(live(h.context, 'tire').length, 0, 'stationary car never squeals');
  await h.audio.dispose();
  assert.equal(live(h.context).length, 0); assert.equal(h.context.closeCalls, 1); assert.equal(h.timers.callbacks.size, 0);
}


for (const reason of ['hidden', 'blurred', 'modal', 'garage', 'fall', 'fuel-zero']) {
  const h = harness(); await h.audio.unlock(); update(h, { ...active, slip: 4, impact: .8 });
  assert.equal(live(h.context).length, 3);
  update(h, { ...active, active: false, reason }, 1, 0);
  assert.equal(live(h.context).length, 0, `${reason} stops all sources immediately without needing another frame`);
  assert.equal(h.context.gains[0].gain.value, 0);
  update(h, { ...active, active: false }, 50);
  assert.equal(h.context.sources.length, 3);
  update(h); assert.equal(live(h.context, 'engine').length, 1);
  assert.equal(h.context.resumeCalls, 1, 'active update must not call resume');
  h.audio.stop(); assert.equal(live(h.context).length, 0);
  await h.audio.dispose();
}


{
  const h = harness({ audio: { muted: true } });
  assert.equal(h.audio.muted, true); await h.audio.unlock(); update(h, { ...active, slip: 4, impact: 1 });
  assert.equal(live(h.context).length, 0);
  assert.equal(h.audio.setMuted(false), false); update(h);
  assert.equal(live(h.context, 'engine').length, 1);
  h.audio.setMuted(true); assert.equal(h.audio.muted, true);
  assert.equal(live(h.context).length, 0); assert.equal(h.context.gains[0].gain.value, 0);
  h.audio.stop(); await h.audio.unlock(); assert.equal(h.audio.muted, true);
  h.context.state = 'suspended'; h.audio.setMuted(false); update(h);
  assert.equal(h.context.resumeCalls, 1); assert.equal(live(h.context).length, 0);
  await h.audio.unlock(); update(h); assert.equal(h.context.resumeCalls, 2);
  assert.equal(live(h.context, 'engine').length, 1);
  h.context.state = 'interrupted'; update(h); assert.equal(live(h.context).length, 0);
  update(h, active, 60); assert.equal(h.context.resumeCalls, 2, 'interruptions need a fresh gesture');
  await h.audio.dispose();
}


{
  const h = harness(); await h.audio.unlock();
  update(h, { ...active, impact: .8 });
  assert.equal(live(h.context, 'impact').length, 1);
  const first = live(h.context, 'impact')[0];
  assert.ok(first.stopCalls[0] - h.context.currentTime <= 1.2);
  update(h, { ...active, impact: 1 }, 120);
  assert.equal(h.context.sources.filter(s => s.buffer.kind === 'impact').length, 1, 'sustained contact cannot spam impacts');
  first.end(); assert.equal(first.disconnected, true);
  update(h); update(h, { ...active, impact: .7 });
  assert.equal(live(h.context, 'impact').length, 1);
  update(h); update(h, { ...active, impact: .9 });
  assert.equal(h.context.sources.filter(s => s.buffer.kind === 'impact').length, 2, 'new impact inside cooldown is ignored');
  update(h, active, 30); update(h, { ...active, impact: .9 });
  assert.equal(h.context.sources.filter(s => s.buffer.kind === 'impact').length, 3);
  assert.equal(live(h.context, 'impact').length, 1, 'later impact replaces prior tail');
  h.audio.stop(); update(h, { ...active, impact: .9 });
  assert.equal(live(h.context, 'impact').length, 0, 'stop cannot replay a stale collision');
  await h.audio.dispose();
}


{
  const h = harness(); await h.audio.unlock();
  const state = Object.freeze({ active: true, speed: NaN, slip: Infinity, throttle: -Infinity, braking: 'bad', impact: NaN });
  update(h, state, 1, NaN); update(h, { ...active, speed: 1e20, slip: -1e20, throttle: -9, braking: 8 }, 20, Infinity);
  for (const source of h.context.sources) assert.ok(Number.isFinite(source.playbackRate.value));
  for (const gain of h.context.gains) assert.ok(Number.isFinite(gain.gain.value) && gain.gain.value <= .7);
  await h.audio.dispose();
}


for (const fetch of [() => { throw Error('fetch unavailable'); }, async () => { throw Error('network failed'); }, async () => ({ ok: false }), async () => ({ ok: true, arrayBuffer: async () => { throw Error('body failed'); } })]) {
  const h = harness({ fetch });
  assert.equal(await h.audio.unlock(), false); update(h, { ...active, slip: 8, impact: 1 });
  assert.equal(live(h.context).length, 0);
  await h.audio.unlock(); assert.equal(h.requests.length, 3, 'failed loads do not cause a request storm');
  await h.audio.dispose(); assert.equal(h.timers.callbacks.size, 0);
}
{
  const h = harness({ context: { decode: () => Promise.reject(Error('bad codec')) } });
  assert.equal(await h.audio.unlock(), false); update(h); assert.equal(live(h.context).length, 0); await h.audio.dispose();
}
{
  const h = harness({ context: { decode: (data, resolve) => { resolve({ kind: ['engine', 'tire', 'impact'][new Uint8Array(data)[0]], duration: .4 }); } } });
  assert.equal(await h.audio.unlock(), true, 'legacy decode callbacks are supported'); update(h); assert.equal(live(h.context).length, 1); await h.audio.dispose();
}
{
  const h = harness({ fetch: async url => ({ ok: !url.includes('tire'), arrayBuffer: async () => Uint8Array.of(Object.values(VEHICLE_AUDIO_ASSETS).indexOf(url)).buffer }) });
  assert.equal(await h.audio.unlock(), true); update(h, { ...active, slip: 8, impact: .8 });
  assert.equal(live(h.context, 'engine').length, 1); assert.equal(live(h.context, 'impact').length, 1); assert.equal(live(h.context, 'tire').length, 0);
  await h.audio.dispose();
}


{
  let attempts = 0;
  const h = harness({ context: { resume: context => { if (++attempts === 1) return Promise.reject(Error('gesture required')); context.state = 'running'; return Promise.resolve(); } } });
  assert.equal(await h.audio.unlock(), false); update(h, active, 60); assert.equal(h.context.resumeCalls, 1);
  assert.equal(await h.audio.unlock(), true); update(h); assert.equal(live(h.context, 'engine').length, 1);
  await h.audio.dispose();
}


{
  const fetchResult = deferred();
  const h = harness({ fetch: () => fetchResult.promise }), unlock = h.audio.unlock();
  await pump(); h.timers.expire(); assert.equal(await unlock, false);
  assert.ok(h.requests.every(r => r.init.signal.aborted));
  fetchResult.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }); await pump();
  assert.equal(h.context.decodeCalls, 0, 'timed-out fetch must not perform a late decode');
  update(h); assert.equal(live(h.context).length, 0); await h.audio.dispose();
}
{
  const decode = deferred();
  const h = harness({ context: { decode: () => decode.promise } }), unlock = h.audio.unlock();
  await pump(); assert.equal(h.context.decodeCalls, 3); h.timers.expire(); assert.equal(await unlock, false);
  decode.resolve({ kind: 'engine', duration: 1 }); await pump(); update(h);
  assert.equal(live(h.context).length, 0); await h.audio.dispose();
}
{
  const resume = deferred();
  const h = harness({ context: { resume: () => resume.promise } });
  const first = h.audio.unlock(), repeated = h.audio.unlock();
  assert.equal(h.context.resumeCalls, 1, 'pending gesture resumes are shared');
  await pump(); h.timers.expire(); assert.equal(await first, false); assert.equal(await repeated, false);
  update(h); assert.equal(h.context.resumeCalls, 1);
  resume.reject(Error('late rejection')); await pump(); await h.audio.dispose();
}
{
  const result = deferred();
  const h = harness({ fetch: () => result.promise }), unlock = h.audio.unlock();
  await h.audio.dispose(); assert.equal(await unlock, false); assert.ok(h.requests.every(r => r.init.signal.aborted));
  result.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }); await pump();
  assert.equal(h.context.decodeCalls, 0); update(h); assert.equal(live(h.context).length, 0);
  await h.audio.dispose(); assert.equal(h.context.closeCalls, 1); assert.equal(await h.audio.unlock(), false);
  assert.equal(h.timers.callbacks.size, 0);
}
{
  const result = deferred();
  const h = harness({ context: { decode: () => result.promise } }), unlock = h.audio.unlock();
  await pump(); await h.audio.dispose(); assert.equal(await unlock, false);
  result.resolve({ kind: 'engine', duration: 1 }); await pump(); update(h);
  assert.equal(live(h.context).length, 0); assert.equal(h.timers.callbacks.size, 0);
}
{
  const h = harness({ context: { gainThrows: true } });
  assert.equal(await h.audio.unlock(), false); await pump(); assert.equal(h.context.closeCalls, 1); await h.audio.dispose();
}
{
  const h = harness({ context: { startThrows: true } });
  await h.audio.unlock(); update(h, { ...active, slip: 8, impact: 1 });
  assert.ok(h.context.sources.every(s => s.disconnected)); await h.audio.dispose();
}
{
  const close = deferred(), h = harness({ context: { close: () => close.promise } });
  await h.audio.unlock(); update(h);
  const disposing = h.audio.dispose(); assert.equal(live(h.context).length, 0);
  h.timers.expire(); await disposing; close.reject(Error('late close error')); await pump();
  assert.equal(h.timers.callbacks.size, 0);
}

{
 const h=harness();await h.audio.unlock();update(h);assert.equal(h.audio.volume,1);
 h.audio.setVolume(.25);update(h);assert.equal(h.context.gains[0].gain.value,.15);
 h.audio.setVolume(0);assert.equal(live(h.context).length,0);update(h);assert.equal(live(h.context).length,0);
 h.audio.setVolume(.7);update(h);assert.equal(h.context.gains[0].gain.value,.42);assert(live(h.context).length>0);
 h.audio.setMuted(true);h.audio.setVolume(.5);update(h);assert.equal(live(h.context).length,0);
 h.audio.setMuted(false);update(h);assert.equal(h.context.gains[0].gain.value,.3);
 h.audio.setVolume(5);assert.equal(h.audio.volume,1);h.audio.setVolume(-2);assert.equal(h.audio.volume,0);await h.audio.dispose();
}

await new Promise(resolve => setImmediate(resolve));
process.removeListener('unhandledRejection', onUnhandled);
assert.deepEqual(unhandled, [], 'audio failures must not cause unhandled promise rejections');
console.log('Vehicle audio: gesture unlock, smooth load/slip, lifecycle silence, mute, collision bounds and async cleanup passed.');
