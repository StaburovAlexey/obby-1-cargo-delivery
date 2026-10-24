# Matched 60 FPS investigation

The baseline is the saved dirty checkout under `output/fps-60/baseline`, not Git
HEAD. Use the same browser, viewport, DPR, assets, diagnostic globals, scenario,
motion, warmup and duration before/after. Run one scene at a time without builds,
tests, recording, another active WebGL page or GPU benchmark in parallel.

## Hardware Chrome through Chrome DevTools MCP

1. Set emulation to desktop **1280×720, DPR 1**, then separately landscape phone
   **844×390, DPR 2, mobile, touch**. The actual measured dimensions and renderer
   DPR are in every report; reject mismatched profiles.
2. Navigate to the baseline or final static server with `?dev=1&perf=1`. Pass the
   exact content of `qa/fps-60/init.js` as `navigate_page.initScript`. This enables
   developer diagnostics and an isolated practice session identically, without
   editing either served app. Do not add `render=baseline`: that flag disables
   earlier spatial work and does not describe this optimization's baseline.
3. Wait for `window.__sceneDebug.startup.ready && window.__sceneDebug.characterReady`.
4. Load `qa/fps-60/install.js` with `evaluate_script.sourcePath`, `format:function`.
5. Set `window.__fps60Config` if desired, then call:

   ```js
   await window.__fps60.prepare({
     scene: 'hangar', label: 'baseline', profile: 'desktop-1280x720-dpr1',
     motion: 'drive', gpu: true, preloadVehicles: true
   });
   window.__fps60.start({ warmupMs: 6000, sampleMs: 12000 });
   ```

6. `window.__fps60.status()` returns immediately. Once `reportReady:true`, save
   `window.__fps60.report()` through `evaluate_script.filePath`. Take a screenshot
   after sampling. Warmup and stable samples are separate. For longer runs use
   15000/45000 ms with the same settings on both versions; start returns at once
   so the browser tool does not need to hold a long evaluation open.
7. Repeat for `city`, `desert`, `snow`, `canyon`. City uses normal clear weather;
   desert and snow use actual biome weather. Canyon selects the BMW and enters
   unranked touring mode. Set `motion:'drift'` for its steering/handbrake sequence;
   `motion:'stationary'` gives a repeatable stationary rendering view.

The harness loads every garage vehicle when `preloadVehicles:true`. Character
stands still use normal nearby progressive loading; reports include start/end
asset counts so changed loading workload is visible. For the fully loaded skin
rows, prepare `{scene:'hangar',hangarAnchor:'skins',preloadVehicles:true}`. It derives
the front row's centre and facing from the actual stand layout, places the player
8 m in front looking at the rows, and waits up to 20 s for every stand within the
application's normal 34 m loading radius to attach. It never directly requests
or constructs a skin display. On the present layout this is player
`(-42.5, 76.45)`, heading π, with 17 expected displays and all 15 loaded cars.
Snapshots record the player, anchor, expected IDs/count and actual nearby loaded
count. The default hangar scenario keeps its original spawn and loading behavior.
The route controller sets
input on the actual Rapier vehicle and steers toward a 22 m lookahead. Teleports
only prepare the scene through developer travel or `model.setPose`; no state is
teleported during the measured drive. Check `invalid`, pose samples, weather and
drift intensity before accepting a comparison. A canyon run that never produces
slip is not evidence for smoke-heavy drifting. A recovered car invalidates that
scenario. Each phase now records distance, time above 1 m/s, continuous stalls,
time actually drifting, peak smoke, and full input/contact telemetry. Drive/drift
is invalid when movement occupies less than half the sample, displacement is
below 0.5 m per sampled second, or a stall lasts over 3 seconds. Canyon drift also
requires speed above 3 m/s and drift intensity above 0.08 for at least 5% of time.
The drift controller uses `canyonSpeedDemand:0.55`. At most every 4.5 seconds,
once speed is above 10 m/s and the grounded car is within 2.5 m of the lane centre
with heading error below 0.25 rad, it initiates a real turn with steering 0.8 and
handbrake 1 for up to 400 ms, countersteers for 350 ms, then resumes lane following.
Initiation ends early once actual slip exceeds 0.23 rad or heading error exceeds
0.4 rad. Lane feedback damps actual yaw in excess of the yaw required by the
local road curve, through ordinary steering input; it never changes body forces.
It aborts the initiation outside a 4.5 m margin or 0.7 rad heading error. These
parameters are configurable and saved in the report; each one-second route
sample includes the actual maneuver, steering, handbrake and desired/actual yaw. Browser
validation is still required: setting a stronger input is not evidence of drift.
The harness does not assert an invented minimum FPS.

The 400 ms controller was validated on hardware Chrome/Iris Xe with the phone
viewport: `output/fps-60/optimized-valid-phone-canyon.json` records a valid 20 s
stable phase, 425 m of actual travel, moving fraction 1, drift fraction 0.073,
maximum drift intensity 0.337, smoke peak 10 and 178 skids. Both warmup/stable
invalid lists are empty. This validates that workload on that run; further runs
must still pass their own validity checks, and phone viewport emulation remains
distinct from Android hardware evidence.

Preparation fills the selected vehicle to its **actual upgrade-aware capacity**,
not a universal 100 units. Reports retain start/end fuel, and empty fuel explicitly
invalidates a drive sample. Fuel is never replenished during measured phases.
The stock pickup has 100 units and desert fuel factor 3, giving only about 96.7 m
on that surface: use a 6 s warmup plus 20 s sample at `speedDemand:0.38`, or choose
a suitable vehicle through `vehicleId:'desertscout'` for longer drives. Match the
vehicle and all controls on both versions. The previous BMW setup of 100 units
was below its actual capacity of 1800 and could hit the fuel-stop path mid-run.

Optional `roadStart` moves the car only during preparation and fits its wheels
to the real road surface. For a longer desert drive, `roadStart:7425` starts in
the protected open sweep: hazard and pit exclusions extend from 7340 to 7830;
the next fork begins at 7820 and the final desert bridge is at 7140. A stock
`desertscout` at `speedDemand:0.30` stays within this segment for a 6 s warmup and
30 s sample (nominal distance below 227 m). This is a clear-road weather workload,
not obstacle traversal. It must be rerun identically on baseline and optimized
versions. The default preview start at 5940 is also protected through 6180;
the pickup's longer previous run could recover from **empty fuel** before any pit.

External GPU timing wraps `renderer.render` every fourth render and holds at most
four asynchronous WebGL timer queries. It checks `CURRENT_QUERY` and skips when
the application already has a GPU query; `gpu:false` disables it. Disjoint and
unresolved samples are reported and discarded, and no pixel readback or blocking
query is used. Shader compilation is not isolated: cold/warm frame intervals and
program counts are retained. Product profiler CPU stages and GPU reports are
copied separately, with missing values represented as unavailable.

Capture console and failed network requests from browser tools as well. The
portable harness captures page/resource errors only from installation onward;
early loader errors remain in the browser's console/network inventory. The
Playwright adapter captures those events from navigation.

## Playwright adapter

`qa/fps-60/browser.mjs` is a `browser_run_code_unsafe(filename)` function. On its
current page set `window.__fps60Config` with `baseUrl`, `scene`, `label`, `profile`
(`desktop` or `phone`), optional `outputDir`, `warmupMs`, `sampleMs`, `gpu`, and
`motion`; then run the file. It blanks the supplied page and creates one measured
context with exact viewport/DPR/mobile/touch settings, then closes that context.
It returns the report and optionally saves JSON plus a screenshot. This adapter
does not choose a physical GPU: read `environment.webgl.renderer` on each run.
SwiftShader results are functional/CPU observations, not hardware FPS proof.

For a fixed quality diagnostic use the same requested `?quality=high` on both
servers (the saved baseline ignores the new quality flag). An `?quality=auto`
run measures the new adaptive policy and can reduce render DPR, shadows and
effects. Keep these two comparisons labeled separately. Final reports capture
the quality profile/stats and actual renderer DPR at each phase's start/end;
baseline quality metadata is `null` because that controller does not exist there.

## Focused baseline test inventory

Run while browser measurements are idle:

```sh
node qa/fps-60/run-tests.mjs --snapshot=output/fps-60/baseline --output=output/fps-60/baseline/tests-evidence
```

Suites run sequentially: rendering, startup, world labels, camera, Rapier, then
physics app integration. Use `--suites=rendering,startup` for a subset. Each suite
has its own unmodified stdout/stderr log and exit status; failures do not prevent
the remaining inventory. `summary.json` records CPU/OS/Node, package hash, exact
commands, timings and exit codes. Compare the same command on the final tree;
existing snapshot failures must stay distinct from introduced regressions.

## Report fields to compare

For each scene/profile/motion: browser/GPU + hardware or software classification;
actual viewport/DPR; warmup versus stable aggregate RAF FPS/p50/p95/p99/max;
fractions over frame budgets; render calls/triangles mean/p95/max; CPU stages;
GPU duration with availability/disjoint/query counts; assets/programs; errors and
failed resources; scenario validity and start/end/one-second poses. Save exact
configuration and screenshot alongside every JSON report. For repeated samples
report each run and variability before claiming a sustained result.

Desktop Iris Xe evidence applies to that desktop. Phone viewport emulation does
not reproduce Android CPU, GPU, memory pressure, thermal throttling or touch
latency. A real target phone run remains necessary for Android 60 FPS claims.

The final `clean-timer` runs skip the external GPU wrapper entirely when the
application already owns a GPU timer, and skip disjoint polling with no pending
queries. Earlier JSONs retain the extra wrapper's overhead and remain labeled
separately; none were silently replaced. Application GPU metrics are used for
optimized runs and external queries for the saved baseline.
