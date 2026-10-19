# Controlled skid for ordinary vehicles

This calibration supersedes the regular-car high-speed slip claims in
`handling-grip-rebalance.md`. The BMW remains on its existing drift solver.

## Driving behavior

- Ordinary cars can step out under a sharp, fast steering input. Smooth entry
  and lower speed remain effective driving skills.
- Grip upgrades increase the steering demand needed to break traction, reduce
  peak slip, and shorten recovery. Levels 0, 5, and 10 have distinct outcomes.
- Handling upgrades speed the driver's steering and countersteering response.
  They do not automatically steer, point the body at the road, or alter yaw.
- Lifting off and countersteering catches a slide. Returning the wheel to center
  also restores stability with the throttle held; a neutral wheel cannot sustain
  the new rear-compliance effect.
- At 6 m/s and below, the additional compliance is zero. Reverse retains its
  original tires. Low-speed bridge and hangar precision is preserved.
- Unsuitable-biome tire profiles retain their existing challenge, 25% governed
  speed penalty, handling, and fuel multipliers. The new compliance does not
  further reduce their already-low lateral tire strength. Full-lock driving can
  still spin an unsuitable car; a timely lift and correction remain usable.

## Tire model

The ordinary four-contact-patch solver remains authoritative. Rear lateral
stiffness is reduced progressively between 6 and 10 m/s while the front rack
requests meaningful cornering load. The size of the reduction accounts for the
existing tire package, road damping, speed, and purchased grip level.

As chassis slip grows, rear stiffness progressively returns. This avoids a
falling-grip cliff and leaves a predictable correction window. Centering the
rack removes the cornering-load reduction. Front lateral forces, engine/brake
forces, each tire's combined friction budget, and the rigid body's inertia all
continue to determine the actual trajectory.

There is no target skid angle, lateral kick, velocity rotation, yaw servo,
centerline snap, new braking assist, handbrake for ordinary cars, or purchase
gate. Passive tire forces always oppose their contact-patch motion. Simulation
remains fixed at 120 Hz with the existing frame/stall budget.

The catalog, prices, save schema, upgrade steps, and vehicle geometry are
unchanged. Grip remains +2% per level; handling remains +3% per level with the
existing nonlinear rack-response curve. The new cornering tire response also
uses the purchased grip multiplier. BMW rear drive, handbrake, forward/reverse
behavior, and drift solver are unchanged.

## Verification

Run `node tests/controlled-skid.mjs`. To write fresh measurements:

`SKID_REPORT=qa/controlled-skid/physics-metrics.json node tests/controlled-skid.mjs`

The report records all ten ordinary vehicles at levels 0, 5, and 10:

- Sharp full-lock, six-second turn at catalog entry speed on the vehicle's own
  biome: stock peak body slip **7.69–12.98°**, level-5 grip+handling **6.17–11.29°**,
  level-10 grip+handling **3.54–9.45°**. Each individual vehicle improves at both
  upgrade steps. Snow retains a slightly larger slip envelope.
- Grip10 reduces recovery from the same injected side-slip state by
  **15.1–17.5%**. This isolates grip from steering and entry-speed differences.
- Handling10 reverses the rack from the same seeded skid state **26.2–28.8%**
  sooner. This measures the driver's countersteering authority, not a guaranteed
  reduction in steady-state turning radius.
- Breakaway is measured as the minimum abrupt input causing a 5° transient in
  three seconds at the same entry speed. For example, pickup requires input
  **0.60 at grip0**, **0.75 at grip5**, and never crosses 5° at grip10 in this
  maneuver. City courier changes from **0.525 → 0.675 → no crossing**. Every car
  has a higher measured threshold at levels 5 and 10.
- **90** 15/30/60 Hz scenarios agree on trajectory and traveled distance.
- **900** force samples retain their friction budget and dissipate passive
  contact energy; all yaw torque equals the sum of the tire torques.
- **270** low-speed, reverse, and unsuitable-tire comparisons show the extra
  rear-compliance effect is absent where intended.
- **20** unsuitable vehicle/biome cases recover using only throttle release and
  reactive steering input in **1.67–6.99 seconds**. The test driver never edits
  position, velocity, heading, or fuel during a maneuver.
- Lift-off recovery and powered straightening pass for all ten cars at all
  three levels, preventing a self-sustaining neutral-wheel yaw loop.

`tests/vehicle-dynamics.mjs` retains all force, collision, energy, interlock,
reset, and frame-timing checks. Its obsolete small-slip forward-turn thresholds
now reflect the controlled-skid contract; reverse bounds are unchanged.
`tests/reward-driving.mjs` uses the new ordinary-car trajectory fixture while
retaining its BMW behavior assertions.

These are deterministic CPU checks. They are not human touch-feel validation,
browser/GPU performance measurements, or proof of completing an entire career
without damage. The independent audit under `qa/controlled-skid-independent/`
adds baseline comparisons, graded surfaces, bridge/app checks, and BMW trajectory
protection; its report gives its exact tested scope.
