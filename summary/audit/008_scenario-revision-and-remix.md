# Аудит: Scenario Revision and Remix

## 1. Контекст

После `harden-web-server-api` оставалась transitional placeholder-fвёртка: `POST /api/scenarios/:id/feedback` сохранял текст в `scenario.feedback[]` и отвечал `feedback_recorded`, не запуская LLM и не давая никакого пути обновления `published` records. Этот change закрывает оба пробела: revision для `approved|rendered` сценариев через LLM-регенерацию и remix для `published` с новым draft ID.

## 2. Что сделано

### Web (`web/`)

- `web/lib/scenario_store.js`:
  - `revokeApproval(id, { requestId, reason })` атомарно переводит `approved|rendered → draft` через atomic write + unlink в source directory; устанавливает `revision_status: revision_queued`, `revision_request_id`, `revision_at`, `revision_source` и очищает `approved_at`/`rendered_at`/`render_revision`/`panel_paths`/`comic_path`. Никаких дубликатов record.
  - `applyRevision` атомарно записывает revised draft со свежим `revision_at`, `revision_status: revision_succeeded`, bounded `revision_history` (последние 10) и pre-revision записью для аудита.
  - `markRevisionFailed` сохраняет `revision_failed` и bounded `revision_error` без стирания `feedback`.
  - `createRemix(sourceId, overrides)` копирует published record в новый draft с `remix_of` и `remix_created_at`, очищает feedback и не трогает source.
  - `moveToLegacyStaging(id)` переносит `<id>.png`, `<id>/` panels и `raw/<id>.png` в `data/.staging/legacy/<id>-<ts>/` с manifest; используется перед revoke rendered-scenario.
  - `cleanupLegacyStaging(retentionMs)` чистит legacy staging по `WEB_LEGACY_RETENTION_MS` (default 7 дней) и никогда не трогает `data/archive/`.
  - `reconcileTransitions` теперь перемещает record в `draft` при stale `revision_queued` (например, interrupted revokeApproval) и ставит `revision_status: revision_idle`, сохраняя `revision_request_id`.
  - `find()` throws `SCENARIO_STATE_CONFLICT` если один ID в нескольких lifecycle directories; раньше возвращал первый молча.
  - Сериализатор никогда не возвращает `comic_path`, `panel_paths` или абсолютные filesystem paths; добавляет `revision_endpoint` для активных revisions.
- `web/lib/job_manager.js`:
  - `enqueueRevision({ scenarioId, scenarioPath, feedback, sourceContext, sourceContextPreview, requestId, revisionKind })` использует тот же keyed lock и cross-type `activeForScenario`, что и render.
  - Process runner вызывает `scripts/revise_scenario.py` с bounded args и `WEB_REVISION_TIMEOUT_MS`/`WEB_REVISION_OUTPUT_LIMIT`.
  - При interrupted вызывает `onRevisionComplete({ interrupted: true })` без replaying paid LLM work.
- `web/lib/job_store.js`: jobs теперь `type: 'render' | 'revision'`, payload включает `revision_kind`, `source_context_preview`, `feedback_count`. `markInterrupted` покрывает оба типа.
- `web/lib/lifecycle.js`: `revise({ id, requestId, feedback, sourceContext, imageStyle, jobManager })` сначала перемещает legacy artifacts (для rendered), затем `revokeApproval`, затем enqueues revision job; логирует `revision.requested` с `request_id`, `scenario_id`, `revision_request_id`, `revision_source`, `feedback_count`. `remix(sourceId, overrides, { requestId })` логирует `remix.created` с `source_id`.
- `web/lib/runtime.js`: `defaultOnRevisionComplete` различает success, failure и interrupted (не помечает scenario как failed при interrupt), логирует `revision.succeeded` / `revision.failed` / `revision.interrupted` с `request_id`, `scenario_id`, `job_id`, `code`.
- `web/routes/scenarios.js`:
  - `POST /api/scenarios/:id/revise` валидирует bounded feedback, проверяет `REVISION_ALREADY_RUNNING` (по `revision_status` + `activeForScenario`), вызывает lifecycle и возвращает `202` с `job`, `revision_endpoint` и `request_id`.
  - `POST /api/scenarios/:id/remix` принимает overrides (`title`, `image_style`, `style`, `tone`, `seed`), возвращает `201` с новым `id`, `remix_of` и `revision_endpoint`.
  - `POST /api/scenarios/:id/render` теперь проверяет `activeForScenario` до `renderPolicy` и возвращает `409 BUSY` для активного revision job.
  - `POST /api/scenarios/:id/feedback` возвращает `409 REVISION_REQUIRED` для не-published и `409 PUBLISHED_IMMUTABLE` для published; feedback не записывается.
- `web/lib/config.js` + `.env.example`: добавлены `WEB_REVISION_TIMEOUT_MS`, `WEB_REVISION_OUTPUT_LIMIT`, `WEB_MAX_REVISION_FEEDBACK_COUNT`, `WEB_MAX_REVISION_HISTORY`, `WEB_LEGACY_RETENTION_MS` с bounded валидацией.
- `web/tests/revision.test.js` — 13 новых тестов: revise-rendered happy path с legacy staging, feedback limit/empty errors, cross-type job dedup (revision→render и render→revision), REVISION_ALREADY_RUNNING, revision_succeeded persistence и bounded revision_history, revision_failed path, startup reconciliation interrupted, remix preserves source, serializer hides absolute paths и exposes revision_endpoint, /api/jobs/:id revision metadata, `revision.requested` / `remix.created` log events.

### Python (`py/`)

- `py/scenario/writer.py`:
  - Удалён дубль `MAX_REVISION_HISTORY`/`REVISION_SYSTEM_PROMPT`.
  - `revise_scenario(current, feedback, source_context, image_style)`:
    - bounded context (`MAX_CONTEXT_CHARS`=8000) и bounded feedback (`MAX_FEEDBACK_FOR_REVISION`=20);
    - REVISION_SYSTEM_PROMPT требует 3–4 panels, prompt ≤1500, caption ≤6 слов, сохранение title/tone/style/image_style/layout/aspect_ratio;
    - `_validate_revision_response` отклоняет non-dict, неверное число panels, длинный prompt, длинный caption;
    - `style_suffix` из `STYLE_TEMPLATES[image_style]` добавляется к каждому prompt;
    - возвращает dict с `id`, `status: 'draft'`, `revision_of`, `revision_at`.
  - `_format_feedback_history` фильтрует пустые entries и нумерует подряд.
- `py/lib/lifecycle.py`:
  - `revoke_approval(scenario_id, request_id, reason)` и `create_remix(source_id, id_factory)` уже были добавлены в предыдущих шагах; теперь подтверждены тестами, что `data/scenarios/<state>/<id>.json` существует ровно в одной директории и нет дубликатов.
- `scripts/revise_scenario.py`: shell-disabled CLI с `--scenario-id`, `--scenario-path`, `--feedback` / `--feedback-file`, `--source-context` / `--source-context-file`, `--image-style`, `--json-result`, `--out`. Не вызывается из Web API напрямую — только через `process_runner` (execFile, без shell).
- `tests/test_revise_scenario.py` (16 тестов) и `tests/test_lifecycle_revision.py` (8 тестов) покрывают: bounded feedback, panel validation, machine-readable success, timeout/invalid-JSON/non-dict responses, ensure no duplicate active scenario record.

### Shared lifecycle parity

- `tests/lifecycle_fixtures.py` и `web/tests/fixtures/lifecycle.js` — общая матрица операций (`approve`, `reject`, `render`, `revise`, `remix`) и codes (`PUBLISHED_IMMUTABLE`, `REMIX_REQUIRES_PUBLISHED`, `APPROVAL_REQUIRED`, `RERENDER_CONFIRMATION_REQUIRED`).
- `tests/test_lifecycle_fixtures.py` парсит оба fixture файла и подтверждает, что набор операций и error codes совпадает.

### UI / Telegram

- `tg-bot/bot.js`:
  - Для `approved|rendered` теперь кнопки «🎨 Запустить рендер», «🔄 Revision» (callback `revise:<id>`).
  - Для `published` — «🎨 Remix» (callback `remix:<id>`) + «🎨 Повторить рендер».
  - `revise:` callback проверяет state, ставит user в `awaiting_revise_feedback` и POST-ит на Web API.
  - `remix:` callback вызывает `POST /api/scenarios/:id/remix` и сообщает новый ID.
  - Help text и «помощь» в `/help` обновлены — без «запрос на правку сохранён».
- `ui/index.html` и `ui/app.js`:
  - `ui/app.js` POST-ит напрямую на `/api/scenarios/:id/revise` (modal-«Revision»);
  - Remixed published сценарий → новая карточка draft в табе «Черновики»;
  - Help-секция явно описывает `🔄 Revision` для approved/rendered и `🎨 Remix` для published; удалена формулировка «запрос на правку сохранён»;
  - Status badge `revision_queued`/`revision_succeeded`/`revision_failed` рендерится без изменения auto-refresh interval.

### Docs

- `docs/api.md`: lifecycle-схема теперь включает revision и remix; `POST /api/scenarios/:id/revise` (с примерами и error codes), `POST /api/scenarios/:id/remix`, обновлённый `GET /api/jobs/:id` с type-specific metadata, новая секция «Revision and remix configuration» с env vars.
- `docs/workflow.md`: раздел 6 переписан под revision и remix, упоминает atomic revoke, legacy staging, `WEB_LEGACY_RETENTION_MS`, `/remix` и отказ legacy feedback endpoint.
- `ALGORITM.md`: раздел 6 — cross-type dedup, раздел 8 — revision и remix flow, раздел 10 — published теперь изменяется только через `/remix`.
- `CLAUDE.md`: ключевые правила расширены пунктом 4 про revision/remix, добавлены `revision.requested`/etc. logging; правила отказа теперь включают legacy feedback.
- `README.md`: «Transitional feedback» заменён на «Revision и remix» с описанием `/revise`, `/remix` и legacy endpoint.
- `docs/roadmap.md`: добавлена секция «Recently implemented: scenario-revision-and-remix» с 9 пунктами, устаревший placeholder wording удалён.

### OpenSpec main specs sync

- `openspec/specs/web-scenario-operations/spec.md`: «Transitional feedback behavior» заменено на «Revision workflow replaces transitional feedback behavior» с scenario блоками для legacy feedback, revise endpoint, remix endpoint, serializer behaviour. Render policy дополнен post-revision block/allow scenarios.
- `openspec/specs/web-process-jobs/spec.md`: per-scenario dedup обновлено до cross-type с `BUSY`; observable jobs теперь включают `type`, `revision_kind`, `source_context_preview`, `feedback_count` и `request_id`.
- `openspec/specs/scenario-revision-and-remix/spec.md` (новый) и `openspec/specs/revision-job-observability/spec.md` (новый) скопированы из change delta specs.
- `openspec validate --specs --strict` — 6/6 valid, 0 issues.

## 3. Verification

- `node --test` в `web/` — 59 passed, 0 failed (включая 13 новых тестов в `revision.test.js`).
- `python3 -m unittest tests.test_revise_scenario tests.test_lifecycle_revision tests.test_lifecycle_fixtures` — 28 passed, 0 failed (все тесты в области change; pre-existing `test_render_approved.py` требует `Pillow` и out of scope).
- `bash cron/nightly.sh --dry-run` — no side effects, summary показывает would-process список.
- `openspec validate --changes --strict` — ✓ change/scenario-revision-and-remix.
- `openspec validate --specs --strict` — 6/6 ✓.
- Live MiniMax, Telegram, Notion, site, social calls — 0.
- `data/archive/` — не модифицировался.
- Verification summary сохранён в `verification.md` в корне репозитория.

## 4. Pre-existing bugs, зафиксированные по пути

- `revokeApproval` писал post-revoke record в source directory → state mismatch. Теперь move через atomic write + unlink.
- `lifecycle.revise` возвращал `APPROVAL_REQUIRED` для `published` → теперь `PUBLISHED_IMMUTABLE` с `remix_endpoint`.
- `ScenarioStore.find` молча выбирал первый candidate при дубликатах ID → теперь throws `SCENARIO_STATE_CONFLICT`.
- `reconcileTransitions` писал `revision_idle` в source directory → теперь move в `draft` directory.
- `lifecycle.remix` не логировал `remix.created` → теперь structured event с `request_id`.
- `defaultOnRevisionComplete` перезаписывал `revision_failed` при interrupted → теперь различает interrupted, success, failure.

## 5. Статус

✅ Реализация и фиксация завершены — 2026-08-02.
OpenSpec change заархивирован в `openspec/changes/archive/2026-08-02-scenario-revision-and-remix/`.
