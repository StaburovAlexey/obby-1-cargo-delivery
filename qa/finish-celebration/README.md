# Main-route finish celebration

The existing checkered line now completes the route on a short forward crossing inside the road. The old final left delivery circle and right fuel station are removed; the previous fifteen pairs are unchanged. Crossing starts 160 bounded instanced confetti pieces that follow the moving car, preserves driving controls, velocity and follow-camera motion while freezing settled-run fuel/reward progress, and returns the player through the normal hangar path after two seconds of active simulation. Hidden tabs, lost focus and platform pause suspend the sequence. Rebuild disposes the effect; arrival clears it.

Continuous full-route telemetry and all required bridge crossings still gate the final payout and BMW unlock. Reward settlement is persisted once at crossing; the receipt is deferred until arrival in the hangar. No final unloading maneuver is required. Empty fuel wins before settlement. Developer mode, preview routes, jumps, missing cargo and invalid traversal cannot earn this reward. Older saved route proofs remain accepted.

## Checks

- `npm run test:finish-celebration`: eight state/geometry/lifetime groups, headless app moving-crossing speed/input/camera continuity, gas/steering/reverse/brake/handbrake, lifecycle pause and exact timer boundary plus legitimate reward/receipt integration, existing finish geometry and developer preview checks.
- `npm run test:canyon`: current canyon regressions, including banner geometry and scene integration.
- Retention, reward app, developer reward app, delivery receipt, audio/brake app, settings app/menu and localization checks passed.
- Yandex and VK production builds passed; private preview is built with the development preview flag.
- Read-only independent reviews checked payout/proof integrity and lifecycle integration.

## Verification limits

No browser/GPU/device rendering or FPS test was available. Geometry/raycast and headless DOM tests are CPU checks, not visual verification.

The legacy aggregate `npm test` is not green: `physics-app-integration.mjs` has existing production/developer-input, overview, notification and all-vehicle-ownership expectations. Baseline checks reproduce these failures. Separate legacy settings-help markup count and reward-car economy expectations also fail on the unchanged baseline. `test:vehicle-effects` additionally requires a historical Git commit absent from the source-only working copy; its actual app/audio/brake checks pass. These unrelated assertions were not weakened or rewritten for this change. The new focused finish tests cover the migrated final completion contract.
