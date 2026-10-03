# Historical baseline only

On 14 October 2026 the user changed the goal to approximately 10 minutes from start to finish in the final fully upgraded vehicle. Price work was stopped. The counterfactual tables here are withdrawn as current recommendations and must not be applied. New route measurements are needed before a new economy recommendation. No runtime economics were changed.

## Baseline findings

- Frozen 45-bridge/100-hazard route: 12.264 h illustrative seven-car budget at current prices, 56 successful deliveries. This is not a measured human average.
- Final fully upgraded clean run: 31m38.3s alternate /31m49s primary.
- Final typical build clean run: 33m25.85s.
- A now-superseded four-price counterfactual produced 7.735 h /45 successful deliveries, with no compulsory school. It does not address the new 10-minute route target.
- Files below preserve the analysis and sources for later comparison, not an active proposal.

---

# Obstacle economy options

Read-only counterfactual budgets; no production economics changed. The final recommendation is in `final-proposal-ru.md` and takes precedence over the provisional `bridge-only-proposal-ru.md`.

- `model.mjs`: analytical model using already-measured production journeys, unchanged production reward/mission functions, and counterfactual in-memory prices. It does not run physics.
- `bridge-only-results.json` and `.log`: preserved 45-bridge provisional comparison, before final preview-safe bridge positions and moving obstacles.
- `final-hazards-results.json` and `.log`: final combined 45-bridge/100-hazard comparison. `recommendedId` is `price-buffer-b`: last four prices20,000 /25,000 /45,000 /60,000. First six prices remain unchanged.
- Reports include source hashes, scenario assumptions, exact phase bookkeeping, alternative prices, bonus sensitivity, payout cadence, and32 enumerated expert paths over the seven cars with fresh stock measurements.

Reproduce the final recommendation:

`node qa/obstacle-economy-options/model.mjs qa/45-bridge-calibration final-hazards price-buffer-b`

The script asserts exact agreement with the calibration's unchanged-price budget, identical calibration runtime hashes, unchanged economic modules, positive price ordering, nonnegative balances, and zero compulsory study. It reports production changes against the calibration rather than silently treating old timings as new. Do not use the historical bridge-only result as final-release timing.
