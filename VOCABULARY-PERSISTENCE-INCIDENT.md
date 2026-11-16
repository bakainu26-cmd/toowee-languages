# Vocabulary persistence incident — 2026-11-16

Production status: **unresolved until authenticated database evidence is available**.
No production rows have been inspected, changed, recovered or deleted by this work.
Do not treat local test results as evidence that Robert's production data exists.

## Safe production diagnostic

Run `diagnose-vocabulary-readonly.sql` in the project's Supabase SQL Editor and retain all result sets. It is a read-only transaction, ending with ROLLBACK. It reports all pupils, exact owner/profile/list/folder IDs, languages, counts and dates; unassigned lists; words without a list; Robert's candidate profiles; RLS policies and backend fingerprints. It does not expose vocabulary text or modify data.

Use exact IDs and creation times to determine whether Robert's missing materials are (a) present with correct links, (b) present without links, (c) attached to another profile/language/teacher, or (d) absent. Do not infer ownership from matching names. Any recovery must be restricted to positively identified rows and preserve original names. The diagnostic deliberately does not reassign rows automatically.

If physical rows are present but the profile RPC returns no words, compare the authenticated user's ID, selected profile and language against report #1, then check the actual function version and RLS from #5. Compare a database read with the same user's authenticated RPC; SQL Editor's privileged visibility does not prove authenticated visibility.

If rows are absent, inspect `toowee_cleanup_archive` if present, Supabase project backup/PITR availability and relevant audit/database logs. Do not run the old cleanup script as a recovery operation. Restore backups into an isolated database first and extract only verified missing records. Availability of any production backup or archive contents has not been verified here.

## Code changes

- List-word insertion requests returned IDs and refuses success if the database does not acknowledge every ID.
- Errors from opening/reloading the pupil profile propagate to the save dialog; the dialog cannot report success after a swallowed reload error.
- Opening a pupil outside a language-specific sidebar uses a language present in server-backed pupil metadata if the current selection is invalid. A default English filter could otherwise display zero Japanese words. This is a confirmed code path, not a confirmed cause of Robert's incident.
- Late read responses are rejected after changing pupil, language or account, and malformed responses are reported as read errors rather than empty lists.
- Folder creation verifies a newly returned folder with the entered name and expected pupil/language.
- Earlier protections retain exact list names, scope lists to an owned pupil folder and reject switching to a different server-returned list ID.

## Validation

`tests/vocabulary-persistence.test.cjs` uses actual local PostgreSQL-compatible SQL (PGlite) in a filesystem database, not mocked row storage. It creates two synthetic pupils and two languages, saves named folders/lists/words, repeatedly reloads, switches identities and pupils, closes and reopens the database, and checks ownership and RLS. These synthetic tests do not touch production.

`tests/teacher-pupil-list-create.test.cjs` covers actual UI callbacks with a mocked API: correct pupil/list ownership, names, empty-profile creation, acknowledgement IDs and propagation of a wrong-list response.

A real browser refresh/logout/login against production and recovery of Robert's records still require an authenticated production session. Release remains blocked until those checks pass.
