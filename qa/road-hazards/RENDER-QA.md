# Road-hazard scene verification

## Implemented visuals

- City: warning-yellow rectangular repair blocks with black diagonal paint. Paint polygons share edges; there are no overlapping decal surfaces or raised stud meshes.
- Forest: 12-sided brown cylinders with pale cut ends. Width and diameter follow the simulation descriptor exactly.
- Desert: finite, shallow 0.12–0.18 m sand accumulation. A batched grid conforms to the road beneath every vertex; color and relief stay inside the soft-physics footprint.
- Snow: finite clear-cyan ice with pale streaks and low roughness. The exact rectangular footprint matches the soft-grip region.
- Volcanic: faceted basalt blocks, a dark ground shadow and a bright pulsing amber perimeter. Warning, falling and landed visibility/altitude come directly from the authoritative simulation. Final warning altitude is 10 m.

Six bounded instanced pools and two merged patch meshes share eight materials and eight geometries. Repair blocks and sand use the existing ref-counted 128×128 checker texture. Seed 42 has 2,054 rendered triangles and five draw calls while rocks are dormant. All five rocks warning raises this to 2,344 triangles and eight draw calls. These are geometry counts, not measured frame-rate results.

## Geometry and resource checks

Run `node tests/road-hazards-scene.mjs`.

Eight offline actual-Three checks cover:

1. Actual instance counts, pool capacities, shared geometry/texture and triangle budget.
2. Yellow/black code-native stripes and outward repair normals.
3. Exact horizontal OBB bounds, ground seating on grades and positive instance determinants.
4. Exact dune/ice footprint boundaries, matching soft effects, sampled ground clearance and road-triangle midpoint clearance.
5. 160 m warning activation, visible aloft rock/shadow, falling/landed transitions, active colliders with matching visible geometry and reset.
6. Repeated-update buffer/resource identity and bounded-capacity rejection.
7. Six additional seeds across route curves and grades.
8. Idempotent disposal and shared-texture release only after the final owner disposes.

## Reproduce the offline views

From the site root:

```
node qa/road-hazards/export-views.mjs
blender -b -t 4 -P qa/road-hazards/render-offline.py
python3 qa/road-hazards/label-views.py
```

The exporter uses the final runtime's actual BufferGeometry, instance transforms, vertex colors and material properties. The road context is generated from the source height, paint and checker samplers. Blender supplies diagnostic lighting. The images are explicitly labeled offline, with high-quality JPEGs retaining the full image dimensions.

The exporter creates temporary `geometry.json`, checker and road PPM bakes beside these scripts. They and the uncompressed PNG originals can be moved outside the checkout after labeling. They are intentionally omitted from the delivered source to avoid unnecessary size. The renderer accepts `-- dune rock` to refresh only those hazard types.

## Limits

No browser was launched or retried. These are not browser or device screenshots. WebGL shader compilation, live browser composition, Android performance, GPU frame time and actual in-game touch interactions are unverified. Separate integration/audit files cover simulation and app lifecycle behavior; this document describes only the hazard renderer and offline render evidence.
