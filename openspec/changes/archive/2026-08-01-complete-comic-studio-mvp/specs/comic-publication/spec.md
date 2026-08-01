## Purpose

Publish completed comic PNG files to configured destinations and retain enough metadata to identify and audit each publication.

## ADDED Requirements

### Requirement: Rendered-only publication
The publisher MUST accept only scenarios with status `rendered` and a readable final comic PNG.

#### Scenario: Unrendered scenario is requested
- **WHEN** publication is requested for a scenario without rendered status or a final PNG
- **THEN** publication is rejected before contacting any destination

### Requirement: Site publication
The publisher SHALL POST the title, base64-encoded PNG, and scenario metadata as JSON to `SITE_API_URL`, and SHALL include bearer authorization when `SITE_API_KEY` is configured.

#### Scenario: Site accepts publication
- **WHEN** the configured site returns a successful response containing a URL
- **THEN** the publisher records and returns that publication URL

#### Scenario: Site rejects publication
- **WHEN** the configured site returns a non-success response
- **THEN** the scenario remains rendered and the failure is logged without claiming publication

### Requirement: Optional social publication
The publisher SHALL attempt Twitter/X and Mastodon publication only when each provider's required configuration is present, and SHALL otherwise skip that provider without failing site publication.

#### Scenario: Social provider is unconfigured
- **WHEN** site publication succeeds and a social provider lacks credentials
- **THEN** that provider is reported as skipped and the pipeline continues

### Requirement: Publication state
After required publication succeeds, the system SHALL update status to `published`, record an ISO-8601 publication timestamp, retain destination URLs, and persist the scenario atomically.

#### Scenario: Required destinations succeed
- **WHEN** the site publication completes successfully
- **THEN** the scenario is persisted with published status, timestamp, and URL

### Requirement: Notion comic mirror
The system SHALL mirror published comic metadata to the configured Notion comics database and SHALL treat missing Notion configuration as a no-op.

#### Scenario: Notion mirror is configured
- **WHEN** publication succeeds and valid Notion configuration exists
- **THEN** a comic record is created or updated and its page ID is retained

### Requirement: Publication idempotency
The system SHALL avoid re-posting a scenario that already records a successful publication unless the author explicitly requests a forced retry.

#### Scenario: Published scenario is processed again
- **WHEN** the normal publisher encounters a scenario with published status and a recorded destination URL
- **THEN** it returns the prior publication result without submitting duplicate content
