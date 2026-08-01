## Context

See `proposal.md` for motivation. The repository already contains Python ingestion/rendering modules, Node.js Telegram/web/publisher components, a vanilla dashboard, and shell orchestration. Filesystem JSON is the source of truth; external services are MiniMax, Telegram, Notion, a custom site, and optional social networks. The key safety constraint is that rendering must never occur without a persisted approval, and existing `data/archive/` content is immutable.

## Goals / Non-Goals

**Goals:**
- Stabilize the existing mixed Python/Node implementation rather than replace it.
- Centralize lifecycle invariants so Telegram, web, scripts, and cron cannot diverge.
- Make external effects bounded, retryable where safe, observable, and testable without live credentials.
- Preserve documented CLI entry points and on-disk compatibility.

**Non-Goals:**
- Introduce a database, queue service, frontend framework, or distributed deployment.
- Implement multi-user authorization, payments, video generation, or a marketplace.
- Fully productize optional social providers whose API details remain deployment-dependent.

## Decisions

### Filesystem JSON remains authoritative

Each lifecycle queue remains a directory, with one canonical scenario file per ID. State changes use write-to-temp, flush, and atomic rename/move within the project filesystem. Validation happens before mutation, and destination conflicts fail closed.

Alternative considered: SQLite would improve transactional querying but adds migration and synchronization complexity that is unnecessary for a single-author local MVP and conflicts with the PRD's human-readable storage goal.

### One lifecycle service contract across runtimes

Python orchestration and Node mutation handlers will apply the same transition matrix and record validation rules. Shared behavior is tested through fixture-based contract tests; small runtime-specific helpers are preferable to cross-language subprocess calls for every mutation. The approval-directory plus `status=approved` check is repeated immediately before the first render API request as a defense-in-depth gate.

Alternative considered: centralizing every mutation behind Express would remove duplication, but would make cron and CLI operation depend on a continuously running server.

### Side effects follow durable state checkpoints

Draft JSON is persisted before Telegram/Notion notification. Panel files are persisted before final assembly. Rendered state is committed only after the final PNG exists. Published state is committed only after the required site response succeeds. Archiving occurs only after publication. Optional mirror/notification failures are logged and do not roll back successful required work.

Alternative considered: distributed rollback is not reliable across external providers and could itself duplicate publications.

### Idempotency is state- and identity-based

Scenario ID selects canonical paths; seed controls generation parameters. Existing successful publication metadata prevents accidental reposting. Atomic destination checks prevent duplicate queue records and archive overwrite. Forced external replay, where exposed, must be explicit.

### External calls use a common reliability policy

Every HTTP call receives connect/read timeouts. Only transient transport errors, rate limits, and 5xx responses receive bounded exponential-backoff retries with jitter. Authentication, validation, quota-policy, and content-policy failures fail immediately. Logs redact known secret values and authorization headers.

### Nightly orchestration is sequential by scenario, parallel within rendering

The batch chooses deterministic oldest-first work and processes scenarios independently. Panel generation uses at most four workers, while scenario-level processing remains sequential to limit API pressure and simplify state recovery. A per-item failure is accumulated into the final summary rather than terminating the shell loop.

Alternative considered: parallel scenario processing reduces wall time but increases rate-limit pressure and complicates atomic lifecycle handling.

### API and UI stay dependency-light

Express serves filesystem-backed JSON endpoints and static assets. The vanilla dashboard polls every ten seconds and updates the selected tab. Mutation endpoints validate IDs and state and delegate to lifecycle helpers rather than moving files directly in route handlers.

### Verification uses mocks and temporary data roots

Python and Node tests use temporary directory trees and mock external clients. Tests assert that unapproved rendering makes zero provider calls, transitions remain atomic and idempotent, optional integrations no-op, nightly batches continue after failure, and logs redact credentials. Live-service checks remain opt-in.

## Risks / Trade-offs

- [Cross-language lifecycle logic can drift] → Define fixture-based contract cases and keep transition helpers small and explicit.
- [Filesystem atomicity may not hold across mounts] → Keep temporary and destination files under the same project data root and document local-filesystem operation.
- [A crash after external publication but before local commit can cause uncertainty] → Persist provider responses immediately, use scenario ID as an idempotency key where supported, and require explicit force for replay.
- [PRD performance targets depend on provider latency] → Parallelize panels, enforce timeouts, and report measured timing without treating provider outages as local success.
- [YouTube/Whisper dependencies are large and platform-sensitive] → Prefer subtitles and provide clear fallback dependency errors.
- [Existing implementation may partially satisfy tasks] → Audit and test before modifying; mark tasks complete only when acceptance behavior is demonstrated.

## Migration Plan

1. Add tests and shared validation/lifecycle helpers around current file formats.
2. Harden ingestion and scenario drafting without changing documented commands.
3. Route Telegram and web mutations through validated atomic transitions.
4. Add the renderer approval gate and deterministic artifact handling before other render enhancements.
5. Complete publication and nightly orchestration, initially exercising dry-run and mocked providers.
6. Verify dashboard behavior and run smoke, reliability, and security checks.
7. Enable real integrations one at a time through environment configuration.

Rollback consists of stopping bot/web/cron processes and restoring code; no destructive data migration is required. Existing queue JSON remains readable. Archive files are never used as rollback targets and are not modified.

## Open Questions

- The exact custom site API details beyond the PRD's JSON contract can be configured during deployment; adapter changes must preserve the publication requirement.
- Twitter/X and Mastodon activation remains optional until credentials and desired destinations are supplied.
