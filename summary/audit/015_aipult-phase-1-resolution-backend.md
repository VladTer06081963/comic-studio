# Аудит: AiPULT Phase 1 — Resolution + Backend

**Дата:** 2026-08-03
**PR/Change:** `aipult-command-cards` (archived → `openspec/changes/archive/2026-08-03-aipult-command-cards/`)
**Спецификации:** `python-aipult-router`, `web-aipult-chat`, `web-aipult-runner` (3 новые capabilities)

## 1. Контекст

Пользователи Comic Studio помнят **название** комикса ("Кот в одиночестве"),
но не 8-char hex ID (`8eaa57cc`). Это создаёт cognitive load, делает голосовое
управление нерабочим и закрывает discovery. Существующие Telegram-бот и CLI
скрипты требуют явного ID — UX не масштабируется на MiniApp.

Решение (см. `PRD/AiPULT.md` v0.3 + `HANDOFF_AiPULT.md`): **AiPULT** —
чат-панель, которая (1) **резолвит сценарий по title** через fuzzy match,
(2) генерирует **CommandCard** с командой, (3) показывает пользователю
▶️ Run / ✏️ Edit / ❌ Reject. AI = советчик, человек = executor. Паттерн
proven: GitHub Copilot, AWS Q, Cursor diff review.

Phase 1 закрывает **Resolution + Backend**:
- Python fuzzy resolver + MiniMax Text-01 wrapper с COMMAND_COOKBOOK
- Node resolver, validator, runner
- Express endpoints `/api/aipult/{chat,resolve,execute,list}`

UI/voice/MiniApp = Phase 2-3, отложены.

## 2. Что сделано

### 2.1 OpenSpec change `aipult-command-cards`

- `proposal.md` — motivation (IDs незапоминаемые), impact, out-of-scope
- `design.md` — architecture (two-process model: Node → Python subprocess),
  component details, security considerations, performance
- `tasks.md` — 6 секций (Python resolver/router, Node resolver/validator/runner,
  Web routes, Python tests, Node tests, validation)
- `specs/python-aipult-router/spec.md` — 4 requirements (resolution, cookbook,
  routing, no side effects), 12 scenarios
- `specs/web-aipult-chat/spec.md` — 4 requirements (resolve, chat, list, backward
  compat), 8 scenarios
- `specs/web-aipult-runner/spec.md` — 6 requirements (whitelist, forbidden
  patterns, scenario ID, subprocess, audit, no secrets), 9 scenarios

**Validation:** `openspec validate aipult-command-cards --strict` → **valid**

### 2.2 Code (6 файлов)

| Файл | Строк | Назначение |
|------|-------|------------|
| `py/lib/scenario_resolver.py` | 195 | Fuzzy title/context match через `rapidfuzzy` (preferred) или `thefuzz` (fallback); recency fallback; disambiguation |
| `py/lib/aipult_client.py` | 380 | MiniMax Text-01 wrapper + `COMMAND_COOKBOOK` v0.3 (single source в Python); 4 typed exceptions; `route_command()` строит CommandCard |
| `web/lib/aipult/resolver.js` | 145 | Pure-JS mirror: читает `data/scenarios/*/` напрямую, тот же API (`resolveScenario`, `listRecent`) |
| `web/lib/aipult/validator.js` | 90 | `ALLOWED_INTENTS` (9), `FORBIDDEN_PATTERNS` (6 regex), `validateCard/intent/scenarioId/commandString/sanitizeForLog` |
| `web/lib/aipult/runner.js` | 130 | `AipultRunner.execute()` поверх `ProcessRunner`; re-validate intent (defense-in-depth); audit log в `data/logs/aipult-*.log` |
| `web/routes/aipult.js` | 220 | 4 endpoints: `POST /resolve`, `POST /chat` (subprocess → Python), `POST /execute`, `GET /list` |

### 2.3 Wiring

- `web/lib/config.js` — добавлены `aipultTimeoutMs` (default 30_000), `aipultOutputLimit` (5 MB) с bounded validation
- `web/lib/runtime.js` — `createRuntime()` инстанцирует `AipultRunner`, добавляет в return
- `web/app.js` — `app.use('/api/aipult', aipultRouter(...))` после `/api/comics`
- `py/requirements.txt` — `rapidfuzzy>=3.0.0`

### 2.4 Tests (3 файла, 33 теста)

| Файл | Тестов | Покрытие |
|------|--------|----------|
| `tests/test_scenario_resolver.py` | 8 | explicit_id, cyrillic title, context 0.7x, recency, disambiguation, low-confidence filter, empty data, injected scenarios |
| `tests/test_aipult_client.py` | 7 | mocked MiniMax (chat_client injection), forbidden intent, hallucinated ID, invalid JSON, title enrichment, cookbook 9 intents, LLM unavailable |
| `web/tests/aipult.test.js` | 18 | resolver (3), validator (7), runner (2), HTTP endpoints (4) + chat no-candidates + disambiguation paths |

**Live provider calls в тестах: 0** (правило CLAUDE.md соблюдено — все
вызовы MiniMax mock-ятся через `chat_client` parameter в Python и
через не-вызов Python subprocess в Node).

### 2.5 Результаты

- Node: **90/90 ✓** (72 baseline + 18 новых)
- Python: **65/65 ✓** (50 baseline + 15 новых)
- OpenSpec: `validate --strict` → **valid**
- 0 live MiniMax / Telegram / Notion / site calls

### 2.6 Real-data sanity check

На реальных `data/scenarios/`:

```
phrase='кот'        → 5 candidates (Виталик, Кот в одиночестве, ...)
phrase='последний'  → recency → 4f260284 «Диалог с собой» (confidence=0.5)
phrase='8eaa57cc'   → explicit_id short-circuit
phrase='Сашу'       → 566ae498 «Саша и Борис» (0.86)
phrase='xyzнесущ'    → [] (low confidence filtered)
```

## 3. Статус

✅ **Phase 1 готов и зафиксирован.** OpenSpec change `aipult-command-cards`
архивирован, 3 новые capabilities (`python-aipult-router`, `web-aipult-chat`,
`web-aipult-runner`) синхронизированы в main specs.

**Готово к Phase 2:** `ui/index.html` chat panel + `ui/aipult.js` (vanilla JS,
Telegram theme variables, inline edit, card actions). Отдельная задача.

**НЕ в этом изменении (out of scope):**
- UI chat panel (Phase 2)
- Voice input через Whisper (Phase 3)
- Telegram MiniApp detection (Phase 3)
- SSE streaming + cost dashboard (Phase 4)

**Backward-compat:** Telegram-бот (`tg-bot/bot.js`) и CLI скрипты
(`scripts/restyle.py`, `scripts/render_approved.py`, `scripts/revise_scenario.py`)
продолжают работать без изменений. AiPULT — новый канал.

**Безопасность:**
- AI никогда не выполняет команды — только генерирует card
- Whitelist intents enforced в 3 местах (validator, route, runner)
- 6 forbidden patterns regex: `rm -rf /`, `$(...)`, `| sh`, secrets, `.env`, `../`
- Audit log: `data/logs/aipult-YYYY-MM-DD.log` structured JSON без feedback текстов
- Subprocess timeout: 30s default, 5min max
