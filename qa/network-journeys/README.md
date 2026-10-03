# Branched route driving and economy QA

100 checks passed: 70 production-module journeys, 25 mechanics checks, 5 actual application-frame journeys. Browser/Chromium was not launched. No GPU, touch-device or screenshot result is claimed.

## Coverage

- All 10 cars, stock and max upgrades, primary and alternate fork choices.
- True arc checkpoint metadata on the 10,829.072 m graph; graph history instead of world-Z progress.
- Actual 120 Hz four-tire physics, triangle ground gradients, body/road contacts, hazard state and persistent gameplay. The controller sends only steering and throttle after the initial spawn.
- All 11 delivery payouts reached by driving from spawn, all 11 refill circles crossed in complete routes, repeated overlap/replayed frames produce no duplicate payout, saved rewards reload correctly.
- 20 next-gate attempts run out of real fuel with zero money; normal garage reset restores tanks.
- Four full routes reach progress 10792, beyond the final delivery and through the last bend. D and R traverse every fork on both branches.
- Fresh-save pickup reward (only pickup owned): 176.228 m driven, 110 earned, zero refills. Its completed path agrees to the recorded millimetre across 120/60/20/10 FPS public frames.
- Five actual-app scenarios include first pickup delivery and stock/max ashhauler on both branches, each long run crossing all five biomes/four forks and receiving one 5940 reward. App callbacks at 10 FPS retain the production 50 ms physics-frame cap.
- Zero road/hazard contacts on successful routes; ground-fit wheel clearance remains at least 0.012 m.

## Measured progression

Final gaps below are actual fuel-consuming metres from leaving the preceding refill circle to entering the final delivery circle. Ranges are stock / max tank (+6%). The two final-gap columns cover primary/alternate outcomes, including their public-frame schedules.

| Vehicle | Range stock / max | Last checkpoint stock / max | Final gap stock | Final gap max |
|---|---:|---:|---:|---:|
| pickup | 520 / 551.2 | 4 / 4 | 431.322–431.871 | 431.273–432.441 |
| citycourier | 700 / 742 | 5 / 5 | 575.211 | 575.621–576.284 |
| rover | 1000 / 1060 | 7 / 7 | 895.841–895.843 | 896.187–896.949 |
| foresthauler | 1420 / 1505.2 | 8 / 9 | 1243.322–1243.753 | 1440.502–1441.232 |
| van | 1800 / 1908 | 10 / 10 | 1698.620–1698.684 | 1698.935–1699.968 |
| desertscout | 2250 / 2385 | 11 / 11 | 2000.538–2000.922 | 2000.640–2000.711 |
| snowgrip | 2800 / 2968 | 11 / 11 | 2000.624–2001.972 | 2000.491–2001.699 |
| snowrunner | 3500 / 3710 | 11 / 11 | 2000.580–2002.661 | 2001.525–2001.690 |
| lavacrawler | 4400 / 4664 | 11 / 11 | 2000.895–2003.942 | 2001.654–2003.283 |
| ashhauler | 5500 / 5830 | 11 / 11 | 2001.470–2003.225 | 2000.262–2000.269 |

The stock foresthauler cannot cross the checkpoint-8-to-9 gap; its max tank can. Other tested last-checkpoint limits remain unchanged with upgrades. No checkpoint interval needed adjustment.

## Measured checkpoint gaps

These measurements use stock/max ashhauler on both branches. Stops 1–10 are right-side refills and stop 11 is the left-side final delivery; see mechanics.json for the additional final right-side refill.

| Checkpoint | Progress | 3D centerline gap | Fuel-consuming service gap | Reward |
|---|---:|---:|---:|---:|
| 1 | 180 | 180.003 | 176.157–176.572 | 110 |
| 2 | 440 | 260.213 | 254.299–256.765 | 260 |
| 3 | 780 | 340.113 | 333.561–337.031 | 470 |
| 4 | 1220 | 440.295 | 434.979–439.756 | 730 |
| 5 | 1800 | 580.311 | 576.411–580.317 | 1080 |
| 6 | 2580 | 780.605 | 771.395–775.445 | 1550 |
| 7 | 3480 | 903.831 | 896.753–898.481 | 2090 |
| 8 | 4730 | 1250.850 | 1242.865–1245.804 | 2840 |
| 9 | 6170 | 1447.825 | 1441.975–1443.717 | 3710 |
| 10 | 7870 | 1706.268 | 1699.380–1702.113 | 4730 |
| 11 | 9870 | 2008.147 | 2000.262–2003.225 | 5940 |

## Reproduce

- node tests/network-journeys.mjs
- node tests/network-journeys.mjs --mechanics
- node tests/network-journeys.mjs --app
- node tests/economy-progression.mjs
- node tests/progression-max-upgrade-routes.mjs

The last two commands wrap the stock/max graph-aware matrix and replace the old single-axis controller. Individual traces and failures are retained in all.json, mechanics.json and app.json; summary.json contains measured ranges, gaps and the final application-validated runtime source hashes.

## Limits

This is a repeatable safe steering route, not an optimal-fuel proof or arbitrary-input collision guarantee. Fuel retains production horizontal contact-resolved travel while checkpoint metadata uses 3D arc distance. Vehicle IDs, prices, capacities, ranges, base consumption and the 6% tank upgrade cap were not changed by this QA work.
