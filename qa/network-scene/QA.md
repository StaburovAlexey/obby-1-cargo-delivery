# Curved network renderer verification

The current 10,829.072 m route has five ordered biomes, genuine eased 90-degree turns, and four alternative-route loops that rejoin. Runtime rendering uses the exact Float32 union mesh shared with road containment and height queries.

## Checks

- `node tests/network-scene.mjs`: eight passing actual-Three.js geometry/material groups.
- `node tests/biome-road-shader.mjs`: nine passing palette, texture, metric-coordinate and fork-fringe groups.
- 97,500 environment triangles in six draw batches; 224 city houses, each a closed 12-triangle prism; 1,061 biome barrier envelopes.
- Actual city frontage 17.9475–18.0631 m, shared exact miter cuts, 7.5 m depth and the existing double-height style.
- No positive road self-overlap, no terrain covering road, and zero vertical seam at every road/terrain boundary vertex.
- Actual rendered triangle heights and normals agree with the shared surface queries. All surface triangles face upward and remain nondegenerate after Float32 upload.
- Every scenic envelope stays outside the complete road union. Inner fork walls only appear where both full-depth masses fit; exterior rows share one common setback. Cross-edge barrier footprints do not overlap.
- Independent review additionally checked all actual prism faces and rejected coplanar horizontal overlaps between different barriers. The original near-mouth duplicate-envelope defect was fixed before final images.
- Original square LEGO tile bytes, 4 m UV repeat, 0.4 m stud pitch, storefront atlas and procedural truck rig retained.
- Biome color uses explicit graph progress. Paint uses graph across/distance attributes. The fork island fringe mask keeps medians biome-colored; exterior shoulders retain their narrow material seam. This final correction changed no positions, indices or geometry counts.

The old depth/aligned/wide-house test entrypoints now invoke the new renderer audit. Their fixed 5 km/world-Z snapshot assumptions were superseded by the requested route change; geometry, shared seam, material scale, nonoverlap and truck compatibility checks remain active.

## Visual evidence

`geometry-montage.png` combines the complete five-biome plan, the city 90-degree curve, close storefronts and the forest fork. These are offline Blender renders of actual final Three.js vertices after the barrier overlap fix. `fork-driving-height.png` is the additional 12 m approach view with the actual median and current branched log hazards.

The offline exporter uses actual scene positions, face colors and the original checker. Close facade textures use the source CPU storefront sampler. Blender lighting differs from the app; integrated road paint and terrain fringe GLSL are validated in source/CPU tests, not presented as WebGL-rendered pixels. No browser, WebGL shader compilation, physical device, Android or frame-rate verification was performed.

Large raw export data, PPMs and full-resolution images are kept outside the source checkout in the adjacent `network-scene-diagnostics` directory. Only scripts, reports and compact images are included here. Reproduce with:

    node qa/network-scene/export-offline.mjs
    blender -b -t 4 -P qa/network-scene/render-offline.py

A single view can be exported/rendered by adding its ID, such as `forest-driver` (the Blender command takes it after `--`).
