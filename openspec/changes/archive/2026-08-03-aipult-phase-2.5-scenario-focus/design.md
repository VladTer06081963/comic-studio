# Design: AiPULT Phase 2.5 — Scenario Focus Highlight

## Architecture

Очень узкий change — pure UI feature. Backend не затрагивается. Flow:

```
[Chat panel — карточка view]
  ↓ клик "🔗 Открыть в дашборде"
  ↓ window.open('/ui/?tab=rendered&focus=b16e0660', '_blank')
[Новая вкладка dashboard]
  ↓ загрузка HTML
  ↓ scripts run
  ↓ new: read URLSearchParams → ?focus=b16e0660
  ↓ activateTab('rendered')  (existing)
  ↓ loadTab('rendered') → fetch /api/scenarios?status=rendered
  ↓ render scenario cards
  ↓ new: after render, find .card[data-id="b16e0660"]
  ↓ apply .card--focused class
  ↓ scrollIntoView({behavior: 'smooth', block: 'center'})
  ↓ CSS animation: pulse-focus 2s × 2 cycles
  ↓ after 3s, remove class (cleanup)
```

## File Structure

```
ui/
├── app.js              ← MODIFIED: +focus logic, data-id on cards
├── style.css           ← MODIFIED: +.card--focused + @keyframes pulse-focus
└── index.html          ← (unchanged)
```

Только 2 файла модифицированы. Никаких новых OpenSpec specs (это дополнение
к существующей web-aipult-ui capability).

## Component Details

### 1. `ui/app.js` — focus logic

Добавить в `loadTab()`:
```js
async function loadTab(name) {
  // ... existing fetch + render ...
  
  // After render, apply focus highlight if URL has ?focus=<id>
  const focusId = new URLSearchParams(location.search).get('focus');
  if (focusId) {
    // Wait one frame for DOM to be ready
    requestAnimationFrame(() => {
      const card = document.querySelector(`.card[data-scenario-id="${CSS.escape(focusId)}"]`);
      if (card) {
        card.classList.add('card--focused');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Auto-remove after 3s
        setTimeout(() => card.classList.remove('card--focused'), 3000);
      }
    });
    // Strip ?focus= from URL so reload doesn't re-trigger
    const url = new URL(location.href);
    url.searchParams.delete('focus');
    history.replaceState({}, '', url);
  }
}
```

Также модифицировать `scenarioCard(sc, status)`:
```js
return `
  <div class="card" data-scenario-id="${sc.id}">
    <h3>${escapeHtml(sc.title)}</h3>
    ...
  </div>`;
```

### 2. `ui/style.css` — focus visual

```css
.card--focused {
  outline: 3px solid var(--accent);
  outline-offset: 4px;
  animation: pulse-focus 2s ease-out 2;
  position: relative;
  z-index: 10;
}

@keyframes pulse-focus {
  0%   { outline-color: var(--accent); outline-offset: 4px; }
  50%  { outline-color: var(--accent2); outline-offset: 8px; }
  100% { outline-color: var(--accent); outline-offset: 4px; }
}
```

Pulse: 2 цикла × 1 сек = 2 сек, потом остаётся outline до 3s, потом удаляется.

## UX Flow

### Initial state
```
[User clicks "🔗 Открыть в дашборде" in chat card]
  ↓
[New tab opens: /ui/?tab=rendered&focus=b16e0660]
  ↓ (Dashboard JS reads URL params, calls activateTab('rendered'))
  ↓ (loadTab fetches /api/scenarios?status=rendered, renders cards)
```

### After render
```
[All cards rendered, no focus]
  ↓ (focusId = 'b16e0660')
  ↓ (find .card[data-scenario-id='b16e0660'])
  ↓ (add .card--focused class)
  ↓ (scrollIntoView({behavior: 'smooth', block: 'center'}))
  ↓ (animate pulse-focus 2 cycles × 1s)
  ↓ (remove class after 3s)
```

Visual result: b16e0660 card briefly glows orange (accent color), centered
in viewport, then returns to normal.

## Test Strategy

Manual (UI):
- [ ] `?focus=b16e0660` → b16e0660 card glows, scrolls to center
- [ ] `?focus=NONEXISTENT` → no highlight (silent fail)
- [ ] `?tab=rendered&focus=...` (no draft) → activate rendered tab
- [ ] Hard refresh on focused page → no re-trigger (URL was stripped)
- [ ] `?focus=8eaa57cc` on Comics tab → activates Comics tab, no highlight (comics
      tab cards don't have data-scenario-id since they're filenames)

## Security Considerations

- `CSS.escape()` prevents CSS injection from malicious ID
- `?focus=` value is not executed as code, only used for selector
- No server-side impact (no API changes)
- URL strip after apply prevents accidental re-highlight on F5

## Performance

- Single `querySelector` per `loadTab` call — O(1) for typical 30 cards
- `scrollIntoView` is native browser API, hardware-accelerated
- CSS animation: 2s total, then class removed (no DOM bloat)
- URL `replaceState` doesn't trigger history event
