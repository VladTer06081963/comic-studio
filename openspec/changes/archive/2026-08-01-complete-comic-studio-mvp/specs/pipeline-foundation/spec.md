## Purpose

Define shared lifecycle, configuration, security, observability, reliability, and compatibility guarantees for every stage of the Comic Studio pipeline.

## ADDED Requirements

### Requirement: Canonical scenario lifecycle
The system SHALL recognize only `draft`, `approved`, `rejected`, `rendered`, and `published` scenario states and SHALL enforce transitions defined by the approval, rendering, and publication capabilities.

#### Scenario: Invalid transition is requested
- **WHEN** an operation attempts to bypass a required lifecycle state
- **THEN** the operation is rejected without changing the persisted scenario

### Requirement: Atomic state persistence
Lifecycle operations SHALL write complete JSON records atomically and SHALL avoid leaving one scenario active in multiple lifecycle queues.

#### Scenario: State write is interrupted
- **WHEN** a process terminates during persistence
- **THEN** readers observe either the previous complete state or the next complete state, not partial JSON

### Requirement: Environment-based secrets
API keys and tokens MUST be loaded from environment variables or ignored local environment files, MUST NOT be committed, and MUST NOT be emitted to logs or API responses.

#### Scenario: Error contains request context
- **WHEN** an external API request fails
- **THEN** logged diagnostics omit authorization credentials and secret values

### Requirement: Optional integrations degrade gracefully
Notion and social integrations SHALL be skipped when unconfigured, while required integrations for the invoked operation SHALL produce clear configuration errors.

#### Scenario: Optional token is absent
- **WHEN** an operation reaches an unconfigured optional integration
- **THEN** it records a skip and preserves successful core pipeline work

### Requirement: Unified logging
Every CLI, bot, web mutation, publisher, and cron stage SHALL log timestamp, severity, component name, scenario ID when applicable, operation, and outcome to stdout and `data/logs/<YYYY-MM-DD>.log`.

#### Scenario: Scenario changes state
- **WHEN** an approval, render, or publication transition succeeds or fails
- **THEN** a corresponding structured, human-readable log entry is written without secrets

### Requirement: External call reliability
All external network calls SHALL have finite timeouts, and retryable failures SHALL use bounded exponential backoff without retrying permanent authentication or policy errors.

#### Scenario: Provider returns transient server errors
- **WHEN** a provider returns a retryable 5xx response
- **THEN** the call is retried within configured limits and the final outcome is logged

### Requirement: Stable command interfaces
The project SHALL provide working help or syntax validation for the documented ingest, render, publish, web, bot, and nightly entry points.

#### Scenario: Python ingest help is requested
- **WHEN** `python scripts/ingest_and_draft.py --help` is executed in a configured environment
- **THEN** usage information is shown without initiating ingestion

#### Scenario: Nightly shell is checked
- **WHEN** `bash -n cron/nightly.sh` is executed
- **THEN** syntax validation completes successfully

### Requirement: Single-author scope
Mutating Telegram operations MUST be limited to chat ID `1045621572` by default, with an environment override allowed for deployment configuration.

#### Scenario: Default chat configuration is used
- **WHEN** no Telegram chat override is present
- **THEN** review and mutation messages target chat ID `1045621572`

### Requirement: Immutable archive boundary
Application modules MUST treat existing content under `data/archive/` as read-only.

#### Scenario: Normal pipeline scans historical work
- **WHEN** archived records are read for reporting or duplicate detection
- **THEN** no archive file is modified or deleted

### Requirement: Automated verification
The project SHALL include repeatable tests or smoke checks for lifecycle gating, atomic transitions, malformed inputs, optional-integration behavior, nightly failure isolation, API responses, and secret redaction.

#### Scenario: Verification suite runs without live credentials
- **WHEN** automated tests run with external services mocked or disabled
- **THEN** core pipeline behavior can be validated without real API keys or network publication
