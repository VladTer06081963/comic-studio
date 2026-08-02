## Purpose

Реализует revision и remix workflow для filesystem-backed scenario lifecycle, чтобы автор мог применять bounded feedback к LLM-сгенерированному контенту и создавать новые drafts из published records без потери исходных ссылок.

## ADDED Requirements

### Requirement: LLM revision request
Система SHALL принимать revision request для scenarios в статусе `approved` или `rendered`, передавать bounded feedback history в Python `revise_scenario()` и возвращать `202` с revision job ID; сценарий MUST перейти в `draft` до запуска LLM-вызова и SHALL сохранять feedback history до завершения revision.

#### Scenario: Approved scenario requests revision
- **WHEN** авторизованный клиент отправляет revision request для approved scenario
- **THEN** server атомарно переводит scenario в `draft` со статусом `revision_queued` и возвращает `202` с revision job ID

#### Scenario: Rendered scenario requests revision
- **WHEN** авторизованный клиент отправляет revision request для rendered scenario
- **THEN** server переводит scenario в `draft`, перемещает текущие rendered artifacts в `data/.staging/legacy/<scenario-id>/` и планирует revision job

#### Scenario: Feedback history is bounded
- **WHEN** revision request содержит более `WEB_MAX_REVISION_FEEDBACK_COUNT` (по умолчанию 20) feedback items
- **THEN** server возвращает `400` с error code `REVISION_FEEDBACK_LIMIT` и не запускает LLM-вызов

### Requirement: Atomic revision persistence
После успешного LLM-вызова система MUST атомарно сохранять revised panels, prompts и captions в том же `data/scenarios/draft/<id>.json` со свежим `revision_at`, `revision_source` и bounded feedback count, а предыдущий revision source SHALL сохраняться в `revision_history` массиве.

#### Scenario: Successful revision updates draft
- **WHEN** LLM-вызов успешно завершается и возвращает valid scenario JSON
- **THEN** server атомарно записывает revised draft со status `revision_succeeded` и требует нового approval

#### Scenario: Revision LLM fails
- **WHEN** LLM-вызов завершается non-zero exit, timeout или возвращает invalid JSON
- **THEN** server сохраняет `revision_failed` status, scenario остаётся в `draft` с сохранённым feedback и `revision_error` metadata, а render и publication остаются заблокированы

#### Scenario: Revision retry is idempotent
- **WHEN** клиент отправляет повторный revision request для scenario в статусе `revision_queued` или `revision_failed`
- **THEN** server не создаёт второй параллельный revision job и возвращает `409` с error code `REVISION_ALREADY_RUNNING` и active job ID

### Requirement: Published remix
Система SHALL отклонять `revise` для `published` records и SHALL предоставлять `remix` endpoint, который создаёт новый draft с новым ID, копирует title, panels, captions, style и image_style из source record, добавляет `remix_of` с source ID и сохраняет новый draft без изменения published record.

#### Scenario: Author remixes a published scenario
- **WHEN** авторизованный клиент вызывает `POST /api/scenarios/:id/remix` для published scenario
- **THEN** server создаёт новый draft с новым ID и `remix_of: <source_id>`, оставляя source record без изменений

#### Scenario: Remix requires published status
- **WHEN** клиент вызывает remix для не-published scenario
- **THEN** server возвращает `409` с error code `REMIX_REQUIRES_PUBLISHED` и предлагает использовать revision для `approved`/`rendered` records

#### Scenario: Remix feedback is independent
- **WHEN** создаётся новый draft через remix
- **THEN** новый draft получает пустой `feedback` массив, в то время как source record сохраняет свою оригинальную историю

### Requirement: Revision requires fresh approval
Система SHALL блокировать initial render, re-render и publication до тех пор, пока scenario не пройдёт повторный approval с новым `approved_at` timestamp, а revision metadata MUST оставаться в record для аудита.

#### Scenario: Render attempted after revision
- **WHEN** клиент вызывает render для scenario в статусе `draft` после revision
- **THEN** server возвращает `409` с error code `APPROVAL_REQUIRED` и не создаёт render job

#### Scenario: Approved after revision restores renderability
- **WHEN** клиент approve scenario со свежим `approved_at` после revision
- **THEN** scenario возвращается в `approved`, revision metadata сохраняется, render policy снова разрешает initial render
