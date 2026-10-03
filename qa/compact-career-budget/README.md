# Compact-route career budget

## Recommendation

Keep the approved compact route's current prices, rewards, brain earnings and school rates for this release. The available unchanged-price evidence supports an **approximately four-hour illustrative progression**, not a defensible 7–8-hour human average. A seven-to-eight-hour target needs a separate decision and human playtesting; it should not be manufactured by assuming every player buys every car or ten tank levels they do not need.

The new route restores a distinct destination for each late vehicle. That is a useful improvement. Optional skilled skipping remains economically rational and is explicitly allowed by the design.

## Evidence scope and important provenance

All economic calculations use fresh production journeys from the **12:25 UTC integrated-runtime snapshot on 14 October 2026**, approximately 15,868.84 m long with 25 bridges and active moving hazards. Prices, all 16 historical endpoint payouts, upgrade prices, school rates and driving-brain rules were unchanged. The physics verifier, not this analytical model, ran the journeys.

After those journeys, fork-tip mesh/height code in `route-network.js` changed. A new witness showed a real timing/fuel difference, so no exact-hash compatibility exemption was accepted. **The exact budget numbers below describe the measured snapshot, not an exact calibration of the final runtime.** The final reference-witness status is recorded separately when available. The ±5% trip-time sensitivity deliberately tests a much larger change without claiming the new runtime is mathematically identical.

`budget-results.json` states `timingsCurrent: false`, saves both calibration and current runtime hashes, and lists the changed source. The ordinary model command rejects stale timing dependencies. The explicit `--snapshot` mode is permitted only for the documented `route-network.js` difference; all economic and other runtime dependencies must still match. Snapshot mode does not assert compatibility or substitute current physics into old timings.

## Concrete baseline, with every purchase paid

One plausible voluntary seven-car route is:

Pickup → Citycourier → Van → Snowgrip → Snowrunner → Lavacrawler → Ashhauler.

Pickup and courier stay stock. The van buys tank level 3 for 345 brains. Cars 7, 8 and 9 buy only tank level 1, for 120 / 145 / 170 brains. The final tank costs 11,265 brains; maxing all four final stats costs 45,060 total. Driving and delivery rewards earn brains while cash is being earned. There is no compulsory school session, passive income, trade-in, debug grant or ownership gate.

| Stage | Repeat destination | Measured clean drive | Successful runs to next purchase | Modeled stage time |
|---|---:|---:|---:|---:|
| Pickup stock | CP2 | 0:40.80 | 5 | 5.4 min |
| Courier stock | CP4 | 1:37.35 | 12 | 26.5 min |
| Van tank3 | CP12 | 7:10.55 | 3 | 27.4 min |
| Snowgrip tank1 | CP13 | 7:53.45 | 4 | 41.0 min |
| Snowrunner tank1 | CP14 | 8:49.25 | 5 | 58.0 min |
| Lavacrawler tank1 | CP15 | 10:09.40 | 5 | 67.7 min |
| Ashhauler tank10 | CP16 | 11:25.30 | 1 first clear | 15.6 min |

Total: **4.025 h and 35 successful deliveries**, plus approximately modeled failed attempts. The seven purchased cars cost 259,300 cash in total, including the free pickup. No intermediate car outside this chosen route is assumed mandatory.

The baseline has already earned about 47,959 unspent brains when the final car is purchased. It can therefore pay the complete 45,060-brain final build immediately and make its first finish in that build: **4.005 h** in the same snapshot. A tank-first finish followed by a separate max-build demonstration takes 4.265 h, but that extra finish is optional and must not be presented as a required acquisition delay.

## Sensitivity and optional routes

| Explicit scenario | First finish | Full-max final clear under that policy |
|---|---:|---:|
| Seven-car baseline | 4.025 h | 4.265 h if a second demonstration trip is taken |
| Baseline, final max bought before first finish | 4.005 h | 4.005 h |
| Every baseline trip 5% shorter | 3.832 h | 4.060 h |
| Every baseline trip 5% longer | 4.218 h | 4.469 h |
| More capable driving assumptions | 3.139 h | 3.537 h |
| Frequent-mistake assumptions | 5.771 h | 6.099 h |
| No optional delivery, first-visit or mission bonuses | 4.688 h | 4.928 h |
| Five-car route, skipping Snowrunner and Lavacrawler | 2.613 h | 3.891 h |
| Optional all-ten-car route | 4.491 h | 4.731 h |
| Tested expert first-clear witness | 1.644 h | 2.972 h on that same path |
| Tested expert full-max witness | 1.927 h | 2.871 h |

The first-clear expert witness is Pickup → Courier → Van → Ashhauler. It makes 4 pickup deliveries, 11 courier deliveries, 9 van deliveries with tank3, then one final tank10 delivery. All cash and upgrade brains are earned and paid. This is a **feasible model witness using measured routes**, not a claim of a globally optimal human speedrun.

The full-max witness uses Pickup → Courier → Foresthauler → Van → Snowgrip → Ashhauler, then earns the remaining final upgrades by driving. We enumerated all 256 ordered subsets of the eight intermediate cars, using the available measured route/build choices. Partial upgrades, unmeasured shortcuts, other mission-skipping choices and human route optimizations can produce different outcomes.

The extremely repetitive direct Pickup → Ashhauler witness is also possible: about 3.919 h to first finish under expert assumptions, with 294 successful deliveries. It demonstrates why an optional no-gate game cannot guarantee a long career by assuming a particular shopping order. It is not recommended play.

## Assumptions, not player telemetry

Baseline: 1.15× measured clean driving time; 15 s restart/interface time per attempt; per-car failure chances 5 / 6 / 8 / 9 / 10 / 12 / 13 / 15 / 17 / 20%; failed attempts end at 65% of that trip; 55% of successful deliveries are clean. Half the hard-branch awards demonstrated by the measured route are retained in the baseline sensitivity. Routes without an actually recorded valid hard branch receive no hard bonus. Branch selection and human reliability were not measured.

Failures pay no delivery reward, first award or mission progress. They earn only assumed movement brains. Successful movement-brain earnings come from the actual production receipt, with delivery bonuses subtracted before scaling. First-visit awards are paid once per visited endpoint. Sequential mission rewards use the production state machine, with exact probability propagation, integer per-outcome bonus rounding and no multiple-mission completion in one delivery.

More capable: 1.0× clean time, 10 s restart, 2–10% failure and 80% clean success. Frequent mistakes: 1.35× clean time, 20 s restart, 10–35% failure and 30% clean success. Expert witnesses: the measured clean controller time, 5 s restart, zero assumed failures, actual measured hard eligibility, and optional mission skipping to repeat the three-delivery mission. These are distinct hypothetical policies, not confidence intervals or population statistics.

## Does the next car have a useful role?

Yes, the former CP15 plateau is gone. Measured stock attempts fail at each new late destination, and just one tank level succeeds:

- Snowgrip: CP12 stock → CP13 with tank1; base payout 8,460 → 10,510.
- Snowrunner: CP13 stock → CP14 with tank1; base payout 10,510 → 12,910.
- Lavacrawler: CP14 stock → CP15 with tank1; base payout 12,910 → 15,680.
- Ashhauler: CP15 stock → CP16 with tank10; final base payout 19,460. Tank9 fails in the measured control.

However, buying a new car to see its destination and buying it to finish the whole career fastest are different goals. In the illustrative baseline, repeat yield is about 1,216 / 1,319 / 1,373 cash per minute for cars 7 / 8 / 9, excluding finite first/mission awards. The latter two purchases cost 45,000 and 78,000. Their new content and better capability can be worthwhile, but the modest income-rate gains do not make those purchases compulsory or automatically optimal before the 100,000 final car.

Stock Rover reaches CP7 with only about **2.67 m fuel reserve** in the snapshot. That is a fragile clean-controller proof, not a robust typical-player promise. It is not used in the seven-car baseline, and the limitation is retained in the data.

## What a 7–8-hour pricing-only target would mean

Relative to this central scenario it would add roughly three to four more hours without adding a new destination. Most of that would be repeated delivery saving. Raising mandatory upgrade costs or counting optional schools would create a false gate; forcing all ten purchases would contradict the intended freedom and still reaches only about 4.5 h in this model.

Recommended sequence:

1. Ship and verify the already approved route with its current economy.
2. Test fresh-start play with voluntary car choices; record moving time, restarts, failures, repeat payout, car/upgrade purchases and reasons for skipping a tier.
3. Decide whether 7–8 h means first finish, fully maxed final car, or optional broader completion. These are materially different goals.
4. If longer progression is still wanted, prefer varied optional objectives and reasons to use each car. Any price-only proposal should state the extra repeated runs it creates and preserve an honest expert-skip sensitivity.

Schools remain optional: their rates 1.5 / 1.8 / 2.2 / 2.6 / 3 brains per second do not exceed driving's 3. They can provide an idle alternative, but a driving career does not require waiting in them. This analysis changed no school, price, reward, mission, physics or purchase setting.

## Files and reproduction

- `approved-inputs/`: the five frozen main-runtime journey reports used for the snapshot.
- `model.mjs`: read-only model, source-signature validation, paid purchases/upgrades and 256 optional ordered subsets. No physics runner.
- `budget-results.json`: 15 scenarios, phases, assumptions, source hashes, stock fuel reserves, optional costs and snapshot status.
- `test-model.mjs`: verifies price/range contracts, costs, school/drive rates, finite first awards, balances, spending, scenario timing identities and the subset count.
- `budget-snapshot-before-network-change.json`: exact original result before the first later route source change.
- `inputs/` and `superseded-13km-model-unrun.mjs`: superseded 13.59 km evidence, never used as 15.87 km timings.

From the repository root:

    node qa/compact-career-budget/model.mjs --snapshot
    node qa/compact-career-budget/test-model.mjs

Without `--snapshot`, stale measured dependencies are an error. Both production-tree signatures are checked before and after the analytical run; it writes only this QA folder. No runtime changes or publication were performed by this worker.

### Final reference-witness update

At 12:32 UTC, the physics verifier reported the final fork-tip relief source hash `572094adc2d74ac3c8407522abac15bb98db136c17f29343ede8cad5967dfc29` for `route-network.js`. New final-runtime witnesses reproduce the snapshot's primary max-build 631.45 s and tank-only 685.30 s; the final alternate is 631.40 s. Their reports are under `qa/current-route-calibration/final-witness/`. At 12:33 UTC the verifier confirmed both final witness reports complete/passed with no runtime drift, including tank9 failure and the starter invariant, plus a fresh17,500-probe support pass. Publication remains owned by the parent task.

The final change is a broader fork-tip relief correction, not merely the earlier guard. Intermediate acquisition rows were not rerun after it. They remain explicitly prior-runtime evidence, and the approximate four-hour conclusion plus the 3.83–4.22 h ±5% trip-time sensitivity is the appropriate recommendation. No hash-equivalence claim is made. The budget work is complete and does not block the route release.
