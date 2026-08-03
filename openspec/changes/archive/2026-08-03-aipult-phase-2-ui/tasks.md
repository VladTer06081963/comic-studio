## 1. OpenSpec Specs

- [ ] 1.1 Create `specs/web-aipult-ui/spec.md` with `## ADDED Requirements` header.
- [ ] 1.2 Add 5-6 requirements: chat panel structure, card rendering, action handlers, localStorage history, mobile responsive, Telegram theme variables. Each with at least one `#### Scenario:`.

## 2. Pure UI Formatter (testable from Node)

- [ ] 2.1 Create `web/lib/aipult/ui_format.js` with pure functions: `formatCard`, `formatCandidate`, `formatStatus`, `formatIntent`, `formatTimestamp`, `formatDuration`, `formatBytes`, `escapeHtml`, `truncate`. No I/O, no DOM, no side effects.
- [ ] 2.2 Define `INTENT_LABELS` map: restyle→🎨 Restyle, render→🖼 Render, revise→✏️ Revise, view→👁 View, list→📋 List, approve→✅ Approve, publish→📤 Publish, delete→🗑 Delete, stats→📊 Stats.
- [ ] 2.3 Define `STATUS_LABELS` map: draft→📝 Draft (gray), approved→✅ Approved (blue), rendered→🎬 Rendered (orange), published→🌐 Published (green), rejected→❌ Rejected (red).
- [ ] 2.4 Implement `escapeHtml(text)` using `[&<>"']` regex replacement. CRITICAL: every dynamic string passed to `innerHTML` MUST go through this.
- [ ] 2.5 Implement `truncate(text, max)` that cuts at max chars and appends '…' if truncated. `max=0` returns empty string.

## 3. Node Tests for Pure Formatter

- [ ] 3.1 Create `web/tests/aipult_ui_format.test.js` with 10 tests:
      `test_format_card_includes_title_id_status`,
      `test_format_candidate_includes_id_line`,
      `test_format_status_all_5_states`,
      `test_format_intent_all_9_intents`,
      `test_format_timestamp_relative`,
      `test_format_duration_ms_to_human`,
      `test_escape_html_escapes_special_chars`,
      `test_truncate_short_string_unchanged`,
      `test_card_with_null_resolved_scenario_does_not_throw`,
      `test_format_bytes_kb_mb`.
- [ ] 3.2 Run `cd web && node --test tests/aipult_ui_format.test.js` → 10/10 pass.

## 4. HTML Chat Panel

- [ ] 4.1 Add `<button data-tab="aipult">🤖 AiPULT</button>` to existing `<nav>` in `ui/index.html`.
- [ ] 4.2 Add `<section id="tab-aipult" class="tab-content">` with: `<div id="aipult-messages">`, `<form id="aipult-form">` (textarea + send button), `<div id="aipult-suggestions">` (3 example chips).
- [ ] 4.3 Add `<link rel="stylesheet" href="aipult.css">` in `<head>`.
- [ ] 4.4 Add `<script src="aipult.js" defer></script>` before `</body>` (after `app.js`).
- [ ] 4.5 Verify existing tabs still work (no regression). Run `node --test` — must stay 90+/90+.

## 5. Chat Panel CSS

- [ ] 5.1 Create `ui/aipult.css` with sections: chat messages, message bubbles (user/assistant), CommandCard, action buttons, input area, suggestions chips, mobile responsive.
- [ ] 5.2 Reuse existing CSS variables (`--bg`, `--panel`, `--accent`, etc.) from `ui/style.css`.
- [ ] 5.3 Define Telegram theme variables: `--tg-theme-bg-color`, `--tg-theme-text-color`, `--tg-theme-hint-color`, `--tg-theme-button-color`, `--tg-theme-button-text-color`, `--tg-theme-secondary-bg-color`. Default to existing palette.
- [ ] 5.4 Mobile-first: all buttons `min-height: 44px`, `min-width: 44px`; chat input area `flex-wrap: wrap`; card `max-width: 100%`.
- [ ] 5.5 Card visual hierarchy: title (PRIMARY, 1.1rem bold) > id+status (SECONDARY, 0.85rem muted) > command (TERTIARY, monospace 0.85rem).

## 6. Chat Panel JS

- [ ] 6.1 Create `ui/aipult.js` with: `const AIPULT_STORAGE_KEY = 'aipult:history'` (max 50 messages), `const AIPULT_MAX_HISTORY = 50`, `const AIPULT_ENDPOINTS = { chat, execute, resolve, list }`.
- [ ] 6.2 Implement `loadHistory()` reading localStorage, validating shape, returning array.
- [ ] 6.3 Implement `saveHistory(messages)` writing to localStorage (truncate to last 50).
- [ ] 6.4 Implement `appendMessage(role, content, card?)` — appends bubble to DOM, scrolls to bottom, saves to history.
- [ ] 6.5 Implement `sendMessage(text)` — POST `/api/aipult/chat`, handle 4 response shapes: `{card}`, `{candidates: [], message}` (no match), `{candidates: [...], disambiguation: true}`, error.
- [ ] 6.6 Implement `renderCard(card)` using `ui_format.js#formatCard` (via dynamic import OR via re-implemented inline helpers — see 6.7).
- [ ] 6.7 Decision: import `web/lib/aipult/ui_format.js` directly in browser via `<script type="module">` and re-export, OR inline helpers. RECOMMENDED: import — single source of truth.
- [ ] 6.8 Implement `renderCandidateList(candidates)` for disambiguation UX (numbered list with "✅ Выбрать" buttons).
- [ ] 6.9 Implement `bindActions(cardEl, card)` attaching click handlers to: 📖 Read (fetch /api/scenarios/{id}, alert JSON), ✏️ Edit (toggle inline textarea with re-validation), ▶️ Run (POST /api/aipult/execute, render result), ❌ Reject (fade out + remove).
- [ ] 6.10 Implement `inlineEdit(cardEl, card)` — replaces command display with `<textarea>`, adds [Отмена] [▶️ Run с правкой] buttons. Re-validates command on input via fetch to a future `/api/aipult/validate` (Phase 4) OR client-side via `web/lib/aipult/validator.js` (if browser-importable).
- [ ] 6.11 Implement `executeCard(cardId, command)` — POST `/api/aipult/execute` with `{card_id, command, intent, scenario_id}`, render result bubble with stdout/stderr/exit_code.
- [ ] 6.12 Implement `rejectCard(cardEl)` — fade-out animation, remove from DOM, add "❌ Rejected" entry to history.
- [ ] 6.13 Wire form submit handler: prevent default, read textarea, clear input, call `sendMessage(text)`.
- [ ] 6.14 Wire suggestion chips: clicking a chip prefills textarea and submits.
- [ ] 6.15 Wire tab switching: existing `app.js` handles `data-tab` clicks — verify `aipult` tab is recognized. (Likely need to extend tab handler.)
- [ ] 6.16 Add clear-history button (small, in chat header) with confirm dialog.

## 7. Verification

- [ ] 7.1 Run `cd web && node --test --test-concurrency=1 tests/*.test.js` — must stay 90+/90+ (Phase 1 not broken).
- [ ] 7.2 Run `cd .. && .venv/bin/python3 -m unittest discover -s tests -p 'test_*.py'` — must stay 65/65.
- [ ] 7.3 Run `openspec validate aipult-phase-2-ui --strict` — must be valid.
- [ ] 7.4 Manual smoke: open `http://127.0.0.1:3000/ui/`, click 🤖 AiPULT, send "поменяй стиль у кота на gothic", verify CommandCard renders with title+id+status. Click Run (with mock) or Reject.
- [ ] 7.5 Manual mobile check: resize to 375px, verify chat input area doesn't overflow, all buttons ≥44px touch targets.

## 8. Documentation

- [ ] 8.1 Add brief section to `CHANGELOG.md` on fixation.
- [ ] 8.2 (Optional) Update `ui/index.html` help tab with AiPULT section.
- [ ] 8.3 (Deferred to Phase 4) `docs/aipult.md` full doc.
