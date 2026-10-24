# Showcase cars

These GLBs are unchanged copies of the four user-supplied models in `new/1`.
`manifest.json` records their original filenames and SHA-256 hashes.

`showcase-vehicle-catalog.js` provides explicit bundled URLs and source-forward
corrections. `showcase-vehicles.js` normalizes them to at most 8m long / 4.65m
wide, separates connected wheel geometry while preserving vertex attributes,
and derives four real wheel contacts. Render steering and wheel spin use those
contacts. Dynamics use the existing BMW rear-wheel drift model and matching
catalog handling, grip, speed, acceleration and fuel values.

Each car has a separate BMW-style pedestal. The four cars start locked in both
normal and developer sessions. Developer sessions can unlock one at its floor
marker with the Unlock button; the grant lasts for that gameplay session and
is never written into the production career. No normal-game acquisition rule
has been introduced. Locked cars use opaque unlit black materials; source
materials return when the car is unlocked. Locked models have no underglow and
are excluded from the existing livery previews, preventing appearance leaks.
