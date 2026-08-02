# Аудит: Comic HTML rendering (вариант B)

## 1. Контекст

После фиксации `011_caption-font-and-bubble-sizes` стало очевидно, что
**Pillow как движок баблов достиг своего предела**: 6 фиксированных стилей,
один шрифт, невозможность хвоста в произвольную сторону, нет интерактива,
нет адаптивности. Pillow-баблы при этом остаются **fallback-механизмом** для
Telegram preview и archive.

Решение: **вариант B** — добавить **HTML-рендеринг** как **основной**
артефакт комикса. PNG-preview через Pillow сохраняется для backward-compat
с Telegram, Notion, archive, social адаптерами.

Черновик видения зафиксирован в `PRD/HTML.md` (v0.1) и будет
дорабатываться по ходу работы. Этот аудит фиксирует **первую волну
задач** — design foundation, без имплементации.

## 2. Решение (вариант B)

**Архитектура:**

```
scripts/render_approved.py
   ↓
py/render/comic_assembler.py
   ├─→ py/render/html_renderer/render.py → data/comics/<id>.html
   │                                       + data/comics/<id>/static/comic.css
   │                                       + data/comics/<id>/fonts/*.woff2
   └─→ py/render/_comic_lib.py           → data/comics/<id>.png  (preview, fallback)
```

**Layout manifest** (новый артефакт):

`data/comics/<id>/layout.json` — единый источник истины для HTML и PNG:
panels, captions, bubble styles, positions, tail coordinates, fonts,
layout type.

**Backward-compat:**

- `data/comics/<id>.png` остаётся. Генерируется через **тот же** `_comic_lib.assemble_grid` (с Pillow-overlay или без — параметр `preview_mode`).
- Telegram-бот продолжает отправлять PNG-фото.
- Notion, archive, social адаптеры — без изменений.
- `comic_path` в scenario JSON указывает на `<id>.png` (не меняется).

**Что нового:**

- `data/comics/<id>.html` — HTML-страница с CSS-баблами.
- `data/comics/<id>/static/comic.css` — inline-CSS (для автономности).
- `data/comics/<id>/fonts/*.woff2` — 6 локальных шрифтов (Bangers, UnifrakturCook, Bungee, Caveat, etc.).
- `data/comics/<id>/layout.json` — manifest.

**Что НЕ делается:**

- ❌ Не уходим от Pillow **полностью** — он остаётся для PNG-preview.
- ❌ Не делаем WYSIWYG-редактор позиций баблов.
- ❌ Не делаем PDF-экспорт.
- ❌ Не делаем видео-комиксы.
- ❌ Не переписываем Telegram-бота (только добавляется HTML-ссылка в caption).

## 3. Что сделано (пока — design phase)

### 3.1. `PRD/HTML.md` v0.1

Создан документ на 23kB со следующими секциями:

- **§1. Problem Statement** — 3 подраздела с конкретными болями Pillow (6 пунктов), дополнительная мотивация через MiniMax-мусорный текст, и что мы хотим получить.
- **§2. Goals & Non-Goals** — 8 goals (G1–G8), 7 non-goals (N1–N7).
- **§3. User Personas** — 4 персоны: Vlad, читатель в Telegram, посетитель сайта, archive-бот.
- **§4. User Stories** — 5 историй (US-1: rerender → HTML, US-2: mobile layout, US-3: Telegram-ссылка, US-4: новый стиль, US-5: layout).
- **§5. Solution Overview** — ASCII-диаграмма, layout.json schema, упрощённый HTML template, базовый CSS, шрифты.
- **§6. Functional Requirements** — 9 групп (FR-1 html_renderer, FR-2 PNG-preview, FR-3 Web API, FR-4 Telegram, FR-5 Layouts, FR-6 стили баблов, FR-7 хвостик, FR-8 backward-compat, FR-9 тесты).
- **§7. NFR** — 7 не-функциональных требований (performance, portability, accessibility, self-contained, no live calls, no secrets, FS safety).
- **§8. Architecture** — файловая структура, sequence diagram, API additions, OpenSpec change plan.
- **§9. Open Questions** — 7 вопросов (OQ-1: анимации, OQ-2: blur-фильтры, OQ-3: layout.json на render vs scenario, OQ-4: шрифты в репо, OQ-5: Notion HTML mirror, OQ-6: относительные пути, OQ-7: CDN vs local).
- **§10. Rollout Plan** — 4 фазы (Foundation → Web API → Telegram + Polish → Extension).
- **§11. Verification** — 7 проверок.
- **§12. Связанные документы** — ссылки на PRD.md, docs/api.md, summary/*, openspec/.
- **§ История изменений** — запись v0.1.

### 3.2. Решение о варианте B

Сравнение A/B/C из `PRD/HTML.md` §5.1:
- **A** (Pillow не рисует баблов, только layout) — слишком ломает backward-compat.
- **B** (PNG остаётся, HTML основной) — **выбран**, потому что сохраняет Telegram/Notion/archive и даёт новые возможности.
- **C** (только HTML, PNG через Playwright) — ломает совместимость, требует Chromium-зависимости.

## 4. Что НЕ сделано (явно)

- ❌ **OpenSpec change не создан.** Это пока design phase. OpenSpec change `comic-html-rendering` будет создан когда:
  1. `PRD/HTML.md` дописан до v0.2+ (после обсуждения Open Questions).
  2. Архитектура полностью подтверждена.
  3. Реализация начинается.
- ❌ **Никакой код не написан.** Ни `py/render/html_renderer/`, ни CSS, ни шаблоны — это всё в следующих change'ах.
- ❌ **Никаких тестов** — на этом этапе только PRD и аудит.

## 5. Verification

- `PRD/HTML.md` существует, 12 секций, читается как живой документ.
- `summary/audit/012_comic-html-rendering.md` (этот файл) создан.
- `summary/tasks/012_comic-html-rendering.md` создан.
- Существующие PNG-preview в `data/comics/` не тронуты.
- Существующие тесты (59/59 Node, 28/28 Python в scope) не запускались — изменений в коде не было.

## 6. Связанные задачи

- `013_*` (будущее): open OpenSpec change `comic-html-rendering` на основе этого PRD.
- `014_*` (будущее): реализация Phase 1 (Foundation: `py/render/html_renderer/` пакет + шрифты + CSS).
- `015_*` (будущее): реализация Phase 2 (Web API endpoints).
- `016_*` (будущее): реализация Phase 3 (Telegram + документация).

## 7. Open Decisions (нужно обсудить)

- **OQ-1..OQ-7** из `PRD/HTML.md` §9.
- Какие **шрифты** выбрать (Bangers + UnifrakturCook + Bungee + Caveat — предложение).
- **Layouts** в первом релизе — `comic + grid` или добавить `vertical` сразу.
- **PNG-preview** — оставить Pillow-overlay баблов (как сейчас) или упростить до panels-only.

## 8. Файлы

- `PRD/HTML.md` — основной живой документ, v0.1, 23 kB.
- `summary/audit/012_comic-html-rendering.md` — этот аудит.
- `summary/tasks/012_comic-html-rendering.md` — задачи.

## 9. Статус

✅ Design foundation зафиксирован — 2026-08-02.
OpenSpec change ещё не создан — design phase, требует обсуждения Open Questions.
