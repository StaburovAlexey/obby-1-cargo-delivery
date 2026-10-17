# BMW canyon drift

Approved scope: the conversation's analysis followed by the user's instruction to implement, commit the existing work, push it, and then create a separate branch. The user additionally requires a Yandex leaderboard, the existing room's visible players on the canyon, and an entrance that is always visible but blocked by a barrier until the main route is completed.

## Player experience

- The entrance branches off near the beginning of the delivery road. Everyone sees the road, signs and barrier. A saved, genuine full-route completion opens the barrier. Developer BMW preview does not qualify.
- A qualified player approaches the entrance in the reward BMW and starts a canyon attempt. Other vehicles do not start an attempt. The same room connection remains alive; other nearby canyon drivers are visible using existing interpolated vehicle replicas.
- The canyon is an optional downhill asphalt event, approximately 1.6–2 km and 2–3 minutes, with broad bends, linked turns and hairpins. Each attempt uses the same BMW setup and a full tank. Deliveries and cash/brain generation are suspended on the event.
- Driving includes distinct throttle, brake and handbrake inputs. Touch controls remain usable with two hands. BMW supports progressive initiation, countersteering, transitions and recovery. Ordinary vehicle dynamics remain unchanged.
- BMW generates bounded soft tire smoke and surface-aligned fading skid marks from actual slip and contact, both on the main route and canyon. Pauses, resets and teleports cannot connect distant skid segments.
- Points reward controlled forward drift along the route, including linked-turn combos. Spins, impacts, leaving the road, reversing, teleporting and repeating already traversed route sections cannot farm points. Only completed valid runs can enter the public leaderboard.
- Results offer retry, return to the hangar and Yandex rankings. Local best survives cloud saving. SDK/authorization/network errors leave the local result usable and show an explicit status. No login dialog opens without a player action.

## Architecture

- Keep the current Three.js renderer and room. Put the canyon in a distinct world coordinate region, outside main-route and remote-visibility bounds. Swap visible environment groups and the active BMW model on event entry; preserve the existing room and increment teleportId on transitions. This retains the existing wire state and interpolator without a protocol migration.
- New focused modules own BMW tuning, canyon geometry/projection, entrance, scoring, tire effects, Yandex rankings and event integration. app.js delegates the event lifecycle instead of implementing its internals.
- Share deterministic score rules with the room server. Server-side progression/time checks confirm ranked completion from observed telemetry. Client-side Yandex setScore remains subject to the SDK's trust model; this does not claim cryptographic anti-cheat. Offline attempts retain local records and do not pretend to have server confirmation.
- Use current ysdk.leaderboards.setScore/getEntries/getPlayerEntry and isAvailableMethod. Technical name: canyonDriftV1, numeric, descending, zero decimal places. The developer console must contain this board before live requests succeed.
- Existing career v2 remains readable; add an optional sanitized driftRecord for canyon-v1 results. No conversion of delivery claims to full-route proof and no unlock via developer access.
- Pause/ads do not score. Defer interstitials while an attempt or its results are active. Do not make unrelated changes to purchases, VK payments or delivery economy.

## Verification and delivery

- Cover BMW recovery and input independence; full-route unlock and collision barrier; track continuity, grade and footprint clearance; score farming and invalid runs; save roundtrips; server validation; SDK auth/error/concurrency; bounded effects and cleanup; real app entry/retry/exit; two room clients with visible canyon replicas.
- Exercise 30/60/120 Hz, touch portrait/landscape, both steering directions and slopes. Inspect real rendered browser screenshots and perform real physics journeys on the canyon.
- Run the existing relevant vehicle, progression, online/platform suites and both builds. Report the pre-existing five physics-app-integration failures separately if still present; do not claim the full legacy npm suite passed.
- Commit logical changes on codex/bmw-canyon-drift. The initial three checkpoint commits were pushed on codex/yandex-vk-builds before branch creation. No merge is requested.
