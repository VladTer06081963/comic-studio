# web-aipult-chat

## Purpose

Express endpoints для AiPULT chat panel. Принимает user message, вызывает
Python `route_command` через subprocess, валидирует результат и возвращает
`CommandCard` JSON. Web-side resolver (`web/lib/aipult/resolver.js`) даёт
быстрый pre-filter для fuzzy match без subprocess overhead.

## ADDED Requirements

### Requirement: Resolve endpoint

`POST /api/aipult/resolve` SHALL принимать JSON body:

```json
{ "phrase": "поменяй стиль у кота на gothic" }
```

`phrase` SHALL be a non-empty trimmed string, max 500 characters (validated via
`web/lib/validation.js#boundedText` with `code: 'INVALID_PHRASE'`).

Response 200:

```json
{
  "candidates": [
    { "id": "8eaa57cc", "title": "Кот в одиночестве", "status": "rendered",
      "confidence": 0.95, "resolution_method": "title_match", "ambiguity": false,
      "created_at": "2026-08-02T22:45:00.136510" }
  ],
  "request_id": "<uuid>"
}
```

Response 400 if `phrase` invalid (`INVALID_PHRASE`).
Response 500 with `code: 'INTERNAL_ERROR'` on unexpected errors.

The endpoint SHALL call `web/lib/aipult/resolver.js#resolveScenario` and
SHALL NOT call Python subprocess (resolver is pure Node).

#### Scenario: Resolve returns ranked candidates

WHEN `phrase="кот"` and `data/scenarios/published/8eaa57cc.json` has
`title="Кот в одиночестве"`,
THEN the endpoint SHALL return 200 with a candidates array containing
`{id: "8eaa57cc", title: "Кот в одиночестве", confidence >= 0.6,
resolution_method: "title_match"}`.

### Requirement: Chat endpoint

`POST /api/aipult/chat` SHALL принимать JSON body:

```json
{
  "message": "поменяй стиль у кота на gothic",
  "history": [ { "role": "user|assistant|system", "content": "..." } ]
}
```

- `message` SHALL be a non-empty trimmed string, max 1000 chars.
- `history` SHALL be an array of ≤ 20 entries (validated via
  `web/lib/validation.js#boundedText` with `code: 'INVALID_MESSAGE'` and
  `code: 'INVALID_HISTORY'`).

Response 200:

```json
{
  "card": {
    "card_id": "<uuid>",
    "intent": "restyle",
    "command": "python3 scripts/restyle.py --scenario-id 8eaa57cc --style gothic",
    "explanation": "Сменит стиль баблов «Кот в одиночестве» с bubble на gothic",
    "warnings": [],
    "estimated_time": "2-5 сек",
    "estimated_cost": "$0",
    "reversible": true,
    "resolved_scenario": {
      "id": "8eaa57cc", "title": "Кот в одиночестве", "status": "rendered",
      "confidence": 0.95, "resolution_method": "title_match"
    },
    "related_artifacts": ["data/comics/8eaa57cc.png", "data/comics/8eaa57cc.html"]
  },
  "request_id": "<uuid>"
}
```

#### Scenario: Resolved scenario has title

WHEN `route_command` returns a card with `resolved_scenario`,
THEN the response SHALL include the candidate's `title` and `status` so the UI
can display the title (primary) and ID (secondary) for visual verification
(PRD §2.1).

#### Scenario: Empty candidates

WHEN the resolver returns `candidates: []`,
THEN the endpoint SHALL return 200 with `{card: null, message: "No matching scenarios found", request_id}`
and SHALL NOT call `route_command` (no point in calling LLM without context).

#### Scenario: Multiple candidates (disambiguation)

WHEN the resolver returns 2+ candidates with `ambiguity: true`,
THEN the endpoint SHALL return 200 with `{candidates: [...], disambiguation: true, request_id}`
and SHALL NOT call `route_command` (UI asks user to pick first).

#### Scenario: LLM error

WHEN `route_command` raises `AipultLlmUnavailable`,
THEN the endpoint SHALL return 503 with `code: 'LLM_UNAVAILABLE'`.

WHEN `route_command` raises `AipultInvalidResponse` or
`AipultForbiddenIntent` or `AipultScenarioNotFound`,
THEN the endpoint SHALL return 502 with the corresponding `code`.

#### Scenario: Subprocess timeout

WHEN the Python subprocess (calling `route_command`) exceeds
`config.aipultTimeoutMs` (default 30_000ms),
THEN the endpoint SHALL return 504 with `code: 'AIPULT_TIMEOUT'`.

The endpoint SHALL log an audit entry per call:
`aipult.chat.requested` and `aipult.chat.{succeeded|failed}` with
`request_id`, `message_preview` (first 100 chars), `card_id`, `intent`.

### Requirement: List recent endpoint

`GET /api/aipult/list?status=rendered&limit=10` SHALL return
`Array<{id, title, status, created_at}>` sorted by `created_at` desc,
max 50 entries. `status` defaults to `all` (all states).

This is the "discovery" endpoint for US-2 (PRD §4.2).

#### Scenario: List respects status filter

WHEN `GET /api/aipult/list?status=rendered&limit=5` is called and there are
20 scenarios across all statuses (5 rendered, 15 published),
THEN the response SHALL contain exactly 5 items, all with `status="rendered"`,
sorted by `created_at` descending.

### Requirement: Backward compatibility

The endpoint SHALL NOT modify, delete, or re-render any existing scenario.
It is purely **advisory** — card generation only, no execution.

#### Scenario: No mutation from chat endpoint

WHEN `/api/aipult/chat` is called 10 times with valid messages,
THEN `data/scenarios/` SHALL have the same number of files before and after
the calls (no drafts created, no approvals changed, no renders triggered).
