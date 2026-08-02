## 1. Configuration and CLI Foundation

- [x] 1.1 Add `WEB_REVISION_TIMEOUT_MS`, `WEB_REVISION_OUTPUT_LIMIT`, `WEB_MAX_REVISION_FEEDBACK_COUNT` and `WEB_LEGACY_RETENTION_MS` to `web/lib/config.js` with bounded validation.
- [x] 1.2 Document the new keys in `.env.example` with safe defaults that match the render limits.
- [x] 1.3 Add `--json-result`, `--feedback-file`, `--source-context` and CLI options to `scripts/revise_scenario.py` while keeping the new entry point shell-disabled.
- [x] 1.4 Implement `revise_scenario()` in `py/scenario/writer.py` that reuses `MAX_CONTEXT_CHARS`, `STYLE_TEMPLATES` and the MiniMax chat endpoint and returns a JSON serializable result.

## 2. Scenario Store and Lifecycle

- [x] 2.1 Extend `web/lib/scenario_store.js` with `revokeApproval(id, requestId)` that atomically moves `approved|rendered → draft`, sets `revision_status: revision_queued`, `revision_request_id`, `revision_at` and clears stale approval timestamps.
- [x] 2.2 Add `createRemix(sourceId, idGenerator)` that copies a published scenario into a new draft, adds `remix_of` and `remix_created_at` and preserves the source record unchanged.
- [x] 2.3 Implement `moveToLegacyStaging(id, clock)` that relocates rendered artifacts to `data/.staging/legacy/<id>/<timestamp>/` with a manifest and keeps a recoverable `data/.trash/` fallback.
- [x] 2.4 Add `cleanupLegacyStaging(retentionMs)` that prunes legacy staging older than the configured retention window and never touches active jobs or archive content.
- [x] 2.5 Persist `revision_history` with at most 10 entries per scenario and expose it through the safe scenario serializer.
- [x] 2.6 Expand reconciliation in `reconcileTransitions` to recover interrupted `revokeApproval` updates without leaving the scenario in approved or rendered state.

## 3. Job Manager and Process Runner

- [x] 3.1 Add `enqueueRevision({ scenarioId, sourceContext, feedback, requestId })` to `web/lib/job_manager.js` that creates a `revision` job, deduplicates against any active render or revision job and reuses the existing keyed lock.
- [x] 3.2 Extend `web/lib/job_store.js` to accept `type: 'render' | 'revision'` and to include `revision_kind`, `source_context_preview` and `feedback_count` in serialized job records.
- [x] 3.3 Update `activeForScenario` to detect both job types and to return a `BUSY` conflict when either type is queued or running.
- [x] 3.4 Make `markInterrupted` cover revision jobs and preserve the originating `revision_request_id` so retries do not lose context.
- [x] 3.5 Confirm `process_runner.js` still enforces shell-disabled execution, timeout handling and machine-readable result parsing for the new `scripts/revise_scenario.py` CLI.

## 4. Web API Endpoints

- [x] 4.1 Add `POST /api/scenarios/:id/revise` to `web/routes/scenarios.js` with validated body, lifecycle check, atomic revoke, scheduled revision job and a `202` response containing the job ID.
- [x] 4.2 Add `POST /api/scenarios/:id/remix` that accepts optional style overrides, returns `201` with the new draft ID, `remix_of` and a `revision_endpoint` hint.
- [x] 4.3 Make `POST /api/scenarios/:id/feedback` return `409` with `REVISION_REQUIRED` and structured details instead of silently appending to `scenario.feedback`.
- [x] 4.4 Extend `web/lib/lifecycle.js` with `revise(id, requestId)` and `remix(id, overrides)` methods that call into the scenario store helpers and apply the same keyed lock used for approve, reject and render.
- [x] 4.5 Update the safe scenario serializer to include `revision_status`, `revision_at`, `revision_history`, `remix_of`, `remix_created_at` and a `revision_endpoint` field for active revisions.
- [x] 4.6 Surface `BUSY`, `REVISION_ALREADY_RUNNING`, `REMIX_REQUIRES_PUBLISHED`, `REVISION_FEEDBACK_LIMIT` and `PUBLISHED_IMMUTABLE` codes through the structured error contract.

## 5. UI and Telegram Parity

- [x] 5.1 Replace the Web UI "Запрос на правку" action with a "🔄 Revision" button for approved and rendered scenarios and a "🎨 Remix" button for published scenarios.
- [x] 5.2 Render the new revision badges (`revision_queued`, `revision_succeeded`, `revision_failed`) and `remix_id` in scenario cards without changing the auto-refresh interval.
- [x] 5.3 Update Telegram `tg-bot/bot.js` so the edit card offers explicit "🔄 Revision" and "🎨 Remix" callbacks and disables revision for `rejected` and `published` revisions from approved/rendered only.
- [x] 5.4 Replace the "запрос на правку сохранён" help text in `ui/index.html` and `tg-bot/bot.js` with the new revision wording and link to the help doc.

## 6. Shared Lifecycle Fixtures and Cross-Runtime Parity

- [x] 6.1 Add `tests/lifecycle_fixtures.py` mirroring `web/tests/fixtures/lifecycle.js` for Python revisions, including the same scenarios and error codes.
- [x] 6.2 Refactor `py/lib/lifecycle.py` so the approve, reject, render, revise, remix and publish transitions use a single `transition()` helper and a `revoke_approval()` helper shared with `scripts/revise_scenario.py`.
- [x] 6.3 Update Telegram to call shared fixture scenarios and assert the same `BUSY`, `REMIX_REQUIRES_PUBLISHED` and `PUBLISHED_IMMUTABLE` codes that Node returns.
- [x] 6.4 Add a Python test that imports `tests/lifecycle_fixtures.py` and asserts the same matrix used by Node, proving runtime parity.

## 7. Observability and Recovery

- [x] 7.1 Log `revision.requested`, `revision.succeeded`, `revision.failed`, `remix.created` events with `request_id`, `scenario_id`, `revision_request_id` and redacted feedback content.
- [x] 7.2 Persist `revision_at`, `revision_status`, `revision_request_id` and bounded `revision_history` in the canonical scenario record and ensure the serializer never exposes absolute filesystem paths.
- [x] 7.3 Make `/api/jobs/:id` return `type`, `revision_kind`, `source_context_preview`, `feedback_count` and the same request correlation as render jobs.
- [x] 7.4 Add a startup cleanup that marks queued and running revision jobs as `interrupted` and reconciles interrupted `revokeApproval` transitions, never replaying paid LLM work.
- [x] 7.5 Ensure `/api/ready` does not change behaviour but document in `docs/api.md` that revision timeout and output limit use the same config-driven values.

## 8. Testing and Verification

- [x] 8.1 Add Node tests that exercise the full revise, remix, and cross-type job dedup flows with temporary data roots and a fake process runner.
- [x] 8.2 Add Python tests for `revise_scenario()` that verify bounded feedback, panel validation, machine-readable success and timeout/invalid-JSON failure paths.
- [x] 8.3 Add Python tests for `py/lib/lifecycle.py` that verify `revoke_approval()` and `create_remix()` against the shared fixtures and ensure no duplicate active scenario record.
- [x] 8.4 Add tests that prove the legacy `feedback` endpoint returns `REVISION_REQUIRED` for non-published scenarios and `PUBLISHED_IMMUTABLE` for published scenarios.
- [x] 8.5 Run the full Node suite, the Python `unittest` suites and `bash cron/nightly.sh --dry-run`; record results in `verification.md` without live provider or Telegram calls.

## 9. Documentation and Cleanup

- [x] 9.1 Update `docs/api.md`, `docs/workflow.md`, `ALGORITM.md`, `CLAUDE.md` and `README.md` so the wording reflects revision and remix semantics and removes the "запрос на правку сохранён" placeholder text.
- [x] 9.2 Add the new revision and remix sections to `docs/roadmap.md` and mark this roadmap entry as implemented by the change archive.
- [x] 9.3 Update `CHANGELOG.md`, reconcile task checkboxes with demonstrated behaviour and run strict OpenSpec validation before requesting fixation.
- [x] 9.4 Record the `revision-job-observability` and `scenario-revision-and-remix` capability main specs in `openspec/specs/` during archive sync so future changes inherit the new contracts.
