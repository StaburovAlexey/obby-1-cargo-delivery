# Shared modal presentation

The user-provided Missions screenshot is the visual reference: cobalt panel (#243f85), light inset top edge, dark border/scrim, bold white heading, red square close button, blue actions with light borders.

`dist/modal-ui.css` supplies the shared overlay, panel, header, close, action and focus styles. Load it after feature styles. Static HTML opts in with `game-modal`, `game-modal-panel`, `game-modal-heading`, and `game-modal-close`; dynamic UI uses `modalPart` from `dist/modal-ui.js`. Feature IDs remain unchanged for lifecycle ownership. Shared selectors deliberately outrank legacy ID styling.

Coverage: settings (including help/licenses), upgrades, missions, delivery earnings, developer biome chooser, hangar drift leaderboard, and dynamic livery shop. Canyon results remain a non-blocking region because driving continues there. World purchase prompts, loading and error surfaces are not dialogs.

Content-heavy panels keep scrolling bodies; short landscape shop uses whole-panel scrolling with a sticky close/header. All panels use border-box sizing, viewport/safe-area limits, 44px close/action targets and visible keyboard focus. Existing pause, inert, Escape, backdrop and restore-focus owners remain unchanged. No economy, assets, purchases, livery ownership, preview cancellation or Apply behavior changed.

Validation: shared primitive/source contracts, settings lifecycle and real-app mock integration, receipt lifecycle, career input isolation, leaderboard app integration, livery UI and app integration, Yandex/VK production builds. Browser visual testing was attempted but unavailable in this execution environment; Node mock tests are not visual QA.
