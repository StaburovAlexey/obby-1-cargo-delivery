# Progression release verification

These checks run the actual Three.js geometry, skeletal math, four-wheel solver and application JavaScript with a synthetic DOM/renderer. They are not Android, browser touch, WebGL shader compilation, GPU performance or subjective driving tests.

## Scope

- Five school zones, four stable seats each; 17 original avatar assets and furniture poses retained.
- Driving earns one brain per second of actual simulated movement. Seated school rates are 1.5/2/3/4.5/6 per second. Blur, hidden tabs, overview, modal menus, idle, teleports and long frame stalls do not accrue rewards.
- Save schema 2 migrates existing money, vehicles and the selected skin, and adds fractional brains, purchased schools/skins, per-car upgrades and a one-time grant flag.
- Ten sequential cars, three upgrade levels per stat, two percent per level. Speed modifies traction/top speed, handling modifies steering response/yaw, grip modifies lateral force/braking.

## Aggregate regression

The complete `npm test` command exited 0 with 381 PASS lines. The final narrow-button CSS adjustment is additionally covered by the targeted HUD and application suites. The aggregate transcript is `aggregate-test.log`.

## Independent checks

24 focused groups passed: 11 state/physics and 13 application groups. This includes 183 grant/ownership/wallet cases, 17 old selected-skin migrations, all 16 skin purchases/selections/reloads, all five schools, 90 stat purchases, modal focus/dismissal, 30/60/90/120/144/165/240 Hz earning, bounded failed-storage retries, and 375 camera/viewport school-label projections. All projected authored label boxes remain separate; labels at a screen edge may clip naturally. Mobile layout remains an offline authored-size check.

The checks found and verified fixes for high-refresh underpayment, long-frame rewards, dirty fractional progress on scene rebuild, disabled-button focus, narrow upgrade text overflow and per-frame failed-storage retries.

Reproduce:
- `node tests/progression-independent-state.mjs`
- `node tests/progression-independent-app.mjs`
- `npm run test:upgraded-routes`
- `npm test`

## Measured physics and trips

100 stock/max-upgrade car-biome combinations were measured. In 29 supported-terrain adjacent-car comparisons the next stock car remains faster, stronger at launch, quicker at steering response, and better at braking/lateral recovery than the fully upgraded previous car. Minimum measured advantages: speed 5.01%, launch 4.61%, braking distance 1.62%, lateral recovery 1.07%. Top upgraded nominal speed is 37.524 m/s. These values do not claim dominance on unsupported future terrain.

All ten stock trips and ten maximum-upgrade trips reached their selected final checkpoints without barrier contact. Pickup reaches checkpoint 4, city courier 5, rover 6; the other seven reach 8 with intermediate refills. Pickup attempting 5 and rover attempting 7 run out of fuel and receive no payout. Path length and all refills use the real solver, without setting vehicle position/speed/fuel during the trip. Synthetic steering follows the route; these are not human playtest results.

## Geometry budget

Seed 42 core city remains 57,570 triangles, 10 mesh batches and 2,039 instances. Visible procedural scene is 78,342 triangles, 98 mesh batches and 3,022 instances, compared with 77,550 / 94 / 2,988 before five schools: +792 triangles, +4 batches, +34 instances. This excludes unchanged GLB characters and the initially empty wheel-particle pool. Full garage resources, including hidden cargo, are counted separately in geometry-counts.json. Counts are scene-graph totals, not GPU draw calls or FPS.

Original city road, house, material, camera, character-pose and vehicle UI files outside this feature retain their existing implementations. No online server or real-money payment is implemented.
