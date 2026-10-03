# 45-bridge-only calibration snapshot

Measured 2026-10-14 before the new dense/moving-hazard implementation. This is a preserved intermediate comparison, **not the final combined obstacle release**.

- 20 input-only journeys passed; every production JavaScript hash remained unchanged during each set.
- 45 bridges: nine per biome. All four final Ashhauler combinations/branches crossed and recorded all 45 bridges, touched all 15 earlier fuel circles and delivered without any collision or unsupported-wheel frame.
- Starter stock still delivers at stop 2 in 40.95 s and fails fuel-empty before stop 3 after 67.95 s. Both timings match the old calibration.
- Static support checks cover all ten actual wheel rigs: 6,300 centered, 5,400 off-edge, 1,800 ±0.7 m tolerance, 1,800 wide-approach and 16,200 ±5°/reverse yaw samples. Centered straight tire clearance is approximately 0.965 m on each side of the 5 m deck.

## Final clean driving time and fuel

| Build / branch | Time | Fuel remaining | Approximate reserve distance |
| --- | ---: | ---: | ---: |
| All stats 10 / primary | 29:35.45 | 22.974 / 2093 | 69.922 m |
| All stats 10 / alternate | 29:36.05 | 23.274 / 2093 | 70.833 m |
| Fuel 10, other stats 0 / primary | 32:13.60 | 22.334 / 2093 | 67.973 m |
| Fuel 10, other stats 0 / alternate | 32:14.45 | 22.898 / 2093 | 69.691 m |

Branch-matched comparison with the historical 15-bridge calibration: max-all alternate adds 10:18.90 (from 19:17.15); tank-only primary adds 11:06.90 (from 21:06.70).

## Same-price budget consequence

The same illustrative seven-car first-clear plan, current prices and original human assumptions now calculates **11.741 hours**, compared with the historical **7.960 hours**. It uses 56 successful runs. The more capable-driver sensitivity gives **9.220 hours**. These are modeled scenarios, not observed player averages or guarantees.

Model assumptions are unchanged: 1.15× clean driving time, 15-second restart, phase-specific failure probabilities [5%, 6%, 10%, 13%, 17%, 20%, 20%], failed attempts ending at 65% of a trip, clean fraction 55%, eligible hard selection fraction 50%, exact current first-delivery and mission rules. Pickup/courier remain stock; van and later modeled cars buy fuel 10 and speed/handling/grip 3. The model charges upgrade brains before using upgraded timing, and uses measured stock fallback routes if needed. No price, reward, speed, handling, grip, fuel, school or purchase setting was edited for this calibration.

Measured clean comfort-route increases: van +113.30 s; snowgrip +297.65 s; snowrunner +448.30 s; lavacrawler +593.95 s; ashhauler +653.00 s. These are driving-only times. More bridges can also affect real failure rate, which has not been measured.

## Fragile stock endpoint

Stock snowrunner still reaches stop 12, but leaves only **1.027/880 fuel (~3.267 m)**, versus historical 1.506 (~4.8 m). Further detours may invalidate that old endpoint. This is not a robust player margin.

## Limits and artifacts

- Deterministic clean bridge-aware test controller; ordinary steering and pedal controls only after spawn. No pose, speed, fuel or progression injection.
- 20 Hz controller and production 120 Hz fixed-step physics. Controller requests about 4 m/s near bridge approaches and unsuitable future terrain; this is conservative feasibility/timing evidence, not an optimal driver or human skill measurement.
- Initial test setup supplies vehicle ownership/upgrades. Purchase acquisition is handled only by the separate budget model.
- Production service circles refill instantly. Driving time excludes walking, menus, cooldown, purchase interactions and retries; budget restart/failure values are explicit assumptions.
- Production route tracker and clean/hard/first payout receipts are verified. `reward` stores base payout for model compatibility; `totalReward` is actual single-run payout. Baseline reports had no such bonuses.
- CPU production geometry/physics/gameplay only. No browser, GPU, mobile or human playtest claim.
- `journeys-*.json` contain source hashes, every refill/bridge, distance, fuel reserve, frame count and receipts. `budget-results.json` contains exact model assumptions and phases. Source copies preserve the harness/model used for this intermediate snapshot.
