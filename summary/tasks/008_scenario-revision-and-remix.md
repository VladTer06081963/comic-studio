# Задачи: Scenario Revision and Remix

## Статус: ✅ Done

OpenSpec change `scenario-revision-and-remix` (43/43 tasks complete).
Заархивирован в `openspec/changes/archive/2026-08-02-scenario-revision-and-remix/`.

| ID | Секция | Задача | Статус |
|---|---|---|---|
| 1.1 | Configuration | `WEB_REVISION_TIMEOUT_MS`, `WEB_REVISION_OUTPUT_LIMIT`, `WEB_MAX_REVISION_FEEDBACK_COUNT`, `WEB_LEGACY_RETENTION_MS` в `web/lib/config.js` | ✅ |
| 1.2 | Configuration | Новые ключи в `.env.example` | ✅ |
| 1.3 | Configuration | `scripts/revise_scenario.py` — `--json-result`, `--feedback-file`, `--source-context`, shell-disabled | ✅ |
| 1.4 | Configuration | `revise_scenario()` в `py/scenario/writer.py` с `MAX_CONTEXT_CHARS` и `STYLE_TEMPLATES` | ✅ |
| 2.1 | Scenario Store | `revokeApproval(id, requestId)` атомарно `approved|rendered → draft` | ✅ |
| 2.2 | Scenario Store | `createRemix(sourceId, idGenerator)` с `remix_of` и `remix_created_at` | ✅ |
| 2.3 | Scenario Store | `moveToLegacyStaging(id, clock)` в `data/.staging/legacy/<id>-<timestamp>/` | ✅ |
| 2.4 | Scenario Store | `cleanupLegacyStaging(retentionMs)` не трогает jobs и archive | ✅ |
| 2.5 | Scenario Store | `revision_history` ≤ 10 в safe serializer | ✅ |
| 2.6 | Scenario Store | `reconcileTransitions` восстанавливает interrupted revokeApproval | ✅ |
| 3.1 | Job Manager | `enqueueRevision({ scenarioId, sourceContext, feedback, requestId })` с cross-type dedup | ✅ |
| 3.2 | Job Manager | `web/lib/job_store.js` принимает `type: 'render' \| 'revision'` | ✅ |
| 3.3 | Job Manager | `activeForScenario` возвращает `BUSY` для любого active job | ✅ |
| 3.4 | Job Manager | `markInterrupted` для revision jobs, сохраняет `revision_request_id` | ✅ |
| 3.5 | Job Manager | `process_runner.js` shell-disabled, timeout, JSON parse | ✅ |
| 4.1 | Web API | `POST /api/scenarios/:id/revise` — validate, revoke, enqueue, `202` | ✅ |
| 4.2 | Web API | `POST /api/scenarios/:id/remix` — overrides, `201`, `remix_of`, `revision_endpoint` | ✅ |
| 4.3 | Web API | `POST /api/scenarios/:id/feedback` — `409 REVISION_REQUIRED` / `PUBLISHED_IMMUTABLE` | ✅ |
| 4.4 | Web API | `web/lib/lifecycle.js` — `revise` / `remix` с keyed lock | ✅ |
| 4.5 | Web API | Safe serializer: `revision_status`, `revision_at`, `revision_history`, `remix_of`, `remix_created_at`, `revision_endpoint` | ✅ |
| 4.6 | Web API | `BUSY`, `REVISION_ALREADY_RUNNING`, `REMIX_REQUIRES_PUBLISHED`, `REVISION_FEEDBACK_LIMIT`, `PUBLISHED_IMMUTABLE` через structured error contract | ✅ |
| 5.1 | UI | «🔄 Revision» и «🎨 Remix» в Web UI | ✅ |
| 5.2 | UI | Status badges `revision_queued/succeeded/failed`, `remix_id` без изменения auto-refresh | ✅ |
| 5.3 | Telegram | Inline-кнопки `revise:` / `remix:` с проверкой state | ✅ |
| 5.4 | Telegram | Help text без «запрос на правку сохранён» | ✅ |
| 6.1 | Shared fixtures | `tests/lifecycle_fixtures.py` mirroring Node fixture | ✅ |
| 6.2 | Shared fixtures | `py/lib/lifecycle.py` использует общий `transition` / `revoke_approval` | ✅ |
| 6.3 | Shared fixtures | Telegram вызывает shared fixture scenarios | ✅ |
| 6.4 | Shared fixtures | Python parity test asserts same matrix | ✅ |
| 7.1 | Observability | `revision.requested/succeeded/failed`, `remix.created` с `request_id`, `scenario_id`, `revision_request_id`, redacted feedback | ✅ |
| 7.2 | Observability | `revision_at`, `revision_status`, `revision_request_id`, `revision_history` в canonical record; serializer не возвращает absolute paths | ✅ |
| 7.3 | Observability | `/api/jobs/:id` возвращает `type`, `revision_kind`, `source_context_preview`, `feedback_count` | ✅ |
| 7.4 | Observability | Startup cleanup interrupted revision jobs + interrupted revokeApproval | ✅ |
| 7.5 | Observability | `docs/api.md` документирует revision timeout/output config | ✅ |
| 8.1 | Testing | Node tests: revise, remix, cross-type dedup (13 новых тестов в `revision.test.js`) | ✅ |
| 8.2 | Testing | Python tests: bounded feedback, panel validation, success, timeout, invalid JSON (16 тестов) | ✅ |
| 8.3 | Testing | Python tests: `revoke_approval` / `create_remix` с no-duplicate (8 тестов) | ✅ |
| 8.4 | Testing | Legacy `feedback` endpoint tests: `REVISION_REQUIRED` / `PUBLISHED_IMMUTABLE` | ✅ |
| 8.5 | Testing | Полные Node + Python suites, `cron/nightly.sh --dry-run`, `verification.md` | ✅ |
| 9.1 | Docs | `docs/api.md`, `docs/workflow.md`, `ALGORITM.md`, `CLAUDE.md`, `README.md` обновлены | ✅ |
| 9.2 | Docs | `docs/roadmap.md` revision/remix секции, placeholder wording удалён | ✅ |
| 9.3 | Docs | `CHANGELOG.md` обновлён, `openspec validate --strict` проходит | ✅ |
| 9.4 | Docs | `revision-job-observability` и `scenario-revision-and-remix` синхронизированы в `openspec/specs/` | ✅ |

## Артефакты

- `openspec/changes/archive/2026-08-02-scenario-revision-and-remix/proposal.md`
- `openspec/changes/archive/2026-08-02-scenario-revision-and-remix/design.md`
- `openspec/changes/archive/2026-08-02-scenario-revision-and-remix/tasks.md`
- `openspec/changes/archive/2026-08-02-scenario-revision-and-remix/specs/scenario-revision-and-remix/spec.md`
- `openspec/changes/archive/2026-08-02-scenario-revision-and-remix/specs/revision-job-observability/spec.md`
- `openspec/changes/archive/2026-08-02-scenario-revision-and-remix/specs/web-process-jobs/spec.md`
- `openspec/changes/archive/2026-08-02-scenario-revision-and-remix/specs/web-scenario-operations/spec.md`
- `openspec/specs/scenario-revision-and-remix/spec.md` (new capability)
- `openspec/specs/revision-job-observability/spec.md` (new capability)
- `openspec/specs/web-scenario-operations/spec.md` (updated)
- `openspec/specs/web-process-jobs/spec.md` (updated)
- `web/tests/revision.test.js` (13 новых тестов)
- `tests/test_revise_scenario.py` (расширен)
- `tests/test_lifecycle_revision.py` (расширен)
- `verification.md` (в корне репозитория)
- `summary/audit/008_scenario-revision-and-remix.md`
- `summary/tasks/008_scenario-revision-and-remix.md`

## Verification

- `node --test` в `web/` — 59/59 passed (включая 13 новых в `revision.test.js`).
- `python3 -m unittest tests.test_revise_scenario tests.test_lifecycle_revision tests.test_lifecycle_fixtures` — 28/28 passed.
- `bash cron/nightly.sh --dry-run` — exit 0, no side effects.
- `openspec validate --changes --strict` — ✓ `change/scenario-revision-and-remix`.
- `openspec validate --specs --strict` — 6/6 ✓.

## Связанные follow-up

- Apply shared lifecycle fixtures к Telegram deep-queries (revision_history surfacing).
- Reconcile publisher/site/social/Notion с revision metadata.
- Repair nightly per-scenario publication ordering и archive naming.
- Опциональный auto-approval bounded revisions после одной успешной регенерации (сейчас каждая ревизия требует ручного approval).
