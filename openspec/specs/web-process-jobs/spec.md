# web-process-jobs Specification

## Purpose

Обеспечивает безопасный, ограниченный по времени и наблюдаемый запуск Python-операций без shell-интерпретации пользовательских данных и дублирующих jobs.
## Requirements
### Requirement: Shell-free process invocation
Система MUST передавать executable и каждый argument как отдельные значения без shell interpolation, а пользовательский content, styles и scenario IDs SHALL обрабатываться как opaque arguments.

#### Scenario: Input contains shell syntax
- **WHEN** content, style или ID содержит shell metacharacters либо command substitution syntax
- **THEN** server отклоняет invalid field или передаёт допустимое значение буквально и никакая дополнительная команда не выполняется

### Requirement: Bounded process execution
Каждый дочерний process SHALL иметь configurable timeout и bounded output capture; timeout или abnormal exit SHALL завершать operation как failure с сохранением lifecycle state, разрешающего безопасный retry.

#### Scenario: Python process exceeds timeout
- **WHEN** ingestion или render process не завершается в настроенный срок
- **THEN** server останавливает process, помечает operation failed и не сообщает scenario как успешно созданный или rendered

#### Scenario: Python process exits unsuccessfully
- **WHEN** process завершается с non-zero exit code
- **THEN** server сохраняет structured failure outcome и не интерпретирует наличие stdout как success

### Requirement: Observable render jobs
Успешно принятый render request SHALL возвращать `202` с stable job ID, scenario ID и job status; клиент SHALL иметь API для получения `queued`, `running`, `succeeded` или `failed` outcome. Job record SHALL включать `type` (`render` или `revision`), `mode` (для render), `revision_kind` (для revision), `source_context_preview`, `feedback_count`, timestamps и originating `request_id`.

#### Scenario: Render job is accepted
- **WHEN** валидный approved render request успешно поставлен на выполнение
- **THEN** response содержит `202`, job ID и начальный observable status

#### Scenario: Client polls a completed job
- **WHEN** клиент запрашивает существующий завершённый job
- **THEN** server возвращает terminal status, timestamps, `type`, type-specific metadata, originating `request_id` и безопасное result или error summary

#### Scenario: Job detail includes revision metadata
- **WHEN** клиент запрашивает `GET /api/jobs/:id` для revision job
- **THEN** response содержит `type: "revision"`, `revision_kind`, `source_context_preview`, `feedback_count` и `request_id`

### Requirement: Per-scenario job deduplication
Система MUST предотвращать одновременные render и revision jobs для одного scenario ID, возвращая `409` с error code `BUSY` и active job ID вместо запуска второго process.

#### Scenario: Duplicate render request arrives
- **WHEN** для scenario уже существует `queued` или `running` job любого типа
- **THEN** server не запускает второй process и возвращает `409` с error code `BUSY` и active job ID

#### Scenario: Render blocks revision
- **WHEN** для scenario уже есть queued или running job любого типа
- **THEN** server отклоняет новый request с `409` и error code `BUSY`, включая active job ID

#### Scenario: Revision blocks render
- **WHEN** revision job активен
- **THEN** server отклоняет render request и не обращается к image provider

### Requirement: Safe rerender replacement
Explicit rerender SHALL создавать candidate artifacts отдельно от текущего rendered comic и SHALL заменять текущий результат только после успешной проверки всех panels и final PNG.

#### Scenario: Rerender fails before completion
- **WHEN** один panel, assembly или validation candidate artifacts завершается ошибкой
- **THEN** текущий rendered scenario и его comic остаются неизменными, а job получает status `failed`

#### Scenario: Rerender succeeds
- **WHEN** все candidate artifacts успешно созданы и проверены
- **THEN** они атомарно становятся текущим rendered result, render revision увеличивается и job получает status `succeeded`

### Requirement: Configurable executable readiness
До принятия process-backed operation система SHALL проверять доступность configured Python executable и SHALL считать server not ready, если executable отсутствует или не запускается.

#### Scenario: Python executable is unavailable
- **WHEN** readiness check не может использовать configured Python executable
- **THEN** readiness endpoint сообщает not ready, а process-backed mutation возвращает service unavailable без создания job

