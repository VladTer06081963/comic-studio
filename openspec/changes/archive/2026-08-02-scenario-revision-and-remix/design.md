## Context

См. `proposal.md` для мотивации и `specs/` для observable contracts. Сейчас `web-scenario-operations` хранит feedback как массив и отвечает `feedback_recorded` без фактической LLM-регенерации. `published` records не имеют пути для продолжения. Shared lifecycle fixtures из `web/tests/fixtures/lifecycle.js` ещё не применены к Telegram-боту и Python lifecycle helpers. Этот change превращает «pending revision request» в настоящий revision workflow с persisted revision jobs, добавляет published remix и расширяет job manager для cross-type deduplication.

`web/lib/scenario_store.js` уже использует keyed lock, atomic transitions и reconciliation interrupted transitions. `web/lib/job_manager.js` уже предоставляет `enqueueRender`. `py/scenario/writer.py` уже содержит `generate_scenario()` со bounded context и JSON result parsing. Расширения должны оставаться в этой архитектуре и не дублировать logic в Telegram-боте.

## Goals / Non-Goals

**Goals:**

- Превратить feedback в revision request, который запускает LLM, отзывает approval и атомарно сохраняет revised draft.
- Сделать `published` records основой для remix без повторного approval и без изменения original record.
- Обеспечить видимое состояние revision jobs и предотвратить параллельные render и revision jobs для одного scenario.
- Применить shared lifecycle fixtures к Telegram и Python, чтобы все runtime helpers выполняли одну state machine.
- Сохранить `data/archive/` immutable и не удалять существующие rendered artifacts без явной очистки legacy staging.

**Non-Goals:**

- Полная переработка Telegram-бота: только обновление handlers и применение shared fixtures.
- Автоматическое применение feedback без нового approval.
- Каскадные revisions между несколькими drafts в одном запросе.
- Cross-runtime distributed lock: Node-side keyed lock достаточен в рамках этого change.
- Изменения cron `nightly.sh` и publisher/site: эти подсистемы остаются как есть и hardening относится к другим follow-up.
- Реализация multi-author или shared editing.

## Decisions

### Revision отзывает approval атомарно до LLM-вызова

Revision request сначала под keyed lock вызывает `scenario_store.revokeApproval(id)`, который:

1. Загружает canonical record и проверяет допустимый source status (`approved` или `rendered`).
2. Устанавливает `status: draft`, `revision_status: revision_queued`, `revision_request_id: <uuid>`, `revision_at: now`, а `feedback` остаётся нетронутым.
3. Атомарно перезаписывает файл и сохраняет pending metadata.
4. Если source был `rendered`, перемещает comic artifacts в `data/.staging/legacy/<id>/<timestamp>/` с manifest.

Только после успешного `revokeApproval` сервер создаёт revision job и вызывает LLM. Это гарантирует, что interrupted LLM не оставляет approved scenario с потенциально-устаревшими panels.

Альтернатива — `revokeApproval` + LLM-вызов в одной операции с двухфазным commit. Отвергнуто, потому что Python-вызов асинхронен и не может участвовать в Node-side транзакции без eventual consistency race.

### LLM-вызов использует тот же shell-free process runner

`scripts/revise_scenario.py` принимает:

- `--scenario-id`
- `--source-context` (bounded до 8 000 символов);
- `--feedback` (bounded до 20 items, JSON-encoded);
- `--json-result` для machine-readable result.

`revise_scenario()` в Python повторно использует `MAX_CONTEXT_CHARS`, `STYLE_TEMPLATES` и MiniMax-Text-01 endpoint, но добавляет system prompt, требующий:

- 3–4 panels, каждый с prompt ≤1 500 символов и caption ≤6 слов;
- сохранение `title`, `tone`, `style`, `image_style`, `layout`, `aspect_ratio`;
- reference на revision source.

LLM failure (`PROCESS_TIMEOUT`, `PROCESS_FAILED`, `INVALID_PROCESS_RESULT`) оставляет scenario в `draft` со status `revision_failed` и не стирает старые panels. Успешный LLM возвращает JSON, который `web/lib/scenario_store.js` атомарно сохраняет с новыми `revision_at`, `revision_status: revision_succeeded` и добавлением prev revision в `revision_history`.

Альтернатива — позволить LLM вызывать revision-вызов в Node через IPC. Отвергнуто: shell-disabled CLI с `--json-result` уже работает в harden-web-server-api и поддерживает timeout/exit-code handling без новой cross-runtime dependency.

### Published remix создаёт новый draft, не меняя source

`web/lib/lifecycle.js` добавляет `remix(sourceId)`, который:

1. Проверяет, что source `published` и `comic_path` exists.
2. Генерирует новый ID с тем же helper, что и Node runtime (UUID через `idGenerator`).
3. Копирует title, panels, captions, style, image_style, layout, aspect_ratio, seed, tone, `remix_of: <source_id>`, `remix_created_at: now`, пустой `feedback`, `status: draft`.
4. Сохраняет в `data/scenarios/draft/<new-id>.json` с тем же atomic write, что и scenario store.
5. Source `published` record остаётся без изменений. `revision_history` source не дополняется.

`POST /api/scenarios/:id/remix` возвращает `201` с new ID, status `draft`, `remix_of`, и `revision_endpoint` для следующего шага.

Альтернатива — soft-remix через копирование file system и оставление source нетронутым. Отвергнуто: логика та же, но отсутствие structured response замедлит UI.

### Job manager расширяется для cross-type дедупликации

`web/lib/job_manager.js` добавляет `enqueueRevision({ scenarioId, sourceContext, feedback, requestId })`. Job type становится `revision`. `JobStore` принимает `type: 'render' | 'revision'`. `activeForScenario` теперь проверяет `ACTIVE` для любого `type`.

`Revise` flow:

1. Validate scenario lifecycle.
2. `enqueueRevision` создаёт `revision` job, если нет active job любого типа.
3. Process runner выполняет `scripts/revise_scenario.py` с bounded args и timeout.
4. На success — `reviseScenario` callback в `lifecycle` атомарно сохраняет revised draft, `revision_status: revision_succeeded` и добавляет в `revision_history`.
5. На failure — `revision_status: revision_failed`, structured error в job, scenario остаётся в `draft` с `feedback` нетронутым.

Render и revision делят keyed lock в `scenario_store`. `lifecycle.renderPolicy` дополнительно проверяет `scenario.revision_status === 'revision_queued' || 'revision_running'`, чтобы не отвечать `200 OK` если revision ещё идёт.

Альтернатива — два отдельных job stores. Отвергнуто: единое состояние упрощает observability и cross-runtime recovery.

### Legacy staging и безопасная очистка

`data/.staging/legacy/<scenario-id>/<timestamp>/` содержит:

- `final.png`, `panel_*.png`, `raw.png`;
- `manifest.json` с original paths, expected status, scenario id.

`ScenarioStore.legacyStaging` cleanup удаляет legacy staging entries старше `WEB_LEGACY_RETENTION_MS` (default 7 дней). При failure cleanup moves manifest в `data/.trash/` вместо permanent delete. `data/archive/` не затрагивается.

### Shared lifecycle fixtures применяются к Telegram и Python

`tg-bot/bot.js` и `py/lib/lifecycle.py` переходят на общий сценарий transitions:

- Telegram использует `findScenario(id)` и `moveScenario(id, from, to)` через тонкую обёртку, которая сравнивает target с Node `web/tests/fixtures/lifecycle.js` matrix.
- Python `lifecycle.py` принимает `revoke_approval()` и `create_remix()` как новые helpers; тесты вызывают их через временный data root.

Fixtures становятся общим файлом `tests/lifecycle_fixtures.py` (Python) и `web/tests/fixtures/lifecycle.js` (Node). Они тестируются в обоих runtime для подтверждения parity.

Альтернатива — оставить Telegram и Python как есть. Отвергнуто: текущий drift уже привёл к inconsistent render/rerender policy в прошлом аудите.

### Recovery: interrupted revisions не теряются

При server restart `JobStore.markInterrupted` помечает все `queued` и `running` jobs `interrupted`. `ScenarioStore.reconcileTransitions` использует pending metadata, чтобы вернуть `draft` scenario с сохранённым `revision_request_id` в `revision_idle` (не `revision_failed`). Автор может отправить новый revision request без replaying.

Альтернатива — автоматический retry. Отвергнуто: повторный LLM-вызов тратит деньги и может детерминированно иначе отвечать.

### UI и Telegram wording

`ui/index.html` и `tg-bot/bot.js` заменяют «запрос на правку» на:

- «🔄 Revision» для approved/rendered;
- «🎨 Remix» для published.

Status badge включает `revision_queued`, `revision_succeeded`, `revision_failed`, `remix_id`. Карточка сценария отображает bounded список revision entries с timestamp.

### Observability и request correlation

Revision jobs сохраняют `request_id` (Node) и `revision_request_id` (Python). Daily log содержит `revision.requested`, `revision.succeeded`, `revision.failed`, `remix.created` со structured fields. Token values и полный feedback content редактируются. `request_id` доступен через API response и используется в error codes.

### .env.example дополняется

```env
WEB_REVISION_TIMEOUT_MS=180000
WEB_REVISION_OUTPUT_LIMIT=10485760
WEB_MAX_REVISION_FEEDBACK_COUNT=20
WEB_LEGACY_RETENTION_MS=604800000
```

Defaults соответствуют render limits. `process_runner.js` читает их из config.

## Risks / Trade-offs

- [LLM-вызов и approval revoke могут расходиться при crash между двумя операциями] → `revision_queued` status и interrupted recovery помечают scenario как `revision_idle`, не `approved`/`rendered`; author может безопасно retry.
- [Перенос legacy artifacts в `.staging/legacy/` оставляет temporary disk usage] → retention cleanup через `WEB_LEGACY_RETENTION_MS`; при failure cleanup moves в `.trash/` для debugging.
- [Revision history может быстро расти] → bounded `revision_history` (последние 10 entries) для rendered сценариев; полная история остаётся в архиве при необходимости.
- [Telegram handler update требует изменения inline keyboard и edit card text] → минимальные changes в callback_data и labels; старые inline buttons постепенно заменяются.
- [Cross-runtime fixtures могут дрейфовать между Python и Node] → оба runtime тестируют одну fixture file; CI в будущем может запускать оба suite в одной среде.
- [Revision LLM может вернуть panels с утечкой personal data] → bounded `WEB_MAX_REVISION_FEEDBACK_COUNT` и редактирование content в logs уже в harden-web-server-api.
- [Remix из published не гарантирует image_style continuity] → remix копирует image_style, но автор может изменить его через `--image-style`; docs объясняют.

## Migration Plan

1. Добавить `WEB_REVISION_*` и `WEB_LEGACY_RETENTION_MS` в config и `.env.example`; не менять существующие defaults.
2. Расширить `py/scenario/writer.py` и добавить `scripts/revise_scenario.py` с shell-disabled invocation.
3. Расширить `web/lib/scenario_store.js` (`revokeApproval`, `createRemix`, `moveToLegacyStaging`, `cleanupLegacyStaging`).
4. Расширить `web/lib/job_manager.js` (`enqueueRevision`, cross-type dedup).
5. Расширить `web/lib/lifecycle.js` (`revise`, `remix`, `setRenderGateFromRevision`).
6. Добавить `POST /api/scenarios/:id/revise` и `POST /api/scenarios/:id/remix` в `web/routes/scenarios.js`.
7. Обновить `ui/index.html`, `ui/app.js`, `tg-bot/bot.js` для revision/remix UI.
8. Расширить `web/tests/fixtures/lifecycle.js` и добавить Python fixtures в `tests/lifecycle_fixtures.py`.
9. Обновить документацию: `docs/api.md`, `docs/workflow.md`, `ALGORITM.md`, `CLAUDE.md`, `README.md`, удалить «запрос на правку сохранён» wording.
10. Запустить полный Node suite, Python renderer tests, Python revise_scenario tests и cron `--dry-run`; записать verification summary.

Rollback: остановить server, откатить code; `data/.staging/legacy/` оставить для диагностики; `data/scenarios/draft/*.json` сохраняет `revision_status` для recovery; `data/archive/` не изменяется. До production switch — backup mutable roots и dry-run integration suite.

## Open Questions

Нет. Размер feedback history, retention period и legacy staging path — deployment defaults и могут уточняться в implementation без изменения behavioral contracts.
