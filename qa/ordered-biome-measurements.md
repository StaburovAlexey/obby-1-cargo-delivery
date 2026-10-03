# Ordered biome dynamics measurements

Renderer-free real fixed-step solver; no browser, GPU, touch, or subjective playtest claim.

## Outcome

- All 50 explicit profiles passed seven ordered-tier test groups and ten complementary biome-surface safety groups. The original vehicle-dynamics suite also passed.
- Same-tier terminal speed is 100% of immutable nominal speed. Earlier tiers retain 90–96% nominal speed, at least 82% of own-tier launch acceleration, strong grip and no more than 10% extra matched-speed braking distance.
- Next-tier launch is at most 35.274% of own-tier; terminal speed at most 42%; braking distance at least 2.332× own-tier; lateral-slide distance at least 4.072× own-tier.
- All unsupported tiers have less than 25% of own-tier initial matched-speed tire-generated yaw acceleration. The lower achieved speed keeps held-turn peak slip small; that number alone is not used as proof of worse handling.
- Global maximum route grade: 11.652542% at station 101.5 m. Every car/surface starts and climbs it in both D and R. Minimum 20-second uphill speed: 1.588702 m/s. Maximum recovery time from 1.5 m/s wrong-way rollback: 2.066667 s.
- 30/60/120 Hz state differences are at most 8.53e-14. All 50 stall-budget checks pass. Eighty D/R boundary crossings are continuous; maximum per-fixed-step velocity change is 0.066875 m/s.
- No driving-model changes. Prices, capacity, nominal range, maxSpeed, ownership, distance consumption, 48 m transitions, UI rack and D/R interlock remain unchanged. Pickup/city trajectory is bit-identical to the original no-surface default.

## Method

- **commonSpeedMps**: 1.5
- **launch**: Speed after 1 s and 2 s from rest under held throttle.
- **terminal**: 40 s on a constant flat surface; compare actual speed with immutable nominal speed × surface speed factor.
- **braking**: D/R interlock from a matched, previously verified attainable 1.5 m/s. Distance until velocity changes sign.
- **turn**: Actual tire-generated angular acceleration at 1.5 m/s, steering 0.8, production grip-aware D rack angle, coasting.
- **slide**: Released car enters at 1.5 m/s forward + 0.6 m/s sideways; measure lateral path until rest.
- **stability**: 8 s held 0.8 steering in both gears, then 4 s straight recovery, then a brake-interlocked gear reversal.
- **grade**: All 50 profiles face the maximum actual route grade as a conservative constant uphill, in both D and R.
- **timing**: Identical input program at 30/60/120 Hz; 3 s stall compared against the existing 0.1 s / 12-substep budget.

The braking reference is deliberately low: the worst flat terminal speed is 1.87 m/s. Each profile is first verified to attain 1.5 m/s under its real engine, then initialized to exactly 1.5 m/s for a fair stopping-distance comparison. The lateral disturbance is controlled test setup, not a runtime force or speed override. Safety checks retain the existing 0.27 rad slip, 0.95 rad/s yaw, 0.2 m/s fixed-step reversal-change and recovery thresholds.

## Next-tier contrast

| Car | Own → next | Launch ratio | Speed ratio | Brake distance ratio | Slide ratio |
|---|---|---:|---:|---:|---:|
| citycourier | city → forest | 0.301 | 0.390 | 2.660 | 7.552 |
| desertscout | desert → snow | 0.353 | 0.420 | 2.607 | 14.266 |
| foresthauler | forest → desert | 0.291 | 0.390 | 2.595 | 7.513 |
| pickup | city → forest | 0.316 | 0.420 | 2.471 | 7.148 |
| rover | forest → desert | 0.308 | 0.420 | 2.405 | 7.446 |
| snowgrip | snow → volcanic | 0.313 | 0.420 | 2.332 | 4.440 |
| snowrunner | snow → volcanic | 0.296 | 0.390 | 2.506 | 4.072 |
| van | desert → snow | 0.345 | 0.390 | 2.836 | 14.121 |

## Complete 10 × 5 measurements

Launch is actual speed after one second. Brake and yaw response use 1.5 m/s. Slip is the maximum in D or R during the held-turn experiment. Grade speed is the lower D/R result on the global maximum grade. Full precision, two-second launch, recovery, D/R and timing results are in the adjoining JSON/CSV.

| Car | Biome | Launch m/s | Terminal m/s | Brake m | Yaw accel rad/s² | Lateral slide m | Peak turn slip ° | Uphill m/s |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| pickup | city | 5.766 | 11.000 | 0.120 | 2.770 | 0.020 | 9.52 | 10.718 |
| pickup | forest | 1.820 | 4.620 | 0.297 | 0.350 | 0.146 | 7.92 | 4.339 |
| pickup | desert | 1.581 | 3.410 | 0.380 | 0.204 | 0.214 | 7.66 | 3.129 |
| pickup | snow | 1.795 | 2.530 | 0.493 | 0.142 | 0.379 | 6.93 | 2.248 |
| pickup | volcanic | 1.432 | 1.870 | 0.559 | 0.153 | 0.279 | 7.45 | 1.589 |
| rover | city | 6.749 | 16.150 | 0.120 | 2.427 | 0.024 | 8.77 | 15.868 |
| rover | forest | 7.402 | 17.000 | 0.119 | 2.818 | 0.020 | 9.19 | 16.718 |
| rover | desert | 2.278 | 7.140 | 0.287 | 0.343 | 0.146 | 7.58 | 6.859 |
| rover | snow | 2.217 | 5.100 | 0.398 | 0.170 | 0.328 | 6.78 | 4.818 |
| rover | volcanic | 1.815 | 3.910 | 0.465 | 0.192 | 0.237 | 7.30 | 3.629 |
| van | city | 6.523 | 22.080 | 0.120 | 2.255 | 0.025 | 8.54 | 21.798 |
| van | forest | 6.436 | 22.560 | 0.118 | 2.097 | 0.027 | 8.39 | 22.279 |
| van | desert | 7.010 | 24.000 | 0.118 | 2.552 | 0.022 | 9.33 | 23.719 |
| van | snow | 2.418 | 9.360 | 0.333 | 0.185 | 0.307 | 6.75 | 9.078 |
| van | volcanic | 1.536 | 6.960 | 0.418 | 0.202 | 0.225 | 7.63 | 4.963 |
| citycourier | city | 6.968 | 20.000 | 0.120 | 2.569 | 0.022 | 8.91 | 19.718 |
| citycourier | forest | 2.095 | 7.800 | 0.320 | 0.293 | 0.168 | 7.54 | 7.519 |
| citycourier | desert | 1.815 | 5.800 | 0.418 | 0.162 | 0.247 | 7.27 | 5.519 |
| citycourier | snow | 2.006 | 4.400 | 0.524 | 0.129 | 0.411 | 6.67 | 4.118 |
| citycourier | volcanic | 1.596 | 3.200 | 0.599 | 0.127 | 0.315 | 7.15 | 2.919 |
| foresthauler | city | 6.523 | 13.950 | 0.120 | 2.255 | 0.025 | 8.54 | 13.668 |
| foresthauler | forest | 7.004 | 15.000 | 0.119 | 2.504 | 0.022 | 9.35 | 14.719 |
| foresthauler | desert | 2.038 | 5.850 | 0.308 | 0.286 | 0.167 | 7.59 | 5.569 |
| foresthauler | snow | 2.144 | 4.200 | 0.418 | 0.157 | 0.352 | 6.76 | 3.918 |
| foresthauler | volcanic | 1.719 | 3.300 | 0.493 | 0.165 | 0.263 | 7.26 | 3.019 |
| desertscout | city | 6.749 | 18.050 | 0.120 | 2.456 | 0.023 | 8.87 | 17.768 |
| desertscout | forest | 6.688 | 18.240 | 0.118 | 2.328 | 0.024 | 8.70 | 17.959 |
| desertscout | desert | 7.497 | 19.000 | 0.118 | 2.867 | 0.019 | 9.16 | 18.719 |
| desertscout | snow | 2.644 | 7.980 | 0.308 | 0.213 | 0.273 | 6.73 | 7.698 |
| desertscout | volcanic | 1.695 | 5.890 | 0.398 | 0.230 | 0.205 | 7.59 | 5.609 |
| snowgrip | city | 6.604 | 14.720 | 0.120 | 2.369 | 0.024 | 8.60 | 14.438 |
| snowgrip | forest | 6.542 | 15.040 | 0.118 | 2.242 | 0.025 | 8.54 | 14.759 |
| snowgrip | desert | 6.565 | 15.200 | 0.118 | 2.122 | 0.027 | 8.36 | 14.919 |
| snowgrip | snow | 7.446 | 16.000 | 0.123 | 1.936 | 0.031 | 9.28 | 15.718 |
| snowgrip | volcanic | 2.327 | 6.720 | 0.287 | 0.380 | 0.138 | 7.61 | 6.439 |
| snowrunner | city | 6.377 | 17.100 | 0.120 | 2.197 | 0.026 | 8.26 | 16.818 |
| snowrunner | forest | 6.291 | 17.480 | 0.118 | 2.068 | 0.027 | 8.21 | 17.199 |
| snowrunner | desert | 6.313 | 17.860 | 0.117 | 1.948 | 0.029 | 8.02 | 17.579 |
| snowrunner | snow | 7.074 | 19.000 | 0.123 | 1.595 | 0.038 | 8.75 | 18.718 |
| snowrunner | volcanic | 2.095 | 7.410 | 0.308 | 0.325 | 0.156 | 7.62 | 7.129 |
| lavacrawler | city | 6.604 | 16.560 | 0.120 | 2.456 | 0.023 | 8.90 | 16.278 |
| lavacrawler | forest | 6.551 | 16.740 | 0.119 | 2.329 | 0.024 | 8.84 | 16.459 |
| lavacrawler | desert | 6.582 | 16.920 | 0.118 | 2.210 | 0.025 | 8.65 | 16.639 |
| lavacrawler | snow | 6.710 | 16.920 | 0.123 | 1.564 | 0.039 | 8.27 | 16.638 |
| lavacrawler | volcanic | 7.606 | 18.000 | 0.120 | 2.880 | 0.019 | 9.14 | 17.718 |
| ashhauler | city | 6.377 | 18.000 | 0.120 | 2.312 | 0.025 | 8.66 | 17.718 |
| ashhauler | forest | 6.299 | 18.200 | 0.118 | 2.183 | 0.026 | 8.49 | 17.919 |
| ashhauler | desert | 6.330 | 18.400 | 0.117 | 2.064 | 0.027 | 8.31 | 18.119 |
| ashhauler | snow | 6.483 | 18.400 | 0.123 | 1.366 | 0.045 | 7.98 | 18.118 |
| ashhauler | volcanic | 7.208 | 20.000 | 0.120 | 2.623 | 0.021 | 9.28 | 19.718 |

## Changed regression intent

- Old “all forest/desert acceleration is below city” assertions were replaced with ordered-tier acceleration and earlier-terrain usability. Own-tier specialists are intentionally now better on their own terrain.
- Old “snow always brakes ≥20% worse than city” assertions no longer apply to snow-capable and volcanic vehicles. Unsupported snow still brakes much worse. Every vehicle retains measurably longer snow coasting and a controlled, longer lateral recovery.
- Old minimum 70% speed and 30% grip bounds contradicted the requested severe later-tier disadvantage. Bounds now reflect the explicit matrix; fresh physical tests impose stronger matched-speed, recoverability, transition and no-energy-gain assertions.
- Surface color values are unchanged. Legacy detail metadata stays available for inspection; it no longer controls the parent-restored shared LEGO road texture.

## Verification commands

```sh
node tests/biome-surface-dynamics.mjs
node tests/vehicle-dynamics.mjs
node tests/ordered-biome-tiers.mjs --report-dir ../ordered-biome-review
```

Only the three assigned source/test files were changed by this worker. Publication, aggregate app tests, materials/UI and documentation integration are owned by the parent. Browser execution was not attempted because the prior denial remains in force.

## Runtime fingerprint

- `dist/biome-surfaces.js`: `9b903c817ead641d23f5972cb3ca5a210226232f370a7e515638c55d0f67f599`
- `dist/driving-model.js`: `0c9cf5582f2ccd558266e4f09a7f668b2fd4789545e3ae006d4c446aeecee907`
- `dist/economy-config.js`: `7f828f64699943966a96bad3e59877710b5e9453fc96577cbd03fd74f2cda380`
