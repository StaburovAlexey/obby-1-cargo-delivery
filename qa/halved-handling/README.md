# Half base handling and grip (2026-10-14)

Requested change: all ten cars' base handling and grip are exactly 50% of Site36. Upgrade levels remain +2% per level, up to +6%; prices, power, speed caps, fuel, hills, rewards, and all other systems are unchanged. No turn assist is introduced.

Runtime changes are limited to economy-config.js, biome-surfaces.js and one brake lower-bound constant in driving-model.js. Unsupported-biome profiles also halve their two grip coefficients. The minimum friction/lateral coefficient is 0.025 rather than 0.05, and brake-factor minimum is 0.5 rather than 1, so the requested halving is not silently clamped away.

`node tests/halved-handling.mjs` passes: 10 cars × 4 upgrade levels × 5 biomes; all coefficient/derived UI-stat comparisons against a frozen Site36 module closure; other car properties unchanged; 480,000 finite physics steps; all 50 profiles have slower initial rack response, longer matched-speed braking, and more lateral slide. Adjacent stock cars still beat maxed previous cars in the existing independent physical comparison suite. Full stock-car route progression suite passes.

Measured at 1.5 m/s: pickup/city braking 0.12034→0.23281 m; lateral displacement 0.02049→0.04541 m. Ash hauler/volcanic braking 0.059998→0.120584 m; lateral displacement 0.00837→0.02144 m. These are controlled low-speed comparisons, not a claim that every emergent quantity doubles.

Intentional consequences: sustained reverse steering can produce very large slides (worst of the 100 stock profiles was ash hauler/city/reverse, about 89.94° body slip during the eight-second held-turn test). Straightening the wheel recovered all profiles within ten seconds (worst remaining yaw 0.0000441 rad/s). Less grip can limit launch acceleration; the forest hauler/forest engine upgrade does not improve its very first traction-limited launch, although its engine values and speed cap still increase normally. No extra stabilizer was added to hide these requested changes.

Legacy tests asserting the old small-slip bounds, sub-one-second brakes, immediate power-upgrade launch improvement, or exact rollback-to-Site34 bytes are historical expectations, not acceptance criteria for this new balance. They are reported separately in regression-results.json. The explicit Site34 rollback audit remains available as test:rollback for that historical version; current aggregate substitutes the new halving contract.

Verification uses Node, real production math/solver, and existing mock DOM/renderer integration. No browser, WebGL, GPU, physical touch, or Android test was performed.
