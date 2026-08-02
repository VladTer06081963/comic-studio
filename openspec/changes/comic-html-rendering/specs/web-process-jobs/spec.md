## MODIFIED Requirements

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

### Requirement: Render artifact observability
При успешном render job запись SHALL включать флаг `html_generated` чтобы observability tooling знал, что HTML-артефакт также доступен (не только PNG).

#### Scenario: Job record includes html_generated flag
- **WHEN** render job завершается с `succeeded`
- **THEN** `job.result` содержит поле `html_generated: true` (если HTML был успешно сгенерирован) или `html_generated: false` (если HTML-renderer упал, но PNG-preview валиден)
