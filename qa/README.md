# Seated-arm diagnostic

`seated-arms-before-after.png` compares the published v18 pose (top) with the corrected anatomical-frame pose (bottom), in front, top, profile, and three-quarter views. The image uses actual Three.js deformed vertices and original character textures, rendered offline with Blender. It is not an Android/WebGL screenshot, and it does not establish browser performance.

The original defect was caused by assigning one absolute world quaternion to both mirrored hand bones, ignoring their distinct inverse-bind frames. The corrected pose uses each skin's original longitudinal and transverse frame throughout the arm, reducing the artificial wrist-frame discontinuity. Exact lower-body pose and furniture are preserved. Contact alone is no longer the arm-quality gate: `tests/seated-arm-axes.mjs` checks bind-relative wrist rotation and axial orientation alongside `tests/desk-pose-clearance.mjs` for real vertex/furniture contact and transitions.

five-biomes-delivery-offline.jpg: actual generated Three.js geometry exported to Blender, with matching projected amount/dollar labels composed offline. Five paired delivery/fuel stops, one view per sequential biome. These are not browser, WebGL or Android screenshots. Distant offscreen masses are omitted in this diagnostic to keep its memory use bounded; the live road geometry and boundary coverage are tested separately.

house-alignment-truck-comparison.png and house-alignment-plan-comparison.png show the v26 house-row staircase and corrected shared endpoints. The truck view uses actual Three-transformed geometry and sampled runtime storefront textures at route distance 420 m; the plan intentionally omits height. Both are offline diagnostics, not Android/WebGL screenshots. These images precede the same release's road-palette update, and isolate the house alignment change.

biome-vehicle-overview.png samples the five v27 road shader palettes/patterns (now superseded by the restored LEGO tile) and projects all ten actual procedural car meshes at a common orthographic scale. Snow markings use a darker blue for readability. This is a CPU diagnostic with neutral face shading, not a browser screenshot; vehicle texture maps are omitted to isolate silhouettes. It does not validate particles, physics, animation or WebGL compilation.

- `five-lego-roads-offline.png`: current road surface correction, using the exact shared 128×128 square-stud grass pixels in five biome colors. Source-pixel CPU diagnostic only; no browser lighting or GPU rendering. The earlier `biome-vehicle-overview.png` shows the v27 surface experiment (now superseded) but the same ten vehicle silhouettes.

`ordered-biome-measurements.json` / `.csv` contain all50 actual fixed-step dynamics measurements and methodology. `ordered-route-measurements.json` contains12 real-app route results. These are deterministic Node tests, not a human mobile playtest.
