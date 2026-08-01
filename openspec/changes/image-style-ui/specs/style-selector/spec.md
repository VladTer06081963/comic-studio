# Spec: Image Style Selector UI

## Overview
UI компоненты для выбора стиля изображений.

## Telegram Bot

### REQ-001: Style Buttons
Бот должен показывать inline-кнопки с 5 стилями.

### REQ-002: Callback Data
Кнопки отправляют callback_data: `style_<name>`.

### REQ-003: Default
По умолчанию — `comic`.

## Web UI

### REQ-004: Select Element
Форма должна содержать `<select id="image-style">`.

### REQ-005: Options
5 опций: cartoon, anime, comic, realistic, watercolor.

### REQ-006: Default
По умолчанию — `comic`.

## Implementation

### Telegram: `tg-bot/bot.js`
```javascript
const styleButtons = [
  [{ text: '🎬 Cartoon', callback_data: 'style_cartoon' }],
  [{ text: '🎌 Anime', callback_data: 'style_anime' }],
  [{ text: '📚 Comic', callback_data: 'style_comic' }],
  [{ text: '📷 Realistic', callback_data: 'style_realistic' }],
  [{ text: '🎨 Watercolor', callback_data: 'style_watercolor' }],
];
```

### Web: `ui/index.html`
```html
<select id="image-style">
  <option value="comic">📚 Comic (default)</option>
  ...
</select>
```
