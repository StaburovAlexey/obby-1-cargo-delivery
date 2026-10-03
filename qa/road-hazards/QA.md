# Road hazards verification

This release adds a finite deterministic obstacle layer to the existing route. The browser route was unavailable; all results below are Node/actual Three.js mathematics, simulated DOM/event delivery, and offline Blender source-mesh views. No Android, WebGL shader compilation, physical touch, GPU draw-call or FPS claim.

## Runtime coverage

- 25 hazards: five each repair blocks, logs, shallow dunes, ice patches and timed rocks.
- Author checks: 2,048 seeds; 53,620 whole-body bypass poses; 8,100 independently calculated polygon SAT poses; 200 stock/max car/biome D/R impacts and retreat; 80 patch crossings; thin-log sweeps at 40 m/s.
- Exact warning arming endpoints in both route directions, 4.5 s warning + 1.2 s fall, no idle/near-teleport arming, overlap deferral, delayed-frame clamp, pause/reset and persistent landed contact.
- Application: 100 stock/max car/biome transitions, 20 direct block impacts with D/R retreat and exact path-based fuel, menu/hidden/blur/overview/context-loss pause, empty fuel/abort/rebuild reset and reward protection.
- All 10 stock farthest-delivery trips and both expected next-gap failures pass through the real app loop. All 10 fully upgraded trips also pass. Test steering follows a smooth visible-obstacle bypass; no pose, speed, fuel or money edits occur after ordinary launch. Every earlier refuelling checkpoint is visited, no contact sliding is used, and exactly one intended payout occurs.
- Final aggregate `npm test`: exit 0, 431 PASS (407 historical + 24 obstacle groups). Both full-route matrices also passed: 12 stock outcomes and 10 maximum-upgrade trips.

## Visual and resource coverage

- Exact mesh footprint/OBB agreement, hill contact, patch boundary/height samples, outward face normals, warning/fall/land/reset visibility, resource capacity and idempotent disposal.
- City repair blocks narrowed to 3.6–3.9 m: both sides remain open, including the conservative complete-vehicle road boundary envelope.
- Sand relief reduced to .12–.18 m so unchanged ground-following wheels do not disappear inside a tall mound.
- Warning altitude reduced from 18 to 10 m after the independent projection audit found a crest clipping the high suspended rocks. No camera or physics movement was changed.
- Existing 128×128 shared checker texture is reused. 8 geometries and 8 materials, six bounded instanced pools and two merged local patch meshes. No growing arrays or network art assets.
- Source-geometry offline images cover all five types plus the three rock phases. They illustrate geometry and CPU material reference values, not a browser screenshot.

Independent review passed and is included under `independent-review/`: 1,000 seeds, 600 impact/recovery cases, 5,400 warning projections and 60 short-landscape control-layout cases. No remaining verified blocker.

Short-landscape upgrade/biome controls are compact accessible 48px icons between the driving controls, above the bottom fuel/speed row. This fixes their previous overlap with the distant rock warning; camera behavior is unchanged.
