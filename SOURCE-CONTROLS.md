# Tow controls and original force dynamics

The input source is the user-owned repository StaburovAlexey/worker-play-ads, branch `tow-confiscator`, pinned commit `6c52e417cd499c7b9d9c6f450961c8ca0956063c`.

Still retained from that source:

- Angular steering-wheel gesture with ±135° limit, center guard and correct angle wrap
- Hold the wheel to accelerate; release it to coast
- D/R selector, including a second pointer while steering is held
- Nonlinear steering deadzone/response and safe input lifecycle reset
- The two original UI images, retained with their provenance

Images:

- `vehicle-steering.png`, Git blob `a6ea92c1293a711242dce7f011e9bebac206fae7`
- `vehicle-gear-panel-cropped.webp`, Git blob `dbdf7bc46ccf8b4c903117caf045924a12c61ea1`

Reuse was requested by the repository owner. No open licence is claimed for those two images. The Three.js licence applies to Three.js itself.

## Physics replacement

From the force-dynamics version onward, vehicle motion no longer uses the Tow bicycle kinematics, exact acceleration/coasting times or its geometric yaw formula. An independently written four-wheel planar rigid body now handles forces, torque, tire slip, braking and contact impulses. The UI remains familiar, but handling intentionally changes. See `PHYSICS.md` for parameters, calibration and limitations.

`TOW_DRIVING` remains an exported compatibility object for view/input fields and historical tests. Legacy acceleration/inertia/wheelbase fields are not a promise that the new force solver uses those values. The existing `moveWithContacts` utility is retained for compatibility/geometry callers; current vehicle integration does not call it.

The vehicle still faces −Z, uses the procedural 0.68 m wheel radius and the unchanged four-wheel ground fit. The current road is one sequential five-biome route. All tire/road heights, corrected seated character poses, free camera gestures, economy and UI styling are preserved.

## Baseline and verification

The exact v25 driving model and app are saved in `tests/baseline/`. The historical source oracle remains in `tests/fixtures/tow-driving-reference.mjs` and is exercised separately by `tests/tow-baseline.mjs`. Current input/grounding integration and current physics have separate regression suites.

These are renderer-free checks. Browser/GPU rendering and physical Android multi-touch were not tested in this build environment.
