# Comic Studio Roadmap

## Required follow-up: `scenario-revision-and-remix`

The `harden-web-server-api` change deliberately records feedback as a pending revision request but does not claim that LLM content was regenerated.

The next OpenSpec change must implement:

1. `revise_scenario()` in Python using current scenario, source context and bounded feedback history.
2. Immediate approval revocation and transition to `draft` before the LLM call.
3. Atomic persistence of revised panels/prompts/captions with revision metadata.
4. Recoverable `revision_error` while keeping the scenario unapproved after LLM failure.
5. Re-review and manual approval after every successful revision.
6. Published immutability: edit/re-render of `published` creates a new draft with a new ID and `remix_of`.
7. Stale rendered artifact handling when a rendered scenario returns to draft.
8. Telegram and Web UI parity for revision status, retry and remix.
9. Mocked tests proving revision never renders or republishes without a new approval.

Until that change is implemented, UI and API wording must remain **«запрос на правку сохранён»**, not **«сценарий отредактирован»**.

## Additional follow-ups

- Apply the shared lifecycle fixtures to Telegram and Python transition helpers.
- Reconcile publisher/site/social/Notion behavior with the publication OpenSpec contract.
- Repair nightly per-scenario publication, ordering, exit codes and archive naming.
