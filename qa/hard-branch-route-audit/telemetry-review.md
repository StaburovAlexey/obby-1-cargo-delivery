# Optional hard-branch qualification audit

## Result

All four forks already have a measurable harder branch: `main`, the positive
ridge/right-hand arm. The `alternate` arm is the easier valley route. No runtime
geometry change is necessary.

The actual `routePointAtProgress` samples give:

| Fork | Main / alternate ascent | Main / alternate peak grade | Main extra ascent |
| --- | --- | --- | --- |
| Forest | 14 / 12 m | 7.24 / 6.21% | 16.7% |
| Desert | 24 / 18 m | 8.30 / 6.22% | 33.3% |
| Snow | 18 / 15 m | 6.72 / 5.60% | 20.0% |
| Volcanic | 24 / 20 m | 8.38 / 6.98% | 20.0% |

Main also has more road over 5% grade at every fork. Curvature, total planar
turning, and planar path length are mirrored and effectively identical. These
are geometric challenge measures, not a measured failure-probability claim.

Run `node tests/hard-branch-route-audit.mjs` to regenerate `report.json` from
the current route API. The test requires at least 15% more ascent and RMS grade,
one percentage point greater peak grade, and more road over 5% grade. It changes
no runtime or economy files.

## Traversal telemetry recommendation

1. Scope state to the current live, loaded cargo `run.id`. Keep a set of attempted
   fork IDs and a set of completed hard-fork IDs. Start with neither earned. A
   delivery farther along the road, a bridge, a route-distance total, or merely
   entering a fork must never set hard-route eligibility.
2. Observe after the model has moved and bridge-fall support has been resolved,
   but before `gameplay.drive` can deliver. Require driving mode, a loaded run,
   no preview/test mode, no fall, and a valid finite position and simulation
   interval. Take displacement from `model.state.pathDistance`, not throttle,
   wheel spin, or route arc distance.
3. Require a continuous forward crossing of `fork.from`, with a preceding real
   driving sample before the entry. Creating telemetry in the middle of a fork
   cannot count. Mark that fork attempted immediately, including an easy or
   later-aborted traversal, so backing out cannot start a second attempt in the
   same run. A different later fork can still qualify.
4. Keep branch ambiguity out of the shared fork tips. Use the safe distinct
   interior from `splitOverlapEnd + 24` through `mergeOverlapStart - 24`. Lock
   `main` only while actually on the corresponding `${fork.id}-main` edge in this
   distinct section; require the same edge throughout it. Easy traversal must
   finish without qualifying. The report records all four interior ranges.
5. Require ordered entry, complete continuous interior coverage, and forward exit
   through `fork.to`. Do not use three independent flags collected in arbitrary
   order. Track a monotonic progress high-water mark, with at most a small
   projection-jitter allowance (for example 0.25 m), and require the current
   progress never to fall farther below that high-water mark. Count only newly
   covered progress. This avoids granting progress for repeated short forward
   and reverse motion. Coverage must be contiguous, not just total distance or
   three visited points.
6. Validate every displacement: all values finite; world straight-line movement
   cannot exceed actual integrated path distance plus numeric tolerance; actual
   path distance cannot exceed the conservative physical maximum times the
   physics interval plus one fixed-step carry allowance. A render frame can
   consume an accumulated physics step, so using only render delta with no
   fixed-step allowance can reject legitimate high-refresh driving. On these
   straight-backbone forks, forward progress increase cannot exceed actual XZ
   travel plus projection tolerance. Check road membership, plausible offset,
   and support so a stale projection on the opposite arm cannot count.
7. A discontinuity or explicit teleport should taint bonus eligibility for the
   loaded run; do not silently create a new valid predecessor at the destination.
   Clear/reinitialize only at genuine new cargo-run entry. Garage return,
   preview, respawn, fall, reset, and run-ID changes must clear stale attempts and
   completed IDs. A pause with unchanged pose need not lose earned progress;
   movement across a pause is not assumed valid.
8. Completing at least one unique qualified hard branch can enable the single
   approved +15% modifier for that run. Do not stack +15% per sample, per bridge,
   per repeat, or per additional fork. Commit the modifier only with successful
   loaded-cargo delivery. Fuel-empty/fall/abandoned runs must not cash it out.

## Regression cases for the runtime owner

- Full main entry → interior → exit qualifies exactly once at each fork.
- Full alternate traversal never qualifies, including the final delivery.
- Main entry or midpoint alone, partial exit, or missing entry never qualifies.
- Reverse traversal and easy-forward/hard-backward loops never qualify.
- Easy-forward, rewind, then hard-forward cannot retry the same fork.
- Stop/idle does not advance; small projection jitter cannot manufacture coverage.
- Wrong interior edge, off-road median, skipped interior, and implausible jumps
  invalidate the attempt.
- Teleport to entry/midpoint/exit or across a paused frame never qualifies.
- Repeated completed-fork samples and several hard forks do not stack rewards.
- Preview/test, fall, empty fuel, garage reset, and a new run cannot leak credit.
- A legitimate pause, high-refresh zero-substep frame, and fixed-step carry do
  not accidentally award progress or reject normal continuous driving.

## API cautions

Both fork edges intentionally expose the same canonical `length`, because the
shared arc table is constructed from the main branch. Sample the geometry when
measuring actual challenge. `main` and `alternate` are the real branch IDs;
`primary` currently falls back to `main` but is not a separately declared branch.
Projection history can intentionally restrict candidate edges; a plausible
`edgeId` is not by itself evidence the vehicle physically stayed on that arm.
