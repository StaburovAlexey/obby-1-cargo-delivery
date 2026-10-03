# CPU lighting audit

Run: `node tests/lighting-audit.mjs`.

This audit uses the shipped Three implementation and original character GLBs. It does not use a browser or GPU and cannot certify final rendered appearance.

## Confirmed defects and exclusions

- Existing fixed light clips rear character-row ground receivers. At (-41,0,85), shadow V=-0.092; at (15,0,85), U=1.024. The road at (0,0,-200) is also outside the shadow map. Thus shadow coverage does not follow the playable world.
- Roof, walls and floor share a cast-shadow-enabled InstancedMesh; missing roof cast flags are not the cause.
- Shipped Three selects skinning from `object.isSkinnedMesh`, updates skeletons for shadow objects, and uses the skinned depth vertex path. A material.skinning toggle is unnecessary.
- All 17 original characters were sampled over 9 seconds of idle animation. Actual deformed mesh minima remain within 1 cm of the floor. The screenshot alone does not establish levitating feet or a broken skeleton.
- Existing biases are centimeter-scale, not enough by themselves to explain a meter-scale separated silhouette. Projection clipping is independently demonstrated, but the screenshot's exact silhouette cannot be assigned to a particular caster without rendering.

## Minimal bounded remedy

Keep one 2048² shadow map, move the light and target together with the player/car, preserving a constant direction vector. Proposed direction offset (-36,80,30), orthographic ±75, near .5, far 220 comfortably contains the local 70×70 m floor and roof volume through height 20.6. The CPU checks yield UV bounds .171..829 and .216..853, depth .226..534. No extra shadow-casting lights are needed.

Proposed normalBias .015 produces approximately .0088 m horizontal floor displacement; depth bias -.00006 corresponds to .01317 m in light depth. Final acne/contact balance still needs rendered inspection. World-XZ snapping only approximates stabilization; exact shadow-texel stabilization must quantize light-plane axes.

## Production helper verification

The final `scene-lighting.js` helper now snaps the actual light-plane axes (rather than world XZ). Its orthonormal basis and translation were checked with the real Three shadow matrices at 860 anchors across every route branch, including discontinuous jumps between locations and elevations 0–230 m. Every tested local floor/roof volume remained inside the shadow frustum; minimum roof depth was .2256. Maximum snapped target displacement was .05048 m, below the half-texel diagonal bound .05180 m. The script imports the production helper directly, so these are implementation checks rather than duplicate-formula-only checks.
