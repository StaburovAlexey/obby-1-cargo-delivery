# Normal-size wheel with transparent touch rim

The wheel and pedal geometry are restored to the pre-enlargement Site53 CSS. The only extra runtime rules are a circular transparent hit rim (32 px, or 24 px on short landscape), visible overflow for that rim, and pedal hit-test priority. No runtime JavaScript or assets changed relative to Site54.

The existing production input already owns wheel gestures by pointer ID and uses pointer capture plus window fallback. A new gesture starting just beyond the old hit area could instead start on the camera canvas. The rim expands that initial target without changing the artwork size, center, angular sensitivity, or vehicle behavior. It does not steal a separate camera pointer already started outside the rim.

`npm run test:wheel-touch` checks 48 structural layout cases, actual input and camera handlers, starts around the rim, drags beyond every boundary, capture failure, two listener orders, multiple control pointers, up/cancel/lost-capture, resize/blur/hidden/reset/disable/destroy, real app menus, delivery receipt and garage transitions. CSS/pointer tests are offline; no browser or device hit-test rendering is claimed.

All 20 movers, eight-second motion, 26 turns, weather blending, centered earnings receipt, hidden savings launcher, purchases and save/economy data are preserved. Source fingerprints are recorded in `preserved.json`.
