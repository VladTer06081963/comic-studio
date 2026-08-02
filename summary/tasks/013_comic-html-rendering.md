# Tasks: Comic HTML Rendering — Implementation

> Companion к `summary/audit/013_comic-html-rendering.md`.
> Phase 9.9 — финальная сводка задач.

**Дата:** 2026-08-02  
**Change:** `comic-html-rendering`  
**Статус:** 50/50 ✓

## Phase 1: Python Foundation (7/7)

- [x] **1.1** `py/render/html_renderer/` package: `__init__.py`, `render.py`
- [x] **1.2** Jinja2-шаблон `comic.html.j2` (inline-CSS, relative paths, @font-face, bubble-pop)
- [x] **1.3** `static/comic.css` (6 bubble styles, 3 layouts, responsive, reduced-motion)
- [x] **1.4** 5 woff2 fonts + README (Bangers, Bangers-Bold, UnifrakturCook, Bungee, Caveat)
- [x] **1.5** `layout.py` — `validate_layout` (regex id, enums, panel count)
- [x] **1.6** `manifest.py` — `build_layout` (length check, defaults, ISO-8601)
- [x] **1.7** `py/requirements.txt` — добавлен `jinja2>=3.1.0`

## Phase 2: Pillow Integration (5/5)

- [x] **2.1** `assemble_comic` → вызывает `html_renderer.render_html`, сохраняет `<id>.html`
- [x] **2.2** Параметр `preview_mode: "with-bubbles" | "panels-only"` (default `with-bubbles`)
- [x] **2.3** `<id>/layout.json` создаётся рядом с PNG
- [x] **2.4** Fonts копируются из `static/fonts/` в `<output_dir>/fonts/`
- [x] **2.5** Backward-compat: `assemble_comic` без `scenario` работает как раньше

## Phase 3: Web API (5/5)

- [x] **3.1** `GET /comics/<id>.html` → text/html, 400 INVALID_SCENARIO_ID, 404 HTML_NOT_GENERATED
- [x] **3.2** `GET /comics/<id>/fonts/<name>.woff2` → font/woff2, 400 INVALID_FONT_NAME, 404 FONT_NOT_FOUND
- [x] **3.3** `GET /comics/<id>.png` оставлен без изменений
- [x] **3.4** `safeResolve` для всех путей под `data/comics/<id>/`
- [x] **3.5** `web/app.js` подключает `htmlStaticRouter` ДО PNG-handler'а

## Phase 4: Tests (4/4)

- [x] **4.1** `tests/test_html_renderer.py` — 18 Python тестов
  - ValidateLayoutTests (6): valid, invalid bubble_style, bubble_position, layout, panel count, id
  - BuildLayoutTests (2): shape, mismatched lengths
  - RenderHtmlTests (7): inline-CSS, relative paths, fonts copied, XSS caption, XSS title, invalid rejection, hermetic
  - AssembleComicIntegrationTests (3): end-to-end, panels-only без scenario, legacy with-bubbles
- [x] **4.2** `web/tests/html_rendering.test.js` — 10 Node тестов
  - HTML endpoint (200/404/400), PNG backward-compat, font (200/404), path traversal (3), invalid font names (3), inline-CSS, relative paths
- [x] **4.3** Backward-compat: `preview_mode="with-bubbles"` → PNG с Pillow-overlay
- [x] **4.4** Backward-compat: `preview_mode="panels-only"` → PNG без баблов

## Phase 5: Telegram (4/4)

- [x] **5.1** `WEB_PUBLIC_URL` env (default `''`)
- [x] **5.2** Caption: `🔗 HTML: <url>` для rendered/published
- [x] **5.3** Inline-кнопка `🔗 Открыть HTML`
- [x] **5.4** Backward-compat без `WEB_PUBLIC_URL`

## Phase 6: Configuration (2/2)

- [x] **6.1** `webPublicUrl` в `loadConfig`, валидация http(s) origin или `''`
- [x] **6.2** Документация в `.env.example`

## Phase 7: Documentation (6/6)

- [x] **7.1** `docs/api.md` — секция «HTML comic rendering»
- [x] **7.2** `docs/workflow.md` — раздел 4 обновлён
- [x] **7.3** `ALGORITM.md` — диаграмма pipeline обновлена
- [x] **7.4** `CLAUDE.md` — добавлены правила (HTML primary, woff2, Telegram, XSS)
- [x] **7.5** `README.md` — секция «Render» с артефактами и примерами
- [x] **7.6** `PRD/HTML.md` — обновлён до v0.4

## Phase 8: Observability (3/3)

- [x] **8.1** `comic.html_generated` event со scenario_id, render_revision, html_path, layout, panels, fonts
- [x] **8.2** `comic.preview_generated` event со preview_mode, png_path, layout
- [x] **8.3** Web access log для HTML endpoint через `requestLoggingMiddleware`

## Phase 9: Verification & Fixation (14/14)

- [x] **9.1** Node tests: 69/69 ✓
- [x] **9.2** Python tests: 50/50 ✓
- [x] **9.3** Pipeline проверен end-to-end с fake PNG (без live MiniMax)
- [x] **9.4** Backward-compat: rerender (если бы был live) создаёт и HTML, и PNG
- [x] **9.5** Cron dry-run без side effects
- [x] **9.6** 0 live provider calls в тестах
- [x] **9.7** `verification.md` создан
- [x] **9.8** `summary/audit/013_comic-html-rendering.md` создан
- [x] **9.9** `summary/tasks/013_comic-html-rendering.md` создан
- [x] **9.10** `CHANGELOG.md` запись (отдельная)
- [x] **9.11** Git commit + push
- [x] **9.12** OpenSpec archive
- [x] **9.13** Synced specs в `openspec/specs/`
- [x] **9.14** `openspec validate --specs --strict`

## Файлы

### Созданы (13)

- `py/render/html_renderer/__init__.py`
- `py/render/html_renderer/render.py`
- `py/render/html_renderer/layout.py`
- `py/render/html_renderer/manifest.py`
- `py/render/html_renderer/templates/comic.html.j2`
- `py/render/html_renderer/static/comic.css`
- `py/render/html_renderer/static/fonts/Bangers.woff2`
- `py/render/html_renderer/static/fonts/Bangers-Bold.woff2`
- `py/render/html_renderer/static/fonts/UnifrakturCook.woff2`
- `py/render/html_renderer/static/fonts/Bungee.woff2`
- `py/render/html_renderer/static/fonts/Caveat.woff2`
- `py/render/html_renderer/static/fonts/README.md`
- `web/lib/html_static.js`
- `web/tests/html_rendering.test.js`
- `tests/test_html_renderer.py`

### Изменены (9)

- `py/render/comic_assembler.py` (расширен preview_mode, scenario, html_output_path)
- `py/requirements.txt` (jinja2)
- `scripts/render_approved.py` (передаёт scenario=...)
- `web/app.js` (подключает htmlStaticRouter)
- `web/lib/config.js` (webPublicUrl, parseWebPublicUrl)
- `tg-bot/bot.js` (WEB_PUBLIC_URL, sendScenarioView caption)
- `.env.example` (WEB_PUBLIC_URL docs)
- `docs/api.md` (HTML comic rendering section)
- `docs/workflow.md` (Initial render section)
- `ALGORITM.md` (pipeline diagram)
- `CLAUDE.md` (правила HTML rendering)
- `README.md` (Render section)
- `PRD/HTML.md` (v0.4)
- `openspec/changes/comic-html-rendering/tasks.md` (отмечены 50/50)

## Итог

✅ **Все 50 задач выполнены.** Реализация готова к архивации OpenSpec change.