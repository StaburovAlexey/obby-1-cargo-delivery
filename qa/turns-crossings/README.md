# Eight-second crossings and varied turns

Current runtime has 30 sparse encounters: 20 movers (four in each biome) and 10 static hazards. Each mover crosses from −10.6 m to +10.6 m in eight active simulation seconds, dwells 1.4 seconds, returns in eight seconds, and dwells again. Full cycle: 18.8 seconds. The opposite side remains physically passable; there is no permanently safe lane outside the entire swept envelope. Four volcanic rocks remain grounded.

There are 26 smooth heading changes rather than six. Seven affect the city, with its first bend beginning at 80 m rather than 800 m. The route remains 15,868.842 m with unchanged checkpoint stations, 25 bridge identities, prices, fuel data and vehicle handling.

## Evidence

- `tests/eight-second-movers.mjs`: exact timing, 8 seeds, pause/reset/capped deltas, 20,000 live-pose samples; maximum instantaneous transverse speed is about 3.975 m/s.
- `tests/review-eight-second-crossings.mjs`: independent route, placement, width, timing, render/collider, resource and app checks. Minimum opposite-side physical opening is 13.1 m. All ten actual model envelopes fit with yaw tolerance. Terrain-only sightline clearance is at least 1.266 m; this is not a rendered scenery-occlusion test.
- `tests/varied-route-turns.mjs` and `qa/varied-turns/`: C2 joins, projections, bridge approaches and starter fuel checks.
- Production hazard scene remains eight draw calls; 1,944 triangles, compared with 1,824 previously. CPU geometry counters do not establish GPU frame rate.
- `city-layout.png`: inspected offline route plot, not a rendered game screenshot. Generated QA images are excluded from the user source ZIP.

## Input-only route timing

The same production physics, refills, collision, bridge support and reward modules run under an ordinary steering/pedal test driver. It reads the shared hazard clock and forecasts which side will be open; it never changes obstacle clock, pose, fuel, car velocity or reward state. Vehicles/upgrades are test setup, not earned purchases.

- Conservative eight-metre-per-second obstacle approach: 838.4 seconds (13:58.4).
- Reference fourteen-metre-per-second obstacle approach: 716.6 seconds (11:56.6), all 25 bridges and 15 preceding refills, no collision or fall, about 80.75 m of final fuel reserve. The alternate fork route passed in 710.55 seconds at a 15 m/s obstacle approach, with 71.35 m reserve. Both use unchanged car physics.

These are clean automated reference rides, not a promise for every player. A slower/cautious ride takes longer. No runtime speed or steering assistance was introduced to achieve the reference time.

UI regressions cover the retired savings launcher and retained saved goal, exact purchase labels and column layout, smooth weather, and the centered delivery-receipt modal. All tests are offline CPU or mock-DOM/application checks. No browser, WebGL, Android or human-playtest validation is claimed.

Frozen release journey evidence is in `release/`: primary and alternate successful deliveries, stock starter CP2 success / CP3 fuel failure, and last-car tank level 9 fuel failure. All reports have empty `changedRuntimeFiles` arrays. Tank level 10 remains physically meaningful without introducing an upgrade-level gate.

`npm run test:turns-crossings` passed through the new receipt regression. Wheel resizing is separately checked with `tests/double-steering-wheel.mjs`; no steering physics or angular sensitivity changes are made.

The wheel regression passed 48 viewport/safe-area cases and production angular input at 224 / 264 / 370 px. Standard portrait phones use 264 px; fit caps are documented explicitly: 320×568 → 248 px, 844×390 → 202 px, and 568×320 → 132 px before safe insets. This preserves clear HUD/fuel/pedal targets. Artwork rotates inside a stationary same-sized circular touch target. The walking stick and input JavaScript are unchanged.

Final focused app checks also passed wheel + gas + camera simultaneous input, reverse, resize/menu/blur/fall/garage resets, and the receipt modal after wheel layout changes.
