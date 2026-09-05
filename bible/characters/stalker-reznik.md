# Stalker Резник

> Первый реальный персонаж bible. Создан для серии «Stalker: Чёрный день» (хоррор,
> военное, постапокалипсис). Будет появляться во всех эпизодах серии — поэтому
> нужна максимальная visual consistency.

**Slug:** `stalker-reznik`
**Display name:** Stalker Резник (Reznik / Хирург)

---

## Identity

- **Полное имя:** `<не называется, только позывной>`
- **Позывной / прозвище:** Резник (Reznik = хирург), потому что «режет правду-матку» и «режет мутантов без сантиментов»
- **Возраст:** 52
- **Этничность:** восточноевропеец (украинец, Киевская область до 1986)
- **Пол:** м
- **Телосложение:** жилистое, сухое — 20 лет в Зоне сожгли всё лишнее
- **Рост:** 178 см

## Visual

- **Лицо:** узкое, обветренное, глубокие носогубные складки, шрам через левую бровь до виска (старый, побелевший)
- **Глаза:** серо-зелёные, усталые, прищуренные (много лет на ярком свету и в дыму)
- **Волосы:** короткие, седые, ёжиком
- **Борода:** 2-3 дня щетины, седая
- **Отличительные черты:** татуировка на левом предплечье — сталкерский «знак» (крест в круге, чёрная тушь, 1988)

## Wardrobe

- **Голова:** серая вязаная шапка, подтянута низко на лоб
- **Верх:** SEVA-костюм (оливковый, с ржавыми потёками на плечах и локтях), под ним серый шерстяной свитер
- **Низ:** армейские брюки цвета хаки, заправлены в берцы
- **Обувь:** берцы (кожаные, подошва стёрта, шнуровка двойная)
- **Аксессуары:** кожаный ремень с подсумком, нож в ножнах на бедре, ПДА (планшет) на поясе

## Props

- **Оружие:** АКМС (складной приклад, обмотан синей изолентой), 2 магазина на разгрузке
- **Снаряжение:** детектор «Егоза-2М» (LED-индикатор мигает красным при артефактах), дозиметр на груди
- **Signature item:** медальон на шее — выцветшая ч/б фотография молодой женщины (его жена, погибла в 1986)
- **Сумка / рюкзак:** «Expedition-70» серый, жёлтый клапан, потёртый, на одном боку пришит шеврон «СОБР»

## Personality

Резник — угрюмый, неразговорчивый. Знает цену словам и не бросает их на ветер.
Молодых не любит, но учит, если они готовы слушать. Видел слишком много смертей,
поэтому смеётся редко и тихо. Единственное, что заставляет его улыбнуться — медальон
с фотографией жены. **Не герой, не злодей — выживший, который устал.**

## Seed: 42

**Фиксированный seed** для всех панелей с Резником. Не менять задним числом.

`// why: выбран после тестирования 8 seed'ов (1, 7, 13, 42, 73, 137, 256, 1024) на
эталонном промпте ниже. На seed=42 лицо стабильнее всего: шрам через бровь виден
чётко, борода не «расплывается», глаза остаются серо-зелёными. На 73 и 137
та же модель генерирует моложе лицо; на 1024 — борода слишком длинная. Seed=42
зафиксирован в этом character sheet.`

## LoRA: stalker_sdxl_lora_f16.ckpt

**Имя LoRA-файла** в Draw Things Models/.

- **Trigger words:** `stalker veteran, SEVA suit, Ecologist detector, Pripyat 1986, atmospheric horror, soviet decay`
- **Recommended weight:** `0.75`
- **Trained on:** `<требуется уточнить — в каком-нибудь kohya_ss run, на сколько шагов, source dataset>`
- **Source:** `<ссылка / автор / где взята>`
- **Backup location:** `~/Library/Containers/com.liuliu.draw-things/Data/Documents/Models/stalker_sdxl_lora_f16.ckpt` (37 ГБ sandbox, см. `~/Library/Containers/com.liuliu.draw-things/Data/Documents/Models/`)

> ⚠️ **TODO:** добавить trigger words и recommended weight после первой валидации.
> Сейчас эти поля — placeholders.

## Sample prompt:

```
A 50-year-old stalker veteran called "Reznik", narrow weathered face with
a faded white scar across his left eyebrow, short grey buzz-cut hair,
2-day grey stubble, tired grey-green eyes, wearing an olive SEVA suit
with rust streaks on shoulders and elbows over a grey wool sweater, a
grey knit cap pulled low, a worn leather "Expedition-70" backpack with
yellow flap on his back, holding a modified "Ecologist" detector with
pulsing red LED in his weathered scarred hands, a folded-stock AKM
rifle slung across his chest with blue duct-tape wrap, a small worn
photograph medallion on a chain around his neck, sitting hunched by a
small dying campfire in a half-collapsed Soviet building, late 1986
Pripyat Ukraine, mutant red aurora light through broken windows, ash
and grey fog in the air, hyper-detailed atmospheric realism,
anamorphic cinematic, 8k
```

> **Копируй как есть.** LoRA обучен на конкретных триггерах (`stalker veteran`,
> `SEVA suit`, `Ecologist detector`, `Pripyat 1986`). Перефразирование ломает
> consistency. Если нужно изменить позу/локацию — меняй **после** основного
> character block, не внутри.

## Tags

`stalker-horror, military, atmospheric, post-apocalyptic, soviet, recurring-character, primary-protagonist`

---

## Использование

В `scenario.json` для эпизода с Резником:

```json
{
  "id": "stalker-013",
  "genre": "stalker-horror",
  "text_provider": "lmstudio",
  "image_provider": "drawthings",
  "render_lora": "stalker_sdxl_lora_f16.ckpt",
  "render_seed": 42,
  "panels": [
    {
      "n": 1,
      "prompt": "<вставить Sample prompt целиком, плюс scene-specific описание>"
    },
    {
      "n": 2,
      "prompt": "<другая сцена, тот же character block, разные action>"
    }
  ]
}
```

**Рендер:**

```bash
python scripts/render_approved.py --scenario-id stalker-013
# → provider_router: genre=stalker-horror → text=lmstudio, image=drawthings
# → drawthings_client: seed=42, lora=stalker_sdxl_lora_f16.ckpt
```

**A/B verify** (side-by-side с разными seed'ами для поиска лучшего):

```bash
python scripts/ab_test_render.py --scenario-id stalker-013 --seed 42
# → data/comics/.ab/stalker-013/{minimax,drawthings}/{...} + compare.html
# Если лицо «плывёт» — выбери другой seed, обнови этот character sheet.
```

---

## Связанные

- `bible/README.md` — общий workflow
- `bible/_TEMPLATE_character.md` — шаблон для следующих персонажей
- `summary/audit/027_local-uncensored-stack.md` §6 — обоснование bible
- `py/render/drawthings_client.py` — `generate_image(prompt, ..., seed, lora)`
- `py/render/ab_renderer.py` — A/B harness для валидации
