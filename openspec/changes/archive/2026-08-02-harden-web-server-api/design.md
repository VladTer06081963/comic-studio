## Context

См. `proposal.md` для мотивации и `specs/` для observable contracts. Сейчас `web/server.js` одновременно создаёт Express app, читает filesystem, выполняет lifecycle transitions, формирует shell-команды и запускает listener. Route handlers синхронно читают произвольные JSON-файлы, повторяют поиск scenario по директориям и не имеют общей validation, access control, request correlation или test seam.

Filesystem JSON остаётся source of truth, server остаётся локальным single-author приложением, а Python scripts — исполнителями ingest и render. `data/archive/` неизменяем; live provider calls не должны требоваться для тестов. Отдельный change `scenario-revision-and-remix` реализует LLM revision и published remix.

## Goals / Non-Goals

**Goals:**

- Разделить HTTP, filesystem, lifecycle и process orchestration на тестируемые модули.
- Сделать local mode безопасным без ухудшения удобства Web UI.
- Fail closed при remote configuration, invalid input, lifecycle conflict и process failure.
- Обеспечить один canonical scenario record и один active render job на scenario ID.
- Сохранить текущий filesystem data model и существующие CLI entry points, меняя их только там, где нужен корректный exit/result contract.
- Сделать initial render и rerender interruption-safe без изменения published content.

**Non-Goals:**

- Реализовать LLM regeneration по feedback.
- Реализовать endpoint создания remix из published scenario.
- Добавить database, external queue, multi-user accounts или distributed locks.
- Переписывать Telegram bot целиком; parity его lifecycle helpers будет отдельной задачей после стабилизации контракта.
- Активировать Twitter, Mastodon, Notion comic publishing или исправлять nightly publication.

## Decisions

### Express app отделяется от bootstrap

Предлагаемая структура:

```text
web/
├── server.js                 # config validation, listen, signals
├── app.js                    # createApp(dependencies)
├── routes/
│   ├── scenarios.js
│   ├── jobs.js
│   ├── comics.js
│   └── health.js
└── lib/
    ├── config.js
    ├── errors.js
    ├── validation.js
    ├── scenario_store.js
    ├── lifecycle.js
    ├── process_runner.js
    ├── job_store.js
    └── logger.js
```

`createApp()` получает config, stores, runner, logger и clock/ID generator как dependencies. Production bootstrap передаёт реальные реализации; tests передают temporary data root и fakes.

Альтернатива — продолжить расширять один `server.js`. Она требует меньше файлов, но сохраняет невозможность изолированно тестировать filesystem и child-process behavior.

### Конфигурация валидируется до listen

`config.js` нормализует:

- `HOST`, default `127.0.0.1`;
- `PORT`, default `3000`;
- `DATA_ROOT`, default `<project>/data`;
- `PYTHON_BIN`, default `<project>/.venv/bin/python3` с явной диагностикой отсутствия;
- `WEB_API_TOKEN`;
- `WEB_ALLOWED_ORIGINS`, comma-separated exact origins;
- process timeouts и output limits;
- job retention и shutdown grace period.

Loopback распознаётся для `127.0.0.1`, `::1` и `localhost`. Любой другой host включает remote mode и требует token плюс origins. Server завершает startup до `listen()`, если invariant не соблюдён.

Альтернатива — автоматически разрешать external host без token с warning. Она отвергнута: security configuration должна fail closed.

### Local mode использует same-origin, remote mode — bearer authentication

В local mode UI и API обслуживаются одним origin; CORS headers для произвольных origins не выдаются. В remote mode exact-origin middleware выполняется до routes, а authentication middleware защищает все `/api/*` endpoints, включая reads.

Remote UI запрашивает token у автора и хранит его только в `sessionStorage`; общий fetch wrapper добавляет bearer header. Token не встраивается в HTML/JS bundle и не записывается в logs.

Альтернатива — оставить wildcard CORS для read endpoints. Она отвергнута, потому что scenario metadata и context являются авторскими данными.

### Validation предшествует path construction и side effects

`validation.js` содержит явные allowlists и bounded validators:

- ID: `^[A-Za-z0-9_-]{4,64}$`;
- lifecycle status: пять canonical значений плюс `all` только для list;
- image style: `cartoon|anime|comic|realistic|watercolor`;
- caption style: `bubble|star|gothic|boom|memo|bar`;
- seed: integer в поддерживаемом MiniMax диапазоне;
- content/feedback: string, trim, configurable maximum;
- render mode: `initial|rerender`.

Paths создаются только из validated identifiers и дополнительно проверяются через `path.resolve`, что resolved path остаётся внутри expected root. Невалидные requests завершаются до filesystem/process operations.

JSON Schema/Ajv рассматривался как альтернатива. На этой итерации выбираются небольшие explicit validators без новой runtime dependency; contract tests компенсируют риск ручного drift. Каноническую cross-language schema можно добавить отдельным foundation change.

### Scenario store обнаруживает конфликт вместо выбора первого файла

`scenario_store.js` предоставляет операции `find`, `list`, `read`, `write`, `transition` и `deleteMutable`. `find(id)` сканирует все canonical active queues и возвращает:

- zero records — not found;
- one valid record — canonical result;
- несколько records — `SCENARIO_STATE_CONFLICT`;
- malformed record или directory/status mismatch — fail-closed invalid-state result.

List operations изолируют malformed records, возвращают `invalid_count` и логируют ID/file fingerprint, но не содержимое. Responses проходят serializer, который исключает absolute paths и internal fields.

Альтернатива — сохранить стратегию «первый найденный status». Она отвергнута, потому что скрывает corruption и делает mutation недетерминированным.

### Lifecycle transition выполняется под per-ID lock и не создаёт duplicate active record

`lifecycle.js` определяет одну transition matrix. Внутри server process используется keyed mutex на scenario ID. Transition:

1. Загружает canonical record и проверяет current status.
2. Проверяет отсутствие destination conflict.
3. Формирует next record и timestamp.
4. Атомарно перезаписывает source record с next status и transition metadata.
5. Выполняет atomic rename source path в destination path на том же filesystem.
6. Удаляет transient metadata после successful move.

Если процесс прерван между write и rename, запись остаётся единственной и fail-closed: directory/status mismatch не считается renderable. Startup/read reconciliation может завершить известный pending transition либо сообщить actionable invalid state; он никогда не создаёт второй active record.

Каждый atomic write использует уникальный temp file в destination directory, flush/fsync, close и rename. Destination overwrite запрещён.

Альтернатива — сначала создать destination и затем удалить source. Она отвергнута из-за crash window с двумя active records.

Per-ID lock защищает конкурентные Web requests. Он не является distributed lock для Telegram/Python; поэтому destination checks и fail-closed mismatch detection остаются обязательными. Cross-runtime lock parity — отдельный дальнейший hardening step.

### Published records immutable во всех Web mutations

Web API применяет таблицу:

```text
draft     -> approve | reject | seed | feedback-record | delete
approved  -> initial render | seed | feedback-record (approval revoked later by revision change) | delete
rendered  -> explicit rerender | feedback-record | delete
published -> read only
rejected  -> read | delete
```

Для `published` render, seed, feedback и delete возвращают `PUBLISHED_IMMUTABLE`. Будущий remix создаст новый draft с новым ID и `remix_of`, не меняя original record.

Feedback в этом change остаётся только validated revision request. API/UI явно сообщает `feedback_recorded`, а не `edited` или `regenerated`. Настоящий переход в draft и LLM regeneration вводится только в `scenario-revision-and-remix`.

### Process runner никогда не использует shell

`process_runner.js` принимает executable, argument array, cwd, timeout и output limit. Он использует shell-disabled process invocation. Ни content, ни style, ни ID не конкатенируются в command string.

Draft creation может оставаться request/response operation до появления отдельной ingest queue, но получает timeout и structured success contract. Python ingest script должен уметь вернуть machine-readable JSON result, чтобы server не извлекал ID из human stdout.

Render запускается как background job. `scripts/render_approved.py` должен возвращать non-zero exit code при failure и, при возможности, machine-readable summary.

Альтернатива — экранировать shell string. Она отвергнута: корректное escaping различается по shell и остаётся ненужной attack surface.

### Render jobs сохраняются отдельно от scenario lifecycle

Transient `rendering` не добавляется в canonical scenario statuses. `job_store.js` атомарно хранит records под `data/jobs/<job-id>.json`:

```json
{
  "id": "uuid",
  "type": "render",
  "scenario_id": "abc12345",
  "mode": "initial|rerender",
  "status": "queued|running|succeeded|failed|interrupted",
  "created_at": "ISO-8601",
  "started_at": "ISO-8601",
  "finished_at": "ISO-8601",
  "result": {},
  "error": {"code": "...", "message": "..."}
}
```

Один in-memory keyed lock плюс persisted active-job scan не допускают второй queued/running render для того же scenario. После restart оставшиеся queued/running jobs помечаются `interrupted`; автоматический restart платного render не выполняется без нового author request.

Альтернатива — хранить jobs только в памяти. Она проще, но после restart теряет причину незавершённого UI state и request correlation.

### Rerender использует staging и atomic promotion

Для explicit rerender server создаёт job-specific staging root. Python renderer получает validated mode, seed и staging path и генерирует candidate panels/final PNG отдельно от текущих artifacts. После проверки readable files promotion заменяет текущий artifact set; до promotion scenario остаётся `rendered` с прежним result.

Promotion выполняется с backup/swap внутри одного filesystem. При failure backup восстанавливается, staging остаётся для bounded diagnostics/cleanup, job становится failed. После success обновляются `seed`, `render_revision`, `rendered_at` и paths, затем старый backup удаляется согласно retention policy.

Initial render по-прежнему разрешён только из `approved`; renderer повторно проверяет approved directory/status непосредственно перед provider call. Server-side check не заменяет defense-in-depth в Python.

### Delete использует staged trash, а не последовательное необратимое unlink

Для mutable scenario store строит manifest scenario/panels/final/raw. Под per-ID lock artifacts перемещаются в `data/.trash/<operation-id>/`, после чего операция считается committed и trash удаляется. При pre-commit failure выполненные moves откатываются. Crash leftovers восстанавливаются или завершаются по manifest при startup cleanup.

`data/archive/` никогда не включается в delete manifest. Published delete блокируется до создания manifest.

Альтернатива — удалять scenario первым и затем artifacts. Она отвергнута, потому что partial failure оставляет orphaned state без возможности безопасного retry.

### Error contract и logging централизованы

`errors.js` определяет typed operational errors с HTTP status и stable code. Последний middleware сериализует:

```json
{
  "error": {
    "code": "INVALID_SCENARIO_ID",
    "message": "Invalid scenario ID",
    "request_id": "uuid"
  }
}
```

Request middleware создаёт/принимает безопасный request ID. Logger пишет JSON-like human-readable строки в stdout и `data/logs/YYYY-MM-DD.log`, редактируя authorization values, tokens, full content и absolute paths. Job records содержат тот же request ID.

### Liveness, readiness и shutdown имеют разные обязанности

- `/api/health` сообщает только, что HTTP process жив.
- `/api/ready` проверяет data directories, write capability для mutable roots, Python executable и security config без provider calls.
- `SIGINT`/`SIGTERM` закрывает listener, запрещает новые mutations и ждёт jobs до grace deadline. Незавершённые jobs получают `interrupted`, дочерние процессы завершаются, scenario success state не подделывается.

### Tests используют built-in Node runner и temporary roots

Используется `node:test` и встроенный `fetch`, чтобы не добавлять test framework dependency. Tests создают app через `createApp()`, временные scenario trees и fake runner. Отдельные contract fixtures проверяют transition matrix, validation, error codes и serializers.

Security tests передают traversal и shell syntax как данные и доказывают отсутствие вызова runner. Render tests mock process completion и filesystem promotion; live credentials и network providers не используются.

## Risks / Trade-offs

- [Cross-runtime lifecycle logic Telegram/Python может продолжить расходиться с Node] → Зафиксировать contract fixtures и после Web change применить их к другим runtime helpers отдельной задачей.
- [Filesystem не предоставляет multi-file transaction] → Использовать one-record rename transitions, staged trash/promotion manifests и startup recovery; держать все mutable roots на одном filesystem.
- [Remote token в browser session доступен JavaScript текущего origin] → Не хранить token постоянно, запрещать сторонние origins и документировать reverse proxy как предпочтительный production boundary.
- [Persisted job records увеличивают число файлов] → Ввести retention cleanup только для terminal jobs и никогда не удалять active job автоматически.
- [Удаление legacy `/scenarios` route может сломать внешние ссылки] → UI уже использует API; задокументировать breaking change и вернуть `404`, не временный insecure redirect.
- [Staging rerender затрагивает Python renderer сверх `server.js`] → Ограничить изменения CLI contract и exit codes; не менять provider или assembly semantics.
- [Feedback остаётся временно feedback-only] → UI явно называет его revision request; не закрывать DEC-3 до реализации отдельного change.

## Migration Plan

1. Добавить config, errors, logger, validation и app factory без переключения production routes.
2. Добавить scenario store/lifecycle и contract tests на temporary roots.
3. Перевести read/create/approve/reject/seed/feedback/delete routes на новые helpers.
4. Добавить process runner, machine-readable Python result и durable job store.
5. Обновить renderer exit contract, approved defense-in-depth и staging rerender.
6. Добавить access-control middleware, local/remote startup checks и remote token support в UI.
7. Удалить `/scenarios` static route и включить safe serializers.
8. Включить readiness, graceful shutdown, recovery/retention cleanup и полную integration/security suite.
9. Обновить `.env.example`, API/workflow documentation, `CLAUDE.md` approval rule и `CHANGELOG.md`.

Rollback: остановить server и вернуть предыдущий Web build. Canonical scenario JSON не мигрируется. Terminal job, staging и trash records можно оставить для диагностики; rollback не изменяет `data/archive/`. До production switch следует создать backup mutable data root и пройти dry-run integration suite.

## Open Questions

Нет. Значения timeout, payload bounds, seed range, job retention и shutdown grace являются deployment defaults и могут уточняться в implementation без изменения behavioral contracts.
