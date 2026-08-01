## Why

Comic Studio already contains an initial implementation, but the behavior described in `PRD/PRD.md` is not yet captured as an executable OpenSpec contract and the MVP still requires end-to-end stabilization. This change defines the complete single-author pipeline so implementation can be audited against explicit requirements and acceptance scenarios.

## What Changes

- Complete context ingestion from web URLs, YouTube, and freeform text with bounded input and resilient network handling.
- Generate reproducible 3–4 panel scenario JSON files and mirror them to Notion when configured.
- Provide Telegram and dashboard approval workflows, including approve, edit, reject, and pending-state operations.
- Render only approved scenarios, in parallel, with deterministic seeds, optional character references, panel artifacts, caption styles, and final PNG assembly.
- Publish rendered comics to a configured site and optional social providers, then update state and publication metadata.
- Run a fault-isolated nightly batch that renders, publishes, archives, logs, and sends Telegram summaries.
- Standardize lifecycle persistence, observability, timeouts/retries, idempotency, secret handling, and graceful behavior for optional integrations.
- Verify the MVP through smoke, integration, reliability, UI, and security tests.

## Capabilities

### New Capabilities
- `context-ingestion`: Extract and normalize context from URLs, YouTube videos, and freeform text.
- `scenario-drafting`: Generate, validate, persist, and optionally mirror comic scenarios.
- `scenario-approval`: Review and transition scenarios through Telegram and the web dashboard.
- `comic-rendering`: Render approved scenarios into deterministic panel and final comic images.
- `comic-publication`: Publish rendered comics and record publication outcomes.
- `nightly-automation`: Process approved scenarios in a resilient scheduled batch and archive completed work.
- `studio-dashboard`: Monitor and operate scenario and comic queues through a responsive local UI.
- `pipeline-foundation`: Define lifecycle persistence, configuration, logging, reliability, idempotency, and security guarantees shared by the pipeline.

### Modified Capabilities

None; there are no existing main OpenSpec capabilities.

## Impact

This change affects the Python modules under `py/`, orchestration scripts under `scripts/`, the Telegraf bot in `tg-bot/`, Express API in `web/`, dashboard assets in `ui/`, Node publishers in `publisher/`, `cron/nightly.sh`, configuration and dependency manifests, tests, and project documentation. External systems include MiniMax, Telegram, Notion, the configured publication site, and optional social providers. No intentional breaking API change is introduced; existing entry points are retained and completed.
