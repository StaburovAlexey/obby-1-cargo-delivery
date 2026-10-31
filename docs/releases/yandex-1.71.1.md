# Yandex Games 1.71.1 — 31 October 2026

FIXED: physical drift-car order moving away from the first BMW is now BMW E30 → Cadillac 75 → Koenigsegg One:1 → Phoenix Interceptor. The same cars retain requirements 10,000 / 25,000 / 35,000 / 45,000. Podiums, vehicles, colliders, approach markers and price anchors use the corrected positions; save IDs and catalog indexes are unchanged.

FIXED: production CSS backgrounds for play, pause and close no longer point to `static/css/static/image/…` (HTTP 404). Rsbuild now calculates stylesheet-relative resource paths via `output.assetPrefix: 'auto'`; Yandex and VK extracted CSS resolve correctly under nested deployment URLs.

FIXED: gas, brake and nitro share one right inset. The unnecessary 80 px compact-portrait and 120 px landscape shifts were removed. On short wide layouts the inset only reserves the actual width of the sound/music column. On compact portrait layouts the pedal stack is shorter and lower, keeping nitro below music without moving it toward the center.

FIXED: drift-car requirement labels contain no coin artwork. The SVG was removed from reward-car labels rather than relying on the non-reflecting `SVGElement.hidden` property. Ordinary vehicle prices retain their coin icons. The hangar rating window retains local best / finish score / awarded cars and online rankings, with no next-car or remaining-points block.

PASS: `npm run test:production-hud` — 7/7; `npm run test:drift-progression` — 30/30; adjacent real-scene garage checks — 4/4. Both production builds pass, as does `git diff --check`. The compiled-CSS browser matrix passes at all 12 sizes in [after.json](../../qa/hud-production/after.json). This validates layout rather than physical-device performance.

PASS: build audit — seven checks pass, no blocking bundle findings. The source and build do not alter BMW handling or drift scoring.

WARNING: full `npm test` still stops on the known `driving-camera-cadence.mjs:37` old speed assertion (21.0200595856799); eight passed, one failed. This pre-existing failure was not modified.

Archive: `output/yandex-1.71.1-hud-final-20261031.zip`.

SHA256: `f74d244b7e715ac39a26f4757e31d489e1467b281cb36864962d34f992a64358`.

PASS: final archive saved in game `631371` as version `1.71.1`, archive file ID `14345285`. Processing completed at 17:49:17 Moscow time on 31 October 2026. The hosted draft serves entry `static/js/index.45a2a05b21.js`, matching the final local bundle. This is a draft update, not a moderation submission.

PASS: the actual hosted draft renders the rating panel without the next-car block. The four drift requirement rows contain no coin SVGs. The close artwork visibly renders and its computed URL resolves to the deployment's `static/image/close.5eadaba7cb.webp`, rather than the former missing CSS subdirectory. Screenshot: `output/playwright/hud-fix/yandex-1.71.1.jpg`.

No Git commit or push was requested. The user-requested `npm run dev` on port 8083 remains running.
