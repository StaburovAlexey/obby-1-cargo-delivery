# Compact-route vehicle progression

The approved compact route is approximately 15.87 km, with 25 bridges and 90 road hazards (10 moving). The reference clean final-car trip targets at most 12 minutes; this is not a human playtime guarantee. Vehicle speed, acceleration, steering, grip, capacity, prices and specialties stay unchanged. The stock range ladder changes through distance-based fuel consumption.

Four upgrades retain 10 levels. Speed, steering response and grip gain 1% per level; tank capacity gains 3%. Price for level L (1–10), car N (1–10): round to nearest 5 of 40 × 1.35^(L−1) × 1.2^(N−1) brains. Buying tank capacity does not fill it during a run.

| Car | Price | Stock range | Tank10 range | Stock tank |
|---|---:|---:|---:|---:|
| Пикап | 0 | 290 | 377.00 | 100 |
| Городской курьер | 1300 | 380 | 494.00 | 140 |
| Внедорожник | 3200 | 496 | 644.80 | 190 |
| Лесовоз | 6500 | 646 | 839.80 | 260 |
| Фургон | 10000 | 841 | 1093.30 | 350 |
| Песчаный разведчик | 16000 | 1095 | 1423.50 | 480 |
| Ледовый вездеход | 25000 | 1425 | 1852.50 | 650 |
| Полярный экспресс | 45000 | 1855 | 2411.50 | 880 |
| Лавовый тягач | 78000 | 2413 | 3136.90 | 1190 |
| Пепельный караван | 100000 | 3140 | 4082.00 | 1610 |

Every next stock range exceeds the preceding maximum-tank range. Existing money, ownership and upgrade levels are preserved. The pickup can reach checkpoint 2 stock but not checkpoint 3; the first three gaps remain 180/260/340 m. Late gaps 1440/1870/2440 m let cars 7/8/9 reach separate new destinations with a small tank upgrade. The final gap is about 4004.5 m along the road, against 4082 m range with Ash tank10. Skill may compensate for unbought speed/handling/grip; there is no all-stats or vehicle-ID finish lock.

Future unsuitable biomes still retain 75% nominal speed, strong lateral slip and fuel factors 2/3/4/5. No turn assistance or automatic corner braking was added. Consumption uses actual travelled XZ path, including reverse and sideways slip.

All 16 checkpoint identities and base payouts are retained. Rewards are deliberately separate from shortened geometric distance. Prices, school rates, 3 brains/s driving, mission/mastery rewards and saved progress are unchanged. The old 7–8 hour budget predates this route and must not be presented as a current validated career duration.

Weather continues during bridge falls and clears in the hangar. Verification uses production solver/session modules, CPU Three.js geometry and mocked app events; no browser/GPU/Android FPS claim.
