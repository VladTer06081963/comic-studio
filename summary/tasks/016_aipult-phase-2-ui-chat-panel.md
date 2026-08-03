# Задачи: AiPULT Phase 2 — UI Chat Panel + Cards

**Change:** `aipult-phase-2-ui` (archived)
**Спецификации:** `web-aipult-ui` (1 new capability, 6 ADDED requirements, 14 scenarios)
**Audit:** `summary/audit/016_aipult-phase-2-ui-chat-panel.md`

## Статус: ✅ Done (2026-08-03)

| ID | Задача | Оценка | Факт | Статус |
|----|--------|--------|------|--------|
| 1 | OpenSpec proposal + design + tasks + spec | 1h | ✓ | ✅ Done |
| 2 | `web/lib/aipult/ui_format.js` (pure functions) | 1h | ✓ | ✅ Done |
| 3 | `ui/aipult.css` (chat panel + cards + Telegram theme) | 1h | ✓ | ✅ Done |
| 4 | `ui/aipult.js` (vanilla ES module, fetch, render, actions) | 2h | ✓ | ✅ Done |
| 5 | `ui/index.html` (новый таб 🤖 AiPULT + chat panel section) | 0.5h | ✓ | ✅ Done |
| 6 | Wiring: config + runtime + app.js + `web/lib/aipult/*` static route | 0.5h | ✓ | ✅ Done |
| 7 | Tests: ui_format (11), aipult heuristic (6), scenario_resolver NL (4) | 1.5h | ✓ | ✅ Done |
| 8 | Smoke test с user + 9 bugs found + 9 fixes | 1.5h | ✓ | ✅ Done |
| 9 | OpenSpec validate --strict + archive | 0.5h | ✓ | ✅ Done |
| 10 | Audit + tasks + CHANGELOG + commit + push | 0.5h | ✓ | ✅ Done |

**Итого:** ~10h (10 секций), выполнено за 1 сессию + 9 bug fixes в smoke-тесте.

## 9 багов найдены и зафиксированы в smoke-тесте

| # | Bug | Файл | Решение |
|---|-----|------|---------|
| 1 | 404 на `validator.js` транзитивные импорты | `web/lib/aipult/validator.js`, `web/lib/errors.js`, `web/app.js` | Inline ID_RE, локальный AipultValidationError, static route с whitelist |
| 2 | `crypto.v4` not exported + `STYLE_PATTERNS` not iterable | `web/lib/aipult/heuristic.js` | `randomUUID` import, `Object.entries()` |
| 3 | npm run dev → EADDRINUSE | (процесс) | `lsof -ti :3000 \| xargs kill -9` |
| 4 | Static route relative path fails при `npm run dev` | `web/app.js` | `path.resolve(config.projectRoot, ...)` |
| 5 | long phrases не резолвятся (`"поменяй стиль у X на star"` → 0) | `py/lib/scenario_resolver.py`, `web/lib/aipult/resolver.js` | STOP_WORDS + extract_keywords + best_score (whole+tokens+bigrams) |
| 6 | LLM subprocess hangs → 504 | `web/lib/aipult/heuristic.js`, `web/routes/aipult.js` | Heuristic PRIMARY path, LLM fallback only for ambiguous |
| 7 | Browser cache — PNG `max-age=3600, immutable` | `web/lib/html_static.js`, `web/app.js`, `ui/aipult.js` | `no-cache, must-revalidate` + `?t=${Date.now()}` |
| 8 | Restyle без стиля → silent bubble override | `web/lib/aipult/heuristic.js`, `web/routes/aipult.js` | `needsStyle: true` → UX hint |
| 9 | card.style = undefined → runner defaults to bubble | `web/lib/aipult/heuristic.js` | Добавлено `style,` в возвращаемый объект |

## Что готово (production-ready)

### UI (3 файла)

- ✅ `web/lib/aipult/ui_format.js` — 9 pure functions, browser-safe
- ✅ `ui/aipult.css` — 320 строк, mobile-first responsive, Telegram theme variables
- ✅ `ui/aipult.js` — vanilla ES module, ~460 строк, localStorage history (50 messages), 4 action buttons (📖/✏️/▶️/❌), inline edit с client-side validation

### Backend integration (Phase 1 + Phase 2)

- ✅ Heuristic parser — 9 intents × 6 styles, instant <50ms
- ✅ Natural-language fuzzy matching — STOP_WORDS, token+bigram scoring
- ✅ Explicit ID detection (whole + embedded) + recency fallback
- ✅ Audit log в `data/logs/aipult-*.log` с structured JSON
- ✅ Defense-in-depth validation (route → validator → runner, 3 layers)

### Tests (33 в Phase 2 + 18 в Phase 1 = 51 новых)

- ✅ `web/tests/aipult_ui_format.test.js` — 11 тестов
- ✅ `web/tests/aipult.test.js` — 21 тест (включая 6 heuristic)
- ✅ `tests/test_scenario_resolver.py` — 12 тестов (8 baseline + 4 NL)
- ✅ `tests/test_aipult_client.py` — 7 тестов

### Real-data verified

- `поменяй стиль у Роза и Яша на star` → card with `style='star'`, Run → star bubbles ✓
- `покажи сценарий 8eaa57cc` → view card (embedded ID) ✓
- `покажи статистику` → stats card ✓
- `покажи список сценариев` → list card ✓
- `кот` → disambig (4 candidates) ✓
- `8eaa57cc` (just ID) → view card default ✓
- `xyzнесуществующий` → no_match ✓

## Что НЕ сделано (deferred)

- ❌ `🎤` Voice input + MediaRecorder → Whisper endpoint (Phase 3)
- ❌ Telegram MiniApp full integration: `WebApp.expand()`, CloudStorage, theme apply (Phase 3)
- ❌ SSE streaming для execution output (Phase 4)
- ❌ Cost dashboard (Phase 4)
- ❌ `docs/aipult.md` full documentation (Phase 4)
- ❌ LLM subprocess bug — MiniMax Text-01 API hangs (separate investigation task)

## Verification

```bash
# Node
cd web && node --test --test-concurrency=1 tests/*.test.js
# → 110/110 ✓ (90 baseline + 20 AiPULT)

# Python
.venv/bin/python3 -m unittest discover -s tests -p 'test_*.py'
# → 69/69 ✓ (50 baseline + 19 AiPULT)

# OpenSpec
openspec validate aipult-phase-2-ui --strict
# → valid

# Real API (instant, no LLM subprocess)
curl -X POST http://127.0.0.1:3000/api/aipult/chat -H 'Content-Type: application/json' \
  -d '{"message":"поменяй стиль у Роза и Яша на star"}'
# → {"card": {...style: "star"...}, ...} <50ms
```

## Phase 3 preview (отдельная задача)

```js
// ui/aipult.js — добавить:
navigator.mediaDevices.getUserMedia({audio: true})
  → MediaRecorder → opus/ogg blob
  → POST /api/aipult/transcribe (multipart)
  → Whisper base (Python) → text
  → автоподставить в input

// web/lib/miniapp.js — новый
window.Telegram?.WebApp?.ready() → initData + themeParams
  → applyThemeVariables (--tg-theme-* CSS vars)
  → CloudStorage fallback для localStorage
```

Не в этом change.
