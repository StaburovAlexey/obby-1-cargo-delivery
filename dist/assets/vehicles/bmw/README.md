# Gold BMW reward vehicle

[Low Poly BMW G80 M3](https://sketchfab.com/3d-models/low-poly-bmw-g80-m3-ea3e807ff69e40fe82c5577ee9f0a2f4)
by [SharkyStudios](https://sketchfab.com/sharkycat109), licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
See `License.txt`. The exact license, title, author and source are embedded in
the source GLB's `asset.extras`; the bundled GLB is copied byte-for-byte.

Gameplay ID: `bmwreward`. Source file: `low-poly-bmw-g80-m3.glb`.
353,124 bytes; SHA-256 `1d46ba0f0eb984b2cffff0279c13e4550d80d99fe95fc42a0559370cd3c5aba5`.
6,618 triangles, 16 mesh primitives, nine source materials, no images or textures.
No external downloads, textures or services are needed at runtime.

## Runtime adaptations and audited geometry

`dist/bmw-vehicle.js` keeps the source unchanged and performs these adaptations:

- A uniform scale yields an 8.0 m length and approximately 3.381 m width,
  preserving all proportions. Road and garage use the same geometry and size.
- The source is Y-up, +Z-forward (white headlights at +Z; red tail lamps at -Z).
  A half turn around Y produces the game's -Z-forward orientation.
- The source body's X origin is about 7.2843, and all four exported wheel
  origins coincide with it. Geometry bounds determine each true axle center;
  separate steering/rolling pivots recenter all four wheel groups without
  moving their meshes out of the arches. Front groups are Plane.005/Plane.006;
  rear groups are Plane.003/Plane.004. GLTFLoader removes dots from node names.
- Wheel radii, widths, centers and deduplicated real vertices describe the
  final normalized meshes. Ground fitting and bridge support receive this
  metadata, rather than generic procedural truck dimensions.
- Only exterior paint Material.015 becomes gold (`#ffc52e`), metalness .9,
  roughness .22, with restrained golden emission .12. A 128 × 64 linear RGBA8
  equirectangular sky/softbox environment (32 KiB CPU pixel data) provides
  actual reflected-light input exclusively to that material. This is generated
  without a renderer or an explicit GPU PMREM step; Three.js performs its
  normal environment filtering when drawing. It does not alter scene lighting.
- Material.020 glossy black windows, Material.016 tires/black trim, Material.017
  dark trim, Material.003/.002 mirrors, and Material.029 wheel rims retain their
  original finish. Red/white lamp colors remain, with intensity capped at .65.
- Opaque double-sided solid materials cast back-face shadows, preserving
  viewing sidedness while matching the existing vehicle shadow-band fix.

Each adapter owns and disposes its geometry, materials and small environment
texture. Only immutable GLB bytes are cached across loads. Disposal is idempotent
and does not dispose externally attached cargo. The group stays identity; the
existing vehicle rig still owns authoritative movement and world pose.

## Verification

`node tests/bmw-vehicle.mjs` parses the actual bundled GLB using vendored
GLTFLoader and checks the hash/attribution, source orientation, uniform scaling,
exact wheel vertices and contacts, centered animation, selective paint,
reflection texture, shadow behavior, caching and resource lifecycle.
`node tests/bmw-ground-fit.mjs` tests actual tire geometry against production
road-ground fitting and footprint dimensions.

These are renderer-free geometry/material/resource checks. They do not establish
browser/GPU appearance, mobile performance, or real-device animation quality.
