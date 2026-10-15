

export const VEHICLE_AUDIO_ASSETS = Object.freeze({
  engine: './assets/audio/engine.ogg',
  tire: './assets/audio/tire.ogg',
  impact: './assets/audio/impact.ogg',
});

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const smooth = (low, high, value) => {
  const t = clamp((value - low) / (high - low));
  return t * t * (3 - 2 * t);
};







export function createVehicleAudio({
  AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext,
  fetch: fetchAsset = globalThis.fetch?.bind(globalThis),
  muted: initiallyMuted = false,
  urls = VEHICLE_AUDIO_ASSETS,
  loadTimeoutMs = 8000,
  now = () => (globalThis.performance?.now?.() ?? Date.now()) / 1000,
  setTimeout: setTimer = globalThis.setTimeout.bind(globalThis),
  clearTimeout: clearTimer = globalThis.clearTimeout.bind(globalThis),
} = {}) {
  let context = null, master = null, disposed = false, muted = Boolean(initiallyMuted), volume = 1;
  let loadPromise = null, resumePromise = null, closePromise = null;
  let engine = null, tire = null, impactVoice = null;
  let engineGain = 0, tireGain = 0, engineRate = .76, tireRate = .9;
  let impactHeld = false, lastImpactAt = -Infinity;
  const buffers = { engine: null, tire: null, impact: null };
  const pending = new Set();
  const timeoutMs = clamp(finite(loadTimeoutMs) || 8000, 10, 30000);




  function bounded(operation, fallback, cancel = () => {}) {
    return new Promise(resolve => {
      let settled = false, timer;
      const finish = (value, cancelled = false) => {
        if (settled) return;
        settled = true;
        clearTimer(timer);
        pending.delete(abort);
        if (cancelled) { try { cancel(); } catch {} }
        resolve(value);
      };
      const abort = () => finish(fallback, true);
      pending.add(abort);
      timer = setTimer(abort, timeoutMs);
      try {
        Promise.resolve(operation()).then(value => finish(value), () => finish(fallback));
      } catch { finish(fallback); }
    });
  }

  function parameter(param, value, immediate = false) {
    if (!param || !context) return;
    try {
      const time = context.currentTime;
      param.cancelScheduledValues(time);
      if (immediate) param.setValueAtTime(value, time);
      else param.setTargetAtTime(value, time, .025);
    } catch { try { param.value = value; } catch {} }
  }

  function release(voice, stop = true) {
    if (!voice) return;
    voice.source.onended = null;
    if (stop) { try { voice.source.stop(); } catch {} }
    try { voice.source.disconnect(); } catch {}
    try { voice.gain.disconnect(); } catch {}
  }

  function silence() {

    parameter(master?.gain, 0, true);
    release(engine); release(tire); release(impactVoice);
    engine = tire = impactVoice = null;
    engineGain = tireGain = 0;
    engineRate = .76; tireRate = .9;
  }

  function makeContext() {
    if (context) return context.state !== 'closed';
    if (!AudioContextClass || disposed) return false;
    try {
      context = new AudioContextClass();
      master = context.createGain();
      parameter(master.gain, 0, true);
      master.connect(context.destination);
      return true;
    } catch {

      const failedContext = context;
      try { master?.disconnect(); } catch {}
      context = master = null;
      if (failedContext) bounded(() => failedContext.close(), false);
      return false;
    }
  }

  function loadAssets() {
    if (loadPromise) return loadPromise;
    const owner = context;
    loadPromise = Promise.all(Object.keys(buffers).map(async kind => {
      if (!fetchAsset || !urls[kind]) return;
      const abort = typeof AbortController === 'function' ? new AbortController() : null;
      let cancelled = false;
      const buffer = await bounded(async () => {
        const response = await fetchAsset(urls[kind], { signal: abort?.signal });
        if (!response || response.ok === false || disposed || cancelled) return null;
        const data = await response.arrayBuffer();
        if (disposed || cancelled || !data || data.byteLength > 8 * 1024 * 1024) return null;

        return await new Promise((resolve, reject) => {
          const decoded = owner.decodeAudioData(data, resolve, reject);
          decoded?.then?.(resolve, reject);
        });
      }, null, () => { cancelled = true; abort?.abort(); });
      if (!disposed && context === owner) buffers[kind] = buffer;
    }));
    return loadPromise;
  }

  function unlock() {
    if (disposed || !makeContext()) return Promise.resolve(false);


    if (context.state !== 'running' && !resumePromise) {
      const owner = context;
      resumePromise = bounded(() => Promise.resolve(owner.resume()).then(() => true), false)
        .then(result => { resumePromise = null; return result; });
    }
    return Promise.all([resumePromise || Promise.resolve(true), loadAssets()])
      .then(([resumed]) => !disposed && resumed && context?.state === 'running'
        && Object.values(buffers).some(Boolean), () => false);
  }

  function loop(kind, gainValue, rate) {
    if (!buffers[kind]) return null;
    let source, gain;
    try {
      source = context.createBufferSource();
      gain = context.createGain();
      source.buffer = buffers[kind];
      source.loop = true;
      parameter(source.playbackRate, rate, true);
      parameter(gain.gain, 0, true);
      source.connect(gain); gain.connect(master);
      source.start();
      const voice = { source, gain };
      source.onended = () => {
        if (kind === 'engine' && engine === voice) engine = null;
        if (kind === 'tire' && tire === voice) tire = null;
        release(voice, false);
      };
      parameter(gain.gain, gainValue);
      return voice;
    } catch {
      if (source && gain) release({ source, gain });
      else { try { source?.disconnect(); gain?.disconnect(); } catch {} }
      return null;
    }
  }

  function playImpact(strength, time) {
    if (!buffers.impact || time - lastImpactAt < .25) return;
    let source, gain;
    try {

      release(impactVoice); impactVoice = null;
      source = context.createBufferSource(); gain = context.createGain();
      source.buffer = buffers.impact;
      parameter(source.playbackRate, .92 + strength * .16, true);
      parameter(gain.gain, .15 + .55 * strength, true);
      source.connect(gain); gain.connect(master);
      const voice = { source, gain };
      source.onended = () => {
        if (impactVoice === voice) impactVoice = null;
        release(voice, false);
      };
      source.start();
      source.stop(context.currentTime + Math.min(1.2, buffers.impact.duration || .5));
      impactVoice = voice;
      lastImpactAt = time;
    } catch {
      if (source && gain) release({ source, gain });
      else { try { source?.disconnect(); gain?.disconnect(); } catch {} }
    }
  }

  function update(dt, state = {}) {
    if (disposed) return;
    const impact = clamp(finite(state.impact)), impactEdge = impact > .04 && !impactHeld;
    impactHeld = impact > .04;
    if (!state.active || muted || volume<=0 || !context || context.state !== 'running') {
      silence();
      return;
    }
    const speed = Math.abs(finite(state.speed)), slip = Math.abs(finite(state.slip));
    const throttle = clamp(Math.abs(finite(state.throttle))), braking = clamp(finite(state.braking));
    const speedLoad = clamp(speed / 34), slipLoad = smooth(.55, 4.5, slip);
    const brakeLoad = smooth(.3, .9, braking) * smooth(7, 18, speed);
    const blend = 1 - Math.exp(-clamp(finite(dt), 0, .1) / .16);
    const blendTire = 1 - Math.exp(-clamp(finite(dt), 0, .1) / .1);
    engineRate += (.76 + speedLoad * 1.2 + throttle * .24 - engineRate) * blend;
    engineGain += (.12 + speedLoad * .15 + throttle * .17 - engineGain) * blend;
    const tireTarget = smooth(1.5, 7, speed) * (.29 * slipLoad + .12 * brakeLoad);
    tireGain += (tireTarget - tireGain) * blendTire;
    tireRate += (.9 + speedLoad * .35 + slipLoad * .12 - tireRate) * blendTire;


    parameter(master.gain, .6*volume, true);
    if (!engine) engine = loop('engine', engineGain, engineRate);
    if (engine) { parameter(engine.gain.gain, engineGain); parameter(engine.source.playbackRate, engineRate); }
    if (!tire && tireTarget > .003) tire = loop('tire', tireGain, tireRate);
    if (tire) {
      parameter(tire.gain.gain, tireGain); parameter(tire.source.playbackRate, tireRate);
      if (tireTarget < .002 && tireGain < .002) { release(tire); tire = null; }
    }
    if (impactEdge) playImpact(impact, finite(now()));
  }

  function stop() {
    silence();


    impactHeld = true;
  }

  function setMuted(value) {
    muted = Boolean(value);
    if (muted) stop();
    return muted;
  }

  function setVolume(value) {
    volume=clamp(finite(value));
    if(volume<=0)stop();
    else if(master&&context)parameter(master.gain,muted?0:.6*volume,true);
    return volume;
  }

  function dispose() {
    if (disposed) return closePromise || Promise.resolve();
    disposed = true;
    stop();
    for (const abort of [...pending]) abort();
    try { master?.disconnect(); } catch {}
    for (const kind of Object.keys(buffers)) buffers[kind] = null;
    closePromise = context ? bounded(() => context.close(), false) : Promise.resolve();
    return closePromise;
  }

  return { unlock, update, stop, dispose, setMuted, setVolume, get volume(){return volume}, get muted() { return muted; } };
}
