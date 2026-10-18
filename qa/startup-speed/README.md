# Initial loader timing

Compare the full source game with all required models and unchanged quality.
Capture the pre-change versions from the rendering branch before this follow-up:

```sh
mkdir -p output/startup-speed/baseline
git show cee4ae1:dist/app.js > output/startup-speed/baseline/app.js
git show cee4ae1:dist/route-network.js > output/startup-speed/baseline/route-network.js
git show cee4ae1:dist/network-scene.js > output/startup-speed/baseline/network-scene.js
git show cee4ae1:dist/city-driving.js > output/startup-speed/baseline/city-driving.js
git show cee4ae1:dist/road-hazards.js > output/startup-speed/baseline/road-hazards.js
python3 qa/startup-speed/server.py
```

Open `http://127.0.0.1:8767`, alternate Baseline and Optimized, and export JSON.
Run without other tests/builds; use several pairs. The QA server binds loopback,
serves both versions with `Cache-Control: no-store`, and injects timing marks
only into its response. No timing hooks or server are shipped in the game build.

`totalMs` ends when the actual loader disappears; `worldMs` covers the existing
initial scene rebuild, `assetsReadyMs` is navigation-to-required-assets completion,
and `prepareMs` covers shader preparation before the covered render. The complete
GLB resource timings show serial versus overlapping downloads.

This measures desktop source-game startup with HTTP caching disabled, not a cold
GPU driver cache, Yandex/VK SDK initialization in production, CDN or iPhone time.
Baseline and optimized games use the same host and dimensions. Player-room entry
starts after readiness and does not determine the loader measurement.
