# Аудит: Система стилей для MiniMax изображений

## 1. Контекст
Промпты для MiniMax image-01 генерировались LLM без стандартизации. Результат непредсказуем.

## 2. Что сделано
- Создан `STYLE_TEMPLATES` с 5 стилями
- Модифицирован `generate_scenario()` для добавления стиля к промптам
- Добавлен параметр `--image-style` в CLI
- Протестировано на cartoon стиле
- OpenSpec change заархивирован

## 3. Статус
✅ **Завершено** — 2026-08-01

## Файлы
- `py/scenario/writer.py` — STYLE_TEMPLATES, generate_scenario()
- `scripts/ingest_and_draft.py` — --image-style CLI
- `openspec/changes/archive/2026-08-01-style-prompt-system/` — archived
