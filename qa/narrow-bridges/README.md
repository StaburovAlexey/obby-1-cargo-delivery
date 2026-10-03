# Single-car bridge crossings

15 bridges: three in each ordered biome, all on common road edges so either fork choice encounters them. Each deck is 5 m wide and 24 m long; all ten rigs share a 3.07 m outer tire track. There are no guardrails. Flat yellow edge paint and a yellow 0.85 m underdeck mark the crossing. A once-per-run warning appears 90 m before each crossing. At least 25 m of clear approach lies at both ends; existing hazards are more than 70 m away.

Road and terrain triangles are clipped at exact route progress boundaries. No full-width terrain remains alongside a deck. Existing roadside blocks are omitted at gaps. During driving, outer tire patches are checked against deck width before rewards or ground fitting. Lost support freezes horizontal simulation and animates a 1.55 s directional tip, outward slide and rotating fall, then clears cargo and returns to the hangar without payout. Ownership and earned balances remain saved. Hidden tabs and overview pause the fall. No changes to the current halved handling/grip or turn assistance.

QA uses production app and Three scene graph with a mocked DOM/renderer. Browser, GPU and Android behavior have not been verified. geometry-plan.png is an offline view of actual triangle coordinates, not a screenshot.

## Directional tipping update

The remaining tire support polygon includes both wide approaches and the narrow deck. Its convex boundary supplies a stable hinge, including diagonal corner entries. The starting road-fit transform, body suspension and wheel pose are captured before stopping the driving solver. The first 0.42 s tips about the support hinge, then rotation continues with continuous angular velocity while outward slip and gravity accelerate. Front/back/left/right tipping follows vehicle orientation. Normal driving coefficients and bridge width remain unchanged.

## Wider bridge deck

All 15 decks widened from 3.8m to 5m at user request. Rendering, tire support, edge pivot and fall clearance share the same halfWidth=2.5 configuration. Current margin for straight outer tire envelope is0.965m per side. No driving coefficient or tipping timing changed.

## Lateral bridge and biome effects update

Seed42 now assigns one left, one center and one right bridge to each biome. Offsets remain deterministic across reloads and shared by mesh clipping, edge paint, tire support, pivot and clearance. Warnings name the side. Lava rocks are permanent ground obstacles (no warning shadow or timer). Weather uses one fixed128-point pool; visualonly and hidden in city/hangar/menus/pause. The upgrade icon is round beside Hangar. New targeted suite: npm run test:biome-effects. Legacy timed-rock assertion groups describe the superseded falling-rock mechanic.
