# Vehicle livery shop

The hangar shop lists all 11 cars vertically. Each keeps its original free base finish and has four preview variants: Neon, Anime, Racing and Biome (Premium on the reward BMW). Tap an option or swipe its row horizontally. Vertical gestures scroll the list.

Preview changes the real parked car and frames it next to the desktop panel or above the phone sheet. All cars can be inspected, including cars not yet unlocked. Car ownership, BMW reward requirements, handling upgrades and career currency are unchanged.

Only the original finish is owned. The additional 44 finishes are locked. Prices and purchase currency have deliberately not been defined, and purchase controls are disabled. No paid livery can be equipped, driven, persisted or sent to other players. Closing the shop, leaving the hangar, rebuilding or losing the graphics context restores exact original materials.

## Artwork and runtime

- Four 1024×1024 WebP atlases per car, loaded only when selected, with a shared cache and four idle textures retained.
- Existing GLB assets and palette UVs remain unchanged. Body triangles receive additional face-projected UVs and an audited paint mask in local memory.
- Wheels, glass, lamps and non-paint surfaces retain the original material behaviour. Original references are restored after preview.
- Both sides have separately authored atlas panels, so English body text is not mirrored. Anime artwork uses an original fictional courier named NOVA.
- These are production adaptations of the previously shown concept styles, not textures extracted from the concept screenshots. Low-poly body shapes and available paint panels determine the final placement.
- Neon uses a modest emissive material value, without extra lights or bloom. Source artwork is kept for provenance but excluded from production output.
- Rspack emits referenced atlases once by content hash. Production builds exclude the separate source asset folder to avoid duplicating the atlases.

## Verification

Run `npm run test:liveries` and `npm run build:all`.

Tests cover the real 11 GLBs, body UV validity, hashes of all 44 atlases, base/wheel/window/lamp preservation, cache/load races and disposal, all options and gestures, modal/input rules, exact camera restoration, mobile/desktop framing and the rotating BMW.

CPU tests and Blender validation renders are separate from browser/WebGL verification. A successful build or geometric projection test does not prove GPU shader compilation or the final browser appearance.
