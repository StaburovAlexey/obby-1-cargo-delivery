> Historical City35 evidence. Turn assistance was removed by the user-requested City36 handling rollback. This is not the current release result.

# Tight-turn assistance verification

## Contract and scope

This is explicitly arcade assistance layered on the existing four-contact-patch rigid-body solver. It does not set position, heading, velocity, or yaw rate. The fixed 1/120-second solver, wheel forces/friction circles, contact impulses, gear interlock, throttle hold, and view springs remain.

The clearance guarantee is for a car initially centered and aligned with an unobstructed, straight, 30 m-wide corridor. The car may continue straight while automatically braking before starting the turn. It is not an obstacle-avoidance system or a promise to rescue a car already beside a barrier, sliding sideways, or on a tight bend.

- Steering magnitude <=0.60: original driving forces and rack, bit-exact from an ordinary state.
- Steering 0.60 to 0.95: smooth progressively stronger assist and curvature.
- Steering >=0.95: full assist; full-lock nominal radius 3.85–4.35 m depending on handling.
- Automatic braking requires held throttle. Releasing throttle clears all assistance and preserves original coasting from the current pose/momentum.
- When unwinding an assisted turn while holding throttle, a 0.65 s exponential, bounded yaw/lateral stabilization tail prevents a reverse slide. Automatic braking and assisted rack override stop immediately below the strong-steer threshold. The tail drops to exactly zero below 0.0001 strength.
- At high speed, a continuous speed gate suppresses turning until speed is within 1.05 m/s of the terrain/car-dependent turn speed. The automatic brake is bounded at 12 m/s² before original tire/drag forces.
- Assisted yaw acceleration is targeted within ±4 rad/s². Additional yaw and lateral force corrections have explicit finite caps.

The steering wheel's public normalized input and 135° UI range are unchanged. Existing roadWheelTarget remains the baseline rack function; createDrivingModel adds strong-input assistance. TURN_ASSIST, turnAssistIntent and addTurnAssistForces are exported for inspection/controller use. Non-enumerable state.turnAssist reports the current explicit arcade force/torque and brake contribution without changing enumerable scalar-pose snapshots.

## Reproduction

Run from the site root:

- node tests/turn-assist.mjs
- node qa/turn-assist/measure-baseline.mjs
- node qa/turn-assist/measure-after.mjs

The baseline-v34 directory is the original published-model numerical dependency closure copied before implementation, including its route/config imports. SHA256SUMS verifies all seven modules are unchanged. Baseline code is never imported by production.

The permanent test suite covers 2,000 full 180° U-turn cases: all 10 cars, all 5 biomes, stock/max upgrades, D/R, left/right, and starts at 0/25/50/100% local top speed plus full catalog top speed even on slower terrain. Conservative body support uses half-width 2.9 m and half-length 3.6 m and is measured in the real contact callback at internal sweep slices; any barrier contact is a failure. Tests also cover 30/60/120 FPS, jitter, 350 ms stalls (existing 100 ms frame clamp), unchanged weak/coast behavior, four tire force bounds, gear brake-through-zero, and 400 unwind/recovery cases.

## Baseline finding

City34 reduced rack angle by 1+(speed/9)^2 while keeping the engine's full-speed target. The ashhauler's stock sustained full-lock radius was 112.42–116.85 m across biomes; max upgrades increased this to 125.44–130.42 m. Starting at local top speed, the conservative body extended 227.90–236.76 m sideways during a stock 180° turn and 253.92–263.88 m with max upgrades.

With assistance, the ashhauler sustained radius is about 3.97 m stock and 3.92 m maxed. From full local speed, its conservative 180° body extent is 12.06–12.23 m, including brake-before-turn travel; turn completion is 6.51–7.79 s across stock/max surfaces.

Detailed measurements, exact input speeds, turn times, body extents, force/derivative bounds, and recovery metrics are in baseline-ashhauler.json, assisted-ashhauler.json and turn-assist-results.json. No browser or WebGL validation is claimed; the browser route was blocked and was not bypassed.
