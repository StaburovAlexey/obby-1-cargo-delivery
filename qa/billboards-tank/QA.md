# Stable labels and tank upgrade

Published baseline Site30 had projected-neighbor-gap scaling: at a fixed 320px viewport, 576 yaw/pitch/distance poses produced 35 school scales ranging .38–1. Owned access rows also collapsed the block height. Free Bacon retained a purchased label.

The whole school composition is now a 120×128 screen-facing DOM billboard, scaled only by viewport width. Book, rate and reserved price slot share one wrapper and floating animation. Camera changes never mirror or individually rotate its artwork. Horizontal overlap spreading never changes scale; dense groups are clamped onscreen when the group fits. Smooth position transitions avoid abrupt overlap-layout changes. At extreme projections wider than the viewport, edge clipping can remain (maximum36.95px in the existing sample); it does not resize the blocks.

Skins now match cars: only money SVG and exact price for unowned items; every owned label including Bacon is hidden immediately after purchase and on subsequent projection/reload. Car, skin and school anchor heights are all reduced by0.4m. The wallet, brain HUD and driving controls retain their locations.

Fourth upgrade: fuel tank, three2% levels, maximum6% capacity and one-fill range. Consumption per actual metre remains unchanged. Buying never adds fuel; refill/spawn/reset use effective capacity. Existing saves default missing fuel levels to0 without losing previous upgrades or ownership. The HUD shows effective current/max, including fractional capacities, and updates immediately while the upgrade menu remains open. Medium-width screens use two upgrade columns; shorter panels can scroll.

Final aggregate `npm test`: exit0,407 PASS lines. Independent review:14/14 groups,576 camera poses,49 dense mobile edge cases,17 skin ownership states,30 tank purchases, six application viewports, keyboard/input containment and immediate HUD/refill/reload behavior. Dedicated tank suite:40 capacity variants,200 biome previews,400 actual D/R displacement-accounting runs and80 full-range journeys. All10 fully upgraded route checks passed with fuel:3, no barrier contacts or fuel/position cheats. Geometry, road, materials and driving solver were not changed for these features.

Source tests, JSON measurements and the native-SVG specimen are included. The specimen was viewed after rasterization. It is an offline illustration using runtime SVG paths, not a screenshot of Android or WebGL. Tests use actual JavaScript and Three.js math with a mock DOM/renderer; real browser layout, touch, GPU and subjective playtesting remain unverified.
