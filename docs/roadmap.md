# Comic Studio Roadmap

## Recently implemented: `scenario-revision-and-remix`

The `harden-web-server-api` change deliberately left feedback as a transitional
placeholder. The `scenario-revision-and-remix` change (now archived in
`openspec/changes/archive/`) delivers:

1. `revise_scenario()` in Python: bounded feedback history (≤ 20 items) and
   the same `MAX_CONTEXT_CHARS`/`STYLE_TEMPLATES` as ingest, with validation
   for 3–4 panels, prompt ≤ 1500 chars, caption ≤ 6 words.
2. Atomic revocation (`approved|rendered → draft`) with `revision_status`,
   `revision_request_id`, `revision_at` and `revision_source` before any
   LLM call. Rendered artifacts are moved to `data/.staging/legacy/<id>-<ts>/`
   with a manifest for retention-driven cleanup.
3. Atomic persistence of revised panels/prompts/captions with a fresh
   `revision_at`, `revision_status: revision_succeeded`, bounded
   `revision_history` (last 10) and `feedback_count`. The pre-success
   `revision_queued` entry is preserved for audit.
4. Recoverable `revision_failed` state with bounded `revision_error`. The
   scenario remains unapproved, but feedback and source context are
   preserved for a manual retry.
5. Re-review and manual approval after every successful revision. Render,
   re-render and publication are blocked until a fresh `approved_at` is set.
6. Published immutability: `POST /api/scenarios/:id/revise` returns
   `PUBLISHED_IMMUTABLE` and points the client at
   `POST /api/scenarios/:id/remix`, which creates a new draft with a fresh
   ID and `remix_of: <source_id>`.
7. Stale rendered artifact handling: `data/.staging/legacy/<id>-<ts>/` is
   retained for `WEB_LEGACY_RETENTION_MS` (default 7 days) and never touches
   `data/archive/`. Cleanup failures move manifests to `data/.trash/`.
8. Telegram and Web UI parity: Telegram inline keyboards expose explicit
   `🔄 Revision` and `🎨 Remix` actions; the Web UI now uses revision/remix
   cards with the same status badges and help text.
9. Mocked tests covering revise, remix, cross-type job dedup, recovery and
   parity between Python `tests/lifecycle_fixtures.py` and Node
   `web/tests/fixtures/lifecycle.js`. No live MiniMax, Telegram, Notion, site
   or social credentials are required.

The change is fully reflected in `docs/api.md`, `docs/workflow.md`,
`ALGORITM.md`, `CLAUDE.md` and `README.md`. The placeholder wording
**«запрос на правку сохранён»** is removed; UI and Telegram now report the
actual revision or remix state.

## Additional follow-ups

- Apply the shared lifecycle fixtures to Telegram and Python transition helpers.
- Reconcile publisher/site/social/Notion behavior with the publication OpenSpec contract.
- Repair nightly per-scenario publication, ordering, exit codes and archive naming.
- Implement optional automatic approval of bounded revisions after a single
  successful LLM run (currently every revision needs a fresh manual approval).
- Add explicit revision polish tooling (e.g. panel-level edit, not full re-run).
