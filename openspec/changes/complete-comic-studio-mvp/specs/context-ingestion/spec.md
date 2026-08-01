## Purpose

Provide reliable extraction and normalization of source material so authors can start a comic from a web page, YouTube video, or freeform idea.

## ADDED Requirements

### Requirement: Web context ingestion
The system SHALL accept an HTTP or HTTPS URL, prefer meaningful article or main-page content, remove non-content elements, and return normalized text.

#### Scenario: Article URL is ingested
- **WHEN** the author supplies a reachable article URL
- **THEN** the system returns normalized article text without script or style content

#### Scenario: URL cannot be fetched
- **WHEN** the source remains unavailable after configured retries and timeout
- **THEN** the system reports a clear ingestion error without creating a scenario

### Requirement: YouTube context ingestion
The system SHALL accept a YouTube URL, use available subtitles preferentially, fall back to speech transcription when subtitles are unavailable, and limit the transcript supplied for drafting to 30,000 characters.

#### Scenario: Subtitles are available
- **WHEN** the author supplies a YouTube video with usable subtitles
- **THEN** the system uses those subtitles without invoking speech transcription

#### Scenario: Subtitles are unavailable
- **WHEN** no usable subtitles exist for the supplied video
- **THEN** the system transcribes the audio and returns bounded transcript text

### Requirement: Freeform context ingestion
The system SHALL persist freeform author input as a timestamped Markdown file under `data/freeform/` and return the text for scenario drafting.

#### Scenario: Freeform idea is supplied
- **WHEN** the author submits non-empty freeform text
- **THEN** a Markdown source file is created and the same idea is available to the drafting pipeline

### Requirement: Drafting context bound
The system SHALL limit normalized context passed to the scenario-generation model to 8,000 characters while retaining source metadata.

#### Scenario: Source exceeds model context bound
- **WHEN** normalized source text exceeds 8,000 characters
- **THEN** the drafting input is reduced to at most 8,000 characters and remains attributable to the original source

### Requirement: Resilient network ingestion
The system SHALL apply finite timeouts and exponential-backoff retries to transient network failures during ingestion.

#### Scenario: Transient source failure recovers
- **WHEN** a source request initially fails with a retryable error and later succeeds
- **THEN** ingestion completes without duplicate persisted source artifacts
