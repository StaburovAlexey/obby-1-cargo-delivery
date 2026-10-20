# Independent controlled-skid and route verification

Baseline: main `3781018ee597b4ec16e7499163869c6ba9236440`.
The concise machine-readable result is `review.json`. Generated detailed matrices and console logs are intentionally ignored by Git.

## Reproduce

From the repository root, prepare the unmodified baseline once:

```sh
git worktree add ../skid-baseline 3781018ee597b4ec16e7499163869c6ba9236440
node qa/controlled-skid-independent/dynamics-matrix.mjs . /tmp/skid-dynamics.json ../skid-baseline
node qa/controlled-skid-independent/bridge-obstacle-check.mjs . /tmp/skid-bridges.json
node qa/controlled-skid-independent/route-geometry-check.mjs . /tmp/skid-geometry.json ../skid-baseline
node qa/controlled-skid-independent/app-frame-check.mjs . /tmp/skid-app.json
```

All four commands write their detailed result to the supplied output filename and exit nonzero when an asserted gate fails. The dynamics and geometry scripts accept the baseline checkout as their fourth command-line argument. Their development default `/tmp/controlled-skid-baseline` is not distributed; use the explicit worktree argument above.

Optional app subsets: `APP_CASES=bridge`, `APP_CASES=technical`, or `APP_CASES=obstacle`. The complete app run takes several minutes. It uses the repository's renderer-free app fixture and local vehicle assets, without network calls or external publication.

## Coverage

- Actual solver: all ten regular vehicles, levels 0/5/10, 15/30/60 Hz; own and next biome, abrupt full steering, repeated steering reversals, release and recovery. Identical timed input phases have exactly equal final state across these frame partitions.
- Upgrades: identical entry-speed comparison; separate grip recovery and steering-rack response; all upgrades including speed at each vehicle's own maximum. Speed upgrades do not erase the measured control improvement.
- Slopes: 360 cases across ±7.5% and ±8.3%, levels and frame partitions. The real route already had 8.25016% fork grades before this change; this audit checks against that actual baseline rather than the older 7.5% documentation.
- Protected behavior: 60 low-speed forward/reverse trajectories and 45 BMW forward/reverse/handbrake trajectories exactly match baseline. All 20 unsuitable-biome stock trajectories and their surface/economy penalties exactly match baseline.
- Physical validity: 2,000 passive-force samples must not create energy.
- Real bridge geometry: 450 isolated 3 m/s crossings, covering all five bridges in each car's own biome, all levels and frame partitions, using actual imported GLB wheel metadata.
- Synthetic obstacle: 90 cautious lane changes all clear a conservative 3.5 m obstacle within a 30 m road. Another 90 fast trials are diagnostic: stock desertscout contacts the obstacle at each frame rate; slowing down or upgrading avoids those contacts. These aggressive cases are deliberately not a safety promise.
- Actual application frames: 90 bridge passages with real GLB contact metadata; 72 passages through the two sharper city bends at progress 1005–1275, covering pickup, citycourier, rover and ashhauler at levels 0/5/10 and 15/30/60 Hz, with careful and brisk input; 27 center-to-side-and-back evasions around an actual moving city barrier. The app's fuel, scenery/road/hazard contacts and bridge-fall logic remain active.
- Route geometry: 15,850 main/alternate route samples, 861 level service-shelf samples, 25 protected bridge approaches, and hazard placement/sightline checks. The approved route contains 28 moving hazards, retaining every hazard type.

## Regression findings

The independent check found a real scenery regression: a changed city-road transform removed one of the two fitted canyon-frontage houses. It was fixed in the scene generator. The original frontage test then passed unchanged, and the complete canyon suite passed 113/113.

The ordinary-vehicle trajectory assertion in `tests/canyon-driving.mjs` now explicitly uses `controlled-skid-vehicles.json`, as appropriate for the intentional new regular-car handling. BMW assertions were retained.

`npm run test:handling-grip` passes. `npm test` still stops at the same five `physics-app-integration.mjs` failures reproduced in an untouched baseline, with 6/11 checks passing in both. No failures were removed or disabled:

1. Held wheel plus second-pointer reverse interlock
2. Blur/resize/hidden-tab momentum resets
3. Overview/garage/re-entry state resets
4. Empty-fuel sideways/angular-momentum return
5. Ten-vehicle fuel accounting fixture

The unrelated `progression-hud.mjs` purchase-label failure was also reproduced unchanged in baseline: actual `Купить 1000`, expected `Купить Класс 2 · 500`.

## Important limits

Solver frame partition equivalence is not measured rendering FPS. The app retains its existing 50 ms frame budget: at 15 rendered frames per second it advances 0.75 simulated seconds per real second. The app-frame report records both wall time and the capped simulation budget. The 30/60 Hz app runs have no such budget reduction.

The app tests use a mock DOM/WebGL renderer and a deterministic test driver, including public analog speed-demand inputs for repeatability. They prove isolated physical traversability and application integration, not human steering skill, touch feel, full-game fuel progression, browser rendering, Android performance or GPU frame rate. No positions, heading, velocity or fuel are injected after each scenario's initial spawn. Browser/device review is separate.
