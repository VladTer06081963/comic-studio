## Purpose

Generate deterministic comic panel images and assemble final PNG files while strictly enforcing the approved-scenario gate.

## ADDED Requirements

### Requirement: Approval gate
The renderer MUST read a scenario from `data/scenarios/approved/` and verify status `approved` before making any image-generation request.

#### Scenario: Approved scenario is rendered
- **WHEN** the requested scenario exists in the approved queue with status `approved`
- **THEN** image generation may begin

#### Scenario: Unapproved scenario is requested
- **WHEN** the requested ID is absent from the approved queue or has another status
- **THEN** the renderer fails before making any rendering API request

### Requirement: Deterministic render inputs
The renderer SHALL use the scenario ID and seed as stable render inputs and SHALL accept explicit ID or seed overrides where the command interface supports them.

#### Scenario: Render is retried
- **WHEN** the same approved scenario and seed are rendered again
- **THEN** equivalent generation parameters and output paths are used

### Requirement: Parallel panel generation
The renderer SHALL generate independent panels concurrently with no more than four workers and preserve panel ordering in the final comic.

#### Scenario: Four-panel scenario renders
- **WHEN** a valid four-panel scenario is rendered
- **THEN** up to four panel requests execute concurrently and assembly uses panel order 1 through 4

### Requirement: Panel artifacts
The renderer SHALL save every generated panel at `data/comics/<id>/panel_<n>.png` before final assembly.

#### Scenario: Panel generation succeeds
- **WHEN** a panel image is returned successfully
- **THEN** its debug artifact is persisted under the scenario-specific panel directory

### Requirement: Final comic assembly
The renderer SHALL assemble three or four panel images and captions into a final PNG at `data/comics/<id>.png` using the scenario layout and one of `star`, `bubble`, `gothic`, `boom`, `memo`, or `bar` caption styles.

#### Scenario: Supported style is selected
- **WHEN** all panel artifacts exist and the scenario uses a supported style
- **THEN** a readable final PNG is produced at the canonical comic path

### Requirement: Character reference
The renderer SHALL pass a supplied character reference as a subject reference for every panel in the scenario.

#### Scenario: Character reference is supplied
- **WHEN** the author renders an approved scenario with a readable character-reference image
- **THEN** every panel generation request includes that same subject reference

### Requirement: Render state transition
After successful final assembly, the system SHALL set status to `rendered`, record panel and comic paths, and atomically move the scenario to `data/scenarios/rendered/`.

#### Scenario: Complete render succeeds
- **WHEN** all panels and final assembly succeed
- **THEN** the approved record is replaced by a rendered record containing valid image paths

#### Scenario: Any panel fails
- **WHEN** one or more panel generations fail
- **THEN** the scenario remains approved and is not reported as rendered

### Requirement: Render performance
Under normal provider availability, rendering a four-panel scenario SHALL complete within 90 seconds.

#### Scenario: Provider meets normal latency
- **WHEN** four panel requests each finish within the configured provider latency budget
- **THEN** the final PNG is available within 90 seconds of render start
