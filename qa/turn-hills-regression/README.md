> Historical City35 evidence. Turn assistance was removed by the user-requested City36 handling rollback. This is not the current release result.

# City35 release regression

Only three existing production modules changed from City34: the rigid-body driving model, the road height configuration, and shared fork height/gradient evaluation. `turn-assist.js` is the only new runtime module. The other 66 tracked runtime files, including economy/save, controls, HUD, character poses, materials and camera, are byte-identical; see `runtime-scope.json`.

The historical test driver assumed the old inverse speed-reduced rack. With the new full-lock assist it inadvertently requested a U-turn while correcting toward a fuel stop at high speed. Its corrected ordinary-cornering policy lifts throttle before large steering demands and keeps steering below the assistance threshold. It never writes pose, heading, velocity, fuel or progression. Full-lock behavior is tested separately over thousands of cases.

`final.json` contains exit status and output counts for the shared regression. The independent final audit is in `../turn-hills-independent/report.json`. Full economic journeys, both route arms, fuel failures, all payouts and actual application loops are in `../network-journeys/`. Additional unsupported-tier slope segments are in `../route-hills/driving.json`.

All evidence uses actual production modules and Three.js math. DOM/rendering are mocked where necessary. The hill image is an offline geometry render. No browser, Android touch, WebGL, GPU performance or real-device frame-rate claim is made.

Final gates: 42 shared/independent suites; 70 economic journeys; 25 network mechanics scenarios; 5 complete actual-app journeys; 200 isolated slope/fork passes. Every gate passed. See `release-gates.json`.
