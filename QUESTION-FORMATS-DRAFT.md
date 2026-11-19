# Question format migration — draft, not released

## Implemented and locally tested

- Set-wide `open / quiz / write` format; no per-card format selector.
- Semicolon import with optional open answer and any number of quiz distractors.
- Shared manual/quiz/text grading, once-only callbacks and normalized text comparison.
- Shared engine in the question board, Classroom Magic Dice and SBH.
- Vocabulary words and their editor/import schema unchanged.
- Additive SQL migration retaining cards, IDs, folder/owner relationships and legacy answers.
- Ambiguous legacy sets receive `format_review=true`; cards are never automatically deleted.
- Real PostgreSQL-compatible local tests for save/read/edit, revision conflicts, permissions,
  migration reruns and preserving mixed legacy data.

## Not ready for production

No live Supabase session is available in this environment. The migration has NOT been
executed against production and actual existing sets have NOT been audited.

Online adapters for Sophie and Collections have NOT been converted to the shared
question protocol. Their RPCs currently create/check fixed multiple-choice questions
and need server-side changes for variable options, text responses and host-only
manual assessment. Manual correctness must never be accepted from an anonymous player.
Magic Dice Online format round-trip and server validation still require verification.

The compatibility table deliberately keeps current Sophie/Collections vocabulary
requirements until that work is complete. Do not merge or deploy this draft yet.
Do not treat the local engine tests as end-to-end verification of those online games.

## Remaining validation before release

1. Implement host-authorized manual assessment and text/variable-choice online RPCs;
   preserve guest joining, deadlines, idempotency, rewards and result persistence.
2. Connect Sophie/Collections adapters and verify Magic Dice Online metadata round-trip.
3. Run each format through every compatible game (including board, pairs, memory,
   flashcards and write/quiz), plus negative compatibility cases.
4. Review old UI/core test fixtures that still assume per-card editing/ABCD.
5. Read-only audit of production set formats/counts and a backup before applying
   `exercise-question-formats-20261119.sql`.
6. Apply tested migration, verify live persistence, then deploy matching frontend.

## Local checks

Use Node with jsdom and @electric-sql/pglite available in NODE_PATH:

- tests/question-formats.test.cjs
- tests/question-formats-db.test.cjs
- tests/question-format-editor.test.cjs
- tests/question-format-games.test.cjs
- tests/magic-dice.test.cjs
- tests/sbh-effects.test.cjs
- tests/sbh-sword.test.cjs

This is intentionally an incremental PR with explicit release blockers; it does not
claim the whole multi-game/online rollout is complete.
