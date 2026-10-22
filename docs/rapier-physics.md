# Rapier vehicle migration and physics test track

Approved scope: one Rapier world for all eleven vehicles, main road, canyon and test track. Preserve tire/handling/upgrades behavior; add true suspension, gravity, jumps, falls and 3D contacts. Target Android 2–4 GB at 30 FPS; real phone measurements are required before claiming that target achieved.

## Implementation record

- Fixed simulation at 60 Hz with a shared accumulator, interpolated XYZ/quaternion, and one active chassis.
- Preserve pure legacy tire evaluators for comparison; the application uses the Rapier controller exclusively.
- Static road/ground collider chunks at 128 m; final clipped surfaces only, simplified walls and kinematic scripted hazards.
- West branch mirrors the canyon approach for 250 m. Test pad x [-365,-125], z [-310,-135], 240×175 m.
- Exercises: drift pad, 1.5 m and 3 m ramps across 3 m and 8 m pits, slalom/curbs and a 5 m wide raised bridge.
- Test entry cancels delivery unpaid. No fuel consumption, rewards, route proof or leaderboard in the test area. Restore to exercise checkpoint; normal falls return to garage.
- Keep static server plus Yandex/VK builds self contained. Rapier compatibility module is vendored from the pinned npm package with its license.

## Verification

Baseline captured in `/tmp/obby-physics-baseline.log`: planar vehicle dynamics, controlled skid and handling checks pass; physics-app-integration already fails five historical assertions. Baseline handling test writes its generated metrics; incidental report changes are not part of this feature.

### Completed checks

- `npm run test:rapier`: 49 passed, zero failed; the optional 165-case matrix is skipped in the normal fast run and was run successfully separately.
- `RAPIER_HANDLING_MATRIX=1 node --test tests/rapier-vehicle.mjs`: all 165 vehicle/biome/upgrade combinations remain finite, accelerate/brake/reverse, and stay supported/upright during the corner scenario.
- Six quantitative city comparisons use pickup, ashhauler and BMW at stock and maximum upgrades. Maximum deviation: turn radius 4.30%, rear tire slip 8.52%, braking distance 2.34%. BMW radius differs 1.09–1.51%, rear slip 0.88–1.41%; handbrake rear slip differs less than 0.18%.
- `npm run test:camera`: 9 passed. Maximum variable-cadence jitter is 0.03567 px (limit 0.05 px).
- `node tests/physics-app-integration.mjs`: 11/11 passed, including actual wall contact telemetry and all eleven vehicles.
- Final canyon/terrain geometry and scoring regression: 20/20 passed.
- Both `npm run build:all` targets complete successfully, including the Rapier license. Neither build requires a physics CDN.
- Independent review and regressions cover clipped cliff indices, parked car colliders, the shared canyon clock, disposed-world callbacks, real triangle-wall collision telemetry, and render batching.
- Test track rendering uses 11 draw calls and 2,185 triangles. All 35 collider descriptors retain the same geometry; pits remain open.

### Browser exercise

The static game loads with real vehicle assets. A pickup crossed the small 3 m gap and landed; fuel remained 100 throughout the free test session. It drove the west connector to the pad and reversed to the main road without contact or loss of wheel support (return: 2,278 fixed steps, all sampled wheels supported). BMW crossed the large 8 m gap at about 15 m/s, reached root y 3.419 m, and settled upright on all four wheels after braking. Exercise runs use the actual scene and world, with a scripted driver; they are not phone performance measurements.

The final Yandex bundle was also served locally and launched with a browser-injected SDK stub (the production SDK is supplied by the platform). It initialized Rapier, selected the pickup, advanced 120 physical steps to 10.58 m/s, and kept the car grounded. No external resources or runtime errors occurred during this bundle check. This does not verify live platform services.

Screenshot: `output/rapier-test-track-overview.png` (local ignored QA artifact).

### Calibration and limits

BMW retains the existing nonlinear arcade tire evaluator. Its axle force and yaw moment are allocated to real spring contacts; the arcade budget fades below 90% of static axle support. Missing or unloaded contacts cannot apply tire forces, and airborne throttle/steering does not create traction. This preserves the established drift while gravity, suspension and chassis contacts remain three dimensional.

The full historical `npm test` suite is not a clean release gate: baseline physics integration already had five failures, and some older route assertions target superseded map lengths. The migrated physics integration and focused physical/geometry suites are recorded separately. No Android device measurement has been performed; the 30 FPS target for 2–4 GB devices remains unverified.

### Reproduction

```sh
npm run test:rapier
RAPIER_HANDLING_MATRIX=1 node --test tests/rapier-vehicle.mjs
node tests/physics-app-integration.mjs
npm run test:camera
npm run build:all
```

The comparison tests write detailed reports to `/tmp/obby-rapier-handling-comparison.json` (matrix) and `/tmp/obby-rapier-handling-representative.json` (normal run).
