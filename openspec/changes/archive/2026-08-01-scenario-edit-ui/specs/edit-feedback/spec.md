# Spec: Edit Feedback

## API

### REQ-001: Endpoint
`POST /api/scenarios/:id/feedback` добавляет правку к сценарию.

### REQ-002: Body
```json
{"text": "текст правки"}
```

### REQ-003: Storage
Правка добавляется в `scenario.feedback[]`.

### REQ-004: Validation
Текст обязателен и не пуст.

### REQ-005: Idempotent
Несколько правок сохраняются как массив.

## Web UI

### REQ-006: Edit Button
Каждая карточка имеет кнопку ✏️ Редактировать.

### REQ-007: Modal
При клике открывается модальное окно с textarea.

### REQ-008: Examples
В модалке есть примеры типовых правок.

### REQ-009: Save
Кнопка "Сохранить" отправляет правку на API.

### REQ-010: Badge
На карточке показывается количество правок: `💬 N правок`.

## Files
- `web/server.js` — POST /api/scenarios/:id/feedback
- `ui/index.html` — модальное окно
- `ui/app.js` — обработка кнопки ✏️ и формы
- `ui/style.css` — стили модалки