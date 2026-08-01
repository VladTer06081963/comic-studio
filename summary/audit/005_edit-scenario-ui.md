# Аудит: UI для редактирования

## 1. Контекст
В Web UI не было возможности редактировать сценарии.

## 2. Что сделано
- API endpoint POST /api/scenarios/:id/feedback
- Кнопка ✏️ Редактировать на карточках
- Модальное окно с textarea и примерами
- Badge 💬 с количеством правок

## 3. Статус
✅ Завершено — 2026-08-01

## Файлы
- `web/server.js` — POST /api/scenarios/:id/feedback
- `ui/index.html` — модалка
- `ui/app.js` — обработка кнопки ✏️
- `ui/style.css` — стили модалки и badge