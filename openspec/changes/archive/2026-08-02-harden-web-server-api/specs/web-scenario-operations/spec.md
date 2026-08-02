## Purpose

Определяет безопасное и предсказуемое поведение filesystem-backed Web API для создания, просмотра и изменения lifecycle сценариев Comic Studio.

## ADDED Requirements

### Requirement: Validated identifiers and payloads
Система MUST валидировать scenario IDs, status selectors и JSON payloads до построения filesystem paths или выполнения mutation и SHALL принимать только документированные status, style и value ranges.

#### Scenario: Scenario ID contains traversal characters
- **WHEN** клиент передаёт ID с `/`, `..`, encoded separator или управляющим символом
- **THEN** server возвращает `400` с error code `INVALID_SCENARIO_ID` и не обращается к пути за пределами scenario root

#### Scenario: Status selector is unknown
- **WHEN** клиент запрашивает список с status вне `draft`, `approved`, `rejected`, `rendered`, `published` или `all`
- **THEN** server возвращает `400` с error code `INVALID_STATUS`

### Requirement: Validated scenario creation
`POST /api/scenarios` SHALL принимать непустой bounded content и только поддерживаемые image/caption styles, SHALL отклонять invalid input до запуска ingestion и SHALL возвращать `201` с ID успешно сохранённого draft.

#### Scenario: Scenario creation input is invalid
- **WHEN** content пуст после trim или style отсутствует в allowlist
- **THEN** server возвращает `400` и не запускает Python process

#### Scenario: Draft creation succeeds
- **WHEN** валидный input успешно обработан и draft сохранён
- **THEN** server возвращает `201` с canonical scenario ID и status `draft`

### Requirement: Canonical scenario lookup
Система SHALL находить не более одной active scenario record на ID, SHALL отклонять конфликт нескольких lifecycle queues и SHALL изолировать malformed records так, чтобы один повреждённый файл не ломал весь list response.

#### Scenario: Same ID exists in multiple queues
- **WHEN** lookup обнаруживает один ID в нескольких lifecycle directories
- **THEN** mutation отклоняется с `409` и error code `SCENARIO_STATE_CONFLICT`

#### Scenario: One list record is malformed
- **WHEN** status directory содержит валидные records и один malformed JSON
- **THEN** API возвращает валидные records, сообщает число пропущенных invalid records и логирует проблему без раскрытия их содержимого

### Requirement: Atomic lifecycle transitions
Approve и reject operations SHALL выполнять conflict-safe atomic transition только из `draft`, SHALL сохранять ID и history и MUST NOT оставлять active record одновременно в source и destination queues.

#### Scenario: Draft is approved from Web UI
- **WHEN** авторизованный клиент approves существующий draft
- **THEN** scenario существует только в `approved` со status `approved` и server возвращает успешный transition result

#### Scenario: Approval is repeated
- **WHEN** approve повторно вызывается для уже approved scenario
- **THEN** server возвращает текущий approved state как idempotent success без создания duplicate record

#### Scenario: Transition conflicts with current state
- **WHEN** approve или reject запрошен для scenario в несовместимом status
- **THEN** server возвращает `409` и не изменяет persisted record

### Requirement: Render lifecycle policy
Render API SHALL разрешать initial render только для `approved`, SHALL требовать явное подтверждение re-render для `rendered` и MUST отклонять `draft`, `rejected` и `published` до запуска render process.

#### Scenario: Approved scenario starts initial render
- **WHEN** клиент вызывает render для canonical approved scenario
- **THEN** server принимает initial render и создаёт один render job

#### Scenario: Rendered scenario lacks explicit rerender mode
- **WHEN** клиент вызывает обычный render для status `rendered` без явного rerender request
- **THEN** server возвращает `409` с error code `RERENDER_CONFIRMATION_REQUIRED` и не запускает process

#### Scenario: Published scenario is requested for render
- **WHEN** клиент вызывает render или rerender для status `published`
- **THEN** server возвращает `409` с error code `PUBLISHED_IMMUTABLE` и не изменяет scenario или artifacts

#### Scenario: Draft or rejected scenario is requested for render
- **WHEN** render вызывается для status `draft` или `rejected`
- **THEN** server возвращает `409` с error code `APPROVAL_REQUIRED` и не запускает process

### Requirement: Seed consistency
Standalone seed mutation SHALL принимать только integer в документированном диапазоне для `draft` или `approved`; новый seed для `rendered` SHALL передаваться только как часть explicit rerender, а `published` seed MUST NOT изменяться.

#### Scenario: Invalid seed is supplied
- **WHEN** seed отсутствует, не является integer или выходит за разрешённый диапазон
- **THEN** server возвращает `400` с error code `INVALID_SEED` и не подставляет значение `0` автоматически

#### Scenario: Rendered seed is changed without rerender
- **WHEN** клиент вызывает standalone seed mutation для status `rendered`
- **THEN** server возвращает `409` и persisted seed остаётся связан с текущим rendered artifact

### Requirement: Transitional feedback behavior
До внедрения отдельного revision workflow feedback API SHALL принимать bounded non-empty text только как сохранённый revision request и MUST NOT сообщать, что scenario content был изменён или regenerated.

#### Scenario: Feedback note is recorded
- **WHEN** клиент отправляет валидный feedback для непубликованного scenario
- **THEN** server сохраняет timestamped feedback record и отвечает состоянием `feedback_recorded`, не заявляя об изменении panels или prompts

#### Scenario: Feedback is sent to published scenario
- **WHEN** клиент отправляет feedback для status `published`
- **THEN** server возвращает `409` с error code `PUBLISHED_IMMUTABLE`; будущий remix выполняется отдельным workflow

### Requirement: Guarded deletion
Delete API SHALL требовать явное подтверждение, MUST NOT удалять published или archived content и SHALL сообщать success только после обработки canonical scenario и всех связанных mutable comic artifacts.

#### Scenario: Delete lacks explicit confirmation
- **WHEN** клиент вызывает delete без документированного confirmation value
- **THEN** server возвращает `409` с error code `DELETE_CONFIRMATION_REQUIRED` и ничего не удаляет

#### Scenario: Published deletion is requested
- **WHEN** клиент подтверждает delete для status `published`
- **THEN** server возвращает `409` с error code `PUBLISHED_IMMUTABLE` и сохраняет scenario и artifacts

#### Scenario: Mutable scenario is deleted
- **WHEN** клиент подтверждает delete для допустимого mutable status
- **THEN** server удаляет canonical scenario, panels, final comic и raw copy, не изменяя `data/archive/`, и возвращает перечень обработанных artifacts
