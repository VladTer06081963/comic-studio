# Spec: Image Style System

## Overview
Система шаблонов стилей для генерации изображений в MiniMax image-01.

## Requirements

### REQ-001: Style Templates
Система должна содержать словарь `STYLE_TEMPLATES` с шаблонами стилей.

### REQ-002: Available Styles
Должны быть доступны стили: cartoon, anime, comic, realistic, watercolor.

### REQ-003: Style Injection
При генерации сценария стиль должен добавляться к промпту каждой панели.

### REQ-004: Default Style
По умолчанию используется стиль "comic".

### REQ-005: User Override
Пользователь может указать стиль через параметр `image_style`.

## Implementation

### File: `py/scenario/writer.py`

```python
STYLE_TEMPLATES = {
    "cartoon": "cartoon style, vibrant colors, animated, fun, expressive characters, bold outlines",
    "anime": "anime style, Japanese animation, cel shaded, detailed background, dramatic lighting",
    "comic": "comic book style, bold outlines, halftone dots, pop art colors, dramatic shadows",
    "realistic": "photorealistic, 8K, detailed, cinematic lighting, high contrast, sharp focus",
    "watercolor": "watercolor painting style, soft edges, artistic, paper texture, gentle colors",
}

# В generate_scenario():
style_suffix = STYLE_TEMPLATES.get(scenario.get("image_style", "comic"))
for panel in scenario["panels"]:
    panel["prompt"] = f"{panel['prompt']}, {style_suffix}"
```

## Acceptance Criteria

- [ ] STYLE_TEMPLATES определён с 5+ стилями
- [ ] generate_scenario() добавляет стиль к промптам
- [ ] Параметр image_style работает
- [ ] Дефолтный стиль = "comic"
- [ ] Совместимость с existing сценариями
