# Vehicle livery shop

The hangar shop lists all 11 cars vertically. Each keeps its original free base finish and has four preview variants: Neon, Anime, Racing and Biome (Premium on the reward BMW). Swipe its row horizontally; the carousel wraps in both directions. Vertical gestures scroll the list.

Each car has a reusable circular 3D carousel showing the current and adjacent textured models, with a Select button below. There are no visible labels, captions, arrows, dots or card backgrounds. Horizontal dragging animates the models around an orbit; keyboard arrows and Home/End remain available. All cards share one WebGL context; only visible cards render. Preview never changes the parked car or the hangar camera. Only Select can confirm the standard finish. All cars can be inspected, including cars not yet unlocked. Car ownership, BMW reward requirements, handling upgrades and career currency are unchanged.

Only the original finish is owned. The additional 44 finishes are locked. Prices and purchase currency have deliberately not been defined, and purchase controls are not displayed. No paid livery can be equipped, driven, persisted or sent to other players. Closing the shop, leaving the hangar or rebuilding cancels pending preview requests and disposes the isolated renderer. No preview is saved or applied by closing.

## Artwork and runtime

- Four 1024×1024 WebP atlases per car, loaded when the car becomes visible, with a shared cache and four idle textures retained.
- Existing GLB assets and palette UVs remain unchanged. Body triangles receive additional face-projected UVs and an audited paint mask in local memory.
- Wheels, glass, lamps and non-paint surfaces retain the original material behaviour. Original hangar resources are never modified by preview.
- Both sides have separately authored atlas panels, so English body text is not mirrored. Anime artwork uses a different original fictional character for each car.
- These are production adaptations of the previously shown concept styles, not textures extracted from the concept screenshots. Low-poly body shapes and available paint panels determine the final placement.
- Neon uses a modest emissive material value, without extra lights or bloom. Source artwork is kept for provenance but excluded from production output.
- Rspack emits referenced atlases once by content hash. Production builds exclude the separate source asset folder to avoid duplicating the atlases.

## Production URL regression

Rspack rewrites the dynamic asset URL expression into a context module returning a URL string. Reading .href from that compiled string caused TextureLoader to receive undefined. String(new URL(...)) supports both the native source URL object and the compiler result. The production regression compiles the real module, executes its compiled URL function, and serves all 44 emitted atlases over HTTP, verifying status, MIME, WebP magic and authored hashes. The old expression fails that same test.

## Verification

Run `npm run test:liveries` and `npm run build:all`. See [carousel architecture](vehicle-livery-carousel.md).

Tests cover the real 11 GLBs, body UV validity, hashes of all 44 atlases, base/wheel/window/lamp preservation, cache/load races and disposal, all options and gestures, modal/input rules, unchanged hangar camera and materials, isolated rotation, Select ownership gates, fast swipe races, hidden-tab pause and close/reopen disposal.

CPU tests and Blender validation renders are separate from browser/WebGL verification. A successful build or geometric projection test does not prove GPU shader compilation or the final browser appearance.
