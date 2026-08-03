# PRD: AiPULT — Chat Command Cards для Comic Studio Web UI

**Версия:** 0.3 (title-resolution + MiniApp-ready)
**Дата:** 2026-08-03
**Владелец:** Vlad
**Статус:** Draft → review

> **AiPULT** = AI Pull-tab Command Cards. Web UI чат-бот, который **не выполняет
> команды сам**, а готовит **карточку с терминальной командой**. Пользователь
> видит, может отредактировать и принять/отклонить. AI = советчик, человек = executor.
>
> **v0.3 key changes:**
> - **No raw IDs в user input** — AI резолвит комикс по title или описанию ("тот про кота", "последний rendered")
> - **Card всегда показывает id + title** для проверки
> - **MiniApp-ready** — чат работает как standalone Web UI и как Telegram MiniApp

---

## 1. Problem Statement

### 1.1. Текущая боль

Управление Comic Studio требует помнить **8 hex characters** ID сценариев:

```bash
.venv/bin/python3 scripts/restyle.py --scenario-id 566ae498 --style gothic
```

Это:
1. **Cognitive load** — пользователь помнит **название** ("Кот в одиночестве"), но не ID (`8eaa57cc`)
2. **Spell-by-letter** — голосом приходится диктовать "пять-шесть-шесть-альфа-е-альфа..." — ужасный UX
3. **No discovery** — пользователь не помнит ID, но может сказать "хочу изменить стиль того кота"
4. **No context in card** — даже если ID в карточке, пользователь не уверен что это правильный комикс

### 1.2. Решение

AI **резолвит** сценарий по title или описанию. Карточка показывает **id + title** для визуальной проверки. ID нужен только для execution, но пользователь с ним не взаимодействует.

---

## 2. Solution: Title-First Command Cards

### 2.1. User flow (правильный)

```
User: 💬 "поменяй стиль у кота на gothic"
        ↓
AI:   🔍 Резолвлю: ищу "кот" в data/scenarios/{status}/*.json
        ↓
Card: 🎨 restyle: bubble → gothic
      ──────────────────────────────────────
      Комикс: «Кот в одиночестве»
      ID: 8eaa57cc
      Статус: rendered

      $ python3 scripts/restyle.py \
          --scenario-id 8eaa57cc --style gothic

      ⏱ ~2-5 сек · 💰 $0 · ℹ️ Pillow overlay + HTML

      [📖 Подробнее] [✏️ Редактировать] [▶️ Run] [❌]
```

**Пользователь видит название и ID.** Если не тот — Edit или Reject. Если тот — Run.

### 2.2. AI Resolution Strategy

Когда пользователь ссылается на сценарий без явного ID, AI использует:

1. **Title keyword match** — ищет в `data/scenarios/*/title`
2. **Description match** — ищет в `context` (исходный текст)
3. **Recency fallback** — "последний rendered" → latest в `rendered/`
4. **List request** — "покажи список" → выводит все scenarios с id+title

```python
def resolve_scenario(user_phrase: str) -> list[dict]:
    """
    Возвращает топ-N кандидатов с confidence.
    user_phrase: "кот", "последний rendered", "тот про Сашу"
    """
    if ID_REGEX.match(user_phrase):
        # Явный ID — return immediately
        return [load_scenario(user_phrase)]

    candidates = []

    # Title fuzzy match
    for scenario in all_scenarios():
        title_score = fuzz.partial_ratio(user_phrase.lower(), scenario.title.lower())
        context_score = fuzz.partial_ratio(user_phrase.lower(), scenario.context[:200].lower())
        score = max(title_score, context_score * 0.7)
        if score > 60:
            candidates.append({**scenario, "_confidence": score})

    # Sort by (confidence desc, created_at desc)
    return sorted(candidates, key=lambda c: (-c._confidence, -c.created_at_ts))[:5]
```

### 2.3. MiniApp Context

Telegram MiniApp — это web-приложение, запущенное **внутри** Telegram (in-app browser). Ограничения:

| Фича | Standalone Web | Telegram MiniApp |
|------|----------------|------------------|
| localStorage | ✅ | ✅ (но 5MB limit) |
| Telegram WebApp API | ❌ | ✅ (`window.Telegram.WebApp`) |
| Telegram theme | ❌ | ✅ (CSS variables) |
| Telegram CloudStorage | ❌ | ✅ (per-user, persistent) |
| Auth | sessionStorage | initData + HMAC |
| Mobile-first | recommended | required |

**Решение**: чат-панель работает в обоих контекстах:
- Standalone Web → localStorage + обычный fetch
- MiniApp → Telegram CloudStorage + Telegram WebApp API + Telegram theme variables

```javascript
// ui/aipult.js
const storage = window.Telegram?.WebApp?.CloudStorage
  ? new TelegramCloudStorage()
  : new LocalStorageAdapter();
```

---

## 3. Goals & Non-Goals

### 3.1. Goals

- **G1.** Web UI чат-панель — primary interface (text + voice input)
- **G2.** AI **резолвит сценарий по title** (не ID) — пользователь говорит "кот" или "тот про Сашу"
- **G3.** **Card всегда показывает id + title** для визуальной проверки
- **G4.** AI генерирует **CommandCard** (терминальная команда) — не выполняет сам
- **G5.** **Cached COMMAND_COOKBOOK** в system prompt — LLM не выдумывает команды
- **G6.** User reviews card → Edit / Run / Reject
- **G7.** Voice input через Whisper (локально, бесплатно)
- **G8.** MiniApp-ready: работает в standalone Web и в Telegram MiniApp
- **G9.** Audit log всех cards (raw + edited + executed)
- **G10.** Backward-compat: Telegram bot и CLI скрипты работают как раньше

### 3.2. Non-Goals

- **N1.** Auto-execution без подтверждения (всегда card)
- **N2.** Multi-step chains в одном сообщении (одно сообщение = одна карточка)
- **N3.** Memory across conversations (stateless per-session)
- **N4.** Custom commands per user (глобальный cookbook)
- **N5.** Permission system / user roles (Vlad = admin всегда)
- **N6.** Real-time collaboration (single user only)

---

## 4. User Stories

### 4.1. US-1: Title-based restyle

```
Given: rendered комикс «Кот в одиночестве» (id 8eaa57cc)
When: User пишет "поменяй стиль у кота на gothic"
Then:
  - AI резолвит "кот" → 8eaa57cc (title match, confidence 0.95)
  - Card показывает title + id
  - User видит название, подтверждает правильность
  - Run → стилизован
```

### 4.2. US-2: Discovery via list

```
Given: User не помнит ни id, ни title точно
When: User пишет "покажи последние комиксы"
Then:
  - Card со списком (id + title + status) последних 10 scenarios
  - User: ✏️ Edit → копирует id → формулирует следующий запрос
```

### 4.3. US-3: Recency resolution

```
Given: 5 rendered комиксов, последний — «Кот в одиночестве» (8eaa57cc)
When: User пишет "перерисуй последний"
Then:
  - AI резолвит "последний rendered" → 8eaa57cc
  - Card с явным указанием "найдено через recency: 8eaa57cc"
```

### 4.4. US-4: Voice dictation by title

```
Given: User за рулём, хочет рестайл
When: 🎤 "поменяй стиль у виталика на gothic"
Then:
  - Whisper транскрибирует
  - AI ищет title содержащий "виталик"
  - Card → Run
```

### 4.5. US-5: Ambiguity clarification

```
Given: 2 комикса с похожими названиями
When: User пишет "перерисуй кота"
Then:
  - Card с WARNING: "Нашёл 2 кандидата:"
    1. «Кот в одиночестве» (8eaa57cc)
    2. «Кот-учитель» (a52d7e46)
  - User: ✏️ Edit → выбирает id → Run
```

### 4.6. US-6: MiniApp access from Telegram

```
Given: User в Telegram, не хочет переключаться на Web UI
When: Tap на menu button → открывается MiniApp
Then:
  - Telegram theme применяется автоматически
  - Чат открывается с историей из Telegram CloudStorage
  - User работает в том же UX, без отдельного браузера
```

---

## 5. Functional Requirements

### 5.1. FR-1: Web UI chat panel

- [ ] **FR-1.1.** Новая панель в существующем `ui/index.html` (vanilla JS, no framework)
- [ ] **FR-1.2.** Text input + 🎤 voice button (browser MediaRecorder API)
- [ ] **FR-1.3.** Render CommandCard как structured UI element
- [ ] **FR-1.4.** Card **всегда показывает id + title + status** (validation)
- [ ] **FR-1.5.** Inline edit mode (textarea с подсветкой синтаксиса)
- [ ] **FR-1.6.** Run button → POST /api/aipult/execute
- [ ] **FR-1.7.** Reject button → card dismissed
- [ ] **FR-1.8.** Chat history в localStorage (или Telegram CloudStorage)
- [ ] **FR-1.9.** Mobile responsive (MiniApp-friendly)

### 5.2. FR-2: Voice input

- [ ] **FR-2.1.** Browser MediaRecorder → opus/ogg
- [ ] **FR-2.2.** POST /api/aipult/transcribe (multipart)
- [ ] **FR-2.3.** Backend: Whisper base (local, ~150MB)
- [ ] **FR-2.4.** Russian + English support
- [ ] **FR-2.5.** Latency < 3 сек для 30-sec audio
- [ ] **FR-2.6.** Show transcription в input field до отправки

### 5.3. FR-3: Scenario Resolution

- [ ] **FR-3.1.** Backend function `resolve_scenario(phrase) -> [candidates]`
- [ ] **FR-3.2.** Fuzzy match на title (Levenshtein / partial_ratio)
- [ ] **FR-3.3.** Fuzzy match на context (weighted 0.7x)
- [ ] **FR-3.4.** Recency fallback ("последний rendered" → latest by created_at)
- [ ] **FR-3.5.** List helper: возвращает последние N сценариев с id+title+status
- [ ] **FR-3.6.** Disambiguation: если 2+ кандидата с score > 0.6, вернуть список

### 5.4. FR-4: Command Card generation

- [ ] **FR-4.1.** Backend: `POST /api/aipult/chat` принимает `{message, history}`
- [ ] **FR-4.2.** Backend: build prompt = SYSTEM_PROMPT (cookbook) + history + message
- [ ] **FR-4.3.** Backend: MiniMax Text-01 → JSON with resolved scenario_id
- [ ] **FR-4.4.** Backend: валидация (scenario существует, args валидны)
- [ ] **FR-4.5.** Backend: возвращает CommandCard JSON с title
- [ ] **FR-4.6.** Latency < 1.5 сек

### 5.5. FR-5: Command execution

- [ ] **FR-5.1.** Frontend: ▶️ Run → POST /api/aipult/execute `{command, card_id}`
- [ ] **FR-5.2.** Backend: subprocess с timeout (default 30s, configurable)
- [ ] **FR-5.3.** Backend: stream stdout/stderr в чат (SSE)
- [ ] **FR-5.4.** Backend: вернуть exit code + summary в чат
- [ ] **FR-5.5.** Frontend: link to artifacts (data/comics/<id>.html etc.)

### 5.6. FR-6: Audit log

- [ ] **FR-6.1.** `data/logs/aipult-YYYY-MM-DD.log` structured JSON
- [ ] **FR-6.2.** Fields: `ts`, `user_message`, `resolved_scenario_id`, `confidence`, `card_id`, `intent`, `command_raw`, `command_edited`, `command_executed`, `exit_code`, `duration_ms`
- [ ] **FR-6.3.** Privacy: НЕ логировать feedback/revise тексты

### 5.7. FR-7: COMMAND_COOKBOOK (system prompt)

- [ ] **FR-7.1.** Helper instructions: формировать CommandCard, никогда не выполнять
- [ ] **FR-7.2.** Resolution hints: "если пользователь ссылается на сценарий без ID, используй resolve_scenario()"
- [ ] **FR-7.3.** Cached commands: 9 команд (restyle, view, list, stats, approve, render, revise, publish, delete)
- [ ] **FR-7.4.** Per-command: описание, синтаксис, примеры
- [ ] **FR-7.5.** Forbidden patterns: `rm -rf /`, secrets, raw paths

### 5.8. FR-8: MiniApp compatibility

- [ ] **FR-8.1.** Detect `window.Telegram?.WebApp` на load
- [ ] **FR-8.2.** Use Telegram theme variables if available (`--tg-theme-bg-color` etc.)
- [ ] **FR-8.3.** Use Telegram CloudStorage if available (fallback localStorage)
- [ ] **FR-8.4.** Mobile-first responsive (touch targets ≥ 44px)
- [ ] **FR-8.5.** No external CDNs (MiniApp blocks some)
- [ ] **FR-8.6.** Service worker for offline (optional)

---

## 6. Non-Functional Requirements

### 6.1. NFR-1: Cost

- **MiniMax Text-01 per chat**: ~500 tokens input + ~100 output = ~$0.0007
- **Scenario resolution**: locally, 0 cost
- **Whisper local**: $0
- **1000 chats/day**: ~$0.70/day = **$21/month**

### 6.2. NFR-2: Latency

- Voice → text (Whisper): < 3 сек
- Resolution (local fuzzy): < 100ms
- Text → card (MiniMax): < 1.5 сек
- Card → execution: depends on command
- **Total**: < 5 сек до первого результата

### 6.3. NFR-3: Safety

- ✅ LLM never executes — only suggests
- ✅ User MUST click Run для выполнения
- ✅ Backend валидирует command (whitelist + regex)
- ✅ Subprocess timeout (default 30s)
- ✅ Audit log всех выполнений
- ✅ Card показывает destructive warnings

### 6.4. NFR-4: MiniApp compatibility

- ✅ Single bundle (no external CDNs)
- ✅ Telegram theme integration
- ✅ CloudStorage persistence
- ✅ Mobile-first (≥320px viewport)
- ✅ Telegram WebApp.expand() для fullscreen

### 6.5. NFR-5: Privacy

- Voice: локальный Whisper
- Text: MiniMax API (encrypted in transit)
- Не логировать feedback тексты
- Chat history: localStorage или Telegram CloudStorage

---

## 7. Architecture

### 7.1. Файловая структура

```
web/
├── routes/
│   ├── aipult.js                  ← /api/aipult/{chat,transcribe,execute,resolve}
│   └── scenarios.js                ← existing (used by resolver)
├── lib/
│   ├── aipult/
│   │   ├── cookbook.py            ← COMMAND_COOKBOOK (system prompt)
│   │   ├── resolver.py            ← title/context fuzzy match
│   │   ├── validator.py           ← whitelist + regex
│   │   └── runner.js              ← subprocess execution
│   └── miniapp.js                 ← Telegram WebApp detection
└── ui/
    ├── index.html                 ← + chat panel + Telegram theme
    ├── aipult.js                  ← chat panel logic
    └── aipult.css                 ← Mobile-first styles
py/
├── lib/
│   ├── aipult_client.py           ← MiniMax chat wrapper
│   └── scenario_resolver.py       ← title/context fuzzy match
└── ingest/
    └── voice.py                   ← Whisper transcription
data/
├── logs/
│   └── aipult-YYYY-MM-DD.log
└── scenarios/                      ← existing (read by resolver)
```

### 7.2. Sequence: voice → resolve → card → run

```
1. User clicks 🎤 in browser
2. MediaRecorder captures opus
3. POST /api/aipult/transcribe (multipart audio/ogg)
4. Web route → py/ingest/voice.py → Whisper base → text
5. Return transcript → browser shows в input field
6. User clicks Send
7. POST /api/aipult/chat {message, history}
8. Backend: load COMMAND_COOKBOOK from py/lib/aipult/cookbook.py
9. Backend: MiniMax Text-01 with prompt
   - System: COMMAND_COOKBOOK + resolution hints
   - User: message
   - AI returns: {intent: "restyle", scenario_id: "8eaa57cc", style: "gothic"}
10. Backend: resolve scenario → load full record → enrich card with title
11. Backend: build CommandCard {
    card_id, intent, command (with id), title, status,
    explanation, warnings, estimated_time, estimated_cost
  }
12. Validate: scenario существует, command в whitelist, args валидны
13. Return CommandCard JSON
14. UI renders card with title (PRIMARY) + id (secondary) + Run/Edit/Reject buttons
15. User clicks ▶️ Run
16. POST /api/aipult/execute {command, card_id}
17. Backend: subprocess с timeout → SSE stream
18. UI: live stdout в chat, final result, link to artifacts
19. Audit log entry created
```

### 7.3. CommandCard schema (v0.3)

```typescript
interface CommandCard {
  card_id: string;                    // UUID для tracking
  intent: string;                     // "restyle", "render", ...
  command: string;                    // exact terminal command
  explanation: string;                // human-readable summary
  warnings: string[];                 // e.g. "Необратимо", "MiniMax cost ~$0.10"
  estimated_time: string;             // "~2-5 сек" | "~1-2 мин"
  estimated_cost: string;             // "$0" | "~$0.10"
  reversible: boolean;                // true если можно откатить
  resolved_scenario?: {               // если команда относится к сценарию
    id: string;                       // "8eaa57cc"
    title: string;                    // "Кот в одиночестве" — ОСНОВНОЕ
    status: string;                   // "rendered"
    confidence: number;               // 0.0-1.0 от резолвера
    resolution_method: string;         // "title_match" | "recency" | "explicit_id"
  };
  related_artifacts?: string[];       // paths to expected output files
}
```

### 7.4. COMMAND_COOKBOOK (system prompt, v0.3)

```python
COMMAND_COOKBOOK = """
Ты — AI-ассистент Comic Studio. Твоя задача: подготовить КАРТОЧКУ
с терминальной командой. НИКОГДА не выполняй команды сам.

═══════════════════════════════════════════════════════════════════
ВАЖНО: РЕЗОЛВ СЦЕНАРИЙ ПО НАЗВАНИЮ, НЕ ПО ID
═══════════════════════════════════════════════════════════════════
Пользователи помнят НАЗВАНИЕ комикса ("Кот в одиночестве"),
но НЕ ПОМНЯТ 8-char hex ID ("8eaa57cc"). Если пользователь говорит
"кот", "виталик", "тот про Сашу" — найди подходящий сценарий
через fuzzy match на title и context.

Возвращай scenario_id ВСЕГДА (он нужен для команды), но в
explanation упоминал название для ясности.

Если кандидатов 2+ с похожим score — добавь warning с обоими.

═══════════════════════════════════════════════════════════════════
ДОСТУПНЫЕ КОМАНДЫ:
═══════════════════════════════════════════════════════════════════

### restyle — сменить стиль баблов (быстро, 0 MiniMax cost)
Синтаксис: python3 scripts/restyle.py --scenario-id <ID> --style <bubble|star|gothic|boom|memo|bar>
Пример: python3 scripts/restyle.py --scenario-id 8eaa57cc --style gothic
Когда: пользователь хочет сменить визуальный стиль подписей без ре-рендера панелей

### render — запустить рендер approved сценария (MiniMax image-01, ~$0.05-0.10)
Синтаксис: python3 scripts/render_approved.py --scenario-id <ID> [--rerender --staging-dir <path>]
Пример: python3 scripts/render_approved.py --scenario-id 8eaa57cc
Когда: пользователь хочет сгенерировать PNG-панели через MiniMax

### revise — LLM-редакция approved/rendered сценария
Синтаксис: python3 scripts/revise_scenario.py --scenario-id <ID> --feedback "<text>"
Пример: python3 scripts/revise_scenario.py --scenario-id 8eaa57cc --feedback "Сделать смешнее"
Когда: пользователь хочет изменить сценарий (re-render после re-approval)

### view — показать сценарий (instant, 0 cost)
Синтаксис: GET /api/scenarios/<ID>
Когда: пользователь хочет посмотреть JSON

### list — список сценариев по статусу
Синтаксис: GET /api/scenarios?status=<draft|approved|rendered|published|rejected|all>
Когда: пользователь хочет увидеть все сценарии (с id+title)

### approve — утвердить draft
Синтаксис: POST /api/scenarios/<ID>/approve

### publish — опубликовать rendered
Синтаксис: node scripts/publish_rendered.js
⚠️ Требует SITE_API_URL в .env

### delete — удалить (НЕОБРАТИМО)
Синтаксис: DELETE /api/scenarios/<ID>
⚠️ DESTRUCTIVE

### stats — статистика
Синтаксис: GET /api/stats

═══════════════════════════════════════════════════════════════════
ФОРМАТ ОТВЕТА:
═══════════════════════════════════════════════════════════════════
{
  "card_id": "<uuid>",
  "intent": "restyle",
  "scenario_id": "8eaa57cc",
  "style": "gothic",
  "command": "python3 scripts/restyle.py --scenario-id 8eaa57cc --style gothic",
  "explanation": "Сменит стиль баблов «Кот в одиночестве» с bubble на gothic",
  "warnings": [],
  "estimated_time": "2-5 сек",
  "estimated_cost": "$0",
  "reversible": true,
  "related_artifacts": [
    "data/comics/8eaa57cc.png",
    "data/comics/8eaa57cc.html"
  ]
}
"""
```

---

## 8. Open Questions

### 8.1. OQ-1: Title search algorithm?

- **fuzzywuzzy / rapidfuzz** (Levenshtein + partial_ratio): хорошо для typo
- **Embedding-based** (sentence-transformers): семантический поиск, "кот" → "кошка"
- **Simple keyword match**: быстро, но не понимает синонимы

**Решение (MVP)**: rapidfuzzy с partial_ratio. Embeddings — Phase 2 если 10+ пользователей жалуются.

### 8.2. OQ-2: Recency vs explicit "последний"?

Когда пользователь говорит "перерисуй последний", AI должен:
- A. Использовать latest by `created_at` (можно latest rendered/published)
- B. Спросить уточнение "последний rendered или draft?"

**Решение**: AI выбирает latest **rendered** (самый релевантный для rerender) и добавляет в explanation "выбран latest rendered". User может отредактировать если не тот.

### 8.3. OQ-3: MiniApp bundle size?

Telegram MiniApp рекомендует bundle < 1MB. Наш UI vanilla JS — должен уложиться. Если добавим много JS — code-splitting или dynamic imports.

### 8.4. OQ-4: Card actions в MiniApp?

Inline-кнопки в чате работают в Web, но в MiniApp touch targets должны быть ≥44px. Дизайн должен это учитывать.

---

## 9. Rollout Plan

### Phase 1: Resolution + Backend (2-3 дня)

- [ ] `py/lib/scenario_resolver.py` — fuzzy title/context match через rapidfuzzy
- [ ] `web/lib/aipult/resolver.js` — exposes via /api/aipult/resolve
- [ ] `py/lib/aipult_client.py` — MiniMax wrapper с COMMAND_COOKBOOK v0.3
- [ ] `web/routes/aipult.js` — /api/aipult/chat (MiniMax + resolver)
- [ ] `web/lib/aipult/validator.py` — whitelist + regex
- [ ] `web/lib/aipult/runner.js` — subprocess execution
- [ ] 10-15 тестов (resolver, validator, runner)

### Phase 2: UI Chat Panel + Cards (1-2 дня)

- [ ] `ui/index.html` — chat panel + Telegram theme
- [ ] `ui/aipult.js` — fetch, render cards с **title + id + status**
- [ ] Inline edit mode
- [ ] Card actions: Read / Edit / Run / Reject
- [ ] Chat history в localStorage
- [ ] Mobile-first responsive

### Phase 3: Voice + MiniApp (1-2 дня)

- [ ] `py/ingest/voice.py` — Whisper endpoint
- [ ] Browser MediaRecorder + 🎤 button
- [ ] `web/lib/miniapp.js` — Telegram WebApp detection
- [ ] CloudStorage fallback
- [ ] Telegram theme CSS variables
- [ ] Test as Telegram MiniApp (через @BotFather menu button)

### Phase 4: Polish (1 день)

- [ ] SSE streaming для execution output
- [ ] Cost dashboard (MiniMax spend per day)
- [ ] Documentation (`docs/aipult.md`)
- [ ] Audit log viewer (Web UI)

---

## 10. Verification

### 10.1. Tests

- **Python:** 12-18 тестов (resolver fuzzy match, MiniMax wrapper, validator)
- **Node:** 8-10 тестов (chat endpoint, validator, runner timeout)
- **Manual:** voice → resolve → card → edit → run cycle

### 10.2. Manual checks

- [ ] "поменяй стиль у кота на gothic" → card с title «Кот в одиночестве» → Run ✓
- [ ] "перерисуй последний rendered" → card с latest rendered → Run ✓
- [ ] "покажи список" → card с 10 сценариями (id + title) ✓
- [ ] Edit ID в card → Run → execute с новым ID ✓
- [ ] Reject card → dismissed ✓
- [ ] Disambiguation: "перерисуй кота" → 2 кандидата → выбираю ✓
- [ ] MiniApp: открыть из Telegram → тема применяется → CloudStorage работает ✓
- [ ] Backward-compat: `python3 scripts/restyle.py` CLI работает ✓

### 10.3. Cost verification

- 50 test chats → MiniMax cost ~$0.035
- 50 voice → Whisper local = $0
- Total: **<$1** для полного теста

---

## 11. История изменений

- `2026-08-02T23:55:00+03:00` — v0.1, initial draft (Telegram bot, auto-execute).
- `2026-08-03T00:35:00+03:00` — v0.2, redesign: Web UI chat + command cards pattern.
- `2026-08-03T00:55:00+03:00` — v0.3, **major UX corrections**:
  - **No raw IDs в user input** — AI резолвит комикс по title через fuzzy match
  - **Card всегда показывает title + id + status** для визуальной проверки
  - **MiniApp-ready** — чат работает как standalone Web и как Telegram MiniApp
  - **Recency fallback** — "последний rendered" резолвится без явного ID
  - **List command** — для discovery когда пользователь не помнит ни title, ни ID
  - **Disambiguation warnings** — если 2+ кандидата с близким score
  - **Touch-friendly buttons** — ≥44px для MiniApp
  - **Telegram theme integration** — CSS variables, CloudStorage

---

## 12. Связанные документы

- `PRD.md` — основной PRD
- `PRD/HTML.md` v0.4 — HTML rendering (завершён)
- `tg-bot/bot.js` — legacy Telegram-бот (co-exists)
- `web/routes/scenarios.js` — existing API endpoints
- `py/scenario/writer.py` — паттерн MiniMax chat call
- `scripts/restyle.py` — пример CLI команды
- `py/ingest/youtube.py` — паттерн Whisper integration
- Telegram MiniApp docs: https://core.telegram.org/bots/webapps