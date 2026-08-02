## MODIFIED Requirements

### Requirement: Render lifecycle policy
Render API SHALL разрешать initial render только для `approved`, SHALL требовать явное подтверждение re-render для `rendered` и MUST отклонять `draft`, `rejected` и `published` до запуска render process. Render, re-render и publication MUST оставаться заблокированы до повторного approval после revision. Сервер SHALL блокировать initial render, re-render и publication с `409` error code `APPROVAL_REQUIRED`, пока scenario не вернётся в `approved` с новым `approved_at` timestamp.

#### Scenario: Render blocked after revision
- **WHEN** scenario находится в `draft` после успешного revision
- **THEN** server возвращает `409` с error code `APPROVAL_REQUIRED` и не создаёт render job

#### Scenario: Render allowed after re-approval
- **WHEN** scenario возвращается в `approved` после повторного approval
- **THEN** render policy снова разрешает initial render

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
