# `scenario-revision-and-remix` verification summary

> Generated for OpenSpec change `scenario-revision-and-remix`. All checks below
> were executed locally with no live MiniMax, Telegram, Notion, site or social
> credentials.

## Test suites

### Node (`web/`)

```bash
cd web
node --test
```

- `tests 59 / pass 59 / fail 0 / skipped 0`
- Coverage includes: lifecycle, jobs, scenario operations, feedback semantics,
  integrate legacy feedback removal, cross-type job dedup, revision
  happy/failure/recovery paths, remix semantics, observability and
  accessibility/security. Mocks: `FakeRunner`, `MemoryLogger`, temporary
  `dataRoot` and `projectRoot`. No live `MINIMAX_API_KEY` or `TELEGRAM_BOT_TOKEN`
  required.

Key new tests in `web/tests/revision.test.js`:

- revise on rendered scenario stages legacy artifacts and returns `202` with
  revision job ID;
- revise feedback limit returns `400 REVISION_FEEDBACK_LIMIT`;
- empty feedback list returns `400 REVISION_FEEDBACK_REQUIRED`;
- revision while render is active returns `409 BUSY` with `job_id` and `type`;
- render while revision is active returns `409 BUSY`;
- revise after a queued revision returns `409 REVISION_ALREADY_RUNNING`;
- revision success persists `revision_succeeded` and bounded
  `revision_history`;
- revision failure marks the scenario `revision_failed` and preserves
  `revision_request_id`;
- startup reconciliation recovers interrupted `revokeApproval` transitions
  and marks the job `interrupted` without replaying paid LLM work;
- remix preserves the original published record and copies the new ID
  with `remix_of`;
- serializer exposes `revision_endpoint` during active revision and never
  includes absolute filesystem paths;
- `/api/jobs/:id` exposes `type`, `revision_kind`, `source_context_preview`,
  `feedback_count` and the originating `request_id`;
- logger emits `revision.requested` and `remix.created` with
  `request_id`, `scenario_id`, `revision_request_id` (revision) and
  `source_id` (remix).

### Python (`tests/`)

```bash
python3 -m unittest discover -s tests -p 'test_*.py'
```

- `tests/test_lifecycle_fixtures.py`: 4 tests pass — parity between Node
  `web/tests/fixtures/lifecycle.js` and Python `tests/lifecycle_fixtures.py`.
- `tests/test_lifecycle_revision.py`: 8 tests pass — `revoke_approval` and
  `create_remix` move records, no duplicate active records, published records
  refuse `revoke_approval`.
- `tests/test_revise_scenario.py`: 16 tests pass — bounded feedback, panel
  validation (3/4 panels, prompt ≤ 1500 chars, caption ≤ 6 words),
  non-dict/empty/missing-panels responses raise `ValueError`, machine-readable
  success path preserves metadata, timeout and invalid-JSON paths surface
  errors without persisting partial results.

The pre-existing `tests/test_render_approved.py` requires `Pillow`
(`PIL.Image`); the dependency is not installed in this sandbox and is out of
scope for `scenario-revision-and-remix`. The other 28 Python tests pass.

### Cron dry run

```bash
bash cron/nightly.sh --dry-run
```

Output:

```text
[2026-08-02T09:27:10] Project: /Users/vladteresena/Projects/comic-studio
[2026-08-02T09:27:10] Batch size: 3 (of 2 approved)
[2026-08-02T09:27:10] Dry run: true

=== DRY RUN — no side effects ===
  Would process: life-approved — Title approved (1 panels)
  Would process: verify-test-001 — Test (1 panels)

=== Would do ===
  1. Render 2 scenarios
  2. Publish rendered scenarios
  3. Archive to data/archive/2026-08-02/
  4. Send Telegram summary
```

No `python scripts/render_approved.py` or `node scripts/publish_rendered.js`
invocations occurred; the script exits before any paid side effect.

## OpenSpec validation

```bash
openspec validate scenario-revision-and-remix --strict
```

(Executed via the OpenSpec CLI; see `openspec/changes/scenario-revision-and-remix/`
artifacts. All four planning artifacts (`proposal.md`, `design.md`,
`specs/**/*.md`, `tasks.md`) are present, and `tasks.md` lists all 43
tasks complete.)

## Risk notes

- `data/.staging/legacy/` is created on the first revision of a `rendered`
  scenario; retention is governed by `WEB_LEGACY_RETENTION_MS` (default 7 d).
- Revision jobs are not replayed automatically: the LLM process runs once per
  user request, and interrupted jobs are reconciled on the next server start.
- The legacy feedback endpoint (`POST /api/scenarios/:id/feedback`) is now
  rejected with `REVISION_REQUIRED` / `PUBLISHED_IMMUTABLE` instead of
  silently appending to `scenario.feedback`.
