# Ten-minute route feasibility proposal

Status: successful isolated prototype; no production runtime edits or publication by this study.

## Result

The 13,588.949 m route with 25 narrow bridges and 90 hazards, including 10 movers, supports the requested roughly ten-minute final run without changing speed, acceleration, handling, or grip.

Production physics and gameplay, ordinary pedal/steering inputs, seed 42, primary branch:

| Check | Result | Time |
| --- | --- | --- |
| Final Ash, all four stats level 10 | Delivery; 25 bridges, 15 refills, zero collisions/falls | 9:33.15 |
| Final Ash, only tank level 10 | Delivery; same route and hazards | 10:21.40 |
| Final Ash, other stats max, tank level 9 | Fuel empty before finish; zero payout | 9:32.70 |
| Stock pickup to stop 2 | Delivery | 0:40.80 |
| Stock pickup toward stop 3 | Fuel empty after both refills; zero payout | 1:07.95 |

The full-max successful run retains approximately 75.77 m of fuel range. The tank9 run reaches canonical progress 13,529.255 m, short of the final service/delivery station at 13,550 m. All five checks had unchanged candidate runtime hashes while running.

The geometry-only comparison was 8:29.60. Active hazards add 1:03.55 with this test driver. The driver uses an 8 m/s bridge target, 80 m approach, and 15 m exit. That is a conservative test-control setting, not a game speed limit or a claim that a human must drive this way. These results are offline Node/Three.js physics tests, not browser, GPU, mobile, human-playtest, or alternate-branch timing claims.

## Concrete geometry

Canonical route end: 13,570 m. Final stop: 13,550 m.

Biome boundaries: city 0–3,000; forest 3,000–5,800; desert 5,800–8,500; snow 8,500–11,000; volcanic 11,000–13,570 m.

Four forks: 4,500–5,000; 7,280–7,780; 9,800–10,300; 11,850–12,350 m. Each is 500 m long, offset 25 m, ridge +4.4 m, valley −3.4 m. Peak fork grade is 8.25% on the main arm versus 6.375% on the alternate. Peak curvature is approximately .00431–.00455; the midpoint median is 20 m wide. These are shortened, resized forks, not old forks cropped without adjusting curvature or height.

Bridge centers, five per biome:

- City: 960, 1,320, 1,720, 2,160, 2,660
- Forest: 3,320, 3,850, 4,070, 5,360, 5,580
- Desert: 6,260, 6,480, 6,700, 6,920, 7,950
- Snow: 8,820, 9,040, 9,260, 10,470, 10,690
- Volcanic: 11,320, 11,540, 12,520, 12,740, 13,180

Every bridge stays 5 m wide and 24 m long. The current safety rules are retained: at least 220 m center spacing, whole-deck 160 m service/preview exclusion, whole-deck 150 m fork exclusion, complete 60 m approaches with grade at most 6.5% and curvature at most .0013. All authored bridge approaches pass 0.5 m sampling.

The exact earliest-first packing on the current 10 m candidate grid is 5/5/5/5/6, or 26 bridges total. Thus 45 bridges do not fit this concrete 13.59 km layout under the existing rules. The recommended 25 preserve an equal five-per-biome distribution and still increase the published 15 bridges. Retaining 45 would require a materially different, longer layout or relaxed spacing/exclusions, with a new timing study; this prototype does neither.

## Fuel and progression

Sixteen stop positions:
180, 440, 780, 1,140, 1,540, 1,980, 2,480, 3,040, 3,670, 4,380, 5,180, 6,080, 7,100, 8,250, 9,550, 13,550.

Gaps:
180, 260, 340, 360, 400, 440, 500, 560, 630, 710, 800, 900, 1,020, 1,150, 1,300, 4,000.

Proposed stock ranges in current car order:
290, 380, 496, 646, 841, 1,095, 1,425, 1,855, 2,413, 3,140 m.

Keep tank upgrades at +3% per level, ten levels. Each next stock range still exceeds the prior car's maxed range, although the margins are deliberately small. Final car tank9 is 3,987.8 m; tank10 is 4,082 m. Capacity, prices, speed, acceleration, handling, grip, specialties, and upgrade prices remain unchanged; consumption continues to be capacity/range, so only the proposed nominal range and its derived consumption change. Existing owned-car IDs, upgrade levels, checkpoint IDs, and published bridge IDs 1–3 per biome remain valid. Do not reset saves or grant retroactive mission rewards.

Why a four-kilometre final gap: keeping pickup range290 and the strict next-stock-over-previous-max rule at +30% forces final stock range above 3,075.3 m and max above 3,997.9 m. A 1,890 m finale cannot preserve that hierarchy and tank10-only completion.

Two progression trade-offs require review rather than concealment:

1. The maxed pickup can probably reach stop4 across its now360 m gap; only the required stock stop2-pass/stop3-fail is confirmed here.
2. Cars7–9 can share stop15 as their furthest delivery. Their speed/handling/grip/range still improve, but this compact16-stop layout does not give each late car a new reachable checkpoint.

The full ten-car career matrix and alternate branches have not been revalidated.

## Rewards and hazards

All sixteen existing checkpoint base payouts are frozen in this prototype, avoiding a distance-derived payout reduction:
110, 260, 470, 730, 1,080, 1,550, 2,180, 3,020, 4,090, 5,350, 6,780, 8,460, 10,510, 12,910, 15,680, 19,460.

Hazards: 90 total, 10 movers, five crossing the center. Counts by biome are 25/26/11/14/14; each biome has two movers. All five original terrain-specific static hazard types remain. All existing true safety checks are retained: 100 m exclusion plus footprint, 120 m mover-neighbor spacing, static spacing, fork-tip checks, sightline curvature/grade, and grounded-rock checks. Independent seed42 checks found zero violations. Minimum extra exclusion margin is .176 m, so this is a feasibility packing, not generous placement slack.

Other proven count variants with this authoring approach were 74 hazards/15 movers and 69 hazards/18 movers. These are constructive examples, not global maximum claims. Keeping the old fixed patterns and four movers per biome fails in the compact route; shrinking the authoring search window is not the only issue. In particular, 220 m bridge spacing combined with 100 m+footprint hazard exclusions removes all dune-width slots between adjacent bridges, and the compact fork's separated interior is only157.47 m before tip padding.

Actual Three.js hazard scene construction succeeds with 90 hazards, 10 movers, 12 basalt rocks, eight draw calls, and 6,804 triangles. One hundred active mover updates pass. Rock pool limit remains24 and total hazard limit112; neither was raised.

## Files and next step

Isolated candidate: /workspace/scratch/e6939d35b3a6/city-ten-minute-candidate.

This folder contains reports only plus historical initial authoring scripts. The scripts are marked historical and are not a final reproduction pipeline. The isolated hazard module deliberately contains test-study authoring helpers and inactive historical code; it must be cleaned into a production implementation after design approval rather than copied blindly.

Evidence:

- packing.json: bridge capacity and approach checks
- hazard-packing.json: constructive90/10 safety checks
- forks.json: compact fork metrics
- scene.json: actual Three.js construction and update statistics
- journeys-candidate.json: four full-hazard journey checks
- journeys-tank9.json: final fuel-upgrade boundary
- manifest.json: frozen candidate file hashes

Recommended decision: approve a compact approximately13.6 km map,25 bridges,90 hazards including10 movers, the proposed range ladder/final4 km gap, and unchanged16 payouts. Implementation, production cleanup, comprehensive regressions, both-branch journeys, browser QA, and publication remain separate work requiring approval.
