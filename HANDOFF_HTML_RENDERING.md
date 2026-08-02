# HANDOFF: Comic HTML Rendering

> **Этот файл — точка входа для новой сессии.** Прочитай его полностью
> перед стартом работы. Здесь зафиксирован контекст, решения, структура
> и план — чтобы агент не терял время на разведку.

## 1. Что это

OpenSpec change `comic-html-rendering` — **новая фича** для Comic Studio. Вводит
HTML-рендеринг комиксов как **основной артефакт**, сохраняя PNG-preview
для backward-compat с Telegram, Notion, archive, social.

**Предыдущая сессия:** 2026-08-02 (завершена). Подготовлен PRD, аудит, таски, OpenSpec change. **Код не написан** — это design phase, переход в implementation.

**Текущая сессия должна:** начать с **Phase 1 (Foundation)** из tasks.md и довести до **Phase 4 (фиксация)**. Это ~1500 строк кода, 13-15 тестов, обновлённая документация.

## 2. Ключевые решения (зафиксированы)

Из `PRD/HTML.md` v0.2 §9 и OpenSpec `proposal.md`:

| Решение | Значение |
|---|---|
| **Вариант** | B (PNG-preview сохраняется, HTML — основной артефакт) |
| **Шрифты** | 6 woff2 в репо напрямую, без `git lfs`, без CDN |
| **CSS-анимация** | `bubble-pop` (scale 0.8→1.0, 200ms ease-out, animation-delay per panel) |
| **Blur мусора MiniMax** | НЕТ в MVP, отложен |
| **Layout.json** | На render, в `data/comics/<id>/layout.json` |
| **Notion HTML mirror** | НЕТ в MVP, отложен |
| **Пути в HTML** | Относительные (`./fonts/...`, `./panel_*.png`) |
| **CSS** | inline в `<style>` блоке (не external `comic.css`) |
| **Pillow** | Сохраняется для PNG-preview, `preview_mode` параметр |
| **Backwards-compat** | `comic_path` в scenario = PNG; HTML-path predictable из id |
| **OpenSpec change** | `comic-html-rendering` уже валиден (`openspec validate --strict` ✓) |
| **Главные specs** | 3 new + 2 modified |

## 3. Файлы (точка входа)

| Файл | Назначение |
|---|---|
| `PRD/HTML.md` | Живой документ v0.2 — vision, FR, NFR, архитектура, open questions (решены) |
| `openspec/changes/comic-html-rendering/proposal.md` | Мотивация, impact, out of scope |
| `openspec/changes/comic-html-rendering/design.md` | Архитектура, decisions, risks, migration |
| `openspec/changes/comic-html-rendering/tasks.md` | **ГЛАВНЫЙ ПЛАН** — 50 задач, 9 секций, расставлены по фазам |
| `openspec/changes/comic-html-rendering/specs/web-comic-rendering/spec.md` | Web API endpoints |
| `openspec/changes/comic-html-rendering/specs/python-comic-rendering/spec.md` | Python пакет `html_renderer/` |
| `openspec/changes/comic-html-rendering/specs/web-comic-rendering-pipeline/spec.md` | End-to-end pipeline |
| `openspec/changes/comic-html-rendering/specs/web-scenario-operations/spec.md` | MODIFIED — comic_path semantics |
| `openspec/changes/comic-html-rendering/specs/web-process-jobs/spec.md` | MODIFIED — html_generated флаг |
| `summary/audit/012_comic-html-rendering.md` | Аудит design phase |
| `summary/tasks/012_comic-html-rendering.md` | Tasks design phase (только PRD/аудит/таски) |

## 4. С чего начать

**Phase 1 (Foundation) — секция 1 в tasks.md:**

1. **1.1** Создать `py/render/html_renderer/` пакет:
   - `__init__.py` (пустой или с `__version__`)
   - `render.py` — entry point `render_html(layout, output_path) -> Path`
   - `validate_layout.py` (или `layout.py`) — функция `validate_layout(layout)`
   - `manifest.py` — функция `build_layout(scenario, panel_paths, captions, bubble_styles, bubble_positions, layout, fonts) -> dict`
   - `templates/comic.html.j2` — Jinja2 шаблон
   - `static/comic.css` — CSS с 6 базовыми стилями
   - `static/fonts/` — 5 woff2 файлов + README

2. **1.2** Скачать шрифты:
   - **Bangers** (~30KB) — bubble, star, bar — https://fonts.google.com/specimen/Bangers
   - **Bangers Bold variant** если есть, иначе Bangers
   - **UnifrakturCook** (~50KB) — gothic — https://fonts.google.com/specimen/UnifrakturCook
   - **Bungee** (~40KB) — boom — https://fonts.google.com/specimen/Bungee
   - **Caveat** (~50KB) — memo — https://fonts.google.com/specimen/Caveat
   - **README.md** в `static/fonts/` с Open Font License указаниями
   - Используй `curl -L` или `wget` для скачивания `.woff2` файлов
   - Сохраняй оригинальные `.woff2` без конвертации

3. **1.3** Создать CSS:
   - 6 базовых стилей баблов (`.bubble--bubble`, `.bubble--star`, `.bubble--gothic`, `.bubble--boom`, `.bubble--memo`, `.bubble--bar`)
   - CSS-анимация `@keyframes bubble-pop` (scale 0.8→1.0, opacity 0→1, 200ms ease-out, animation-delay 0..N*80ms)
   - Responsive: `@media (max-width: 768px)` для мобильных (vertical stack)
   - Используй `clip-path: polygon(...)` для star/boom фигур
   - `transform: rotate(-2deg)` для memo
   - Tail через `::after` с `border: ... solid transparent` для bubble

4. **1.4** Jinja2-шаблон `comic.html.j2`:
   - `<!DOCTYPE html>`, `<html lang="ru">`, `<head>` с `<meta charset="UTF-8">`, `<title>{{ title }}</title>`
   - `<style>` блок с inline-CSS (включая `@font-face` для 5 шрифтов)
   - `<main class="comic comic--{{ layout }}">`
   - `{% for panel in panels %}<figure class="panel">...{% endfor %}`
   - `<img src="./{{ panel.image }}" alt="panel {{ panel.n }}">`
   - `{% if panel.caption %}<div class="bubble bubble--{{ panel.bubble_style }} bubble--{{ panel.bubble_position }}"><p>{{ panel.caption }}</p></div>{% endif %}`
   - Авто-эскейп через `{{ panel.caption }}` (не `| safe`)

5. **1.5-1.6** Validation + manifest:
   - `validate_layout`: проверки id (regex), layout (enum), panels (3-4), bubble_style (enum), bubble_position (enum)
   - `build_layout`: принимает `scenario, panel_paths, captions, bubble_styles, bubble_positions, layout, fonts` → dict
   - Проверка на несовпадение длин (panels != captions)

6. **1.7** `py/requirements.txt`:
   - Проверь, есть ли `jinja2` (вероятно да, т.к. используется в других местах)
   - Если нет — добавь

**Phase 2 (Pillow Integration) — секция 2 в tasks.md:**

7. **2.1-2.5** `py/render/comic_assembler.assemble_comic`:
   - Добавь параметр `preview_mode: "with-bubbles" | "panels-only"` (default: `"with-bubbles"`)
   - Добавь параметр `scenario: dict` (для манифеста)
   - Создай `data/comics/<id>/layout.json` через `build_layout`
   - Скопируй `py/render/html_renderer/static/fonts/*.woff2` в `data/comics/<id>/fonts/`
   - Вызови `html_renderer.render_html(layout, data/comics/<id>.html)`
   - Сгенерируй PNG-preview через `_skill_lib.assemble_grid` (existing, без изменений)
   - **Backward-compat:** если `scenario` не передан (старые вызовы), работает как раньше (только PNG)

**Phase 3 (Web API) — секция 3 в tasks.md:**

8. **3.1-3.5** Web endpoints:
   - `web/routes/comics.js` — добавить `GET /comics/<id>.html`
   - `web/lib/html_static.js` — новый модуль для `GET /comics/<id>/fonts/<name>.woff2`
   - `safeResolve` для всех путей под `data/comics/<id>/`
   - `web/app.js` — зарегистрировать новые routes

**Phase 4 (Tests) — секция 4 в tasks.md:**

9. **4.1-4.4** Тесты:
   - `tests/test_html_renderer.py` — 6-8 Python тестов (validate, build, render, безопасность, backward-compat)
   - `web/tests/html_rendering.test.js` — 5-7 Node тестов (endpoints, static, content-type, safeResolve)
   - Backward-compat: `assemble_comic(..., preview_mode="with-bubbles")` и `"panels-only"`

**Phase 5 (Telegram) — секция 5 в tasks.md:**

10. **5.1-5.4** Telegram:
    - `tg-bot/bot.js`: добавить `WEB_PUBLIC_URL` env
    - В callback'ах `publish:` и `render:` добавить HTML-ссылку в caption
    - Telegraf `Markup.button.url` inline-кнопка
    - Backward-compat: если `WEB_PUBLIC_URL=''`, работает как раньше

**Phase 6 (Configuration) — секция 6 в tasks.md:**

11. **6.1-6.2** `web/lib/config.js`:
    - Добавить `webPublicUrl` в `loadConfig`
    - `WEB_PUBLIC_URL` env, default `''`
    - Документация в `.env.example`

**Phase 7 (Documentation) — секция 7 в tasks.md:**

12. **7.1-7.6** Docs:
    - `docs/api.md` — секция «HTML comic rendering»
    - `docs/workflow.md` — упоминание HTML в pipeline
    - `ALGORITM.md` — обновлённый раздел 5
    - `CLAUDE.md` — новые правила
    - `README.md` — секция «Render» с HTML
    - `PRD/HTML.md` — обновить до v0.3

**Phase 8 (Observability) — секция 8 в tasks.md:**

13. **8.1-8.3** Логи:
    - `comic.html_generated` event
    - `comic.preview_generated` event
    - Web access log для HTML endpoint

**Phase 9 (Verification & Fixation) — секция 9 в tasks.md:**

14. **9.1-9.14** Фиксация:
    - Прогнать все тесты
    - Визуальная проверка (rerender `c6964b6a`, открыть HTML в Chrome)
    - `verification.md` сохранён
    - `summary/audit/013_comic-html-rendering.md` создан
    - `summary/tasks/013_comic-html-rendering.md` создан
    - `CHANGELOG.md` запись
    - `git commit` + `git push`
    - OpenSpec change archived
    - 3 new + 2 modified specs в `openspec/specs/`
    - `openspec validate --specs --strict` ✓

## 5. Архитектурные подсказки

### Где искать похожий код

- **`py/render/comic_assembler.py`** — текущая точка входа для сборки комикса. Паттерн: `assemble_comic(panel_paths, captions, output_path, style, layout, cols) -> Path`.
- **`py/render/_comic_lib.py`** — Pillow-overlay для баблов (PNG-preview остаётся на нём).
- **`py/render/minimax_client.py`** — генерация PNG-панелей от MiniMax image-01 (без изменений).
- **`py/scenario/writer.py`** — примеры LLM-вызовов, валидации, error handling.
- **`py/lib/lifecycle.py`** — `transition()`, `load_scenario()`, `validate_approved()` — паттерны валидации.
- **`web/lib/scenario_store.js`** — пример `safeResolve` использования.
- **`web/app.js:21-29`** — текущий `GET /comics/<id>.png` endpoint (шаблон для нового `*.html`).
- **`web/routes/comics.js`** — текущий API.
- **`web/lib/logger.js`** — structured logging.
- **`tests/test_lifecycle_revision.py`** — пример Python-теста с monkey-patching globals.
- **`web/tests/jobs.test.js`** — пример Node-теста с `DeferredRunner` и `makeTestRuntime`.

### Принципы проекта (из CLAUDE.md)

1. **Никогда не выполнять initial render без persisted approval.**
2. **Идемпотентность.** Использовать scenario ID и seed; для `rendered` — explicit staging rerender.
3. **Published immutable.** Изменения через `/remix`.
4. **Логировать всё.** Python и Web пишут в `data/logs/YYYY-MM-DD.log` и stdout без секретов.
5. **Тесты без платных side effects.** Mocked suites не должны вызывать MiniMax, публикацию или Telegram.
6. **safeResolve** для всех путей.
7. **Shell-disabled** для subprocess (см. `web/lib/process_runner.js`).
8. **Structured errors** через `AppError` с кодами.

### Тестовая инфраструктура

- **Node:** `cd web && node --test` запускает `web/tests/*.test.js`. Использует `makeTestRuntime({ runner, logger, ... })` из `web/tests/helpers.js` с `FakeRunner` и `MemoryLogger`.
- **Python:** `python3 -m unittest discover -s tests -p 'test_*.py'` запускает `tests/test_*.py`. Использует `tempfile.TemporaryDirectory()` для изоляции.
- **Pre-existing tests:** `tests/test_render_approved.py` требует `Pillow` (не установлен в текущей среде). Это **out of scope** — НЕ пытаться установить `Pillow` или чинить этот тест.

## 6. Команды для верификации

```bash
# OpenSpec validation
openspec validate comic-html-rendering --strict
openspec validate --specs --strict
openspec validate --changes --strict

# Тесты
cd web && node --test
cd .. && python3 -m unittest discover -s tests -p 'test_*.py'

# Cron dry-run
bash cron/nightly.sh --dry-run

# Визуальная проверка
python3 scripts/render_approved.py --scenario-id c6964b6a --rerender --staging-dir /tmp/staging
ls -la data/comics/c6964b6a.html data/comics/c6964b6a.png data/comics/c6964b6a/layout.json
open data/comics/c6964b6a.html
```

## 7. Что НЕ делать

- ❌ Не устанавливать `Pillow` / `jinja2` / другие pip-пакеты (если уже установлены в `.venv`).
- ❌ Не пытаться чинить `tests/test_render_approved.py` (pre-existing, requires Pillow, out of scope).
- ❌ Не модифицировать `data/comics/c6964b6a.png` без явного rerender (только через `python3 scripts/render_approved.py ...`).
- ❌ Не удалять `data/archive/`.
- ❌ Не коммитить `.env`, токены, или `/Users/...` пути.
- ❌ Не делать live provider calls (MiniMax, Telegram, Notion) в тестах.
- ❌ Не создавать новые OpenSpec changes параллельно — этот `comic-html-rendering` должен быть заархивирован перед стартом следующего.

## 8. Скоуп (что в этом change, что нет)

**В этом change (делаем):**
- `py/render/html_renderer/` пакет
- 6 CSS-стилей баблов + анимация
- 5 woff2 шрифтов + README
- `assemble_comic` обновлён (HTML + PNG)
- Web API: `/comics/<id>.html`, `/comics/<id>/fonts/<name>.woff2`
- Telegram caption с HTML-ссылкой (env-gated)
- 13-15 тестов
- 5 OpenSpec specs (3 new + 2 modified)
- Документация

**НЕ в этом change (out of scope):**
- WYSIWYG-редактор баблов
- PDF-экспорт
- Видео-комиксы
- Notion HTML mirror
- CDN-шрифты
- CSS-фильтры для мусора MiniMax
- `git lfs` для шрифтов
- Content negotiation через `Accept` header
- Замена Pillow полностью

## 9. Контекст проекта

- **Репозиторий:** `/Users/vladteresena/Projects/comic-studio/`
- **Remote:** `https://github.com/VladTer06081963/comic-studio.git`
- **Branch:** `main`
- **Владелец:** Vlad
- **Стек:** Python 3.x (Pillow, jinja2, requests), Node.js (Express), Telegram (Telegraf), OpenSpec (changes/specs workflow)
- **OpenSpec CLI:** `openspec` (см. `openspec list`, `openspec validate`, `openspec archive`)

## 10. Начало работы

```bash
# 1. Прочитай контекст
cat HANDOFF_HTML_RENDERING.md  # ← ты здесь
cat PRD/HTML.md  # v0.2 PRD
cat openspec/changes/comic-html-rendering/tasks.md  # главный план

# 2. Проверь текущее состояние
openspec status --change comic-html-rendering --json
git status
cd web && node --test  # baseline: 59/59 должно pass
cd .. && python3 -m unittest discover -s tests -p 'test_*.py'  # 28/28 в scope

# 3. Начни Phase 1, task 1.1
mkdir -p py/render/html_renderer/{templates,static/fonts}
touch py/render/html_renderer/__init__.py

# 4. По завершении каждой задачи — отмечай в tasks.md
# 5. По завершении всех фаз — фиксация (Phase 9)
```

Удачи! Следующая сессия должна довести change до архивации.
