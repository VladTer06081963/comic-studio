# Шрифты для Comic HTML Rendering

Все шрифты распространяются под **SIL Open Font License (OFL) v1.1**
и могут свободно коммититься в публичные репозитории без LFS.

## Скачанные файлы

| Файл | Семейство | Размер | Назначение |
|------|-----------|--------|------------|
| `Bangers.woff2` | Bangers | ~17 KB | `bubble`, `star`, `bar` |
| `Bangers-Bold.woff2` | Bangers | ~17 KB | Тот же Bangers (Google Fonts не отдаёт отдельный Bold-вес) |
| `UnifrakturCook.woff2` | UnifrakturCook | ~17 KB | `gothic` (blackletter) |
| `Bungee.woff2` | Bungee | ~14 KB | `boom` (impact, угловатый) |
| `Caveat.woff2` | Caveat | ~52 KB | `memo` (рукописный, кириллический subset) |

**Итого:** ~117 KB на 5 файлов. Все шрифты коммитятся в репо напрямую,
без `git lfs`, без CDN (OQ-4, OQ-7).

## Подмножества (subsets)

| Шрифт | Скачанный subset | Покрытие |
|-------|------------------|----------|
| Bangers | `latin` | U+0000–00FF — нет кириллицы |
| UnifrakturCook | `latin` | U+0000–00FF — нет кириллицы |
| Bungee | `latin` | U+0000–00FF — нет кириллицы |
| Caveat | `cyrillic` | U+0400–04FF — основная кириллица + латиница |

> **Замечание:** Bangers, Bungee и UnifrakturCook не имеют кириллических
> глифов в Google Fonts. Для русских подписей в этих стилях браузер
> автоматически использует fallback-шрифт (`system-ui, sans-serif` для
> bubble/star/bar; `serif` для gothic). Это согласуется с решением
> OQ-7 (только локальные шрифты) — дополнительные кириллические
> шрифты можно добавить позже, если потребуется.

## Лицензии (SIL OFL v1.1)

Полные тексты лицензий:
- Bangers: https://fonts.google.com/specimen/Bangers/license
- UnifrakturCook: https://fonts.google.com/specimen/UnifrakturCook/license
- Bungee: https://fonts.google.com/specimen/Bungee/license
- Caveat: https://fonts.google.com/specimen/Caveat/license

Краткая суть OFL:
- ✅ Свободное использование, встраивание, модификация
- ✅ Коммерческое использование без ограничений
- ❗ Модифицированные шрифты нельзя переименовывать и продавать под тем же именем
- ❗ Запрещено продавать шрифт отдельно (но допускается в составе приложения)

## Обновление шрифтов

Шрифты загружаются из Google Fonts. Для обновления версии используйте
скрипт `scripts/dev/download_fonts.py` (если он добавлен) или вручную:

```bash
curl -L -H "User-Agent: Mozilla/5.0 ..." \
  "https://fonts.googleapis.com/css2?family=Bangers&family=UnifrakturCook&family=Bungee&family=Caveat&display=swap" \
  | grep -oE "https://[^)]+\.woff2"
```

Затем скачать актуальные `.woff2` по этим URL.