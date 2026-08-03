# Аудит: AiPULT Phase 2.5 — Scenario Focus Highlight

**Дата:** 2026-08-03
**PR/Change:** `aipult-phase-2.5-scenario-focus` (archived → `openspec/changes/archive/2026-08-03-aipult-phase-2.5-scenario-focus/`)
**Спецификации:** `web-aipult-ui` (1 ADDED requirement, 3 scenarios)

## 1. Контекст

Phase 2 реализовал `🔗 Открыть в дашборде` кнопки в chat cards с URL
`/ui/?tab=rendered&focus=<scenario_id>`. Но dashboard игнорировал `focus`
параметр — открывался нужный таб, но карточка нужного сценария не
подсвечивалась. Пользователь не понимал, на какую карточку смотреть.

Phase 2.5 закрывает UX gap: deep-link `?focus=<id>` подсвечивает нужную
карточку + auto-scroll + кратковременная `pulse` анимация.

## 2. Что сделано

### 2.1 OpenSpec change `aipult-phase-2.5-scenario-focus`

- `proposal.md` — motivation (deep-link без подсветки), impact, out-of-scope
- `design.md` — flow, file changes, UX, security
- `tasks.md` — 5 секций (specs, JS, CSS, verification, docs)
- `specs/web-aipult-ui/spec.md` — 1 ADDED requirement с 3 scenarios:
  1. `?focus=<id> highlights matching card` (5-step flow)
  2. `?focus=<nonexistent> silently fails`
  3. `data-scenario-id is present on every scenario card`
- `validate --strict` → **valid**
- Archive: `archive_as: 2026-08-03-aipult-phase-2.5-scenario-focus`, totals added 1

### 2.2 Code (2 modified, 0 new)

| Файл | Изменение | Строк |
|------|-----------|-------|
| `ui/app.js` | `data-scenario-id="${sc.id}"` на каждой `.card`. В `loadTab()` после рендера: чтение `?focus=`, querySelector, add `.card--focused`, scrollIntoView, setTimeout 3000ms remove, `history.replaceState` (strip URL) | +20 |
| `ui/style.css` | `.card--focused` (3px outline accent, z-index 10) + `@keyframes pulse-focus` (1s × 2 cycles, outline-offset 4→8→4px) | +15 |

### 2.3 Tests

**Никаких новых тестов** — это pure UI feature (DOM манипуляция), manual
verification достаточна. Существующие 110+69 тестов не сломаны.

## 3. UX Flow (deep-link)

```
1. User в 🤖 AiPULT: "покажи 8eaa57cc"
2. Heuristic → card with scenario_id=8eaa57cc
3. User click "🔗 Открыть в дашборде"
   → window.open('/ui/?tab=rendered&focus=8eaa57cc', '_blank')
4. New tab opens, dashboard JS:
   a. URLSearchParams → ?focus=8eaa57cc
   b. activateTab('rendered') (existing, Phase 2)
   c. loadTab('rendered') → fetch + render cards
   d. requestAnimationFrame:
      - find .card[data-scenario-id='8eaa57cc']
      - add .card--focused class
      - scrollIntoView({behavior: 'smooth', block: 'center'})
      - setTimeout 3000ms → remove class
   e. history.replaceState (strip ?focus=)
5. User sees 8eaa57cc card with orange outline + pulse animation
6. After 3s, outline disappears, URL is clean (?focus= stripped)
```

## 4. Security

- `CSS.escape(focusId)` — защита от CSS injection через malicious scenario ID
- `?focus=NONEXISTENT` → silent fail (no error, no highlight, no log)
- `history.replaceState` (не `pushState`) — не создаёт новую history entry,
  пользователь не теряет back/forward navigation
- URL strip после apply — F5/reload не re-triggered highlight (no spam animation)

## 5. Backward Compatibility

- ✅ `data-scenario-id` атрибут добавлен БЕЗ breaking changes (старый CSS
  селектор `.card` продолжает работать)
- ✅ `?focus=` query param OPTIONAL — dashboard работает без него
- ✅ `?tab=` query param (Phase 2) продолжает работать (тоже не регресс)
- ✅ Existing OpenSpec capability `web-aipult-ui` просто получил 1 ADDED requirement

## 6. Performance

- 1 querySelector per `loadTab` — O(1) для типичных 30 карточек
- `scrollIntoView` — native browser API, hardware-accelerated
- CSS animation: 2 cycles × 1s = 2s, потом class удаляется (no DOM bloat)
- `history.replaceState` — не триггерит history event
- Auto-cleanup setTimeout 3000ms — class удаляется даже если пользователь
  не взаимодействует

## 7. Manual Verification

- [ ] `?tab=rendered&focus=b16e0660` → b16e0660 card highlighted with pulse,
      scrolled to center
- [ ] `?focus=NONEXISTENT` → no error, no highlight
- [ ] `?tab=rendered&focus=8eaa57cc` (no draft) → activate rendered tab + highlight
- [ ] Hard refresh на focused page → URL clean (no `?focus=`), no re-highlight
- [ ] From chat: `🔗 Открыть в дашборде` for b16e0660 → new tab shows highlight
- [ ] `?focus=` с кириллическими/спецсимволами → не ломается (CSS.escape)

## 8. Что НЕ сделано (deferred)

- ❌ Back/forward integration через URL (history events)
- ❌ Multi-focus (highlight несколько сценариев)
- ❌ Auto-clear focus когда пользователь переключает таб
- ❌ URL cleanup preserve `?focus=` для shareable links
- ❌ Кнопка "Open in AiPULT" в dashboard (reverse direction)
- ❌ Phase 3: MiniApp deep-link integration
- ❌ Phase 4: SSE + cost dashboard

## 9. Verification

```bash
# Regression
cd web && node --test --test-concurrency=1 tests/*.test.js
# → 110/110 ✓
.venv/bin/python3 -m unittest discover -s tests -p 'test_*.py'
# → 69/69 ✓

# OpenSpec
openspec validate aipult-phase-2.5-scenario-focus --strict
# → valid

# Manual
# Open /ui/?tab=rendered&focus=b16e0660 → card highlighted
# Open from chat: "покажи 8eaa57cc" → "🔗 Открыть в дашборде" → new tab
```
