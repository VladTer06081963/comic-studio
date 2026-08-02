## Why

`011_caption-font-and-bubble-sizes` показал, что Pillow как движок подписей достиг предела: 6 фиксированных стилей, один шрифт, невозможность хвоста в произвольную сторону, нет интерактива, нет адаптивности для мобильного браузера. Pillow-overlay остаётся полезным для PNG-preview (Telegram, Notion, archive), но как **основной** артефакт комикса HTML превосходит растровое изображение по качеству типографики, интерактивности, шерингу и responsive layout.

Этот change вводит **HTML-рендеринг комиксов** как основной артефакт (`.html`), сохраняя **PNG-preview** через существующий Pillow-overlay для backward-compat с Telegram, Notion, archive и social адаптерами. Дизайн следует **варианту B** из `PRD/HTML.md` (v0.2) и разрешает все 7 Open Questions (OQ-1..OQ-7).

## What Changes

- Добавить Python пакет `py/render/html_renderer/` с jinja2-шаблоном, inline-CSS и 6 локальными webfont (`woff2`) для типографики уровня профессиональных комиксов.
- Ввести **манифест** `data/comics/<id>/layout.json` — единый источник истины для HTML и PNG-preview (panels, captions, bubble styles, positions, tail coordinates, fonts, layout).
- Обновить `py/render/comic_assembler.assemble_comic` чтобы он генерил **и** HTML, **и** PNG-preview (через тот же `_comic_lib.assemble_grid`).
- Реализовать 6 базовых стилей баблов в CSS (bubble, star, gothic, boom, memo, bar) с CSS-анимацией `bubble-pop` (OQ-1: да).
- Не использовать CSS-фильтры для маскировки мусорного текста MiniMax в MVP (OQ-2: нет, future work).
- Layout.json хранится **на render** в `data/comics/<id>/layout.json` (OQ-3: да), не перезаписывается между render_revision'ами.
- 6 шрифтов в `py/render/html_renderer/static/fonts/*.woff2` коммитятся в репо напрямую, без `git lfs` (OQ-4: да, ~500KB).
- Notion comic mirror остаётся PNG-only, без HTML (OQ-5: нет в MVP).
- HTML использует **относительные пути** (`./fonts/Bangers.woff2`, `./panel_1.png`) для автономности (OQ-6: да).
- Шрифты **только локальные** через `@font-face` с `woff2`, без Google Fonts CDN (OQ-7: да).
- Web API отдаёт:
  - `GET /comics/<id>.html` — основной HTML-артефакт;
  - `GET /comics/<id>.png` — PNG-preview (existing, без изменений);
  - `GET /comics/<id>/static/comic.css` — inline-CSS (фактически не нужен, т.к. CSS inline);
  - `GET /comics/<id>/fonts/<name>.woff2` — локальные шрифты.
- Telegram по-прежнему отправляет PNG-фото; в caption добавляется строка «🔗 HTML: https://<host>/comics/<id>.html» (URL из `WEB_PUBLIC_URL` env).
- Реализовано как **4 фазных** change'а, но в этой OpenSpec-каркасе всё объединено (Phase 1: Foundation, Phase 2: Web API, Phase 3: Telegram + Docs, Phase 4: фиксация).
- Создать 2 новых capability main specs:
  - `web-comic-rendering` — Web API для HTML-комиксов;
  - `python-comic-rendering` — Python пакет `html_renderer` и Pillow-preview;
  - `web-comic-rendering-pipeline` — полный pipeline от scenario до HTML+PNG.

## Capabilities

### New Capabilities

- `web-comic-rendering` — Web API endpoints для отдачи HTML, PNG, статики (CSS, шрифты) и Content Negotiation. HTTP-маршрутизация в `web/app.js`, контроллеры в `web/routes/comics.js`.
- `python-comic-rendering` — Python пакет `py/render/html_renderer/` с jinja2-шаблоном, базовым CSS, 6 woff2-шрифтами, манифест-логикой и `assemble_comic` обновлён для генерации HTML+PNG.
- `web-comic-rendering-pipeline` — End-to-end pipeline: scenario → render → манифест → HTML → PNG-preview → promotion. Lifecycle: initial render и rerender.

### Modified Capabilities

- `web-scenario-operations` — расширяется `comic_path` semantics: `comic_path` остаётся PNG-preview, добавляется опциональное поле `html_path` в scenario record.
- `web-process-jobs` — render job теперь дополнительно эмитит `comic.html_generated` event; job type остаётся `render`, но payload может содержать `generated_html: true` (optional).

## Impact

- **Python:** новый пакет `py/render/html_renderer/` (~1.5k строк Python + 800 строк CSS + 500KB шрифтов). Зависимость: `jinja2` (добавить в `py/requirements.txt`). Pillow используется как раньше.
- **Web:** новые endpoints в `web/routes/comics.js`, статика в `web/app.js`, новый `web/lib/html_static.js` для отдачи файлов из `data/comics/<id>/`. Без новых npm-зависимостей.
- **Telegram:** `tg-bot/bot.js` дополняется `WEB_PUBLIC_URL` env и одной строкой в caption. Без новых зависимостей.
- **Документация:** `docs/api.md` (новые endpoints), `docs/workflow.md` (HTML-рендеринг в pipeline), `ALGORITM.md` (HTML-renderer в архитектуре), `CLAUDE.md` (новые правила), `README.md` (как открыть HTML).
- **Тесты:** новые Node-тесты в `web/tests/html_rendering.test.js` (5-7 тестов: endpoints, content negotiation, static), новые Python-тесты в `tests/test_html_renderer.py` (6-8 тестов: manifest, jinja2 render, font URLs, PNG-preview backward-compat).
- **Скоуп:** ~1500 строк нового кода, 6 woff2 файлов (~500KB), 13-15 тестов, обновлённая документация.

## Out of Scope (explicit)

- ❌ Не уходим от Pillow **полностью** — он остаётся для PNG-preview и legacy overlay.
- ❌ Не делаем **WYSIWYG-редактор** позиций баблов в браузере.
- ❌ Не делаем **PDF-экспорт** (хотя layout.json манифест это позволит в будущем).
- ❌ Не делаем **видео-комиксы** (motion graphics, ken-burns).
- ❌ Не делаем **CSS-фильтры** для маскировки мусорного текста MiniMax (OQ-2 отложен).
- ❌ Не делаем **Notion HTML mirror** (OQ-5 отложен).
- ❌ Не делаем **CDN для шрифтов** (OQ-7 отложен).
- ❌ Не переписываем **Telegram-бота** (только добавляется HTML-ссылка в caption).
- ❌ Не трогаем **archive** (старые PNG остаются, новые имеют и PNG, и HTML).
- ❌ Не делаем **content negotiation** через `Accept` header в MVP — отдельные endpoint'ы `/comics/<id>.html` и `/comics/<id>.png`.

## Verification

- `openspec validate --changes --strict` — ✓ `change/comic-html-rendering`.
- `openspec validate --specs --strict` — все specs (5: 3 new + 2 modified) валидны.
- `node --test` в `web/` — все тесты pass, включая новые `html_rendering.test.js`.
- `python3 -m unittest discover -s tests -p 'test_*.py'` — все тесты pass, включая `test_html_renderer.py`.
- `bash cron/nightly.sh --dry-run` — no side effects.
- Визуальная проверка: открыть `data/comics/<id>.html` в Chrome/Safari, убедиться что:
  - баблы корректные, шрифты загружаются (без 404 на woff2);
  - layout адаптивный (resize window, панели перестраиваются);
  - CSS-анимация `bubble-pop` работает (баблы появляются с задержкой);
  - PNG-preview в `data/comics/<id>.png` по-прежнему валиден и не сломан.
- Live MiniMax / Telegram / Notion calls — 0 в тестах.

## OpenSpec Linkage

- `proposal.md` (этот файл)
- `design.md` — архитектура и decisions
- `tasks.md` — phased rollout
- `specs/web-comic-rendering/spec.md` — new capability
- `specs/python-comic-rendering/spec.md` — new capability
- `specs/web-comic-rendering-pipeline/spec.md` — new capability
- `specs/web-scenario-operations/spec.md` — MODIFIED
- `specs/web-process-jobs/spec.md` — MODIFIED
