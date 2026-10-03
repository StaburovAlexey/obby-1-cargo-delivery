# Independent Cosmo vehicle fit review

## Result

`node tests/cosmo-fit-review.mjs` passed against all ten final packaged GLBs and the full-size road/parked adapter. The scale regression is also checked independently by `node tests/road-vehicle-scale.mjs`.

- Exact original GLB SHA-256 hashes preserved; chosen mapping is checked explicitly.
- Actual source palette lamp geometry establishes +Z front for all ten; adapter converts to game -Z.
- All source wheel thickness axes are X. Source body transforms are included before wheel reparenting; no origin/parent-offset shortcut.
- Proportions remain uniform. At rest, every car is at most 4.65 m wide and 8.64 m long and centered in XZ, with minY 0.05 m. Road and parked geometry is now uniformly 1.5× the prior road normalization; the parked display multiplier is 1.
- All ten fit their actual painted parking bays with minimum edge clearance 0.035495 m. Painted bay positions/dimensions and approach distances are unchanged. The closest pair of actual parked models retains a 0.604071 m gap.
- Front steering, reverse/forward rolling distance, body-only suspension, repeated updates, reset, and atomic rejection of invalid poses are checked against real vertices.
- Main-paint shader replacements exclude wheel, glass, and lamp materials; palette image, UVs, original GLB bytes, and source materials are retained. Non-glass roughness floor and lamp-emissive cap are intentional adapter adjustments.
- Exact cargo-footprint triangle clipping fixes the independently detected rally roof intersection. Independent 9×9 footprint rays show minimum cargo-to-roof clearance 0.025000 m. Police cargo stays behind its lightbar.
- 180 actual spinning/steering wheel-mesh road poses across flat and hill locations: minimum observed tire clearance 0.012127591 m; largest lowest-tire clearance 0.047420702 m. The separate ground-fit test also covers 540 forward/reverse poses on nine flat/hill locations.
- Owned resources release once; external garage cargo resources remain untouched. Three simultaneous distinct cars share two texture objects and one palette image. Disposing two cars preserves the third; the final owner closes the bitmap once.

## Resource budget

Ten models total 1,751,496 bytes, 23,207 triangles, and 109 mesh primitives. Compared with the original ten two-batch procedural vehicles this adds 89 visible vehicle primitives before shadow rendering. Hidden fallback geometry remains allocated for safe loading/failure behavior. No GPU timing or memory measurement was performed.

The final immutable palette pool reduces all live imported cars to one 1000×720 decoded image and two sampler variants. One theoretical RGBA8 image is 2.75 MiB (3.66 MiB including full mipmaps); actual GPU backing, sampler-variant sharing, decoder storage, and overhead depend on renderer/device and remain unmeasured.

## Contact integration notes

Uniform fitting selects the length limit for every model. Full-size tire widths differ by model; wheel metadata now comes from the enlarged geometry, including actual centers, radii, widths and vertices. The approved actual-wheel bridge-support and visual ground-fit integration therefore uses adapter wheel metadata rather than forcing wheels out of their arches. Source radii are measured as maximum radial vertex distance; rotating faceted wheels can extend below their rest bounding boxes. Visual ground fitting uses the radial envelope to prevent sinking. Planar drive forces are unchanged. This geometry review does not establish full corridor/obstacle collision or all-bridge clearance; those have separate integration tests.

## Evidence and limits

- `source-review.json`: independent raw-GLB bounds, lamp palette locations, wheel transforms, hashes.
- `palette-review.json`: body/wheel material swatches weighted by triangle area.
- `normalization-review.json`: historical source-derived original-scale wheel and preliminary cargo measurements, before the 1.5× road enlargement.
- `adapter-review.json`: final full-size real-adapter metrics and pass results.
- `tests/road-vehicle-scale.mjs`: independent original-source transformation checks for all 36,537 mesh vertices and 5,884 unique tire-contact vertices, unchanged .68 simulation-distance conversion, suspension/reset, pending-load selection, equal road/parked sizing, 50 idempotent display switches and parking gaps.
- `source-review.py` and `measure-fit.py`: read-only source analysis, requiring the original adjacent audit asset folder; not needed to run the self-contained JS regression.

Actual shader compilation, browser rendering, material appearance under scene lighting, screenshots, real-device touch, GPU FPS, and GPU memory are not covered. Bitmap decoding is a PNG-dimensions stub; geometry, transformations, raycasting, source-shader hooks, resource ownership, and original packaged bytes are real.
