# Shared classroom and study clock

## Confirmed change

All twenty stable desk IDs form one common first-free pool. A selected entry stores the active teaching tier separately from the seat. Five entry prices/rates and explicit purchases remain unchanged. Desks, chairs, seated poses, exit and collision solids are unchanged; fifteen color-coded row paint boxes were removed.

Owned cars have no floating label; unowned cars show only money icon and price. Teaching symbols are 58px (previously 47px), rate text 18px (previously 15px). Owned/free entrances show only the book/brain and rate. Closed entrances retain lock and price. No card or extra title was added.

## Root cause reproduced in published Site29

The application passed its movement timestep, capped at 0.05 seconds, into seated learning. Thus 15 FPS paid only 4.5 brains/second even though school 5 displayed 6. Published baseline measurements: 45 brains in 10 seconds and 270 in 60 seconds. Mixed 9–100ms frames paid 43.35 over ten visible seconds. This was an actual application-loop error, not a wrong configuration rate.

Seated learning now uses valid visible elapsed time separately from movement/animation. Final app-loop, HUD and saved balances show 60/10s and 360/60s at 15/30/60/120/144/240 FPS, including school 5 using desk-01 in a different former column. Mixed valid frames now pay 60/10s. Long stalls over 100ms, hidden tabs, blur, stand and reload do not accrue unattended time. Driving dynamics and its distance accounting were not changed.

## Aggregate result

Final `npm test` exited 0 with 393 PASS lines. The separate detailed `npm run test:study-clock` also exited 0.

## Coverage

Independent audit: 8/8 groups, 100 entry/seat pairs, 65 occupancy-mask cases, 1,700 avatar/entry/seat stand-and-exit cycles, exact 340-part furniture and 40-solid collision comparison. Repository tests additionally cover 555 entry/occupancy combinations, all purchases, full-room refusal, rate persistence, 15 reset/reload cases and 30 entry/frame-rate cases.

Reproduce the full suite with `npm test`; the detailed baseline/final timing fixture is `npm run test:study-clock`. Baseline and final JSON measurements are included here. Final floating-label markup/state and mobile authored sizing are covered by `tests/progression-hud.mjs` and `tests/bare-currency-hud.mjs`. The native SVG specimen in `qa/learning/` was regenerated and inspected.

Visible procedural scene: 78,162 triangles, 98 mesh batches, 3,007 instances; core city remains 57,570 / 10 / 2,039. Excludes unchanged GLB avatars and empty particle pool. Removed paint saves 180 triangles and fifteen instances versus Site29.

## Verification limit

Node executed actual application logic and Three.js math with a synthetic DOM/renderer. Native SVG was rasterized offline. Browser rendering, physical Android gestures, GPU timing and FPS were not verified. Extreme-angle labels can clip at the viewport edge; authored label boxes do not overlap in the checked camera projections.
