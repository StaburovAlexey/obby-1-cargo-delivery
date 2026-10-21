const clampVolume = value => Math.max(0, Math.min(1, Number(value) || 0));

export function createBackgroundMusic({
  tracks = [],
  createAudio = () => new Audio(),
  createAudioContext = () => {
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    return Context ? new Context() : null;
  },
  volume = 1,
} = {}) {
  const playlist = Array.isArray(tracks) ? [...tracks] : [];
  const subscribers = new Set();
  let audio = null;
  let disposed = false;
  let generation = 0;
  let loadedIndex = -1;
  let hasSource = false;
  let activePlay = null;
  let graph = null;
  let graphAttempted = false;
  const state = {
    index: playlist.length ? 0 : -1,
    requested: false,
    playing: false,
    suspended: false,
    loading: false,
    error: false,
    volume: clampVolume(volume),
    available: false,
  };

  function getState() {
    return { ...state, track: playlist[state.index] || null };
  }

  function publish() {
    if (disposed) return;
    for (const subscriber of subscribers) {
      try { subscriber(getState()); } catch {}
    }
  }

  function desired() {
    return !disposed && state.available && state.requested && !state.suspended;
  }

  function silence() {
    try { audio?.pause(); } catch {}
  }

  function applyVolume() {
    if (!audio) return;
    // Safari ignores element volume on iOS; muted still guarantees silence.
    audio.muted = state.volume === 0;
    audio.volume = graph ? 1 : state.volume;
    if (graph) graph.gain.gain.value = state.volume;
  }

  function releaseGraph(context, source, gain) {
    try { source?.disconnect(); } catch {}
    try { gain?.disconnect(); } catch {}
    try { Promise.resolve(context?.close()).catch(() => {}); } catch {}
  }

  function ensureGraph() {
    if (graphAttempted) return;
    graphAttempted = true;
    let context, source, gain;
    try {
      context = createAudioContext?.();
      if (!context) return;
      gain = context.createGain();
      gain.gain.value = state.volume;
      source = context.createMediaElementSource(audio);
      source.connect(gain);
      gain.connect(context.destination);
      graph = { context, source, gain };
      applyVolume();
    } catch {
      releaseGraph(context, source, gain);
      graph = null;
      applyVolume();
    }
  }

  function invalidate() {
    generation++;
    activePlay = null;
    state.playing = false;
    state.loading = false;
  }

  function fail(error) {
    invalidate();
    if (error === 'media') loadedIndex = -1;
    state.requested = false;
    state.error = error;
    silence();
    publish();
  }

  function start() {
    if (!desired()) return Promise.resolve(false);
    const attempt = ++generation;
    state.loading = true;
    state.playing = false;
    try {
      if (loadedIndex !== state.index) {
        silence();
        audio.src = playlist[state.index].src;
        hasSource = true;
        loadedIndex = state.index;
        try { audio.currentTime = 0; } catch {}
      }
      publish();
      if (attempt !== generation || !desired()) return Promise.resolve(false);
      ensureGraph();
      // Both calls stay in the click handler's stack to retain gesture permission.
      const resumed = graph && graph.context.state !== 'running' ? graph.context.resume() : undefined;
      let result;
      try { result = audio.play(); } catch (error) { result = Promise.reject(error); }
      activePlay = Promise.all([resumed, result]).then(() => {
        if (!desired()) {
          silence();
          return false;
        }
        if (attempt !== generation) return false;
        state.playing = true;
        state.loading = false;
        activePlay = null;
        publish();
        return true;
      }, () => {
        if (attempt === generation && !disposed) fail('playback');
        return false;
      });
      return activePlay;
    } catch {
      if (attempt === generation && !disposed) fail('playback');
      return Promise.resolve(false);
    }
  }

  function play() {
    if (disposed) return Promise.resolve(false);
    if (!state.available || !playlist.length) {
      state.error = state.available ? 'empty' : 'unavailable';
      publish();
      return Promise.resolve(false);
    }
    if (state.requested && (state.playing || activePlay)) {
      return activePlay || Promise.resolve(true);
    }
    state.requested = true;
    state.error = false;
    if (state.suspended) {
      publish();
      return Promise.resolve(false);
    }
    return start();
  }

  function pause() {
    if (disposed) return getState();
    invalidate();
    state.requested = false;
    silence();
    publish();
    return getState();
  }

  function choose(index, restart = false) {
    if (disposed || !playlist.length || !Number.isInteger(index)) return getState();
    const selected = ((index % playlist.length) + playlist.length) % playlist.length;
    if (selected === state.index && !restart) return getState();
    invalidate();
    state.index = selected;
    state.error = state.available ? false : 'unavailable';
    silence();
    // Defer touching src until playback is requested and the lifecycle permits it.
    loadedIndex = -1;
    if (desired()) start();
    else publish();
    return getState();
  }

  function select(index) { return choose(index); }
  function next() { return choose(state.index + 1); }
  function previous() { return choose(state.index - 1); }

  function setVolume(value) {
    if (disposed) return getState();
    state.volume = clampVolume(value);
    applyVolume();
    publish();
    return getState();
  }

  function setSuspended(value) {
    if (disposed || state.suspended === Boolean(value)) return getState();
    invalidate();
    state.suspended = Boolean(value);
    if (state.suspended) silence();
    if (desired()) start();
    else publish();
    return getState();
  }

  function subscribe(subscriber) {
    if (disposed || typeof subscriber !== 'function') return () => {};
    subscribers.add(subscriber);
    subscriber(getState());
    return () => subscribers.delete(subscriber);
  }

  const handlers = {
    playing() {
      if (!desired()) { silence(); return; }
      state.playing = !graph || graph.context.state === 'running';
      state.loading = !state.playing;
      publish();
    },
    pause() {
      state.playing = false;
      publish();
    },
    waiting() {
      if (!desired()) return;
      state.playing = false;
      state.loading = true;
      publish();
    },
    ended() {
      if (desired()) choose(state.index + 1, true);
    },
    error() {
      if (!disposed && loadedIndex !== -1) fail('media');
    },
  };

  function dispose() {
    if (disposed) return;
    invalidate();
    state.requested = false;
    disposed = true;
    subscribers.clear();
    if (graph) {
      releaseGraph(graph.context, graph.source, graph.gain);
      graph = null;
    }
    if (!audio) return;
    for (const [type, handler] of Object.entries(handlers)) audio.removeEventListener(type, handler);
    silence();
    if (hasSource) {
      audio.removeAttribute('src');
      try { audio.load(); } catch {}
    }
  }

  try {
    audio = createAudio();
    if (!audio?.play || !audio?.pause || !audio?.addEventListener || !audio?.removeEventListener) {
      audio = null;
    } else {
      audio.preload = 'none';
      audio.loop = false;
      applyVolume();
      for (const [type, handler] of Object.entries(handlers)) audio.addEventListener(type, handler);
      state.available = true;
    }
  } catch { audio = null; }
  if (!state.available) state.error = 'unavailable';

  return { play, pause, select, next, previous, setVolume, setSuspended, getState, subscribe, dispose };
}
