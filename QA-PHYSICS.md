# Force-dynamics verification

2026-10-13. Node.js with the actual Three.js library and renderer-free application fixtures. No browser, Android touchscreen or GPU benchmark was run.

## Core mechanics

21 focused checks cover four contact patches, force/torque signs, friction circles, mirror symmetry, independent steering rack angle, acceleration of all three cars, controlled slip, D/R braking, reverse steering, release/coast, grade rollback, 30/60/120 Hz equivalence, bounded stalls, lateral travel, wall slides, oblique impacts, road-envelope stability and all reset channels.

Calibration:

| Measurement | Pickup | Rover | Van |
|---|---:|---:|---:|
| Nominal governed speed, m/s | 11 | 17 | 24 |
| Time to 90% speed, s | 1.767 | 2.233 | 3.250 |
| Sustained full-steer body slip, degrees | 4.30 | 1.91 | 0.80 |

A pickup brakes from 11 m/s through zero in about 1.05 s when D/R changes. A released vehicle on a 6% grade rolls downhill at 0.856 m/s after four seconds. In 1,800 near-parallel real-road contact frames across five headings, maximum absolute yaw rate was 0.000079 rad/s. A two-point normal-impulse solve avoids an artificial single-corner yaw kick near parallel contact.

## Independent application review

11 integration groups use the production application and actual Three.js transforms. They check exact 30/60/120 Hz state agreement, severe stall bounding, grade/ground-fit agreement, sideways travel fuel and camera accounting, zero-time frames, two-pointer D/R input, real-road collision response, three car configurations and blur/resize/overview/garage/fuel-zero reset handling.

An additional independent set of 2,500 randomized force evaluations found no positive passive tire work, no friction-circle violation beyond rounding, and coordinate-rotation error below 4.1e-10. Tire friction-limit rounding excess was below 2.8e-12 N.

## Economy trips

The real application-frame driver uses steering and throttle. During a trip it never injects vehicle position, heading, fuel or speed.

| Vehicle / destination | Outcome | Intermediate refuels |
|---|---|---:|
| Pickup, checkpoint 4 | Delivery, 720 earned | 3 |
| Pickup, checkpoint 5 | Empty tank before destination, no reward | 4 |
| Rover, checkpoint 6 | Delivery, 1,620 earned | 5 |
| Rover, checkpoint 7 | Empty tank before destination, no reward | 6 |
| Van, checkpoint 8 | Delivery, 3,060 earned, all five biomes crossed | 7 |

These runs preserve all existing prices, capacities, consumption rates, distances and payouts. No road contact occurred on the test driver's normal route. The maximum tested 50 ms center step was 1.208 m in the van on a grade; internal contact sweeps stay within the smaller 0.12 m translation/rotation budget.

## Bounds of the result

The 2.9 × 3.6 m conservative road half-envelope remains larger than the 1.55 × 2.88 m physical impulse-support half-envelope. Tests confirm containment and stable sliding; exact contact-point realism is approximate. The unchanged height/pitch/roll ground fit is not a full 3D suspension.

The original v25 app and vehicle model remain under `tests/baseline/` for comparison or rollback. Historical Tow parity is tested separately from current force dynamics. Run all portable regressions with `npm test`.
