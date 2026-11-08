# Shared preparation screen for every game

Every new game must use the approved TooWee composition: game icon and title, two cream bordered cards (Materiały / Ustawienia rozgrywki), and a bottom summary with a dark plum primary action. Reuse the approved watercolor artwork in teacher-game-setup.css. Do not introduce another game-specific settings page.

- Existing vocabulary games use mountTeacherGameSetup.
- Form-based games use mountTooWeeGameForm from teacher-game-setup.js. Pass the original form, submit button, language/range selects and getWords callback. The helper keeps original submit handlers and validation.
- Student context remains fixed when the teacher has already selected a pupil. Materials include date periods, folder → list navigation and direct list selection; use search and tile/list controls.
- Store game-specific settings in the right card; do not duplicate material selects there.
- Call host.tooweeSetupCleanup before leaving or reconstructing a persistent form. It restores native controls and disconnects observers.
- New games must be checked for reopening, correct selected word IDs, language changes and native submit behavior.
