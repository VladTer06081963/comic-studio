# web-aipult-ui Specification

## Purpose
Определяет UI chat panel для AiPULT в существующем `ui/index.html`.
Чат-панель принимает текстовые сообщения, рендерит CommandCard с
title-first presentation, обрабатывает действия пользователя
(Read / Edit / Run / Reject) и сохраняет историю в localStorage.
Mobile-first responsive для будущей Telegram MiniApp интеграции (Phase 3).
## Requirements
### Requirement: Chat panel structure

`ui/index.html` SHALL содержать новый таб **🤖 AiPULT** в `<nav>` и
соответствующий `<section id="tab-aipult" class="tab-content">` со
следующими элементами:

- `<div id="aipult-messages" class="chat-messages" role="log" aria-live="polite">`
  — scrollable история сообщений (user bubbles + assistant responses + cards).
- `<form id="aipult-form" class="chat-input">` с `<textarea id="aipult-input">`
  и `<button type="submit" id="aipult-send">📤</button>`.
- `<div id="aipult-suggestions" class="chat-suggestions">` — 3 chips
  с примерами: "поменяй стиль у кота на gothic", "покажи последние",
  "перерисуй последний rendered". Видны только когда history пуста.

Существующие табы (`Create`, `Draft`, `Approved`, `Rendered`, `Comics`,
`Help`) MUST NOT быть изменены — additive change.

#### Scenario: New tab visible in navigation

WHEN пользователь открывает `http://127.0.0.1:3000/ui/`,
THEN в `<nav>` SHALL появиться кнопка `data-tab="aipult"` с текстом
"🤖 AiPULT".

#### Scenario: Suggestions visible on empty history

WHEN таб 🤖 AiPULT открыт И `localStorage['aipult:history']` пуст или отсутствует,
THEN `<div id="aipult-suggestions">` SHALL содержать 3 кнопки с примерами.

### Requirement: CommandCard rendering

`ui/aipult.js#renderCard(card)` SHALL рендерить CommandCard в `<div id="aipult-messages">`
со следующей визуальной иерархией:

1. **Title (PRIMARY):** `card.resolved_scenario.title` — bold, 1.1rem, `--text` color.
2. **ID + Status (SECONDARY):** `card.resolved_scenario.id` и `card.resolved_scenario.status`
   — 0.85rem, `--muted` color. Format: "ID: 8eaa57cc · 🎬 rendered".
3. **Intent label:** из `INTENT_LABELS` map — icon + human-readable name.
4. **Command (TERTIARY):** monospace, 0.85rem, `--accent` color, в `<pre>` или `<code>`.
5. **Time/Cost/Reversible:** "⏱ ~2-5 сек · 💰 $0 · ↩️ reversible" (если reversible=true).
6. **Warnings (if any):** список с ⚠️ иконкой, `--red` color.
7. **Action buttons:** `[📖 Подробнее] [✏️ Редактировать] [▶️ Run] [❌]`
   в `<div class="card-actions">`. Min 44px height каждый.

Все user-supplied / LLM-supplied строки (title, command, explanation)
MUST проходить через `escapeHtml()` перед `innerHTML` assignment.
Plain text (captions, explanations) MAY использовать `textContent`.

#### Scenario: Card shows title prominently

WHEN `card.resolved_scenario = {id: "8eaa57cc", title: "Кот в одиночестве", status: "rendered"}`,
THEN rendered DOM SHALL содержать `<div class="card-title">Кот в одиночестве</div>`
перед `<div class="card-scenario-line">` (визуальная иерархия).

#### Scenario: Card with null resolved_scenario renders without crash

WHEN `card.intent === "stats"` AND `card.resolved_scenario === null`,
THEN `renderCard` SHALL рендерить card БЕЗ title+id+status секции,
но с intent label, command и action buttons.

#### Scenario: HTML escaping prevents injection

WHEN command содержит `<script>alert(1)</script>`,
THEN rendered DOM SHALL содержать escaped text `<script>alert(1)</script>`
(как plain text), а не executable script.

### Requirement: Action handlers

`ui/aipult.js` SHALL bind click handlers на action buttons каждого card:

- **📖 Read:** `GET /api/scenarios/{id}` через fetch, отображает JSON
  в `<pre>` блоке в чате.
- **✏️ Edit:** переключает card в edit mode (заменяет command display
  на `<textarea>`, добавляет [Отмена] [▶️ Run с правкой] buttons).
  Re-validates command client-side через `validateCommandString()`
  (imported from `web/lib/aipult/validator.js`).
- **▶️ Run:** `POST /api/aipult/execute` с `{card_id, command, intent, scenario_id}`,
  рендерит result bubble с exit_code, stdout, stderr, duration_ms.
- **❌ Reject:** fade-out animation (300ms), remove card из DOM,
  добавляет "❌ Rejected" entry в history (но НЕ удаляет user message).

#### Scenario: Edit mode shows textarea with current command

WHEN пользователь кликает ✏️ Edit,
THEN command display SHALL замениться на `<textarea>` с текущим command,
а ниже SHALL появиться [Отмена] [▶️ Run с правкой] buttons.

#### Scenario: Invalid edit prevents Run

WHEN пользователь редактирует command на `rm -rf /`,
THEN client-side `validateCommandString` SHALL вернуть throw,
а кнопка [▶️ Run с правкой] SHALL быть disabled с tooltip "Запрещённая команда".

#### Scenario: Run with success renders result bubble

WHEN `POST /api/aipult/execute` возвращает `{ok: true, exit_code: 0, stdout: "...", duration_ms: 2300}`,
THEN в чате SHALL появиться result bubble с "✅ Выполнено (exit 0, 2.3 сек)"
и collapsed `<details>` с stdout/stderr.

### Requirement: Chat history in localStorage

`ui/aipult.js` SHALL сохранять историю в `localStorage` под ключом
`aipult:history` как JSON array с максимум 50 записями. Каждая запись:

```json
{ "ts": "2026-08-03T12:34:56Z", "role": "user|assistant|system", "content": "...", "card_id": "..." }
```

При достижении 50 записей, самые старые MUST быть удалены (FIFO).

#### Scenario: History persists across reload

WHEN пользователь отправляет 5 сообщений и reloads страницу,
THEN chat panel SHALL показать все 5 сообщений в том же порядке
(читая из localStorage при init).

#### Scenario: History truncates at 50 entries

WHEN количество сообщений достигает 50,
THEN добавление нового сообщения SHALL удалить самое старое
(первое в массиве).

#### Scenario: History cleared on explicit user action

WHEN пользователь кликает "🗑 Очистить историю" и подтверждает в confirm dialog,
THEN `localStorage['aipult:history']` SHALL быть установлен в `[]`,
а DOM SHALL очищен.

### Requirement: Mobile responsive

`ui/aipult.css` SHALL обеспечивать mobile-first responsive layout:

- Все кнопки (action buttons, send, suggestions) `min-height: 44px`, `min-width: 44px`.
- Chat input area `flex-wrap: wrap` чтобы textarea и send button
  не overflow на viewport ≥320px.
- Card `max-width: 100%` с `overflow-wrap: break-word` для длинных commands.
- На viewport <768px nav кнопки `flex-wrap: wrap`, header `flex-direction: column`.

#### Scenario: No horizontal scroll on 375px viewport

WHEN viewport width = 375px (iPhone SE),
THEN chat panel SHALL не иметь горизонтального scroll,
а все action buttons SHALL быть ≥44px высотой.

#### Scenario: Keyboard opens without breaking layout

WHEN mobile keyboard открывается (viewport shrinks до ~300px),
THEN chat input area SHALL оставаться видимым и функциональным
(через `position: sticky` bottom или scrollToEnd).

### Requirement: Telegram theme variables

`ui/aipult.css` SHALL определять CSS variables для будущей MiniApp
интеграции (Phase 3):

```css
:root {
  --tg-theme-bg-color: var(--bg);
  --tg-theme-text-color: var(--text);
  --tg-theme-hint-color: var(--muted);
  --tg-theme-button-color: var(--accent);
  --tg-theme-button-text-color: #ffffff;
  --tg-theme-secondary-bg-color: var(--panel);
}
```

В Phase 2 эти variables просто дублируют существующую палитру.
В Phase 3 `ui/aipult.js` SHALL обновлять их через
`document.documentElement.style.setProperty('--tg-theme-bg-color', ...)`
когда `window.Telegram?.WebApp?.themeParams` доступен.

#### Scenario: Theme variables defined in CSS

WHEN `ui/aipult.css` загружен,
THEN `getComputedStyle(document.documentElement).getPropertyValue('--tg-theme-bg-color')`
SHALL вернуть non-empty value (default = `var(--bg)`).

