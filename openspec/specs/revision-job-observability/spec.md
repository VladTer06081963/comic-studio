## Purpose

Расширяет persisted job lifecycle и observability так, чтобы revision jobs отслеживались и координировались параллельно с render jobs, обеспечивая видимое состояние, безопасный retry и согласованный correlation между запросами.

## Requirements

### Requirement: Revision job state machine
Система SHALL сохранять каждый revision request как `revision` job в `data/jobs/<job-id>.json` с состояниями `queued`, `running`, `succeeded`, `failed` и `interrupted`, и SHALL возвращать revision job ID из `POST /api/scenarios/:id/revise` и `POST /api/scenarios/:id/remix`.

#### Scenario: Revision job is accepted
- **WHEN** revision request валиден и атомарный draft-transition выполнен
- **THEN** server создаёт `revision` job со status `queued` и возвращает его ID в `202` response

#### Scenario: Revision job polling
- **WHEN** клиент запрашивает `GET /api/jobs/:id` для revision job
- **THEN** server возвращает status, timestamps, scenario_id, source revision metadata и безопасный result или error summary

### Requirement: Cross-job deduplication
Система MUST предотвращать параллельные `render` и `revision` jobs для одного scenario ID, возвращая `409` с error code `BUSY` и active job ID вместо запуска второго process.

#### Scenario: Revision while render is active
- **WHEN** для scenario существует `queued` или `running` render job
- **THEN** server отклоняет revision request с `409` и не создаёт LLM-вызов

#### Scenario: Render while revision is active
- **WHEN** для scenario существует `queued` или `running` revision job
- **THEN** server отклоняет render request с `409` и не запускает image provider

### Requirement: Interrupted revision jobs
При server restart queued и running revision jobs MUST помечаться `interrupted`, а автоматический paid retry SHALL не выполняться без нового author request.

#### Scenario: Revision job interrupted by restart
- **WHEN** server перезапускается при active revision job
- **THEN** job получает status `interrupted` со structured error и revision metadata остаётся в scenario record для безопасного retry

#### Scenario: Manual revision retry
- **WHEN** клиент отправляет новый revision request после interrupted job
- **THEN** server запускает новый revision job без replaying предыдущего LLM-вызова

### Requirement: Revision request correlation
Каждый revision job SHALL сохранять originating `request_id` и `scenario_id`, что позволяет находить соответствующие log entries и Python process output по `request_id` без раскрытия полного feedback content.

#### Scenario: Author debugs failed revision
- **WHEN** revision завершается с error
- **THEN** log entries и job record используют один `request_id`, что позволяет сопоставить их без раскрытия остальных полей
