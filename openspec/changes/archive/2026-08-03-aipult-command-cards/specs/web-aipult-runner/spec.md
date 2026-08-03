# web-aipult-runner

## Purpose

Whitelisted subprocess execution для AiPULT cards. Re-validates intent
(defense-in-depth), enforces timeout, captures stdout/stderr, emits
structured audit log. **AI never auto-executes** — execution only via
explicit `POST /api/aipult/execute` with `card_id`.

## ADDED Requirements

### Requirement: Whitelist enforcement

`web/lib/aipult/validator.js#ALLOWED_INTENTS` SHALL be a frozen array:

```js
['restyle', 'render', 'revise', 'view', 'list', 'approve', 'publish', 'delete', 'stats']
```

`web/lib/aipult/runner.js#AipultRunner.execute(card, ...)` SHALL re-check
`card.intent ∈ ALLOWED_INTENTS` immediately before subprocess spawn and
SHALL throw `AipultForbiddenIntent` if not. This is defense-in-depth:
even if the validator is bypassed (e.g. by direct `runner.execute()` call),
the runner enforces the whitelist.

#### Scenario: Reject non-whitelisted intent

WHEN `AipultRunner.execute({ intent: "rm", command: "rm -rf /", ... })`
is called,
THEN the runner SHALL throw `AipultForbiddenIntent("rm")` BEFORE any
subprocess spawn. The test asserts no child process is created.

### Requirement: Forbidden patterns

`web/lib/aipult/validator.js#FORBIDDEN_PATTERNS` SHALL be a frozen array of
regexes (each MUST be tested in unit tests):

- `/rm\s+-rf\s+\//` — recursive root delete
- `/\$\(.+\)/` — command substitution
- `/\|\s*(?:sh|bash)\b/` — pipe to shell
- `/\b(?:api[_-]?key|token|secret)\s*[:=]\s*\S+/i` — secret leakage
- `/\.env\b/` — accessing .env
- `/(?<![A-Za-z0-9_])\.\.(?:\/|\\)/` — relative parent traversal

`validateCommandString(command)` SHALL iterate over `FORBIDDEN_PATTERNS` and
throw `AipultForbiddenCommand(matchedPattern)` on the first match.

#### Scenario: rm -rf / rejected

WHEN `validateCommandString("rm -rf /")` is called,
THEN the function SHALL throw `AipultForbiddenCommand` with the matched
pattern `/rm\s+-rf\s+\//`.

### Requirement: Scenario ID validation

`validateScenarioId(id)` SHALL delegate to
`web/lib/validation.js#scenarioId` (regex `^[A-Za-z0-9_-]{4,64}$`) and
throw `AipultInvalidScenarioId` (mapped to `INVALID_SCENARIO_ID`) on failure.

This is the same regex used by the rest of the Web API; the runner does
NOT introduce a new ID format.

#### Scenario: Reject malformed scenario ID

WHEN `validateScenarioId("../etc/passwd")` is called,
THEN the function SHALL throw `AipultInvalidScenarioId` with the same
`code: 'INVALID_SCENARIO_ID'` as the rest of the Web API.

### Requirement: Subprocess execution

`AipultRunner.execute(card, { requestId, timeoutMs })` SHALL:

1. Validate `card.intent ∈ ALLOWED_INTENTS` (throw on mismatch).
2. Validate `card.command` against `FORBIDDEN_PATTERNS` (throw on match).
3. Extract `card.scenario_id` if present; validate via
   `validateScenarioId` (throw on mismatch).
4. Call existing `ProcessRunner.run(config.pythonBin, args, { cwd,
   timeoutMs: config.aipultTimeoutMs, outputLimit, requestId,
   operation: 'aipult.execute' })`.
5. Return `{ exitCode, stdout, stderr, durationMs }` on success.
6. On `PROCESS_TIMEOUT` or `PROCESS_FAILED`, re-throw the `AppError` so
   the route handler can map to HTTP status.

The `args` array SHALL be built explicitly from `card.intent` and
`card.scenario_id` (NOT by `shell: true` parsing of `card.command`).
For Phase 1, the runner only accepts `restyle` and `revise` intents
for execution (`render`, `publish`, `delete` deferred to later phases
or kept advisory-only).

#### Scenario: restyle intent

WHEN `card.intent === 'restyle'` AND `card.command` matches
`^python3? scripts/restyle\.py --scenario-id [A-Za-z0-9_-]{4,64} --style (bubble|star|gothic|boom|memo|bar)$`,
THEN execute and return exit code.

#### Scenario: revise intent

WHEN `card.intent === 'revise'` AND the scenario exists in
`approved` or `rendered` status,
THEN execute `python3 scripts/revise_scenario.py --scenario-id <ID> --feedback-file <tmp>`.
(Feedback text is read from the card's `explanation`, not logged in audit.)

### Requirement: Audit log

`AipultRunner.execute()` SHALL append a single JSON line to
`data/logs/aipult-YYYY-MM-DD.log` after execution completes (success OR
failure), with these fields:

```json
{
  "ts": "2026-08-03T01:23:45.678Z",
  "level": "INFO|WARN|ERROR",
  "component": "aipult.runner",
  "event": "execution.completed",
  "request_id": "<uuid>",
  "card_id": "<uuid>",
  "intent": "restyle",
  "scenario_id": "8eaa57cc",
  "command_executed": "python3 scripts/restyle.py --scenario-id 8eaa57cc --style gothic",
  "exit_code": 0,
  "duration_ms": 1234,
  "stdout_length": 256,
  "stderr_length": 0
}
```

#### Scenario: No feedback text in audit

The audit entry SHALL NOT include `card.explanation` text or any field
that could contain user feedback / revision text. Privacy: PRD NFR-5.

### Requirement: Execute endpoint

`POST /api/aipult/execute` SHALL принимать JSON body:

```json
{
  "card_id": "<uuid>",
  "command": "python3 scripts/restyle.py --scenario-id 8eaa57cc --style gothic"
}
```

- `card_id` SHALL be a non-empty string ≤ 128 chars
  (validated via `web/lib/validation.js#boundedText`).
- `command` SHALL be a non-empty string ≤ 2000 chars.

Response 200:

```json
{
  "ok": true,
  "exit_code": 0,
  "stdout": "...",
  "stderr": "",
  "duration_ms": 1234,
  "card_id": "<uuid>",
  "request_id": "<uuid>"
}
```

#### Scenario: Re-validate command

WHEN the client provides `command` in the body,
THEN the endpoint SHALL re-run `validateCommandString(command)` against
`FORBIDDEN_PATTERNS` before execution. This is a third layer of defense
(after card validator and runner whitelist).

#### Scenario: Forbidden command rejected

WHEN `command` matches any `FORBIDDEN_PATTERNS`,
THEN the endpoint SHALL return 400 with `code: 'AIPULT_FORBIDDEN_COMMAND'`
and SHALL NOT execute the subprocess.

#### Scenario: Timeout reported

WHEN the subprocess exceeds `config.aipultTimeoutMs`,
THEN the endpoint SHALL return 504 with `code: 'AIPULT_TIMEOUT'`
and the audit log entry SHALL have `exit_code: -1, level: 'WARN'`.

### Requirement: No secrets in logs

`runner.js` SHALL sanitize the `command_executed` field before writing to
audit log, replacing any string matching `/(?:api[_-]?key|token|secret)\s*[:=]\s*\S+/i`
with `<redacted>`. The actual subprocess execution is unaffected
(forbidden patterns would have rejected it earlier).

#### Scenario: Sanitized command in audit

WHEN a card has `command="python3 --api-key=abc123 script.py"` (which
would normally be rejected by `validateCommandString`),
THEN the audit log entry SHALL contain
`command_executed="python3 --api-key=<redacted> script.py"`.
