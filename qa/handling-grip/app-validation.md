# CPU application-frame checks

Actual production app frame loop, driving model, road surface, contacts, fuel, and bridge-fall logic. DOM and WebGL renderer are mocked. The fixture places the vehicle at the test start; turn fixtures also set initial speed. Visual vehicle models are not loaded, so bridge support uses the application's fallback wheel contacts. These results do not establish browser rendering, imported-wheel clearance, human usability, or full-route economy.

## Final candidate

- Own-biome bridge approaches: 20/20 passed (10 ordinary cars, stock and all upgrades level 10), target speed 6 m/s. One first bridge per relevant biome, not all 25 bridges. No collision/fall. Maximum center deviation from bridge centerline: 0.0882 m.
- Earlier baseline: 20/20 passed, maximum center deviation 0.0707 m.
- Citycourier on the first volcanic bridge: stock/max both passed. Maximum center deviation 0.260/0.213 m; peak slip 4.35/3.20 degrees. Wrong-biome passage remains possible with a careful controller.
- App turn pulse at 8 m/s: steering 0.6 for 0.6 s, then steering zero for 1.4 s; speed controlled by held/released throttle. Handling/grip upgraded together, speed and fuel at zero. All six scenarios remain driving without collisions. Pickup stock/max lateral offsets 2.187/2.555 m; rover 2.579/2.906 m; ashhauler 3.490/3.589 m.
- Isolated upper-car handling: ashhauler at 25 m/s, grip zero, handling 0/10. At 200 ms steering-rack angle rises 0.04470 to 0.05226 rad (+16.9%); heading response 0.01878 to 0.02380 rad (+26.7%). Total two-second lateral offsets 9.579/9.886 m (+3.2%). No collisions. This supports a stronger initial steering response, not a large steady-state turning-radius gain.

Reports: `app-bridges.json`, `app-wrong-biome.json`, `app-turns.json`, `app-upper-handling.json`.
Harnesses: `tests/handling-grip-app.mjs`, `tests/handling-grip-turn-app.mjs`.
