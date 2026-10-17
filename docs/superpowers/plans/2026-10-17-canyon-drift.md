# BMW Canyon Drift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver an optional unlocked canyon drift event with controllable BMW physics, tire effects, Yandex rankings and existing room peers.

**Architecture:** Preserve the renderer and room connection. Delegate the event to focused modules using a separate coordinate region, shared scoring and existing peer rendering.

**Tech Stack:** JavaScript ES modules, local Three.js, Node.js/ws, Yandex Games SDK, Rsbuild.

**Spec:** docs/superpowers/specs/2026-10-17-canyon-drift.md

## Global Constraints

- Ordinary vehicle dynamics remain unchanged.
- The entrance is always visible; genuine saved full-route completion unlocks it, not developer BMW preview.
- The same room connection remains alive and nearby canyon peers are visible.
- No delivery money or brains accrue during the event.
- Use canyonDriftV1, numeric descending with zero decimal places; handle unavailable SDK and authorization explicitly.
- Existing saves remain readable; no forced login or false server-verification status.
- Existing approved VK, assets and economy changes stay intact.

## Review Focus

- Teleport, backwards travel and repeated sectors must not produce ranked points: owned by Task 3 tests.
- Developer preview and old delivery claims must not lift the barrier: owned by Task 2 tests.
- Paused, disconnected and restarted attempts must not publish stale scores: owned by Tasks 3 and 5 tests.
- Room replicas and asynchronous SDK responses must not leak between attempts or accounts: owned by Tasks 5 and 6 tests.
- Tire buffers, geometry and the BMW group must restore after retry/exit/rebuild: owned by Tasks 4 and 6 tests.

### Task 1: BMW control and physics

**Files:** dist/drift-dynamics.js, dist/driving-model.js, dist/vehicle-input.js, dist/follow-camera.js, dist/vehicle-controls.css, dist/index.html, dist/app.js, dist/localization.js, tests/fixtures/app-dom.mjs; tests/canyon-driving.mjs; tests/reward-driving.mjs.

**Interfaces:** Consumes existing createDrivingModel and wheel metadata. Produces brake and handbrake input channels, BMW slipAngle/driftIntensity telemetry and a dedicated BMW tuning profile; ordinary calls retain existing behavior.

- [x] Write tests for independent brake/handbrake, BMW sustained slide and countersteer recovery, frame-rate consistency and ordinary-vehicle regression. Run node --test tests/canyon-driving.mjs; Expected: behavioral failure before implementation.
- [x] Implement BMW-only progressive axle grip, rear-biased drive and steering/recovery control; expose usable telemetry and controls. Repair the historic BMW test's unavailable git dependency using a stable regression fixture.
- [x] Run node --test tests/canyon-driving.mjs and node tests/vehicle-dynamics.mjs; Expected: all pass. Commit feat(bmw): add controlled drift dynamics and braking inputs.

### Task 2: Canyon track and locked entrance

**Files:** dist/canyon-track.js, dist/canyon-scene.js, dist/canyon-entrance.js; tests/canyon-track.mjs.

**Interfaces:** Produces CANYON_TRACK, canyonPointAt(distance), projectCanyon(x,z,history), canyonHeight(x,z), canyonContact(x,z,heading,footprint), createCanyonScene(THREE), createCanyonEntrance(THREE), and canEnterCanyon(career,vehicleId). Track coordinates occupy a region distinct from the main route.

- [x] Write continuity/downhill/footprint tests and main-route proof/barrier collision cases including preview BMW and old delivery claims. Run node --test tests/canyon-track.mjs; Expected: fail for missing behavior.
- [x] Implement the sampled downhill track, asphalt/cliffs/rails, main-road access branch, per-player barrier and route query/pose methods.
- [x] Run node --test tests/canyon-track.mjs; Expected: all pass. Commit feat(canyon): add downhill circuit and progression barrier.

### Task 3: Drift score, records and room verification

**Files:** dist/drift-score.js, dist/drift-record.js, dist/career-save.js, dist/gameplay.js, dist/online-client.js, server/room-server.mjs; tests/canyon-score.mjs, tests/canyon-server.mjs.

**Interfaces:** Consumes projectCanyon and CANYON_TRACK. Produces createDriftScore(), sanitizeDriftRecord(), saved driftRecord, and room start/finish messages for a server-observed run. Score snapshots contain score/combo/valid/finished, and ranked eligibility is explicit.

- [x] Write real-score tests for controlled drift, spins, hits, backwards/repeated sections, teleports, pause and invalid time; save roundtrips; run-start/finish/disconnect verification. Run node --test tests/canyon-score.mjs tests/canyon-server.mjs; Expected: fail for missing behavior.
- [x] Implement bounded monotonic scoring, sanitized local record persistence and room telemetry verification with capped messages and per-connection run ownership.
- [x] Run node --test tests/canyon-score.mjs tests/canyon-server.mjs and node --test tests/cloud-career.mjs tests/online-client.mjs; Expected: pass. Commit feat(drift): score valid runs and persist verified records.

### Task 4: Tire smoke and skid marks

**Files:** dist/drift-effects.js; tests/canyon-effects.mjs.

**Interfaces:** Consumes BMW telemetry, metadata and injected surface height/normal. Produces createDriftEffects(THREE,{height}), with group/update/clear/dispose and bounded buffer counts.

- [x] Write tests for no smoke without slip/contact, rear-wheel positioning, bounded capacity, sloped marks, teleport gaps and cleanup. Run node --test tests/canyon-effects.mjs; Expected: fail for missing behavior.
- [x] Implement pooled soft smoke and fading joined skid segments; reuse existing geometry/materials and reset on discontinuities.
- [x] Run node --test tests/canyon-effects.mjs; Expected: pass. Commit feat(effects): add tire smoke and fading skid trails.

### Task 5: Yandex leaderboard adapter and event HUD

**Files:** dist/yandex-platform.js, dist/canyon-leaderboard.js, dist/canyon-ui.js, dist/canyon-ui.css, dist/index.html, dist/localization.js; tests/canyon-leaderboard.mjs, tests/canyon-ui.mjs; docs/canyon-drift.md.

**Interfaces:** Platform exposes availability, ranking read and submit methods guarded against account changes. createCanyonLeaderboard serializes best-score submissions and handles absent/auth-required SDK states. HUD presents start/running/result/rankings and explicit callbacks for retry/exit/login.

- [x] Write SDK tests for authorized success, anonymous play, missing board, lower score, concurrent submits and account switch; HUD text/safe row rendering. Run node --test tests/canyon-leaderboard.mjs tests/canyon-ui.mjs; Expected: fail for missing behavior.
- [x] Implement current SDK methods, cached top/user entries, explicit optional login, local-result fallback and RU/EN controls. Document exact developer-console setup and verification limits.
- [x] Run node --test tests/canyon-leaderboard.mjs tests/canyon-ui.mjs tests/yandex-platform.mjs; Expected: pass. Commit feat(yandex): connect canyon leaderboard and race interface.

### Task 6: Application integration, room peers and journeys

**Files:** dist/canyon-mode.js, dist/app.js, dist/online-session.js, tests/fixtures/app-dom.mjs, tests/canyon-app.mjs, tests/canyon-journey.mjs, package.json, docs/canyon-drift.md.

**Interfaces:** Consumes all preceding module interfaces. createCanyonMode owns main/canyon transitions, fixed event setup, score/effects/UI, server result confirmation and leaderboard submission; retains the online session and publishes active BMW poses through existing getContext.

- [x] Write actual-app tests for locked gate, valid entry, fixed setup, suppressed payouts, retry/exit/rebuild cleanup, stale finish/account responses and room retention. Run node --test tests/canyon-app.mjs; Expected: fail for missing integration.
- [x] Integrate the entrance with main collision queries; swap the active environment/BMW, surface/camera/effects and HUD. Keep room peer transforms and increment teleportId on all transitions. Suspend advertising during event/result states.
- [x] Run node --test tests/canyon-*.mjs, npm run test:biome-progression, npm run test:platforms and npm run test:online. Run physical canyon journeys and two real browser clients in the same room, portrait/landscape screenshots and both production builds. Expected: new/focused suites pass and visible nearby replicas; record the known legacy npm test failures separately.
- [x] Commit feat(canyon): integrate drift event with rooms and progression. Run final independent review; fix important findings with regression tests and commit. Preserve the separate branch and report commit/push/console setup status precisely.
