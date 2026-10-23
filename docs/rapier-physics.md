# Rapier vehicle physics

Current scope: one Rapier world for all eleven vehicles, main road and canyon. Preserve tire/handling/upgrades behavior; add true suspension, gravity, jumps, falls and 3D contacts. Target Android 2–4 GB at 30 FPS; real phone measurements are required before claiming that target achieved.

The temporary physics polygon and its west approach were removed on 2026-10-23. The city terrain, cliffs and residences now fill that former opening. Driving there follows normal delivery, fuel and garage-return rules.

## Implementation record

- Fixed simulation at 60 Hz with a shared accumulator, interpolated XYZ/quaternion, and one active chassis.
- Preserve pure legacy tire evaluators for comparison; the application uses the Rapier controller exclusively.
- Static road/ground collider chunks at 128 m; final clipped surfaces only, simplified walls and kinematic scripted hazards.
- Falls and overturned vehicles return to the garage.
- Keep static server plus Yandex/VK builds self contained. Rapier compatibility module is vendored from the pinned npm package with its license.

## Verification

The records below describe the original migration checks. They do not certify the final polygon-removal changes; further test runs are deferred until requested by the user.

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

### Browser exercise

The final Yandex bundle was also served locally and launched with a browser-injected SDK stub (the production SDK is supplied by the platform). It initialized Rapier, selected the pickup, advanced 120 physical steps to 10.58 m/s, and kept the car grounded. No external resources or runtime errors occurred during this bundle check. This does not verify live platform services.

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
