# Version 25 driving baseline

These two JavaScript files are the exact source from the published version25 before the force-based vehicle implementation:

- `driving-model-v25.js`: previous Tow-derived bicycle kinematics
- `app-v25.js`: matching application integration

They are retained for comparison and a deliberate rollback. The historical numeric oracle is exercised by `node tests/tow-baseline.mjs`; it describes only version25, not the new rigid-body dynamics.

A source rollback restores both matching files to `dist/driving-model.js` and `dist/app.js`. The saved published Site version25 and source ZIP version24 also remain available in version history. Any deployment should be done through the normal Site publication workflow after checking the selected source state.
