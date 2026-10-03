# Settings gameplay help and integer fuel HUD

Date: 2026-10-15. Base: Site68 / a332ca89bd11a29a95b152a740a6ca6ae5514ef1.

## Scope

- Seven concise RU/EN gameplay steps and 23 real HUD/control examples, including both speaker states.
- Shared SVG symbols, actual wheel asset, existing pedal appearance and shared joystick artwork. No duplicate gameplay buttons or IDs.
- Section navigation scrolls only the existing modal and focuses its keyboard-scrollable content. Background remains inert and paused. Existing volume, language, focus restoration and Escape/backdrop dismissal remain.
- No economy, vehicle handling, rewards, route geometry or save-schema changes.
- Whole-number fuel text in fixed current/capacity columns. Underlying fractional fuel, capacities and progressbar precision remain unchanged.

## Passed focused verification

- `npm run test:settings`: guide content/artwork inventory, all RU/EN static and dynamic localization, repeated language switching, keyboard focus, native slider/select controls, internal section navigation, input isolation, repeated open/close, pause and preference persistence.
- `node tests/integer-fuel-hud.mjs`: 3,146 RU/EN display cases across all 121 vehicle/tank combinations; 100 → 99 → 9 stability; positive remainder, zero, full and fractional upgrade boundaries; real app upgrade/refill/empty/re-entry flow; 80 CSS/safe-area arithmetic cases.
- `node tests/compact-fuel-hud.mjs`: one-line fuel/speed layout contracts.
- `node tests/career-modal-input.mjs` and `node tests/retention-app-integration.mjs`: modal isolation and successful-delivery behavior.
- `node --check dist/app.js`, `node --check dist/settings-menu.js`, `node --check dist/localization.js`, `git diff --check`.

## Existing baseline limitations

The historical `test:career-dialogs` aggregate stops in retention-ui.mjs at the old 440 px HUD-row expectation (current baseline is 484 px). The same failure was reproduced unchanged in the clean Site68 checkout.

The historical reverse-pedal-app test expects production access to the now developer-only biome menu; it fails its neutral-input assertion at line 12 in both Site68 and this change. This change does not alter input or developer-access logic.

Other historical suites retain removed gear-note markup, old 1,200/3,200 prices and a ten-vehicle count that excludes the reward BMW. They are not represented as a green full aggregate.

All verification here is CPU, source inspection or mocked DOM. Browser/Chromium, WebGL, GPU, actual phone gestures, screenshot appearance and Android performance were not tested.

Additional passing checks: `wheel-pedal`, `wheel-pedal-app`, `reverse-pedal`, `delivery-receipt-modal`, `reward-app`, `reward-car-unlock`, and `reward-developer-mode`. The padded-wheel test passes its 48 CSS cases and pointer-handler sections, then reaches the same obsolete production biome-menu expectation; `tank-upgrades` expects the historical 3 levels rather than the current 10. Both failures were reproduced on clean Site68. Full output is in `additional-regression.log`.
