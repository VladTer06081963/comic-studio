## Why

`harden-web-server-api` закрыл security и lifecycle, но зафиксировал feedback как pending revision request без настоящей LLM-регенерации. Без revision workflow ручная правка сценариев превращается в лишний round-trip, а `published` records становятся тупиком: ссылки в соцсетях и на сайте невозможно продолжить. Этот change реализует revision и remix, чтобы lifecycle сценариев был непрерывным до publication и расширяемым после.

## What Changes

- Ввести `revise_scenario()` в Python: получает current scenario, source context и bounded feedback history, вызывает LLM и возвращает structured result.
- Добавить новый атомарный transition `approved|rendered → draft` с revision metadata, который отзывает approval и помечает scenario как `pending_revision`.
- Сохранять revised panels/prompts/captions atomically; failure LLM оставляет scenario unapproved, а feedback и source context сохраняются для retry.
- При попытке revise для `published` создавать новый draft с новым ID и `remix_of` reference, не трогая original record.
- Добавить Node endpoints `POST /api/scenarios/:id/revise` и `POST /api/scenarios/:id/remix`, синхронизировать с lifecycle, jobs, render и publication gates.
- Ввести revision job status, который заменяет `feedback_recorded` UI copy на `revision_queued`/`revision_succeeded`/`revision_failed` без ложных обещаний regeneration.
- Применять shared lifecycle fixtures к Telegram-боту и Python render для единой state-machine и предотвращения cross-runtime drift.
- Добавить retention: stale revision jobs помечаются `interrupted`; rendered artifacts, оставшиеся после `rendered → draft`, перемещаются в `.staging/legacy/` с manifest для безопасного очищения.
- **BREAKING**: Web UI и Telegram больше не должны говорить «правка сохранена, LLM применит её позже». Эта формулировка заменяется явным статусом revision/remix.
- **BREAKING**: `published` records нельзя редактировать или повторно рендерить; единственный путь обновления — explicit remix с новым draft ID.
- Изменение semantic feedback route в `web-scenario-operations` (ранее — transitional behavior) обязательно синхронизируется как MODIFIED Requirement.

## Capabilities

### New Capabilities

- `scenario-revision-and-remix`: атомарный revision workflow, published remix и новая revision job state machine. Покрывает server и Python LLM-revision, а также переход published-records в новый draft.
- `revision-job-observability`: revision jobs в `data/jobs/`, polling API, request correlation, interrupted handling и безопасный retry.

### Modified Capabilities

- `web-scenario-operations`: устаревший `transitional feedback behavior` заменяется на `revision workflow behavior`; `feedback endpoint` превращается в revision request, который возвращает revision job ID; approved/rendered возвращаются в `draft` до LLM-вызова; published records возвращают `PUBLISHED_IMMUTABLE` и включают `remix_endpoint` в response. Render policy и seed policy остаются без изменений.
- `web-process-jobs`: render job manager расширяется для revision job lifecycle: `queued → running → succeeded|failed|interrupted` теперь покрывает revision jobs, плюс защита от параллельных revision и render jobs для одного scenario ID.

## Impact

- Python: `py/scenario/writer.py` — новая `revise_scenario()`, отдельный `--json-result` режим для revision, машиночитаемые ошибки.
- Python: `py/lib/lifecycle.py` — атомарный helper `revoke_approval(scenario_id)` и `create_remix(source_id)`.
- Scripts: `scripts/revise_scenario.py` (новый), `scripts/render_approved.py` остаётся в качестве dependent contract fixture.
- Web: `web/routes/scenarios.js` — новые `revise` и `remix` endpoints, синхронизация с `lifecycle.js` и `job_manager.js`.
- Web: `web/lib/lifecycle.js` — расширение сервиса для `revise` и `remix` поверх `scenario_store` с тем же keyed lock.
- Web: `web/lib/job_manager.js` — добавление `enqueueRevision` с дедупликацией по scenario ID и render concurrency.
- Web: `web/lib/scenario_store.js` — поддержка `remix_of` reference, recovery of interrupted revision transitions, valid revisions в `data/.staging/legacy/`.
- Telegram: `tg-bot/bot.js` — обновлённые кнопки `✏️ Запросить правку → 🔄 Revision` и `🎨 Remix из published`, использование shared lifecycle fixtures.
- UI: `ui/index.html` и `ui/app.js` — кнопки заменяют «запрос на правку» на revision/remix actions, status badge показывает `revision_queued|succeeded|failed` и `remix_id` для published.
- Config: `.env.example` дополняется `WEB_REVISION_TIMEOUT_MS`, `WEB_REVISION_OUTPUT_LIMIT`, revision job retention.
- Documentation: `docs/api.md`, `docs/workflow.md`, `ALGORITM.md`, `CLAUDE.md`, `README.md` обновляются; запись «запрос на правку сохранён» удаляется.
- Tests: новые Node tests для revision/remix, переиспользованные `web/tests/fixtures/lifecycle.js`; новые Python tests для `revise_scenario()` и `create_remix()`. Все тесты без live MiniMax, Telegram, Notion или site credentials.
