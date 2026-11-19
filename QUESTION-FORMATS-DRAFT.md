# Exercise question formats — deployment candidate

Each exercise set has one format: open, quiz or write. Vocabulary storage and editing remain unchanged.

The additive migration classifies existing cards without changing them. Ambiguous sets are flagged for review. Explicit user edits can select a format; original answer/distractor fields remain in the draft and database. Names, IDs, owners, folders and revisions are retained.

The shared browser question engine supports manual, arbitrary-choice and normalized text grading. Classroom SBH and Magic Dice and the question board use it. Quiz/write practice uses the same comparison. Memory/matching/flashcards still require answers; no artificial answers are generated.

Online Sophie and Collections load owned exercise sets directly into existing room snapshots, keeping vocabulary data separate. Guest links, clocks, rewards and result storage retain the existing protocols. Text grading occurs on the server; open-question grading is restricted to the room host and is idempotent. Magic Dice forwards host manual assessments through its existing synchronized player state.

Apply `exercise-question-formats-20261119.sql` before `exercise-question-online-20261119.sql`, then deploy the matching frontend. Both scripts are transactional and rerunnable. Do not overwrite newer live function definitions without reviewing them first.

Validation covers homogeneous import/editor/save/read/edit, migration reruns, preserved old records, 30 format/game compatibility paths, shared grading, online protocol owner/host isolation, reward/turn behavior, legacy game regressions and real Chromium question controls on desktop/tablet/mobile. Production verification must compare pre/post existing-set counts and card hashes and test private fixture persistence before cleanup.

This file retains its original PR draft filename for continuity. The PR status and deployment report record whether the rollout has completed.
