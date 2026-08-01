## Purpose

Transform normalized source material into valid, reproducible comic scenario records that can be reviewed before any image generation occurs.

## ADDED Requirements

### Requirement: Structured scenario generation
The system SHALL generate a JSON scenario containing `id`, `created_at`, `status`, `source`, `title`, `panels`, `style`, `layout`, `aspect_ratio`, and `seed` from supplied context.

#### Scenario: Scenario generation succeeds
- **WHEN** valid normalized context and author options are supplied
- **THEN** the system returns a schema-valid scenario with status `draft`

#### Scenario: Model returns invalid output
- **WHEN** the model response cannot be validated as a scenario
- **THEN** the system reports an actionable error and does not persist an invalid draft

### Requirement: Configurable panel count
The system SHALL support scenarios with three or four panels according to the author-selected panel count.

#### Scenario: Four panels requested
- **WHEN** the author requests four panels
- **THEN** the resulting scenario contains exactly four uniquely numbered panels

### Requirement: Image prompts and captions
Each panel SHALL contain an English image prompt no longer than 1,500 characters and a caption no longer than six words.

#### Scenario: Generated panel content is accepted
- **WHEN** a scenario is persisted
- **THEN** every panel prompt and caption satisfies its language and length constraints

### Requirement: Draft persistence
The system SHALL persist each valid scenario atomically at `data/scenarios/draft/<id>.json` without overwriting a different scenario.

#### Scenario: Draft is created
- **WHEN** generation produces a valid scenario
- **THEN** one readable JSON file exists in the draft queue using the scenario ID

### Requirement: Draft notification
The system SHALL send the configured author a Telegram review message containing the scenario identity, summary, and approval actions after a draft is persisted.

#### Scenario: Draft enters review
- **WHEN** a draft is successfully saved and Telegram is configured
- **THEN** the configured chat receives a review message with approve, edit, and reject actions

### Requirement: Optional Notion scenario mirror
The system SHALL mirror a created scenario to the configured Notion scenarios database and SHALL treat missing Notion configuration as a successful no-op.

#### Scenario: Notion is not configured
- **WHEN** a draft is created without a Notion token or database ID
- **THEN** the draft pipeline completes without a Notion error

### Requirement: Reproducible scenario identity
The system SHALL preserve an explicitly supplied scenario ID and seed so repeated orchestration can identify and reproduce the same work item.

#### Scenario: Explicit seed is supplied
- **WHEN** the author supplies a seed during drafting
- **THEN** that seed is stored unchanged in the scenario
