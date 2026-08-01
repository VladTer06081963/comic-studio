# Tasks: Image Style System

## Implementation Tasks

- [ ] Добавить STYLE_TEMPLATES в `py/scenario/writer.py`
- [ ] Обновить SYSTEM_PROMPT с инструкцией использовать стили
- [ ] Модифицировать generate_scenario() для добавления стиля
- [ ] Обновить CLI args в `scripts/ingest_and_draft.py` (--image-style)
- [ ] Добавить .pi/skills/ documentation
- [ ] Протестировать с cartoon и anime стилями

## Verification

- [ ] Проверить что стиль добавляется к промпту
- [ ] Сгенерировать комикс со стилем cartoon
- [ ] Сгенерировать комикс со стилем anime
- [ ] Убедиться что дефолт = comic
