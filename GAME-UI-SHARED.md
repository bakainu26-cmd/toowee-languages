# Shared TooWee game interface

This change consolidates presentation on existing game DOM nodes. It does not change room creation, anonymous join URLs, polling/realtime transport, scoring, turn rules or database schema.

## Architecture

- `game-ui.js`: idempotent GameLayout, GameHeader, GameControls, GameFeedback, GameSetupLayout, GameWaitingRoom and GameResultsScreen adapters.
- `game-ui.css`: common TooWee tokens, header/footer geometry, readable light buttons, reserved feedback space and result surfaces.
- Existing `teacher-game-setup.js` remains the materials/settings composer.
- Existing `online-lobby.js` remains the participant-list renderer. It keeps role-specific actions, participant updates and the original start/close callbacks. Host invite cards now show a selectable read-only room link as well as the code and copy controls.
- Existing game-specific boards, artwork, counts, timing settings and result renderers remain in place. No new setting is added to a game.

## Coverage

| Surface | Adapter integration |
| --- | --- |
| Match, Memory, Quiz, Write, Escape, Falling Words, Classroom Magic Dice | Existing activity-focus header/layout and common results surface |
| Classroom Swords/Bombs/Hearts | Standalone setup/play header, controls, feedback and end panel |
| Sophie and Collections | Existing common setup composer, shared online waiting room, host/player game shell, existing result content |
| Online Magic Dice | Host shared room shell/report, guest join screen, standalone player layout and result confirmation |

Only existing modes are offered: Sophie and Collections online, Magic Dice Classroom/online, remaining games Classroom. This change does not advertise unsupported online modes or add a host start gate to free-paced Magic Dice.

## Verification

The accompanying pull-request workflow checks changed JS syntax and runs:
- shared adapters for all ten game kinds, both roles and all phases; stable DOM node identity and retained handlers;
- common room participant updates, disabled/start state, role-specific actions and room link;
- existing pupil/list catalog and written Enter/IME tests;
- Playwright geometry checks and screenshots at 1280×720, 1920×1080 and 768×1024 for shared chrome under changing feedback.

GitHub Actions passed all checks for code commit af5a96fa31b391587e078d7602388d064a3acd43: JavaScript syntax, shared DOM/lobby tests, pupil/list scope, Enter/IME, Sophie room start, a full Collections host/pupil round against local PostgreSQL-compatible SQL, two-player Magic Dice final-result synchronization with lost-ACK retry, and Chromium fixed-geometry tests at all three resolutions. Screenshots are attached to run https://github.com/bakainu26-cmd/toowee-languages/actions/runs/43958322353 . Tests load the shared layer in the real game controllers.

The viewport fixture tests the common shell, not every game's actual board. No interactive production browser or authenticated production database was used.

Before merging, review the CI result and screenshots, then test actual Classroom boards (especially Collections and multi-player Dice) at the target sizes, and a real two-client online join/start/answer/end/result-save flow. Synthetic DOM and geometry tests cannot establish production synchronization or statistics writes. Configuration and long statistical reports may scroll within their content panes; the playing shell keeps the header/footer fixed. Native board fitters remain responsible for their board internals.

Rollback: revert this change. No data migration or data repair is required.
