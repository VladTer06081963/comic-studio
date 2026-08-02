## Purpose

Расширяет существующую web-process-jobs capability, добавляя revision job lifecycle и cross-job deduplication.

## MODIFIED Requirements

### Requirement: Process runner covers revision and render jobs
Система MUST запускать Python revision и render processes через один shell-free process runner с раздельными argument arrays, timeouts и machine-readable result форматом, и SHALL различать jobs по полю `type` (`render` или `revision`).

#### Scenario: Revision process invocation
- **WHEN** revision job accepted
- **THEN** process runner запускает `scripts/revise_scenario.py` с bounded feedback history и source context, без shell interpolation

#### Scenario: Render process invocation
- **WHEN** render job accepted
- **THEN** process runner запускает `scripts/render_approved.py` без shell interpolation, как в harden-web-server-api

### Requirement: Per-scenario job deduplication
Заменить однородную дедупликацию render на cross-type дедупликацию: для одного scenario ID одновременно допускается не более одного active job любого типа. Сервер MUST возвращать `409` с error code `BUSY` и active job ID вместо запуска второго process.

#### Scenario: Render blocks revision
- **WHEN** для scenario уже есть queued или running job любого типа
- **THEN** server отклоняет новый request с `409` и error code `BUSY`, включая active job ID

#### Scenario: Revision blocks render
- **WHEN** revision job активен
- **THEN** server отклоняет render request и не обращается к image provider

### Requirement: Observable job lifecycle
Система SHALL возвращать `202` с stable job ID для обоих типов jobs, и `GET /api/jobs/:id` SHALL возвращать `type`, `scenario_id`, `mode` (для render) и `revision_kind` (для revision), текущий status, timestamps, originating request_id, result и error.

#### Scenario: Job detail includes type
- **WHEN** клиент запрашивает `GET /api/jobs/:id` для render или revision job
- **THEN** response содержит поле `type` со значением `render` или `revision`, плюс type-specific metadata
