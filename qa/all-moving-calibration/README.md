# All-moving hazard calibration

Production physics, ordinary steering/pedal, no runtime balance changes.

- Starter: stock pickup delivers to stop2, cannot reach stop3 without upgrades; modest slalom also passes.
- `reference14`: the prior 14 m/s obstacle-zone controller completes cleanly in746s (12:26). Its source-manifest flag records a concurrent change only to `road-hazards-scene.js`, which this physics harness does not import; simulation dependencies were unchanged.
- `skill16`: final frozen source,16 m/s obstacle-zone target, completes cleanly in718s (11:58), all25 bridges and15 refills,35.664 fuel remaining. No physics or car-stat changes; only this test driver's pedal policy differs.
- `journeys-breakdown`: deliberately slower8 m/s obstacle-zone controller,894.05s. Not the prior release's14 m/s reference.

These are CPU simulated clean trips, not human/mobile/GPU playtests or guaranteed completion times.
