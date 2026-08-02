## 1. Python Foundation

- [x] 1.1 Создать `py/render/html_renderer/` пакет с `__init__.py`, `render.py` (entry point `render_html(layout, output)`).
- [x] 1.2 Создать jinja2-шаблон `py/render/html_renderer/templates/comic.html.j2` с inline-CSS, относительными путями, `@font-face` для 6 шрифтов, CSS-анимацией `bubble-pop` (OQ-1: да).
- [x] 1.3 Создать `py/render/html_renderer/static/comic.css` с 6 базовыми стилями баблов (bubble, star, gothic, boom, memo, bar) + responsive layout (comic, grid, vertical).
- [x] 1.4 Скачать и положить в `py/render/html_renderer/static/fonts/` 6 woff2: Bangers, Bangers Bold, UnifrakturCook, Bungee, Caveat, README с OFL-лицензиями (OQ-4: в репо без LFS, ~500KB).
- [x] 1.5 Реализовать `py/render/html_renderer/layout.py` с функцией `validate_layout(layout)` (id regex, layout enum, panel count 3-4, bubble_style enum, bubble_position enum).
- [x] 1.6 Реализовать `py/render/html_renderer/manifest.py` с функцией `build_layout(scenario, panel_paths, captions, bubble_styles, bubble_positions, layout, fonts)` возвращающей dict для сериализации.
- [x] 1.7 Добавить `jinja2` в `py/requirements.txt` (проверить, есть ли уже).

## 2. Pillow Integration

- [x] 2.1 Обновить `py/render/comic_assembler.assemble_comic` чтобы после сборки PNG-preview он вызывал `html_renderer.render_html(layout, output_html)` и сохранял `data/comics/<id>.html`.
- [x] 2.2 Добавить параметр `preview_mode: "with-bubbles" | "panels-only"` в `assemble_comic` (default: `with-bubbles` для backward-compat).
- [x] 2.3 Обеспечить что `data/comics/<id>/layout.json` создаётся в `comic_assembler.assemble_comic` рядом с PNG.
- [x] 2.4 Скопировать `py/render/html_renderer/static/fonts/` в `data/comics/<id>/fonts/` (для автономности HTML).
- [x] 2.5 Backward-compat: если `layout.json` отсутствует (старый рендер), `html_renderer` генерирует манифест на лету из scenario record + `panel_paths`.

## 3. Web API

- [x] 3.1 Добавить `GET /comics/<id>.html` endpoint в `web/routes/comics.js` — отдаёт `text/html` из `data/comics/<id>.html` с правильным Content-Type.
- [x] 3.2 Добавить `GET /comics/<id>/fonts/<name>.woff2` endpoint в `web/lib/html_static.js` — отдаёт `font/woff2` с правильным Content-Type и Cache-Control.
- [x] 3.3 Оставить `GET /comics/<id>.png` как есть (PNG-preview, existing).
- [x] 3.4 Добавить `safeResolve` для всех путей под `data/comics/<id>/` (FR-8 backward-compat, NFR-7 FS safety).
- [x] 3.5 Обновить `web/app.js` чтобы зарегистрировать новые endpoints.

## 4. Tests

- [x] 4.1 Python-тесты `tests/test_html_renderer.py` (18 тестов): validate_layout (valid + invalid bubble_style, bubble_position, layout, panel count, id), build_layout (shape, mismatched lengths), render_html (HTML file, inline-CSS, относительные пути, копия шрифтов, XSS escape), assemble_comic end-to-end (PNG+HTML+layout.json, backward-compat).
- [x] 4.2 Node-тесты `web/tests/html_rendering.test.js` (10 тестов): HTML endpoint (200, 404 HTML_NOT_GENERATED, 400 INVALID_SCENARIO_ID), PNG backward-compat, font endpoint (200 font/woff2, 404 FONT_NOT_FOUND), path traversal rejection (encoded `%2e%2e`, `\\..\\`, wrong extensions), inline-CSS check, относительные пути.
- [x] 4.3 Backward-compat тест: `assemble_comic(..., preview_mode="with-bubbles")` создаёт PNG с Pillow-overlay (`test_assemble_with_bubbles_legacy_keeps_pillow_overlay`).
- [x] 4.4 Backward-compat тест: `assemble_comic(..., preview_mode="panels-only")` создаёт PNG без баблов (`test_assemble_panels_only_no_html_when_no_scenario`).

## 5. Telegram

- [x] 5.1 `tg-bot/bot.js`: добавить `WEB_PUBLIC_URL` env (optional, default `''`).
- [x] 5.2 В `sendScenarioView` после успешного ответа добавить строку в caption: `🔗 HTML: <WEB_PUBLIC_URL>/comics/<id>.html` (если `WEB_PUBLIC_URL` задан).
- [x] 5.3 Telegraf `Markup.button.url('🔗 Открыть HTML', url)` inline-кнопка под фото (если URL задан).
- [x] 5.4 Backward-compat: если `WEB_PUBLIC_URL` не задан, Telegram-бот работает как раньше (только фото).

## 6. Configuration

- [x] 6.1 Добавить `WEB_PUBLIC_URL` в `web/lib/config.js` с bounded validation (URL или пустая строка).
- [x] 6.2 Документировать `WEB_PUBLIC_URL` в `.env.example` с дефолтом `''` и примером `https://studio.example.com`.

## 7. Documentation

- [x] 7.1 `docs/api.md` — добавлена секция «HTML comic rendering» с описанием endpoints и `WEB_PUBLIC_URL` env.
- [x] 7.2 `docs/workflow.md` — обновлён раздел 4 «Initial render» с упоминанием HTML, layout.json, fonts/.
- [x] 7.3 `ALGORITM.md` — обновлена диаграмма pipeline (HTML + PNG-preview артефакты).
- [x] 7.4 `CLAUDE.md` — добавлены правила: HTML primary artifact, шрифты в репо, Telegram caption ссылается на HTML, XSS escape через jinja2 autoescape.
- [x] 7.5 `README.md` — секция «Render» обновлена с описанием артефактов и примерами открытия HTML.
- [x] 7.6 `PRD/HTML.md` — обновлён до v0.4 (что сделано по фазам).

## 8. Observability

- [x] 8.1 `comic.html_generated` event в `py/render/comic_assembler` со `scenario_id`, `render_revision`, `html_path`, `layout`, `panels`, `fonts`.
- [x] 8.2 `comic.preview_generated` event со `scenario_id`, `preview_mode`, `png_path`, `layout`.
- [x] 8.3 Web access log для `GET /comics/<id>.html` 200/404 — покрывается существующим `requestLoggingMiddleware` в `web/lib/logger.js` (логирует method, path, status, duration_ms, request_id для всех routes, включая новый HTML endpoint).

## 9. Verification & Fixation

- [x] 9.1 Прогнать полный Node test suite: `cd web && node --test`. Все 59 + новые тесты pass.
- [x] 9.2 Прогнать полный Python test suite: `python3 -m unittest discover -s tests -p 'test_*.py'`. Все 28 + новые тесты pass.
- [x] 9.3 Визуальная проверка: rerender `c6964b6a`, открыть `data/comics/c6964b6a.html` в Chrome/Safari, проверить шрифты, баблы, анимацию, responsive layout.
- [x] 9.4 Backward-compat: rerender через `python3 scripts/render_approved.py --scenario-id c6964b6a --rerender --staging-dir X` создаёт и HTML, и PNG.
- [x] 9.5 `bash cron/nightly.sh --dry-run` — no side effects.
- [x] 9.6 Live MiniMax / Telegram calls — 0 в тестах.
- [x] 9.7 `verification.md` сохранён с детальной сводкой.
- [x] 9.8 `summary/audit/013_comic-html-rendering.md` создан.
- [x] 9.9 `summary/tasks/013_comic-html-rendering.md` создан.
- [x] 9.10 `CHANGELOG.md` запись с детальной сводкой.
- [x] 9.11 `git commit` + `git push`.
- [x] 9.12 OpenSpec change `comic-html-rendering` archived.
- [x] 9.13 Синхронизировать 3 новых capability main specs (`web-comic-rendering`, `python-comic-rendering`, `web-comic-rendering-pipeline`) и 2 обновлённых (`web-scenario-operations`, `web-process-jobs`) в `openspec/specs/`.
- [x] 9.14 `openspec validate --specs --strict` — все specs валидны.
