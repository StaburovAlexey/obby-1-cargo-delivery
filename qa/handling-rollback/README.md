# Handling rollback audit

Run with `node tests/handling-rollback.mjs` from the site directory.

All six groups passed against the restored runtime on 2026-10-13. The audit
does not modify production files. Exact numeric equality is required, without
tolerances, for all baseline solver comparisons.

## Verified

- `dist/driving-model.js` is byte-identical to Site34 commit
  `3f53dc9c685a5a514c02ea790887b86ba7061253`.
- Its SHA-256 is
  `652cc1898c935babc89ed641b085facaba58c514a508493942ca98fa2caa3b2b`.
- Seven archived baseline dependency files match their original Git contents.
- Every other one of the 68 preserved Site35 runtime files matches commit
  `c7c6e00266c2622f338c2b7df7bd72636146e92c`, including application code,
  controls, prices, saves, routes, terrain and assets. The turn-assist module
  is absent from the runtime and there are no remaining imports.
- The taller elevation profile retains its 0–66 m range.
- 8,400 cases cover every combination of 10 cars, five biomes, stock/maximum
  upgrades, D/R, seven steering values, throttle/coast and three slope
  callbacks. All 201,600 compared frames and 428,400 slope-callback positions
  match Site34 exactly.
- 1,600 force evaluations match exactly and preserve four bounded tire
  contact patches.
- 1,000 additional timing/reversal cases cover 30/60/120 Hz, jitter, clamped
  stalls, 1,000 gear changes and 2,000 pause/reset restarts. All 412,000
  compared frames match Site34 exactly.
- Twenty short actual hill runs cover stock/maximum pickup and ashhauler
  across forest, desert, snow and volcanic slopes, including forest reverse.
  They total 2,036.31 m of input-only travel with zero road/hazard contacts,
  grades up to 7.5%, and tire clearance from 0.012 to 0.012962 m. There are
  no pose or speed writes after each segment's initial spawn.
- Actual application code retains pointer steering through 135 degrees,
  throttle release/coasting, displacement-based fuel and camera tracking,
  blur/visibility resets, all five biome previews, vehicle ownership,
  upgrades and money in the saved career.
- No runtime files changed while the final audit ran.

## Artifacts

- `report.json`: full checks, source hashes, timings and limitations.
- `slope-runs.json`: per-segment actual driving metrics.
- `run.log`: final successful console output.

## Limits

The tests use Node, actual Three.js mathematics/meshes and application logic,
with a mock DOM and renderer. They do not establish browser, WebGL, GPU,
Android or physical multitouch behavior. No browser was launched.

The short segment spawns isolate restored handling and terrain support;
they are not full economy/fuel-depletion journeys and do not claim the
stock pickup can drive all combined segments on one tank.

The initial audit harness encountered Git's default 1 MiB subprocess output
limit on the Three.js vendor file. Only the harness buffer was increased;
the recorded report and log are from the subsequent complete successful run.
