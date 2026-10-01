# Cosmo low-poly vehicles

These ten self-contained GLB files come from **Low Poly Cars – By Cosmo**
(publication date in the supplied license: 20 October 2024).

- Author: https://cosmo-art.itch.io/
- User-provided source archive: https://drive.google.com/file/d/1hgr4ifOg2IUqJ6gADVU6AyYhaa9TZlGD/view
- License: CC0 1.0 Universal. The original `License.txt` is retained beside the models.
- GLBs are copied byte-for-byte from the supplied `lowpoly_cars_free/GLTF` folder.
- No remote asset service is contacted at runtime. All buffers and PNG palette images are embedded.

## Stable gameplay mapping

| Gameplay ID | Source model | Biome |
|---|---|---|
| pickup | coupe.glb | City |
| citycourier | police.glb | City |
| rover | jeep.glb | Forest |
| foresthauler | van.glb | Forest |
| van | kamaro.glb | Desert |
| desertscout | ghini.glb | Desert |
| snowgrip | rally.glb | Snow |
| snowrunner | armor.glb | Snow |
| lavacrawler | lamb.glb | Lava |
| ashhauler | fenyr.glb | Lava |

The adapter `dist/cosmo-vehicles.js` rotates the sources from +Z-forward to
-Z-forward, grounds them at Y=.05, and applies a **uniform** scale fitting a
4.65m × 8.64m visual/contact envelope, exactly 1.5× the original 3.1m × 5.76m
normalization. Road and parked vehicles now have the same actual size; the garage
display multiplier is 1. All axes enlarge together around the tire-bottom plane
at Y=.05. Wheel centers, radii, contact vertices and body bounds describe that
full-size geometry, with no extra display-only scaling. This does not change gameplay IDs, prices,
saved ownership, upgrade levels, stats or driving dynamics.

Four independently extracted wheel pivots preserve the normalized source pose.
Body suspension excludes wheel pivots. Wheel rotation converts the simulation's
original radius (.68m) back to traveled distance and uses each actual tire radius.
The supplied `metadata.wheels` describes the normalized tire geometry for road
contact fitting without stretching models or moving wheels out of their arches.

## Palette and materials

The original UV palette, vertex colors, glass, tires, trim and lamps remain.
Only audited body-paint swatches in metallic/texture materials get selective
runtime shader substitutions: jeep green, ghini ochre, rally cyan, armor ice white,
and fenyr orange. This is not a whole-model tint. Wheel, glass and light materials
are excluded, including fenyr's blue rear light. Other models retain their source
paint colors. Original emissive intensity 15 is capped at .65; body/tire roughness
is clamped to at least .24. Body-only paint materials use metalness ≤.22 and
roughness ≥.32 so they retain a readable diffuse finish without an environment
map; wheel, glass and light metalness are unchanged. Original double-sided
viewing remains supported. Opaque double-sided solid materials cast only their
back faces, matching ordinary solid-mesh shadow behavior and avoiding front-face
self-shadow stripes. Glass, transparent/alpha-cutout shadow behavior, and
mesh cast/receive flags are unchanged.

The GLBs total **1,751,496 bytes**, **23,207 triangles**, **109 primitives**. These
counts exclude cargo and shadows. CPU tests parse actual GLBs with the locally
vendored GLTFLoader and bitmap-dimension stubs, validate geometry, articulation,
resource lifecycle and shader construction. They do not establish GPU rendering,
real-device frame rate or visual shader output.

## Resource lifetime and texture budget

The ten models share the same audited embedded PNG. Runtime pooling retains one
immutable ImageBitmap/Three.js Source and two original sampler variants across
all live adapters. References are counted: disposing one vehicle cannot invalidate
another, and the final release disposes both textures and closes the bitmap.
Geometry, materials, paint uniforms and animation state remain per-vehicle.

A 1000×720 RGBA8 palette is 2,880,000 bytes before mipmaps. Two complete mipmapped
sampler variants are approximately 7.32 MiB of GPU texture storage combined,
plus 2.75 MiB for the retained decoded bitmap. This is a dimensional estimate,
not measured GPU residency; driver overhead is excluded. Byte caching adds
1.67 MiB for the ten GLBs. Transient parses are limited by the garage loader.
