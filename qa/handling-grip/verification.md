# Verification status

Base source: `f788f9e6336ffedd8cc0170df3b84bc090fab327` (`codex/low-end-rendering`). Every runtime/asset blob outside the seven explicitly changed modules matches that source exactly. Character-texture source inputs were also restored and hash-checked against that source before building.

Passed on the rebalance:

- `npm run test:handling-grip`: 55 car/biome profiles, 220 long stock/handling/grip/max comparisons, 1,815 individual-level cases; 21 planar force/collision/frame-partition checks; 20 app-loop bridge approaches; 6 app-loop steering pulses.
- `npm run test:handling-grip-independent`: independent correction, turn/slalom, energy and frame-partition checks; durable reports alongside the harnesses; nine upgraded BMW scored journeys also pass the unchanged server verifier.
- `npm run test:canyon`: 115/115 tests, including scoring/leaderboard/server tests and three stock BMW scored journey frame rates.
- `npm run test:rendering`: latest low-end rendering/profiler regressions.
- `npm run test:platforms`: 59/59 platform, save/cloud and payment/UI tests.
- `node tests/reward-driving.mjs` and `node tests/localization.mjs`.
- `npm run build:all`: Yandex and VK builds.

Known inherited failures, reproduced on an untouched copy of the exact upstream source:

- `npm test` stops in `tests/physics-app-integration.mjs` on obsolete app-input/safety fixture assumptions (held-pointer gear-change, blur/resize reset, overview pause, empty-fuel UI text, old ten-car count). The rebalance does not silently skip this aggregate or label it green.
- Separate legacy `balance-dynamics`, `bridge-independent`, `driving`, `future-biome-drift` and `vehicle-upgrades` tests also fail on that baseline (old ranges, route geometry, input setup, or three-level assumptions). These unrelated tests were not rewritten merely to claim a clean aggregate.
- Exact pre-canyon ordinary-car golden trajectories necessarily changed. The two relevant regression tests now reference a new explicitly named handling/grip fixture; the historical fixture remains intact. The physical steering test now expects the approved scale/rack timing and the slightly higher bounded low-speed yaw rate, while all energy, collision and frame-invariance assertions remain.

No browser/GPU playtest was completed: private-site sign-in blocks the browser session. Actual-app tests run the production app frame loop with mocked DOM/rendering/asset loading. Their fixtures place the vehicle at the test start; they do not establish a full unaided career completion or touch-device feel.
