## 1. Python Resolver + MiniMax Router

- [ ] 1.1 Add `rapidfuzzy>=3.0.0` to `py/requirements.txt` and verify import works in venv.
- [ ] 1.2 Implement `py/lib/scenario_resolver.py` with `resolve_scenario(phrase, *, limit=5)` returning `list[ResolvedCandidate]` and `RESOLUTION_METHODS` constant. Use `rapidfuzzy.fuzz.partial_ratio` for title scoring, weighted 0.7x for context, recency fallback for "последний/последняя/последнее" phrases.
- [ ] 1.3 Implement explicit-ID short-circuit: if `phrase` matches `^[A-Za-z0-9_-]{4,64}$` and scenario file exists, return immediately with `resolution_method='explicit_id'`.
- [ ] 1.4 Implement disambiguation flag: if top-2 candidates have score within 10 points, set `ambiguity=True` for both.
- [ ] 1.5 Implement `py/lib/aipult_client.py` with `COMMAND_COOKBOOK` constant (v0.3 from PRD §7.4), `_call_minimax_chat` reusing existing pattern from `py/scenario/writer.py`, and `route_command(message, candidates, history=None)` returning a `CommandCard` TypedDict.
- [ ] 1.6 Validate LLM response: parse JSON, check `intent ∈ ALLOWED_INTENTS`, check `scenario_id ∈ candidate IDs`, check `command` matches allowed shell patterns. Raise specific exceptions (`AipultForbiddenIntent`, `AipultScenarioNotFound`, `AipultInvalidResponse`).
- [ ] 1.7 Enrich card with `title`, `status`, `confidence`, `resolution_method` from candidates before returning.

## 2. Node Resolver + Validator + Runner

- [ ] 2.1 Create `web/lib/aipult/resolver.js` with `resolveScenario(phrase, { dataRoot, limit=5 })` reading `data/scenarios/*/*.json` directly and using a simple Levenshtein-based scoring (no external dep).
- [ ] 2.2 Add `listRecent(status='rendered', { dataRoot, limit=10 })` to `web/lib/aipult/resolver.js` returning `Array<{id, title, status, created_at}>` sorted by `created_at` desc.
- [ ] 2.3 Create `web/lib/aipult/validator.js` with `validateCard(card)`, `validateIntent(intent)`, `validateScenarioId(id)`, `validateCommandString(command)`, `ALLOWED_INTENTS` (9 entries), `FORBIDDEN_PATTERNS` (≥3 regex).
- [ ] 2.4 Implement forbidden-pattern checks: `rm\s+-rf\s+/`, `\$\(.+\)`, `\|\s*(?:sh|bash)`, `(api[_-]?key|token|secret)\s*[:=]\s*\S+`, `\.env\b`.
- [ ] 2.5 Create `web/lib/aipult/runner.js` with `AipultRunner` class wrapping `ProcessRunner`. Method `execute(card, { requestId }) -> Promise<{exitCode, stdout, stderr, durationMs}>`. Re-check intent whitelist inside (defense-in-depth) and emit structured audit log entry.
- [ ] 2.6 Add audit log writer in `runner.js`: append to `data/logs/aipult-YYYY-MM-DD.log` JSON line per execution. Fields: `ts`, `request_id`, `card_id`, `intent`, `command_executed`, `exit_code`, `duration_ms`. Never log feedback/revise text.

## 3. Web Route + Wiring

- [ ] 3.1 Create `web/routes/aipult.js` exporting `aipultRouter({ config, store, logger, runner, aipultRunner })`. Three endpoints: `POST /resolve`, `POST /chat`, `POST /execute`.
- [ ] 3.2 `/resolve` body: `{phrase: string ≤500 chars}`. Returns `{candidates: ResolvedCandidate[], request_id}`. Validates phrase is non-empty bounded string.
- [ ] 3.3 `/chat` body: `{message: string ≤1000, history?: Array<{role, content}> ≤20}`. Returns `{card: CommandCard, request_id}` or `{error: {code, message}, request_id}`. Calls resolver first, then `route_command` via subprocess (`ProcessRunner`).
- [ ] 3.4 `/execute` body: `{card_id: string, command?: string}`. If `command` provided, validate it; otherwise use `card.command` from server-side cache. Returns `{ok, exit_code, stdout, stderr, duration_ms, request_id}`.
- [ ] 3.5 Wire router in `web/app.js`: `app.use('/api/aipult', aipultRouter({ ... }))` after other `/api/*` routes. Pass `aipultRunner` from `runtime.js`.
- [ ] 3.6 Add `AipultRunner` instantiation in `web/lib/runtime.js#createRuntime`. Add optional `aipultTimeoutMs` (default 30_000) and `aipultMaxHistory` (default 20) to `web/lib/config.js#loadConfig`.

## 4. Python Tests

- [ ] 4.1 Add `tests/test_scenario_resolver.py` with 7 tests: `test_explicit_id_returns_immediately`, `test_title_fuzzy_match_cyrillic`, `test_context_fuzzy_match_weighted_07x`, `test_recency_fallback_for_last_rendered`, `test_disambiguation_with_close_scores`, `test_low_confidence_filtered_out`, `test_empty_data_dir_returns_empty`. All tests use `tempfile.TemporaryDirectory` for isolated `data/scenarios/` fixture. NO live MiniMax.
- [ ] 4.2 Add `tests/test_aipult_client.py` with 5 tests: `test_route_command_with_mocked_minimax` (monkey-patch `_call_minimax_chat`), `test_route_command_rejects_forbidden_intent`, `test_route_command_rejects_hallucinated_scenario_id`, `test_route_command_handles_invalid_json_response`, `test_route_command_enriches_card_with_title`. NO live MiniMax, NO subprocess.

## 5. Node Tests

- [ ] 5.1 Add `web/tests/aipult.test.js` with 9 tests covering: resolver title match, resolver recency fallback, validator rejects forbidden intent, validator rejects dangerous command string, validator rejects hallucinated scenario ID, runner enforces timeout, `/api/aipult/chat` returns card with `title`+`id`, `/api/aipult/execute` runs whitelisted command, audit log emits structured entry.
- [ ] 5.2 Use `makeTestRuntime` + `writeScenario` from existing `web/tests/helpers.js`. Add `MockRunner` (or extend `FakeRunner`) to support `aipultRunner` injection.
- [ ] 5.3 Wire aipultRouter in test runtime via `createApp(runtime, ...)`. No live Python subprocess in tests — mock `ProcessRunner` calls for `/api/aipult/chat` → `route_command`.

## 6. Validation and Documentation

- [ ] 6.1 Run `cd web && node --test tests/aipult.test.js` and `cd .. && .venv/bin/python3 -m unittest discover -s tests -p 'test_*.py'`. All tests must pass with no live MiniMax / Telegram / Notion calls.
- [ ] 6.2 Run `openspec validate aipult-command-cards --strict`. Must pass without errors.
- [ ] 6.3 Update `CLAUDE.md` to mention AiPULT module structure (single source for COMMAND_COOKBOOK) and audit log path.
- [ ] 6.4 Add a short `docs/aipult.md` placeholder summarizing Phase 1 scope and pointing to PRD §7-9. Full docs deferred to Phase 4.
