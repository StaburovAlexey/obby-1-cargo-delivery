# City36 targeted handling rollback

Only `dist/driving-model.js` is restored from City34, and the City35 `dist/turn-assist.js` helper is removed from production. Every other runtime file matches City35, including the 0–66 m profile, controls, economy, save, camera and materials.

The original vehicle-dynamics assertions and input-only route controller are restored from City34. Assistance-only tests are historical text snapshots; unchanged independent hill and tire-force assertions remain active in `tests/hills-independent.mjs`. Independent behavior parity is in `../handling-rollback/`.

`final.json` records the shared regression. `short-journeys.log` and `../network-journeys/handling-rollback-short.json` contain eight real gameplay runs: pickup and ashhauler, stock/max, both arms. No successful-run pose, velocity or fuel injection is used. Actual app input, fuel/camera and persistence are checked with a mock DOM/renderer. Browser/WebGL/Android are unverified.

Final result: all 42 shared/independent suites passed, plus all eight gameplay journeys. The independent rollback audit compared 613,600 model frames with zero difference and passed 20 isolated uphill runs.
