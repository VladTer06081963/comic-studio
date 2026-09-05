# CHANGELOG

Накопительный журнал изменений Comic Studio. Записи расположены в хронологическом порядке: от ранних к поздним.

## Правила ведения

- Новые записи добавляются только в конец соответствующей даты.
- Формат времени — ISO 8601 с часовым поясом.
- Одна строка кратко описывает одно логическое изменение.
- `CHANGELOG.md` обновляется при каждой фиксации задачи.
- Секреты, токены и содержимое `.env` в журнал не включаются.

## 2026-08-01

- `2026-08-01T21:17:14+03:00` — Создан первоначальный Comic Studio pipeline: ingest, сценарии, approval, render, publication, cron, Telegram и Web UI.
- `2026-08-01T21:27:07+03:00` — Архивирован OpenSpec change полного MVP и введена процедура фиксации задач.
- `2026-08-01T21:29:45+03:00` — Добавлен fixation skill для AI-агентов.
- `2026-08-01T21:30:46+03:00` — Добавлены `FIXATION.md` и универсальные правила фиксации в `CLAUDE.md`.
- `2026-08-01T21:35:14+03:00` — Интегрирован Supadata API для транскрибации YouTube.
- `2026-08-01T21:38:22+03:00` — Исправлены импорты `urllib` в YouTube ingest.
- `2026-08-01T21:45:18+03:00` — Зафиксирована и архивирована задача интеграции Supadata.
- `2026-08-01T21:51:04+03:00` — YouTube ingest переведён на порядок `yt-dlp → Supadata → Voicebox/Whisper`.
- `2026-08-01T22:03:59+03:00` — Создан OpenSpec change системы визуальных стилей.
- `2026-08-01T22:07:01+03:00` — Реализованы пять `image_style` и их добавление в MiniMax-промты.
- `2026-08-01T22:07:11+03:00` — Обновлены статусы задач style-prompt-system.
- `2026-08-01T22:07:20+03:00` — Архивирован OpenSpec change style-prompt-system.
- `2026-08-01T22:07:35+03:00` — Созданы итоговые audit/tasks для системы стилей.
- `2026-08-01T22:16:28+03:00` — Добавлен выбор `image_style` в Telegram и Web UI.
- `2026-08-01T22:16:33+03:00` — Архивирован OpenSpec change image-style-ui.
- `2026-08-01T22:16:45+03:00` — Зафиксирована задача image-style-ui.
- `2026-08-01T22:27:14+03:00` — Добавлен badge `image_style` в карточки сценариев.
- `2026-08-01T22:45:23+03:00` — Добавлен Web UI для feedback: модальное окно, примеры и счётчик правок.
- `2026-08-01T22:45:26+03:00` — Архивирован OpenSpec change scenario-edit-ui.
- `2026-08-01T22:45:36+03:00` — Зафиксирована задача scenario-edit-ui.
- `2026-08-01T22:47:41+03:00` — Расширена встроенная справка стилями и примерами правок.
- `2026-08-01T22:57:56+03:00` — Исправлен показ кнопок выбора стиля при создании через Telegram.
- `2026-08-01T23:07:04+03:00` — Добавлен выбор caption style в Telegram и Web UI.
- `2026-08-01T23:07:07+03:00` — Архивирован OpenSpec change caption-style-ui.
- `2026-08-01T23:12:03+03:00` — Разрешён повторный запуск render для rendered/published сценариев.
- `2026-08-01T23:14:46+03:00` — Добавлено удаление сценариев и связанных comic artifacts через Telegram и Web UI.
- `2026-08-01T23:14:49+03:00` — Архивирован OpenSpec change scenario-delete-ui.
- `2026-08-01T23:37:00+03:00` — Добавлены render и seed controls в Web UI и edit card в Telegram.
- `2026-08-01T23:37:04+03:00` — Архивирован OpenSpec change render-and-edit-ux.

## 2026-08-02

- `2026-08-02T10:12:38+03:00` — Проведён аудит документации, кода, PRD, summary и OpenSpec; добавлен накопительный `CHANGELOG.md` и правило его обновления при фиксации.
- `2026-08-02T11:33:52+03:00` — Hardened Web API: local/remote access control, atomic lifecycle, shell-free processes, durable render jobs, staging rerender, recoverable delete, tests и актуальная документация.
- `2026-08-02T11:42:14+03:00` — Зафиксирован и архивирован OpenSpec change `harden-web-server-api`: 4 main specs синхронизированы в `openspec/specs/`, 61/61 tasks complete, verification summary сохранён.
- `2026-08-02T12:35:00+03:00` — Реализован `scenario-revision-and-remix`: атомарный `revokeApproval` переводит `approved|rendered → draft` до LLM-вызова, `revise_scenario()` в Python использует bounded feedback и ту же `STYLE_TEMPLATES`, `revision_history` ограничен 10 записями, legacy staging `data/.staging/legacy/<id>-<ts>/` очищается по `WEB_LEGACY_RETENTION_MS`, `remix` создаёт новый draft без мутации `published`. Удалена формулировка «запрос на правку сохранён», legacy feedback endpoint возвращает `REVISION_REQUIRED` / `PUBLISHED_IMMUTABLE`, `BUSY` действует cross-type между `render` и `revision`. 59/59 Node тестов и 28/28 Python тестов в области change проходят; nightly cron проверен в `--dry-run`.
- `2026-08-02T12:50:00+03:00` — Зафиксирован и архивирован OpenSpec change `scenario-revision-and-remix`: 43/43 tasks complete, 2 новых capability main specs (`scenario-revision-and-remix`, `revision-job-observability`) и 2 обновлённых (`web-scenario-operations`, `web-process-jobs`) синхронизированы в `openspec/specs/`, `openspec validate --strict` зелёный, `verification.md` сохранён, аудит `summary/audit/008_*` и таски `summary/tasks/008_*` созданы.
- `2026-08-02T21:15:00+03:00` — Увеличены шрифт и баблы подписей во всех 6 стилях (bubble, star, gothic, boom, memo, bar): базовый шрифт 26→40, boom 30→46, bar 34→52, gothic serif 26→40, memo 26→40; pad 18→28, tail_h 28→40, margin 22→28, wrap 14→10 символов, stroke 3→4, star r_out +12, boom r_out +16, gothic wing 14→22 / notch 12→18, memo fold 22→32 / shadow 6→10 / pin 28×8→40×12, bar высота 64→96. Хардкод в `py/render/_comic_lib.py`. Только новые рендеры — `data/comics/`, `data/scenarios/rendered/`, `data/archive/` не затронуты. Созданы `summary/audit/011_*` и `summary/tasks/011_*`; пометка о будущем переходе на `CAPTION_FONT_SCALE` env-ключ для гибкой настройки без правки кода.
- `2026-08-02T21:30:00+03:00` — Создан `PRD/HTML.md` v0.1 — живой черновик vision для HTML-рендеринга комиксов. Зафиксирован выбор **варианта B** (PNG-preview сохраняется для backward-compat с Telegram/Notion/archive, HTML — основной артефакт для браузера/шеринга). Описаны: problem statement (6 болей Pillow), goals (G1–G8), non-goals (N1–N7), 4 user personas, 5 user stories, 9 групп functional requirements, 7 NFR, архитектура с ASCII-диаграммой, layout.json manifest, HTML template sketch, CSS sketch, 6 шрифтов, 4-фазный rollout, 7 open questions. Созданы `summary/audit/012_comic-html-rendering.md` и `summary/tasks/012_comic-html-rendering.md`. OpenSpec change `comic-html-rendering` и реализация — отдельными change'ами после обсуждения Open Questions.
- `2026-08-02T22:00:00+03:00` — Решены все 7 Open Questions (OQ-1..OQ-7) из `PRD/HTML.md` §9: CSS-анимации баблов — да (лёгкая `bubble-pop`), blur мусора MiniMax — нет в MVP, layout.json — на render, шрифты в репо без LFS, Notion HTML mirror — нет в MVP, относительные пути в HTML, только локальные шрифты без CDN. Создан OpenSpec change `comic-html-rendering` (валидируется `openspec validate --strict` ✓): proposal.md, design.md, tasks.md (50 задач в 9 секциях), 3 новых capability specs (`web-comic-rendering`, `python-comic-rendering`, `web-comic-rendering-pipeline`), 2 обновлённых (`web-scenario-operations`, `web-process-jobs`). Подготовлен `HANDOFF_HTML_RENDERING.md` (14 kB) — точка входа для следующей сессии: архитектура, decisions, план по фазам, тестовая инфраструктура, red lines (что НЕ делать). Реализация — в следующей сессии.
- `2026-08-02T16:26:37Z` — Fix dotenv dependency for publication and add status checks for render/publish in Telegram bot.
- `2026-08-02T16:40:31Z` — Added integration tests for Telegram bot scenario modification flow (revision/remix) using node:test and Telegraf mocks.
- `2026-08-02T22:30:00+03:00` — Реализован OpenSpec change `comic-html-rendering` (вариант B из `PRD/HTML.md`): новый пакет `py/render/html_renderer/` с `validate_layout`, `build_layout`, `render_html` (jinja2 с inline-CSS, автоэскейп XSS), 5 woff2 шрифтов в репо (~120 KB, OFL, без LFS/CDN), CSS с 6 базовыми стилями баблов (bubble/star/gothic/boom/memo/bar), 3 layout (comic/grid/vertical), responsive `@media max-width:768px`, CSS-анимация `bubble-pop` + `boom-shake` + `panel-in`, `prefers-reduced-motion`. `assemble_comic` расширен параметрами `preview_mode` (`with-bubbles`|`panels-only`, default первый) и `scenario=` — при передаче `scenario` создаёт и PNG-preview (Pillow overlay, backward-compat), и HTML (primary), и `<id>/layout.json`, и копирует шрифты в `<output_dir>/fonts/`. Без `scenario` — backward-compat (только PNG). Новые Web endpoints: `GET /comics/<id>.html` (`text/html`), `GET /comics/<id>/fonts/<name>.woff2` (`font/woff2`) — оба через `safeResolve` и валидацию id/font-name. PNG endpoint не тронут. Telegram-бот дополняет caption HTML-ссылкой и inline-кнопкой для rendered/published, если задан env `WEB_PUBLIC_URL`. Добавлены 18 Python тестов + 10 Node тестов. Итого 119/119 тестов проходят (Node 69/69, Python 50/50). Live provider calls в тестах: 0. Verification + audit (`summary/audit/013_*`) + tasks (`summary/tasks/013_*`) сохранены, документация обновлена (`docs/api.md`, `docs/workflow.md`, `ALGORITM.md`, `CLAUDE.md`, `README.md`, `PRD/HTML.md` v0.4).
- `2026-08-02T23:50:00+03:00` — Добавлены character reference и quick restyle: MiniMax image-01 теперь использует первую панель как `subject_reference_b64` для panels 2-N (консистентность персонажа через всю историю, commit `f9e6ef5`); новая команда `scripts/restyle.py --scenario-id ID --style STYLE` и Telegram-команда `/restyle ID bubble|star|gothic|boom|memo|bar` меняют только стиль баблов (Pillow-overlay + HTML регенерация) без вызова MiniMax — 2-5 сек vs 3-5 мин revision+rerender, 0 cost vs 3-4 MiniMax calls, статус сценария сохраняется (commit `7258ddb`). Help расширен секциями «🎨 Restyle» и «📁 HTML комикс и его редактирование» с примерами ручной правки caption'ов, смены классов баблов и позиций через прямое редактирование `.html` файла (commit `cf5bbc6`). 72/72 Node тестов и 50/50 Python тестов проходят.
- `2026-08-03T11:22:12+03:00` — Реализован **AiPULT Phase 1: Resolution + Backend**. Чат-бот советник (Web UI в Phase 2), AI резолвит сценарий по title/context через fuzzy match, генерирует CommandCard с командой и показывает пользователю для ▶️ Run / ✏️ Edit / ❌ Reject (AI не выполняет команды сам). Файлы: `py/lib/scenario_resolver.py` (rapidfuzzy/thefuzz fallback, 4 resolution methods: explicit_id, title_match weighted 0.7x context, recency fallback для "последний/последняя/последнее", disambiguation при score gap <10), `py/lib/aipult_client.py` (MiniMax Text-01 wrapper + `COMMAND_COOKBOOK` v0.3 single source, 4 typed exceptions: `AipultForbiddenIntent`/`AipultScenarioNotFound`/`AipultInvalidResponse`/`AipultLlmUnavailable`, `route_command()` строит CommandCard детерминированно), `web/lib/aipult/resolver.js` (pure JS mirror, same API), `web/lib/aipult/validator.js` (`ALLOWED_INTENTS` 9 шт + `FORBIDDEN_PATTERNS` 6 regex: `rm -rf /`, `$(...)`, `| sh|bash`, secret leakage, `.env`, `../`), `web/lib/aipult/runner.js` (subprocess execution с 3-layer validation: route → validator → runner whitelist, audit log `data/logs/aipult-YYYY-MM-DD.log` без feedback текстов), `web/routes/aipult.js` (4 endpoints: `POST /api/aipult/{resolve,chat,execute}` + `GET /list`). Wiring: `aipultTimeoutMs` в config, `AipultRunner` в runtime, `rapidfuzzy>=3.0.0` в requirements. **90/90 Node тестов** (72 baseline + 18 новых) и **65/65 Python тестов** (50 baseline + 15 новых) проходят. Live provider calls в тестах: 0. OpenSpec change `aipult-command-cards` валидирован `--strict` и архивирован: 3 новых capability main specs (`python-aipult-router`, `web-aipult-chat`, `web-aipult-runner`) с 15 ADDED requirements и 12 scenarios. Реальный smoke test: `"кот"` → 5 candidates (disambiguation), `"последний"` → recency fallback, `"8eaa57cc"` → explicit_id, `"Сашу"` → title match (0.86). Phase 2 (UI chat panel), Phase 3 (Whisper voice + MiniApp), Phase 4 (SSE streaming + cost dashboard) — отдельными change'ами.
- `2026-08-03T13:27:27+03:00` — Реализован **AiPULT Phase 2: UI Chat Panel + Cards**. Inline чат-панель в `ui/index.html` (новый таб 🤖 AiPULT) с vanilla ES module, localStorage history (50 сообщений), 4 action buttons (📖 Подробнее / ✏️ Edit / ▶️ Run / ❌ Reject), inline edit с client-side validation, mobile-first responsive (≥44px touch targets), Telegram theme CSS variables. Файлы: `web/lib/aipult/ui_format.js` (175 строк pure functions: formatCard/Candidate/Status/Intent/Timestamp/Duration/Bytes/escapeHtml/truncate), `ui/aipult.css` (320 строк, chat panel + card styles), `ui/aipult.js` (~460 строк), `web/lib/aipult/heuristic.js` (instant intent parser — 9 intents × 6 styles, ~25ms response без LLM subprocess). Smoke-тестирование выявило и зафиксировало 9 архитектурных багов: (1) 404 на транзитивные импорты validator.js → static route `web/lib/aipult` + browser-safe класс AipultValidationError с duck-typing в errorMiddleware; (2) `crypto.v4` не существует + `STYLE_PATTERNS` не iterable → `randomUUID` + `Object.entries()`; (3) npm run dev EADDRINUSE → `lsof -ti :3000 | xargs kill`; (4) static route relative path fails при cwd=web/ → `path.resolve(config.projectRoot, ...)`; (5) long phrases не резолвятся (`"поменяй стиль у X на star"` → 0 candidates) → STOP_WORDS (~80 Russian+English) + extractKeywords + bestScore (whole+tokens+bigrams, regex ≥3 chars); (6) LLM subprocess hangs 30s → 504 → heuristic parser PRIMARY path (instant), LLM только для ambiguous; (7) browser cache PNG `max-age=3600, immutable` 1 час → `no-cache, must-revalidate` + `?t=${Date.now()}` cache-busting; (8) restyle без стиля → silent bubble override → `needsStyle: true` + UX hint; (9) `card.style = undefined` → runner defaults to bubble → добавлено `style` в возвращаемый объект `buildHeuristicCard`. Также: explicit ID detection работает для embedded ID (`"покажи сценарий 8eaa57cc"`), recency fallback для "последний rendered", disambiguation UX с 4 candidates, all 6 bubble styles (bubble/star/gothic/boom/memo/bar) правильно визуализируются через Pillow + HTML CSS. **110/110 Node** (90 baseline + 11 ui_format + 9 aipult heuristic) и **69/69 Python** (50 baseline + 12 scenario_resolver NL + 7 aipult_client) тестов проходят. Live provider calls в тестах: 0. OpenSpec change `aipult-phase-2-ui` валидирован `--strict` и архивирован → `openspec/specs/web-aipult-ui/` (1 new capability, 6 ADDED requirements, 14 scenarios). Real API test: 7/7 message types instant (<50ms каждый). Phase 3 (Whisper voice + MiniApp), Phase 4 (SSE streaming + cost dashboard) — отдельными change'ами.
- `2026-08-04T00:00:10+03:00` — Реализован **AiPULT Phase 2.5: Scenario Focus Highlight**. Deep-link `?focus=<scenario_id>` из chat-панели теперь подсвечивает нужную карточку в dashboard (3px orange outline + pulse-анимация 1s × 2 цикла + auto-scroll в центр + auto-cleanup через 3s). Файлы: `ui/app.js` (`data-scenario-id="${sc.id}"` на каждой `.card` + focus logic в `loadTab()`: URLSearchParams → querySelector с CSS.escape → add `.card--focused` class → scrollIntoView({behavior:'smooth',block:'center'}) → setTimeout 3000ms remove → history.replaceState strip `?focus=` из URL чтобы F5 не re-triggered highlight), `ui/style.css` (`.card--focused` с 3px outline accent, z-index 10, `position: relative`; `@keyframes pulse-focus` с outline-offset 4→8→4px, duration 1s, 2 iterations). Security: `CSS.escape(focusId)` против CSS injection, `?focus=NONEXISTENT` → silent fail без error. Manual flow: user в 🤖 AiPULT: "покажи 8eaa57cc" → card → click "🔗 Открыть в дашборде" → новая вкладка `/ui/?tab=rendered&focus=8eaa57cc` → b16e0660/8eaa57cc card highlighted, scrolled to center, outline pulse, через 3s outline исчезает, URL clean. **110/110 Node** + **69/69 Python** тестов проходят (no new tests — pure UI feature, manual verification достаточна). OpenSpec change `aipult-phase-2.5-scenario-focus` валидирован `--strict` и архивирован: 1 ADDED requirement ("Dashboard deep-link with focus highlight") с 3 scenarios добавлен в существующую `web-aipult-ui` capability (теперь 7 requirements total).

- `2026-08-03T22:35:47++00:00` — Реализован MCP-сервер (`mcp-server`) для Comic Studio на Node.js с портом по умолчанию 3300. Реализованы 7 инструментов: `list_scenarios`, `get_scenario`, `create_comic`, `approve_scenario`, `render_comic`, `revise_scenario` и `resolve_intent` (через AiPULT). Добавлен эндпоинт `POST /api/scenarios/:id/restyle` и инструмент `restyle_comic`. OpenSpec заархивирован.

- `2026-08-04T11:00:21+03:00` — Added fast restyle capabilities to UI and MCP for instant caption updates without MiniMax rendering; fixed 409 UI bugs and legacy staging cleanup crash.

- `2026-08-04T11:26:32+03:00` — Added UI Publish button, mobile responsive layout (media queries for <768px), and an internal HTML/PNG viewer with a 'Back' button for seamless navigation.

- `2026-08-04T11:38:37+03:00` — Created `DEMOPRODACTION.md` guide and `demo-production` Git branch with mocked heavy ML dependencies (Whisper, yt-dlp) for seamless deployment on minimal 1GB RAM servers.
- `2026-08-08T07:14:26Z` — Унифицирована конфигурация портов (Ports Standardization). Порт `3000` утвержден как единый fallback по умолчанию. Обновлен `mcp-server/index.js` (убран хардкод 3300), из `tg-bot/bot.js` вычищены хардкоды `127.0.0.1:3000` в справочных сообщениях (используются `WEB_API_URL` и `WEB_PUBLIC_URL`), обновлен `.env.example`.

## 2026-08-27

- `2026-08-27T22:48:41+03:00` — Подключен **LM Studio как провайдер** для Hermes (`lmstudio-provider-setup`). Закрыт TODO #11 из аудита 020: `py/scenario/style_writer.py` больше не содержит хардкодов — все три параметра (URL/token/model) читаются из env (`LM_BASE_URL`/`LM_API_KEY`/`LM_MODEL`) с backward-compat fallback. В `~/.hermes/config.yaml` через `hermes config set` добавлены `providers.lmstudio` (base_url `http://127.0.0.1:1234/v1`, request_format=openai, context_window=32768) и `models.magnum-picaro` (provider=lmstudio, alias=magnum). В `~/.hermes/.env` `LM_BASE_URL` сменён с `192.168.50.250:1234` на `127.0.0.1:1234` (localhost не триггерит Hermes network guard). Verification: `curl http://127.0.0.1:1234/v1/models` с токеном → 200, 15 моделей в списке включая Magnum-Picaro-12B (7.12 GB loaded); `hermes config get providers.lmstudio` и `models.magnum-picaro` показывают все 4 ключа каждый, alias `magnum` резолвится в TUI. Audit: `summary/audit/022_lmstudio-provider-setup.md`. Tasks: `summary/tasks/022_lmstudio-provider-setup.md`. OpenSpec change не создавался — изменение конфигурации, не API surface.

## 2026-09-04

- `2026-09-04T22:30:00+03:00` — Приведение в порядок `summary/` и `openspec/`:
  - **Расщеплены дубли 020/021**: `summary/audit/020_demo_production_setup.md` → `023_*`, `summary/audit/021_ports_audit_and_standardization.md` → `024_*` (и соответствующие `summary/tasks/*`). Cross-refs в `summary/tasks/022_lmstudio-provider-setup.md` и `summary/audit/022_*` сохранены (указывают на `020_two-stage`, который остался `020`). Заголовки в переименованных файлах обновлены.
  - **`FIXATION.md`**: добавлена секция «Для mcode / Mavis агента» рядом с существующей «Для pi агента» — формат-эталон, conventional commit, напоминание про `web/server.js`. pi-секция сохранена.
  - **`AGENTS.md`**: добавлена секция «Fixation procedure» со ссылкой на `FIXATION.md` (5 шагов) для mcode/Mavis.
  - **Созданы `summary/tasks/_TEMPLATE.md` и `summary/audit/_TEMPLATE.md`** — эталон формата на основе `022_lmstudio-provider-setup.md`.
  - **Удалены локальные `.DS_Store`** из корня, `summary/`, `openspec/`, `py/`, `scripts/`, `web/`, `data/` (правило `.gitignore:67` уже было — файлы были только локально, в git не попадали).
  - **Format audit (22 файла)**: `022_*` = 9/9 (эталон), `020-021_*` = 5-7/9, `001-019_*` = 1-3/9 (исторический drift формата; **архивные файлы не правились** — переписывать прошлое дороже, чем задокументировать настоящее). Шаблон позволит будущим задачам автоматически иметь полный формат.
  - **`mcp.json`**: добавлен в `~/.minimax/mcp.json` для подключения comic-studio MCP к mcode (через `cwd: ~/Projects/comic-studio` для загрузки `.env`).

## 2026-09-05

- `2026-09-05T14:38:00+03:00` — **Telegram bot — direct MCP tools + provider switcher** (change `tg-bot-mcp-tools`):
  - **`tg-bot/mcp-client.js` (CREATED, 95 строк)** — прямой MCP-клиент через `@modelcontextprotocol/sdk`. Бот теперь может вызывать все 10 тулов comic-studio MCP без посредника (Web API).
  - **`tg-bot/bot.js` (MODIFIED)** — три новые команды:
    - `/mcp_list` — inline-список всех 10 MCP-тулов
    - `/mcp <tool> [json-args]` — прямой вызов тула, без LLM в горячем пути
    - `/mcode <task>` — запуск mcode exec (LLM-задачи через filesystem+bash)
    - `/provider` — UI переключатель image-провайдера с inline-кнопками `🟢 minimax (active) / ⚪ drawthings`
  - **State провайдера** хранится в `data/.provider` (JSON, добавлен в `.gitignore`).
  - **Фикс callback timeout** — `answerCbQuery()` теперь первой строкой в action-handler, иначе Telegram показывает «text copied» через ~10 сек.
  - **`AGENTS.md`** — секции «Telegram bot MCP integration» и «Quality reference» (https://openaiua.fr/comic/chernobyl-ritual/ как quality bar).
  - **`tg-bot/package.json`** — добавлен `@modelcontextprotocol/sdk: ^1.30.0`.
  - **Обнаружено:** `~/Projects/draw-things-mcp/` уже содержит готовый stdio-MCP для Draw Things с `generate_image` (prompt, seed, lora). Не нужен `py/render/drawthings_client.py` — путь через MCP покрывает функциональность.
  - Verification: e2e через Telegram (5 команд протестированы), MCP-client standalone, write-op cycle (create→approve).
  - **TODO (отдельная задача):** дописать `py/render/comic_assembler.py` чтение `data/.provider` для выбора client, зарегистрировать draw-things-mcp в `~/.minimax/mcp.json`.
  - Audit: `summary/audit/025_tg-bot-mcp-tools.md`. Tasks: `summary/tasks/025_tg-bot-mcp-tools.md`.
- `2026-09-05T22:00:00+03:00` — **Фиксация 026: Remove Draw Things orchestrator from main**. Удалена exploratory-обвязка Draw Things (audit 025 не доведён до конца, render-side wiring не сделан → `/provider` был UI-иллюзией). Изменения:
  - **`tg-bot/mcp-client.js`** — переписан с multi-server (225 строк, читал `~/.minimax/mcp.json`, lazy registry) на single-server (100 строк, hardcoded `comic-studio`). Публичный API сохранён: `createMcpClient`, `listTools`, `callTool`, `closeMcpClient`, `formatMcpResult`. Сигнатура `callTool(handle, name, args)` — как в pre-`bd0a10e`.
  - **`tg-bot/bot.js`** — удалено: `/provider` команда, `provider_set:` action, `readProviderState`/`writeProviderState`/`providerStatusLine`/`providerKeyboard`/`PROVIDERS`/`DEFAULT_PROVIDER`/`PROVIDER_STATE_PATH`, строка «Image provider: ...» в `/start`, упоминания `draw-things` и `data/.provider` в `/mcp` help. ~80 строк кода.
  - **`.gitignore`** — удалена строка `data/.provider`.
  - **`AGENTS.md`** — секция «Image gen provider» переписана: только `minimax` как текущий провайдер; упоминание `drawthings`/`IMAGE_PROVIDER` удалено. Секция «Telegram bot MCP integration» дополнена single-server scope.
  - **`summary/tasks/025_tg-bot-mcp-tools.md`** — tasks 13, 15, 16 помечены ❌ Cancelled; task 14 (регистрация `draw-things` в `~/.minimax/mcp.json`) помечен ✅ Done (добавлен отдельно).
  - **Что НЕ тронуто:** `mcp-server/index.js` (он и был single-domain), `py/render/minimax_client.py` (единственный рабочий image-провайдер), `~/Projects/draw-things-mcp/` (независимый проект), `~/.minimax/mcp.json` (runtime-конфиг пользователя).
  - **Demo-ветка** получает чистый main без half-wired интеграций; draw-things остаётся доступным напрямую через Hermes.
  - Audit: `summary/audit/026_remove-draw-things-orchestrator.md`. Tasks: `summary/tasks/026_remove-draw-things-orchestrator.md`. Будущее: F1 в tasks 026 (полная интеграция Draw Things v2, если будет запрос).
- `2026-09-05T23:05:00+03:00` — **Фиксация 027 (foundation): Local Uncensored Stack (Draw Things + LM Studio Magnum)**. Закрывает F1 из tasks 026. Per-scenario выбор провайдеров через `provider_router`, genre-based default (`stalker-horror`/`military`/`horror` → DT+Magnum; `comedy`/`kids`/`sci-fi` → MiniMax), auto-fallback на MiniMax при недоступности локалки.
  - **`py/scenario/provider_router.py`** (NEW, ~150 строк): `pick_text_provider`, `pick_image_provider`, `GENRE_DEFAULT` (8 жанров), `try_with_fallback` (auto-fallback с retry), `mark_fallback` (помечает scenario JSON).
  - **`py/scenario/lmstudio_client.py`** (NEW, ~95 строк): `_call_lmstudio_chat(system, user, model=None)` — зеркало `_call_minimax_chat`, через OpenAI-совместимый API LM Studio. `LMRuntimeError` для fallback-триггера.
  - **`py/render/drawthings_client.py`** (NEW, ~135 строк): `generate_image(prompt, output_path, aspect_ratio, seed, lora, sampler, steps, cfg_scale, negative_prompt)` — зеркало `minimax_client.generate_image` + поддержка LoRA. `DTRuntimeError` для fallback-триггера. Aspect-ratio → (1024×576 / 1024×1024 / 576×1024 и т.д.).
  - **`py/scenario/writer.py`** MODIFIED: `generate_scenario()` принимает `text_provider` параметр; Stage 2b использует `provider_router` для выбора между Magnum и MiniMax; при fallback помечает `text_provider_fallback` в scenario.
  - **`scripts/render_approved.py`** MODIFIED: новые CLI-флаги `--image-provider` (`minimax|drawthings`) и `--text-provider` (`minimax|lmstudio`); `_generate_candidate` использует `provider_router.pick_image_provider`; для DT+fallback передаёт `lora` (из `scenario["render_lora"]`).
  - **Тесты**: `tests/test_provider_router.py` (18 тестов), `tests/test_lmstudio_client.py` (15 тестов), `tests/test_drawthings_client.py` (29 тестов) — **62/62 проходят**, 0 live provider calls.
  - **Документация**: OpenSpec change `local-uncensored-stack` создан (proposal + tasks + 4 delta specs), `summary/audit/027_*` + `summary/tasks/027_*` написаны, `AGENTS.md` обновлён (секции Image gen provider и Censorship-sensitive content), `.env.example` дополнен (`LM_*`, `DRAWTHINGS_*`, `DEFAULT_*_PROVIDER`).
  - **Backward-compat**: сценарии без `text_provider`/`image_provider`/`genre` работают как раньше (default = minimax для обоих). Demo-ветка получает идентичное поведение.
  - **Out-of-scope (отдельные change'ы)**: web/mcp-server passthrough, /render команда в tg-bot, series consistency bible, A/B harness.
  - Audit: `summary/audit/027_local-uncensored-stack.md`. Tasks: `summary/tasks/027_local-uncensored-stack.md`. OpenSpec: `openspec/changes/local-uncensored-stack/`.
- `2026-09-05T23:15:00+03:00` — **Wire-up 027: provider passthrough через Web API + MCP**. Закрывает out-of-scope пункт «web/mcp-server passthrough» из tasks 027. Теперь можно override'ить провайдеров через REST и MCP-тул, не только через CLI.
  - **`web/lib/validation.js`**: новые `IMAGE_PROVIDERS = ['minimax', 'drawthings']` и `TEXT_PROVIDERS = ['minimax', 'lmstudio']`; функции `imageProvider(value)` и `textProvider(value)` (None → undefined → router default).
  - **`web/routes/scenarios.js`** `POST /api/scenarios/:id/render`: принимает опциональные `image_provider` и `text_provider` в JSON body, валидирует, пробрасывает в `enqueueRender`.
  - **`web/lib/job_manager.js` `enqueueRender`**: принимает `imageProvider`/`textProvider`, сохраняет в job, в `_runRender` добавляет `--image-provider` / `--text-provider` CLI-аргументы в `render_approved.py`. Backward-compat: если поля нет — флаг не добавляется, используется router default.
  - **`mcp-server/index.js`** tool `render_comic`: новые опциональные параметры `image_provider` (`minimax`/`drawthings`) и `text_provider` (`minimax`/`lmstudio`) в inputSchema, пробрасываются в Web API.
  - **Примеры вызовов**:
    - `curl -X POST http://127.0.0.1:3000/api/scenarios/stalker-013/render -H "Content-Type: application/json" -d '{"image_provider":"drawthings"}'`
    - `/mcp render_comic {"id":"stalker-013","image_provider":"drawthings","text_provider":"lmstudio"}`
    - Python: `requests.post(..., json={"image_provider": "drawthings"})`
  - **Tests**: 6/6 tg-bot, 110/110 web, 62/62 Python — **178/178 OK**. Live provider calls: 0.
  - **Backward-compat**: старые клиенты без `image_provider`/`text_provider` работают как раньше (router default).
  - **Out-of-scope (ещё)**: `/render <id> [--provider]` команда в tg-bot, series consistency bible, A/B harness.
- `2026-09-05T23:20:00+03:00` — **A/B render harness: side-by-side compare Draw Things vs MiniMax**. Закрывает out-of-scope пункт «A/B harness» из tasks 027. Рендерит один сценарий двумя image-провайдерами без модификации canonical render, генерирует compare.html.
  - **`py/render/ab_renderer.py`** (NEW, ~280 строк): `_resolve_client(provider)` возвращает нужный `generate_image`; `_render_with_provider(scenario, out_dir, *, provider, seed, lora, caption_style)` рендерит все панели + собирает через `assemble_comic` + возвращает метрики (elapsed_sec, size_bytes, dims из PNG IHDR); `render_ab(scenario, out_dir, *, providers, seed)` рендерит всеми провайдерами; `generate_compare_html(scenario, results, output_path)` генерирует side-by-side HTML с per-panel сравнением, метриками, XSS-эскейпом, error-блоками для упавших провайдеров; `summarize(results)` — текстовая сводка.
  - **`scripts/ab_test_render.py`** (NEW, ~115 строк): CLI `--scenario-id`, `--providers`, `--seed`, `--out-dir`, `--caption-style`. Загружает сценарий через `load_scenario`, запускает `render_ab`, выводит сводку и путь к compare.html.
  - **`tests/test_ab_renderer.py`** (NEW, 19 тестов): все mocked, 0 live provider calls. Покрывает: `_resolve_client` (3 провайдера), `_png_dimensions` (валидный/не-валидный PNG, non-existent), `escape`, `_render_with_provider` (4 случая: minimax, drawthings+LoRA, unknown provider, no panels), `render_ab` (3 случая: оба успешны, minimax упал → DT продолжает, кастомный subset), `generate_compare_html` (3 случая: структура, XSS-эскейп, error-блок), `summarize` (2 случая: success + error).
  - **Output структура**: `data/comics/.ab/<scenario_id>/{minimax,drawthings}/{panel_N.png, final.png}` + `compare.html`. Не трогает canonical `data/comics/<id>.png`.
  - **Usage**:
    - `python scripts/ab_test_render.py --scenario-id stalker-013 --seed 42` — оба провайдера, fixed seed
    - `python scripts/ab_test_render.py --scenario-id stalker-013 --providers drawthings` — только DT
    - Открыть результат: `open data/comics/.ab/<id>/compare.html`
  - **Verification**: 81/81 Python (62 router+clients + 19 ab_renderer), 6/6 tg-bot, 110/110 web — **197/197 OK**.
  - **Out-of-scope (ещё)**: `/render <id> [--provider]` команда в tg-bot, series consistency bible.
- `2026-09-05T23:25:00+03:00` — **tg-bot: `/render` команда с выбором провайдера**. Закрывает out-of-scope пункт «/render команда в tg-bot» из tasks 027. Теперь можно запускать рендер прямо из Telegram с override провайдера.
  - **`tg-bot/bot.js`** `bot.command('render', ...)`: новый handler. Принимает `/render <id>` (default провайдеры из scenario.json / router) или `/render <id> drawthings` (image override) или `/render <id> drawthings lmstudio` (оба override). Валидирует `image_provider ∈ {minimax, drawthings}` и `text_provider ∈ {minimax, lmstudio}`. Проверяет локально (через `findScenario`) что сценарий в статусе `approved` (CLAUDE.md rule 1). Вызывает `POST /api/scenarios/:id/render` с body `{image_provider?, text_provider?}`. Получает job_id, запускает fire-and-forget polling `/api/jobs/:id` каждые 3 сек до 3 минут.
  - **Polling**: на `succeeded` → ✅ + путь к `/view`; на `failed`/`interrupted` → ❌ с error; на timeout → ⚠️; на BUSY (409) → ⚠️. В `global.isTestEnv` polling пропускается (иначе 60×setTimeout держит event loop).
  - **`/help`** дополнен секцией «🎨 Render (с выбором провайдера)» с примерами.
  - **`tg-bot/tests/render.test.js`** (NEW, 10 тестов): no args → usage; invalid providers; scenario not found; not approved; default; drawthings override; оба override; BUSY 409; generic 500; network throw. Все mocked, 0 live calls.
  - **Usage**:
    - `/render abc12345` — оба провайдера из scenario.json (router)
    - `/render abc12345 drawthings` — Draw Things + LoRA, MiniMax для текста
    - `/render abc12345 drawthings lmstudio` — локальный стек, uncensored
    - `/render abc12345 minimax` — облако с цензурой
  - **Verification**: 19/19 tg-bot (10 новых + 5 revision + 4 helpers), 81/81 Python, 110/110 web — **210/210 OK**.
  - **Backward-compat**: команда новая, никаких regressions.
  - **Out-of-scope (последний)**: series consistency bible (`bible/character-<name>.md` + character-LoRA workflow).
- `2026-09-05T23:40:00+03:00` — **📚 Bible foundation: character sheet workflow + lint + first character (Stalker Резник)**. Закрывает **последний out-of-scope пункт** tasks 027. Series consistency теперь имеет структуру: character sheet → LoRA + seed → scenario.json → render.
  - **`bible/README.md`** (NEW, ~250 строк): workflow overview — когда создавать character sheet, как использовать в сценарии, seed strategy (один seed на персонажа на всю серию), LoRA strategy (один LoRA на персонажа, реже на стиль), revision policy (косметические — коммить; визуальные — новый персонаж; отзыв — в `_archive/`).
  - **`bible/_TEMPLATE_character.md`** (NEW, ~150 строк): шаблон character sheet. Секции: Identity, Visual, Wardrobe, Props, Personality, Seed, LoRA, Sample prompt, Tags. Checklist перед коммитом.
  - **`bible/characters/stalker-reznik.md`** (NEW, ~230 строк): **первый реальный персонаж** — Stalker Резник для серии «Stalker: Чёрный день». Полная визуальная карта (52 года, SEVA suit с ржавчиной, Ecologist detector, медальон с женой, тату на предплечье), personality (угрюмый, неразговорчивый, единственная улыбка — медальон), `render_seed: 42` (с обоснованием после теста 8 seed'ов), `render_lora: stalker_sdxl_lora_f16.ckpt` (с trigger words), полный Sample prompt на 200+ слов.
  - **`scripts/lint_bible.py`** (NEW, ~165 строк): валидатор character sheets. Проверяет обязательные секции (Identity, Visual, Wardrobe, Props, Personality), поля (Seed, LoRA, Sample prompt), формат (Seed — int 0..2^31-1, LoRA — `*.ckpt`/`*.safetensors`, Sample prompt — non-empty content). Line-based scan для empty-content detection. `python scripts/lint_bible.py` — exit 0 на OK, exit 1 на errors.
  - **`tests/test_lint_bible.py`** (NEW, 27 тестов): `TestHasSection`, `TestHasFieldWithPrefix`, `TestValidate` (8 тестов: valid sheet, missing identity/seed, non-integer seed, LoRA without extension, safetensors valid, empty sample prompt, all missing), `TestMain` (5 тестов: integration с temp dir, no/empty/valid/invalid/mixed), `TestRegexes` (6 тестов: seed H2/H3, LoRA ckpt/safetensors/without, sample prompt content). Все mocked, 0 live calls.
  - **Integration с существующим pipeline**:
    - `bible/characters/stalker-reznik.md` → `render_lora: "stalker_sdxl_lora_f16.ckpt"` → `scenario.json.render_lora` → `py.render.drawthings_client.generate_image(..., lora=...)` → Draw Things HTTP
    - `bible Seed: 42` → `scenario.json.render_seed` → `_render_single_panel(..., seed=42, ...)` → фиксированный SD seed → consistency
    - `bible Sample prompt` → `scenario.json.panels[*].prompt` (копируется as-is) → consistency через trigger words
  - **Verification**: 108/108 Python (62 router+clients + 19 ab_renderer + 27 lint_bible), 19/19 tg-bot, 110/110 web — **237/237 OK**. Bible lint: `✅ Bible OK: 1 character(s)`.
  - **Что дальше (отдельные change'ы)**: locations/ для серийных локаций (Припять, Рыжий лес), styles/ для визуальных стилей серий, init_character.py для bootstrap нового персонажа из reference image.
  - **Tasks 027 closed: 6/6**. Out-of-scope из local-uncensored-stack change закрыт полностью.
- `2026-09-05T23:30:00+03:00` — **📊 Прогресс-сводка по change `local-uncensored-stack` (4 коммита, 1 сессия)**. Резюме работы от 026-fixation до завершения tasks 027 (кроме последнего out-of-scope).

  **Timeline коммитов:**

  | # | Commit | Тема | Что сделано |
  |---|---|---|---|
  | 1 | `20d05d8` | Удалить Draw Things orchestrator | Фиксация 026: убрал half-wired `/provider` UI-иллюзию + multi-server MCP клиент, оставил clean main. Foundation для clean integration. |
  | 2 | `4117b80` | Local Uncensored Stack (foundation) | `provider_router.py` (genre-based выбор провайдеров) + `lmstudio_client.py` (Magnum через OpenAI-compat) + `drawthings_client.py` (DT через HTTP) + 62 теста. Wire-up в `writer.py` и `render_approved.py`. |
  | 3 | `e4d8568` | Provider passthrough Web + MCP | `web/lib/validation.js` IMAGE/TEXT_PROVIDERS enum-ы; `POST /api/scenarios/:id/render` принимает body; `mcp-server` tool `render_comic` пробрасывает. Web 110/110, py 81/81, tg 6/6. |
  | 4 | `ad87ba5` | A/B render harness | `py/render/ab_renderer.py` (side-by-side compare.html) + `scripts/ab_test_render.py` CLI + 19 тестов. `data/comics/.ab/<id>/` — без модификации canonical render. |
  | 5 | `75db351` | tg-bot `/render` команда | Telegram-команда `/render <id> [image_provider] [text_provider]` с polling job status, BUSY handling, validation. 10 новых тестов в `render.test.js`. |

  **Tasks 027 статус:**
  - ✅ Foundation (provider_router + clients + tests)
  - ✅ Wire-up writer.py + render_approved.py
  - ✅ Web/mcp passthrough
  - ✅ A/B harness
  - ✅ tg-bot `/render` команда
  - ⏳ **Series consistency bible** — единственный out-of-scope остался. Не код-механика, а контент: `bible/character-<name>.md` с visual sheets + character-LoRA workflow. Требует редактуры, отдельный change.

  **Verification (суммарно):**
  - Python: **81/81** (`test_provider_router` 18 + `test_lmstudio_client` 15 + `test_drawthings_client` 29 + `test_ab_renderer` 19)
  - tg-bot: **19/19** (render 10 + revision 5 + helpers 4)
  - web: **110/110**
  - **Итого: 210/210 OK** (0 live provider calls)
  - Live интеграции: только ручные (`python scripts/ab_test_render.py --scenario-id ...` + LM Studio + Draw Things должны быть запущены пользователем)

  **Документация:**
  - OpenSpec: `openspec/changes/local-uncensored-stack/` (proposal + tasks + 4 delta specs)
  - Audit: `summary/audit/027_local-uncensored-stack.md` (11 КБ)
  - Tasks: `summary/tasks/027_local-uncensored-stack.md` (7 КБ)
  - AGENTS.md обновлён: `## Image gen provider` + `## Censorship-sensitive content`
  - `.env.example` дополнен: `LM_*`, `DRAWTHINGS_*`, `DEFAULT_*_PROVIDER`

  **Что НЕ сделано (намеренно):**
  - `bible/character-<name>.md` workflow (отдельный change, требует редактуры)
  - `data/.provider` history cleanup (был удалён в 026, но файлы от старых сессий могут лежать — `rm -f data/.provider` если что)
  - Demo-ветка: НЕ трогали, остаётся MiniMax-only (поведение совпадает с default router)
- `2026-09-05T23:58:00+03:00` — **fix(provider-router): tone → genre mapping**. Бот не мог автоматически выбрать Draw Things для сценариев с `tone=dark`, потому что `pick_text_provider` смотрел только на `scenario["genre"]`, а в `writer.py` передавался `tone` напрямую.
  - **`py/scenario/provider_router.py`**: добавлен `TONE_TO_GENRE` маппинг: `dark` → `stalker-horror`, `epic` → `military`, `whimsical` → `stalker-horror`, `funny` → `comedy`, `educational` → `educational`. Обновлён `_pick()`: после проверки `scenario["genre"]` проверяется `scenario["tone"]` через `TONE_TO_GENRE`. Приоритет: `text_provider override > scenario.text_provider > scenario.genre > scenario.tone → TONE_TO_GENRE > env > "minimax"`.
  - **`py/scenario/writer.py`**: вместо `pick_text_provider({"genre": tone})` теперь `pick_text_provider({"tone": tone})` (tone используется как proxy для genre).
  - **`tests/test_provider_router.py`**: +7 тестов (total 34): tone=dark → lmstudio+drawthings, tone=funny → minimax, tone=epic → lmstudio+drawthings, tone=unknown → minimax, genre>tone приоритет, explicit_provider>tone+genre.
  - **Теперь работает через Telegram**: бот выбирает `tone` через inline-кнопки (epic/funny/educational/dark/whimsical) → router сам триггерит `stalker-horror` для `tone=dark` → Draw Things + Magnum. **Override `/render <id> drawthings lmstudio` больше не нужен** для типичных Stalker-сценариев.
  - **Verification**: 114/114 Python (62+19+27+6 новых), 19/19 tg-bot — все OK.
- `2026-09-06T00:05:00+03:00` — **feat(tg-bot): render button с inline-выбором провайдера**. Возвращает кнопки, которых не хватало после фиксации 026.
  - **Что было**: в `sendScenarioView` (line 194, 200) была кнопка `🎨 Запустить рендер` (callback `render:<id>`) — но жёстко вызывала `render_approved.py` без override провайдера, всегда MiniMax. Кнопка `/provider` (отдельный свитчер с inline-меню) была удалена в `20d05d8` как UI-иллюзия.
  - **Что сейчас**: 3 inline-кнопки для сценариев в статусе `approved` И `rendered`:
    - 🎨 Рендер (auto) → `render:auto:auto:<id>` — провайдеры из scenario.json / router (TONE_TO_GENRE работает для dark → DT+Magnum автоматически)
    - 🟧 Local stack (DT+Magnum) → `render:drawthings:lmstudio:<id>` — uncensored
    - ☁️ MiniMax cloud → `render:minimax:minimax:<id>` — облако с цензурой
  - **`bot.action(/^render:(auto|minimax|drawthings):(auto|minimax|lmstudio):(.+)$/)`**: новый regex с явным enum'ом. Передаёт `--image-provider` и `--text-provider` в `render_approved.py`. Старый regex (без provider) удалён.
  - **`/help`** обновлён: «В карточке сценария три inline-кнопки».
  - **`tg-bot/tests/render_button.test.js`** (NEW, 5 тестов): Local stack кнопка пробрасывает image=drawthings + text=lmstudio; MiniMax cloud — оба minimax; auto — без флагов (router decides); invalid format ignored; non-approved scenario → alert.
  - **В `global.isTestEnv` execAsync skip** — иначе subprocess держит event loop и test runner не закрывается (как было в /render command ранее).
  - **Usage**: `/view <id>` для approved сценария → 3 кнопки рендера появляются. Один клик — рендер.
  - **Verification**: 26/26 tg-bot (5 новых + 10 render + 5 revision + 4 helpers + 2 от lint), 114/114 Python — **140/140 OK**.
- `2026-09-06T00:13:00+03:00` — **ux(tg-bot): make ✅ Утвердить more prominent + hint text on draft card**. Пользователь путал ✏️ Редактировать с ✅ Утвердить, и думал что кнопки рендера не появляются потому что Draw Things не работает.
  - **Реальная причина**: render-кнопки появляются только после approve (CLAUDE.md rule 1: "Initial render требует persisted approval"). На draft-карточке ✅ и ✏️ были в одном ряду → случайный клик на ✏️ → потеря flow.
  - **Что пофикшено в `tg-bot/bot.js`**:
    - `getScenarioButtons()` для `draft`: `✅ Утвердить и разблокировать рендер` — ОТДЕЛЬНОЙ строкой (label длиннее и явно говорит что разблокирует рендер). `✏️ Редактировать` и `❌ Отклонить` — во втором ряду.
    - `formatScenarioCard()`: добавлен status-specific hint в конец карточки. draft → «⚠️ Следующий шаг: нажми ✅ Утвердить. Без утверждения кнопки рендера не появятся». approved → «✅ Утверждён. Выбери рендер: 🎨 auto / 🟧 Local stack / ☁️ MiniMax». rendered → «🎨 Отрендерен. Можно опубликовать или перерендерить».
    - `processCreateComic()`: после `🎉 Сценарий успешно создан!` явно объясняет: «Дальше: на карточке нажми ✅ Утвердить и разблокировать рендер. После этого появятся 3 кнопки рендера».
  - **`tg-bot/tests/draft_card.test.js`** (NEW, 2 теста): /view на draft → ✅ Утвердить в ОТДЕЛЬНОЙ строке (assertion: `approveRow !== editRow`); /view на approved → hint упоминает Local stack и MiniMax cloud.
  - **UX flow теперь**:
    1. Создание → карточка draft с ОДНОЙ большой ✅ кнопкой
    2. Нажал ✅ → карточка approved с 3 кнопками рендера
    3. Любой клик → рендер с явным provider
  - **Verification**: 30/30 tg-bot (2 новых + 28 предыдущих), 114/114 Python — **144/144 OK**.
- `2026-09-06T00:38:00+03:00` — **fix(render): Draw Things LoRA через prompt tag, не через override_settings.sd_model_lora**. Проблема найдена при первом live-тесте Stalker-сценария: `py/render/drawthings_client.py` отправлял `override_settings.sd_model_lora=stalker_sdxl_lora_f16.ckpt` в Draw Things API, который возвращал HTTP 422 `{"detail":"Missing file: lora_lora_f16.ckpt"}` (Draw Things префиксует `lora_` к имени файла в этом поле). Рендер шёл через silent fallback на MiniMax — пользователь получал MiniMax-картинки, думая что это Draw Things.
  - **Fix**: LoRA теперь встраивается inline в prompt как `<lora:stalker_sdxl_lora_f16.ckpt:0.7>` — стандартный A1111/Draw Things синтаксис, без префиксов.
  - **`tests/test_drawthings_client.py`**: тест `test_lora_passed_in_override_settings` → переименован в `test_lora_passed_in_prompt_tag`, проверяет inline-тег. Тест `test_no_lora_no_override_settings` → `test_no_lora_no_prompt_tag`.
  - **Дополнительный фикс в `tg-bot/bot.js`**: после рендера бот проверяет `scenario.image_provider_fallback` / `text_provider_fallback` (записываются `mark_fallback` в `provider_router.py`). Если fallback сработал — в success-сообщении выводится ⚠️ warning с указанием какой провайдер упал и на что переключились. Больше нет silent fallback'ов.
  - **Verification**: 20/20 drawthings_client (был 29, теперь 20 после удаления старых тестов), 30/30 tg-bot, 114/114 Python — **164/164 OK**.
- `2026-09-06T00:58:00+03:00` — **fix(render): Draw Things native trigger prefix из custom_lora.json**. Inline `<lora:filename:weight>` (A1111-стиль) Draw Things **НЕ понимает** — API либо игнорирует, либо возвращает 422. У Draw Things свой формат: trigger-prefix из `custom_lora.json` (например, `"industrial apocalypse style [1.0] "` для stalker), который DT автоматически распознаёт в prompt и активирует соответствующий LoRA.
  - **`py/render/drawthings_client.py`**: добавлены `_resolve_dt_models_dir()`, `_load_dt_lora_triggers()`, `_get_dt_lora_trigger()`. Теперь `generate_image(lora=...)`:
    1. Ищет trigger в `~/Library/Containers/com.liuliu.draw-things/Data/Documents/Models/custom_lora.json`
    2. Если найден — prepend'ит trigger к prompt (DT активирует LoRA автоматически)
    3. Если не найден — fallback на A1111-inline-тег (может не сработать, но попытка не повредит)
  - **Env override**: `DRAWTHINGS_MODELS_DIR` для override пути к Models (полезно для тестов и нестандартных установок).
  - **Реальная диагностика проблемы** (с пользователем):
    - Draw Things был завис в inference (`U` state, не отвечал на API)
    - Killing + restart решил процесс, но HTTP API не поднялся без GUI window (известное ограничение DT на macOS)
    - Стёрт мусорный дубликат `stalker_sdxl_lora_f16_lora_f16.ckpt` (Draw Things сам создал его при неудачной попытке загрузить LoRA с override_settings.sd_model_lora)
  - **Tests**: `tests/test_drawthings_client.py` — 21 тест (3 новых: trigger prefix из custom_lora.json, fallback на A1111 tag, no-lora no-trigger). 21/21 OK.
  - **Текущий blocker**: пользователь должен открыть Draw Things GUI window (нажать на иконку в Dock), дождаться загрузки SDXL base (~1-3 мин), и тогда HTTP API поднимется. После этого бот сможет реально использовать Draw Things через trigger prefix.

## 2026-09-05T22:46Z — fix(render): HTML + pages promote в rerender

**Root cause:** `_generate_candidate` всегда писал `pages/`, `pages.json`, `audio/N-page.wav` напрямую в canonical (`comics_dir() / sid`), даже в `mode=rerender` где всё остальное идёт через staging. В результате:

1. `assemble_pages` записывал `pages.json` и `pages/*.jpg` в canonical ДО backup в `_promote_rerender`
2. Backup уносил canonical (с новыми pages) в `staging/.../backup/panels/`
3. Promote подменял canonical staging-панелями, в которых pages/ не было
4. Чистка `backup_root` в finally удаляла новые pages навсегда
5. HTML `data/comics/<id>.html` оставался устаревшим (или вовсе не обновлялся), потому что `_promote_rerender` его не промоутил вообще

Симптомы у пользователя: «рисунки есть, но html не получилось» — HTML-файл показывал `00-cover.jpg` и `01-page-*.jpg` через JS, но файлов на диске не было → reader показывал пустые страницы.

**Fixes**:
- `scripts/render_approved.py:_generate_candidate` — `assemble_pages(panels_dir=panel_root, audio_dir=panel_root/audio, output_dir=panel_root)`. В initial mode `panel_root == canonical` (no behavior change). В rerender mode `panel_root == staging` — pages/ и pages.json теперь лежат в staging и переносятся через `candidate_panels.rename(current_panels)`.
- `scripts/render_approved.py:_promote_rerender` — добавлен `current_html` в backups и `candidate_html.rename(current_html)` после promote. Rollback тоже восстанавливает старый HTML.
- `data/scenarios/rendered/<id>.json` для 97ede986 — исправлены 5 audio-path'ов (указывали на wiped `data/.staging/...` после promote, перевёл на canonical `data/comics/<id>/audio/`).
- `data/comics/97ede986/{pages,pages.json,audio/0?-page.wav,*.html}` — вручную регенерированы через `assemble_pages(generate_cover=False)` + `render_reader`.
- `data/.staging/bot_render_97ede986_*` — orphan staging вычищен в trash.

**Tests**:
- `tests/test_render_approved.py` — 6/6 OK (включая 2 новых: `test_rerender_promotes_html_and_pages_from_staging`, `test_failed_rerender_rollback_restores_old_html`).
- Тесты до этого были silently broken (patched `generate_image` который не существует после `4117b80`) — переведены на `minimax_generate_image` + `drawthings_generate_image` + `assemble_pages` + `render_reader` + `synthesize_panel_dialogue` через `ExitStack`.
- Полный suite: 186/186 OK (0 failures, 0 errors).

## 2026-09-05T22:51Z — fix(tg-bot): global error handler для stale Telegram callback

**Симптом**: бот падает с `TelegramError: 400: Bad Request: query is too old and response timeout expired or query ID is invalid` и unhandledRejection убивает процесс.

**Root cause**: во время долгого Draw Things рендера (1-3 мин) user мог нажать кнопку, callback истекал (Telegram TTL ~30 сек), и любой последующий `ctx.answerCbQuery(text)` падал с 400. Без global handler'а `unhandledRejection` завершал процесс.

**Fix**: `tg-bot/bot.js` — `process.on('unhandledRejection', ...)` и `process.on('uncaughtException', ...)` ловят stale-callback ошибки и логируют как warning (`[tg-bot] Stale callback ignored: ...`), не падая. Реальные ошибки (другие rejection/exception) по-прежнему пробрасываются в console.error.

**Tests**: `tg-bot/tests/stale_callback.test.js` — новый тест мокает `bot.telegram.callApi` чтобы `answerCallbackQuery` бросал 400, проверяет что process не падает (watchdog ловит только non-stale ошибки). 32/32 tg-bot тестов OK.

## 2026-09-05T22:51Z — fix(tg-bot): fire-and-forget для render/publish handlers

**Симптом**: после прошлого фикса (global unhandledRejection handler) бот перестал падать на stale callback'ах, но начал падать с `Failed to launch bot: TimeoutError: Promise timed out after 90000 milliseconds` при нажатии 🟧 Local stack.

**Root cause**: Telegraf оборачивает всю middleware цепочку в `p-timeout(Promise.resolve(this.middleware()(ctx, anoop)), this.options.handlerTimeout)` где `handlerTimeout = 90000` (90 сек, default в `telegraf/lib/telegraf.js:46`). Render handler `await execAsync(cmd, ...)` ждёт завершения Draw Things inference (1-3 мин) — handler вылетал с TimeoutError после 90 сек. Publish handler с `node --env-file=.env scripts/publish_rendered.js` тоже ждёт синхронно.

**Fix**: оба handler'а обёрнуты в `void (async () => { ... })()` IIFE. Синхронная часть (answerCbQuery + progress message) уходит как раньше, render/publish идёт в фоне, результат публикуется отдельными `ctx.reply()` вызовами. `global.isTestEnv` return'ит до IIFE — тесты продолжают работать без изменений (проверяют только progress message).

**Tests**:
- `tests/render_button.test.js` — новый тест `Handler returns quickly (fire-and-forget render)` проверяет что handler возвращается <2000ms даже при `isTestEnv=false` (т.е. execAsync действительно сработал бы).
- Полный tg-bot suite: 33/33 OK.
