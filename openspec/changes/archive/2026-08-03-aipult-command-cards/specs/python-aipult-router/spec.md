# python-aipult-router

## Purpose

Определяет Python-side контракт для AiPULT: (1) fuzzy резолвер сценариев
по title/context без обращения к LLM, (2) MiniMax Text-01 wrapper с
кэшированным `COMMAND_COOKBOOK` для генерации `CommandCard`. Single source
of truth для system prompt живёт в `py/lib/aipult_client.py`.

## ADDED Requirements

### Requirement: Scenario resolution by phrase

`py.lib.scenario_resolver.resolve_scenario(phrase, *, limit=5)` SHALL возвращать
`list[dict]` со следующими полями для каждого кандидата:

- `id: str` — scenario ID (8 hex chars)
- `title: str` — название сценария
- `status: str` ∈ {`draft`, `approved`, `rejected`, `rendered`, `published`}
- `confidence: float` ∈ [0.0, 1.0] — итоговый score (title или context, 0-100 → 0-1)
- `resolution_method: str` ∈ {`explicit_id`, `title_match`, `context_match`, `recency`}
- `ambiguity: bool` (optional) — `True` если top-2 score отличаются менее чем на 10
- `created_at: str` (ISO 8601) — для tie-break

#### Scenario: Explicit ID short-circuit

WHEN `phrase` matches regex `^[A-Za-z0-9_-]{4,64}$` AND scenario JSON exists in any
of `data/scenarios/{draft,approved,rejected,rendered,published}/`,
THEN `resolve_scenario` SHALL return a single-element list with
`resolution_method='explicit_id'` and `confidence=1.0`, regardless of whether the
phrase looks like a title elsewhere.

#### Scenario: Title fuzzy match

WHEN `phrase` does not match the ID regex AND at least one scenario has
`fuzz.partial_ratio(phrase.lower(), title.lower()) >= 60`,
THEN candidates SHALL be ranked by `(confidence desc, created_at desc)` and
the top `limit` (default 5) SHALL be returned with
`resolution_method='title_match'`.

#### Scenario: Context fuzzy match (weighted 0.7x)

WHEN no title matches with score >= 60 but at least one scenario's `context`
(first 200 chars, lowercased) has `fuzz.partial_ratio(phrase.lower(), context) * 0.7 >= 60`,
THEN those scenarios SHALL be returned with
`resolution_method='context_match'` and the score already multiplied by 0.7.

#### Scenario: Recency fallback

WHEN `phrase.lower()` contains tokens `{"последний", "последняя", "последнее", "latest", "last"}`
AND no other match scored >= 60,
THEN the latest scenario by `created_at` among the requested status (default `rendered`)
SHALL be returned with `resolution_method='recency'` and `confidence=0.5`.

#### Scenario: Disambiguation flag

WHEN the top-2 candidates have `|confidence_a - confidence_b| < 10`,
THEN BOTH candidates SHALL have `ambiguity: true` in the returned dict, signalling
the UI to display a warning.

#### Scenario: Low-confidence filtering

WHEN all candidates have `confidence < 60` AND no recency fallback applies,
THEN `resolve_scenario` SHALL return an empty list.

### Requirement: COMMAND_COOKBOOK single source

`py.lib.aipult_client.COMMAND_COOKBOOK` SHALL be a `str` constant containing the
full system prompt from PRD §7.4, including:

- Инструкция резолвить сценарий по title (не по ID)
- 9 cached commands: restyle, render, revise, view, list, approve, publish, delete, stats
- Per-command: описание, синтаксис, пример, "когда использовать"
- Forbidden patterns секция
- Формат ответа (CommandCard JSON shape)

`COMMAND_COOKBOOK` SHALL be importable via
`from py.lib.aipult_client import COMMAND_COOKBOOK`
and SHALL NOT be duplicated in Node-side files (Node re-imports via subprocess).

#### Scenario: Cookbook import path

WHEN the Web route handler imports `py.lib.aipult_client`,
THEN it SHALL use the public `COMMAND_COOKBOOK` symbol only for
documentation/logging purposes; the actual LLM call is delegated to
`route_command()` so the cookbook string never leaves the Python process.

### Requirement: CommandCard routing

`py.lib.aipult_client.route_command(user_message, candidates, history=None)`
SHALL generate a `CommandCard` dict with these REQUIRED fields:

- `card_id: str` (UUID hex)
- `intent: str` ∈ `ALLOWED_INTENTS` (9 values from COMMAND_COOKBOOK)
- `command: str` — exact shell command to execute
- `explanation: str` (≤ 500 chars)
- `warnings: list[str]`
- `estimated_time: str` ("~2-5 сек" | "~1-2 мин")
- `estimated_cost: str` ("$0" | "~$0.05" | "~$0.10")
- `reversible: bool`
- `resolved_scenario: {id, title, status, confidence, resolution_method} | null`
- `related_artifacts: list[str]`

#### Scenario: Successful routing

WHEN the LLM returns a JSON object with valid `intent`, `scenario_id`, `command`,
THEN `route_command` SHALL enrich the response with the matching candidate's
`title` and `status`, set `card_id` to a new UUID, and return the full
`CommandCard`.

#### Scenario: Forbidden intent rejected

WHEN the LLM returns `intent` NOT in `ALLOWED_INTENTS`,
THEN `route_command` SHALL raise `AipultForbiddenIntent(intent)`.

#### Scenario: Hallucinated scenario ID rejected

WHEN the LLM returns `scenario_id` not in `candidates` AND
`resolution_method != 'explicit_id'`,
THEN `route_command` SHALL raise `AipultScenarioNotFound(scenario_id)`.

#### Scenario: Invalid JSON response

WHEN the LLM response cannot be parsed as JSON,
THEN `route_command` SHALL raise `AipultInvalidResponse(raw_excerpt)`.

#### Scenario: LLM unavailable

WHEN `MINIMAX_API_KEY` is not set OR the HTTP call fails after `tenacity` retries,
THEN `route_command` SHALL raise `AipultLlmUnavailable(reason)`.

### Requirement: No live side effects

`py.lib.scenario_resolver.resolve_scenario` and `py.lib.aipult_client.route_command`
SHALL NOT perform any of:

- Subprocess execution
- File writes outside `data/logs/`
- Telegram / Notion / site / social network calls
- HTTP calls other than MiniMax Text-01 endpoint

`py.lib.aipult_client` SHALL reuse `_call_minimax_chat` pattern from
`py/scenario/writer.py` without modification.

#### Scenario: No Telegram / Notion side effects

WHEN `route_command` is called with a legitimate `candidates` list,
THEN the call SHALL NOT POST to `api.telegram.org`, NOT call any Notion
endpoint, NOT touch `data/comics/` or `data/scenarios/`. The only network
call is to the MiniMax Text-01 endpoint (or to a mocked LLM in tests).
