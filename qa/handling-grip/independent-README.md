# Independent handling and grip simulation QA

Run from the repository root:

- `node qa/handling-grip/independent-check.mjs`
- `node qa/handling-grip/independent-probe.mjs`
- `node qa/handling-grip/independent-long-turn.mjs`
- `node qa/handling-grip/independent-bmw-journeys.mjs`

Optional package command: add `"test:handling-grip-independent": "node qa/handling-grip/independent-check.mjs && node qa/handling-grip/independent-probe.mjs && node qa/handling-grip/independent-long-turn.mjs && node qa/handling-grip/independent-bmw-journeys.mjs"` to `package.json`, then run `npm run test:handling-grip-independent`.

No external packages or temporary baseline directories are needed. Each script defaults to the clone's `dist/` modules and writes its compact JSON report beside the script. The three flat-ground harnesses accept an alternative module directory and report filename as the first and second arguments; the scored-journey harness uses the clone's runtime, server verifier and existing QA driver fixture.

## Coverage

- 660 forward turn/slalom cases: 11 cars × five biomes × four upgrade sets × three steering strengths.
- 2,200 unpowered/braking tire-force samples: 11 cars × five biomes × 40 states; all force power must be dissipative.
- 11 exact frame-partition comparisons, 15fps against 120fps with the same fixed-step input timing.
- Identical-state steering reversal and release recovery at stock, maximum handling and maximum grip.
- 44 vehicle/upgrade probes for equal-speed braking, injected 3m/s lateral-velocity recovery and 3m/s maneuver response.
- 18 thirty-second sustained turns for snowrunner and BMW, including maximum grip/all upgrades.
- Nine completed, scored and server-verified BMW canyon journeys: maximum handling, maximum grip and all-maximum upgrades, each at 60/30/15fps. The QA pilot uses ordinary inputs and is adjusted for upgraded traction and steering.

## Findings from the final tune

- Maximum regular supported-biome transient slip is about 10.9°. All supported regular cases remain forward-moving and recover below 1° after six seconds of centered steering.
- Maximum handling improves equal-state steering reversal by roughly 27–32% for regular cars and improves release recovery by 13–24%.
- Maximum grip reduces equal-speed stopping distance by 13–16.8% and injected side-slip recovery time by 14–17.5%.
- BMW retains its distinct drift behavior. A 30-second half-steering turn settles near 10.3° stock, 5.85° with maximum grip, and 7.0° with all upgrades. Full-lock is not a sustained-drift guarantee; tires can regain grip as speed falls.
- Upgraded BMW canyon scores at 60/30/15fps: handling 46/51/47, grip 507/408/528, all-maximum 182/227/364. All nine satisfy the server verifier and have under three seconds of rail contact. Greater grip can need a quicker corner entry and less prolonged handbrake, rather than more braking.
- Wrong-biome grip remains deliberately worse. Identical-state correction avoids confounding faster steering with the stronger initial slide it can create.

These are CPU simulations. They are not visual testing, browser testing or human playtesting. Assertions cover bounded handling behavior, not subjective driving feel or collision-free route completion.
