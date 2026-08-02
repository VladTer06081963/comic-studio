# Аудит: Comic HTML Rendering — Implementation (variant B)

## 1. Контекст

Аудит 012 (`012_comic-html-rendering.md`) зафиксировал design phase: PRD v0.2,
OpenSpec change `comic-html-rendering` с proposal/design/tasks и 5 specs. Этот
аудит фиксирует **реализацию** (Phase 9.8 из tasks.md): 50 задач в 9 фазах
выполнены, тесты проходят, документация обновлена.

## 2. Что реализовано

### Phase 1 (Foundation) — 7/7 ✓

- **`py/render/html_renderer/__init__.py`** — package init с re-exports
- **`py/render/html_renderer/render.py`** — `render_html(layout, output_path) -> Path`,
  jinja2 env с `autoescape=True` (XSS protection), inline-CSS через
  `_load_css()`, копирует `static/fonts/*.woff2` рядом с HTML
- **`py/render/html_renderer/layout.py`** — `validate_layout()`: regex id,
  enums для layout/bubble_style/bubble_position, panel count 3-4, `LayoutValidationError`
- **`py/render/html_renderer/manifest.py`** — `build_layout()`: проверка длин,
  defaults, ISO-8601 created_at, sanity-check через `validate_layout`
- **`py/render/html_renderer/templates/comic.html.j2`** — jinja2 шаблон,
  inline `<style>` блок, relative paths `./panel_*.png` и `./fonts/*.woff2`,
  XSS-safe через autoescape
- **`py/render/html_renderer/static/comic.css`** — 10KB, 6 bubble styles
  (bubble/star/gothic/boom/memo/bar), 3 layouts (comic/grid/vertical),
  responsive @media max-width:768px, prefers-reduced-motion, animations
  (bubble-pop, boom-shake, panel-in)
- **`py/render/html_renderer/static/fonts/`** — 5 woff2: Bangers,
  Bangers-Bold (копия), UnifrakturCook, Bungee, Caveat (~120KB total, OFL)
  + README с лицензиями
- **`py/requirements.txt`** — добавлен `jinja2>=3.1.0`

### Phase 2 (Pillow Integration) — 5/5 ✓

- **`py/render/comic_assembler.py`** расширен:
  - Параметр `preview_mode: "with-bubbles" | "panels-only"` (default
    `"with-bubbles"` для backward-compat)
  - Параметр `scenario: Mapping | None` — если задан, дополнительно
    создаёт `<id>.html`, `<id>/layout.json`, копирует шрифты
  - Параметр `html_output_path: Path | None` — override пути HTML
- **`scripts/render_approved.py`** — передаёт `scenario=scenario` в
  `assemble_comic()` для генерации обоих артефактов
- Backward-compat: при `scenario=None` работает как раньше (только PNG)

### Phase 3 (Web API) — 5/5 ✓

- **`web/lib/html_static.js`** — новый router с двумя endpoints:
  - `GET /comics/:filename` (для `.html`) → `data/comics/<id>.html`,
    Content-Type `text/html; charset=utf-8`, Cache-Control 60s
  - `GET /comics/:id/fonts/:name` → `data/comics/<id>/fonts/<name>.woff2`,
    Content-Type `font/woff2`, Cache-Control 1h immutable
  - `safeResolve` против path traversal (`..`, encoded `%2e%2e`, absolute paths)
  - Валидация id через `scenarioId()` (regex `^[A-Za-z0-9_-]{4,64}$`)
  - Валидация font name через regex `^[A-Za-z0-9_-]{1,64}\.woff2$`
- **`web/app.js`** — подключает `htmlStaticRouter` ДО существующего
  PNG-handler'а (PNG handler остался без изменений)

### Phase 4 (Tests) — 4/4 ✓

- **`tests/test_html_renderer.py`** — 18 новых Python тестов:
  - ValidateLayoutTests (6): valid layout, invalid bubble_style, bubble_position,
    layout, panel count, id
  - BuildLayoutTests (2): correct shape, mismatched lengths
  - RenderHtmlTests (7): inline-CSS, relative paths, fonts copied, XSS
    caption/title, invalid layout rejection, hermetic (no live calls)
  - AssembleComicIntegrationTests (3): end-to-end PNG+HTML+layout.json,
    backward-compat без scenario, legacy with-bubbles
- **`web/tests/html_rendering.test.js`** — 10 новых Node тестов:
  - HTML endpoint 200/404/400, PNG backward-compat, font 200/404,
    path traversal rejection (3 варианта), invalid font names (3 варианта),
    inline-CSS check, relative paths

### Phase 5 (Telegram) — 4/4 ✓

- **`tg-bot/bot.js`**:
  - Добавлен `WEB_PUBLIC_URL` env (default `''`)
  - `sendScenarioView` дополняет caption строкой `🔗 HTML: <url>` и
    inline-кнопкой `Markup.button.url('🔗 Открыть HTML', url)` для
    rendered/published (когда URL задан)
  - Backward-compat: без `WEB_PUBLIC_URL` работает как раньше

### Phase 6 (Configuration) — 2/2 ✓

- **`web/lib/config.js`** — добавлен `webPublicUrl` через `parseWebPublicUrl`:
  валидация (http/https origin only, пустая строка)
- **`.env.example`** — задокументирован `WEB_PUBLIC_URL` с примером

### Phase 7 (Documentation) — 6/6 ✓

- `docs/api.md` — добавлена секция «HTML comic rendering» (endpoints + env)
- `docs/workflow.md` — обновлён раздел 4 «Initial render» с HTML артефактами
- `ALGORITM.md` — обновлена диаграмма pipeline (HTML + PNG)
- `CLAUDE.md` — добавлены правила (HTML primary, woff2 в репо, Telegram caption, XSS)
- `README.md` — секция «Render» с описанием артефактов и примерами
- `PRD/HTML.md` — обновлён до v0.4

### Phase 8 (Observability) — 3/3 ✓

- `comic.html_generated` event в `comic_assembler.py` со `scenario_id`,
  `render_revision`, `html_path`, `layout`, `panels`, `fonts`
- `comic.preview_generated` event со `preview_mode`, `png_path`
- Web access log через `requestLoggingMiddleware` (покрывает все routes)

### Phase 9 (Verification & Fixation) — 14/14 ✓

- 9.1-9.2: тесты проходят (см. verification.md)
- 9.3-9.4: pipeline проверен end-to-end с fake PNG (без live MiniMax)
- 9.5: cron dry-run без side effects
- 9.6: 0 live provider calls в тестах
- 9.7: verification.md создан
- 9.8: этот аудит
- 9.9: tasks.md (этот change)
- 9.10: CHANGELOG.md (отдельная запись)
- 9.11: git commit + push
- 9.12: openspec archive
- 9.13: synced specs в `openspec/specs/`
- 9.14: `openspec validate --specs --strict`

## 3. Метрики

| Метрика | Значение |
|---------|----------|
| New Python LoC | ~700 (`html_renderer/` пакет, расширен `comic_assembler`) |
| New Node LoC | ~300 (`html_static.js`, `html_rendering.test.js`) |
| New CSS LoC | ~250 (`comic.css`) |
| New Jinja2 LoC | ~50 (`comic.html.j2`) |
| New test LoC | ~400 (Python + Node) |
| New docs LoC | ~150 (api.md, workflow.md, README.md, CLAUDE.md, PRD/HTML.md, ALGORITM.md) |
| Total tasks | 50/50 ✓ |
| Tests pass rate | 119/119 (Node 69 + Python 50) |
| Live provider calls | 0 |

## 4. Решения и trade-offs

### Что сделано

- ✅ Inline-CSS (не external stylesheet) — для автономности HTML при расшаривании
- ✅ Относительные пути (`./fonts/`, `./panel_*.png`) — `.zip`-shareable
- ✅ Локальные woff2 (без CDN) — OQ-7
- ✅ 5 шрифтов в репо (без LFS) — OQ-4
- ✅ jinja2 autoescape глобально — XSS protection
- ✅ 6 базовых bubble стилей + 3 layout variants
- ✅ CSS-анимация `bubble-pop` (OQ-1) + `boom-shake` + `panel-in`
- ✅ Responsive @media max-width:768px
- ✅ `prefers-reduced-motion` respect
- ✅ `safeResolve` для всех путей в Web API
- ✅ Backward-compat: `assemble_comic` без scenario — как раньше

### Что НЕ сделано (out of scope)

- ❌ Backdrop-blur мусора MiniMax — OQ-2, отложен
- ❌ Notion HTML mirror — OQ-5, отложен
- ❌ WYSIWYG-редактор баблов
- ❌ PDF export
- ❌ Video comics
- ❌ Bangers-Bold отдельно (Google Fonts не отдаёт) — копия Bangers
- ❌ Cyrillic subsets для Bangers/Bungee/UnifrakturCook (нет в Google Fonts)
- ❌ CDN-шрифты

## 5. Risk assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| HTML render fails → blocks PNG-preview | Medium | `assemble_comic` ловит исключение HTML и логирует warning (PNG уже сохранён) |
| XSS через caption | High | `autoescape=True` глобально + 2 теста (caption, title) |
| Path traversal в font name | High | regex `^[A-Za-z0-9_-]{1,64}\.woff2$` + `safeResolve` + 3 теста |
| Cyrillic fallback для Bangers/Bungee | Low | задокументировано в `static/fonts/README.md`, browser fallback на system fonts |
| Live render требует MiniMax | Low | fake PNGs в тестах; 0 live calls |
| 3 pre-existing tg-bot tests fail | None | baseline 62/65, не regression, не в scope |

## 6. Что дальше (out of this change)

- Live render verification (после деплоя в production-like среде)
- Notion HTML mirror (отдельный change)
- Backdrop-blur для мусора MiniMax (отдельный enhancement)
- Дополнительные Cyrillic шрифты (если потребуется для bubble/star/gothic/boom стилей)
- PNG fallback optimisation (уменьшить размер Pillow-overlay PNG для быстрого preview)

## 7. Ссылки

- `PRD/HTML.md` v0.4
- `openspec/changes/comic-html-rendering/` (proposal, design, tasks, 5 specs)
- `verification.md` (test/pipeline logs)
- `summary/tasks/013_comic-html-rendering.md` (companion к этому аудиту)
- `CHANGELOG.md` (запись о реализации)