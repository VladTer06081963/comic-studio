# Design: AiPULT — Voice/Chat Command Cards (Phase 1)

## Architecture Overview

AiPULT — это **advisory** слой над существующим Web API. AI генерирует
`CommandCard`, пользователь подтверждает. Поток данных:

```
[Browser/Web UI]
   ↓ POST /api/aipult/chat {message, history}
[web/routes/aipult.js]
   ↓
[web/lib/aipult/resolver.js]  ← резолвит сценарий по phrase
   ↓
[py/lib/scenario_resolver.py]  ← (optional, через subprocess) fuzzy match
   ↓
[py/lib/aipult_client.py]  ← вызывает MiniMax Text-01 с COMMAND_COOKBOOK
   ↓
[web/lib/aipult/validator.js]  ← whitelist + regex
   ↓
[Response: CommandCard JSON]
   ↓
[User confirms] → POST /api/aipult/execute {command, card_id}
   ↓
[web/lib/aipult/runner.js]  ← subprocess с timeout + audit log
```

**Решение о subprocess из Node в Python:** Phase 1 использует **two-process
model**. Web-side (Node) держит API, validation, runner. Python-side держит
резолвер + LLM-клиент. Node вызывает Python через `ProcessRunner` (тот же
паттерн, что для `scripts/restyle.py`). Так сохраняется single source of truth
для `COMMAND_COOKBOOK` в Python, избегаем дублирования system prompt.

Альтернатива: in-process Python (subinterpreters / PyO3) — отклонено, overhead
не оправдан для MVP. Альтернатива: pure-JS LLM client — отклонено, дублирует
cookbook.

## File Structure

```
py/lib/
├── scenario_resolver.py    ← fuzzy title/context match
└── aipult_client.py        ← MiniMax Text-01 + COMMAND_COOKBOOK

web/lib/aipult/
├── resolver.js             ← Node-side resolver (read scenarios directly)
├── validator.js            ← whitelist + regex
└── runner.js               ← subprocess execution

web/routes/
└── aipult.js               ← /api/aipult/{chat,resolve,execute}

tests/
├── test_scenario_resolver.py
└── test_aipult_client.py

web/tests/
└── aipult.test.js
```

## Component Details

### 1. `py/lib/scenario_resolver.py`

Public API:
- `resolve_scenario(phrase: str, *, limit: int = 5) -> list[ResolvedCandidate]`
- `ResolvedCandidate` — TypedDict: `{id, title, status, confidence, resolution_method}`
- `RESOLUTION_METHODS = ('explicit_id', 'title_match', 'context_match', 'recency')`

Algorithm:
1. Если `phrase` matches `^[A-Za-z0-9_-]{4,64}$` (existing scenario ID) — return
   immediately with `resolution_method: 'explicit_id'`.
2. Иначе — scan all scenarios under `data/scenarios/{draft,approved,rendered,published,rejected}/`.
3. Для каждого:
   - `title_score = fuzz.partial_ratio(phrase.lower(), title.lower())`
   - `context_score = fuzz.partial_ratio(phrase.lower(), context[:200].lower()) * 0.7`
   - `score = max(title_score, context_score)`
4. Recency fallback: detect "последний" / "latest" в phrase → newest by
   `created_at` среди matching status (default: `rendered`).
5. Sort by `(score desc, created_at desc)`, drop `< 60`, return top `limit`.
6. Disambiguation: если `len(candidates) > 1` и top-2 score отличается `< 10` —
   добавить `ambiguity: True` flag в candidates (UI показывает warning).

No I/O outside `data/scenarios/`. No LLM calls. Pure Python + `rapidfuzzy`.

### 2. `py/lib/aipult_client.py`

Public API:
- `COMMAND_COOKBOOK: str` — single source of truth для system prompt
- `route_command(user_message: str, candidates: list[dict], history: list[dict] = None) -> CommandCard`
- `CommandCard` — TypedDict со всеми полями из PRD §7.3

Algorithm:
1. Build system prompt: `COMMAND_COOKBOOK` + resolution hints
   (если candidates непустой, сериализовать в JSON и добавить)
2. Call MiniMax Text-01 через `_call_minimax_chat()` (existing pattern в
   `py/scenario/writer.py`)
3. Parse JSON response, validate against schema:
   - `intent` ∈ ALLOWED_INTENTS
   - `scenario_id` ∈ candidate IDs
   - `command` matches `^python3? scripts/<name>.py ...` или `^GET /api/...`
     или `^POST /api/...` или `^DELETE /api/...`
4. Enrich: добавить `title`, `status`, `confidence` из candidates
5. Return `CommandCard` (включая `warnings`, `estimated_time`, `estimated_cost`)

Errors → `route_command()` raises:
- `AipultRouterError` (base)
- `AipultInvalidResponse` (LLM returned non-JSON)
- `AipultForbiddenIntent` (intent not in whitelist)
- `AipultScenarioNotFound` (LLM-hallucinated ID)
- `AipultLlmUnavailable` (API key missing / network error)

### 3. `web/lib/aipult/resolver.js`

Pure Node implementation. Reads `data/scenarios/*/*.json` напрямую через
`fs.readdirSync`. Использует `string-similarity` пакет ИЛИ simple
Levenshtein-based scoring (свой micro-implementation, ~30 строк).

Public API:
- `resolveScenario(phrase, { dataRoot, limit = 5 }) -> Array<ResolvedCandidate>`
- `listRecent(status = 'rendered', { dataRoot, limit = 10 }) -> Array<{id, title, status, created_at}>`

### 4. `web/lib/aipult/validator.js`

Pure functions. No I/O.

Public API:
- `validateCard(card) -> { ok: true } | throws AipultValidationError`
- `validateIntent(intent) -> intent`
- `validateScenarioId(id) -> id`
- `validateCommandString(command) -> command`
- `FORBIDDEN_PATTERNS` — array of regex (e.g. `/rm\s+-rf\s+\//`, `/\.env$/`,
  `/(api[_-]?key|token|secret)\s*[:=]\s*\S+/i`)
- `ALLOWED_INTENTS = ['restyle', 'render', 'revise', 'view', 'list', 'approve',
  'publish', 'delete', 'stats']`

### 5. `web/lib/aipult/runner.js`

Wraps existing `ProcessRunner` из `web/lib/process_runner.js`.

Public API:
- `AipultRunner` class with `execute(card, { requestId }) -> Promise<{exitCode, stdout, stderr, durationMs}>`
- Logs structured audit entry в `data/logs/aipult-YYYY-MM-DD.log` (через logger).
- Команды только из ALLOWED_INTENTS (defense-in-depth даже если validator пропустил).
- Timeout = config.aipultTimeoutMs (default 30_000).

### 6. `web/routes/aipult.js`

Express Router factory. Подключается в `web/app.js`:
```js
import { aipultRouter } from './routes/aipult.js';
app.use('/api/aipult', aipultRouter({ config, store, logger, runner, aipultRunner }));
```

Endpoints:
- `POST /api/aipult/resolve` — `{phrase}` → `{candidates: [{id, title, status, confidence, ...}]}`
- `POST /api/aipult/chat` — `{message, history?}` → `{card: CommandCard}` или
  `{error: {code, message}}`
- `POST /api/aipult/execute` — `{card_id, command?}` → `{ok, exitCode, stdout, stderr, durationMs}`
- `GET /api/aipult/audit?since=ISO` — последние N audit entries (Phase 4, но
  skeleton уже сейчас)

Body validation через `web/lib/validation.js` patterns.

## Test Strategy

**Python tests** (no live MiniMax):
- `test_scenario_resolver.py`:
  - `test_explicit_id_returns_immediately`
  - `test_title_fuzzy_match`
  - `test_context_fuzzy_match_weighted_07x`
  - `test_recency_fallback_for_last_rendered`
  - `test_disambiguation_with_close_scores`
  - `test_low_confidence_filtered_out`
  - `test_empty_data_dir_returns_empty`
- `test_aipult_client.py`:
  - `test_route_command_with_mocked_minimax`
  - `test_route_command_rejects_forbidden_intent`
  - `test_route_command_rejects_hallucinated_scenario_id`
  - `test_route_command_handles_invalid_json_response`
  - `test_route_command_builds_card_with_title_enrichment`

**Node tests** (no live Python / no live MiniMax):
- `web/tests/aipult.test.js`:
  - `test_resolver_matches_cyrillic_title`
  - `test_resolver_falls_back_to_recency`
  - `test_validator_rejects_forbidden_intent`
  - `test_validator_rejects_dangerous_command_string`
  - `test_validator_rejects_hallucinated_scenario_id`
  - `test_runner_enforces_timeout`
  - `test_chat_endpoint_returns_card_with_title_and_id`
  - `test_execute_endpoint_runs_whitelisted_command`
  - `test_audit_log_emits_structured_entry`

Helpers: `MockRunner` (in `web/tests/helpers.js` extension) для подмены
`ProcessRunner` в runner-тестах; `fakeLlmClient` monkey-patch для Python
тестов через dependency injection.

## Migration / Backward Compat

- ✅ Telegram-бот (`tg-bot/bot.js`) — не меняется. Co-exists как legacy.
- ✅ CLI скрипты (`scripts/restyle.py` etc.) — не меняются. Можно вызывать
  напрямую или через `runner.execute()`.
- ✅ Existing web endpoints (`/api/scenarios/*`, `/api/jobs/*`) — не меняются.
- ✅ `py/scenario/writer.py` — переиспользует существующую `_call_minimax_chat`
  без изменений (используется в `aipult_client.py`).
- 🆕 Новая `data/logs/aipult-YYYY-MM-DD.log` — additive, не ломает существующие
  log parsers.

## Security Considerations

1. **AI never executes**: `runner.execute()` вызывается ТОЛЬКО через explicit
   `POST /api/aipult/execute` с `card_id` (audit-trail). AI response не
   триггерит execution.
2. **Whitelist intents**: `ALLOWED_INTENTS` enforced в `validator.js` И
   `runner.js` (defense-in-depth).
3. **Forbidden patterns**: `FORBIDDEN_PATTERNS` regex applied to command string
   before execution. Reject `rm -rf`, `curl | sh`, `env | grep TOKEN` и т.п.
4. **Scenario ID validation**: `validateScenarioId()` через existing
   `web/lib/validation.js#scenarioId` — pattern `^[A-Za-z0-9_-]{4,64}$`.
5. **Timeout**: default 30s (config.aipultTimeoutMs), max 300s.
6. **No secrets in commands**: validator rejects `command` containing
   `.env`, `api_key`, `token`, `secret` substrings.
7. **Audit log**: every card и every execution logged с `request_id`,
   `card_id`, `command_executed`, `exit_code`, `duration_ms`. Feedback тексты
   НЕ логируются (privacy).

## Performance

- `resolveScenario`: O(n) scan of `data/scenarios/`. С n < 1000 (типично 30-50)
  это < 50ms на SSD.
- `routeCommand`: 1 MiniMax call, ~1-1.5s latency (Text-01).
- `runner.execute`: variable (depends on command). restyle ~2-5s, render
  blocked (запрещён в Phase 1, только restyle/revise/view).
- Total chat latency: < 2s для resolution + < 1.5s для LLM = < 3.5s.

## Open Questions (deferred to Phase 2-4)

- OQ-A: Inline command edit в UI — Phase 2 (`ui/aipult.js`).
- OQ-B: SSE streaming для execution output — Phase 4.
- OQ-C: Cost dashboard — Phase 4.
