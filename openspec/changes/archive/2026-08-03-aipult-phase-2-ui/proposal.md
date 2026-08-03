## Why

Phase 1 (заархивирован: `2026-08-03-aipult-command-cards`) реализовал backend
для AiPULT: Python fuzzy resolver, MiniMax Text-01 wrapper, Node validator,
subprocess runner, Express endpoints `/api/aipult/{chat,resolve,execute,list}`.
Без UI этот функционал доступен только через `curl` — UX не соответствует
acceptance criteriaм из `PRD/AiPULT.md` (title-first resolution, command cards
с кнопками Read/Edit/Run/Reject).

Phase 2 закрывает **UI chat panel** в существующем `ui/index.html`:
- Новый таб **🤖 AiPULT** в навигации
- Inline chat с text input + send button
- CommandCard rendering: title (PRIMARY) + id + status + intent + command + warnings
- Card actions: 📖 Подробнее / ✏️ Редактировать / ▶️ Run / ❌ Reject
- Inline edit mode: пользователь правит command прямо в карточке перед Run
- Chat history в `localStorage` (CloudStorage fallback в Phase 3 для MiniApp)
- Mobile-first responsive (≥44px touch targets для MiniApp)
- Telegram theme CSS variables: автоматическая интеграция когда
  `window.Telegram?.WebApp` доступен (полная интеграция в Phase 3)

Без UI backend не используется — Phase 2 разблокирует real-world usage и
позволяет собирать feedback для Phase 3 (voice) и Phase 4 (SSE streaming).

## What Changes

- Добавить новый таб **🤖 AiPULT** в `<nav>` существующего `ui/index.html`.
- Создать `ui/aipult.js` — vanilla JS модуль: fetch к `/api/aipult/chat`,
  render chat history, render CommandCard, action handlers.
- Создать `ui/aipult.css` — стили chat panel + CommandCard + Telegram theme
  variables. Mobile-first responsive.
- Создать `web/lib/aipult/ui_format.js` — pure functions для форматирования
  CommandCard (escaping, status icons, intent labels, time/cost formatting).
  Тестируемые из Node без DOM.
- Расширить `ui/style.css` (или импортировать новый `ui/aipult.css`) — общие
  стили не ломаем.
- Добавить примеры prompts (chips) при первом открытии таба: "поменяй стиль у кота на gothic", "покажи последние", "перерисуй последний rendered".
- Сохранять chat history в `localStorage` под ключом `aipult:history:<userId>`
  (последние 50 сообщений).
- Не использовать external CDNs (MiniApp их блочит).
- Не использовать JavaScript frameworks (vanilla JS only, как остальной UI).

## Capabilities

### New Capabilities

- `web-aipult-ui`: chat panel в `ui/index.html` + `ui/aipult.js` + `ui/aipult.css` +
  `web/lib/aipult/ui_format.js`. Card rendering с title-first presentation,
  inline edit, action handlers, localStorage history, Telegram theme variables.

### Modified Capabilities

- `web-aipult-chat`: добавить scenarios для UI integration (history limit, max
  message preview, no_candidates UX). Без breaking changes.
- `web-aipult-runner`: добавить scenarios для inline edit (re-validate edited
  command). Без breaking changes.

## Impact

- UI: новый таб в `ui/index.html`, новый `ui/aipult.js` (~250 строк),
  новый `ui/aipult.css` (~200 строк).
- Web: новый `web/lib/aipult/ui_format.js` (~100 строк) — pure functions,
  importable в Node-тесты.
- Tests: новый `web/tests/aipult_ui_format.test.js` (~10 тестов на pure
  functions). UI integration не тестируется автоматически (требует
  Playwright/cypress — out of scope для MVP).
- Документация: расширить `docs/aipult.md` (placeholder из Phase 1) —
  отложено в Phase 4.
- Backward-compat: остальные табы (`Create`, `Draft`, `Approved`, `Rendered`,
  `Comics`, `Help`) не затрагиваются. AiPULT таб — additive.

## Out of Scope (Phase 3-4)

- **Phase 3**: Voice input (`🎤` button + MediaRecorder → Whisper endpoint).
- **Phase 3**: Telegram MiniApp detection (`window.Telegram.WebApp` full
  integration с CloudStorage, theme variables, `WebApp.expand()`).
- **Phase 4**: SSE streaming для execution output (live stdout в чат).
- **Phase 4**: Cost dashboard (MiniMax spend per day).
- **Phase 4**: `docs/aipult.md` полная документация.

## Non-Goals (same as Phase 1)

- **N1**: Auto-execution без подтверждения — запрещено в принципе.
- **N2**: Multi-step command chains в одном сообщении.
- **N3**: Memory across conversations (history in localStorage, not server).
- **N4**: Custom commands per user.
- **N5**: Permission system.
- **N6**: Real-time collaboration.
- **N7**: Streaming LLM responses (Phase 4).
- **N8**: Persisting cards server-side (Phase 4).
