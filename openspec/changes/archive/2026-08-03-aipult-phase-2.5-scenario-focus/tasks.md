## 1. OpenSpec specs

- [ ] 1.1 Update `specs/web-aipult-ui/spec.md` to add a "highlight focused card"
      requirement (or extend existing chat panel requirement) with one
      `#### Scenario:` block.

## 2. Dashboard JS

- [ ] 2.1 Add `data-scenario-id` attribute to each `.card` div in `scenarioCard(sc, status)`.
- [ ] 2.2 In `loadTab(name)`, after rendering cards: read `?focus=<id>` from URL
      via `URLSearchParams`.
- [ ] 2.3 If focus ID present, find `.card[data-scenario-id="<id>"]` via
      `querySelector` (with `CSS.escape` on the ID).
- [ ] 2.4 If found: add `.card--focused` class, call `scrollIntoView({behavior: 'smooth', block: 'center'})`.
- [ ] 2.5 Set timeout 3000ms to remove `.card--focused` class.
- [ ] 2.6 Strip `?focus=` from URL via `history.replaceState` so F5 doesn't
      re-trigger the highlight.

## 3. CSS

- [ ] 3.1 Add `.card--focused` rule with `outline: 3px solid var(--accent)`,
      `outline-offset: 4px`, `position: relative`, `z-index: 10`.
- [ ] 3.2 Add `@keyframes pulse-focus` (2 cycles: accent → accent2 → accent,
      outline-offset 4px → 8px → 4px).
- [ ] 3.3 Apply animation: `animation: pulse-focus 1s ease-out 2;` (2 iterations).

## 4. Verification

- [ ] 4.1 Run `cd web && node --test --test-concurrency=1 tests/*.test.js` —
      110/110 still passing (no Node changes).
- [ ] 4.2 Run `.venv/bin/python3 -m unittest discover -s tests -p 'test_*.py'`
      — 69/69 still passing.
- [ ] 4.3 Manual smoke: open `/ui/?tab=rendered&focus=b16e0660` → b16e0660 card
      highlighted with pulse animation, scrolled to center, outline visible.
- [ ] 4.4 Manual: `?focus=NONEXISTENT` → no error, no highlight.
- [ ] 4.5 Manual: hard refresh on focused page → URL is clean (no `?focus=`),
      no re-highlight.
- [ ] 4.6 From chat panel: `🔗 Открыть в дашборде` for `b16e0660` → new tab
      shows the card highlighted.

## 5. Documentation

- [ ] 5.1 CHANGELOG entry on fixation.
- [ ] 5.2 (No separate docs/aipult.md — deferred to Phase 4.)
