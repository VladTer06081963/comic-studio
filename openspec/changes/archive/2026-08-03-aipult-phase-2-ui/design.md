# Design: AiPULT Phase 2 — UI Chat Panel

## Architecture Overview

Phase 2 добавляет **advisory chat panel** в существующий Web UI. Backend
(Phase 1) уже работает; UI становится тонким клиентом над
`/api/aipult/{chat,resolve,execute,list}`.

```
[Browser]
   ↓ click 🤖 AiPULT tab
[ui/index.html chat panel]
   ↓ user input
[ui/aipult.js]
   ├─ localStorage history (read/write)
   ├─ fetch /api/aipult/chat  → {card|candidates}
   ├─ render: chat bubbles + CommandCard
   └─ action handlers:
       ├─ 📖 Read     → GET /api/scenarios/{id}
       ├─ ✏️ Edit     → inline textarea + re-validate
       ├─ ▶️ Run      → POST /api/aipult/execute {card_id, command}
       └─ ❌ Reject   → card dismissed, history entry
   ↓
[web/lib/aipult/ui_format.js]  ← pure functions: formatCard, formatCandidate, etc.
```

**Решение о разделении:** `ui/aipult.js` работает с DOM, `ui_format.js`
содержит pure logic (escape HTML, format timestamps, intent labels).
Pure functions тестируются из Node без jsdom. DOM-логика не покрывается
unit-тестами (требует Playwright/cypress, out of scope для MVP).

## File Structure

```
ui/
├── index.html              ← + <nav> tab + chat panel <section>
├── app.js                  ← existing (не трогаем)
├── approve.js              ← existing (не трогаем)
├── aipult.js               ← NEW: chat panel logic (vanilla JS)
├── aipult.css              ← NEW: chat panel + card styles
└── style.css               ← existing (импортирует aipult.css или inline)

web/lib/aipult/
├── resolver.js             ← Phase 1
├── validator.js            ← Phase 1
├── runner.js               ← Phase 1
└── ui_format.js            ← NEW: pure formatting functions

web/tests/
└── aipult_ui_format.test.js ← NEW: tests for pure functions
```

## Component Details

### 1. `ui/index.html` — chat panel section

Добавляем:
- `<button data-tab="aipult">🤖 AiPULT</button>` в `<nav>`
- `<section id="tab-aipult" class="tab-content">` с:
  - `<div id="aipult-messages" class="chat-messages">` — scrollable history
  - `<form id="aipult-form">` с textarea + send button (placeholder для 🎤 в Phase 3)
  - `<div id="aipult-suggestions">` — example chips при пустой history

### 2. `ui/aipult.js` — chat panel logic

Public API (через DOM event handlers):
- `loadHistory()` — читает `localStorage` ключ `aipult:history`, рендерит
- `clearHistory()` — wipe localStorage, clear DOM
- `sendMessage(text)` — fetch `/api/aipult/chat`, append user + assistant bubbles
- `renderCard(card)` — добавляет CommandCard в messages div
- `renderCandidateList(candidates)` — для disambiguation UX
- `renderNoMatch(message)` — для empty results
- `bindActions(cardEl, card)` — handlers для 📖/✏️/▶️/❌ кнопок
- `inlineEdit(cardEl, card)` — переключает card в edit mode (textarea для command)
- `executeCard(cardEl, card, editedCommand)` — POST `/api/aipult/execute`
- `rejectCard(cardEl)` — fade out, remove from DOM, log to history

Без external deps, без build step. ES2020+ features (template literals,
destructuring, optional chaining) — все modern browsers поддерживают.

### 3. `ui/aipult.css` — chat panel styles

Использует существующие CSS variables из `ui/style.css`:
```css
:root {
  --bg, --panel, --border, --text, --muted, --accent, --accent2, --green, --red
}
```

Telegram theme variables (для MiniApp в Phase 3, но определяем сейчас):
```css
:root {
  --tg-theme-bg-color: var(--bg);
  --tg-theme-text-color: var(--text);
  --tg-theme-hint-color: var(--muted);
  --tg-theme-button-color: var(--accent);
  --tg-theme-button-text-color: #fff;
  --tg-theme-secondary-bg-color: var(--panel);
}
```

Когда `window.Telegram?.WebApp?.themeParams` доступен (Phase 3), эти
переменные переписываются через `document.documentElement.style.setProperty()`.

Mobile-first: `min-height: 44px` для всех кнопок, `flex-wrap: wrap` для
chat input area.

### 4. `web/lib/aipult/ui_format.js` — pure functions

```js
export function formatCard(card) → { title, subtitle, intentLabel, intentIcon, command, time, cost, reversible, warnings, artifacts, scenarioLine, commandLines }
export function formatCandidate(candidate) → { idLine, title, status, confidencePct, method, ambiguity }
export function formatStatus(status) → { label, icon, color }
export function formatIntent(intent) → { label, icon }
export function formatTimestamp(iso) → '2 мин назад' | 'только что' | '15 янв, 14:30'
export function formatDuration(ms) → '2.5 сек' | '1.2 мин'
export function formatBytes(n) → '256 B' | '5 KB'
export function escapeHtml(text) → safe HTML string
export function truncate(text, max) → truncated with '…'
```

Все функции pure (no I/O, no side effects). Тестируются напрямую.

## UX Flow

### Initial state (empty history)
```
[🤖 AiPULT] tab active

┌─────────────────────────────────────────┐
│  🤖 AiPULT                              │
│                                         │
│  💬 Привет! Я помогу управлять          │
│     комиксами. Попробуй:                │
│                                         │
│  [поменяй стиль у кота на gothic]       │
│  [покажи последние]                     │
│  [перерисуй последний rendered]         │
│                                         │
│  [____________________________] [📤]    │
└─────────────────────────────────────────┘
```

### After "поменяй стиль у кота на gothic"
```
┌─────────────────────────────────────────┐
│  👤 поменяй стиль у кота на gothic      │
│                                         │
│  🤖 ┌─────────────────────────────────┐ │
│     │ 🎨 restyle: bubble → gothic     │ │
│     │ ─────────────────────────────── │ │
│     │ Комикс: «Кот в одиночестве»     │ │
│     │ ID: 8eaa57cc                    │ │
│     │ Статус: rendered                │ │
│     │                                 │ │
│     │ $ python3 scripts/restyle.py    │ │
│     │     --scenario-id 8eaa57cc      │ │
│     │     --style gothic              │ │
│     │                                 │ │
│     │ ⏱ ~2-5 сек · 💰 $0 · ↩️ reversible │ │
│     │                                 │ │
│     │ [📖 Подробнее] [✏️ Ред.] [▶️ Run]│ │
│     │                            [❌]  │ │
│     └─────────────────────────────────┘ │
│                                         │
│  [____________________________] [📤]    │
└─────────────────────────────────────────┘
```

### Edit mode
```
┌─────────────────────────────────────────┐
│  🤖 ✏️ Редактирование команды           │
│     ┌──────────────────────────────┐    │
│     │ python3 scripts/restyle.py   │    │
│     │     --scenario-id 8eaa57cc   │    │
│     │     --style star             │ ← user edited 'gothic' → 'star'
│     │                              │    │
│     │ ☑ ID валиден                 │    │
│     │ ☐ Стиль валиден              │ ← re-validation failed
│     └──────────────────────────────┘    │
│     [Отмена] [▶️ Run]                   │
└─────────────────────────────────────────┘
```

### After Run
```
┌─────────────────────────────────────────┐
│  🤖 ┌─────────────────────────────────┐ │
│     │ ✅ Выполнено (exit 0, 2.3 сек)  │ │
│     │ [📄 data/comics/8eaa57cc.html]  │ │
│     │ [📄 data/comics/8eaa57cc.png]   │ │
│     │                                 │ │
│     │ stdout:                         │ │
│     │ ✅ Restyled → data/comics/      │ │
│     │    8eaa57cc.html                │ │
│     │                                 │ │
│     │ [📖 Сценарий] [🔄 Ещё раз]     │ │
│     └─────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Disambiguation
```
┌─────────────────────────────────────────┐
│  🤖 ⚠️ Найдено 2 кандидата:            │
│     ┌──────────────────────────────┐    │
│     │ 1. «Кот в одиночестве»        │    │
│     │    ID: 8eaa57cc               │    │
│     │    Статус: rendered           │    │
│     │    [✅ Выбрать]               │    │
│     ├──────────────────────────────┤    │
│     │ 2. «Кот-учитель»             │    │
│     │    ID: a52d7e46               │    │
│     │    Статус: published          │    │
│     │    [✅ Выбрать]               │    │
│     └──────────────────────────────┘    │
└─────────────────────────────────────────┘
```

## Test Strategy

### Pure functions (Node tests)

`web/tests/aipult_ui_format.test.js` — ~10 тестов:
- `formatCard` строит правильный shape (title, subtitle, intentLabel, etc.)
- `formatCandidate` показывает id+title+status с правильными иконками
- `formatStatus` возвращает правильные icon+color для всех 5 статусов
- `formatIntent` маппит 9 intents на человеко-читаемые labels
- `formatTimestamp` обрабатывает relative time (now, 1 мин, 1 час, 1 день, 30 дней)
- `formatDuration` форматирует ms в 'X сек' | 'X мин'
- `escapeHtml` эскейпит `<`, `>`, `&`, `"`, `'`
- `truncate` обрезает на max chars с '…'
- Все intent labels (9 шт) покрыты
- Card с пустым `resolved_scenario` (list/stats) не падает

### UI integration (manual, out of scope для автоматизации)

- [ ] Открыть `/ui/`, перейти на таб 🤖 AiPULT
- [ ] Ввести "поменяй стиль у кота на gothic" → видим CommandCard
- [ ] Click ▶️ Run → видим ✅ success
- [ ] Click ✏️ Edit → меняем `--style gothic` на `--style star` → Run
- [ ] Click ❌ Reject → card исчезает
- [ ] Refresh page → history сохраняется
- [ ] Mobile viewport (375px) → input area не обрезан, кнопки ≥44px

## Migration / Backward Compat

- ✅ Существующие табы (`Create`, `Draft`, `Approved`, `Rendered`, `Comics`,
  `Help`) не затрагиваются — additive change.
- ✅ Backend API (Phase 1) не меняется — UI использует те же endpoints.
- ✅ Telegram-бот и CLI скрипты работают как раньше.
- ✅ localStorage namespace: `aipult:history` (не конфликтует с другими
  ключами).
- 🆕 `ui/aipult.css` импортируется в `<head>` через `<link rel="stylesheet">`.

## Security Considerations

1. **HTML escape everywhere.** `ui_format.js#escapeHtml` оборачивает все
   user-supplied / LLM-supplied строки перед `innerHTML`. Innertext для
   plain text (titles, captions).
2. **No `eval` / `new Function`.** Chat panel никогда не интерпретирует
   command как code — только показывает текстом.
3. **No secrets in localStorage.** History хранит только user messages +
   intent + scenario_id + status. Никаких токенов, feedback текстов.
4. **CSP-friendly.** No inline scripts, no inline event handlers (используем
   `addEventListener`), no external CDNs.
5. **AI never auto-executes.** Все commands требуют explicit ▶️ Run click.
   UI re-validates command на стороне backend через `/api/aipult/execute`.

## Performance

- Initial paint: < 50ms (vanilla JS, no framework hydration)
- Send message → first card: < 2s (depends on LLM latency ~1.5s)
- Render card: < 5ms (DOM manipulation, no virtual DOM)
- localStorage read/write: < 1ms for 50 messages
- Mobile: 60fps scroll на 100+ messages

## Open Questions (deferred)

- **OQ-A**: Streaming responses (Phase 4 SSE)
- **OQ-B**: Markdown rendering в assistant messages (Phase 4)
- **OQ-C**: Code syntax highlighting в command display (Phase 4)
