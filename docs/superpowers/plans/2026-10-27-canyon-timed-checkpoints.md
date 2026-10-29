# Canyon timed checkpoints implementation plan

> **For agentic workers:** Execute the independent rendering/UI tasks in parallel with the shared controller integration, followed by a source review.

**Goal:** Add nine sequential timed canyon sections with immediate garage return on timeout.

**Architecture:** A small checkpoint controller owns the shared configuration, physical crossing history and remaining time. Canyon mode integrates it independently of scoring; lightweight gates and a separate HUD consume its state.

**Tech Stack:** Existing ES modules, Three.js, DOM/CSS, Rapier frame clock.

**Spec:** User-approved design in this conversation: endpoints 245/635/1035/1440/1850/2300/2760/3220/3688 m; limits 17/22/23/23/19/20/24/24/21 s. Existing canyon and finish behavior is documented in `docs/canyon-drift.md`.

## Constraints

- Preserve the already requested rockfall removal and existing cloud/finish fixes.
- No tests, browser checks or game/physics probes, per the user. Use source review, syntax/diff checks and Yandex/VK production builds.
- Work in the existing `perf-dev-zones` checkout; no additional commit or push requested.
- Reset the budget at each gate, without carrying unused time. Pause stops the clock. Resetting score must not reset the clock.
- Count only short forward crossings on the road, in sequence; use subframe crossing time to resolve deadline ties fairly.
- Keep score eligibility separate. Timed completion retains confetti and the two-second garage return.

## Tasks

- [x] Controller: `dist/canyon-checkpoints.js`; integrate into `dist/canyon-mode.js` and the existing garage return in `dist/app.js`.
- [x] Gates: `dist/canyon-checkpoint-gates.js`; export `createCanyonCheckpointGates(THREE)` returning `{group,setTarget(indexOrNull),dispose()}`. Read `CANYON_TIMED_SECTIONS` entries `{progress,seconds}` from the controller module; reuse the existing final arch.
- [x] HUD: extend `dist/canyon-ui.js`, `dist/index.html`, `dist/canyon-ui.css`, `dist/localization.js`; expose `updateCheckpoint({active,index,total,remaining,distance})`, with zero-based `index` and distance in metres.
- [x] Integration/docs/source review: check ordering, reverse/airborne/teleport rejection, pause, score retry, timeout cleanup, finish, resource disposal and mobile layout.
- [x] Verify modified JS syntax, `git diff --check`, `npm run build:all`; record actual verification limits.

## Execution notes

The user approved implementation directly with «приступай». The recommended fully upgraded-car limits are used uniformly; the timer does not change automatically with upgrades. No test workflow or extra approval round is introduced.

Verification: source review found no confirmed defects; syntax checks for ten changed/new JavaScript modules and `git diff --check` passed. `npm run build:all` completed successfully (Yandex 7.23 s, VK 7.44 s). No tests, browser or gameplay/physics probes were run. Changes remain uncommitted.
