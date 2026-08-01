## Purpose

Ensure that the single configured author can review, revise, approve, or reject scenarios before rendering through Telegram and dashboard controls.

## ADDED Requirements

### Requirement: Telegram review actions
The Telegram bot SHALL present approve, edit, and reject inline actions for draft scenarios to the configured chat ID only.

#### Scenario: Authorized author views a draft
- **WHEN** the configured author requests or receives a draft preview
- **THEN** the message includes approve, edit, and reject actions

#### Scenario: Unauthorized chat invokes an action
- **WHEN** a callback originates from a chat other than the configured author chat
- **THEN** the system rejects the action without changing scenario files

### Requirement: Approve transition
The system SHALL atomically move an approved draft to `data/scenarios/approved/`, set status to `approved`, and preserve its ID and history.

#### Scenario: Draft is approved
- **WHEN** the author activates approve for an existing draft
- **THEN** the scenario exists only in the approved queue with status `approved`

#### Scenario: Approval is repeated
- **WHEN** approve is invoked again for an already approved scenario
- **THEN** the system returns its current state without creating a duplicate

### Requirement: Reject transition
The system SHALL atomically move a rejected draft to `data/scenarios/rejected/`, set status to `rejected`, and not render it.

#### Scenario: Draft is rejected
- **WHEN** the author activates reject for an existing draft
- **THEN** the scenario exists in the rejected queue and cannot be selected by the renderer

### Requirement: Edit feedback
The system SHALL accept edit feedback, append it with a timestamp to the scenario feedback history, regenerate affected scenario content, and keep the scenario in `draft` status for another review.

#### Scenario: Author submits edit feedback
- **WHEN** the author provides non-empty feedback for a draft
- **THEN** feedback is retained, revised content is saved, and the draft remains unapproved

### Requirement: Pending command
The Telegram bot SHALL provide `/pending` to list all currently persisted draft scenarios.

#### Scenario: Pending drafts exist
- **WHEN** the author sends `/pending`
- **THEN** the bot returns identifiers and titles for every draft scenario

### Requirement: Direct scenario preview
The Telegram bot SHALL show a scenario preview and valid actions when the author sends an existing scenario ID.

#### Scenario: Existing ID is sent
- **WHEN** the author sends the ID of a draft scenario
- **THEN** the bot displays its title, style, tone, panel captions, and review actions

### Requirement: Approval API parity
The web API SHALL expose approve and reject operations with the same validation, authorization assumptions, and lifecycle transitions as Telegram actions.

#### Scenario: Dashboard approves a draft
- **WHEN** the dashboard sends a valid approval request
- **THEN** the scenario undergoes the same atomic draft-to-approved transition
