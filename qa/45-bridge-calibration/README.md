# Final expanded-route calibration

Final measurements: 2026-10-14, after bridge-preview clearance and moving-hazard placement froze. **45 bridges (nine per biome), 100 hazards, 20 active lateral movers including 10 center-crossers.**

## Later provenance and design hold

After the 20-run calibration, the hazard module's advertised bypass metadata was corrected from the old inner bound to ±10.1 m. The journey controller does not read that metadata; it derives its lane from the complete motion envelope and physical width. A fresh instrumented run on the corrected module reproduced the primary maximum-build timing exactly (1909.00 s). Original 20-run hashes are preserved. The strict budget script intentionally rejects unapproved runtime-hash changes rather than silently treating old evidence as fresh.

A later request targets a roughly ten-minute final journey, so these measurements are a longer-route baseline, not approval to publish this configuration. Two additional input-only controller variants, on the same runtime, passed: an 8 m/s bridge target with 80 m approach/15 m exit completed in 1244.15 s; a 10 m/s target completed in 1197.55 s. Their separate `journeys-bridge8.json` / `journeys-bridge10.json` reports show that much of the initial 1909 s result came from conservative controller assumptions. They do not change vehicle statistics or establish a fastest human route.

## Results

- **20/20 journey checks passed:** 19 successful deliveries plus the expected stock-pickup fuel-empty attempt at stop 3. Every production JavaScript hash stayed unchanged during each run set.
- Every final Ashhauler run crossed and recorded **all 45 bridges**, touched all 15 earlier fuel circles, and had **zero collision or unsupported-wheel frames**.
- Final routes used active production mover updates and the same shared runtime poses as collision/rendering. The controller steered outside complete motion envelopes, encountering 10 center-crossers on primary and nine on alternate. It never froze, disabled, teleported past or removed an obstacle.
- First-car contract remains: stock pickup reaches stop 2 in **40.95 s** and fails stop 3 after **67.95 s**. These match the historical timing.
- All seven tested stock fallback endpoints still succeed. Snowrunner stock stop 12 remains fragile at **1.573/880 fuel (~5.006 m)**.
- Support geometry and actual ten-rig footprints pass **31,500 static probes**: 6,300 centered, 5,400 off-edge, 1,800 tolerance, 1,800 wide-approach and 16,200 longitudinal/yaw/reverse cases. These static pose checks are separate from the input-only journey proof.

## Final routes

| Ashhauler build | Branch | Clean driving time | Remaining fuel | Approximate reserve |
| --- | --- | ---: | ---: | ---: |
| All four stats 10 | Primary | 31:49.00 | 22.371 / 2093 | 68.086 m |
| All four stats 10 | Alternate | 31:38.30 | 21.767 / 2093 | 66.247 m |
| Tank 10, speed/handling/grip 0 | Primary | 34:24.30 | 22.259 / 2093 | 67.745 m |
| Tank 10, speed/handling/grip 0 | Alternate | 34:13.90 | 22.287 / 2093 | 67.829 m |

Compared with the historical Site 50 / 15-bridge calibration on the same branches:

- Max-all alternate: **19:17.15 → 31:38.30**, +12:21.15 (about +64.0%).
- Tank-only primary: **21:06.70 → 34:24.30**, +13:17.60 (about +63.0%).

These are conservative deterministic-controller timings, not optimal or human-play measurements. A full trip now contains considerably more careful driving. This report does not claim the added time itself makes the game more enjoyable.

## Same-price seven-car model

The historical **7.960-hour** illustrative plan becomes **12.264 hours** using freshly measured combined-route timings and unchanged prices, reward rules and human assumptions. It still contains 56 successful deliveries. A more capable-driver sensitivity gives **9.632 hours**; a frequent-mistakes sensitivity gives **17.056 hours**. These are scenarios, not measured player averages or guarantees.

The intermediate 45-bridge-only layout gave 11.741 hours. Its preserved `bridge-only/` snapshot is useful comparison evidence but is not the final release: the final stage also changes preview-safe bridge placement and adds active moving hazards, so their individual time effects are not isolated by that comparison.

Same baseline assumptions: 1.15× clean driving time; 15-second restart; phase-specific failure probabilities [5%, 6%, 10%, 13%, 17%, 20%, 20%]; failed attempts ending at 65% of a trip; 55% clean fraction; 50% eligible hard selection; exact current first-delivery and mission rules. Pickup/courier remain stock; van and later modeled cars buy tank 10 and other stats 3. Upgrades are paid in brains before their timing is used. The model does not assume forced school waiting.

| Modeled vehicle/build | Target stop | Measured clean time |
| --- | ---: | ---: |
| Pickup stock | 2 | 0:40.95 |
| Citycourier stock | 3 | 1:03.40 |
| Van tank10/other3 | 7 | 6:17.35 |
| Snowgrip tank10/other3 | 10 | 14:04.65 |
| Snowrunner tank10/other3 | 13 | 22:21.65 |
| Lavacrawler tank10/other3 | 15 | 30:50.10 |
| Ashhauler tank10/other3 | 16 | 33:25.85 |

No runtime price, reward, speed, handling, grip, fuel, school or purchase setting was edited by this QA work. Human learning, mistake rates, enjoyment and actual reward cadence still require playtesting. Longer trips can make real late failures more costly than these assumed rates suggest.

## Method and limits

- Production driving model at 120 Hz fixed step, ordinary steering/pedal at 20 Hz, exact gameplay XZ path fuel, real service/delivery circles, full per-frame bridge support checks and production route tracker.
- After ordinary spawn, no pose/speed/fuel/progression injection. Initial test setup supplies ownership/upgrades; it does not prove acquisition time.
- Controller asks about 4 m/s near bridge approaches or unsuitable future terrain and about 8 m/s near center-crossing obstacles. A fixed full-envelope bypass is conservative. Movers advance continuously through normal simulation updates.
- Free fuel circles refill instantly in production. Driving time excludes walking, purchases, menus, cooldown and restarts; model overhead and failures are labeled assumptions.
- `reward` is base endpoint reward for model compatibility; `totalReward` and `rewardBreakdown` verify actual clean/hard/first receipts. Successful deliveries end the run rather than paying cumulatively.
- All ten actual rigs share the tested 2.64 m wheel track, 0.43 m tires and 3.36 m axle spacing. A straight centered tire envelope leaves about 0.965 m lateral margin on each side of a 5 m deck.
- Offline CPU evidence only. No browser, GPU, mobile, frame-rate or human playtest claim.

## Reproduce

Run from repository root:

    node tests/expanded-bridge-support.mjs
    node tests/expanded-bridge-journeys.mjs --set=final
    node tests/expanded-bridge-journeys.mjs --set=stock
    node tests/expanded-bridge-journeys.mjs --set=typical
    node qa/45-bridge-calibration/budget-model.mjs

`journeys-*.json` retain exact source hashes, real distances, every refill/bridge, fuel, controller avoidance and payout receipts. `support.json` contains footprint/probe counts. `budget-results.json` contains exact assumptions and phases. `summary.json` provides the final comparison. The original `qa/current-economy-calibration/` and `qa/economy-seven-hour/` evidence was not overwritten.
