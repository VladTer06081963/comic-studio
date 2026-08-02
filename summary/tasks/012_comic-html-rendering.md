# Задачи: Comic HTML rendering (вариант B)

## Статус: 🚧 Design phase (PRD v0.1)

Этот таск-лист описывает **первую волну** работы — design foundation. OpenSpec change
`comic-html-rendering` и реализация **отдельными change'ами** в следующих итерациях.

| ID | Задача | Статус |
|---|---|---|
| 1 | Создать `PRD/HTML.md` v0.1 с problem statement, goals/non-goals, personas, US, FR, NFR, architecture | ✅ |
| 2 | Зафиксировать выбор **варианта B** (PNG-preview + HTML-артефакт) | ✅ |
| 3 | Создать аудит `summary/audit/012_comic-html-rendering.md` | ✅ |
| 4 | Создать tasks `summary/tasks/012_comic-html-rendering.md` | ✅ |
| 5 | Обсудить **Open Questions** (OQ-1..OQ-7) из `PRD/HTML.md` §9 с владельцем | ⏳ |
| 6 | Дописать `PRD/HTML.md` до v0.2 после обсуждения OQ | ⏳ |
| 7 | Создать OpenSpec change `comic-html-rendering` (proposal, design, specs, tasks) | ⏳ |
| 8 | Реализация Phase 1: `py/render/html_renderer/` пакет + jinja2-шаблон + базовый CSS + 6 шрифтов | ⏳ |
| 9 | Реализация Phase 1: обновить `assemble_comic` чтобы генерил и HTML, и PNG-preview | ⏳ |
| 10 | Реализация Phase 1: 1-2 теста (HTML валиден, inline CSS присутствует, PNG-preview не сломан) | ⏳ |
| 11 | Реализация Phase 2: `GET /comics/<id>.html` endpoint | ⏳ |
| 12 | Реализация Phase 2: `GET /comics/<id>/static/comic.css` + `/fonts/<name>.woff2` | ⏳ |
| 13 | Реализация Phase 2: Content Negotiation для `GET /comics/<id>` (HTML if Accept, else PNG) | ⏳ |
| 14 | Реализация Phase 3: Telegram caption с HTML-ссылкой (URL из `WEB_PUBLIC_URL` env) | ⏳ |
| 15 | Реализация Phase 3: Telegraf `Markup.button.url` inline-кнопка | ⏳ |
| 16 | Реализация Phase 3: обновить `docs/api.md`, `docs/workflow.md`, `ALGORITM.md` | ⏳ |
| 17 | Реализация Phase 3: фиксация `comic-html-rendering` change (аудит, таски, CHANGELOG, git) | ⏳ |

## Артефакты (пока)

- `PRD/HTML.md` — v0.1, 23 kB, 12 секций.
- `summary/audit/012_comic-html-rendering.md` — этот аудит.
- `summary/tasks/012_comic-html-rendering.md` — этот task list.

## Будущие change'ы (не сейчас)

- `013_comic-html-rendering-openspec` — создание OpenSpec change.
- `014_comic-html-rendering-phase1` — Foundation (пакет `html_renderer` + шрифты + CSS).
- `015_comic-html-rendering-phase2` — Web API endpoints.
- `016_comic-html-rendering-phase3` — Telegram + документация + фиксация.

## Open Questions (требуют решения до старта)

Из `PRD/HTML.md` §9:

- **OQ-1.** Нужны ли CSS-анимации появления баблов при загрузке?
- **OQ-2.** Прятать ли мусорный текст на панелях через blur / mix-blend-mode?
- **OQ-3.** Один `layout.json` на сценарий или на каждый render?
- **OQ-4.** Шрифты — в репо (+2-5 MB) или загружаются при первом запуске?
- **OQ-5.** Notion comic mirror для HTML? (или оставить PNG-only?)
- **OQ-6.** Префикс путей в HTML: относительные или абсолютные?
- **OQ-7.** Шрифты — Google Fonts CDN (с fallback) или только локальный?

## Verification

- `PRD/HTML.md` существует и читается как живой документ.
- Этот task list и аудит существуют.
- **Никакого кода не написано**, **никаких тестов не добавлено** — это design phase.
- Существующие тесты, PNG-preview, Telegram-бот, Pillow-рендер — **не тронуты**.
