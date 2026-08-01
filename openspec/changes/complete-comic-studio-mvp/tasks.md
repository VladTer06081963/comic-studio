## 1. Foundation and Lifecycle Safety

- [ ] 1.1 Audit the current Python and Node entry points against the specs and add isolated Python/Node test harnesses with temporary data roots and mocked external services
- [x] 1.2 Implement scenario schema validation and canonical lifecycle transition rules in both runtimes, including rejection of invalid state skips
- [x] 1.3 Implement atomic JSON writes and conflict-safe queue moves so one scenario cannot remain active in multiple lifecycle directories
- [x] 1.4 Standardize environment configuration, daily stdout/file logging, scenario operation context, and secret redaction across Python and Node components
- [x] 1.5 Add finite timeouts and bounded exponential-backoff retry helpers that distinguish transient failures from authentication, validation, quota-policy, and content-policy errors

## 2. Context Ingestion

- [x] 2.1 Complete URL ingestion to prefer article/main content, strip non-content elements, normalize text, and report bounded retry failures
- [x] 2.2 Complete YouTube ingestion with subtitle preference, Whisper fallback, clear dependency errors, and a 30,000-character transcript bound
- [x] 2.3 Complete freeform ingestion with non-empty validation, timestamped Markdown persistence, and idempotent artifact handling
- [x] 2.4 Enforce the 8,000-character drafting bound while preserving source metadata and add ingestion unit tests for long, empty, and transiently failing sources

## 3. Scenario Drafting

- [ ] 3.1 Harden scenario generation and validation for required fields, three-or-four panel counts, English prompts, 1,500-character prompt limits, and six-word captions
- [x] 3.2 Preserve explicit IDs and seeds and atomically persist valid scenarios to the draft queue without overwriting another scenario
- [x] 3.3 Send configured Telegram review notifications only after draft persistence and make Notion scenario sync a logged no-op when unconfigured
- [ ] 3.4 Add mocked tests for valid generation, malformed model output, panel constraints, deterministic identity, notification ordering, and optional Notion behavior

## 4. Approval Workflows

- [x] 4.1 Refactor Telegram approve and reject callbacks to enforce chat authorization and use idempotent atomic lifecycle transitions
- [ ] 4.2 Implement Telegram edit mode and `/edit` feedback flow with timestamped history, content regeneration, and draft re-review
- [x] 4.3 Complete `/pending` and direct-ID preview behavior with titles, metadata, captions, and valid inline actions
- [x] 4.4 Route Express approve and reject endpoints through equivalent validation and transition helpers with clear HTTP error responses
- [ ] 4.5 Add contract tests covering authorized and unauthorized actions, repeated approval, reject exclusion, edit history, missing IDs, and Telegram/web transition parity

## 5. Approved Comic Rendering

- [x] 5.1 Enforce the approved-directory and `status=approved` gate immediately before any image API request and test that unapproved inputs make zero provider calls
- [x] 5.2 Make render parameters and canonical output paths deterministic from scenario ID and seed, including safe retries of partially completed work
- [x] 5.3 Generate up to four panels concurrently with ordered results, persist each panel artifact, and pass one supplied character reference to every panel request
- [x] 5.4 Complete final PNG assembly for comic/grid layouts and all six caption styles, with validation of readable inputs and outputs
- [x] 5.5 Commit the rendered transition only after successful assembly and retain approved state after any panel or assembly failure
- [ ] 5.6 Add mocked integration and timing tests for parallelism, ordering, seed propagation, character references, failure recovery, and the normal-latency 90-second target

## 6. Publication

- [x] 6.1 Validate rendered status and final PNG before publication and implement the configured site JSON/base64 POST with optional bearer authorization
- [x] 6.2 Record successful site URLs, published timestamps, and published state atomically while preserving rendered state on site failure
- [x] 6.3 Implement duplicate-publication protection and an explicit force-retry path using scenario identity and prior publication metadata
- [x] 6.4 Keep Twitter/X, Mastodon, and Notion comic publishing optional, reporting configured outcomes and graceful skips without undoing required site success
- [ ] 6.5 Add mocked publisher tests for success, HTTP failure, missing image, optional providers, secret redaction, and idempotent replay

## 7. Nightly Automation and Archive

- [x] 7.1 Add `--dry-run` to the nightly entry point and select `CRON_BATCH_SIZE` approved scenarios in deterministic oldest-first order with a default of three
- [x] 7.2 Process each selected scenario through render, publish, and archive independently so one failure cannot stop later items
- [x] 7.3 Implement non-overwriting dated archive writes and interruption-safe checkpoints without modifying any existing archive content
- [x] 7.4 Send one Telegram nightly summary containing successful, failed, and skipped counts and scenario IDs
- [ ] 7.5 Add shell and mocked integration tests for syntax, dry-run side-effect freedom, batch ordering, failure isolation, archive conflicts, and interruption recovery

## 8. Web API and Dashboard

- [x] 8.1 Harden filesystem-backed scenario and comic APIs to return validated lifecycle data and safe image paths at the documented server routes
- [x] 8.2 Complete the four dashboard views and draft cards with required metadata, captions, approve/reject controls, and post-mutation refresh
- [x] 8.3 Complete final comic previews, ten-second polling without duplicate cards, selected-tab preservation, and responsive mobile layout
- [ ] 8.4 Add API and browser-level smoke tests for dashboard loading, lifecycle filtering, mutations, image previews, polling updates, console errors, and narrow viewports

## 9. End-to-End Verification and Documentation

- [x] 9.1 Verify documented CLI help, config diagnostics, Express startup, Telegram startup with mocked API, and nightly shell syntax without live credentials
- [ ] 9.2 Add an end-to-end mocked test for URL/freeform ingest through draft, approval, render, publication, and archive, including persisted status and paths at every checkpoint
- [ ] 9.3 Add reliability tests for malformed JSON, empty context, timeout/retry exhaustion, kill/interruption boundaries, one-item batch failure, and no secret leakage
- [ ] 9.4 Update README and workflow documentation with setup, environment variables, cron schedule, dry-run usage, approval gate, recovery procedures, and optional-integration behavior
- [ ] 9.5 Run the complete automated suite and strict OpenSpec validation, recording any live-provider performance and cost checks as opt-in deployment verification
