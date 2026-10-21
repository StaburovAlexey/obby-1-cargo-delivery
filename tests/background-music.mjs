import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackgroundMusic } from '../dist/background-music.js';

const tracks = [
  { id: 'one', title: 'One', artist: 'Artist', src: './one.mp3' },
  { id: 'two', title: 'Two', artist: 'Artist', src: './two.mp3' },
  { id: 'three', title: 'Three', artist: 'Artist', src: './three.mp3' },
];

class Media extends EventTarget {
  constructor() {
    super();
    this.preload = 'auto';
    this.volume = 1;
    this.muted = false;
    this.loop = false;
    this.paused = true;
    this.currentTime = 0;
    this.error = null;
    this.source = '';
    this.sourceWrites = [];
    this.plays = [];
    this.pending = [];
    this.loadCalls = 0;
    this.hold = false;
    this.throwOnPlay = false;
  }
  get src() { return this.source; }
  set src(value) {
    this.source = value;
    this.sourceWrites.push(value);
    this.currentTime = 0;
    this.paused = true;
    this.error = null;
  }
  emit(type) { this.dispatchEvent(new Event(type)); }
  play() {
    this.plays.push({ src: this.src, time: this.currentTime, volume: this.volume });
    if (this.throwOnPlay) throw new Error('device refused play');
    if (this.error) return Promise.reject(new Error('failed media requires reloading src'));
    this.paused = false;
    return new Promise((resolve, reject) => {
      const operation = {
        resolve: () => { this.paused = false; this.emit('playing'); resolve(); },
        reject,
      };
      if (this.hold) this.pending.push(operation);
      else queueMicrotask(operation.resolve);
    });
  }
  pause() {
    const wasPaused = this.paused;
    this.paused = true;
    if (!wasPaused) this.emit('pause');
  }
  load() { this.loadCalls++; }
  removeAttribute(name) { if (name === 'src') this.source = ''; }
}

function harness(options = {}) {
  const media = new Media();
  let creations = 0;
  const music = createBackgroundMusic({
    tracks,
    createAudio: () => { creations++; return media; },
    ...options,
  });
  return { media, music, get creations() { return creations; } };
}

const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

class AudioNode {
  connections = [];
  disconnected = false;
  connect(destination) { this.connections.push(destination); return destination; }
  disconnect() { this.disconnected = true; this.connections = []; }
}

class Context {
  constructor(options = {}) {
    this.options = options;
    this.state = 'suspended';
    this.destination = {};
    this.resumeCalls = 0;
    this.closeCalls = 0;
    this.sources = [];
    this.gains = [];
    this.pending = [];
  }
  createMediaElementSource(media) {
    if (this.options.failSource) throw new Error('media graph unavailable');
    const source = new AudioNode();
    source.mediaElement = media;
    this.sources.push(source);
    return source;
  }
  createGain() {
    const gain = new AudioNode();
    gain.gain = { value: 1 };
    this.gains.push(gain);
    return gain;
  }
  resume() {
    this.resumeCalls++;
    if (this.options.throwResume) throw new Error('resume unavailable');
    return new Promise((resolve, reject) => {
      const operation = { resolve: () => { this.state = 'running'; resolve(); }, reject };
      if (this.options.hold) this.pending.push(operation);
      else operation.resolve();
    });
  }
  suspend() { throw new Error('lifecycle must pause media without suspending its context'); }
  decodeAudioData() { throw new Error('streamed music must never decode whole tracks'); }
  close() { this.closeCalls++; this.state = 'closed'; return Promise.resolve(); }
}

function graphHarness(options = {}, musicOptions = {}) {
  const contexts = [];
  const h = harness({
    createAudioContext: () => { const context = new Context(options); contexts.push(context); return context; },
    ...musicOptions,
  });
  return { ...h, contexts };
}

test('manual start leaves every track unloaded while choosing and wrapping', () => {
  const { media, music } = harness();
  assert.equal(media.preload, 'none');
  assert.equal(music.getState().index, 0);
  assert.equal(music.getState().requested, false);
  music.previous();
  assert.equal(music.getState().index, 2);
  music.next();
  assert.equal(music.getState().index, 0);
  music.select(1);
  assert.equal(music.getState().track.id, 'two');
  assert.deepEqual(media.sourceWrites, []);
  assert.equal(media.loadCalls, 0);
  assert.equal(media.plays.length, 0);
  music.dispose();
});

test('play runs inside the gesture, uses one element, and pause preserves position', async () => {
  const h = harness(), { media, music } = h;
  media.hold = true;
  const started = music.play();
  assert.equal(media.plays.length, 1, 'play is called before yielding the gesture');
  assert.equal(music.getState().requested, true);
  assert.equal(music.getState().loading, true);
  assert.equal(music.getState().playing, false);
  media.pending.shift().resolve();
  assert.equal(await started, true);
  assert.equal(music.getState().playing, true);
  media.currentTime = 37;
  music.pause();
  assert.equal(media.paused, true);
  assert.equal(music.getState().requested, false);
  assert.equal(music.getState().playing, false);
  media.hold = false;
  await music.play();
  assert.equal(media.currentTime, 37);
  assert.equal(h.creations, 1);
  assert.deepEqual(media.sourceWrites, ['./one.mp3']);
  music.dispose();
});

test('switching and ended advance through the playlist and reset track position', async () => {
  const { media, music } = harness();
  await music.play();
  media.currentTime = 21;
  music.next();
  assert.equal(media.src, './two.mp3');
  assert.equal(media.currentTime, 0);
  await settle();
  music.select(2);
  await settle();
  media.emit('ended');
  await settle();
  assert.equal(music.getState().index, 0);
  assert.equal(music.getState().playing, true);
  music.previous();
  await settle();
  assert.equal(music.getState().index, 2);
  music.pause();
  const attempts = media.plays.length;
  media.emit('ended');
  assert.equal(media.plays.length, attempts);
  music.dispose();
});

test('a one-track playlist replays on ended', async () => {
  const { media, music } = harness({ tracks: [tracks[0]] });
  await music.play();
  media.currentTime = 90;
  media.emit('ended');
  await settle();
  assert.equal(media.plays.length, 2);
  assert.equal(media.currentTime, 0);
  assert.equal(music.getState().playing, true);
  music.dispose();
});

test('suspension preserves user intent and position while manual pause stays paused', async () => {
  const { media, music } = harness();
  await music.play();
  media.currentTime = 42;
  music.setSuspended(true);
  assert.equal(media.paused, true);
  assert.equal(music.getState().requested, true);
  assert.equal(music.getState().suspended, true);
  music.setSuspended(false);
  await settle();
  assert.equal(music.getState().playing, true);
  assert.equal(media.currentTime, 42);
  music.setSuspended(true);
  music.pause();
  music.setSuspended(false);
  await settle();
  assert.equal(media.paused, true);
  assert.equal(media.plays.length, 2);
  assert.equal(music.getState().requested, false);
  music.dispose();
});

test('play and switching while suspended defer assigning a source until resume', async () => {
  const { media, music } = harness();
  music.setSuspended(true);
  await music.play();
  music.next();
  assert.equal(music.getState().requested, true);
  assert.equal(music.getState().loading, false);
  assert.deepEqual(media.sourceWrites, []);
  music.setSuspended(false);
  assert.equal(media.src, './two.mp3');
  await settle();
  assert.equal(music.getState().playing, true);
  music.dispose();
});

test('volume silences immediately without discarding active playback intent', async () => {
  const { media, music } = harness({ volume: .4 });
  assert.equal(media.volume, .4);
  await music.play();
  music.setVolume(0);
  assert.equal(media.volume, 0);
  assert.equal(media.paused, false);
  assert.equal(music.getState().requested, true);
  music.setVolume(.6);
  assert.equal(media.volume, .6);
  assert.equal(media.plays.length, 1);
  music.setVolume(2);
  assert.equal(media.volume, 1);
  music.setVolume(-2);
  assert.equal(media.volume, 0);
  music.dispose();
});

test('autoplay rejection stops intent and is retried only by an explicit play', async () => {
  const { media, music } = harness();
  media.hold = true;
  const blocked = music.play();
  media.pending.shift().reject(Object.assign(new Error('gesture needed'), { name: 'NotAllowedError' }));
  assert.equal(await blocked, false);
  assert.equal(music.getState().requested, false);
  assert.equal(music.getState().playing, false);
  assert.equal(music.getState().loading, false);
  assert.ok(music.getState().error);
  music.setSuspended(true);
  music.setSuspended(false);
  await settle();
  assert.equal(media.plays.length, 1);
  media.hold = false;
  assert.equal(await music.play(), true);
  assert.equal(music.getState().error, false);
  music.dispose();
});

test('synchronous play failures are caught and can be retried', async () => {
  const { media, music } = harness();
  media.throwOnPlay = true;
  assert.equal(await music.play(), false);
  assert.ok(music.getState().error);
  media.throwOnPlay = false;
  assert.equal(await music.play(), true);
  music.dispose();
});

test('media errors stop playback and do not skip endlessly to another track', async () => {
  const { media, music } = harness();
  await music.play();
  media.error = { code: 3 };
  media.emit('error');
  assert.equal(media.paused, true);
  assert.equal(music.getState().requested, false);
  assert.equal(music.getState().index, 0);
  assert.ok(music.getState().error);
  media.emit('ended');
  music.setSuspended(true);
  music.setSuspended(false);
  await settle();
  assert.equal(media.plays.length, 1);
  music.dispose();
});

test('explicit play reloads a failed source while autoplay retries retain the current source', async () => {
  const { media, music } = harness();
  await music.play();
  media.error = { code: 3 };
  media.emit('error');
  assert.equal(await music.play(), true);
  assert.deepEqual(media.sourceWrites, ['./one.mp3', './one.mp3']);
  media.hold = true;
  music.pause();
  const denied = music.play();
  media.pending.shift().reject(new Error('permission denied'));
  assert.equal(await denied, false);
  media.hold = false;
  assert.equal(await music.play(), true);
  assert.deepEqual(media.sourceWrites, ['./one.mp3', './one.mp3']);
  music.dispose();
});

test('zero master volume uses muted even when element volume writes are ignored', async () => {
  const { media, music } = harness({ volume: 0, createAudioContext: null });
  assert.equal(media.muted, true);
  Object.defineProperty(media, 'volume', { get: () => 1, set() {} });
  await music.play();
  music.setVolume(.7);
  assert.equal(media.muted, false);
  music.setVolume(0);
  assert.equal(media.muted, true);
  assert.equal(music.getState().requested, true);
  music.dispose();
});

test('gain graph is lazy and streams from the same media element without decoding', async () => {
  const { media, music, contexts } = graphHarness({}, { volume: .3 });
  music.next();
  music.setVolume(.4);
  music.setSuspended(true);
  await music.play();
  assert.equal(contexts.length, 0, 'deferred Play cannot create or resume a context');
  music.pause();
  music.setSuspended(false);
  assert.equal(contexts.length, 0);
  const started = music.play();
  assert.equal(contexts.length, 1);
  const context = contexts[0];
  assert.equal(context.resumeCalls, 1, 'resume happens before yielding the gesture');
  assert.equal(media.plays.length, 1, 'media play shares the synchronous gesture');
  assert.equal(context.sources[0].mediaElement, media);
  assert.equal(media.volume, 1);
  assert.equal(context.gains[0].gain.value, .4);
  assert.deepEqual(context.sources[0].connections, [context.gains[0]]);
  assert.deepEqual(context.gains[0].connections, [context.destination]);
  assert.equal(await started, true);
  music.setVolume(.65);
  assert.equal(context.gains[0].gain.value, .65);
  assert.equal(media.volume, 1);
  music.setVolume(0);
  assert.equal(context.gains[0].gain.value, 0);
  assert.equal(media.muted, true);
  music.setVolume(.5);
  assert.equal(media.muted, false);
  music.next();
  await settle();
  assert.equal(contexts.length, 1);
  assert.equal(context.sources.length, 1);
  music.setSuspended(true);
  music.setSuspended(false);
  await settle();
  assert.equal(context.resumeCalls, 1, 'running context needs no lifecycle resume');
  music.dispose();
  assert.equal(context.closeCalls, 1);
  assert.equal(context.sources[0].disconnected, true);
  assert.equal(context.gains[0].disconnected, true);
});

test('failed or unavailable graph creation falls back to media volume and mute', async () => {
  for (const options of [{ failSource: true }, { unavailable: true }]) {
    const contexts = [];
    const { media, music } = harness({
      volume: .35,
      createAudioContext: () => {
        if (options.unavailable) throw new Error('AudioContext missing');
        const context = new Context(options);
        contexts.push(context);
        return context;
      },
    });
    assert.equal(await music.play(), true);
    assert.equal(media.volume, .35);
    music.setVolume(0);
    assert.equal(media.muted, true);
    music.setVolume(.6);
    assert.equal(media.volume, .6);
    assert.equal(media.muted, false);
    if (contexts[0]) assert.equal(contexts[0].closeCalls, 1);
    music.dispose();
  }
});

test('resume rejection stops intent and an explicit new gesture can retry the existing graph', async () => {
  const { media, music, contexts } = graphHarness({ hold: true });
  const first = music.play();
  const context = contexts[0];
  await settle();
  assert.equal(music.getState().playing, false, 'media playing alone cannot confirm a suspended context');
  context.pending.shift().reject(new Error('context permission denied'));
  assert.equal(await first, false);
  assert.equal(media.paused, true);
  assert.equal(music.getState().requested, false);
  assert.ok(music.getState().error);
  music.setSuspended(true);
  music.setSuspended(false);
  assert.equal(context.resumeCalls, 1);
  const retry = music.play();
  assert.equal(context.resumeCalls, 2);
  context.pending.shift().resolve();
  assert.equal(await retry, true);
  assert.equal(contexts.length, 1);
  assert.equal(music.getState().error, false);
  music.dispose();
});

test('a synchronous context resume error is caught without starting media', async () => {
  const { media, music } = graphHarness({ throwResume: true });
  assert.equal(await music.play(), false);
  assert.equal(media.plays.length, 0);
  assert.equal(music.getState().requested, false);
  assert.ok(music.getState().error);
  music.dispose();
});

test('late context resume cannot restart paused or disposed music', async () => {
  for (const action of ['pause', 'dispose']) {
    const { media, music, contexts } = graphHarness({ hold: true });
    const started = music.play();
    const context = contexts[0];
    music[action]();
    context.pending.shift().resolve();
    assert.equal(await started, false);
    assert.equal(media.paused, true);
    assert.equal(music.getState().playing, false);
    if (action === 'dispose') assert.equal(context.closeCalls, 1);
    music.dispose();
  }
});

test('old context resume rejection cannot silence a newer successful Play', async () => {
  const { media, music, contexts } = graphHarness({ hold: true });
  const first = music.play();
  const context = contexts[0];
  music.pause();
  const second = music.play();
  context.pending[1].resolve();
  assert.equal(await second, true);
  context.pending[0].reject(new Error('old context resume rejected'));
  assert.equal(await first, false);
  assert.equal(media.paused, false);
  assert.equal(music.getState().playing, true);
  assert.equal(music.getState().error, false);
  music.dispose();
});

test('late resolution cannot restart a manually paused or suspended player', async () => {
  for (const action of ['pause', 'suspend']) {
    const { media, music } = harness();
    media.hold = true;
    const pending = music.play();
    if (action === 'pause') music.pause();
    else music.setSuspended(true);
    media.pending.shift().resolve();
    assert.equal(await pending, false);
    assert.equal(media.paused, true);
    assert.equal(music.getState().playing, false);
    assert.equal(music.getState().loading, false);
    music.dispose();
  }
});

test('rapid selection ignores stale successes and rejections without silencing the current track', async () => {
  const { media, music } = harness();
  media.hold = true;
  const first = music.play();
  music.select(1);
  music.select(2);
  assert.deepEqual(media.plays.map(play => play.src), ['./one.mp3', './two.mp3', './three.mp3']);
  media.pending[2].resolve();
  await settle();
  media.pending[0].reject(new Error('old source aborted'));
  assert.equal(await first, false);
  media.pending[1].resolve();
  await settle();
  assert.equal(music.getState().index, 2);
  assert.equal(music.getState().playing, true);
  assert.equal(music.getState().error, false);
  assert.equal(media.paused, false);
  music.dispose();
});

test('dispose releases source and subscriptions and guards a pending play result', async () => {
  const { media, music } = harness();
  const snapshots = [];
  const unsubscribe = music.subscribe(state => snapshots.push(state));
  assert.equal(snapshots.length, 1);
  media.hold = true;
  const pending = music.play();
  unsubscribe();
  const observed = snapshots.length;
  music.dispose();
  music.dispose();
  media.pending.shift().resolve();
  assert.equal(await pending, false);
  assert.equal(media.paused, true);
  assert.equal(media.src, '');
  assert.equal(music.getState().requested, false);
  assert.equal(music.getState().playing, false);
  assert.equal(snapshots.length, observed);
  assert.equal(await music.play(), false);
  assert.equal(media.plays.length, 1);
});

test('dispose releases a previously loaded source after selecting another track while paused', async () => {
  const { media, music } = harness();
  await music.play();
  music.pause();
  music.next();
  assert.equal(media.src, './one.mp3');
  music.dispose();
  assert.equal(media.src, '');
  assert.equal(media.loadCalls, 1);
});

test('an older paused request cannot silence or reject the newer resumed request', async () => {
  const { media, music } = harness();
  media.hold = true;
  const first = music.play();
  assert.equal(music.play(), first, 'repeated play while pending reuses the request');
  music.pause();
  const second = music.play();
  media.pending[1].resolve();
  assert.equal(await second, true);
  media.pending[0].reject(new Error('paused request aborted'));
  assert.equal(await first, false);
  assert.equal(media.paused, false);
  assert.equal(music.getState().playing, true);
  assert.equal(music.getState().error, false);
  music.dispose();
});

test('subscribers receive new snapshots and can unsubscribe', async () => {
  const { music } = harness();
  const states = [];
  const unsubscribe = music.subscribe(state => states.push(state));
  await music.play();
  assert.equal(states[0].requested, false);
  assert.equal(states.at(-1).playing, true);
  unsubscribe();
  const count = states.length;
  music.pause();
  assert.equal(states.length, count);
  music.dispose();
});

test('missing Audio or an empty playlist is safe in headless environments', async () => {
  if (typeof globalThis.Audio === 'undefined') {
    const defaultUnavailable = createBackgroundMusic({ tracks });
    assert.equal(defaultUnavailable.getState().error, 'unavailable');
    assert.equal(await defaultUnavailable.play(), false);
    defaultUnavailable.dispose();
  }
  const unavailable = createBackgroundMusic({ tracks, createAudio: () => { throw new ReferenceError('Audio missing'); } });
  assert.equal(unavailable.getState().available, false);
  assert.equal(unavailable.getState().error, 'unavailable');
  assert.equal(await unavailable.play(), false);
  unavailable.next();
  unavailable.pause();
  unavailable.setVolume(0);
  unavailable.setSuspended(false);
  unavailable.dispose();
  const empty = harness({ tracks: [] });
  assert.equal(await empty.music.play(), false);
  empty.music.next();
  empty.music.previous();
  assert.equal(empty.music.getState().track, null);
  assert.deepEqual(empty.media.sourceWrites, []);
  empty.music.dispose();
});
