() => {
  // Portable Chrome DevTools evaluate_script sourcePath. No game code is changed.
  // Configure window.__fps60Config before calling prepare()/start().
  if (window.__fps60?.version === 1) return window.__fps60.status();
  const defaults = { scene: 'hangar', motion: 'drive', warmupMs: 6000, sampleMs: 12000,
    preloadVehicles: true, vehicleId: null, speedDemand: .38, roadStart: null, hangarAnchor: null,
    canyonSpeedDemand: .55, canyonStart: 300, canyonDriftPeriodMs: 4500,
    canyonKickMs: 400, canyonCountersteerMs: 350, canyonKickSteering: .8,
    canyonKickHandbrake: 1, canyonYawDamping: .6,
    gpu: true, profile: 'unspecified', label: 'unspecified' };
  const faults = [], resourceFaults = [], longTasks = [], phases = [];
  const MAX_FRAME_SAMPLES = 120000;
  let state = 'installed', run = null, road = null, canyon = null, prepared = null, anchorPreparation = null;
  const capture = (type, message) => { if (faults.length < 256) faults.push({ type, message: String(message), at: performance.now() }); };
  window.addEventListener('error', event => {
    if (event.target && event.target !== window) { if (resourceFaults.length < 256) resourceFaults.push({ url: event.target.src || event.target.href || '', at: performance.now() }); }
    else capture('error', event.message);
  }, true);
  window.addEventListener('unhandledrejection', event => capture('rejection', event.reason?.stack || event.reason));
  try { new PerformanceObserver(list => { for (const entry of list.getEntries()) if (longTasks.length < 10000) longTasks.push({ startTime: entry.startTime, duration: entry.duration }); }).observe({ type: 'longtask', buffered: true }); } catch {}
  const clean = value => Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
  const config = value => ({ ...defaults, ...window.__fps60Config, ...value });
  const debug = () => {
    const d = window.__sceneDebug;
    if (!d?.startup?.ready || !d.characterReady) throw Error('Wait for startup.ready and characterReady before prepare');
    if (!d.developerMode) throw Error('This harness requires an isolated developer session (?dev=1)');
    return d;
  };
  const waitFor = (condition, description, timeoutMs = 5000) => new Promise((resolve, reject) => {
    let frameId;
    const timeoutId = setTimeout(() => { cancelAnimationFrame(frameId); reject(Error('Timed out waiting for ' + description)); }, timeoutMs);
    const check = () => {
      if (condition()) { clearTimeout(timeoutId); resolve(); }
      else frameId = requestAnimationFrame(check);
    };
    check();
  });
  const pose = d => ({ x: clean(d.model.state.x), y: clean(d.model.state.y), z: clean(d.model.state.z),
    heading: clean(d.model.state.heading), angularVelocity: clean(d.model.state.angularVelocity),
    linearSpeed: clean(d.model.state.linearSpeed),
    slipAngle: clean(d.model.state.slipAngle), driftIntensity: clean(d.model.state.driftIntensity),
    grounded: d.model.state.grounded, driving: d.driving, canyon: d.canyon.active,
    input: { active: d.model.state.active, speedDemand: d.model.state.speedDemand,
      steering: clean(d.model.state.steering), frontWheelAngle: clean(d.model.state.frontWheelAngle),
      brake: clean(d.model.state.brake), handbrake: clean(d.model.state.handbrake) },
    contacts: { blocked: d.model.state.blocked, impactSpeed: clean(d.model.state.impactSpeed),
      groundedWheels: d.model.state.wheelContacts?.filter(contact => contact.grounded).length ?? 0,
      totalWheels: d.model.state.wheelContacts?.length ?? 0 },
    smokeCount: d.canyon.effects.smokeCount, skidCount: d.canyon.effects.skidCount });
  const assets = d => ({ vehicles: d.garage.vehicles.filter(v => v.visual).map(v => v.id).sort(),
    characters: d.characterDisplays.map(v => v.id || v.group?.name || 'unnamed').sort(),
    geometries: d.renderer.info.memory.geometries, textures: d.renderer.info.memory.textures,
    programs: d.renderer.info.programs?.length ?? null });
  const environment = d => {
    const gl = d.renderer.getContext(), extension = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const software = /swiftshader|llvmpipe|software rasterizer/i.test(renderer);
    return { userAgent: navigator.userAgent, platform: navigator.platform, hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemoryGiB: navigator.deviceMemory ?? null, maxTouchPoints: navigator.maxTouchPoints,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio, renderPixelRatio: d.renderer.getPixelRatio(),
        drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight] },
      visibilityState: document.visibilityState, focused: document.hasFocus(), appFocused: d.appFocused,
      webgl: { renderer, vendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        version: gl.getParameter(gl.VERSION), softwareRenderer: software,
        timerQueryExtensionPresent: Boolean(gl.getExtension('EXT_disjoint_timer_query_webgl2')) },
      diagnosticGlobals: { devServer: typeof __URBAN_DEV_SERVER__ !== 'undefined' ? __URBAN_DEV_SERVER__ : null,
        development: typeof __URBAN_DEVELOPMENT__ !== 'undefined' ? __URBAN_DEVELOPMENT__ : null,
        multiplayerUrl: typeof __MULTIPLAYER_URL__ !== 'undefined' ? __MULTIPLAYER_URL__ : null },
      claimLimit: software ? 'Software WebGL: functional/CPU evidence only; not hardware GPU/FPS proof.' :
        'This machine and browser only. Mobile viewport emulation is not Android hardware/FPS evidence.',
      gpuTiming: 'Use application profiler GPU report when available. Extension presence alone is not a GPU timing measurement.',
      shaderCompilation: 'No isolated shader compile measurement. Program counts and cold/warm frame intervals are recorded.' };
  };
  const resetProfiler = d => d.renderProfiler?.reset();
  const percentile = (sorted, q) => sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)] : null;
  const summary = values => {
    const sorted = values.slice().sort((a, b) => a - b), sum = values.reduce((a, b) => a + b, 0);
    return { samples: values.length, mean: clean(values.length ? sum / values.length : NaN),
      p50: clean(percentile(sorted, .5)), p95: clean(percentile(sorted, .95)), p99: clean(percentile(sorted, .99)),
      max: clean(sorted.at(-1)), total: clean(sum) };
  };
  // TIME_ELAPSED queries never block, never read pixels, and never nest with a
  // product timer. Four pending queries bound driver resources during stalls.
  let gpu = null;
  const installGpu = d => {
    if (gpu) return;
    const gl = d.renderer.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    gpu = { available: Boolean(ext && gl.createQuery && gl.getQuery), pending: [], sequence: 0,
      interval: 4, maxPending: 4, original: d.renderer.render };
    if (d.gpuTimer) { gpu.available = false; return; }
    if (!gpu.available) return;
    const discard = record => { gl.deleteQuery(record.query); };
    const poll = () => {
      if (!gpu.pending.length) return;
      if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
        for (const record of gpu.pending) { record.phase.gpu.disjointDropped++; discard(record); }
        gpu.pending.length = 0; return;
      }
      for (let i = gpu.pending.length - 1; i >= 0; i--) {
        const record = gpu.pending[i];
        if (!gl.getQueryParameter(record.query, gl.QUERY_RESULT_AVAILABLE)) continue;
        const ns = gl.getQueryParameter(record.query, gl.QUERY_RESULT);
        if (Number.isFinite(ns) && ns >= 0) record.phase.gpu.values.push(ns / 1e6);
        discard(record); gpu.pending.splice(i, 1);
      }
    };
    d.renderer.render = function(...args) {
      poll();
      const phase = state === 'running' && run?.config.gpu ? run.phase : null;
      const due = phase && ++gpu.sequence % gpu.interval === 0;
      const nested = due && gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY);
      if (nested) phase.gpu.productTimerActiveSkipped++;
      const take = due && !nested && gpu.pending.length < gpu.maxPending;
      const query = take ? gl.createQuery() : null;
      if (query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
      try { return gpu.original.apply(this, args); }
      finally {
        if (query) { gl.endQuery(ext.TIME_ELAPSED_EXT); gpu.pending.push({ query, phase }); }
      }
    };
    gpu.endPhase = phase => {
      poll();
      for (let i = gpu.pending.length - 1; i >= 0; i--) {
        const record = gpu.pending[i];
        if (record.phase !== phase) continue;
        phase.gpu.unresolvedAtEnd++; discard(record); gpu.pending.splice(i, 1);
      }
    };
  };
  const snapshot = d => ({ pose: pose(d), assets: assets(d),
    hangarAnchor: anchorPreparation ? { ...anchorPreparation,
      loadedNearbyCount: d.characterDisplays.filter(display => anchorPreparation.expectedNearbyDisplayIds.includes(display.id)).length } : null,
    renderQuality: d.renderQuality ? { profile: { ...d.renderQuality.profile }, stats: { ...d.renderQuality.stats } } : null,
    rendererPixelRatio: d.renderer.getPixelRatio(), weather: { visible: d.biomeWeather.group.visible,
    fog: d.biomeWeather.fog ? { ...d.biomeWeather.fog } : null },
    gameplay: { mode: d.gameplay.state.mode, eventMode: d.gameplay.state.eventMode, selectedId: d.gameplay.state.selectedId,
      fuel: clean(d.gameplay.state.fuels[d.gameplay.state.selectedId]),
      player: { x: clean(d.gameplay.state.player.x), z: clean(d.gameplay.state.player.z), heading: clean(d.gameplay.state.player.heading) },
      testMode: d.gameplay.state.testMode, pauseReasons: [...d.pauseState.reasons] } });
  const phaseReport = (phase, d) => {
    gpu?.endPhase?.(phase);
    const m = phase.motion, c = run.config, requiredMotion = c.scene !== 'hangar' && c.motion !== 'stationary';
    const movingFraction = m.elapsedMs ? m.movingMs / m.elapsedMs : 0;
    const driftFraction = m.elapsedMs ? m.driftMs / m.elapsedMs : 0;
    if (requiredMotion && (movingFraction < .5 || m.distanceMeters < m.elapsedMs / 1000 * .5))
      phase.invalid.add('insufficient actual vehicle movement for requested drive/drift workload');
    if (requiredMotion && m.maxStallMs > 3000) phase.invalid.add('vehicle stalled below 1 m/s for more than 3 seconds');
    if (c.scene === 'canyon' && c.motion === 'drift' && driftFraction < .05)
      phase.invalid.add('insufficient drift: speed >3 m/s and driftIntensity >0.08 for less than 5% of measured time');
    return { name: phase.name, startedAt: phase.startedAt, endedAt: performance.now(),
    frames: summary(phase.frames), fps: clean(phase.frames.length * 1000 / phase.frames.reduce((a, b) => a + b, 0)),
    overBudget: { above16_67ms: phase.frames.filter(ms => ms > 1000 / 60 + .5).length,
      above33_34ms: phase.frames.filter(ms => ms > 1000 / 30 + .5).length,
      thresholdToleranceMs: .5 },
    renderer: { calls: summary(phase.calls), triangles: summary(phase.triangles) },
    externalGpu: { available: Boolean(gpu?.available && run?.config.gpu), durationMs: summary(phase.gpu.values),
      sampleEveryRenders: gpu?.interval ?? null, maxPending: gpu?.maxPending ?? null,
      disjointDropped: phase.gpu.disjointDropped, unresolvedAtEnd: phase.gpu.unresolvedAtEnd,
      productTimerActiveSkipped: phase.gpu.productTimerActiveSkipped,
      note: 'Asynchronous WebGL TIME_ELAPSED around renderer.render, including its shadow work; no nesting with application GPU timers.' },
    applicationProfiler: d.renderProfiler?.report() ?? null,
    motion: { distanceMeters: clean(m.distanceMeters), movingTimeFraction: clean(movingFraction),
      driftTimeFraction: clean(driftFraction), meanLinearSpeed: clean(m.elapsedMs ? m.speedIntegral / m.elapsedMs : 0),
      maxLinearSpeed: clean(m.maxLinearSpeed), maxAbsSlipAngle: clean(m.maxAbsSlipAngle),
      maxDriftIntensity: clean(m.maxDriftIntensity), peakSmokeCount: m.peakSmokeCount, maxStallMs: clean(m.maxStallMs),
      thresholds: { movingSpeed: 1, minimumMovingTimeFraction: .5, minimumDistanceMetersPerSecond: .5,
        maxStallMs: 3000, driftSpeed: 3, driftIntensity: .08, minimumDriftTimeFraction: .05 } },
    invalid: [...phase.invalid], start: phase.start, end: snapshot(d),
    longTasks: longTasks.filter(task => task.startTime >= phase.startedAt),
    rafIntervalsMs: phase.frames.map(clean), poseSamples: phase.poses };
  };
  const control = (d, elapsed, c) => {
    if (c.scene === 'hangar' || c.motion === 'stationary') return;
    const s = d.model.state;
    if (!d.driving) return;
    const projected = c.scene === 'canyon' ? canyon.projectCanyon(s.x, s.z) : road.projectRoad(s.x, s.z, s.routeContext);
    const lookahead = c.scene === 'canyon' && Math.abs(projected.offset) > 3 ? 14 : 22;
    const target = c.scene === 'canyon' ? canyon.canyonPointAt(projected.progress + lookahead) : road.routePointAtProgress(projected.progress + lookahead, projected);
    const heading = Math.atan2(-(target.x - s.x), -(target.z - s.z));
    const delta = Math.atan2(Math.sin(heading - s.heading), Math.cos(heading - s.heading));
    const drift = c.scene === 'canyon' && c.motion === 'drift';
    // Input +1 turns right; world heading increases to the left. The ordinary
    // road controller is unchanged. Drifting uses a real steering/handbrake
    // initiation, then countersteer and ordinary lane recovery; no pose, velocity,
    // slip telemetry or visual-effect value is written during the sample.
    let steering = Math.max(-.6, Math.min(.6, -delta * 1.7)), handbrake = 0;
    let maneuver = 'follow';
    let desiredYaw = null;
    if (drift) {
      const controller = run.controller;
      const curveAhead = canyon.canyonPointAt(projected.progress + 4);
      const curveAngle = Math.atan2(Math.sin(curveAhead.heading - projected.heading), Math.cos(curveAhead.heading - projected.heading));
      desiredYaw = curveAngle / 4 * Math.max(0, s.linearSpeed);
      // Dampen excess yaw momentum through actual countersteering, while keeping
      // the yaw required to follow the road. This writes only ordinary input.
      const baseSteering = -delta * 1.7 + ((s.angularVelocity || 0) - desiredYaw) * c.canyonYawDamping;
      steering = Math.max(-.8, Math.min(.8, baseSteering));
      if (controller.kickAt === null && elapsed >= controller.nextKickAt && s.grounded &&
          s.linearSpeed > 10 && Math.abs(projected.offset) < 2.5 && Math.abs(delta) < .25) {
        controller.kickAt = elapsed;
        // Follow the coming bend when it is visible; alternate on a straight.
        controller.direction = Math.abs(delta) > .035 ? -Math.sign(delta) : controller.sequence % 2 ? -1 : 1;
        controller.sequence++;
        controller.nextKickAt = elapsed + c.canyonDriftPeriodMs;
      }
      if (controller.kickAt !== null) {
        let age = elapsed - controller.kickAt;
        if (Math.abs(projected.offset) > 4.5 || Math.abs(delta) > .7 || !s.grounded) {
          controller.kickAt = null; maneuver = 'margin-recovery';
        } else {
          if (age < c.canyonKickMs && (Math.abs(s.slipAngle) > .23 || Math.abs(delta) > .4)) {
            // End initiation early once actual slip exists; a long handbrake
            // turn can otherwise spin the car before lane feedback can act.
            controller.kickAt = elapsed - c.canyonKickMs; age = c.canyonKickMs;
          }
          if (age < c.canyonKickMs) {
            steering = controller.direction * c.canyonKickSteering;
            handbrake = c.canyonKickHandbrake; maneuver = 'handbrake-initiation';
          } else if (age < c.canyonKickMs + c.canyonCountersteerMs) {
            steering = -controller.direction * .15 + baseSteering;
            maneuver = 'countersteer';
          } else controller.kickAt = null;
        }
      }
      steering = Math.max(-.95, Math.min(.95, steering));
    }
    d.model.setInput({ active: true, speedDemand: drift ? c.canyonSpeedDemand : c.speedDemand, steering, handbrake });
    run.route = { progress: clean(projected.progress), offset: clean(projected.offset), headingError: clean(delta),
      maneuver, maneuverSequence: run.controller.sequence, steering: clean(steering), handbrake,
      desiredYaw: clean(desiredYaw), actualYaw: clean(s.angularVelocity) };
  };
  const api = {
    version: 1,
    status: () => ({ state, prepared: prepared?.scene ?? null, phase: run?.phase?.name ?? null,
      elapsedMs: run?.phase ? clean(performance.now() - run.phase.startedAt) : null,
      currentMotion: run?.phase ? { speed: clean(window.__sceneDebug?.model?.state.linearSpeed),
        driftIntensity: clean(window.__sceneDebug?.model?.state.driftIntensity),
        distanceMeters: clean(run.phase.motion.distanceMeters), stalledForMs: clean(run.phase.motion.stallMs),
        driftTimeFraction: clean(run.phase.motion.elapsedMs ? run.phase.motion.driftMs / run.phase.motion.elapsedMs : 0) } : null,
      phasesComplete: phases.map(phase => phase.name), reportReady: state === 'complete' }),
    async prepare(options = {}) {
      if (state === 'running') throw Error('Stop the active run before prepare');
      const c = config(typeof options === 'string' ? { scene: options } : options), d = debug();
      if (!['hangar', 'city', 'desert', 'snow', 'canyon'].includes(c.scene)) throw Error('Unknown scene: ' + c.scene);
      if (c.hangarAnchor !== null && c.hangarAnchor !== 'skins') throw Error('Unknown hangarAnchor: ' + c.hangarAnchor);
      if (c.hangarAnchor && c.scene !== 'hangar') throw Error('hangarAnchor requires scene:hangar');
      state = 'preparing';
      anchorPreparation = null;
      installGpu(d);
      road = await import(new URL('./road-layout.js', location.href).href);
      canyon = await import(new URL('./canyon-track.js', location.href).href);
      d.input.reset(); d.returnToGarage(); if (!d.playing) d.setDriving(true);
      if (c.preloadVehicles) await Promise.all(d.garage.vehicles.map(vehicle => d.garage.vehicleVisuals.ensure(vehicle.id, { priority: true })));
      if (c.scene !== 'hangar') {
        const id = c.vehicleId || (c.scene === 'canyon' ? 'bmwreward' : 'pickup');
        await d.garage.vehicleVisuals.ensure(id, { priority: true });
        if (!d.gameplay.isOwned(id)) throw Error('Developer session does not permit selected vehicle: ' + id);
        d.gameplay.state.cooldown = 0;
        if (!d.enterVehicle(id)) throw Error('Vehicle entry failed: ' + id);
        if (c.scene === 'canyon') {
          const p = canyon.canyonPointAt(c.canyonStart);
          d.model.setPose({ x: p.x, y: p.height, z: p.z, heading: p.heading });
          const ground = d.canyon.pose();
          d.model.setPose({ ...ground.position, quaternion: ground.quaternion });
          if (!d.canyon.enter()) throw Error('Canyon entry failed');
          d.canyon.retry(); // Practice tour remains active; no score UI can terminate a perf sample.
          if (c.motion === 'drift') d.model.body.setLinvel({ x: -Math.sin(p.heading) * 24, y: 0, z: -Math.cos(p.heading) * 24 }, true);
        } else {
          // enterVehicle uses setPose, which marks the car airborne until the
          // next real physics contact. The menu intentionally rejects that state.
          await waitFor(() => d.driving && !d.model.state.airborne, 'vehicle ground contact before biome menu');
          d.setBiomeMenu(true);
          if (!d.biomeMenuOpen) throw Error('Biome menu did not open: ' + JSON.stringify({ driving: d.driving,
            airborne: d.model.state.airborne, playing: d.playing, pauseReasons: [...d.pauseState.reasons] }));
          if (d.travelToBiome(c.scene) !== true) throw Error('Biome travel failed: ' + c.scene);
          if (Number.isFinite(c.roadStart)) {
            const p = road.routePointAtProgress(c.roadStart);
            if (p.biome !== c.scene) throw Error('roadStart does not belong to requested biome');
            const [{ fitTruckToGround }, THREE] = await Promise.all([
              import(new URL('./city-driving.js', location.href).href),
              import(new URL('./vendor/three.module.js', location.href).href)
            ]);
            const vehicle = d.garage.vehicles.find(v => v.model === d.model);
            const fitted = fitTruckToGround(THREE, p.x, p.z, p.heading, null, vehicle?.visual?.metadata);
            d.model.setPose({ x: p.x, y: fitted.position.y, z: p.z, heading: p.heading, quaternion: fitted.quaternion });
          }
        }
        const { getVehiclePerformance } = await import(new URL('./vehicle-upgrades.js', location.href).href);
        d.gameplay.state.fuels[id] = getVehiclePerformance(id, d.gameplay.state.upgrades[id]).capacity;
        d.applyTruckPose(); d.followTruck(1, true);
      } else {
        if (c.hangarAnchor === 'skins') {
          const stands = d.garage.stands;
          if (!stands?.length) throw Error('No actual character stands for skins hangar anchor');
          const front = stands.filter(stand => stand.row === 'front');
          const row = front.length ? front : stands.filter(stand => (stand.y ?? 0) === Math.min(...stands.map(value => value.y ?? 0)));
          const rowHeading = Math.atan2(row.reduce((sum, stand) => sum + Math.sin(stand.heading || 0), 0),
            row.reduce((sum, stand) => sum + Math.cos(stand.heading || 0), 0));
          const x = row.reduce((sum, stand) => sum + stand.x, 0) / row.length - Math.sin(rowHeading) * 8;
          const z = row.reduce((sum, stand) => sum + stand.z, 0) / row.length - Math.cos(rowHeading) * 8;
          const heading = Math.atan2(Math.sin(rowHeading + Math.PI), Math.cos(rowHeading + Math.PI));
          Object.assign(d.gameplay.state.player, { x, z, heading });
          d.walkInput?.reset(); d.followCharacter(1, true);
          const { CHARACTER_CATALOG } = await import(new URL('./character-catalog.js', location.href).href);
          const expected = stands.filter(stand => Math.hypot(stand.x - x, stand.z - z) <= 34)
            .map(stand => CHARACTER_CATALOG[stand.index]?.id).filter(Boolean);
          anchorPreparation = { type: 'skins', clearanceMeters: 8, player: { x: clean(x), z: clean(z), heading: clean(heading) },
            expectedNearbyDisplayIds: expected, expectedNearbyCount: expected.length };
          // Normal application frames request nearby displays every 250 ms.
          // Observe attached real models; do not call their loader or queue.
          try {
            await waitFor(() => expected.every(id => d.characterDisplays.some(display => display.id === id)),
              'normal nearby character display loading', 20000);
          } catch (error) {
            const missing = expected.filter(id => !d.characterDisplays.some(display => display.id === id));
            throw Error(error.message + '; missing: ' + missing.join(', '));
          }
        }
        d.followCharacter(1, true);
      }
      prepared = c; state = 'prepared'; phases.length = 0;
      return { ...api.status(), config: c, environment: environment(d), snapshot: snapshot(d) };
    },
    start(options = {}) {
      const d = debug(), c = { ...prepared, ...options };
      if (state !== 'prepared' && state !== 'complete') throw Error('Call prepare first');
      for (const key of ['warmupMs', 'sampleMs']) if (!Number.isFinite(c[key]) || c[key] < 0 || c[key] > 300000) throw Error(key + ' must be between 0 and 300000');
      if (c.sampleMs < 1000) throw Error('sampleMs must be >=1000');
      phases.length = 0; state = 'running';
      run = { config: c, startedAt: performance.now(), environment: environment(d), frameId: 0,
        controller: { kickAt: null, nextKickAt: 1500, sequence: 0, direction: 1 },
        errorsStart: faults.length, resourceErrorsStart: resourceFaults.length };
      const begin = name => {
        resetProfiler(d); run.phase = { name, startedAt: performance.now(), frames: [], calls: [], triangles: [],
          gpu: { values: [], disjointDropped: 0, unresolvedAtEnd: 0, productTimerActiveSkipped: 0 },
          motion: { elapsedMs: 0, movingMs: 0, driftMs: 0, speedIntegral: 0, distanceMeters: 0,
            maxLinearSpeed: 0, maxAbsSlipAngle: 0, maxDriftIntensity: 0, peakSmokeCount: 0,
            stallMs: 0, maxStallMs: 0, x: d.model.state.x, z: d.model.state.z },
          poses: [], invalid: new Set(), previous: null, nextPoseAt: 0, start: snapshot(d) };
      };
      begin(c.warmupMs ? 'warmup' : 'stable');
      const tick = now => {
        if (state !== 'running') return;
        const phase = run.phase, elapsed = now - phase.startedAt;
        if (document.hidden || !d.appFocused || !document.hasFocus()) phase.invalid.add('page hidden/unfocused during sampling');
        if (d.pauseState.paused) phase.invalid.add('application paused during sampling');
        if (c.scene !== 'hangar' && !d.driving) phase.invalid.add('vehicle recovered/returned to hangar during sampling');
        if (c.scene !== 'hangar' && d.driving && !(d.gameplay.state.fuels[d.gameplay.state.selectedId] > 0))
          phase.invalid.add('vehicle ran out of fuel during sampling');
        if (c.scene === 'canyon' && !d.canyon.active) phase.invalid.add('vehicle left canyon during sampling');
        if (phase.previous !== null) {
          const interval = now - phase.previous, m = phase.motion, s = d.model.state;
          const speed = Math.abs(s.linearSpeed || 0), slip = Math.abs(s.slipAngle || 0), intensity = s.driftIntensity || 0;
          m.elapsedMs += interval; m.speedIntegral += speed * interval;
          m.distanceMeters += Math.hypot(s.x - m.x, s.z - m.z); m.x = s.x; m.z = s.z;
          if (speed >= 1) { m.movingMs += interval; m.stallMs = 0; } else m.stallMs += interval;
          if (speed > 3 && intensity > .08) m.driftMs += interval;
          m.maxStallMs = Math.max(m.maxStallMs, m.stallMs); m.maxLinearSpeed = Math.max(m.maxLinearSpeed, speed);
          m.maxAbsSlipAngle = Math.max(m.maxAbsSlipAngle, slip); m.maxDriftIntensity = Math.max(m.maxDriftIntensity, intensity);
          m.peakSmokeCount = Math.max(m.peakSmokeCount, d.canyon.effects.smokeCount);
          if (phase.frames.length < MAX_FRAME_SAMPLES) { phase.frames.push(interval); phase.calls.push(d.renderer.info.render.calls); phase.triangles.push(d.renderer.info.render.triangles); }
          else phase.invalid.add('raw frame capacity exceeded; comparison invalid');
        }
        phase.previous = now;
        if (elapsed >= phase.nextPoseAt) { phase.poses.push({ elapsedMs: clean(elapsed), ...pose(d), route: run.route ?? null }); phase.nextPoseAt += 1000; }
        control(d, now - run.startedAt, c);
        const duration = phase.name === 'warmup' ? c.warmupMs : c.sampleMs;
        if (elapsed >= duration) {
          phases.push(phaseReport(phase, d));
          if (phase.name === 'warmup') begin('stable');
          else { state = 'complete'; d.model.setInput({ active: false }); run.endedAt = performance.now(); return; }
        }
        run.frameId = requestAnimationFrame(tick);
      };
      run.frameId = requestAnimationFrame(tick); return api.status();
    },
    stop() { if (run) cancelAnimationFrame(run.frameId); window.__sceneDebug?.model?.setInput({ active: false }); state = 'stopped'; return api.status(); },
    report() {
      const d = debug();
      return { schema: 'obby-fps60-v1', timestamp: new Date().toISOString(), url: location.href, ...api.status(),
        config: run?.config ?? prepared, environment: run?.environment ?? environment(d), phases,
        errors: faults.slice(run?.errorsStart ?? 0), resourceErrors: resourceFaults.slice(run?.resourceErrorsStart ?? 0),
        failedResources: performance.getEntriesByType('resource').filter(entry => entry.responseStatus >= 400).map(entry => ({ url: entry.name, status: entry.responseStatus })),
        limitations: ['RAF intervals measure presentation cadence on this browser, not GPU duration.',
          'CPU render time measures command submission and may exclude GPU execution.',
          'No isolated shader compilation timing. Warmup retains startup stalls; stable phase resets aggregates.',
          'Use external browser console/network logs to include errors before harness installation.',
          'Pose controller drives the actual vehicle; invalid scene/recovery flags must be checked before comparison.',
          'Fleet is fully loaded when preloadVehicles=true; character displays follow normal nearby progressive loading.'] };
    }
  };
  window.__fps60 = api;
  return api.status();
}
