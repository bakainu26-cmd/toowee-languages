# Pixabay image library: staged deployment

Infrastructure has been applied to project bqduwzbcnfujuthefauu. The private `toowee-media` bucket and metadata/cache/rate tables are additive. Existing vocabulary, cards and images are not rewritten. `toowee-images` is deployed with JWT verification and validates the current user with Auth, then checks the server-held teacher/admin role. No external paid service or plan change is enabled.

## Activation

Set `PIXABAY_API_KEY` in Supabase Dashboard → Edge Functions → Secrets. Do not put this key in JavaScript, SQL, git, or chat. The deployed function reads the secret from its environment. Search returns an explicit configuration error when the secret is missing.

API actions: `status`, `search`, `select`, `mine`, `resolve`; uploads use image bytes with the Authorization header. Search filters include en/pl/ja/es and all/photo/illustration; only safe-search results are requested. Responses are cached 24 hours. The shared provider budget is 80 calls/minute; per-user search budget 20/minute. Assets are downloaded only on user selection, not while browsing. Provider downloads and redirects are restricted to the exact HTTPS pixabay.com/cdn.pixabay.com hosts. Input file bytes are streamed with a 5 MB cap and checked against PNG/JPEG/WebP signatures. Uploaded content is SHA-256 deduplicated per owner. Files are immutable and are never physically removed by this endpoint.

## UI component prepared, not yet published

`TooWeeImageLibrary.pick({query,lang})` returns an asset with durable `id`, source metadata and a **temporary preview** URL, or null on cancel. It supports one-click selection, pagination, photo/illustration filters, own assets, clipboard, drop, file upload and URL import. URL downloads run in the browser (with CORS) instead of accepting arbitrary URLs in a privileged server fetcher. Sites blocking browser downloads need file upload instead. Never store the expiring preview URL in vocabulary/card fields.

## Remaining release gates

- Test an actual Pixabay search and download after the secret is configured.
- Bind persistent asset IDs to existing vocabulary/card storage and add permission-checked resolution for assigned pupils and scoped guest rooms. The current endpoint intentionally resolves only a teacher's own library.
- Integrate the shared picker with existing word/question editors, flashcards and game renderers only once permanent references and guest access have been tested. Current production editors remain untouched, so no expiring URL can be accidentally persisted.
- Automatic import jobs, preference switches and summary UI are not yet enabled. Pixabay's published restriction on large numbers of automated queries requires provider clarification before activating batch illustration searches. No AI image generation is used.
- Apply bounded retention maintenance for cache/rate history before a broad public launch.

## Checks

Run `node tests/image-library-core.test.cjs`, `node tests/image-library-ui.test.cjs` (jsdom), `node tests/image-library-db.test.cjs` (PGlite). They cover input/host validation, streamed size limits, MIME signatures, cache key generation, hiding download URLs, owner isolation, denied cache/rate access, atomic budgets, picker cancellation and account switching. They do not substitute for real-provider tests or material/game integration tests.
