# Design: Image Style Selector

## Telegram Bot

```
При /new или /create:
🎨 Выберите стиль изображений:

[🎬 Cartoon] [🎌 Anime] [📚 Comic] 
[📷 Realistic] [🎨 Watercolor]
```

Кнопки: `style_cartoon`, `style_anime`, `style_comic`, `style_realistic`, `style_watercolor`

## Web UI

Добавить `<select id="image-style">` в форму:
```html
<select id="image-style">
  <option value="comic">📚 Comic (default)</option>
  <option value="cartoon">🎬 Cartoon</option>
  <option value="anime">🎌 Anime</option>
  <option value="realistic">📷 Realistic</option>
  <option value="watercolor">🎨 Watercolor</option>
</select>
```

## Data Flow
1. Пользователь выбирает стиль
2. Сохраняется в сценарии как `image_style`
3. Используется при генерации
