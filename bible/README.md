# Comic Studio — Continuity Bible

Visual continuity bible для серийных комиксов. Содержит character sheets, location sheets, LoRA registry и seed strategy. Цель — один и тот же персонаж выглядит одинаково на всех панелях всех эпизодов серии.

## Зачем

Draw Things + LoRA дают ~95% consistency, не 100%. Без фиксированных seed'ов и зафиксированных LoRA-файлов:

- Лицо персонажа «плывёт» между эпизодами
- Цветовая палитра меняется от панели к панели
- Пропсы (детектор, оружие) исчезают или меняют форму

С этим bible: 99%+ consistency через (seed, LoRA, character description) тройку.

## Структура

```
bible/
├── README.md                          ← вы здесь
├── _TEMPLATE_character.md             ← шаблон для нового персонажа
├── characters/
│   ├── stalker-reznik.md              ← Stalker-ветеран «Резник»
│   ├── kotel-leopold.md               ← кот Леопольд (детская серия)
│   └── ...
├── locations/                         ← TODO: локации (Припять, Рыжий лес, ...)
└── styles/                            ← TODO: визуальные стили серий
```

Сейчас реализовано: **characters**. Locations и styles — будущие change'ы.

## Когда создавать character sheet

Создавайте character sheet, **когда планируете использовать персонажа в ≥2 панелях** (даже в одном сценарии, не говоря о серии). Один шот = не нужен bible.

## Workflow: добавить нового персонажа

1. **Скопируй** `bible/_TEMPLATE_character.md` → `bible/characters/<slug>.md` где `<slug>` — kebab-case латиницей (например `stalker-reznik`).
2. **Заполни** секции:
   - `## Identity` — имя, возраст, этничность, биология
   - `## Visual` — лицо, тело, шрамы, причёска
   - `## Wardrobe` — одежда (с цветами и фактурой)
   - `## Props` — оружие, gear, signature items
   - `## Personality` — 2-3 предложения (для narrative, не для image gen)
   - `## Seed:` — фиксированный seed (int). См. «Seed strategy» ниже.
   - `## LoRA:` — имя LoRA-файла в Draw Things Models/. См. «LoRA strategy» ниже.
   - `## Sample prompt:` — шаблон промпта, который вставляется в `panels[*].prompt` сценария.
3. **Прогоните** `python scripts/lint_bible.py` — валидатор проверит, что все обязательные поля заполнены.
4. **Зафиксируйте** в git. Bible — это версионируемая knowledge base.

## Workflow: использовать персонажа в сценарии

В `scenario.json`:

```json
{
  "id": "stalker-013",
  "genre": "stalker-horror",
  "text_provider": "lmstudio",
  "image_provider": "drawthings",
  "render_lora": "stalker_sdxl_lora_f16.ckpt",     ← из character sheet «LoRA:»
  "render_seed": 42,                                ← из character sheet «Seed:»
  "panels": [
    {
      "n": 1,
      "prompt": "Ryzhy forest zone, 1986: a 50-year-old stalker veteran called 'Reznik', scarred face, grey beard, wearing SEVA suit with rust patches and Expedition-70 backpack, holding an Ecologist detector with red LED pulse, low campfire light, ..."  ← содержит character description из sheet
    }
  ]
}
```

Три правила для consistency:

1. **`render_seed` одинаковый** во всех эпизодах с этим персонажем.
2. **`render_lora` одинаковый** во всех эпизодах (тот же файл).
3. **Character description в `panels[*].prompt` одинаковая** — копируй из character sheet, не перефразируй. LoRA обучен на конкретных триггерах; перефразирование может сломать consistency.

## Seed strategy

**Один seed на персонажа, на всю серию.** Никаких разных seed'ов в разных эпизодах.

Как выбрать seed:
1. Сгенерируй 4-8 панелей с **эталонным** промптом (из character sheet) + варьирующим seed.
2. Выбери seed, на котором персонаж выглядит наиболее «канонично» (лицо стабильно, одежда корректная, пропсы на месте).
3. Зафиксируй в `## Seed:`. Запиши рядом почему этот seed (комментарий `// why:`).
4. **Не меняй seed задним числом.** Это сломает consistency уже отрендеренных панелей. Если хочешь пересмотреть — создай нового персонажа (`stalker-reznik-v2`).

Альтернатива: если Draw Things генерирует приемлемо на seed=-1 (random) — оставь, но тогда consistency хуже (CLAUDE.md rule 3 нарушается).

## LoRA strategy

**Один LoRA-файл на персонажа, реже — на стиль.**

- Файл лежит в `Draw Things Models/` (например `stalker_sdxl_lora_f16.ckpt`).
- Имя файла — это trigger. `lora_weight: 0.7-0.8` обычно достаточно.
- Если у персонажа два outfit'а (например, Резник в SEVA и в «гражданке») — два LoRA, два character sheet'а (`stalker-reznik-seva`, `stalker-reznik-civilian`).
- НЕ тренируй LoRA без отдельной серии тестовых картинок. «Поставил в Draw Things, посмотрел» — не валидация.

## Revision: как обновить character sheet

Character sheet — это **зафиксированная правда о персонаже**. Изменения:

1. **Косметические** (новый пример рендера, уточнение prompt) — коммить как обычно, без version bump.
2. **Визуальные** (новая одежда, шрам, возраст) — создавай **нового** персонажа с `-v2` суффиксом. Старый не трогай. Старые отрендеренные панели остаются валидными (CLAUDE.md rule 3).
3. **Отзыв персонажа** (больше не используется) — перенеси `.md` в `bible/characters/_archive/`. Не удаляй (нужно для audit'а старых серий).

## Линтер

`scripts/lint_bible.py` проверяет, что все character sheets содержат обязательные поля:

```bash
$ python scripts/lint_bible.py
✅ Bible OK: 1 character(s)

$ # если что-то не заполнено:
❌ Bible lint failed:
  kotel-leopold.md: Missing required field: Seed:
  kotel-leopold.md: Missing required field: LoRA:
```

Линтер запускай перед каждым commit'ом, который трогает `bible/`.

## Чего bible НЕ делает

- ❌ Не тренирует LoRA (это ручная работа в Draw Things / kohya_ss)
- ❌ Не генерирует reference images (рисуй руками или через `ab_test_render.py`)
- ❌ Не валидирует визуальную consistency (это человеческий глаз на rendered panels)
- ❌ Не хранит сами rendered panels (они в `data/comics/<id>/`)

## Связанные

- `summary/audit/027_local-uncensored-stack.md` §6 (F1) — обоснование
- `summary/tasks/027_local-uncensored-stack.md` → F2 — этот change закрывает bible foundation
- `openspec/changes/local-uncensored-stack/specs/python-render-drawthings-client/spec.md` — LoRA параметр в `generate_image`
- `py/render/ab_renderer.py` — A/B harness для side-by-side сравнения LoRA вариантов
- `py/scenario/provider_router.py` — `render_lora` берётся из scenario.json, который в свою очередь берёт из bible
