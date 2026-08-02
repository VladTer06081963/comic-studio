# web-scenario-operations Specification

## Purpose

Определяет безопасное и предсказуемое поведение filesystem-backed Web API для создания, просмотра и изменения lifecycle сценариев Comic Studio.
## Requirements
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
Render API SHALL разрешать initial render только для `approved`, SHALL требовать явное подтверждение re-render для `rendered` и MUST отклонять `draft`, `rejected` и `published` до запуска render process. Render, re-render и publication MUST оставаться заблокированы до повторного approval после revision. Сервер SHALL блокировать initial render, re-render и publication с `409` error code `APPROVAL_REQUIRED`, пока scenario не вернётся в `approved` с новым `approved_at` timestamp.

#### Scenario: Approved scenario starts initial render
- **WHEN** клиент вызывает render для canonical approved scenario
- **THEN** server принимает initial render и создаёт один render job

#### Scenario: Rendered scenario lacks explicit rerender mode
- **WHEN** клиент вызывает обычный render для status `rendered` без явного rerender request
- **THEN** server возвращает `409` с error code `RERENDER_CONFIRMATION_REQUIRED` и не запускает process

#### Scenario: Render blocked after revision
- **WHEN** scenario находится в `draft` после успешного revision
- **THEN** server возвращает `409` с error code `APPROVAL_REQUIRED` и не создаёт render job

#### Scenario: Render allowed after re-approval
- **WHEN** scenario возвращается в `approved` после повторного approval
- **THEN** render policy снова разрешает initial render

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

### Requirement: Revision workflow replaces transitional feedback behavior
Feedback API остаётся для backward-compatible feedback recording, но SHALL возвращать `409` с error code `REVISION_REQUIRED` и подсказкой вызвать revision endpoint; для approved и rendered сценариев клиент SHOULD вызвать `POST /api/scenarios/:id/revise`, а для published — `POST /api/scenarios/:id/remix`. Revision атомарно переводит scenario в `draft`, ставит его в `revision_queued` и возвращает `202` с revision job ID. Remix создаёт новый draft с `remix_of: <source_id>`, не изменяя `published` record.

#### Scenario: Legacy feedback endpoint receives data
- **WHEN** клиент отправляет feedback на `POST /api/scenarios/:id/feedback` для не-published scenario
- **THEN** server возвращает `409` с error code `REVISION_REQUIRED`, structured details и `remix_endpoint` если scenario is published, не записывая feedback в `scenario.feedback`

#### Scenario: Author uses revision endpoint
- **WHEN** клиент вызывает `POST /api/scenarios/:id/revise` для approved scenario
- **THEN** server атомарно переводит scenario в `draft` и возвращает `202` с revision job ID, как определено в `scenario-revision-and-remix` capability

#### Scenario: Remix endpoint returns new draft ID
- **WHEN** клиент вызывает `POST /api/scenarios/:id/remix` для published scenario
- **THEN** server возвращает `201` с `id` нового draft, `remix_of: <source_id>` и `status: draft`

#### Scenario: Scenario serializer reports remix source
- **WHEN** API возвращает scenario с полем `remix_of`
- **THEN** response содержит `remix_of: <source_id>` и исключает `published_at` или `comic_path` если scenario is draft

#### Scenario: Feedback is sent to published scenario
- **WHEN** клиент отправляет feedback для status `published`
- **THEN** server возвращает `409` с error code `PUBLISHED_IMMUTABLE` и предлагает вызвать `remix_endpoint`

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

### Requirement: Comic artifacts coverage
Rendered scenarios MUST иметь как PNG-preview, так и HTML-артефакт, доступные через Web API. PNG-preview используется для backward-compat (Telegram, Notion, archive), HTML — primary artifact для браузера/шеринга. Scenario record хранит `comic_path` (PNG) и `panel_paths` (panels); HTML-путь predictable из `id` (`data/comics/<id>.html`).

#### Scenario: Rendered scenario exposes both artifacts
- **WHEN** scenario в `rendered` status
- **THEN** `GET /comics/<id>.png` возвращает 200 `image/png` И `GET /comics/<id>.html` возвращает 200 `text/html` (если HTML был сгенерирован)

#### Scenario: HTML generation is side-effect of render
- **WHEN** initial render или rerender завершается успешно
- **THEN** `py/render/comic_assembler.assemble_comic` создаёт и PNG, и HTML+манифест (один pipeline, не отдельные ручные шаги)

#### Scenario: HTML predictable path
- **WHEN** `assemble_comic` рендерит scenario `c6964b6a`
- **THEN** HTML создаётся в `data/comics/c6964b6a.html` (predictable, не хранится в scenario record)

