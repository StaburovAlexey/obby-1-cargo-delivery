# Smooth weather and hangar UI validation

Weather uses a 180 m band centered on all four biome boundaries and a maximum 0.7 s full-weight change. Distinct fixed-kind layers crossfade rather than replacing visible particles. Clear-city strength is implicit; fog and sky interpolate with the same weights. Hangar clear is immediate, while modals/focus pause preserves the current blend. Falling preserves weather.

`npm run test:weather-transitions` is the targeted release check. It includes production shader-derived alpha, actual Three.js projection at all four boundaries and portrait/landscape views, forward/reverse/stopped crossings, frame rates, rapid teleports, zero/invalid/paused times, two-pool resource reuse/disposal, actual app lifecycle, fall/no reward, purchase labels, controls and saved progression.

The reproducible `compare-orbit.mjs` uses the included exact Site52 source fixture and the same one-second warmup and continuous camera orbit for both versions. All position, age and haze buffers and visible counts match every frame in eight biome/viewport cases. The prior settled coverage is preserved. The 600-frame desert portrait minimum is 41 in both versions; it should not be confused with an older test's un-warmed sample phase/minimum threshold of 45. Historical tests that require immediate full weather or one allocated pool are superseded by these transition contracts.

Purchase labels were tested through actual handlers/repeated rendering for all car, character and school offers (87 label checks), including insufficient funds and successful debit. Hangar vertical-column fit is structural CSS arithmetic for five viewports and safe insets 0/20 px; this is not a browser layout screenshot. Owned-item actions and upgrade controls retain their previous semantics.

No browser, GPU, Android appearance or FPS validation is claimed. Map, bridges, hazards, vehicle stats, economy and saved state formats are unchanged.
