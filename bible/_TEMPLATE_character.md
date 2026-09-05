# Character Template — Инструкция

> **Этот файл — шаблон, не реальный персонаж.** Скопируй его в
> `bible/characters/<slug>.md` и заполни все секции с `<placeholder>`.
> Удали эту инструкцию после копирования.

**Slug (имя файла):** `<kebab-case-имя>` (например `stalker-reznik`, `kotel-leopold`)

**Display name:** `<полное имя с прозвищем>` (например «Stalker Резник»)

---

## Identity

- **Полное имя:** `<имя>`
- **Позывной / прозвище:** `<если есть>`
- **Возраст:** `<число>`
- **Этничность:** `<восточноевропеец / латиноамериканец / ...>`
- **Пол:** `<м / ж>`
- **Телосложение:** `<хрупкое / среднее / атлетическое / крупное>`
- **Рост:** `<в см, приблизительно>`

## Visual

Опиши так, чтобы LoRA мог воспроизвести:

- **Лицо:** `<форма, шрамы, асимметрия, морщины>`
- **Глаза:** `<цвет, выражение>`
- **Волосы:** `<цвет, длина, стиль>`
- **Борода / усы:** `<если есть>`
- **Отличительные черты:** `<татуировки, шрамы, импланты>`

## Wardrobe

Опиши одежду с цветами и фактурой:

- **Голова:** `<например: тёмно-зелёная вязаная шапка>`
- **Верх:** `<SEVA suit с ржавыми пятнами, под ним серый свитер>`
- **Низ:** `<армейские брюки, подвёрнутые>`
- **Обувь:** `<берцы, шнуровка>`
- **Аксессуары:** `<рация, нож, фляжка>`

## Props

Оружие, инструменты, signature items:

- **Оружие:** `<АКМ с подствольником, приклад обмотан изолентой>`
- **Снаряжение:** `<Егоза-детектор, мигает красным>`
- **Signature item:** `<например: медальон на шее с фотографией>`
- **Сумка / рюкзак:** `<Expedition-70 серый с жёлтым клапаном>`

## Personality

2-3 предложения. **Только narrative context, не для image gen.**

`<Например: «Резник — угрюмый, неразговорчивый. Знает цену словам и не бросает
их на ветер. Молодых не любит, но учит, если они готовы слушать.»>`

## Seed: <int>

**Фиксированный seed** для всех панелей с этим персонажем.

`// why: <объясни почему этот seed — что в нём хорошо выглядит, какие триггеры>`.

**Не меняй задним числом** — это сломает consistency уже отрендеренных панелей.
См. `bible/README.md` → «Seed strategy».

## LoRA: <filename>

**Имя LoRA-файла** в Draw Things Models/. Например `stalker_sdxl_lora_f16.ckpt`.

- **Trigger words:** `<слова, на которые LoRA реагирует>`
- **Recommended weight:** `<0.7 - 0.8 обычно>`
- **Trained on:** `<на чём обучена, сколько шагов>`
- **Source:** `<ссылка / автор / как получена>`

**НЕ тренируй LoRA без отдельной серии тестов.** См. `bible/README.md` → «LoRA strategy».

## Sample prompt:

```
<Полный промпт, который вставляется в panels[*].prompt сценария.
Должен включать: поза, одежда, props, локация, настроение, освещение.
Копируй как есть — НЕ перефразируй (LoRA чувствителен к триггерам).
```

**Пример** (Stalker Резник у костра):

```
A 50-year-old stalker veteran called "Reznik" with a scarred weathered
face, short grey beard, tired grey eyes, wearing a worn olive SEVA suit
with rust patches on the shoulders, grey knit cap pulled low, holding a
modified Ecologist detector in his weathered hands, sitting by a small
campfire in a destroyed building, late 1986 Soviet Ukraine Pripyat,
mutant red light through broken windows, fog and ash in the air,
cinematic anamorphic, hyper-detailed, 8k, atmospheric realism
```

## Tags (опционально)

`<genre tags для search/filtering, например: stalker-horror, military, atmospheric>`

---

## Checklist перед коммитом

- [ ] Заполнены все секции выше (Identity, Visual, Wardrobe, Props, Personality, Seed, LoRA, Sample prompt)
- [ ] `python scripts/lint_bible.py` проходит
- [ ] `git add bible/characters/<slug>.md && git commit -m "feat(bible): add <display name> character sheet"`
- [ ] (опционально) `python scripts/ab_test_render.py --scenario-id <id> --seed <seed> --providers drawthings` — side-by-side чтобы убедиться, что character выглядит consistent
