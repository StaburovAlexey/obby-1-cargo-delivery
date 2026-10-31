# Yandex Games 1.71.0 — 30 October 2026

Game: [631371 — Обби: доставка груза +1](https://games.yandex.ru/console/application/631371#application-info-draft).

PASS: production archive uploaded, processed (both processing indicators green), and saved in the draft. Cabinet version is `1.71.0`, last saved 30 October 2026 at 17:45:56 Moscow time, unpacked size 54.68 MiB, archive file ID `14333781`. This is a saved draft, not a moderated public release.

PASS: the hosted draft was opened through the cabinet's debug link. Its entry script `static/js/index.99efa84b37.js` matches the local production build. The game initialized the real Yandex SDK, reported readiness, opened the new local-best/next-vehicle panel, stopped Gameplay API while that panel was open and resumed on close. No warning/error entries were returned by the browser log during this check. The ordinary draft URL initially served the previous version before the updated archive propagated.

## Delivered behavior

- BMW E30 / Cadillac 75 / Koenigsegg One:1 / Phoenix Interceptor unlock at 10,000 / 25,000 / 35,000 / 45,000 points in a single finished canyon run. BMW still requires main-route completion. No score spending or cross-run accumulation.
- Ownership is canonical on save/load, existing valid bests qualify, and cloud conflicts preserve the best completed result. Development overrides remain session-only.
- Cars display their drift-score requirement, with a check after unlock. The hangar rating panel shows the local best and next target. The finish receipt opens after returning to the hangar with the score and newly awarded cars.
- Multiplier increases produce an elastic pulse, gold highlight and an 800 ms caption. Existing score computation, position and fade are preserved. Reduced-motion CSS keeps static feedback.
- Paid livery product names now contain the actual vehicle name, avoiding `[object Object]` in product metadata.

## Store

PASS: eleven new product IDs imported into the cabinet, with Russian and English titles/descriptions, status “Активная”, price 39 in the cabinet's portal currency. Import confirmation reported success; the English Pickup/Biome product card was checked after import. Six existing character and four neon products were preserved, for 21 total.

Import file: [new-products-2026-10-30.csv](../../publishing/yandex/inapp/new-products-2026-10-30.csv). Its IDs match `PREMIUM_COSMETIC_PRODUCTS`: nine `livery_*` products and `tracks_rainbow` / `tracks_lightning`. Nitro uses earned game currency and XP and needs no portal product ID.

BLOCKED: the cabinet still reports “Покупки не подключены”. Adding active products does not activate payments. No real payment was attempted. Connection depends on the developer's cooperation/licensing status, as described in [the official purchase setup documentation](https://yandex.ru/dev/games/doc/ru/console/purchases). The portal-currency exchange rate is dynamic; 39 in the cabinet is not a fixed promise of 39 RUB.

## Verification

PASS:

- `npm run test:drift-progression` — 30/30.
- `npm run test:nitro` — 57/57.
- `npm run build:all` — both Yandex and VK production builds succeeded.
- `node --check` for app, canyon mode and hangar UI; `git diff --check`.
- Production bundle audit — seven PASS, no blocking findings: 241 files, local references resolved, SDK present, no filesystem paths, insecure HTTP URLs or source maps.
- ZIP integrity check succeeded. Source audit's filesystem-path finding referred to development/output artifacts excluded from the production bundle.
- Browser UI harness: multiplier pulse/color/caption, 800 ms expiration, English caption, and mobile result panel at 390×844 with no horizontal overflow. This is interface validation, not a physical canyon drive on a phone.
- Independent scoped code review: no important findings; reviewer also ran 20 new focused tests successfully.

WARNING: the repository's full `npm test` remains red at `tests/driving-camera-cadence.mjs`, “real application frames keep a steadily driven car stable relative to its follow camera”, reporting speed 21.0200595856799 against its old expected range. Eight tests passed before that suite stopped. This pre-existing failure was not changed.

WARNING: adjacent legacy tests remain stale: four `cloud-career.mjs` migration expectations and `canyon-score.mjs`'s old partial-track finish expectation. The broad canyon run also encountered historical catalog/vehicle/sign/transition fixtures and was performed while the fixture dependency wiring was changing; it is not a final green-suite result. New scoped suites above passed after integration.

MANUAL: a physical phone, every declared device/orientation, actual payments and full ad scenarios were not certified by this check. No moderation submission was made.

## Artifact

Archive: `output/yandex-1.71.0-drift-20261030.zip` (about 49 MiB compressed).

SHA256: `9881b40102988c55524356a37968f717578a35da73341847c8aa2f507bbf5db5`.

Build/test logs for this session: `/tmp/drift-release-build.log`, `/tmp/drift-release-focused.log`, `/tmp/drift-release-nitro.log`, `/tmp/drift-release-npm-test.log`, `/tmp/drift-release-bundle-audit.log`.

Worktree remains on `perf-dev-zones`. No Git commit or push was requested or performed. The user's existing development server was left untouched; the temporary HTTP server on port 8793 was stopped after checks.
