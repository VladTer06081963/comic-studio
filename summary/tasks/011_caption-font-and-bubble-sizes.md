# Задачи: Caption font and bubble sizes

## Статус: ✅ Done

Решение: хардкод в `py/render/_comic_lib.py` (вариант 1a). Применяем ко **всем 6 стилям** (bubble, star, gothic, boom, memo, bar). Только новые рендеры — существующие `data/comics/`, `data/scenarios/rendered/` и `data/archive/` не трогаем.

| ID | Задача | Статус |
|---|---|---|
| 1 | Увеличить базовый шрифт captions (`find_font(26)` → `find_font(40)`) | ✅ |
| 2 | Увеличить шрифт boom-стиля (`find_font(30)` → `find_font(46)`) | ✅ |
| 3 | Увеличить шрифт bar-стиля (`find_font(34)` → `find_font(52)`) | ✅ |
| 4 | Увеличить шрифт gothic-стиля (`_find_serif_font(26)` → `_find_serif_font(40)`) | ✅ |
| 5 | Поднять `pad` (внутренний отступ) 18 → 28, `tail_h` 28 → 40, `margin` 22 → 28 | ✅ |
| 6 | Wrap-лимит 14 → 10 символов в строке (больше строк, нет гигантских) | ✅ |
| 7 | Bubble radius `min(bh//2, 30)` → `min(bh//2, 44)` | ✅ |
| 8 | Stroke width bubble/star/gothic/boom 3 → 4 | ✅ |
| 9 | Star `r_out` +12, Boom `r_out` +16, Gothic wing 14→22, Memo fold 22→32, Memo shadow 6→10, Memo pin 28×8→40×12 | ✅ |
| 10 | Bar высота 64 → 96 px | ✅ |
| 11 | Убедиться что узкие стили не ломают панель: текст внутри бабла, баблы внутри панели | ✅ |

## Файлы

- `py/render/_comic_lib.py` — все изменения
- `summary/audit/011_caption-font-and-bubble-sizes.md`
- `summary/tasks/011_caption-font-and-bubble-sizes.md`

## Verification

- `node --test` — 59/59 passed.
- `python3 -m compileall -q py scripts tests` — без ошибок.
- Pillow-fallback через `ImageFont.load_default()` сохранён.
- Существующие `data/comics/`, `data/scenarios/rendered/`, `data/archive/` — не затронуты.

## Будущие улучшения (НЕ в этом change)

- **Env-конфиг `CAPTION_FONT_SCALE`** (float, default 1.0) — применить как множитель к `find_font(size)` и к `pad/tail_h/margin/r_out`. Позволит подкручивать размер без правки кода.
- **Per-style override** (например, `CAPTION_BUBBLE_SCALE`, `CAPTION_BOOM_SCALE`).
- **CLI-флаг** `--caption-font-scale` в `scripts/render_approved.py` для ad-hoc rerender.
- **Per-style шрифты**: жирный sans для `boom`, рукописный для `memo`, и т.д.

Если размер потребуется подкручивать, переход с хардкода на env-конфиг делается точечно в `py/render/_comic_lib.py` без изменения API.
