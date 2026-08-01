# Design: Система стилей изображений

## Архитектура

```
py/scenario/writer.py
├── STYLE_TEMPLATES = {...}  # Словарь шаблонов
├── SYSTEM_PROMPT        # Обновлённый с учётом стилей
└── generate_scenario()     # Добавляет стиль в промпт
```

## STYLE_TEMPLATES

```python
STYLE_TEMPLATES = {
    "cartoon": "cartoon style, vibrant colors, animated, fun, expressive characters, bold outlines",
    "anime": "anime style, Japanese animation, cel shaded, detailed background, dramatic lighting",
    "comic": "comic book style, bold outlines, halftone dots, pop art colors, dramatic shadows",
    "realistic": "photorealistic, 8K, detailed, cinematic lighting, high contrast, sharp focus",
    "watercolor": "watercolor painting style, soft edges, artistic, paper texture, gentle colors",
}
```

## Flow

1. Пользователь указывает `image_style` при генерации сценария
2. `generate_scenario()` добавляет стиль к каждому промпту панели
3. Промпт принимает вид: `{scene_description}, {style_template}`

## Формат сценария

```json
{
  "image_style": "cartoon",
  "panels": [
    {
      "prompt": "A futuristic classroom with digital boards, cartoon style, vibrant colors..."
    }
  ]
}
```

## API изменения

- Нет новых эндпоинтов
- Изменения в `generate_scenario()` и `SYSTEM_PROMPT`
- Обратная совместимость: дефолтный стиль = "comic"
