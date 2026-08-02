## 1. Testable Web Foundation

- [x] 1.1 Add `node:test` scripts to `web/package.json` and create temporary-data-root, fixture, fake-clock, fake-ID and fake-process-runner test helpers.
- [x] 1.2 Split production bootstrap into `web/server.js` and injectable `createApp()` in `web/app.js`, preserving `/ui` and `/comics` serving.
- [x] 1.3 Implement validated runtime configuration for host, port, data root, Python executable, remote security, process limits, job retention and shutdown grace.
- [x] 1.4 Add typed operational errors, request-ID middleware and a final JSON error handler including malformed JSON handling.
- [x] 1.5 Implement stdout plus daily file logger with redaction of tokens, authorization values, full content and absolute local paths.
- [x] 1.6 Add foundation tests proving app startup does not require a real port, live credentials or external network access.

## 2. Validation and Access Control

- [x] 2.1 Implement bounded validators and allowlists for scenario IDs, lifecycle status, content, image style, caption style, feedback, seed and render mode.
- [x] 2.2 Implement safe path resolution that rejects traversal and proves every scenario/job/artifact path remains inside its configured root.
- [x] 2.3 Implement local mode with loopback bind, same-origin API access and no wildcard CORS headers.
- [x] 2.4 Implement fail-closed remote mode requiring both bearer token and exact allowed origins before listen.
- [x] 2.5 Protect every remote `/api/*` route with origin and bearer middleware and return structured `401`/`403` errors without token leakage.
- [x] 2.6 Add a UI fetch wrapper that prompts for a remote token, stores it only in `sessionStorage` and handles structured authorization errors.
- [x] 2.7 Remove the `/scenarios` static route and implement safe scenario serializers that omit secrets, internal fields and absolute paths.
- [x] 2.8 Add access-control tests for loopback defaults, invalid remote config, allowed/disallowed origins, valid/invalid tokens and legacy static-path denial.

## 3. Scenario Store and Lifecycle

- [x] 3.1 Implement same-directory unique-temp atomic JSON writes with flush/fsync, destination conflict checks and cleanup on failure.
- [x] 3.2 Implement canonical scenario lookup across all five queues with duplicate-ID, malformed-record and directory/status mismatch detection.
- [x] 3.3 Implement deterministic list/detail operations that isolate malformed records, report `invalid_count` and return safe serialized data.
- [x] 3.4 Implement a per-scenario keyed lock and the canonical Node lifecycle transition matrix.
- [x] 3.5 Implement single-record approve/reject transitions using pending metadata plus atomic rename, including idempotent replay and fail-closed recovery.
- [x] 3.6 Add startup/read reconciliation for interrupted known transitions without creating duplicate active records.
- [x] 3.7 Move scenario list/detail/approve/reject routes onto the store and lifecycle helpers with documented `400`/`404`/`409` responses.
- [x] 3.8 Add contract tests for valid transitions, repeated actions, destination conflicts, concurrent requests, duplicate IDs, malformed JSON and interrupted transitions.

## 4. Safe Draft Creation and Process Runner

- [x] 4.1 Implement a shell-disabled process runner with argument arrays, configurable timeout, bounded stdout/stderr and explicit exit outcome.
- [x] 4.2 Add a machine-readable JSON result mode to `scripts/ingest_and_draft.py` so callers do not parse human-readable stdout for scenario IDs.
- [x] 4.3 Rebuild `POST /api/scenarios` with pre-execution validation, safe argument passing, timeout handling and `201` draft response.
- [x] 4.4 Ensure failed, timed-out or malformed ingest results do not claim draft creation and return safe structured errors.
- [x] 4.5 Add tests for whitespace content, unsupported styles, oversized payloads, shell syntax as data, timeout, non-zero exit and successful draft creation.

## 5. Durable Render Jobs and Rerender

- [x] 5.1 Implement atomic persisted job records under `data/jobs/` with queued/running/succeeded/failed/interrupted states and request correlation.
- [x] 5.2 Implement job manager deduplication so one scenario cannot have multiple queued/running render jobs.
- [x] 5.3 Add job list/detail API needed to poll safe status, timestamps, result and error summaries.
- [x] 5.4 Rebuild render route to allow initial render only from `approved`, require explicit rerender for `rendered`, and reject draft/rejected/published before process launch.
- [x] 5.5 Make `scripts/render_approved.py` return non-zero on any requested render failure and provide a machine-readable result summary.
- [x] 5.6 Reinstate the approved-directory plus `status=approved` defense-in-depth check immediately before every initial provider request.
- [x] 5.7 Add renderer support for job-specific staging output, explicit rerender mode and seed override without reusing existing panels.
- [x] 5.8 Implement verified staging promotion with backup/rollback so failed rerender preserves the current rendered comic and successful rerender increments `render_revision`.
- [x] 5.9 Mark persisted queued/running jobs interrupted on restart without automatically replaying paid render work.
- [x] 5.10 Add mocked tests for render policy, duplicate jobs, timeout/exit failure, restart interruption, staging rollback, successful promotion and published immutability.

## 6. Seed, Feedback and Delete Operations

- [x] 6.1 Rebuild seed mutation with strict integer/range validation, allowing standalone changes only for draft/approved and rerender-bound changes for rendered.
- [x] 6.2 Rebuild feedback mutation as a bounded timestamped revision request that returns `feedback_recorded`, blocks published and never claims prompts were regenerated.
- [x] 6.3 Update Web UI wording from completed editing to recorded revision request until `scenario-revision-and-remix` is implemented.
- [x] 6.4 Implement delete planning and explicit confirmation for mutable statuses while rejecting published deletion before artifact mutation.
- [x] 6.5 Implement staged trash manifests, rollback/recovery and cleanup for scenario, panel, final and raw artifacts without reading or changing `data/archive/`.
- [x] 6.6 Add tests for invalid seeds, rendered seed drift prevention, published feedback/delete rejection, missing confirmation, complete delete, partial failure and archive immutability.

## 7. Observability, Readiness and Shutdown

- [x] 7.1 Instrument every API operation with request ID, scenario ID when present, operation, duration and outcome in stdout and daily logs.
- [x] 7.2 Implement `/api/health` as liveness and `/api/ready` as data-root, write-capability, Python-executable and security-config readiness without provider calls.
- [x] 7.3 Implement deterministic startup diagnostics that report host, port, mode and safe readiness information without secrets.
- [x] 7.4 Implement graceful `SIGINT`/`SIGTERM`: stop new mutations, wait a bounded grace period, terminate remaining children and persist interrupted jobs.
- [x] 7.5 Implement bounded retention cleanup for terminal jobs, staging and trash leftovers while never deleting active jobs or archive content.
- [x] 7.6 Add tests for request correlation, redaction, malformed JSON recovery, liveness/readiness separation, invalid startup config and shutdown during render.

## 8. Integration and Security Verification

- [x] 8.1 Add endpoint integration tests covering scenario create/list/detail/approve/reject/render/seed/feedback/delete/comics/jobs/health/ready success and error contracts.
- [x] 8.2 Add path traversal tests for IDs, status queries, encoded separators and resolved artifact paths with zero out-of-root filesystem access.
- [x] 8.3 Add command-injection tests for content, styles and IDs proving no extra executable or shell command is invoked.
- [x] 8.4 Add lifecycle fixtures shared by route/store tests and document the remaining Telegram/Python parity follow-up.
- [x] 8.5 Run the complete Web suite repeatedly against temporary roots and verify it requires no MiniMax, Telegram, Notion, site or social credentials.
- [x] 8.6 Run Node syntax checks and Python compile/tests for modified orchestration scripts and record the verification summary in the change.

## 9. Cleanup and Documentation

- [x] 9.1 Remove unused helpers and dependencies from the old monolithic server, including unused `multer` if no route requires it.
- [x] 9.2 Add `.env.example` entries and comments for local/remote Web settings, Python executable, process limits and job retention without real secrets.
- [x] 9.3 Add API documentation for authentication modes, request/response schemas, job polling, lifecycle restrictions, error codes and breaking route changes.
- [x] 9.4 Update `CLAUDE.md`, README, `ALGORITM.md`, architecture/workflow docs and UI help for authorized Web approval, published immutability and transitional feedback semantics.
- [x] 9.5 Update `CHANGELOG.md`, reconcile task checkboxes with demonstrated behavior and run strict OpenSpec validation before requesting fixation.
- [x] 9.6 Record `scenario-revision-and-remix` as the required follow-up for LLM regeneration and published remix without implementing it in this change.
