# Individual vehicle livery artwork

44 distinct texture compositions, four per vehicle, authored as 11 original image-generated production sheets. These flat albedo sheets do not contain vehicle renders, wheels, or baked studio lighting. They are packed into the existing six-sided UV layout.

Each anime design has an original fictional character. Neon shape language, racing graphics, and biome illustrations are independently designed per model. See livery-individuality.json for the motif matrix.

Existing 44 URL paths and variant IDs are unchanged. 1024x1024 WebP, quality90. Glass, wheel, light masks and vehicle geometry/runtime are unchanged. Upper side artwork is positioned beneath the window line; side artwork aspect ratio uses measured model bounds. Hood wordmarks are omitted to avoid cropped words. English text only.

Rebuild: python scripts/livery-build-atlases.py (Pillow). Authored sources are scripts/livery-source-art/01.png through11.png, outside dist and not downloaded by players. Source sheets follow the same four-band order: neon,anime,racing,biome.

Validation:44 actual model Blender CPU renders using exported runtime geometry and runtime UVs, plus opposite-side spot checks. This is not a browser/GPU visual certification. Native wheel/glass/body stripe materials remain intentionally unchanged; the muscle car's original dark hood stripes overlay the hood illustration.

Integration: apply this assets-and-authoring-only delta on top of the current UI branch (UI GitHub5b686f2d2db2d69d2dc0e85c8c7c4004d2b013cb / private Site source758996100d431ec66d31db91bffbcbb3ab5e306e). No runtime or UI source file is included. Invalidate deployment caches using the established release process; URLs intentionally remain stable.
