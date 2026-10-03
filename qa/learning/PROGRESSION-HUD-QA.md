# Progression HUD verification

## Result

`node tests/progression-hud.mjs` passes 17 checks. This targeted suite uses the actual `tests/fixtures/app-dom.mjs` app harness, Three.js camera math, progression configuration, SVG definitions, and CSS source. Runtime source files were not edited by this verification task.

Covered:
- Five school labels, free/owned/locked/affordable/insufficient states, decimal rates, lock and currency icons.
- Explicit school and skin purchase handlers, immediate action-HUD update, floating-label ownership on the next animation frame, and all 17 skin prices.
- Brain balance formatting and accessible balance label; per-car upgrade prices, levels, insufficient brains and maximum states.
- Upgrade dialog focus cycling, Escape/Close/backdrop dismissal, menu exclusion and pointer/touch-event containment.
- Prompt and label visibility during walking, driving, seated/airborne state and overview.
- Three real app camera views plus dense coincident-label spacing and recovery to full size.
- Fourteen source-derived narrow upgrade grid width budgets, text wrapping, minimum touch-target declarations, safe-area padding, scrolling and reduced motion.
- Narrow MAX button budget and CSS specificity regression: the explicit ID-specific 13 px font, 2 px side padding and 3 px gap use 79.171875 px of the 85 px track with the measured DejaVu Sans Bold Cyrillic label. This leaves 5.828125 px for additional visual margin.

## Diagnostic image

`progression-hud-specimen.png` was generated and visually inspected at 1120 × 1000. It uses the actual SVG paths extracted from `dist/index.html`, plus text and states captured from the running Node app fixture in `progression-hud-state.json`.

It shows:
- The five book/brain school symbols and rate/cost states.
- Brain currency HUD.
- Desktop and narrow illustrative upgrade panels with maximum, insufficient-brain and available states.
- Actual individual native SVG symbols at 47 px.

The specimen is an illustrative layout, not a browser screenshot or CSS layout capture. Native CPU-only librsvg/Cairo performed rasterization. The desktop button illustration and narrow button illustration are specimens; the narrow price contents are centered using a measured fallback glyph width. Fontconfig emitted nonfatal cache-directory warnings; rendering completed and the PNG was inspected. The companion SVG and renderer script are included for reproducibility. Run `python3 qa/learning/render-progression-specimen.py` to rerender the saved fixture-state specimen.

## Verification limits

No browser was launched or retried. No alternate browser route, network listener, Android device, physical touchscreen or GPU validation was attempted. DOM layout, font shaping in the user's browser, CSS animation timing and actual device performance remain unverified. The fixture checks event/state contracts rather than browser hit testing.
