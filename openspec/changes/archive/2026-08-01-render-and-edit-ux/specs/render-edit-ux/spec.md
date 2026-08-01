# Spec: Render & Edit UX

## Web UI — Render Button

### REQ-001
Кнопка 🎨 Рендер на карточках `approved`, `rendered`, `published`.

### REQ-002
API endpoint `POST /api/scenarios/:id/render` запускает render.

## Web UI — Seed

### REQ-003
Кнопка 🎲 Изменить seed в edit modal.

### REQ-004
При re-render показывать seed в карточке.

## Telegram — Edit Card

### REQ-005
После клика ✏️ показывать inline-кнопки:
- 💬 Общий фидбек
- 🎲 Изменить seed  
- 🔄 Перерендерить
- ❌ Отмена

### REQ-006
Кнопка "💬 Общий фидбек" — ввод текста.
Кнопка "🎲 Изменить seed" — ввод числа или рандом.
Кнопка "🔄 Перерендерить" — запуск с текущим или новым seed.

### REQ-007
Кнопка "❌ Отмена" — возврат к карточке.