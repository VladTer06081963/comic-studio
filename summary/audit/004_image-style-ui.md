# Аудит: UI для выбора image_style

## 1. Контекст
Стиль изображений (image_style) теперь доступен в CLI, но не в UI.

## 2. Что сделано
- Добавлены inline-кнопки в Telegram бот
- Создан таб "Создать" в Web UI
- Добавлен API endpoint для создания сценария с image_style
- OpenSpec change заархивирован

## 3. Статус
✅ **Завершено** — 2026-08-01

## Файлы
- `tg-bot/bot.js` — IMAGE_STYLE_BUTTONS, style handler
- `ui/index.html` — форма создания с select
- `ui/app.js` — обработка формы
- `ui/style.css` — стили формы
- `web/server.js` — POST /api/scenarios
