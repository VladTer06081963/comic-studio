# Задачи: AiPULT Phase 1 — Resolution + Backend

**Change:** `aipult-command-cards` (archived)
**Спецификации:** `python-aipult-router`, `web-aipult-chat`, `web-aipult-runner`
**Audit:** `summary/audit/015_aipult-phase-1-resolution-backend.md`

## Статус: ✅ Done (2026-08-03)

| ID | Задача | Оценка | Факт | Статус |
|----|--------|--------|------|--------|
| 1 | OpenSpec proposal + design + tasks + 3 specs | 1h | ✓ | ✅ Done |
| 2 | `py/lib/scenario_resolver.py` (rapidfuzzy/thefuzz fallback, 4 resolution methods) | 1.5h | ✓ | ✅ Done |
| 3 | `py/lib/aipult_client.py` (COMMAND_COOKBOOK v0.3, 4 exceptions, route_command) | 2h | ✓ | ✅ Done |
| 4 | `web/lib/aipult/resolver.js` (pure JS, same API) | 1h | ✓ | ✅ Done |
| 5 | `web/lib/aipult/validator.js` (9 intents, 6 patterns, validateCard) | 0.5h | ✓ | ✅ Done |
| 6 | `web/lib/aipult/runner.js` (subprocess + audit log + 3-layer validation) | 1h | ✓ | ✅ Done |
| 7 | `web/routes/aipult.js` (4 endpoints + Python subprocess bridge) | 1.5h | ✓ | ✅ Done |
| 8 | Wiring: config + runtime + app + requirements.txt | 0.5h | ✓ | ✅ Done |
| 9 | `tests/test_scenario_resolver.py` (8 tests, no live MiniMax) | 0.5h | ✓ | ✅ Done |
| 10 | `tests/test_aipult_client.py` (7 tests, mocked LLM) | 0.5h | ✓ | ✅ Done |
| 11 | `web/tests/aipult.test.js` (18 tests, no Python subprocess) | 1h | ✓ | ✅ Done |
| 12 | OpenSpec validate --strict + archive | 0.5h | ✓ | ✅ Done |
| 13 | Audit + tasks + CHANGELOG + commit + push | 0.5h | ✓ | ✅ Done |

**Итого:** ~11.5h (12 секций), выполнено за 1 сессию.

## Что готово

### Backend (production-ready)

- ✅ `py/lib/scenario_resolver.py` — fuzzy title/context match
  - Explicit ID short-circuit (regex `^[A-Za-z0-9_-]{4,64}$`)
  - Title match: `rapidfuzzy.fuzz.partial_ratio` (≥60 score)
  - Context match: weighted 0.7x
  - Recency fallback: "последний/последняя/последнее/latest/last" → newest by `created_at`
  - Disambiguation: top-2 score gap <10 → `ambiguity: true`
  - Backend: `rapidfuzzy` (preferred, production) или `thefuzz` (fallback, pure Python)
  - No I/O side effects, no LLM calls

- ✅ `py/lib/aipult_client.py` — MiniMax Text-01 wrapper
  - `COMMAND_COOKBOOK` constant (single source of truth, ~3 KB)
  - 4 typed exceptions: `AipultRouterError`, `AipultInvalidResponse`,
    `AipultForbiddenIntent`, `AipultScenarioNotFound`, `AipultLlmUnavailable`
  - `route_command(message, candidates, history=None, *, chat_client=None)`
  - `chat_client` injection для тестов
  - Re-uses `_call_minimax_chat` pattern from `py/scenario/writer.py`
  - Builds commands deterministically (не доверяет LLM-у shell strings)

- ✅ `web/lib/aipult/resolver.js` — pure Node mirror
  - `resolveScenario(phrase, { dataRoot, limit, recencyStatus, scenarios })`
  - `listRecent(status, { dataRoot, limit })`
  - Token set ratio approximation (rapidfuzzy-style)
  - No external npm deps

- ✅ `web/lib/aipult/validator.js` — whitelist + regex
  - `ALLOWED_INTENTS` (9): restyle, render, revise, view, list, approve,
    publish, delete, stats
  - `FORBIDDEN_PATTERNS` (6): `rm -rf /`, `$(...)`, `| sh|bash`, secret
    leakage, `.env`, `../`
  - `validateCard/intent/scenarioId/commandString/sanitizeForLog`

- ✅ `web/lib/aipult/runner.js` — subprocess execution
  - `AipultRunner.execute(card, { requestId, timeoutMs })`
  - Re-validates intent (defense-in-depth)
  - Audit log: `data/logs/aipult-YYYY-MM-DD.log` JSON line per execution
  - Phase 1 executable: `restyle` (only); render/publish deferred

- ✅ `web/routes/aipult.js` — Express endpoints
  - `POST /api/aipult/resolve` — fast pre-filter, no Python
  - `POST /api/aipult/chat` — bridge to Python via `execFileAsync`
  - `POST /api/aipult/execute` — runs whitelisted subprocess
  - `GET /api/aipult/list` — discovery (`?status=...&limit=10`)

### Tests (33 total, 0 live provider calls)

- ✅ `tests/test_scenario_resolver.py` — 8 unit tests
- ✅ `tests/test_aipult_client.py` — 7 unit tests (mocked LLM)
- ✅ `web/tests/aipult.test.js` — 18 tests (resolver/validator/runner/HTTP)

### OpenSpec

- ✅ Change `aipult-command-cards` validated + archived
- ✅ 3 new capabilities in main specs: `python-aipult-router`,
  `web-aipult-chat`, `web-aipult-runner`
- ✅ 15 ADDED requirements total (12 scenarios)

## Что НЕ сделано (deferred)

- ❌ `ui/index.html` chat panel + `ui/aipult.js` — **Phase 2**
- ❌ Voice input (`py/ingest/voice.py` + Whisper endpoint) — **Phase 3**
- ❌ Telegram MiniApp detection (`web/lib/miniapp.js`) — **Phase 3**
- ❌ SSE streaming для execution output — **Phase 4**
- ❌ Cost dashboard — **Phase 4**
- ❌ `docs/aipult.md` полная документация — **Phase 4**

## Verification

```bash
# Baseline
cd web && node --test --test-concurrency=1 tests/*.test.js
# → 90/90 ✓ (72 baseline + 18 новых)

cd .. && .venv/bin/python3 -m unittest discover -s tests -p 'test_*.py'
# → 65/65 ✓ (50 baseline + 15 новых)

# OpenSpec
openspec validate aipult-command-cards --strict
# → valid

openspec list --specs
# → + python-aipult-router
#   + web-aipult-chat
#   + web-aipult-runner
```

## Real-data probe

```python
from py.lib.scenario_resolver import resolve_scenario

# "кот" → 5 candidates (disambiguation)
resolve_scenario("кот")
# "последний" → recency fallback
resolve_scenario("последний")
# 8eaa57cc → explicit ID
resolve_scenario("8eaa57cc")
# "Сашу" → title match
resolve_scenario("Сашу")
```

## Phase 2 preview (отдельная задача)

```bash
# ui/index.html + chat panel
# ui/aipult.js (vanilla JS, Telegram theme, inline edit)
# card actions: 📖 Read / ✏️ Edit / ▶️ Run / ❌
# chat history в localStorage
# mobile-first responsive
```
