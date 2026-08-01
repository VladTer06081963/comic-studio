# Spec: Delete Scenario

## API

### REQ-001: Endpoint
`DELETE /api/scenarios/:id`

### REQ-002: Side Effects
Удаляет:
- Файл сценария
- Директорию с панелями (`data/comics/<id>/`)
- Комикс (`data/comics/<id>.png`)
- Копию в raw (`data/comics/raw/<id>.png`)

### REQ-003: Response
```json
{"ok": true, "id": "abc123"}
```

### REQ-004: 404
Если сценарий не найден.

## Telegram

### REQ-005: Button
Кнопка 🗑 Удалить на карточке сценария.

### REQ-006: Confirmation
После нажатия — inline кнопки:
- ✅ Да, удалить (callback: `confirm_delete:<id>`)
- ❌ Отмена (callback: `cancel_delete:<id>`)

## Web UI

### REQ-007: Button
Кнопка 🗑 Удалить на карточке.

### REQ-008: Modal
Confirm modal с предупреждением.