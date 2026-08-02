# CHANGELOG

Накопительный журнал изменений Comic Studio. Записи расположены в хронологическом порядке: от ранних к поздним.

## Правила ведения

- Новые записи добавляются только в конец соответствующей даты.
- Формат времени — ISO 8601 с часовым поясом.
- Одна строка кратко описывает одно логическое изменение.
- `CHANGELOG.md` обновляется при каждой фиксации задачи.
- Секреты, токены и содержимое `.env` в журнал не включаются.

## 2026-08-01

- `2026-08-01T21:17:14+03:00` — Создан первоначальный Comic Studio pipeline: ingest, сценарии, approval, render, publication, cron, Telegram и Web UI.
- `2026-08-01T21:27:07+03:00` — Архивирован OpenSpec change полного MVP и введена процедура фиксации задач.
- `2026-08-01T21:29:45+03:00` — Добавлен fixation skill для AI-агентов.
- `2026-08-01T21:30:46+03:00` — Добавлены `FIXATION.md` и универсальные правила фиксации в `CLAUDE.md`.
- `2026-08-01T21:35:14+03:00` — Интегрирован Supadata API для транскрибации YouTube.
- `2026-08-01T21:38:22+03:00` — Исправлены импорты `urllib` в YouTube ingest.
- `2026-08-01T21:45:18+03:00` — Зафиксирована и архивирована задача интеграции Supadata.
- `2026-08-01T21:51:04+03:00` — YouTube ingest переведён на порядок `yt-dlp → Supadata → Voicebox/Whisper`.
- `2026-08-01T22:03:59+03:00` — Создан OpenSpec change системы визуальных стилей.
- `2026-08-01T22:07:01+03:00` — Реализованы пять `image_style` и их добавление в MiniMax-промты.
- `2026-08-01T22:07:11+03:00` — Обновлены статусы задач style-prompt-system.
- `2026-08-01T22:07:20+03:00` — Архивирован OpenSpec change style-prompt-system.
- `2026-08-01T22:07:35+03:00` — Созданы итоговые audit/tasks для системы стилей.
- `2026-08-01T22:16:28+03:00` — Добавлен выбор `image_style` в Telegram и Web UI.
- `2026-08-01T22:16:33+03:00` — Архивирован OpenSpec change image-style-ui.
- `2026-08-01T22:16:45+03:00` — Зафиксирована задача image-style-ui.
- `2026-08-01T22:27:14+03:00` — Добавлен badge `image_style` в карточки сценариев.
- `2026-08-01T22:45:23+03:00` — Добавлен Web UI для feedback: модальное окно, примеры и счётчик правок.
- `2026-08-01T22:45:26+03:00` — Архивирован OpenSpec change scenario-edit-ui.
- `2026-08-01T22:45:36+03:00` — Зафиксирована задача scenario-edit-ui.
- `2026-08-01T22:47:41+03:00` — Расширена встроенная справка стилями и примерами правок.
- `2026-08-01T22:57:56+03:00` — Исправлен показ кнопок выбора стиля при создании через Telegram.
- `2026-08-01T23:07:04+03:00` — Добавлен выбор caption style в Telegram и Web UI.
- `2026-08-01T23:07:07+03:00` — Архивирован OpenSpec change caption-style-ui.
- `2026-08-01T23:12:03+03:00` — Разрешён повторный запуск render для rendered/published сценариев.
- `2026-08-01T23:14:46+03:00` — Добавлено удаление сценариев и связанных comic artifacts через Telegram и Web UI.
- `2026-08-01T23:14:49+03:00` — Архивирован OpenSpec change scenario-delete-ui.
- `2026-08-01T23:37:00+03:00` — Добавлены render и seed controls в Web UI и edit card в Telegram.
- `2026-08-01T23:37:04+03:00` — Архивирован OpenSpec change render-and-edit-ux.

## 2026-08-02

- `2026-08-02T10:12:38+03:00` — Проведён аудит документации, кода, PRD, summary и OpenSpec; добавлен накопительный `CHANGELOG.md` и правило его обновления при фиксации.
- `2026-08-02T11:33:52+03:00` — Hardened Web API: local/remote access control, atomic lifecycle, shell-free processes, durable render jobs, staging rerender, recoverable delete, tests и актуальная документация.
- `2026-08-02T11:42:14+03:00` — Зафиксирован и архивирован OpenSpec change `harden-web-server-api`: 4 main specs синхронизированы в `openspec/specs/`, 61/61 tasks complete, verification summary сохранён.
- `2026-08-02T12:35:00+03:00` — Реализован `scenario-revision-and-remix`: атомарный `revokeApproval` переводит `approved|rendered → draft` до LLM-вызова, `revise_scenario()` в Python использует bounded feedback и ту же `STYLE_TEMPLATES`, `revision_history` ограничен 10 записями, legacy staging `data/.staging/legacy/<id>-<ts>/` очищается по `WEB_LEGACY_RETENTION_MS`, `remix` создаёт новый draft без мутации `published`. Удалена формулировка «запрос на правку сохранён», legacy feedback endpoint возвращает `REVISION_REQUIRED` / `PUBLISHED_IMMUTABLE`, `BUSY` действует cross-type между `render` и `revision`. 59/59 Node тестов и 28/28 Python тестов в области change проходят; nightly cron проверен в `--dry-run`.
- `2026-08-02T12:50:00+03:00` — Зафиксирован и архивирован OpenSpec change `scenario-revision-and-remix`: 43/43 tasks complete, 2 новых capability main specs (`scenario-revision-and-remix`, `revision-job-observability`) и 2 обновлённых (`web-scenario-operations`, `web-process-jobs`) синхронизированы в `openspec/specs/`, `openspec validate --strict` зелёный, `verification.md` сохранён, аудит `summary/audit/008_*` и таски `summary/tasks/008_*` созданы.
- `2026-08-02T16:26:37Z` — Fix dotenv dependency for publication and add status checks for render/publish in Telegram bot.
- `2026-08-02T16:40:31Z` — Added integration tests for Telegram bot scenario modification flow (revision/remix) using node:test and Telegraf mocks.
