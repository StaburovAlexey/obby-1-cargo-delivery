async (options = {}) => {
  // Chrome evaluate_script installer. Reads real steps only; never drives input
  // or advances physics. Actual vendor rapier.mjs exposes every method below.
  // Default: start immediately, return status, fetch __rapierStages.getReport().
  // Configure {durationMs: 8000, autoStart: false} or __rapierStagesConfig.
  const settings = { durationMs: 8000, ...window.__rapierStagesConfig, ...options };
  const existing = window.__rapierStages;
  if (existing?.version === 1 && existing.status().state === 'running') return existing.status();
  const methods = {
    userChanges: 'timingUserChanges', broadPhase: 'timingBroadPhase',
    narrowPhase: 'timingNarrowPhase', solver: 'timingSolver', ccd: 'timingCcd',
    islandConstruction: 'timingIslandConstruction', rapierStep: 'timingStep',
  };
  const clock = () => performance.now();
  const context = () => {
    try {
    const d = window.__sceneDebug, s = d?.model?.state;
    return { driving: !!d?.driving, canyon: !!d?.canyon?.active,
      vehicleId: d?.gameplay?.state?.selectedId ?? null,
      pose: s ? { x: s.x, y: s.y, z: s.z, speed: s.linearSpeed, grounded: s.grounded } : null };
    } catch (error) { return { unavailable: String(error?.stack || error) }; }
  };
  const empty = () => ({ samples: 0, totalMs: 0, maxMs: 0 });
  const add = (bucket, value) => { bucket.samples++; bucket.totalMs += value; bucket.maxMs = Math.max(bucket.maxMs, value); };
  const summarize = bucket => ({ ...bucket, meanMs: bucket.samples ? bucket.totalMs / bucket.samples : null });
  let state = 'installed', active = null, report = null;
  const status = () => ({ version: 1, state, steps: active?.steps ?? report?.steps ?? 0,
    durationMs: active?.durationMs ?? report?.requestedDurationMs ?? null,
    elapsedMs: active ? clock() - active.startedAt : report?.elapsedMs ?? 0,
    reportReady: !!report, reportExpression: 'window.__rapierStages.getReport()' });
  const finish = (result = 'complete', error = null) => {
    const run = active;
    if (!run || run.finished) return report;
    run.finished = true;
    clearTimeout(run.timer);
    window.removeEventListener('pagehide', run.onPageHide);
    const restoreErrors = [];
    // Restore the exact original own-property shape, including an earlier
    // wrapper, or remove our own override to reveal the prototype method.
    try {
      if (run.stepDescriptor) Object.defineProperty(run.world, 'step', run.stepDescriptor);
      else delete run.world.step;
    } catch (e) { restoreErrors.push('world.step: ' + String(e?.stack || e)); }
    try { run.world.profilerEnabled = run.previousProfiler; }
    catch (e) { restoreErrors.push('world.profilerEnabled: ' + String(e?.stack || e)); }
    const endedAt = clock();
    state = error || restoreErrors.length ? 'failed' : result;
    report = { schema: 'obby-rapier-stages-v1', recordedAt: new Date().toISOString(),
      state, requestedDurationMs: run.durationMs, startedAt: run.startedAt, endedAt,
      elapsedMs: endedAt - run.startedAt, steps: run.steps,
      startContext: run.startContext, endContext: context(),
      outerWorldStep: summarize(run.outer),
      stages: Object.fromEntries(Object.entries(run.stages).map(([name, value]) => [name, summarize(value)])),
      previousProfilerEnabled: run.previousProfiler,
      restorationErrors: restoreErrors, error: error ? String(error?.stack || error) : null,
      invalid: run.steps ? [] : ['No genuine physics steps were observed.'],
      note: 'Milliseconds from actual Rapier World.step calls. Rapier counters overlap and must not be summed. Outer timing excludes counter reads; enabling profiling adds diagnostic overhead. No input, timestep, force, collision or solver settings changed.' };
    active = null;
    return report;
  };
  const start = (config = {}) => {
    if (active) return status();
    const durationMs = Number(config.durationMs ?? settings.durationMs);
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 10000)
      throw Error('durationMs must be positive and at most 10000.');
    const world = window.__sceneDebug?.physics?.world;
    if (!world || typeof world.step !== 'function') throw Error('A live __sceneDebug.physics.world is required.');
    for (const method of Object.values(methods)) if (typeof world[method] !== 'function')
      throw Error('Vendored Rapier method is unavailable: ' + method);
    const previousProfiler = world.profilerEnabled;
    if (typeof previousProfiler !== 'boolean') throw Error('Rapier profilerEnabled must expose a boolean getter/setter.');
    const originalStep = world.step, stepDescriptor = Object.getOwnPropertyDescriptor(world, 'step');
    const run = { world, originalStep, stepDescriptor, previousProfiler, durationMs,
      startedAt: clock(), steps: 0, outer: empty(), stages: Object.fromEntries(Object.keys(methods).map(name => [name, empty()])),
      startContext: context(), finished: false, timer: null, onPageHide: null };
    active = run; report = null; state = 'running';
    const wrappedStep = function (...args) {
      if (run.finished) return Reflect.apply(originalStep, this, args);
      if (clock() - run.startedAt >= run.durationMs) {
        finish('complete');
        return Reflect.apply(originalStep, this, args);
      }
      const started = clock();
      let value;
      try { value = Reflect.apply(originalStep, this, args); }
      catch (error) { finish('failed', error); throw error; }
      const outerMs = clock() - started;
      try {
        // Read immediately after this real step, before another step can replace
        // Rapier's last-step counters. Counter reads are outside outerMs.
        const values = Object.entries(methods).map(([name, method]) => [name, world[method]()]);
        for (const [name, ms] of values) if (!Number.isFinite(ms) || ms < 0)
          throw Error('Invalid Rapier timing for ' + name + ': ' + ms);
        run.steps++; add(run.outer, outerMs);
        for (const [name, ms] of values) add(run.stages[name], ms);
      } catch (error) { finish('failed', error); }
      return value;
    };
    run.onPageHide = () => finish('cancelled');
    try {
      world.profilerEnabled = true;
      if (world.profilerEnabled !== true) throw Error('Rapier profiling could not be enabled.');
      world.step = wrappedStep;
      if (world.step !== wrappedStep) throw Error('World.step could not be wrapped.');
      window.addEventListener('pagehide', run.onPageHide, { once: true });
      run.timer = setTimeout(() => finish('complete'), durationMs);
    } catch (error) { finish('failed', error); }
    return status();
  };
  window.__rapierStages = { version: 1, start, status, getReport: () => report,
    cancel: () => finish('cancelled') };
  return settings.autoStart === false ? status() : start();
}
