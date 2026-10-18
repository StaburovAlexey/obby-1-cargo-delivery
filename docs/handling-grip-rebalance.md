# Handling and grip rebalance — 2026-10-18

Based on `codex/low-end-rendering` at `f788f9e6336ffedd8cc0170df3b84bc090fab327`. Rendering, character assets, roads, prices, saved levels, rewards, server verification and unlock rules are unchanged.

## Upgrade purpose

- Handling: +3% per level, +30% at level 10. It changes steering response and countersteering, not a hidden yaw assist. Regular-car low-speed response is `0.28 * (0.5 / handling)^1.35` seconds, multiplied by `sqrt(1 + (speed / 12)^2)` at speed. The garage labels its displayed value as low-speed response. BMW keeps its original stock rack response and applies the same upgrade exponent.
- Grip: +2% per level, +20% at level 10. It increases the tire friction-circle budget and lateral stiffness. It improves braking and slide recovery; it cannot promise a smaller body-slip angle for every maneuver, because more steering force can also tighten a turn.
- Speed remains +1% and tank +3% per level. All four retain 10 levels and the existing brain prices. Old saves keep every purchased level; no migration, reset or new finish lock.
- All ten regular cars retain their existing +12% base handling/grip ladder, speeds, ranges and biome specialities. A fully upgraded earlier car may handle better than the next stock car. Later cars still progress through speed, fuel capacity/range and suitability for later biomes. The BMW remains the separate reward car.

## Tire model

Ordinary steering's high-speed scale rises from 9 to 16 m/s on suitable surfaces. It smoothly approaches the old 9 m/s limiter for unsupported surfaces using the existing longitudinal-grip compensation. This preserves the difficult-biome climb support and avoids indiscriminately making those cars spin.

Lateral tire stiffness changes continuously from the low-speed velocity damper towards a finite slip-angle stiffness: `1 / sqrt(1 + (wheelLongitudinalSpeed / 8)^2)`, blended back towards the original law for unsupported surfaces. Every tire force still opposes local tire slip and remains inside its friction circle. There is no forced sideways velocity, target slip angle, yaw servo, auto-braking or steering assistance.

BMW stock friction is calibrated to its established 1.4 budget BEFORE purchased grip is applied. Its upgraded force budget is no longer capped at 1.4. Its nominal acceleration is corrected from the misleading 21.5 to the actual 4.8 m/s² calibration, and the motor no longer clips speed upgrades at 4.8. Its supported-surface engine multiplier is 1, preserving its established stock launch and canyon trajectories; its older-biome speed multiplier remains unchanged. Geometry, rear drive and handbrake behavior remain intact. Grip upgrades make BMW easier to recover but do not remove its sustained drift.

## Evidence and limits

`npm run test:handling-grip` runs production-solver regression and actual app-loop smoke checks. Full stock/handling10/grip10/all-max measurements for all 11 vehicles on all 5 biomes are in `qa/handling-grip/metrics.json` (220 long maneuvers, 1,815 individual-level cases). Separate independent tests and app reports are in the same directory.

The final independent sweep found:

- Handling10: regular-car wheel reversal 27–32% faster; release recovery 13–24% faster from an identical starting state.
- Grip10: equal-speed braking distance 13–16.8% shorter; injected side-slip recovery 14–17.5% faster.
- 660 turn/slalom scenarios remain finite; ordinary cars never reverse/spin in their supported biome. Worst tested supported regular transient: 10.89 degrees. All recover below 1 degree after six seconds of release.
- 2,200 passive/braking force samples dissipate energy; 15 and 120 Hz model runs agree exactly.
- 20/20 actual-app bridge approaches pass at 6 m/s, stock/max for ten regular cars, without collision/fall. Maximum center deviation: 8.81 cm. These include the lateral approach to an offset narrow bridge, not just a centered straight crossing.
- City courier on an unsuitable volcanic bridge also passes stock/max with a skilled controller; max reduces center deviation 0.260→0.213 m and peak slip 4.35→3.20 degrees. No purchase gate was added.
- Ash Hauler at 25 m/s, handling0→10: the actual app's first 200 ms heading response improves 26.7%. Its eventual fixed-input turn radius is not presented as a handling-upgrade benefit.
- All 115 canyon tests pass, including BMW scored journeys at 60/30/15 fps. Nine upgraded BMW runs (handling10, grip10, all-max at 60/30/15 fps) also complete with positive scores, <3 seconds rail contact and unchanged server-verifier approval with a suitable driving technique: higher entry speed and less sustained handbrake preserve momentum. The unchanged stock pilot is not a universal driver for the upgraded car. No scoring/verification thresholds were weakened.

These are deterministic CPU tests with mocked DOM/rendering/asset loading where applicable. They are not browser/GPU visual playtesting, human touch-feel validation, full career completion, or device FPS measurements. Browser playtesting remains blocked on private-site sign-in.

The inherited aggregate `npm test` already fails on the untouched upstream baseline in legacy app-input fixtures. Separate old balance/bridge/upgrade tests also contain outdated catalog/level/route expectations. Those unrelated failures are reported rather than masked; the new focused checks cover this rebalance directly.
