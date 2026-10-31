# Production HUD regression check

Build first with `npm run build:all`, then run `npm run test:production-hud`.

`verify-layout.js` is a browser-side verification function. Serve the repository root over HTTP and execute it on a same-origin page, then call `await verifyProductionHud()`. It fetches the actual `build/index.html`, removes application scripts and renders that production markup and its extracted CSS in frames at 12 sizes. It does not simulate a physical phone or a canyon drive.

The check validates right placement and alignment of gas, brake and nitro, viewport containment and absence of overlap with each other or the sound/music column. `before.json` records the original excessive insets; `after.json` records the final passing matrix, including 320×480 and 390×500. Those two compact portrait sizes also reproduced a nitro/music overlap before the compact-layout fix.

The production CSS regression test resolves every non-inline CSS image URL from the stylesheet's own nested deployment path. Before the `assetPrefix: 'auto'` correction, play/pause/close artwork resolved to the missing `static/css/static/image/` directory. Both platform builds now resolve those resources to emitted files.
