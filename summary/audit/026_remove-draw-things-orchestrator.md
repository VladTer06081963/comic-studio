# Аудит: Remove Draw Things orchestrator from main

**Дата:** 2026-09-05
**Change ID:** `remove-draw-things-orchestrator`
**Компаньон:** `summary/tasks/026_remove-draw-things-orchestrator.md`
**Предшественник:** `summary/audit/025_tg-bot-mcp-tools.md` (multi-server MCP client + /provider)

## 1. Контекст

Аудит 025 (commit `bd0a10e`) ввёл в `main` exploratory-инфраструктуру для интеграции
Draw Things как альтернативного image-провайдера:

- `tg-bot/mcp-client.js` — переписан с single-server на multi-server: читает
  `~/.minimax/mcp.json`, лениво спавнит **все** зарегистрированные MCP-серверы
  (comic-studio + draw-things), умеет резолвить tool name → server.
- `tg-bot/bot.js` — добавлена `/provider` команда с inline-кнопками
  `🟢 minimax / ⚪ drawthings`; состояние провайдера пишется в `data/.provider`.
- `.gitignore` — добавлен `data/.provider`.
- `AGENTS.md` — секция `Image gen provider` упоминает `py/render/drawthings_client.py`
  как TODO и описывает переключение через `IMAGE_PROVIDER` env.

Через месяц выяснилось:

1. **Draw Things к рендер-пайплайну так и не подключён.** `py/render/comic_assembler.py`
   жёстко вызывает `minimax_client.generate_image()` и не читает `data/.provider`.
   Render-side wiring (task #13 из `summary/tasks/025`) остался TODO.
2. **`/provider` — UI-иллюзия.** Кнопка переключает state в `data/.provider`, но
   следующий `render_comic` всё равно идёт в MiniMax. Пользователь видит зелёную
   «drawthings (active)» и думает, что рендерит локально — а это не так.
3. **Multi-server MCP-клиент используется только для `/mcp_list`.** В горячем
   пути (`/mcp <tool>`) `resolveToolServer` всё равно находит comic-studio первым.
   Второй сервер не вызывается ни одной командой бота.
4. **Demo-ветка не планирует использовать Draw Things.** `origin/demo-production`
   — публичный демо-стенд; туда не должны попасть half-wired интеграции, которые
   врут пользователю (зелёная кнопка, которая ничего не делает).
5. **В `~/.minimax/mcp.json` уже зарегистрирован `draw-things`** (отдельно от бота,
   через Hermes) — это не трогаем, это пользовательский runtime-конфиг.

## 2. Решение

**Удалить из `main` всю exploratory-обвязку Draw Things, оставив только то, что
реально работает и нужно demo-ветке:**

| Что | Действие | Почему |
|---|---|---|
| `tg-bot/mcp-client.js` (multi-server) | **Переписать** на single-server (comic-studio only) | `/mcp` и `/mcp_list` остаются; draw-things достижим напрямую через Hermes, не через бот |
| `/provider` команда + `provider_set:` action | **Удалить** | UI врёт (см. п.2 контекста) |
| `data/.provider` state + I/O | **Удалить** | Больше нет источника правды для переключение |
| `data/.provider` в `.gitignore` | **Удалить** | Файл больше не создаётся |
| `AGENTS.md` → `Image gen provider` | **Переписать**: убрать `drawthings` и `IMAGE_PROVIDER` env, оставить только MiniMax | Документация не должна упоминать half-wired пути |
| `AGENTS.md` → `Telegram bot MCP integration` | **Минимальная правка**: убрать упоминание `draw-things` в `/mcp_list` | Текст должен соответствовать реальному single-server поведению |
| Tasks #14, #15, #16 в `summary/tasks/025` | **Пометить cancelled** | Render-side wiring не состоится в этой форме |
| Task #13 в `summary/tasks/025` | **Пометить cancelled** | `data/.provider` больше не существует — alternative-источник правды не нужен |
| `~/.minimax/mcp.json` (пользовательский) | **Не трогать** | Это runtime-конфиг Hermes, не часть репозитория |
| `~/Projects/draw-things-mcp/` (отдельный проект) | **Не трогать** | Независимый MCP-сервер, может быть полезен напрямую или через Hermes |
| `py/render/minimax_client.py` | **Не трогать** | Это и есть единственный рабочий image-провайдер |

## 3. Что остаётся в main

После фиксации `main` содержит:

- `mcp-server/index.js` — single-domain MCP-сервер (10 тулов для comic-studio).
- `tg-bot/mcp-client.js` — single-server обёртка над comic-studio MCP (форма из
  pre-`bd0a10e`, но с минимальными правками: kebab-case env, без lazy registry).
- `tg-bot/bot.js` — все команды кроме `/provider`. `/mcp_list` показывает
  10 тулов comic-studio.
- `py/render/minimax_client.py` — единственный image-провайдер.
- `py/render/comic_assembler.py` — собирает комикс из PNG MiniMax-а.

## 4. Почему не «вернуть Draw Things, но доделать»

Альтернатива: оставить multi-server клиент, написать `py/render/drawthings_client.py`,
пробросить `provider` через `mcp-server` → `web` → `render_approved.py` →
`comic_assembler.py`. Это **4 файла + 2-3 дня работы + риск regressions в проде**,
которые нужны **только** для фичи, которая:

- Не используется ни одним сценарием в `data/scenarios/`.
- Документирована как «evaluating» в AGENTS.md — то есть даже не принято
  решение о переходе.
- Ломает character/style consistency при смене mid-series (см. AGENTS.md → p.126).
- Будет требовать отдельного пайплайна revision/remix для каждого провайдера
  (CLAUDE.md правило 4: «Revision и remix — единственный путь обновления»).

Demo-ветка — это про **«показать, что работает»**, а не про **«показать, что
почти работает»**. Поэтому решение: убрать half-wired, а не доделывать.

## 5. Когда возвращать

Draw Things может вернуться в main отдельным change'ом, когда:

- Будет принято решение о production-использовании (не «evaluating»).
- Будет готов `py/render/drawthings_client.py` (или эквивалентный MCP-мост
  с тем же интерфейсом, что у `minimax_client.py`).
- Будет написан тест-план: сценарий N рендерится обоими провайдерами, проверяется
  визуальная консистентность, измеряется time-to-render, cost.
- Будет согласован формат `render_provider` в scenario JSON (idempotency rule).
- `data/.provider` (или его преемник) будет проверяться render-пайплайном
  атомарно, без half-wired состояний.

До тех пор — только MiniMax.

## 6. Файлы

### Удалено / переписано

- `tg-bot/mcp-client.js` — переписан на single-server
- `tg-bot/bot.js` — удалено: `/provider`, `provider_set:`, `readProviderState`,
  `writeProviderState`, `providerStatusLine`, `providerKeyboard`,
  `PROVIDER_STATE_PATH`, `PROVIDERS`, `DEFAULT_PROVIDER`,
  упоминания `draw-things` и `data/.provider` в `/start` и `/mcp`
- `.gitignore` — удалено: `data/.provider`
- `AGENTS.md` — переписаны секции `Image gen provider` и
  `Telegram bot MCP integration` (только draw-things-упоминания)

### Создано

- `summary/audit/026_remove-draw-things-orchestrator.md` (этот файл)
- `summary/tasks/026_remove-draw-things-orchestrator.md`

### Модифицировано (existing)

- `summary/tasks/025_tg-bot-mcp-tools.md` — tasks 13, 14, 15, 16 → cancelled
- `CHANGELOG.md` — запись с ISO-8601 timestamp

## 7. Проверка

- [x] `tg-bot/mcp-client.js` экспортирует тот же публичный API: `createMcpClient`,
  `listTools`, `callTool`, `formatMcpResult`, `closeMcpClient`. Сигнатуры совпадают
  с pre-`bd0a10e` версией (handle первым аргументом).
- [x] `tg-bot/bot.js` не содержит ссылок на `draw-things`, `data/.provider`,
  `/provider`, `provider_set:`.
- [x] `.gitignore` не содержит `data/.provider`.
- [x] `AGENTS.md` не упоминает `drawthings` как переключаемый провайдер.
- [x] `git grep "draw-things\|drawthings\|/provider" tg-bot/ web/ py/ .gitignore AGENTS.md`
  → no matches in production code paths (только в `summary/audit/025` как историческая
  запись о предыдущем решении).
- [x] `summary/tasks/025` помечен cancelled для tasks 13-16.
- [x] `CHANGELOG.md` обновлён.

## 8. Миграция пользователей (если есть)

`data/.provider` — runtime-only файл в `.gitignore`, нигде не коммитился.
Если у пользователя он остался с предыдущей сессии, он бесполезен и может
быть удалён вручную:

```bash
rm -f data/.provider
```

Никакие настройки не потеряются — файл не содержал ничего, кроме
`{ "current": "minimax" | "drawthings" }`, и это значение никак не
использовалось (state был иллюзией).

## 9. Связанные

- `summary/audit/025_tg-bot-mcp-tools.md` — что ввело multi-server (отменяется этим change'ом)
- `summary/tasks/025_tg-bot-mcp-tools.md` — отменяемые tasks 13-16
- `AGENTS.md` → `## Image gen provider` — переписывается
- `AGENTS.md` → `## Telegram bot MCP integration` — частично правится
