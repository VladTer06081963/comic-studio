## Why

`web/server.js` предоставляет критические lifecycle-операции, но сейчас принимает непроверенные пути и payloads, запускает Python через shell-команды, дублирует переходы статусов и разрешает небезопасный удалённый доступ. Укрепление API необходимо до дальнейшего развития настоящего редактирования, remix и автоматизации публикации.

## What Changes

- Ввести безопасный локальный режим по умолчанию: bind на `127.0.0.1`, same-origin запросы и закрытый CORS.
- Ввести явный remote mode, который требует allowlist origins и bearer token до запуска сервера.
- Добавить строгую валидацию scenario ID, lifecycle status, content, styles, seed и feedback payloads.
- Удалить публичную статическую раздачу scenario JSON и возвращать только валидированные API-представления.
- Централизовать поиск, чтение, атомарную запись и lifecycle-переходы сценариев в Node helpers с защитой от конфликтов и дубликатов ID.
- Сохранить ручной approval через локальный/авторизованный Web UI с теми же lifecycle-инвариантами, что и Telegram.
- Разрешить первичный render только из `approved`, явный re-render только из `rendered`, а `draft`, `rejected` и `published` отклонять до запуска Python.
- Запускать Python только через `execFile`/`spawn` с массивом аргументов, timeout, контролем конкурентных jobs и структурированным результатом.
- Добавить единый JSON error contract, Node file logging, liveness/readiness endpoints и graceful shutdown.
- Разделить Express app и network listener и добавить API/lifecycle/security tests с временным data root и mocked subprocesses.
- **BREAKING**: сервер больше не слушает внешние интерфейсы по умолчанию; remote mode без token/origin configuration не запускается.
- **BREAKING**: `/scenarios` перестаёт публично раздавать исходные JSON-файлы.
- **BREAKING**: render для `published` возвращает конфликт `PUBLISHED_IMMUTABLE`; создание remix будет реализовано отдельным change `scenario-revision-and-remix`.
- Настоящая LLM-регенерация по feedback и клонирование published-сценариев не входят в этот change; текущий feedback route только валидируется и изолируется до отдельной реализации revision workflow.

## Capabilities

### New Capabilities

- `web-api-access-control`: Локальный и удалённый режимы доступа, CORS, bearer authentication и защита scenario data.
- `web-scenario-operations`: Валидированные filesystem-backed API и единые lifecycle-инварианты для approve, reject, render, seed, feedback и delete.
- `web-process-jobs`: Безопасный запуск Python-процессов, timeout, дедупликация render jobs и наблюдаемый job lifecycle.
- `web-api-observability`: Структурированные ошибки, дневное логирование, health/readiness и graceful shutdown.

### Modified Capabilities

Нет: `openspec/specs/` пока не содержит канонических main specs, поэтому этот change вводит новые capability contracts.

## Impact

- Основной код: `web/server.js`, новые модули под `web/routes/` и `web/lib/`.
- Конфигурация: `HOST`, `PORT`, `DATA_ROOT`, `PYTHON_BIN`, `WEB_API_TOKEN`, `WEB_ALLOWED_ORIGINS`, process timeout.
- API: изменятся правила доступа, status codes и ошибки mutation endpoints; будет удалён `/scenarios` static route.
- UI: потребуется поддержка bearer token в remote mode и обработка структурированных API errors.
- Runtime: Python scripts продолжают быть точками исполнения, но вызываются без shell interpolation.
- Dependencies/tests: Node test runner, HTTP integration tests и mocked child processes; live MiniMax, Telegram, Notion и site credentials не используются.
- Документация и правила: после реализации необходимо согласовать `CLAUDE.md`, README, workflow и API contract с разрешённым Web approval и immutable published lifecycle.
