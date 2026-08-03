## Why

Phase 2 реализовал `🔗 Открыть в дашборде` кнопки в chat cards с URL
`/ui/?tab=rendered&focus=<scenario_id>`. Но dashboard игнорирует `focus`
параметр — открывается нужный таб, но карточка нужного сценария не
подсвечивается и пользователь не знает, на что смотреть.

UX gap:
- Пользователь в 🤖 AiPULT: "покажи 8eaa57cc" → card с `🔗 Открыть в дашборде`
- Кликает → новая вкладка с Rendered табом
- Видит 30 карточек сценариев, не понимает какая из них `8eaa57cc`
- Нужно вручную искать ID в коде карточки

Этот change закрывает gap: deep-link `?focus=<id>` подсвечивает нужную
карточку + auto-scroll к ней + кратковременная "pulse" анимация.

## What Changes

- Добавить чтение `?focus=<scenario_id>` в `ui/app.js` при load
- После `loadTab(name)` (когда карточки отрендерены) найти `.card[data-id="<id>"]`
  и применить `.card--focused` CSS class
- Auto-scroll к найденной карточке (smooth)
- Удалить класс через 3 секунды (после прочтения) или при клике на другую карточку
- Добавить CSS-анимацию `pulse-focus` (subtle glow effect)
- Кнопка `🔗 Открыть в дашборде` в chat уже использует `?focus=...` — финальная
  интеграция: сценарий открывается с подсвеченной карточкой

## Capabilities

### New Capabilities

None. Это дополнение к существующей `web-aipult-ui` capability.

### Modified Capabilities

- `web-aipult-ui`: добавить scenario для "highlight focused card" — описывает
  что dashboard должен реагировать на `?focus=<id>` query parameter.

## Impact

- UI: `ui/app.js` — добавить чтение `?focus=`, поиск карточки, добавление класса
- UI: `ui/style.css` — добавить `.card--focused` + `@keyframes pulse-focus`
- HTML: добавить `data-id` атрибут к `.card` элементу в `scenarioCard()`

## Out of Scope

- ❌ Browser history integration (back/forward через URL)
- ❌ Multi-focus (highlight multiple scenarios)
- ❌ Auto-clear focus when user navigates away
- ❌ URL cleanup after focus expires (preserve `?focus=` in URL)

## Non-Goals (same as Phase 2)

- N1: Auto-execution без подтверждения
- N2: Multi-step command chains
- N7: Streaming LLM responses
- N8: Persisting cards server-side
