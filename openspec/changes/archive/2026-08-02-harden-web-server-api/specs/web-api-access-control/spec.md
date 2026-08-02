## Purpose

Защищает локальный Web API и данные сценариев, разрешая удобную работу через localhost и только явно настроенный авторизованный удалённый доступ.

## ADDED Requirements

### Requirement: Local access by default
При отсутствии явной remote-конфигурации Web server SHALL принимать соединения только через loopback interface и SHALL поддерживать same-origin UI requests без обязательного bearer token.

#### Scenario: Server starts with default configuration
- **WHEN** оператор запускает Web server без `HOST` и remote access settings
- **THEN** server доступен через `127.0.0.1` и не принимает соединения через внешние network interfaces

### Requirement: Fail-closed remote mode
Если server настроен на non-loopback interface, система MUST требовать одновременно bearer token и непустой allowlist origins и MUST отказаться от запуска при неполной remote-конфигурации.

#### Scenario: Remote host has no token
- **WHEN** `HOST` указывает non-loopback interface, а token или allowed origins отсутствуют
- **THEN** server завершается с configuration error до начала приёма HTTP requests

#### Scenario: Remote mode is fully configured
- **WHEN** non-loopback `HOST`, bearer token и allowed origins заданы корректно
- **THEN** server запускается и применяет remote authentication и origin policy ко всем API requests

### Requirement: Remote API authentication
В remote mode система MUST требовать корректный bearer token для каждого `/api/*` request и SHALL отвечать структурированной ошибкой без раскрытия ожидаемого token.

#### Scenario: Remote request has no valid token
- **WHEN** клиент обращается к `/api/scenarios` в remote mode без корректного bearer token
- **THEN** server возвращает `401` с error code `UNAUTHORIZED` и не читает и не изменяет scenario data

### Requirement: Restrictive origin policy
Система SHALL разрешать browser cross-origin access только origins из явного allowlist и SHALL не использовать wildcard origin для авторизованного API.

#### Scenario: Browser origin is not allowed
- **WHEN** browser отправляет API request с Origin, отсутствующим в allowlist
- **THEN** server отклоняет request с `403` и не выполняет route operation

### Requirement: Scenario files are not public static assets
Система MUST NOT раздавать исходные scenario JSON через static route и SHALL предоставлять scenario data только через валидированный API с применением текущей access policy.

#### Scenario: Client requests legacy scenario static path
- **WHEN** клиент обращается к `/scenarios/<status>/<id>.json`
- **THEN** server возвращает `404` и не раскрывает содержимое файла

### Requirement: Safe scenario representations
Scenario list и detail responses SHALL содержать только schema-approved fields, MUST NOT включать secrets или абсолютные filesystem paths и SHALL представлять доступные comic artifacts как HTTP URLs.

#### Scenario: Scenario contains an absolute comic path
- **WHEN** API возвращает scenario, в котором persisted record содержит локальный `comic_path`
- **THEN** response не содержит абсолютный путь и использует безопасный comic URL либо опускает поле
