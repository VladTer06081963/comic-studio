# Задачи: AiPULT Phase 2.5 — Scenario Focus Highlight

**Change:** `aipult-phase-2.5-scenario-focus` (archived)
**Спецификации:** `web-aipult-ui` (1 ADDED requirement, 3 scenarios)
**Audit:** `summary/audit/017_aipult-phase-2.5-scenario-focus.md`

## Статус: ✅ Done (2026-08-03)

| ID | Задача | Оценка | Факт | Статус |
|----|--------|--------|------|--------|
| 1 | OpenSpec proposal + design + tasks + spec | 30min | ✓ | ✅ Done |
| 2 | `data-scenario-id` атрибут в `scenarioCard()` | 5min | ✓ | ✅ Done |
| 3 | `loadTab()` focus logic: querySelector, scrollIntoView, setTimeout, history.replaceState | 15min | ✓ | ✅ Done |
| 4 | CSS `.card--focused` + `@keyframes pulse-focus` | 10min | ✓ | ✅ Done |
| 5 | OpenSpec validate --strict + archive (1 ADDED requirement в main spec) | 5min | ✓ | ✅ Done |
| 6 | Audit + tasks + CHANGELOG + commit + push | 5min | ✓ | ✅ Done |

**Итого:** ~1h (6 секций), выполнено за 1 mini-сессию.

## Что готово

### UI

- ✅ `data-scenario-id` на каждой `.card` (`ui/app.js`)
- ✅ Focus logic в `loadTab()`:
  - Чтение `?focus=<id>` через `URLSearchParams`
  - `querySelector` + `CSS.escape()` (security)
  - `scrollIntoView({behavior: 'smooth', block: 'center'})`
  - Add `.card--focused` class
  - `setTimeout` 3000ms → remove class (auto-cleanup)
  - `history.replaceState` → strip `?focus=` from URL (no F5 re-trigger)
- ✅ CSS pulse animation:
  - `.card--focused`: 3px outline accent, z-index 10
  - `@keyframes pulse-focus`: 1s × 2 cycles, outline-offset 4→8→4px

### OpenSpec

- ✅ Change `aipult-phase-2.5-scenario-focus` validated + archived
- ✅ 1 ADDED requirement добавлен в main spec `web-aipult-ui` (теперь 7 requirements)
- ✅ 3 scenarios (highlight flow, silent fail, data-scenario-id presence)

### Tests

- **Никаких новых тестов** — pure UI feature, manual verification достаточна
- Существующие 110/110 Node + 69/69 Python тестов не сломаны

## UX Flow

```
1. User в 🤖 AiPULT: "покажи 8eaa57cc" → card with scenario_id=8eaa57cc
2. User click "🔗 Открыть в дашборде"
   → window.open('/ui/?tab=rendered&focus=8eaa57cc', '_blank')
3. New tab opens, dashboard JS:
   a. URLSearchParams → ?focus=8eaa57cc
   b. activateTab('rendered') (existing, Phase 2)
   c. loadTab('rendered') → fetch + render cards
   d. requestAnimationFrame:
      - find .card[data-scenario-id='8eaa57cc']
      - add .card--focused class
      - scrollIntoView({behavior: 'smooth', block: 'center'})
      - setTimeout 3000ms → remove class
   e. history.replaceState (strip ?focus=)
4. User sees 8eaa57cc card with orange outline + pulse animation
5. After 3s, outline disappears, URL is clean
```

## Verification

```bash
# Regression (no changes to test files)
cd web && node --test --test-concurrency=1 tests/*.test.js
# → 110/110 ✓

.venv/bin/python3 -m unittest discover -s tests -p 'test_*.py'
# → 69/69 ✓

# OpenSpec
openspec validate aipult-phase-2.5-scenario-focus --strict
# → valid

# Manual smoke test
# 1. Open /ui/?tab=rendered&focus=b16e0660 → b16e0660 card highlighted, scrolled to center
# 2. Open from chat: "покажи 8eaa57cc" → "🔗 Открыть в дашборде" → new tab with highlight
# 3. Hard refresh on focused page → URL clean, no re-highlight
# 4. ?focus=NONEXISTENT → no error, no highlight
```

## Security

- `CSS.escape(focusId)` — защита от CSS injection
- `?focus=NONEXISTENT` → silent fail (no error logged)
- `history.replaceState` (not `pushState`) — не создаёт новую history entry
- URL strip после apply — F5 не re-triggered highlight (no animation spam)

## Что НЕ сделано (deferred)

- ❌ Back/forward integration через URL
- ❌ Multi-focus (highlight несколько сценариев)
- ❌ Auto-clear focus при переключении таба
- ❌ URL cleanup preserve `?focus=` для shareable links
- ❌ Reverse direction: "Open in AiPULT" в dashboard
- ❌ Phase 3: MiniApp deep-link
- ❌ Phase 4: SSE + cost dashboard

## Phase 3+ preview

```js
// Phase 3: MiniApp (Telegram) deep-link integration
if (window.Telegram?.WebApp?.initData) {
  // Telegram passes start_param for bot deep-links
  // Could auto-trigger focus from "t.me/bot?startapp=focus_b16e0660"
  const startParam = window.Telegram.WebApp.initDataUnsafe?.start_param;
  if (startParam?.startsWith('focus_')) {
    const id = startParam.slice('focus_'.length);
    history.replaceState({}, '', `?focus=${id}`);
    activateTab('rendered');
  }
}
```
