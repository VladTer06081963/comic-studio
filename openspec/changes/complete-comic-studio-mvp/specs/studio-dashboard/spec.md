## Purpose

Provide a dependency-free local dashboard for monitoring scenario queues, reviewing drafts, and previewing completed comic images.

## ADDED Requirements

### Requirement: Dashboard availability
The web server SHALL serve the dashboard at `http://localhost:3000/ui/` and expose JSON APIs required by the dashboard.

#### Scenario: Dashboard is opened
- **WHEN** the author navigates to `/ui/` while the server is running
- **THEN** the dashboard loads without requiring a frontend build step

### Requirement: Lifecycle views
The dashboard SHALL provide distinct views for draft, approved, rendered, and comic items sourced from current filesystem state.

#### Scenario: Queues contain scenarios
- **WHEN** the author selects a lifecycle view
- **THEN** every valid item in that queue is represented and items from other queues are excluded

### Requirement: Draft cards
Draft cards SHALL display scenario title, tone, style, ID, panel captions, and approve and reject controls.

#### Scenario: Draft card is shown
- **WHEN** a valid draft is returned by the API
- **THEN** its required metadata and both lifecycle controls are visible

### Requirement: Dashboard approval controls
The dashboard SHALL allow the author to approve or reject a draft and SHALL refresh the affected views after a successful transition.

#### Scenario: Author approves from dashboard
- **WHEN** approve is selected and the API confirms success
- **THEN** the item disappears from drafts and becomes visible under approved scenarios

### Requirement: Comic previews
The dashboard SHALL display image previews for completed comic PNG files and identify each by scenario ID or filename.

#### Scenario: Final comic exists
- **WHEN** a readable PNG is returned in the comics view
- **THEN** its image and identifier are visible in the corresponding card

### Requirement: Periodic refresh
The dashboard SHALL refresh queue data every ten seconds while active without duplicating cards or losing the selected view.

#### Scenario: External state changes
- **WHEN** a queue changes on disk while the dashboard remains open
- **THEN** the change is reflected within ten seconds

### Requirement: Responsive presentation
The dashboard SHALL use an adaptive card layout usable on desktop and mobile-width screens.

#### Scenario: Narrow viewport is used
- **WHEN** the dashboard width is reduced to a typical phone viewport
- **THEN** controls and card content remain visible without horizontal page scrolling
