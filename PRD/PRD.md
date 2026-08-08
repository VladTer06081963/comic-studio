# PRD: Comic Studio (актуальное состояние)

**Версия:** 2.0 (current state)  
**Дата:** 2026-08-08  
**Владелец:** Vlad  
**Путь проекта:** `~/Projects/comic-studio/`  

> **Это описание проекта в его текущем виде** (после 21 аудита и OpenSpec-итераций).  
> Историческое описание MVP-фазы — в [`PRD/PRD-MVP.md`](PRD-MVP.md).  
> Специализированные PRD: [`PRD/HTML.md`](HTML.md), [`PRD/AiPULT.md`](AiPULT.md).

---

## Содержание

1. [Обзор](#1-обзор)
2. [Архитектура](#2-архитектура)
3. [Pipeline и Lifecycle](#3-pipeline-и-lifecycle)
4. [Артефакты: HTML + PNG](#4-артефакты-html--png)
5. [Revision и Remix](#5-revision-и-remix)
6. [AiPULT: AI-чат функционал](#6-aipult-ai-чат-функционал)
7. [MCP-сервер](#7-mcp-сервер)
8. [Web API](#8-web-api)
9. [Telegram-бот](#9-telegram-бот)
10. [Безопасность и Access Control](#10-безопасность-и-access-control)
11. [OpenSpec и Process](#11-openspec-и-process)
12. [Конфигурация и порты](#12-конфигурация-и-порты)
13. [Тестирование](#13-тестирование)
14. [Cron и Automation](#14-cron-и-automation)
15. [Что известно как работающее](#15-что-известно-как-работающее)
16. [Open Items / Follow-ups](#16-open-items--follow-ups)

---

## 1. Обзор

### Что это

Comic Studio — production-ready конвейер для коротких серийных комиксов (3-4 панели). Поддерживает ingest контекста, LLM-сценарии, ручное утверждение, рендер через MiniMax `image-01`, публикацию и ночной cron.

### Ключевые особенности (после MVP)

| Возможность | Когда добавлена | Описание |
|-------------|-----------------|----------|
| **HTML rendering** | 2026-08-02 | Primary artifact — `<id>.html` с inline-CSS и woff2 шрифтами |
| **Revision workflow** | 2026-08-02 | `POST /api/scenarios/:id/revise` — атомарный `approved → draft` с LLM-регенерацией |
| **Remix workflow** | 2026-08-02 | `POST /api/scenarios/:id/remix` — новый draft от `published` без мутации source |
| **Character consistency** | 2026-08-02 | Первая панель как `subject_reference_b64` для panels 2-N |
| **Restyle (quick)** | 2026-08-02 | `/restyle ID STYLE` — смена стиля баблов без вызова MiniMax |
| **Hardened Web API** | 2026-08-02 | Local/remote modes, atomic lifecycle, durable render jobs |
| **Image styles** | 2026-08-01 | 5 стилей: cartoon/anime/comic/realistic/watercolor |
| **AiPULT Phase 1** | 2026-08-03 | Resolution backend (fuzzy match → CommandCard) |
| **AiPULT Phase 2** | 2026-08-03 | UI Chat Panel с cards и 4 actions |
| **AiPULT Phase 2.5** | 2026-08-04 | Deep-link `?focus=<id>` подсветка карточки |
| **MCP Server** | 2026-08-03 | 10 tools для IDE/Cursor интеграции (over stdio) |
| **Demo production** | 2026-08-04 | Mocked ML deps, deploy на 1GB RAM серверы |
| **Ports standardization** | 2026-08-08 | Порт `3000` как единый fallback |

### Стек (текущий)

| Слой | Технология |
|------|------------|
| Pipeline | Python 3.11+ |
| LLM | MiniMax Text-01 |
| Image | MiniMax image-01 |
| Web | Node.js (Express) |
| Telegram | Telegraf |
| HTML рендер | jinja2 + inline CSS + woff2 |
| PNG сборка | Pillow |
| MCP | Model Context Protocol (Node.js) |
| Тесты | node:test + unittest |
| Process | OpenSpec |

---

## 2. Архитектура

### Дерево (актуальное)

```
comic-studio/
├── py/
│   ├── ingest/{url,youtube,freeform}.py
│   ├── scenario/writer.py
│   ├── render/
│   │   ├── minimax_client.py
│   │   ├── comic_assembler.py
│   │   ├── _comic_lib.py
│   │   └── html_renderer/
│   │       ├── layout.py
│   │       ├── manifest.py
│   │       ├── render.py
│   │       └── static/fonts/*.woff2 (5 шрифтов, ~120 KB)
│   └── lib/
│       ├── config.py
│       ├── lifecycle.py           # canonical transitions + render gate
│       ├── logging_setup.py
│       ├── notion_sync.py
│       ├── retry.py
│       ├── aipult_client.py       # LLM wrapper + COMMAND_COOKBOOK
│       └── scenario_resolver.py   # rapidfuzzy, 4 methods
│
├── web/
│   ├── server.js                  # secure bootstrap
│   ├── app.js                     # Express composition
│   ├── routes/
│   │   ├── scenarios.js
│   │   ├── comics.js
│   │   ├── jobs.js
│   │   ├── health.js
│   │   └── aipult.js              # Phase 1 endpoints
│   ├── lib/
│   │   ├── config.js              # port, host, security modes
│   │   ├── access_control.js      # local/bearer auth
│   │   ├── lifecycle.js           # Node-side mirror of py/lib/lifecycle
│   │   ├── scenario_store.js      # atomic scenario ops
│   │   ├── job_manager.js         # durable render jobs
│   │   ├── job_store.js
│   │   ├── keyed_lock.js          # per-scenario locks
│   │   ├── fs_atomic.js           # atomic file ops
│   │   ├── validation.js
│   │   ├── errors.js              # AppError + codes
│   │   ├── logger.js              # structured logging
│   │   ├── process_runner.js      # shell-free subprocesses
│   │   ├── html_static.js         # serves <id>.html + fonts
│   │   ├── runtime.js             # DI container
│   │   └── aipult/
│   │       ├── resolver.js        # JS mirror of py/lib/scenario_resolver
│   │       ├── validator.js       # 9 allowed intents + 6 forbidden patterns
│   │       ├── runner.js          # 3-layer validation, audit log
│   │       ├── heuristic.js       # instant intent parser (25ms, no LLM)
│   │       └── ui_format.js       # 175 строк pure formatters
│   └── tests/                     # 110 тестов
│
├── tg-bot/
│   ├── bot.js                     # Telegraf, authorized chat_id only
│   └── tests/                     # 18+ тестов
│
├── mcp-server/
│   └── index.js                   # 8 tools, default port 3300
│
├── publisher/
│   ├── site.js                    # deployment-specific adapter
│   └── social.js                  # placeholders
│
├── ui/
│   ├── index.html                 # 4 tabs + 🤖 AiPULT
│   ├── style.css
│   ├── app.js                     # dashboard + focus highlight
│   ├── approve.js
│   ├── aipult.js                  # chat panel (~460 строк)
│   └── aipult.css                 # chat panel styles
│
├── scripts/
│   ├── ingest_and_draft.py
│   ├── render_approved.py
│   ├── publish_rendered.js
│   ├── notify_telegram.js
│   ├── revise_scenario.py
│   └── restyle.py                 # quick bubble-style change
│
├── cron/nightly.sh                # --dry-run required first
│
├── data/
│   ├── scenarios/{draft,approved,rejected,rendered,published}/
│   ├── comics/
│   │   ├── <id>.png
│   │   ├── <id>.html
│   │   ├── <id>/layout.json
│   │   ├── <id>/fonts/*.woff2
│   │   ├── <id>/panel_*.png
│   │   └── raw/<id>.png
│   ├── jobs/                      # render job state
│   ├── .staging/                  # candidate rerenders
│   ├── .trash/                    # recoverable deletes
│   ├── freeform/
│   ├── logs/YYYY-MM-DD.log
│   └── archive/YYYY-MM-DD/        # immutable
│
├── openspec/
│   ├── specs/                     # 12 main capabilities (current)
│   └── changes/
│       ├── archive/               # 8 archived changes
│       └── (active if any)
│
├── summary/
│   ├── audit/001..021             # история решений
│   └── tasks/001..021
│
├── tests/                         # Python tests (50+)
├── PRD/{PRD.md, PRD-MVP.md, HTML.md, AiPULT.md}
├── docs/{api.md, architecture.md, workflow.md, roadmap.md}
├── CHANGELOG.md
├── CLAUDE.md
├── README.md
├── ALGORITM.md
├── DEMOPRODACTION.md
├── FIXATION.md
├── HANDOFF_*.md
└── MCP_GUIDE.md
```

---

## 3. Pipeline и Lifecycle

### Полный flow

```
context → ingest → draft → [approval] → approved
                                          ↓
                              render job (durable)
                                          ↓
                                       rendered
                                          ↓
                                     publication
                                          ↓
                                      published (immutable)
```

### Каналы approval

- **Telegram** — только из configured `TELEGRAM_CHAT_ID`
- **Web UI** — local mode (127.0.0.1) или authenticated remote (bearer token)

### Lifecycle (canonical)

| From | To | Trigger | Атомарность |
|------|----|---------|--------------|
| draft | approved | ✅ button | atomic move + status |
| draft | rejected | ❌ button | atomic move + status |
| approved | rendered | render job success | PNG + HTML созданы |
| rendered | published | publication success | status updated |
| approved | draft | revise_scenario | atomic revokeApproval + LLM regen |
| rendered | draft | revise_scenario | atomic revoke + move to .staging/legacy |
| published | draft (новый) | remix | новый id, `remix_of` = source |

### Render gate

`py/lib/lifecycle.py` — Python-side enforcement: перед provider request проверяется `status == 'approved'` И файл в `data/scenarios/approved/`. Render для `draft` или `rejected` блокируется.

---

## 4. Артефакты: HTML + PNG

### Variant B (текущий выбор)

Два артефакта создаются одновременно при `assemble_comic(scenario=...)`:

| Артефакт | Назначение | Технология |
|---------|------------|------------|
| `<id>.html` | Primary: браузер, шеринг, inline-CSS | jinja2 + woff2 |
| `<id>.png` | Backward-compat: Telegram, Notion, archive | Pillow overlay |
| `<id>/layout.json` | Манифест для HTML-рендера | JSON |
| `<id>/fonts/*.woff2` | Локальные шрифты (5 штук, OFL, ~120 KB) | static assets |

### Шрифты

Лежат в репо: `py/render/html_renderer/static/fonts/*.woff2`. **Не через CDN** (правило #7 в CLAUDE.md). Копируются рядом с `<id>.html` для автономности.

### Layouts

- `comic` — асимметричный (1 панель сверху + 2-3 снизу)
- `grid` — равномерная сетка
- `vertical` — вертикальный стек (responsive `<768px`)

### Caption styles (6)

`bubble | star | gothic | boom | memo | bar` — все рендерятся через `_comic_lib.py`. С 2026-08-02 увеличены размеры: базовый шрифт 26→40, boom 30→46, bar 34→52.

### Стили изображений (5)

`cartoon | anime | comic | realistic | watercolor` — добавляются в MiniMax-промт через `STYLE_TEMPLATES` в `py/scenario/writer.py`.

---

## 5. Revision и Remix

### Revision (`POST /api/scenarios/:id/revise`)

Для `approved` или `rendered` сценариев:

1. Атомарный `revokeApproval()` → `draft` (с проверкой BUSY cross-type)
2. Если `rendered` — артефакты перемещаются в `data/.staging/legacy/<id>-<ts>/`
3. LLM регенерация с bounded feedback
4. После успеха: status `revision_succeeded`, требует нового approval
5. `revision_history` ограничен 10 записями
6. Legacy staging очищается по `WEB_LEGACY_RETENTION_MS`

**События:** `revision.requested`, `revision.succeeded`, `revision.failed` (с `request_id`, `scenario_id`, `revision_request_id`).

### Remix (`POST /api/scenarios/:id/remix`)

Только для `published`:

1. Создаётся **новый** draft с `remix_of: <source_id>`
2. Source `published` record **не мутируется**
3. Новый draft проходит обычный approval → render → publish flow

**Событие:** `remix.created`.

### Legacy feedback

`POST /api/scenarios/:id/feedback` теперь возвращает:
- `409 REVISION_REQUIRED` для не-published
- `409 PUBLISHED_IMMUTABLE` для published

Feedback **не сохраняется**. Это явный breaking change — нужно использовать `/revise` или `/remix`.

---

## 6. AiPULT: AI-чат функционал

**Детали:** [`PRD/AiPULT.md`](AiPULT.md)

### Архитектура

```
User input → resolver (fuzzy match)
            ↓
         candidates → disambiguation UI
            ↓
         LLM (MiniMax Text-01) → CommandCard
            ↓
         validator (9 allowed intents, 6 forbidden patterns)
            ↓
         runner (subprocess with 3-layer validation)
            ↓
         audit log: data/logs/aipult-YYYY-MM-DD.log
```

### Resolution (4 метода)

1. `explicit_id` — точный 8-char hex ID в тексте
2. `title_match` — fuzzy weighted 0.7× context
3. `recency_fallback` — "последний/последняя/последнее", "последний rendered"
4. `disambiguation` — score gap <10 → показать candidates

### Intent parser

`web/lib/aipult/heuristic.js` — instant parser (25ms, no LLM subprocess). 9 intents × 6 styles. PRIMARY path; LLM только для ambiguous.

### Validator (9 intents, 6 forbidden patterns)

**Allowed:**
- render, restyle, revise, remix, delete, approve, reject, list, show

**Forbidden (regex):**
- `rm -rf /`, `$(...)`, `| sh|bash`, secret leakage, `.env`, `../`

### 4 UI actions на каждой card

- 📖 Подробнее
- ✏️ Edit
- ▶️ Run
- ❌ Reject

### Phase 2.5: Deep-link focus

`?focus=<scenario_id>` в URL → подсветка нужной карточки (3px outline + pulse × 2 + scrollIntoView + 3s auto-cleanup).

---

## 7. MCP-сервер

### Что это

Standalone Node.js сервер, работающий по протоколу **`stdio`** (стандартный ввод-вывод), не прослушивает сетевые порты. Реализует Model Context Protocol для интеграции с IDE (Cursor, Claude Desktop).

### 10 инструментов

| Tool | Назначение |
|------|------------|
| `list_scenarios` | Список с фильтром по статусу |
| `get_scenario` | Полный JSON сценария |
| `create_comic` | Создание draft из freeform/URL |
| `approve_scenario` | Approve через MCP |
| `render_comic` | Запуск render job |
| `restyle_comic` | Quick restyle |
| `revise_scenario` | Revision workflow |
| `resolve_intent` | AiPULT integration |
| `read_comic_image` | Чтение готового комикса (или панели) в формате base64 |
| `update_comic_text` | Быстрое обновление текста без рендеринга MiniMax |

### Конфигурация

`mcp-server/index.js` — default `API_BASE_URL=http://127.0.0.1:3000` (после порт-стандартизации 2026-08-08).

---

## 8. Web API

**Детали:** [`docs/api.md`](docs/api.md)

### Server bootstrap

- **Default:** `127.0.0.1:3000` (local mode)
- **Remote mode:** требует `WEB_API_TOKEN` + `WEB_ALLOWED_ORIGINS`
- **No shell:** subprocess через `process_runner.js` shell-free

### Endpoints (ключевые)

| Method | Path | Назначение |
|--------|------|------------|
| GET | `/api/scenarios?status=X` | List |
| GET | `/api/scenarios/:id` | Get one |
| POST | `/api/scenarios/:id/approve` | Approve |
| POST | `/api/scenarios/:id/reject` | Reject |
| POST | `/api/scenarios/:id/revise` | Revision |
| POST | `/api/scenarios/:id/remix` | Remix |
| POST | `/api/scenarios/:id/restyle` | Quick restyle |
| POST | `/api/scenarios/:id/delete` | Recoverable delete |
| GET | `/api/comics` | List comics |
| GET | `/comics/:id.png` | PNG artifact |
| GET | `/comics/:id.html` | HTML artifact (primary) |
| GET | `/comics/:id/fonts/:name.woff2` | Fonts |
| GET | `/api/jobs/:id` | Job status |
| POST | `/api/aipult/resolve` | AiPULT resolve |
| POST | `/api/aipult/chat` | AiPULT chat |
| POST | `/api/aipult/execute` | AiPULT run |
| GET | `/api/aipult/list` | AiPULT history |

### Error codes

`web/lib/errors.js` — AppError класс с кодами:
- `400 BAD_REQUEST`
- `401 UNAUTHORIZED`
- `403 ORIGIN_FORBIDDEN`
- `404 NOT_FOUND`
- `409 REVISION_REQUIRED` / `409 PUBLISHED_IMMUTABLE` / `409 BUSY`
- `503 UNAVAILABLE`

---

## 9. Telegram-бот

**Авторизация:** только `TELEGRAM_CHAT_ID=1045621572`.

### Команды

| Команда | Действие |
|---------|----------|
| `/start` | Help + dashboard link |
| `/pending` | Список черновиков |
| `/edit <id> <feedback>` | Legacy (теперь REVISION_REQUIRED) |
| `/restyle <id> <style>` | Quick restyle |

### Inline-кнопки

- ✅ Approve / ❌ Reject / 🔄 Revise / 🎨 Remix / 🎨 Restyle / 🗑 Delete
- Caption включает HTML-ссылку, если задан `WEB_PUBLIC_URL`

---

## 10. Безопасность и Access Control

### Access control modes

| Mode | Host | Auth | CORS |
|------|------|------|------|
| **local** | 127.0.0.1 | none | same-origin only |
| **remote** | 0.0.0.0 | `WEB_API_TOKEN` (bearer) | `WEB_ALLOWED_ORIGINS` whitelist |

### HTML safety

`py/render/html_renderer/render.py` использует jinja2 с **`autoescape=True`** глобально. Все captions/titles/ids проходят через escape. **Никакого raw HTML.**

### Secrets

- `.env` исключён из git
- `data/logs/` не содержит секретов
- AiPULT audit log (`aipult-YYYY-MM-DD.log`) не содержит feedback текстов

### Process isolation

`process_runner.js` — shell-free subprocesses (только `spawn` без `shell: true`).

---

## 11. OpenSpec и Process

### Что это

OpenSpec — папка `openspec/` со спецификациями в формате EARS. Каждое изменение проходит через:
1. `proposal.md` — что меняем
2. `design.md` — как меняем
3. `tasks.md` — конкретные задачи
4. `specs/<capability>/spec.md` — что добавляется/изменяется
5. `openspec validate --strict` — валидация
6. Archive в `openspec/changes/archive/<date>-<slug>/`

### 8 архивированных changes

1. `2026-08-01-complete-comic-studio-mvp`
2. `2026-08-01-style-prompt-system`
3. `2026-08-01-image-style-ui`
4. `2026-08-01-scenario-edit-ui`
5. `2026-08-01-caption-style-ui`
6. `2026-08-01-render-and-edit-ux`
7. `2026-08-01-scenario-delete-ui`
8. `2026-08-02-harden-web-server-api`
9. `2026-08-02-scenario-revision-and-remix`
10. `2026-08-02-comic-html-rendering`
11. `2026-08-03-aipult-command-cards`
12. `2026-08-03-aipult-phase-2-ui`
13. `2026-08-03-aipult-phase-2.5-scenario-focus`

### 12 main capability specs (active)

- `python-aipult-router`
- `python-comic-rendering`
- `revision-job-observability`
- `scenario-revision-and-remix`
- `web-aipult-chat`
- `web-aipult-runner`
- `web-aipult-ui`
- `web-api-access-control`
- `web-api-observability`
- `web-comic-rendering`
- `web-comic-rendering-pipeline`
- `web-process-jobs`
- `web-scenario-operations`

### Фиксация (CLAUDE.md)

Когда пользователь говорит «фиксируем» — выполняется процедура:
1. Проверка OpenSpec (sync + archive active change)
2. Создание `summary/audit/<NNN>_<slug>.md`
3. Создание `summary/tasks/<NNN>_<slug>.md`
4. Запись в `CHANGELOG.md`
5. Commit + push

---

## 12. Конфигурация и порты

### Порты (стандартизировано 2026-08-08)

| Сервис | Порт | Env override |
|--------|------|--------------|
| Web API | **3000** | `PORT` |
| MCP Server | n/a (stdio) | — |
| Telegram bot | n/a (outbound) | — |
| Voicebox (legacy) | 17493 | — |

### `.env` ключи

| Ключ | Обязательный | Назначение |
|------|--------------|------------|
| `MINIMAX_API_KEY` | ✅ для генерации | Bearer token для image + LLM |
| `MINIMAX_BASE_URL` | нет | Default `https://api.minimax.io` |
| `TELEGRAM_BOT_TOKEN` | ✅ для TG | Bot token |
| `TELEGRAM_CHAT_ID` | нет | Default `1045621572` |
| `NOTION_TOKEN` | нет | Зеркало (no-op если нет) |
| `NOTION_SCENARIOS_DB` | нет | DB id для сценариев |
| `NOTION_COMICS_DB` | нет | DB id для комиксов |
| `SITE_API_URL` | нет | Custom site |
| `SITE_API_KEY` | нет | Bearer для site |
| `TWITTER_BEARER_TOKEN` | нет | (placeholder) |
| `MASTODON_INSTANCE` / `_TOKEN` | нет | (placeholder) |
| `WEB_API_TOKEN` | remote mode | Bearer auth |
| `WEB_ALLOWED_ORIGINS` | remote mode | CORS whitelist |
| `WEB_PUBLIC_URL` | нет | Public URL для HTML ссылок в TG |
| `WEB_API_URL` | нет | API URL для MCP/TG callbacks |
| `WEB_LEGACY_RETENTION_MS` | нет | Auto-cleanup .staging/legacy |
| `AIPULT_TIMEOUT_MS` | нет | Default 30000 |
| `CRON_PUBLISH_HOUR` / `_MINUTE` | нет | Default 02:00 |
| `CRON_BATCH_SIZE` | нет | Default 3 |

---

## 13. Тестирование

### Python: 69/69 (последний замер)

```bash
python -m unittest tests.test_render_approved -v
python -m unittest tests.test_lifecycle_revision -v
python -m unittest tests.test_scenario_resolver -v
python -m unittest tests.test_aipult_client -v
python -m unittest tests.test_html_renderer -v
python -m unittest tests.test_lifecycle_fixtures -v
python -m compileall -q py scripts tests
```

### Node: 110/110 (последний замер)

```bash
cd web && npm test
```

Тесты в:
- `web/tests/` — 13 файлов (foundation, lifecycle, jobs, observability, operations, process, revision, access, integration, aipult, aipult_ui_format, html_rendering, helpers)
- `tg-bot/tests/` — 2 файла (revision, helpers)
- `tests/` (Python) — 6 файлов

### Live provider calls в тестах: **0**

Все API мокаются. Это правило в CLAUDE.md #7.

---

## 14. Cron и Automation

### `cron/nightly.sh`

**Всегда начинать с `--dry-run`:**

```bash
bash cron/nightly.sh --dry-run
```

Без `--dry-run` — реальные side effects (render, publish, archive, telegram notify).

### Что делает nightly

1. Render всех `approved` сценариев (параллельно, ≤4 workers)
2. Publish rendered
3. Archive в `data/archive/<YYYY-MM-DD>/`
4. Telegram notify с summary

### External schedule

Предполагается запуск через Hermes cron или системный crontab:
```cron
0 2 * * * /Users/vladteresena/Projects/comic-studio/cron/nightly.sh
```

---

## 15. Что известно как работающее

### Готово к production

- ✅ Ingest (URL, YouTube, freeform)
- ✅ LLM сценарии с 5 image styles + 6 caption styles
- ✅ Telegram approval
- ✅ Web UI approval (local + authenticated remote)
- ✅ Render (PNG + HTML одновременно)
- ✅ Quick restyle (без MiniMax rerender)
- ✅ Revision workflow с atomic revoke
- ✅ Remix для published
- ✅ Public site publishing (через `SITE_API_URL`)
- ✅ AiPULT Phase 1+2+2.5
- ✅ MCP server (10 tools, stdio transport)
- ✅ Character consistency (subject_reference)
- ✅ Demo production deployment (1GB RAM)

### Ограничено / placeholders

- ⚠️ Notion scenario mirror — partial
- ⚠️ Notion comic mirror — не реализован
- ⚠️ Twitter/Mastodon publishers — placeholders
- ⚠️ Nightly publication hardening — отдельная задача

---

## 16. Open Items / Follow-ups

Из `docs/roadmap.md` и текущего состояния:

| # | Item | Приоритет | Источник |
|---|------|-----------|----------|
| 1 | Nightly publication hardening | High | docs/roadmap.md |
| 2 | Notion comic mirror (полный) | Medium | Notion-sync задачи |
| 3 | Real Twitter/Mastodon integration | Low | publisher/social.js |
| 4 | `CAPTION_FONT_SCALE` env override | Low | audit 011 |
| 5 | Multi-author support | Future | OpenSpec обсуждение |
| 6 | Cost dashboard (Phase 4 AiPULT) | Future | AiPULT roadmap |
| 7 | SSE streaming для chat | Future | AiPULT Phase 4 |

---

## Приложение A: Хронология major changes

| Дата | Событие | Audit |
|------|---------|-------|
| 2026-08-01 | MVP pipeline + Telegram + Web UI | 001 |
| 2026-08-01 | Supadata integration | 002 |
| 2026-08-01 | Image styles system | 003 |
| 2026-08-01 | Image style UI | 004 |
| 2026-08-01 | Edit scenario UI | 005 |
| 2026-08-01 | Documentation + OpenSpec + CHANGELOG | 006 |
| 2026-08-02 | Hardened Web API (atomic lifecycle, jobs) | 007 |
| 2026-08-02 | Revision + Remix | 008 |
| 2026-08-02 | Bot/publish/render fixes | 009 |
| 2026-08-02 | TG bot revision tests | 010 |
| 2026-08-02 | Caption font + bubble sizes | 011 |
| 2026-08-02 | HTML rendering (vision doc) | 012 |
| 2026-08-02 | HTML rendering (implementation) | 013 |
| 2026-08-02 | Quick restyle (no MiniMax) | 014 |
| 2026-08-03 | AiPULT Phase 1 (resolution backend) | 015 |
| 2026-08-03 | AiPULT Phase 2 (UI chat panel) | 016 |
| 2026-08-04 | AiPULT Phase 2.5 (focus highlight) | 017 |
| 2026-08-04 | MCP server | 018 |
| 2026-08-04 | Fast restyle + UX fixes | 019 |
| 2026-08-04 | Demo production setup | 020 |
| 2026-08-08 | Ports audit + standardization | 021 |

## Приложение B: Документы для дальнейшего чтения

| Документ | Тема |
|----------|------|
| [`PRD/PRD-MVP.md`](PRD-MVP.md) | Историческое описание MVP-фазы |
| [`PRD/HTML.md`](HTML.md) | Vision и design HTML rendering |
| [`PRD/AiPULT.md`](AiPULT.md) | Полная спецификация AiPULT |
| [`docs/api.md`](docs/api.md) | Web API endpoints и security |
| [`docs/architecture.md`](docs/architecture.md) | Архитектура |
| [`docs/workflow.md`](docs/workflow.md) | Рабочие сценарии |
| [`docs/roadmap.md`](docs/roadmap.md) | Follow-ups |
| [`ALGORITM.md`](ALGORITM.md) | Pipeline и lifecycle |
| [`CLAUDE.md`](CLAUDE.md) | Правила для AI-агентов |
| [`CHANGELOG.md`](CHANGELOG.md) | Хронология изменений |
| [`README.md`](README.md) | Quick start |
| [`DEMOPRODACTION.md`](DEMOPRODACTION.md) | Деплой на минимальных серверах |

---

*Документ создан: 2026-08-08*  
*Описывает текущее состояние после 21 аудита*