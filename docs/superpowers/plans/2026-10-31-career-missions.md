# Career Missions Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task. User authorized implementation with «Приступай»; execute inline in the current checkout.

**Goal:** Implement the approved 35 permanent missions, manual rewards, sorted dialog and HUD notification.

**Architecture:** Pure mission catalog/progress helpers use canonical career facts and a small `missions` save block. Gameplay owns counters and atomic claims; the existing retention dialog renders stable keyed cards and shares the HUD notification animation.

**Tech Stack:** Existing JavaScript ES modules, HTML/CSS, Rsbuild, Yandex/VK cloud career.

**Spec:** `docs/superpowers/specs/2026-10-31-career-missions.md`

## Global Constraints

- Current `perf-dev-zones` checkout; preserve all pre-existing changes. No commit/push or publication.
- User approval to implement supersedes further plan approval stops; use the existing in-place workflow.
- Preserve standing no-test-execution instruction recorded in the eight-car plan. Add focused regression coverage, defer execution; validate syntax, static contracts and production builds.
- Keep career version 3. Mission version 1; manual one-time rewards, no legacy automatic mission payout.
- All 35 amounts/conditions follow the spec. No vehicle model names in visible RU/EN mission text.
- Three-hour target concerns first main-route finish only; do not claim measured completion time.

## Review Focus

- Old saves without missions retain economy and ownership; legacy cycle state does not fabricate progress.
- Claims and wallet must survive one snapshot; duplicate clicks and failed writes cannot repeat payout.
- Count non-record canyon finishes, actual nitro activation and unboosted active study seconds.
- Ready cards sort first; claim order survives reload; hidden/paused/developer events grant no progress.
- Dynamic cards must translate, preserve keyboard focus/scroll and keep the icon badge after dialog close.

### Task 1: Catalog, derivation and persistence

**Files:** `dist/career-missions.js`, new `dist/mission-progress.js`, `dist/career-save.js`, `tests/career-missions.mjs`.

**Interfaces:** `CAREER_MISSIONS` immutable definitions; `freshMissions()`, `sanitizeMissions(value)`, `getCareerMissions(career)` return sorted views with `id/name/description/target/progress/cash/brains/status`; claim order follows `claimedIds`.

- [x] Add focused regression cases for catalog totals, model-free copy, migration and sorting.
- [x] Replace cyclic definitions with the 35 approved definitions; retain legacy retention sanitization only for compatibility.
- [x] Add canonical mission save block and derive existing facts without duplicating ownership or best score.
- [x] Check syntax and statically review malformed data and repeated canonicalization. Test execution deferred.

### Task 2: Gameplay events and atomic claiming

**Files:** `dist/gameplay.js`, `dist/canyon-mode.js`, focused mission regression coverage.

**Interfaces:** `getCareerMissions()`, `claimCareerMission(id)`, `recordCanyonFinish(result, attemptId)`; existing best-record API remains intact.

- [x] Add regression cases for one-time claims, failed-write reloads, study/nitro counters and non-record finishes.
- [x] Save `missions` in gameplay snapshots; increment only legitimate successful events, excluding developer/test sessions.
- [x] Remove automatic cyclic payout/skip; atomically update wallet and ordered claim IDs.
- [x] Count all valid canyon finishes once per attempt without changing best-record/unlock behavior.
- [x] Check syntax and review all event/persistence boundaries. Test execution deferred.

### Task 3: Dialog, notification and localization

**Files:** `dist/retention-ui.js`, `dist/index.html`, `dist/progression-ui.css`, `dist/ui-icons.css`, `dist/app.js`, `dist/localization.js`, relevant DOM fixtures and focused UI coverage.

**Interfaces:** `createRetentionUi(..., {onClaimMission})` consumes mission views from gameplay; `.has-claimable-missions` shares existing pulse/badge.

- [x] Add focused cases for sorted cards, repeated claim input, persisted badge and RU/EN copy.
- [x] Replace the single-mission markup with a keyed scrollable card list and pinned dialog heading.
- [x] Wire claim callbacks, focus trap and stable scrolling; ready → in-progress → claimed order comes from the shared helper.
- [x] Extend the existing HUD badge/pulse and reduced-motion selector; update help, receipt and both languages.
- [x] Check syntax and statically review desktop/mobile styles and dynamically created translations.

### Task 4: Integration and review

**Files:** focused fixtures/coverage, specification and this plan.

- [x] Check changed JS syntax, whitespace and mission table parity.
- [x] Build Yandex and VK production targets without running tests or starting another dev server.
- [x] Request one independent read-only review of this task's delta; fix material findings.
- [x] Record verification results, mark plan complete and report runtime/time-budget limits. No commit/push.

## Execution ledger

- Initial decision: work in place because the approved feature extends the existing dirty career/runtime and must be visible to the user's dev server.
- Initial decision: no tests executed under the standing project instruction; test files may be added for later execution. No TDD red/green claim is made.

## Verification and completion

- All four implementation tasks are complete. Work remains local in the existing checkout; no commit, push or publication.
- Fresh syntax checks passed for 19 changed/new JavaScript files. Task-specific whitespace checks against pre-feature snapshots passed; HTML IDs are unique.
- All 35 catalog entries exactly match the approved IDs, text and reward amounts; translation keys exist for all names and descriptions.
- Final production builds passed: Yandex 4.20 s, VK 4.05 s. These durations describe compilation only.
- Independent read-only review found and then re-reviewed fixes for practice-score eligibility and final volcanic-delivery history. A follow-up review found no remaining material integration issues in migrated tests/fixtures.
- Existing non-mission test callers and mission/receipt/localization fixtures were migrated to the new APIs and markup. The historical seven-hour repeating-mission budget was removed from the current retention command; its source remains as a historical artifact.
- Application tests, browser checks and driving/time-budget probes were not executed, honoring the standing instruction. Added coverage is unexecuted, not a reported passing suite. The three-hour main-route target remains unmeasured.
