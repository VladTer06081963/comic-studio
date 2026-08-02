## Purpose

Изменяет существующую web-scenario-operations capability, заменяя transitional feedback на revision workflow и интегрируя remix endpoint.

## MODIFIED Requirements

### Requirement: Revision workflow replaces transitional feedback behavior
Заменить `transitional feedback behavior` на полноценный revision workflow. Endpoint `POST /api/scenarios/:id/feedback` остаётся для backward-compatible feedback recording, но SHALL возвращать `409` с error code `REVISION_REQUIRED` и подсказкой вызвать revision endpoint; для approved и rendered сценариев клиент SHOULD вызвать `POST /api/scenarios/:id/revise`, а для published — `POST /api/scenarios/:id/remix`.

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

### Requirement: Render lifecycle policy
Render policy остаётся без изменений: `approved` для initial, `rendered` для explicit rerender, `draft`/`rejected`/`published` отклоняются. Новый contract — render, re-render и publication MUST оставаться заблокированы до повторного approval после revision. Сервер SHALL блокировать initial render, re-render и publication с `409` error code `APPROVAL_REQUIRED`, пока scenario не вернётся в `approved` с новым `approved_at` timestamp.

#### Scenario: Render blocked after revision
- **WHEN** scenario находится в `draft` после успешного revision
- **THEN** server возвращает `409` с error code `APPROVAL_REQUIRED` и не создаёт render job, как определено ранее

#### Scenario: Render allowed after re-approval
- **WHEN** scenario возвращается в `approved` после повторного approval
- **THEN** render policy снова разрешает initial render
