## Context

`011_caption-font-and-bubble-sizes` зафиксировал, что Pillow-overlay баблов — это **максимум** того, что можно выжать из растрового движка без серьёзной переписывания. Текущая `_comic_lib.draw_caption_overlay` рисует bubble с хардкоженными polygon-tails, фиксированными 6 стилями и одним шрифтом. У нас 6 стилей, 1 шрифт, 0 интерактива, 0 адаптивности.

`comic-html-rendering` change вводит **HTML-рендеринг** как основной артефакт комикса, **сохраняя** Pillow-overlay для PNG-preview. Это **вариант B** из `PRD/HTML.md` (v0.2), все 7 Open Questions решены.

Сейчас `py/render/comic_assembler.assemble_comic` принимает `panel_paths`, `captions`, `output_path` и вызывает `_skill_lib.assemble_grid` → сохраняет PNG. Web API отдаёт только PNG через `GET /comics/<id>.png`. Telegram отправляет PNG-фото. Notion получает PNG (placeholder в `py/lib/notion_sync`).

Расширения должны оставаться в этой архитектуре и не дублировать logic.

## Goals / Non-Goals

**Goals:**

- HTML-страница `data/comics/<id>.html` — основной артефакт.
- PNG-preview `data/comics/<id>.png` — сохраняется для backward-compat.
- Layout-манифест `data/comics/<id>/layout.json` — единый источник истины.
- 6 базовых стилей баблов в CSS (bubble, star, gothic, boom, memo, bar) с CSS-анимацией `bubble-pop`.
- 6 woff2-шрифтов в репо, без `git lfs` и без CDN.
- `py/render/html_renderer/` пакет с jinja2-шаблоном, inline-CSS, манифест-логикой.
- `py/render/comic_assembler.assemble_comic` обновлён для генерации HTML+PNG.
- Web API: `GET /comics/<id>.html`, `GET /comics/<id>/fonts/<name>.woff2`.
- Telegram caption с HTML-ссылкой (env `WEB_PUBLIC_URL`).
- Inline-CSS в HTML для автономности (HTML можно расшарить как папку).
- Относительные пути (`./fonts/...`, `./panel_1.png`) в HTML.
- Backward-compat: `comic_path` в scenario указывает на PNG; `panel_paths` без изменений.

**Non-Goals:**

- ❌ Не уходим от Pillow полностью.
- ❌ Не делаем WYSIWYG-редактор, PDF-экспорт, видео-комиксы, CDN-шрифты, Notion HTML mirror, CSS-фильтры для мусора.
- ❌ Не делаем content negotiation через `Accept` header.
- ❌ Не переписываем Telegram-бота.
- ❌ Не трогаем archive.
- ❌ Не делаем `git lfs` для шрифтов (коммитим напрямую).
- ❌ Не используем Google Fonts CDN.

## Decisions

### Pillow сохраняется для PNG-preview, а HTML — основной артефакт

Альтернатива — полностью убрать Pillow и перейти на HTML-only — ломает backward-compat с Telegram, Notion, archive, social. Pillow-preview сохраняется как **минимум-совместимая** версия.

`py/render/comic_assembler.assemble_comic` теперь принимает параметр `preview_mode: "with-bubbles" | "panels-only"` (default: `with-bubbles` для backward-compat). Phase 1 MVP использует `with-bubbles` (как сейчас); Phase 2 может переключить на `panels-only` если Pillow-баблы решат убрать.

### Layout-манифест на render, не на scenario

`layout.json` хранит состояние **конкретного render_revision**: какие panels, какие captions, какие bubble styles и positions, какой layout. При rerender создаётся новый `layout.json` (старый остаётся в `data/.staging/legacy/<id>-<ts>/` если rerender через `moveToLegacyStaging`).

Альтернатива — хранить манифест в scenario record — раздувает `data/scenarios/<status>/<id>.json` (всё про revision, render metadata, и теперь ещё layout). Manifest — это **render-time артефакт**, не scenario-time.

### 6 базовых стилей в CSS, новые — добавление CSS-блока

Каждый стиль — отдельный CSS-блок в `py/render/html_renderer/static/comic.css`:

```css
.bubble--bubble { background: white; border: 3px solid black; border-radius: 22px; }
.bubble--star   { background: gold; clip-path: polygon(12-point starburst); }
.bubble--gothic { background: black; color: gold; font-family: 'UnifrakturCook'; }
.bubble--boom   { background: linear-gradient(red, orange); animation: shake 0.3s; }
.bubble--memo   { background: #fff078; transform: rotate(-2deg); }
.bubble--bar    { /* full-width bar — отдельный CSS, не bubble */ }
```

Добавление нового стиля = добавление CSS-блока + регистрация в `bubble_styles` валидаторе (Python). Никаких правок Python-кода рендеринга.

### 6 шрифтов в репо, без LFS и CDN

| Стиль | Шрифт | Назначение | ~KB |
|---|---|---|---|
| bubble | **Bangers** | классический комикс-bubble | 30 |
| star | **Bangers Bold** | звезда-взрыв | 30 |
| gothic | **UnifrakturCook** | готический blackletter | 50 |
| boom | **Bungee** | импакт-эффект | 40 |
| memo | **Caveat** | рукописный Post-It | 50 |
| bar | **Bangers** | полноширинная полоса | 30 |

Суммарно ~230KB woff2 + ~270KB лицензии/README = ~500KB. Коммитим напрямую в `py/render/html_renderer/static/fonts/`. README в той же папке с указанием Open Font License (OFL).

Альтернативы:
- `git lfs` — требует LFS-настройки у всех, кто клонирует. Отвергнуто.
- Google Fonts CDN — зависимость от `fonts.googleapis.com`, может быть заблокирован. Отвергнуто.
- Lazy download при первом запуске — добавляет complexity в renderer. Отвергнуто.

### Inline-CSS в HTML, не external stylesheet

CSS встраивается в `<style>` блок в `<head>` HTML. Так HTML автономен (можно расшарить как папку, открыть офлайн, упаковать в `.zip`).

Альтернатива — external `comic.css` — позволяет shared cache между комиксами (один CSS на все), но ломает автономность. Phase 4 может добавить inline-кеш через shared static endpoint.

### Относительные пути в HTML

```html
<img src="./panel_1.png" alt="...">
<style>
@font-face {
  font-family: 'Bangers';
  src: url('./fonts/Bangers.woff2') format('woff2');
}
</style>
```

Автономность. При deploy за reverse-proxy с подпутью `/studio/...` — настраивается через `<base href>` (если используется reverse-proxy с rewrite) или полными URL (если публичный).

### CSS-анимация `bubble-pop`

```css
@keyframes bubble-pop {
  0%   { transform: scale(0.8); opacity: 0; }
  100% { transform: scale(1.0); opacity: 1; }
}

.bubble {
  animation: bubble-pop 200ms ease-out backwards;
}

.panel:nth-child(1) .bubble { animation-delay: 0ms; }
.panel:nth-child(2) .bubble { animation-delay: 80ms; }
.panel:nth-child(3) .bubble { animation-delay: 160ms; }
.panel:nth-child(4) .bubble { animation-delay: 240ms; }
.panel:nth-child(5) .bubble { animation-delay: 320ms; }
.panel:nth-child(6) .bubble { animation-delay: 400ms; }
```

Лёгкая, не раздражающая, даёт эффект «комикс оживает» при загрузке.

### HTML через jinja2, не строковая интерполяция

Используем `jinja2.Template` (уже может быть в зависимостях Python) для шаблона `py/render/html_renderer/templates/comic.html.j2`. Безопасная авто-эскейп-логика для captions и titles. Никаких f-string'ов с пользовательским вводом.

### Backward-compat: `comic_path` остаётся PNG

Scenario record в `data/scenarios/rendered/<id>.json` хранит:
- `comic_path` — путь к PNG (existing, не меняется);
- `panel_paths` — пути к панелям (existing, не меняются);
- `render_revision` — счётчик (existing).

НЕ добавляем `html_path` в scenario record — `html_path` всегда вычисляется из `id` (predictable path `data/comics/<id>.html`). Это упрощает lifecycle: scenario не знает про HTML, HTML генерируется как side-effect render.

### Layout-валидация: что внутри `layout.json`?

```json
{
  "id": "c6964b6a",
  "title": "...",
  "tone": "...",
  "image_style": "comic",
  "layout": "comic",
  "created_at": "2026-08-02T20:52:19Z",
  "fonts": {
    "bubble": "Bangers",
    "star": "Bangers",
    "gothic": "UnifrakturCook",
    "boom": "Bungee",
    "memo": "Caveat",
    "bar": "Bangers"
  },
  "panels": [
    {
      "n": 1,
      "image": "panel_1.png",
      "caption": "...",
      "bubble_style": "bubble",
      "bubble_position": "bottom-left"
    }
  ]
}
```

Валидация в `html_renderer.validate_layout(layout)`:
- `id` обязателен, `[A-Za-z0-9_-]{4,64}`;
- `layout` ∈ `["comic", "grid", "vertical"]`;
- `panels` непустой, 3-4 элемента (per LIFECYCLE_CASES, как в `py/scenario/writer.py`);
- каждый panel: `image` существует, `bubble_style` ∈ `["bubble", "star", "gothic", "boom", "memo", "bar", "none"]`, `bubble_position` ∈ `["bottom-left", "top-right", "bottom-right", "top-left"]`.

## Risks / Trade-offs

- [Pillow-откат] Если `py/render/html_renderer/` сломается, `assemble_comic` падает fallback на PNG-only (без HTML). Минимальный риск — Pillow уже работает.
- [Шрифты 500KB] +0.5MB к репо. Терпимо, но будущие 5-10 шрифтов дадут 1-2MB. Альтернатива — динамическая загрузка шрифтов из CDN или внешнего URL — отвергнута для MVP.
- [CSS-анимация] может раздражать если много панелей (>6). Phase 4 — настройка `prefers-reduced-motion` media query.
- [inline-CSS] увеличивает размер HTML (~5-10KB на комикс), но это OK для self-contained.
- [Manifest-валидация] при добавлении нового стиля нужно обновлять `bubble_styles` валидатор. Минимальный risk, легко отслеживается.
- [Tail HTML] хвостик bubble через CSS `::after` с borders — работает, но **позиционирование** привязано к `bubble_position` (bottom-left / top-right / ...). Если персонаж в центре панели — хвостик может не доставать. Phase 2 — `tail_to` координаты в манифесте, как в `PRD/HTML.md` §5.2.
- [Backwards-compat render_revision] — старые `data/comics/<id>/` с PNG-only (без `layout.json`) должны **оставаться доступными**. Реализация: если `layout.json` отсутствует, генерируем на лету из scenario record + `panel_paths`.

## Migration Plan

1. **Pre-Phase**: OpenSpec change archived (`comic-html-rendering`).
2. **Phase 1 (Foundation)**:
   - Создать `py/render/html_renderer/` пакет с `__init__.py`, `render.py`, `templates/comic.html.j2`, `static/comic.css`, `static/fonts/*.woff2` (6 файлов + README).
   - `py/render/comic_assembler.assemble_comic` обновлён: генерит HTML + PNG.
   - Тесты: `tests/test_html_renderer.py` с 6-8 тестами.
3. **Phase 2 (Web API)**:
   - `web/routes/comics.js` дополнен: `GET /comics/<id>.html` endpoint.
   - `web/lib/html_static.js` для отдачи `fonts/*.woff2` из `data/comics/<id>/`.
   - Тесты: `web/tests/html_rendering.test.js` с 5-7 тестами.
4. **Phase 3 (Telegram + Docs)**:
   - `tg-bot/bot.js`: добавить `WEB_PUBLIC_URL` env и HTML-ссылку в caption.
   - `docs/api.md`, `docs/workflow.md`, `ALGORITM.md`, `CLAUDE.md`, `README.md` обновлены.
5. **Phase 4 (Фиксация)**:
   - `verification.md` сохранён.
   - Аудит `summary/audit/013_comic-html-rendering.md`.
   - Таски `summary/tasks/013_comic-html-rendering.md`.
   - `CHANGELOG.md` запись.
   - `git commit` + `git push`.
   - OpenSpec change archived.
6. **Rollback**:
   - Если Phase 1 ломает Pillow, откатить коммит (HTML генерится, но PNG-preview остаётся как был).
   - Если Phase 2 ломает Web API, откатить endpoints (PNG-preview не задет).
   - Pillow-preview **никогда** не ломается — это baseline.

## Open Questions

Нет. Все OQ-1..OQ-7 решены в `PRD/HTML.md` v0.2 (см. §9). Шрифты, animation, layout, Notion, paths, CDN — зафиксированы.
