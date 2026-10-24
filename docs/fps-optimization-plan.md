# Frame-time optimization, 2026-10-24

Approved scope: improve sustained 60 FPS using measured CPU/GPU evidence, tests
and real browser checks. Preserve controls, fixed-step physics, drift forces,
all hazards/pits/bridges and the existing asset optimization. No commit/push or
publishing requested.

The baseline is the current dirty `perf-dev-zones` checkout, not HEAD: prior GLB,
media and procedural optimizations are already present. Its runtime is copied to
`output/fps-60/baseline/dist` before this pass; the patch and baseline tests are
preserved beside it. Comparison artifacts live under `output/fps-60/`.

## Execution and evidence

1. Record repeatable browser baselines: loaded hangar, ordinary route with
   weather/hazards, canyon/drift; desktop and mobile viewport/DPR emulation.
   Capture errors, frame intervals/p95/p99, calls/triangles and CPU stages.
2. Add optional nonblocking GPU timing and a stable adaptive render-quality
   controller. Mobile detection must not depend on portrait width. Preserve
   readable DOM UI, avoid quality oscillation, retain a fixed-quality diagnostic
   mode for matched comparisons.
3. Budget shadow casters/resolution and transparent weather/smoke; progressively
   prepare newly loaded GPU resources to avoid first-appearance stalls.
4. Remove repeated DOM layout reads and unchanged/hidden HUD writes. Keep
   interaction availability immediate and visible label movement smooth.
5. Index nearby hazard patches and avoid redundant parked/gate collider updates.
   Preserve exact collision query results, patch entry/fuel semantics and force
   calculations. Add focused regression and workload measurements.
6. Add distance-based display detail/shadow/material budgets where measurement
   justifies them, keeping the selected/near vehicle complete and switches safe.
7. Run focused tests, representative baseline comparisons for existing failures,
   both platform builds and browser checks of models/menus/gameplay. Repeat the
   same performance scenarios without concurrent benchmark loads.
8. Publish a report with before/after data, exact environment, regressions and
   remaining device limitations. Emulated mobile results are not Android GPU/FPS
   evidence; CPU command submission is not GPU duration.

## Ledger

- Initial state: HEAD `7d7767a`, branch `perf-dev-zones`, prior optimization
  changes intentionally uncommitted. Work continues in the active checkout.
- Earlier instruction not to run tests is superseded by explicit authorization
  to measure with tests and in the browser.
- Implemented nonblocking GPU queries, adaptive DPR/shadow/weather/display
  budgets, distance-based safe material/shadow proxies, progressive GPU resource
  preparation, unchanged-DOM caching and live-index effect drawing.
- Static hazard queries use exact indexed candidates. All 88 moving hazards
  still update every fixed tick; their height/gradient sampler now reads the
  same indexed triangles without solving an unused route projection. The
  original full `queryRoadSurface` contract remains unchanged.
- Focused regression run: 85/85 passed, including exact plane/mover equivalence,
  geometry/query/sync, display restoration, effects, resource cancellation,
  BFCache, adaptive quality and profiler checks. GPU lifecycle review then added
  two regressions; the final GPU file passes 7/7 including both additions.
- Review found and repaired BFCache viewport cache disposal and stale GPU query
  handles after context loss. Final focused follow-up passes 20/20, camera
  cadence passes 4/4, and both final platform builds pass. Earlier broad tests
  retain pre-existing asset/fixture failures documented separately.
- Hardware browser captures cover desktop and emulated mobile, all 15 cars,
  17 skins, city, snow, desert and genuine canyon drift. A 60-second desert
  drive is valid. The final Yandex build loads all models and drives/brakes
  without resource, console or WebGL errors under a local SDK adapter.
- Matched emulated-mobile results: desert 17.735 -> 50.950 FPS, drift
  25.615 -> 55.403 FPS, skins 46.801 -> 59.068 FPS. Stable 60 FPS throughout
  the game is not achieved; Android hardware remains unmeasured. The full
  report records p95/p99, quality tradeoffs and remaining CPU costs.
- A further kinematic target cache was tested and rejected: strict physical
  equivalence passed after an initialization repair, but all three measured
  rounds were slower. Its production changes were reverted; evidence remains
  under QA. Temporary measurement servers were stopped; the user dev server
  was left running. No commit, push, publication or release ZIP update.
