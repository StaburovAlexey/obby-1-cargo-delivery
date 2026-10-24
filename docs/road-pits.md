# Road pits and forward jumps

Approved 2026-10-23: add two deep avoidable pits and one full-width jump per
biome (15 total), keep/reposition all90 existing movers, fail to garage via
existing rules, all11 stock vehicles can jump with adequate run-up. One forward
ramp only. Preserve drift/controls, previous performance work,25 bridge IDs,
career/save/network formats. No commit/push/deploy requested.

## Shared implementation contract

`dist/road-pits.js` owns pure immutable descriptors and helpers. Export
`buildRoadPits(seed=42)` returning an array of15, `roadPitAt(pits,x,z,margin=0)`
returning pit or null (pit mouths only, not ramps),
`roadPitRampHeight(pits,x,z)` returning ramp support height or undefined, and
`roadPitReservations(pits)` returning `{from,to}` global route-distance ranges.

Descriptor minimum:
- id, type (`pit`/`jump`), biome, edgeId, edgeDistance, progress, distance;
- x,z,heading,height (original reference height), offset,width,length,depth;
- cutFootprint: ordered simple worldXZ polygon covering the actual hole;
- ramp: null or `{length,height,width,offset,footprint,fromEdgeDistance,toEdgeDistance}`;
- reservation: `{from,to}` in global THREE-DIMENSIONAL route distance.
All poses from pointOnEdge; edgeDistance is local3D distance, not progress.

Ordinary pits:21m transverse (70% of the30m road) ×18m along,20m deep,
offsets−4.5/+4.5. Seeded jagged outlines include concave breaks; the opposite
side retains a contiguous9m bypass. Membership/margins, visible cuts, physical
walls and floors all use the same outline. Concave cuts are decomposed into
triangles; floors are triangulated, rather than filled with a triangle fan.
Jump:18m along,20m deep, roadwidth30m; hole must remove reachable shoulders too
(use cutWidth224m across the existing220m landscape). One takeoff wedge width5.3,
length24,height2.4;40m clean approach BEFORE ramp,100m clean landing AFTER gap.
Road grade/curvature across jump reservation≤5%/.003; local ramp through first30m
landing≤2%/.0015. Candidates every5m outside existing bridge, checkpoint,
preview, fork, biomejoin, canyonentrance and technical-recovery zones. Prefer
midbiome jump, quarter/three-quarter ordinary pits. Existing movers repack
around reservation ranges including their full swept longitudinal envelopes.

`buildCity(THREE,{seed,roadPits=[]})` accepts catalog (default empty preserves
standalone fixtures). App generates pits first, passes same catalog to city,
gameplay walk guard, safety checks and createRoadHazards(seed,{reservedIntervals}).
Canonical route membership/height remains unchanged; physical support differs.

`buildRoadPitMeshes(THREE,pits)` in road-pits-scene returns a THREE.Group with
merged indexed meshes named `Road pit walls`(physics wall), `Road pit floors`
(physics ground), `Road jump ramps`(physics road), plus flat warning paint. Warning sign panels before pits and ramps are omitted;
approach chevrons are omitted throughout the route; ramp guide paint remains. Rim paint patches do not overlap
and use a separate depth-biased material to avoid fighting the road surface.
No separate runtime physics body. City owns disposal and spatialStatic tagging.
Cut road, ground AND landRoad cliff-source using hole and ramp footprints;
exclude newly created hole/ramp boundary edges from default48m cliffs, since
custom pit20m walls own these. Full original perimeter collider data remains
for unchanged old edges. Ramp must replace flat road, not overlap hidden floor.

## Acceptance

- TDD descriptor counts/exclusions, immutable deterministic placements/reservations,
  all90 movers retained and disjoint including swept envelopes.
- Cut geometry and downward Rapier rays show no support at original roadheight
  in pit; walls/floor atdepth20; no duplicate cliff walls or old road below ramp.
- All11 real metadata ×5 surfaces: genuine flight ≥6 consecutive60Hz ticks
  without wheel rays/chassis contacts; body clears farlip and upright safe
  landing in road footprint. Include low approach and90%/full stock speed.
- All ordinary pits allow largest car bypass; stopped bottom/failed jump returns
  garage using ORIGINAL reference road height−12 and existing.65s timer.
- Successful jump retains route/delivery validity; walking/spawn disallow void;
  advertising deferred through approach/flight/landing; bfcache/rebuild/dispose.
- Profiled static batching/culling; terrain/Rapier/render/career regressions;
  Yandex+VK builds and browser visual inspection. No phoneFPS guarantee.

## Execution ledger

1. Catalog and hazard reservation/repacking.
2. Cut geometry, pit meshes, rim ownership.
3. App/physics/walking/ad integration.
4. Physical matrix and application regressions.
5. Full review, checks, builds, visual QA and result report.

## Initial full-width ramp calibration

The initial16m ramp was only a sizing starting point. Actual city tests exposed
fast-car underbody entry impacts and late nose dives on some legal slopes.
A24m linear ramp at the same2.4m height, with legal placement reselection and
an expanded170m reservation, passed all165 actual11car×5biome×3speed runs,
including full stockcap, and all20 wide/long-car bypass cases without changing
vehicle forces or relaxing six-tick flight or all-four-corner clearance gates.
User explicitly requires full gas on every car. Production acceptance includes
full-speed stock runs, not just the low approach calibration. Allprevious
performance work and current branch remain in place.

## Verification before the jagged-pit / narrow-ramp revision

- The five critical jump stations are pinned to the calibrated fixed road for
  every seed (city edge1437, forest1187, desert1432, snow752, volcanic372).
  Ordinary pit variation remains seeded. Snow's calibrated progress is9251.679.
- Real Rapier/city acceptance:248/248Node checks, including220 actual drives
  (11 real models ×5biomes ×low/90%/full-stock/max-upgrade modes),20ordinary-pit
  bypasses by the wide/long cars, real deep floors, no hidden ramp support,
  and a failed-launch fall. Every drive retained≥6strictcontact-free60Hz ticks,
  positive clearance for allfour lower chassis corners, upright stable landing
  inside the road. Worst maximum-upgrade landing stabilized71.80m past the
  far bank, within the100mclear zone. Vehicle/input/drift force modules unchanged.
- Catalog9/9focused checks and32seed packing sweeps preserve15pits/90movers,
  allreservation envelopes and60mextra/180mbase separation. Assign each biome
  its own blocked base movers before placing unavoidable overflow globally;
  the snow ice remains inSnow. Default no-reservation hazard output is unchanged.
- Full `npm test` passed camera, delivery, biome/progression, legacy vehicle
  dynamics and actual Rapier application checks, then stopped at
  `tests/driving.mjs` (14/25). All11failures and their exact messages were
  reproduced using saved pre-pit application/fixture sources; this is not a
  green full-suite result. Logs are under `/tmp/obby-road-pits/` for this run.
- Browser geometry QA inspected true ordinary holes and the gray, marked24m
  ramp. Render meshes remain four indexed static batches with shared material;
  the city scene is about145k triangles versus136k before these obstacles.
  SwiftShader screenshots are appearance checks, not hardware FPS evidence.

Final checks after promoting the calibrated stations: feature contracts21/21,
rendering51/51, and both Yandex/VK builds successful. The actual frontend reached
ready with15pits,90movers,five24mramps and the devprofiler. Separate browser
views inspected both ordinarypits and jumps in allfivebiomes. The only frontend
console errors were expected localhost WebSocket connection failures because
this isolated smoke check had no room backend.

### Existing driving-suite failures reproduced before this feature

- Exact deadzone, nonlinear steering response, and exponential response
- Uphill and cross-slope body orientation agrees with wheel contacts
- Input starts in D with zero throttle and no invented keyboard driving
- 135-degree wheel gesture starts throttle and release clears/coasts input
- Only the captured pointer moves/releases; cancel and capture-loss reset
- D/R panel, labels, handle, and second pointer each toggle exactly once
- Documented non-primary first-grab safety adaptation works
- Resize, blur, hidden tab, disable, repeated reset, and destroy release input
- Integrated input release coasts; safety reset clears rigid-body velocities and visual springs
- Selected vehicle follows with the requested unrestricted fixed-radius camera
- Application mode switches keep regeneration locked in a car; top Garage clears held throttle

## 2026-10-24 booster revision

Jump mouths extend from 3m before the reference station to 15m after it
(18m total), with chipped banks and an intact takeoff seam. Ramp placement,
width and slope stay unchanged. Cyan decks and large yellow uphill arrows
identify the boosters. Loaded tire contacts on the ramp receive up to 65m/s²
along its slope toward 38m/s while driving forward without braking.
No boost is applied in the air or away from the pad. Flight/landing for every
vehicle remains unverified for this revision; tests were explicitly deferred.
