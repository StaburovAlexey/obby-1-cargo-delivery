# Reachability baseline (2026-10-19)

Read-only production audit before stronger-turn route changes. No economic configuration changed.

- Production physics pickup stock to cargo 2: PASS, 46.2 simulated seconds, 12.2% minimum fuel, 1 refill. Full source hashes in baseline-pickup.json.
- Route length: 15868.841887310184 m. First checkpoint center gaps: 180, 260, 340, 360.001 m. Final center gap: 4004.524656358093 m.
- Stock pickup range 290 m; max fuel tank range 377 m. Approximately 35.38 m remaining-path budget at measured 12.2% minimum fuel, before reaching cargo 2. Extra cornering/bypassing path consumes this budget.
- Fuel is actual path distance × base consumption × biome fuel factor. Refills are automatic within 4.4 m radius, on right side at all checkpoints except finish. Cargo zones are on the other side. Consumption is checked before refill.
- Max upgrades: speed +10%, fuel capacity +30%; base consumption unchanged. Future unsupported biomes multiply fuel consumption by tier gap + 1, blended near boundaries.
- Ideal centerline fuel-only maximum reachable checkpoint stock/max-tank: pickup 2/4; citycourier 8/8; rover 9/11; foresthauler 11/12; van 12/13; desertscout 13/13; snowgrip 14/14; snowrunner 14/15; lavacrawler 15/15; ashhauler 16/16; reward BMW 16/16. These omit station approach offsets, corners, hazards, collision and driving feasibility, so are theoretical envelopes, not guarantees.
- Final gap versus lava maximum range3900 m leaves a ~104.52 m nominal exclusion margin. Ash stock range5000 m leaves ~995.48 m nominal reserve. Geometry should retain these boundaries.
- Full-route speed-only ideal lower bounds: max-upgrade ash 407.52 s (6m47.5s), reward BMW343.48s. These ignore acceleration, bridges, hazards, refuel approach, biomes and cornering, and cannot establish a 12-minute real route time.
- Archived 2026-10-17 physics report records ash stock942.2 s (15m42.2s); it is historical, not current proof.

## Tests and limitations

`node tests/biome-progression-journeys.mjs --scenario=pickup-delivery` passes baseline.

`tests/compact-route-contracts.mjs` has stale economy assertions for old prices/ranges and ten vehicles. Existing final journey scenario is broken because its target uses scene.deliveries[15], while scene intentionally contains only 15 cargo stops and finish is handled separately. A temporary harness with synthetic finish target encountered current controller collisions (ash stockprogress477.245, lava tank10progress807.686). This does not prove impossible geometry, but blocks an honest claim of full-route validation using that harness.

## Post-edit verification

Production pickup2 CPU journey passed again:46.2 s,12.2% minimum fuel,1 refill,260 base/325 total reward, no collision or containment failure. Full source hashes are in final-pickup.json. Final centerline fuel envelopes and relevant source hashes are in final-fuel-envelopes.json. The nominal fuel boundaries and total route length are unchanged at reported precision. This validates this controller journey only; full-route driving time and human driving feel remain unverified.

Final evidence refreshed at 2026-10-19 20:00 UTC after the last city and desert turn edits. Final pickup and fuel-envelope JSON files carry the frozen-production hashes. Failed temporary full-route controller runs are harness/controller limitations, not proof that a route or car is impossible; no full-route completion or human timing guarantee is claimed.
