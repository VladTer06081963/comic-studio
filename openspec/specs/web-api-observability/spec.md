# web-api-observability Specification

## Purpose

Делает Web API диагностируемым и безопасным в эксплуатации через единые ошибки, дневные логи, readiness checks и контролируемое завершение процесса.

## Requirements

### Requirement: Structured API errors
Все API failures SHALL возвращать JSON error object с stable code, безопасным message и request ID и MUST NOT раскрывать stack traces, authorization values или абсолютные local paths.

#### Scenario: Route encounters a filesystem failure
- **WHEN** API operation не может прочитать или записать required file
- **THEN** response содержит соответствующий HTTP status и structured error без stack trace, secret или absolute path

#### Scenario: Request body is malformed JSON
- **WHEN** клиент отправляет malformed JSON body
- **THEN** server возвращает `400` с error code `INVALID_JSON` и остаётся доступным для следующих requests

### Requirement: Unified Web logging
Web server SHALL записывать timestamp, severity, component, request ID, scenario ID при наличии, operation, duration и outcome одновременно в stdout и `data/logs/<YYYY-MM-DD>.log`, исключая secrets и полное пользовательское content.

#### Scenario: Scenario transition succeeds
- **WHEN** approve, reject, render acceptance, feedback или delete завершается
- **THEN** дневной log содержит operation outcome и scenario ID без token или полного source context

#### Scenario: Authorization fails
- **WHEN** remote request содержит invalid bearer token
- **THEN** log фиксирует unauthorized outcome, но не сохраняет полученный или ожидаемый token

### Requirement: Liveness and readiness separation
Система SHALL предоставлять отдельный liveness response для работающего HTTP process и readiness response, проверяющий required directories, configured executable и обязательную remote security configuration без вызова платных external providers.

#### Scenario: HTTP process is alive but Python is unavailable
- **WHEN** server принимает HTTP requests, но configured Python executable недоступен
- **THEN** liveness сообщает healthy, readiness сообщает not ready и не выполняет MiniMax, Telegram, Notion или publication requests

### Requirement: Request correlation
Каждый API response SHALL содержать или возвращать request ID, который совпадает с ID в связанных log entries и process job metadata.

#### Scenario: Client reports an API failure
- **WHEN** клиент получает structured error
- **THEN** error request ID позволяет найти соответствующие server и job log entries без раскрытия приватных данных

### Requirement: Graceful shutdown
При `SIGINT` или `SIGTERM` server SHALL прекратить приём новых mutations, SHALL ограниченно дождаться active jobs либо безопасно завершить их и SHALL не оставлять operation в ложном terminal success state.

#### Scenario: Shutdown occurs during render
- **WHEN** shutdown signal приходит при active render job
- **THEN** новые mutations отклоняются, job либо завершается в grace period, либо получает recoverable failed/interrupted outcome, а scenario не помечается rendered без final artifact

### Requirement: Deterministic startup diagnostics
Server SHALL валидировать runtime configuration до начала listen и SHALL сообщать host, port, mode и readiness-safe diagnostics без печати secrets.

#### Scenario: Configuration is invalid
- **WHEN** port, data root, remote access settings или process timeout имеют invalid value
- **THEN** server завершается до listen с actionable configuration error, не выводя token values
