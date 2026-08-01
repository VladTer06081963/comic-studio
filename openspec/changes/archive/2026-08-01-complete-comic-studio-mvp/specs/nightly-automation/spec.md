## Purpose

Operate the approved comic queue on a nightly schedule with bounded batches, failure isolation, durable archives, and actionable author notifications.

## ADDED Requirements

### Requirement: Nightly schedule
The project SHALL provide a nightly entry point suitable for execution at `0 2 * * *` and a dry-run mode that reports planned work without rendering, publishing, moving, or archiving files.

#### Scenario: Dry run is requested
- **WHEN** the nightly command is invoked with `--dry-run`
- **THEN** it lists selected scenario IDs and intended actions without side effects

### Requirement: Configurable batch selection
The nightly process SHALL select at most `CRON_BATCH_SIZE` approved scenarios, defaulting to three, in deterministic oldest-first order.

#### Scenario: More approved items exist than the batch size
- **WHEN** five scenarios are approved and the batch size is three
- **THEN** only the three oldest approved scenarios are selected

### Requirement: End-to-end batch processing
For each selected scenario, the nightly process SHALL render, publish, archive, and report the result in that order.

#### Scenario: Item completes successfully
- **WHEN** rendering and required publication succeed
- **THEN** the scenario and associated comic artifacts are copied or moved to `data/archive/<date>/` without modifying prior archive contents

### Requirement: Failure isolation
A failure processing one scenario SHALL not prevent remaining selected scenarios from being processed.

#### Scenario: One item fails rendering
- **WHEN** the first selected scenario fails and later scenarios are valid
- **THEN** the failure is recorded and processing continues with every later selected scenario

### Requirement: Nightly summary
The nightly process SHALL send the configured Telegram chat a summary containing counts and identifiers for successful, failed, and skipped scenarios.

#### Scenario: Mixed-result batch completes
- **WHEN** a batch contains successful and failed items
- **THEN** one summary clearly reports both outcomes

### Requirement: Archive immutability
The nightly process MUST NOT alter or delete files already present under `data/archive/`.

#### Scenario: Archive target already exists
- **WHEN** an archive operation would overwrite an existing file
- **THEN** the operation fails for that item and leaves the existing archive file unchanged

### Requirement: Safe interruption recovery
The nightly process SHALL use lifecycle state and atomic persistence so interruption does not cause a scenario to be falsely marked rendered, published, or archived.

#### Scenario: Process is terminated during rendering
- **WHEN** the nightly process stops before final assembly and state commit
- **THEN** the scenario remains eligible for a safe retry from its last completed lifecycle state
