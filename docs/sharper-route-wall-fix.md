# Sharper route and rear-wall correction

The rear faces of overlapping biome strata previously shared the same plane. Both continuous wall tiers and decorative crests now scale about the wall-depth center. Their outer faces are inset as well as their inner faces; the full-width base and collision envelope are unchanged. This fixes the coincident geometry without polygon offset. The Float 32 mesh regression covers forest, desert, snow and volcanic walls and fails on the previous geometry.

The route still measures 15,868.841887 m. Checkpoints, refills, biome boundaries, bridge positions, vehicle ranges, prices and upgrade effects are unchanged. There are 28 smooth bends, including nine compact bends, with tight corners in every biome. City minimum radii are 35.14 and 40.74 m. All thirty moving hazards are restored; the extra two fit safe straight volcanic gaps. The route design document records their distribution and safety margins.

## Actual application driving checks

Run from the repository root:

    APP_CASES=technical node qa/sharper-route/app-turns.mjs . qa/sharper-route/app-turns-report.json

The test uses the real app frame loop, physics, fuel, scenery contacts and actual road geometry with mocked DOM/WebGL. It drives six representative cars at stock and grip/handling 10, using cautious 6 m/s and each car's stock maximum speed. Fuel upgrade is also 10 in the upgraded cases; speed stays 0 so the comparisons have identical speed targets. After initial scenario placement the driver uses ordinary inputs, never position/velocity/fuel corrections.

Peak body slip at the brisk target, stock versus grip/handling 10:

- Pickup: 4.25° versus 1.25°
- City courier: 5.10° versus 2.10°
- Rover: 4.39° versus 1.86°
- Desert scout:16.20° versus 3.53°
- Snow runner:11.47° versus 5.27°
- Ash hauler:6.99° versus 3.77°

All 24 cases complete their corner sections without collision. The checks require every brisk stock case to exceed 4° slip, upgrades to reduce it by at least 20%, and upgraded lateral deviation to be smaller. These are repeatable driving checks, not a guarantee for every input or human touch behavior. Drivers can still avoid sliding by slowing down.

## Reachability

The independent stock-pickup journey to cargo 2 still takes 46.2 simulated seconds, with one refill and 12.2% minimum fuel, exactly matching the previous route. The theoretical fuel envelopes of every car remain unchanged. Reports are under qa/route-reachability-audit.

Full-route human travel time, the historical twelve-minute target, mobile frame rate and browser appearance are not established by these CPU tests. The existing full-route journey harness uses an obsolete finish target and its automated controller has collisions; that does not prove the route impossible. No gameplay time cap, purchase gate or forced skid was added.

## Additional verification

- Rear-wall regression:2/2
- Complete canyon suite:113/113
- Controlled-skid physics: ten ordinary vehicles, levels 0/5/10,90 frame partitions,900 force cases,270 precision cases,20 unsuitable-biome recoveries
- Route geometry:32 obstacle seeds, full-body recovery, all 25 bridge approaches, house and road/terrain overlap checks
- All-moving obstacle motion, visuals and app integration

The existing aggregate test's five unrelated physics-app-integration failures and old economy assertions remain documented in the preceding controlled-skid audit. They were not removed or weakened here.
