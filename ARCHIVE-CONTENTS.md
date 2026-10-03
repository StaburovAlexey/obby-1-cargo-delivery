# Source archive contents

The ZIP contains all runtime assets and modules, source, tests and text QA reports. Generated historical preview images under `qa/` (PNG, SVG and JPG) are omitted to keep the attachment below 20 MiB. They are diagnostics, not game textures. The complete source repository retains them.

## Imported Cosmo vehicles

Ten original GLBs from the user-provided CC0 Cosmo pack and its license are included under `dist/assets/vehicles/cosmo`. The ten catalog vehicles and separate reward BMW keep their imported visuals. Legacy procedural garage cars and the city delivery truck have been removed; pending vehicle roots contain only a hidden cargo group and mesh-free contact data, with no generated fallback car geometry. Four-wheel articulation, body-only paint remaps, proportional normalization and actual-tire ground/bridge support preserve stable ownership IDs and driving/economy configuration. Checks: `npm run test:cosmo`. GPU rendering and phone frame rate are not asserted by CPU tests.

## Weather and UI update

Weather blends across a 180 m boundary band with a 0.7 s temporal weight limit. Two fixed pools preserve distinct precipitation types; at most 1536 particle slots/two draws during mixing, 768/one when settled. Fog/background blend with the same weights. Hangar clears, pauses freeze, falling retains weather. Purchase buttons show Buy + price; hangar actions are a single left column. Targeted checks: `npm run test:weather-transitions`.

## Current compact route

- Approximately 15.87 km, five biomes, four forks and 16 paired service stops.
- 25 bridges, five per biome; 5 m wide and 24 m long, with real side gaps and directional falling.
- 30 road hazards: 20 full-width crossing movers and 10 static encounters. Each mover travels 21.2 m in exactly eight seconds each way, with separate 1.4-second endpoint dwell. Placement remains sparse; lava rocks remain grounded. 26 smooth bends include seven in the city, starting at 80 m.
- The reference clean final-car journey targets at most 12 minutes. Skill can replace speed, handling and grip upgrades; there is no artificial all-stat finish lock.
- Stock fuel ranges are 290 / 380 / 496 / 646 / 841 / 1095 / 1425 / 1855 / 2413 / 3140 m. Tank upgrades retain +3% per level. Each next stock range exceeds the previous maximum range.
- Prices, all 16 checkpoint payouts, capacities, speed, handling, grip, school rates and existing saves are preserved. Fuel consumption is adjusted to the compact route.
- The savings launcher is hidden without deleting saved goals; the mission button opens its dialog. Delivery receipts use a centered modal overlay. Existing UI, wheel/gas/reverse controls, weather and school features remain.

`npm run test:compact-route` is the current targeted regression command. Other historical suites may contain superseded prices, route lengths, bridge counts or falling-rock expectations; their existence is not a claim that the full historical aggregate passes today.

QA uses production JavaScript, CPU Three.js meshes and mocked application events. No browser, GPU, mobile appearance or frame-rate validation is claimed. Historical 32 km and 45-bridge journey/budget reports are retained as explicitly superseded evidence. The old 7–8 hour career estimate does not apply automatically to this shorter map; current pricing recommendations remain separate from runtime changes.

## Crossing and turn update

New tests cover exact eight-second travel, independent placement/render/collider checks, 26 bends, starter fuel boundaries, app pause/reset, and purchase/weather regressions. `qa/turns-crossings/` records the conservative 8 m/s and reference 14 m/s input-only journeys separately. Reference primary route: 716.6 seconds, collision-free, unchanged controls and car stats.

The steering wheel visual size and pedal positions are restored to the Site53 layout. A transparent padded hit zone is added around the wheel; its input uses the actual artwork center and remains owned until release. The centered receipt and all crossing/turn updates are retained. `test:wheel-touch` is the current focused check; `double-steering-wheel.mjs` records the superseded size experiment.

## Settings guide and integer fuel HUD

This archive includes RU/EN play instructions, a 23-example actual-UI icon guide, and section shortcuts inside the paused settings dialog. Fuel numbers use fixed current/capacity slots and integer presentation while preserving fractional game-state fuel and existing saves. Current focused checks are `test:settings` and `test:integer-fuel`; CPU/static QA and known baseline test limitations are documented in `qa/settings-help/`.

## Complete initial loading

The loading screen hides the sound shortcut and keeps controls/simulation paused until every current vehicle, selected/showroom character, image and font is ready, shaders are prepared and a covered scene frame is rendered. Errors and a two-minute timeout show Retry. See `qa/startup-cleanup/` for CPU verification and unchanged historical suite failures.

## Brain balance order

The top-right brain icon is now left of its integer balance. The number remains right-anchored, with existing tabular digits and responsive sizing. See `qa/brain-currency-order/` and `tests/brain-currency-hud.mjs` for CPU/static checks and verification limits.
