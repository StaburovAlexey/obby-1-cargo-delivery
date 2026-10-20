# Controlled-skid route design

## Geometry and pacing

The main route remains **15,868.841887310184 m**, ending at progress 15,850. All five biome boundaries, four side forks, 16 checkpoints/refuel shelves, preview stations, elevation profile, finish and 25 bridge identities/positions/widths remain unchanged. The garage and continuous BMW canyon departure are unchanged.

There are **28 smooth bends, including nine compact bends**. Quintic heading interpolation gives zero curvature at each bend's start and end. The stronger corners occupy actual short road distances, rather than increasing heading over a long shallow arc. Every biome has at least one corner with a minimum radius below 60 m:

| Biome | Progress | Heading change | Minimum radius |
|---|---|---:|---:|
| City | 1,040–1,086 | −40° | 35.14 m |
| City | 1,190–1,230 | +30° | 40.74 m |
| Forest | 3,590–3,650 | +40° | 45.84 m |
| Forest | 3,710–3,770 | −18° | 101.86 m |
| Desert | 5,820–5,880 | −41° | 44.72 m |
| Snow | 8,520–8,580 | −34° | 53.93 m |
| Volcanic | 13,860–13,940 | +46° | 53.14 m |
| Volcanic | 14,400–14,510 | −68° | 49.43 m |
| Volcanic | 14,900–14,980 | +46° | 53.14 m |

The remaining bends retain long steering sweeps; over half the total curved distance lies in bends at least 400 m long. Straight recovery gaps separate the compact corners. The city service shelf at 1,140 stays straight. All bridge approaches retain their stricter curvature and grade limits.

Distance alone does not establish travel time or fuel consumption while physically driving. Stock/upgrade steering, speed choice, skid recovery and complete-career travel time need the separate physical input-only tests and playtest.

## Mesh safety

The ordinary mesh step stays 6 m. Compact bends use 2 m centerline, road, terrain and collision-boundary samples; the two shortest city corners use 1 m. The measured centerline derivative agrees with the exported tangent within 0.000001.

A 110 m inside terrain shoulder would fold on compact bends. The existing adaptive taper now applies to all nine compact bends, keeping the 30 m asphalt unchanged. Nearby turns share a taper to avoid widening across the previous turn. Tests cover the complete taper and joins in every biome. The city house setback and fitted canyon-entrance residences remain intact.

## Thirty moving encounters

There are **30 moving hazards**, restoring the requested total from 28. Eight-second crossings, 1.4-second dwells, dimensions and collision behavior are unchanged. All seven types remain: two repair blocks, one log, one dune, one ice patch, six rocks, seven barriers and twelve boulders.

| Biome | Before this revision | Now |
|---|---:|---:|
| City | 6 | 6 |
| Forest | 5 | 5 |
| Desert | 5 | 5 |
| Snow | 4 | 4 |
| Volcanic | 8 | 10 |

The two restored encounters use clear straight stretches in the long volcanic biome. The former forest/snow six/five counts cannot be restored by the current safe packing with unchanged bridge/service/fork exclusions; squeezing them back would compromise spacing or approach clearance. Fork branches remain obstacle-free.

Eight bend/recovery sections exclude full hazard footprints with 60–100 m buffers. Each hazard has a sampled 100 m approach on both sides with curvature at most 0.0025 (radius at least 400 m). All bridge, service, biome-join and spawn exclusions remain. Adjacent hazards stay at least 180 m apart, with no three-encounter chains in 320 m. Every sweep phase leaves at least 11.2 m on the larger passing side. The dune's wide placement window remains reserved before short movers are packed.

## Reproducible checks

```sh
node tests/controlled-skid-routes.mjs
node tests/varied-route-turns.mjs
node tests/all-hazard-motion.mjs
node tests/all-hazard-visuals.mjs
node tests/all-hazard-app.mjs
node tests/startup-hazards.mjs
node --test tests/canyon-track.mjs tests/canyon-fork.mjs tests/canyon-roadside-seams.mjs tests/canyon-frontage-infill.mjs
```

`qa/controlled-skid/routes.json` records source hashes and checks:

- 79,407 full-body recovery poses at ±8 m lateral displacement and ±20° yaw, across both fork branches
- 7,225 bridge-approach samples; maximum curvature 0.00128334 and grade 0.047873
- 32 seeds, exactly 30 moving hazards, preserved timing and explicitly tested type/biome counts
- 77,760 hazard approach samples, 25,920 moving footprint points and full-size-body bypass clearance
- Road self-intersections, terrain/asphalt overlap, all compact-bend tapers and joins, city house pairs and building/barrier footprints
- Flat service shelves, unchanged route length/stations, consistent centerline derivatives and open fork recovery

The 18 canyon tests cover the BMW entry/return, continuous road/walls and multi-frame-rate approach crossing. These offline/CPU tests do not establish browser appearance, mobile frame rate, human difficulty or full-career travel time.

## Intentional assertion changes

The route contract now expects 28 bends and nine compact bends, with a meaningful tight corner in every biome, replacing the earlier two-city-corner-only contract. The long-bend distance proportion decreases from two thirds to over half because actual compact bends replace overly shallow arcs. The tighter city minimum radius is now 35.14 m; the inside asphalt edge retains a positive longitudinal scale above 0.57 (previously above 0.67), with full-body recovery and actual no-overlap tests still required. Bridge, hazard, service, and fork safety bounds are unchanged. Seam checks use the exact quintic curvature bound at ±0.001 m rather than an arbitrary absolute tolerance, while curvature at the seam itself remains zero. All-current-hazard tests now expect 30 instead of 28, six visible basalt rocks instead of four, and 1,908 rendered triangles instead of 1,812, still in eight draw calls.

Older historical tests for ten static/twenty moving hazards or outdated checkpoint payouts describe superseded designs. They are not proof of this layout and were not silently weakened or rewritten. The commands above are the current route/moving-hazard regression set.
