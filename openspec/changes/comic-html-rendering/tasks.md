## 1. Python Foundation

- [ ] 1.1 Создать `py/render/html_renderer/` пакет с `__init__.py`, `render.py` (entry point `render_html(layout, output)`).
- [ ] 1.2 Создать jinja2-шаблон `py/render/html_renderer/templates/comic.html.j2` с inline-CSS, относительными путями, `@font-face` для 6 шрифтов, CSS-анимацией `bubble-pop` (OQ-1: да).
- [ ] 1.3 Создать `py/render/html_renderer/static/comic.css` с 6 базовыми стилями баблов (bubble, star, gothic, boom, memo, bar) + responsive layout (comic, grid, vertical).
- [ ] 1.4 Скачать и положить в `py/render/html_renderer/static/fonts/` 6 woff2: Bangers, Bangers Bold, UnifrakturCook, Bungee, Caveat, README с OFL-лицензиями (OQ-4: в репо без LFS, ~500KB).
- [ ] 1.5 Реализовать `py/render/html_renderer/layout.py` с функцией `validate_layout(layout)` (id regex, layout enum, panel count 3-4, bubble_style enum, bubble_position enum).
- [ ] 1.6 Реализовать `py/render/html_renderer/manifest.py` с функцией `build_layout(scenario, panel_paths, captions, bubble_styles, bubble_positions, layout, fonts)` возвращающей dict для сериализации.
- [ ] 1.7 Добавить `jinja2` в `py/requirements.txt` (проверить, есть ли уже).

## 2. Pillow Integration

- [ ] 2.1 Обновить `py/render/comic_assembler.assemble_comic` чтобы после сборки PNG-preview он вызывал `html_renderer.render_html(layout, output_html)` и сохранял `data/comics/<id>.html`.
- [ ] 2.2 Добавить параметр `preview_mode: "with-bubbles" | "panels-only"` в `assemble_comic` (default: `with-bubbles` для backward-compat).
- [ ] 2.3 Обеспечить что `data/comics/<id>/layout.json` создаётся в `comic_assembler.assemble_comic` рядом с PNG.
- [ ] 2.4 Скопировать `py/render/html_renderer/static/fonts/` в `data/comics/<id>/fonts/` (для автономности HTML).
- [ ] 2.5 Backward-compat: если `layout.json` отсутствует (старый рендер), `html_renderer` генерирует манифест на лету из scenario record + `panel_paths`.

## 3. Web API

- [ ] 3.1 Добавить `GET /comics/<id>.html` endpoint в `web/routes/comics.js` — отдаёт `text/html` из `data/comics/<id>.html` с правильным Content-Type.
- [ ] 3.2 Добавить `GET /comics/<id>/fonts/<name>.woff2` endpoint в `web/lib/html_static.js` — отдаёт `font/woff2` с правильным Content-Type и Cache-Control.
- [ ] 3.3 Оставить `GET /comics/<id>.png` как есть (PNG-preview, existing).
- [ ] 3.4 Добавить `safeResolve` для всех путей под `data/comics/<id>/` (FR-8 backward-compat, NFR-7 FS safety).
- [ ] 3.5 Обновить `web/app.js` чтобы зарегистрировать новые endpoints.

## 4. Tests

- [ ] 4.1 Python-тесты `tests/test_html_renderer.py`:
  - `validate_layout` принимает валидный манифест;
  - `validate_layout` отклоняет невалидный `bubble_style`;
  - `validate_layout` отклоняет невалидный `layout`;
  - `validate_layout` отклоняет panel count ≠ 3-4;
  - `build_layout` создаёт корректный dict;
  - `render_html` создаёт HTML-файл с inline-CSS;
  - `render_html` использует относительные пути для шрифтов и панелей;
  - `render_html` работает без live MiniMax (моки, fake fixtures).
- [ ] 4.2 Node-тесты `web/tests/html_rendering.test.js`:
  - `GET /comics/<id>.html` возвращает 200 text/html;
  - `GET /comics/<id>.png` по-прежнему возвращает 200 image/png (backward-compat);
  - `GET /comics/<id>/fonts/Bangers.woff2` возвращает 200 font/woff2;
  - `GET /comics/<id>/fonts/Nonexistent.woff2` возвращает 404;
  - `safeResolve` не пропускает `..` в путях;
  - HTML содержит inline-CSS (без external `comic.css` ссылок);
  - HTML содержит относительные пути (`./panel_*.png`, `./fonts/*.woff2`).
- [ ] 4.3 Backward-compat тест: `assemble_comic(..., preview_mode="with-bubbles")` создаёт PNG с Pillow-overlay (как сейчас, не сломан).
- [ ] 4.4 Backward-compat тест: `assemble_comic(..., preview_mode="panels-only")` создаёт PNG без баблов (только layout панелей).

## 5. Telegram

- [ ] 5.1 `tg-bot/bot.js`: добавить `WEB_PUBLIC_URL` env (optional, default `''`).
- [ ] 5.2 В callback'ах `publish:` и `render:` после успешного ответа добавить строку в caption: `🔗 HTML: <WEB_PUBLIC_URL>/comics/<id>.html` (если `WEB_PUBLIC_URL` задан).
- [ ] 5.3 Telegraf `Markup.button.url('Открыть HTML', url)` inline-кнопка под фото (если URL задан).
- [ ] 5.4 Backward-compat: если `WEB_PUBLIC_URL` не задан, Telegram-бот работает как раньше (только фото).

## 6. Configuration

- [ ] 6.1 Добавить `WEB_PUBLIC_URL` в `web/lib/config.js` с bounded validation (URL или пустая строка).
- [ ] 6.2 Документировать `WEB_PUBLIC_URL` в `.env.example` с дефолтом `''` и примером `https://studio.example.com`.

## 7. Documentation

- [ ] 7.1 `docs/api.md` — добавить секцию «HTML comic rendering» с описанием `GET /comics/<id>.html`, `GET /comics/<id>/fonts/<name>.woff2`, `WEB_PUBLIC_URL` env.
- [ ] 7.2 `docs/workflow.md` — обновить раздел 4 «Initial render» с упоминанием HTML-артефакта и манифеста.
- [ ] 7.3 `ALGORITM.md` — обновить раздел 5 «Render» с диаграммой HTML+PNG-preview pipeline.
- [ ] 7.4 `CLAUDE.md` — добавить правила: «HTML — primary artifact, PNG — preview fallback», «woff2 в репо, не через CDN», «Telegram caption ссылается на HTML».
- [ ] 7.5 `README.md` — обновить секцию «Render» с примером «как открыть HTML комикса».
- [ ] 7.6 `PRD/HTML.md` — обновить до v0.3 после реализации (что сделано, что не сделано).

## 8. Observability

- [ ] 8.1 Добавить `comic.html_generated` event в `py/render/comic_assembler` (с `scenario_id`, `render_revision`, `html_path`, `layout`).
- [ ] 8.2 Добавить `comic.preview_generated` event с `preview_mode` (`with-bubbles` / `panels-only`).
- [ ] 8.3 Web access log: логировать `GET /comics/<id>.html` 200/404 с request_id.

## 9. Verification & Fixation

- [ ] 9.1 Прогнать полный Node test suite: `cd web && node --test`. Все 59 + новые тесты pass.
- [ ] 9.2 Прогнать полный Python test suite: `python3 -m unittest discover -s tests -p 'test_*.py'`. Все 28 + новые тесты pass.
- [ ] 9.3 Визуальная проверка: rerender `c6964b6a`, открыть `data/comics/c6964b6a.html` в Chrome/Safari, проверить шрифты, баблы, анимацию, responsive layout.
- [ ] 9.4 Backward-compat: rerender через `python3 scripts/render_approved.py --scenario-id c6964b6a --rerender --staging-dir X` создаёт и HTML, и PNG.
- [ ] 9.5 `bash cron/nightly.sh --dry-run` — no side effects.
- [ ] 9.6 Live MiniMax / Telegram calls — 0 в тестах.
- [ ] 9.7 `verification.md` сохранён с детальной сводкой.
- [ ] 9.8 `summary/audit/013_comic-html-rendering.md` создан.
- [ ] 9.9 `summary/tasks/013_comic-html-rendering.md` создан.
- [ ] 9.10 `CHANGELOG.md` запись с детальной сводкой.
- [ ] 9.11 `git commit` + `git push`.
- [ ] 9.12 OpenSpec change `comic-html-rendering` archived.
- [ ] 9.13 Синхронизировать 3 новых capability main specs (`web-comic-rendering`, `python-comic-rendering`, `web-comic-rendering-pipeline`) и 2 обновлённых (`web-scenario-operations`, `web-process-jobs`) в `openspec/specs/`.
- [ ] 9.14 `openspec validate --specs --strict` — все specs валидны.
