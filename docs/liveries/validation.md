# Vehicle livery asset and mapping validation

Validated 2026-10-19. Runtime art and mapping are frozen at the hashes below.

## Deliverable

- 44 shipping WebP atlases: 11 vehicles × Neon, Anime, Racing, Biome.
- Every shipping texture is 1024 × 1024, total **3,041,872 bytes** (approximately 2.90 MiB).
- Source GLBs and original palette images are unchanged. No duplicate vehicle GLBs are added.
- Base restores the exact original geometry and material references, including the existing BMW gold reward finish.
- B/Anime uses original AI-generated fictional courier **NOVA**, repeated as a consistent family across the 11 cars. Each vehicle has its own surrounding palette and graphics. This is a production adaptation of the concept direction, not a pixel-for-pixel transfer of the various concept-sheet characters.
- All authored on-car text is English or numbers: NOVA, APEX, MOTORSPORT, CITY, FOREST, 01–11. Cyrillic concept-sheet headings are not included in the atlases.
- Source artwork and generation provenance are kept under `dist/assets/liveries/source-art/` for reproducibility and excluded from the production build.

## Runtime contract

```js
import { createVehicleLiveryController } from './vehicle-livery-materials.js';
const controller = createVehicleLiveryController(THREE, adapter, vehicleId);
await controller.preview('anime'); // base | neon | anime | racing | biome
controller.restore();            // synchronous exact base restoration
controller.dispose();            // call before disposing adapter
```

`preview` is transactional and latest-request-wins. It returns `{ applied, vehicleId, liveryId }`; obsolete requests return `applied: false, stale: true`. Failed loads preserve the last committed visual and permit retry. `restore()` and `dispose()` invalidate pending loads. `current`, `vehicleId`, `disposed`, and `audit` are read-only getters.

Textures load only when requested, share in-flight requests, retain active leases, and evict all but four idle textures. A 1024px RGBA texture with mipmaps uses about 5.33 MiB on GPU: 11 simultaneously active paints are about 58.7 MiB, plus at most 21.3 MiB in the idle cache. Original model/palette resources are separate. No GLB reload is required to switch paint.

## Mapping safeguards

Original palette UVs are retained. New non-indexed geometry receives independent per-face `liveryUv` and constant-per-face `liveryMask` attributes. Face projections use body-local coordinates and separately authored left/right/front/rear/top atlas regions. Text is never mirrored. Side bevels remain in the side island rather than splitting a portrait across top/side islands.

Painting is limited to audited source paint swatches/materials. Glass and lamp materials, wheel assemblies, trim and original palette samplers remain untouched. Police lightbar texture materials are explicitly excluded. Source paint hooks run before the masked artwork override; the BMW reflection environment stays intact. Original trim/canvas roofs and selected spoilers remain protected, particularly on rover, desertscout and ashhauler.

### Painted triangle counts

| Vehicle | Painted triangles | Previously degenerate palette UV faces repaired in painted subset |
|---|---:|---:|
| pickup | 266 | 0 |
| citycourier | 332 | 18 |
| rover | 282 | 6 |
| foresthauler | 366 | 106 |
| van | 366 | 30 |
| desertscout | 168 | 4 |
| snowgrip | 400 | 64 |
| snowrunner | 594 | 74 |
| lavacrawler | 314 | 24 |
| ashhauler | 247 | 12 |
| bmwreward | 1352 | 1244 |

## Tests completed

`node tests/vehicle-livery-materials.mjs` passes against all 11 real loaded GLBs:

- 44 asset presence/byte counts/SHA-256 values and 1024px WebP dimensions
- valid non-degenerate projected UVs on every painted triangle
- constant masks and continuous side-bevel atlas classification
- independent left/right projection direction
- original source geometry/UV and material identity preservation
- wheel, glass, lamp and police lightbar exclusion
- all four variants, exact Base restore, and idempotent disposal
- shader injection structure and texture color-space/flip settings
- stale preview, restore/dispose interruptions, failed download and retry

An independent source review also checked material hooks, attribute budgets, shared resources and disposal behavior.

## Actual-model visual proof

These are Blender CPU renders of the **actual runtime-generated geometry, paint masks and UVs**, not concept-sheet renders. The source meshes are exported directly by `scripts/livery-export-validation.mjs` after calling the actual material controller. Shader palette colors and masked livery material selection are reproduced in Blender. All 44 front-left images were inspected, along with sampled BMW/foresthauler right and rear views.

- [Cars 01–03](contact-sheet-01.jpg)
- [Cars 04–06](contact-sheet-02.jpg)
- [Cars 07–09](contact-sheet-03.jpg)
- [Cars 10–11](contact-sheet-04.jpg)
- [Opposite-side and continuity checks](right-side-proof.jpg)

Full-resolution render PNGs remain in `/tmp/livery-render`; only compact sheets are committed.

Visual review found and corrected pickup/citycourier paint-swatch selection, the foresthauler side-bevel portrait discontinuity, and snowgrip hood-number contrast. Cropped duplicate grille text was removed. The van's bright stripe in the lit right-side render is a specular highlight; an unlit render proves the portrait UVs remain continuous.

### Remaining limits

- Browser WebGL shader compilation, final in-game lighting and mobile GPU performance were **not** validated here. Chromium launch was unavailable in this execution environment. Blender proof does not replace browser QA.
- The snowgrip door handle overlaps part of the character's hair/upper face; the hood and side character remain recognizable.
- FOREST lettering meets existing window/mirror geometry on the rover and the right side of the foresthauler. Direction is correct, but some letters can be partly obscured by those protected surfaces.
- Protected trim roofs/spoilers reduce full-body wrap coverage compared with some concept sheets. Their source materials were deliberately preserved.

## Reproduction

1. `python3 scripts/livery-build-atlases.py`
2. `node tests/vehicle-livery-materials.mjs`
3. `node scripts/livery-export-validation.mjs /tmp/livery-render`
4. `python3 scripts/livery-prepare-validation.py /tmp/livery-render`
5. `blender -b -t 4 --python scripts/livery-render-validation.py -- /tmp/livery-render`
6. Optional right side: append `bmwreward,foresthauler anime,racing,biome front-right` after the directory argument.
7. Optional unlit texture proof: set `LIVERY_FLAT=1` before the Blender command.
8. `python3 scripts/livery-contact-sheets.py /tmp/livery-render`

## Frozen hashes

- `vehicle-livery-materials.js`: `c1efb8cb62fbb4a4e937ba1448f0ec95f86f29be374d70e0d44f8926215d370e`
- `assets/liveries/manifest.json`: `dbd066e91beea36165c72c1aaa77f5ee314564b9e1cd23415e218910470dba06`
- `assets/liveries/snowgrip/racing.webp`: `a95b7de96c31517748d809b76cb39a5ca8c3dc3ed9f0adf5a6a6e9ca8f3e7ea4`

The manifest records hashes for all 44 runtime textures.
