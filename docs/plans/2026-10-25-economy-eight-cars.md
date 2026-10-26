# Eight-car career economy implementation

User approved implementation after the in-chat numerical design. Work in the current `perf-dev-zones` checkout so the user's development server sees the changes. Do not commit or push. Do not execute tests: the user's standing instruction explicitly overrides test-running skill steps. Validate syntax, production builds, static contracts and independent code review; report the runtime verification limit.

## Requirements

- Keep eight ordinary vehicles: pickup, citycourier, rover, van, desertscout, snowrunner, lavacrawler, ashhauler. Remove foresthauler and snowgrip from the playable ordinary catalog/layout; preserve their asset files. Prices: 0/1300/3200/10000/16000/30000/40000/55000. Income: 1..8 brains per moving second, selected ordinary vehicle only. All ordinary stock stats identical: 100 km/h, capacity 100, range 300 m, handling/grip .5, acceleration 11/1.8. Preserve reward BMW/showcase drift physics and unlocks.
- Sequential purchases, including development sessions for ordinary cars; unowned ordinary models black like locked showcase models. Reward BMW remains development-accessible; showcase developer unlock remains manual.
- Shared ordinary upgrades across all eight cars, 10 levels, speed/acceleration +5% base, handling (stability) +5%, grip +4%. Canonical saved `sharedUpgrades`; runtime `upgrades[id]` ordinary entries alias the same object so existing physics/HUD readers work. Reward-specific levels remain separate, preserving their legacy modifier scales and drift feel.
- Exact price arrays and range curve live in `dist/economy-balance.js`. Approved fuel levels F0..F10: 300/380/470/600/750/850/1050/1600/2100/2900/4700 m. With supported tyres, refuelling and no fuel-loss penalties, the corresponding furthest reachable delivery numbers are 2/4/6/8/10/11/12/13/14/15/16: each upgrade adds one or two destinations without a plateau. Fuel is distance-based; speed cannot bypass range. The last station-to-finish leg is ~3976.5 m: F9 cannot finish, while F10 has 4230 m after one loss of 10% of full-tank capacity, leaving ~253.5 m for the approach and trajectory variation. This is an arithmetic balance target, not a driving guarantee or proof of a three-hour completion time. Preserve station/delivery positions and the 100-unit stock tank; global fuel upgrades update capacities consistently.
- Global cumulative tyre tier0..4, brain prices 0/1000/4500/12000/21000, sequential purchase, accessible on first car. Supported biome depends on tyre tier instead of vehicle specialty. Preserve wrong-biome speed .75, handling .75, fuel gap+1 and traction penalties. No artificial tyre hard gate on driving/delivery. Shared grip/handling cannot replace correct tyres.
- Preserve speed-induced skid. Standard vehicle extra-speed demand based on ACTUAL speed / stock terrain cap across +0..50%; grip progress over +40%, handling over +50%; deficits max(0,demand-progress). Keep separate 1.10 steering/stiffness assist bound; do not change it to1.50. Same shared helper in arcade/Rapier prevents drift. BMW/showcase keep legacy behavior.
- Schools buy sequentially with one-time coin prices0/1500/6000/18000/45000 and foreground-passive XP rates1.5/3/5/8/12. Deliveries/missions retain existing rewards. No offline earnings or vehicle-income stacking.
- Career schema version3/new local key, no migration. New fields must round-trip local/cloud, reset unsupported pre-release career saves without breaking startup. Preserve platform purchase handling/settings.
- Advertising requests after120 active gameplay seconds following completion, existing2-second warning/safe-position deferral/pause during warning/ad and resume behavior preserved. No RV multiplier implementation (it was optional). Platform may refuse shows.
- Update shop, upgrade, tyre and help UI to match current rules. No stale biome-local-car purchase requirement. Show cumulative tyre ownership and sequential locks clearly. No road lengthening. Three-hour completion is balance target, not a proven runtime claim.

## Tasks and ownership

1. Controller: central balance constants, eight-car catalog, advertising120, documentation/coordination/integration/build/audit.
2. Physics worker: `vehicle-upgrades.js`, `driving-model.js`, `rapier-vehicle.js`. Implement shared balance APIs, keep getUpgradeOffer signatures, getUpgradeModifiers(levels, vehicleId) optional vehicle id, helper speed stability demand, standard fuel range and legacy reward modifiers.
3. Career worker: `career-save.js`, `cloud-career.js`, `gameplay.js`, `biome-surfaces.js`, `biome-progression.js`, `progression-config.js`. Canonical shared save/aliases, tyre tier/API, income, sequential purchases and surface compatibility. Public additions: `state.sharedUpgrades`, `state.tyreTier`, `getTyreOffer(tier)` and `buyTyres(tier)` on gameplay. `biomeSurfaceAt(progress,id,tyreTier=0)`; normal cars default city tier, reward surfaces legacy.
4. UI worker: `app.js`, `garage-scene.js`, `progression-hud.js`, `biome-travel.js`, `retention-ui.js`, relevant HTML/CSS/localization/help. Integrate tyre shop into existing upgrade menu, propagate tyre tier to all surface calls, black unowned models, shared labels and sequential hints, removed cars leave compact display line.
5. Controller and independent reviewer: integration static audit, production build(s), resolve findings, final requirement-by-requirement audit. No test execution or publication.

## Interface checks

| Producer | Consumer | Contract |
|---|---|---|
| Controller balance config | Physics/career/UI | All numeric constants central; tyre id equals biome id; tier0..4 |
| Physics upgrades | Career/save/app/UI | Existing performance/offer API maintained; standard runtime levels shared; reward modifier selection receives vehicle id |
| Career | UI | getTyreOffer returns tier/name/price/owned/purchasable/reason; buyTyres emits tyre-purchase/tyre-purchase-denied |
| Surface profiles | App/gameplay/physics | Explicit current tyre tier at all live normal-vehicle calls; default0 is safe |
| Career save | Cloud envelope | Version3 supported; old saves reset, do not throw initialization error |

## Rulings

- User authorization to implement the reviewed in-chat plan supersedes additional spec/plan approval stops. This document records that approved scope and routine decisions.
- Work in place rather than create a new checkout: active task explicitly requires current worktree authoritative and user's existing dev workflow must see changes.
- No tests run or commits created despite skill defaults; use build and review evidence only and disclose limits.
- Parallel workers have disjoint file ownership and explicit interface contracts; root handles integration.
- Preserve reward-specific drift upgrade behavior rather than applying normal-car 50% speed changes to canyon vehicles.
- School prices/rates follow the approved sequential-class proposal; voluntary rewarded booster remains excluded.

## Implementation review

- Eight ordinary cars, sequential purchases and black locked models are implemented; both removed model asset files are retained.
- Canonical shared upgrades and tyre tier persist in v3 local/cloud careers. Old earned progression resets; settings and paid cosmetic ownership caches are retained.
- Both physics engines consume the same actual-speed stability demand. Ordinary maximum governor accepts 150 km/h; reward physics and original upgrade-price positions are preserved.
- Fuel consumes path distance, including reverse/sideways motion. Speed does not extend range. Capacity increases preserve the amount already burned; a fuel upgrade adds only its capacity increase. The upgrade card shows range in metres.
- The approved follow-up tank curve starts at 300 m and reaches 4700 m at F10, preserving 100-unit stock capacity and the current stations/destinations. Static arithmetic gives reachable delivery numbers 2/4/6/8/10/11/12/13/14/15/16 for F0..F10 with supported tyres, refuelling and no fuel-loss penalties. F10 covers the final leg with one 10%-tank loss; F9 does not cover the clean final leg. Help and English translation keys use the revised 300–4700 m range.
- Tyre shop, shared-upgrade labels, help and English translations reflect the new rules. Class entry prices/rates follow the approved sequential-class proposal; selected-car moving income remains applied.
- Advertising uses one shared 120-second active-play interval in the controller and application safety gate, retaining the existing two-second pause/countdown and safe-location deferral.
- Independent static reviews covered physics/fuel, career/save/tyres and UI/advertising. Reward upgrade-price drift and paid-neon cache loss during old-save reset were fixed and reviewed again.
- JavaScript syntax and whitespace checks passed. Yandex and VK production builds passed. No tests, browser sessions or driving probes were run, following the user's instruction. The three-hour progression target and actual handling remain unmeasured.
- No commit, push or publication performed.

## XP presentation and sequential schools

- Display currency is XP throughout the HUD, study, tyres/upgrades, delivery receipts, missions and both languages. Existing `brains` persistence/API fields remain internal so earned balances retain their save contract.
- Replace the brain sprite and book brain with a blue XP badge; ordinary vehicle labels show their actual 1..8 XP/s income before and after purchase. Reward/drift vehicles show 0 XP/s, matching their existing income exclusion.
- Sequential school purchases are enforced in gameplay and reflected by prerequisite hints/disabled purchase buttons. Ownership is permanent and only the selected class produces XP.

## Ordinary high-speed control correction

- Bought stability quickens the road-speed steering rack, with the same function in arcade and Rapier; suitable tyres and ordinary forward driving gate the added assistance. Full stability removes the residual speed-load rack penalty. Stock controls, reverse, and wrong-tyre control paths retain their prior response.
- A shared grip multiplier compensates the squared-speed lateral demand over the part of the speed range supported by bought grip. It multiplies ordinary tyre capacity and lateral stiffness once, using actual speed; no extra compensation applies at stock speed, G0, reverse, unsupported tyres, or reward vehicles. Existing rear-slip dynamics remain force-based.
- Rear grip recovery now uses the complete ordinary +40% grip range, so levels6–10 improve recovery instead of hitting the previous +20% cap.
- The separate steering/stiffness assistance bound remains1.10. Reward BMW/showcase tuning, prices and drift controls are preserved. Static/build verification does not prove live handling; no driving probes or tests are run under the standing instruction.
