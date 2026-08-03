# Аудит: AiPULT Phase 2 — UI Chat Panel + Cards

**Дата:** 2026-08-03
**PR/Change:** `aipult-phase-2-ui` (archived → `openspec/changes/archive/2026-08-03-aipult-phase-2-ui/`)
**Спецификации:** `web-aipult-ui` (1 new capability, 6 ADDED requirements, 14 scenarios)

## 1. Контекст

Phase 1 (заархивирован: `2026-08-03-aipult-command-cards`) реализовал backend
для AiPULT — но без UI этот функционал был доступен только через `curl`. Phase 2
закрывает **chat panel** в существующем `ui/index.html`:
- Inline chat с text input + send button
- CommandCard rendering с title-first presentation
- Card actions: 📖 Подробнее / ✏️ Edit / ▶️ Run / ❌ Reject
- localStorage history, mobile-first responsive, Telegram theme CSS variables

В процессе smoke-тестирования выявлены и зафиксированы 5 архитектурных
багов, каждый из которых имел свой root cause и фикс.

## 2. Что сделано

### 2.1 OpenSpec change `aipult-phase-2-ui`

- `proposal.md` — motivation (chat panel, не Telegram bot, не CLI)
- `design.md` — UX flows (initial state, after Run, disambiguation, edit mode)
- `tasks.md` — 8 секций (specs, formatter, tests, HTML, CSS, JS, verification, docs)
- `specs/web-aipult-ui/spec.md` — 6 requirements: chat panel structure, card rendering,
  action handlers, localStorage history, mobile responsive, Telegram theme variables
- `validate --strict` → **valid**

### 2.2 Code (3 файла + 4 modified)

| Файл | Строк | Назначение |
|------|-------|------------|
| `web/lib/aipult/ui_format.js` | 175 | Pure functions: formatCard, formatCandidate, formatStatus, formatIntent, formatTimestamp, formatDuration, formatBytes, escapeHtml, truncate |
| `ui/aipult.css` | 320 | Chat panel + CommandCard стили + Telegram theme variables + mobile responsive |
| `ui/aipult.js` | 460 | Vanilla ES module: fetch, render cards, action handlers (📖/✏️/▶️/❌), inline edit с client-side validation, disambiguation UI, localStorage history |
| `ui/index.html` | +50 | Новый таб 🤖 AiPULT + chat panel section + `<link>` + `<script type="module">` |
| `web/app.js` | +2 | Static route `/web/lib/aipult/*` для browser-safe modules (validator.js, ui_format.js) |
| `web/lib/runtime.js` | +2 | AipultRunner wire-up |
| `web/lib/config.js` | +2 | `aipultTimeoutMs`, `aipultOutputLimit` |

### 2.3 Tests (3 файла, 17 тестов)

| Файл | Тестов | Покрытие |
|------|--------|----------|
| `web/tests/aipult_ui_format.test.js` | 11 | formatCard/Candidate/Status/Intent/Timestamp/Duration/Bytes/escapeHtml/truncate/null scenario/missing fields |
| `web/tests/aipult.test.js` (добавлено 6) | 6 | heuristic detects restyle+style, default view, list/stats, null ambiguous, specific vs generic |
| `tests/test_scenario_resolver.py` (добавлено 4) | 4 | natural-language with stop words, English NL, extractKeywords drops stop words, bestScore token+bigram |

**Live provider calls в тестах: 0.**

### 2.4 Результаты

- Node: **110/110 ✓** (90 baseline + 11 ui_format + 9 aipult)
- Python: **69/69 ✓** (50 baseline + 4 scenario_resolver + 7 aipult_client + 8 test_html_renderer)
- OpenSpec: `validate --strict` → **valid**

## 3. Архитектурные баги, найденные в smoke-тесте

### Bug 1: 404 на `../web/lib/aipult/validator.js`

**Symptom:** Browser показывает `Failed to load resource 404` на validator.js

**Root cause:**
1. validator.js импортировал из `../validation.js` и `../errors.js` — sibling файлы в `web/lib/`, не в `web/lib/aipult/`
2. Браузер пытается загрузить их через HTTP, но `web/lib/` не отдаётся

**Fix:**
- `web/lib/aipult/validator.js` — inline `ID_RE` regex + локальный `AipultValidationError extends Error` (с `code`/`status`/`details` properties)
- `web/lib/errors.js#errorMiddleware` — duck-typing: pass-through для любой ошибки с `code: string` + `status: number`
- `web/app.js` — static route `app.use('/web/lib/aipult', express.static(...))` с whitelist только для safe modules

### Bug 2: `crypto.v4` не существует + `STYLE_PATTERNS is not iterable`

**Symptom:** Server crash при import (`SyntaxError: v4 is not provided by crypto`)

**Root cause:**
- `import { v4 as uuidv4 } from 'crypto'` — нет `v4` export
- `for (const [s, patterns] of STYLE_PATTERNS)` — объекты не iterable, нужен `Object.entries()`

**Fix:**
- `import { randomUUID } from 'crypto'` + helper `uuidv4 = () => randomUUID().replace(/-/g, '')`
- `for (const [s, patterns] of Object.entries(STYLE_PATTERNS))`

### Bug 3: npm run dev → EADDRINUSE

**Symptom:** `node --watch server.js` fails: `EADDRINUSE: address already in use 127.0.0.1:3000`

**Root cause:** Мой фоновый server (запущенный через `nohup`) занимал порт. `node --watch` стартует в `web/`, не может bind.

**Fix:** `lsof -ti :3000 | xargs kill -9` — освобождает порт для `npm run dev`.

### Bug 4: Static route `web/lib/aipult` использует relative path

**Symptom:** После фикса Bug 1 server стартует но не отдаёт validator.js

**Root cause:** `express.static('web/lib/aipult', ...)` — relative path резолвится относительно cwd. При `npm run dev` (cwd=`web/`) путь = `web/web/lib/aipult` (не существует)

**Fix:** `path.resolve(config.projectRoot, 'web/lib/aipult')` — абсолютный путь

### Bug 5: long phrases не резолвятся ("поменяй стиль у X на star" → 0 candidates)

**Symptom:** Fuzzy match сравнивает всю фразу с title; длинные фразы с шумом (стоп-словами, intent-глаголами) → низкий score

**Root cause:** `_score` в Python и `scoreCandidate` в Node используют `partial_ratio(phrase, title)` — token-level matching отсутствует

**Fix (3 части):**
- `py/lib/scenario_resolver.py` — `STOP_WORDS` (~80 Russian+English) + `INTENT_VERBS` (~30) + `_extract_keywords()` + `_best_score()` пробует whole phrase + каждый token + каждую bigram
- `web/lib/aipult/resolver.js` — те же `STOP_WORDS` + `extractKeywords()` + `bestScore()`
- `partialRatio` / `partial_ratio` — substring match только для needles ≥3 chars (защита от `to`→`story`, `и`→`одиночестве`)

**Реальный результат:** `"поменяй стиль у Роза и Яша на star"` → `b16e0660 "Роза и Яша"` confidence=1.0 (было 0 candidates)

### Bug 6: LLM subprocess hangs → 504 AIPULT_TIMEOUT

**Symptom:** `POST /api/aipult/chat` возвращает 504 после 30s. Card никогда не появляется.

**Root cause:** `callPythonRouteCommand` spawns Python → MiniMax Text-01 API → hangs (network issue или API limit). Default fallback 30s timeout.

**Fix:** Heuristic parser в Node (без subprocess) как PRIMARY path для clear simple команд. LLM только для ambiguous queries.

**Архитектурное решение:**
- `web/lib/aipult/heuristic.js` — `parseHeuristic()` + `buildHeuristicCard()` + `tryHeuristic()`. 9 intents (restyle, render, revise, view, list, approve, publish, delete, stats) + 6 styles. Pure functions, no I/O.
- `web/routes/aipult.js` — `tryHeuristic()` ПЕРЕД LLM call. Если heuristic возвращает card → return immediately (instant). Иначе → fall through to LLM.
- `tryHeuristic(message, [])` для list/stats без scenario
- Explicit ID (только 8-char hex) → default к `view` intent
- Restyle без явного стиля → return null + UX hint: "Укажите стиль: bubble, star, gothic, boom, memo, bar"

**Результат:** 7/7 instant тестов (<50ms каждый):
- `"8eaa57cc"` → view card
- `"поменяй стиль у Роза и Яша на star"` → restyle card → b16e0660
- `"покажи сценарий 8eaa57cc"` → view card (embedded ID detection)
- `"покажи статистику"` → stats card
- `"покажи список сценариев"` → list card
- `"кот"` → disambig (4 candidates)
- `"xyzнесуществующий"` → no_match

### Bug 7: Browser cache — PNG кэшируется 1 час

**Symptom:** После restyle bubbles "не меняются" в HTML, хотя на диске файл обновлён

**Root cause:** `Cache-Control: public, max-age=3600, immutable` для PNG. Браузер игнорирует обновлённый файл до 1 часа.

**Fix:**
- `web/lib/html_static.js` — `no-cache, must-revalidate` для HTML и panel PNG
- `web/app.js` — то же для `<id>.png` endpoint
- `ui/aipult.js` — cache-busting `?t=${Date.now()}` на ссылках в result bubble и Comics tab

### Bug 8: Restyle без явного стиля → молча перезаписывает на bubble

**Symptom:** User пишет `"поменяй стиль у X"` (без указания целевого стиля) → heuristic дефолтит на `'bubble'` → bubble сбрасывается на default

**Root cause:** `buildHeuristicCard`: `const s = style || 'bubble'`

**Fix:**
- `parseHeuristic` для restyle без `style` → `{intent: 'restyle', style: null, needsStyle: true}`
- `tryHeuristic` → return null (если `needsStyle`)
- Route handler проверяет `parseHeuristic().needsStyle` → возвращает hint: "Укажите стиль для restyle: bubble, star, gothic, boom, memo, bar"

### Bug 9: card.style = undefined → runner дефолтит на bubble

**Symptom:** User пишет `"поменяй стиль у X на star"` → card.command = `... --style star` (правильно), но card.style = undefined. Runner использует `buildArgs(intent, scenarioId, { style: card.style })` → defaults to bubble.

**Root cause:** `buildHeuristicCard` возвращал объект БЕЗ поля `style`. Runner не использует `command` для execution — только `buildArgs` с `card.style`.

**Fix:** `web/lib/aipult/heuristic.js#buildHeuristicCard` — добавлено `style,` в возвращаемый объект.

**Real-data test:** card.style = "star" ✓, subprocess → `--style star` ✓, log: `bubble_styles=['star', 'star', 'star']` ✓ (НЕ `bubble`!)

## 3. Финальное состояние

- Все 6 стилей корректно визуализируются (PNG Pillow + HTML CSS):
  - `bubble` — белый с чёрной обводкой (default, rectangle with rounded corners)
  - `star` — жёлтый starburst
  - `gothic` — чёрный с золотой обводкой, серифный шрифт UnifrakturCook
  - `boom` — красно-оранжевый explosion burst
  - `memo` — жёлтый Post-It с загнутым углом
  - `bar` — полноразмерная золотая полоса
- All 7 chat message types instant (no LLM subprocess for common commands)
- All edge cases handled: explicit ID, embedded ID, disambiguation, no-match, ambiguous
- Manual smoke test прошёл — user подтвердил "супер, фиксируем"

## 4. Что НЕ сделано (deferred)

- ❌ `🎤` Voice input + MediaRecorder → Whisper endpoint (Phase 3)
- ❌ Telegram MiniApp full integration: `WebApp.expand()`, CloudStorage, theme apply (Phase 3)
- ❌ SSE streaming для execution output (Phase 4)
- ❌ Cost dashboard (Phase 4)
- ❌ `docs/aipult.md` full documentation (Phase 4)
- ❌ LLM subprocess bug — MiniMax Text-01 API hangs (need investigation, separate task)

## 5. Verification

```bash
# Node
cd web && node --test --test-concurrency=1 tests/*.test.js
# → 110/110 ✓

# Python
.venv/bin/python3 -m unittest discover -s tests -p 'test_*.py'
# → 69/69 ✓

# OpenSpec
openspec validate aipult-phase-2-ui --strict
# → valid

# Real API
curl -X POST http://127.0.0.1:3000/api/aipult/chat -H 'Content-Type: application/json' \
  -d '{"message":"поменяй стиль у Роза и Яша на star"}'
# → card with style=star, command="... --style star" (instant, <50ms)
```

## 6. Backward Compatibility

- ✅ Telegram-бот (`tg-bot/bot.js`) — не меняется
- ✅ CLI скрипты (`scripts/restyle.py` etc.) — не меняются
- ✅ Existing dashboard tabs (Create, Draft, Approved, Rendered, Comics, Help) — additive only
- ✅ Existing API endpoints (`/api/scenarios/*`, `/api/jobs/*`, `/api/comics/*`) — не меняются
- ✅ New endpoints (`/api/aipult/{chat,resolve,execute,list}`) — additive
