# Design: Edit Scenario UI

## Web UI

### Modal
```html
<div class="modal" id="edit-modal">
  <div class="modal-content">
    <h3>✏️ Редактирование сценария</h3>
    <p>ID: <code>abc123</code></p>
    <textarea id="edit-text"></textarea>
    <div class="examples">
      <small>Примеры:</small>
      <button>Убрать панель 2</button>
      <button>Изменить тон на funny</button>
      <button>Добавить персонажа</button>
    </div>
    <div class="modal-actions">
      <button id="cancel">Отмена</button>
      <button id="save">Сохранить</button>
    </div>
  </div>
</div>
```

### Card Actions
```html
<div class="actions">
  <button class="approve">✅ Утвердить</button>
  <button class="reject">❌ Отклонить</button>
  <button class="edit">✏️ Редактировать</button>
</div>
```

### Feedback Badge
```html
<span class="feedback-badge">💬 2 правки</span>
```

## API

### POST /api/scenarios/:id/feedback
```json
{
  "text": "Убрать панель 2, добавить юмора"
}
```

Returns:
```json
{
  "ok": true,
  "feedback_count": 2
}
```