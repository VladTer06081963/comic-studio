# Задачи: Remove Draw Things orchestrator from main

**Change ID:** `remove-draw-things-orchestrator`
**Компаньон:** `summary/audit/026_remove-draw-things-orchestrator.md`

## Статус: ✅ Done (фиксация в этом коммите)

| ID | Задача | Оценка | Статус |
|---|---|---|---|
| 1 | Переписать `tg-bot/mcp-client.js` на single-server (comic-studio only) | 15m | ✅ Done |
| 2 | Удалить `/provider` команду и `provider_set:` action из `tg-bot/bot.js` | 5m | ✅ Done |
| 3 | Удалить provider-state helpers из `tg-bot/bot.js` (`readProviderState`, `writeProviderState`, `providerStatusLine`, `providerKeyboard`, `PROVIDER_STATE_PATH`, `PROVIDERS`, `DEFAULT_PROVIDER`) | 5m | ✅ Done |
| 4 | Удалить строку «Image provider: ...» из `/start` message | 2m | ✅ Done |
| 5 | Обновить help-текст `/mcp`: убрать «+ draw-things» из списка серверов | 2m | ✅ Done |
| 6 | Удалить `data/.provider` из `.gitignore` | 1m | ✅ Done |
| 7 | Переписать `AGENTS.md` → `## Image gen provider` (только MiniMax) | 5m | ✅ Done |
| 8 | Поправить `AGENTS.md` → `## Telegram bot MCP integration` (убрать draw-things) | 3m | ✅ Done |
| 9 | Пометить tasks 13, 14, 15, 16 в `summary/tasks/025_tg-bot-mcp-tools.md` как ❌ Cancelled | 2m | ✅ Done |
| 10 | Добавить запись в `CHANGELOG.md` (ISO-8601 timestamp) | 2m | ✅ Done |
| 11 | Verification: `git grep "draw-things\|drawthings" tg-bot/ web/ py/ AGENTS.md` → no production matches | 2m | ✅ Done |
| 12 | Verification: `npm test` (tg-bot) — без regressions | 2m | ✅ Done |

## Зависимости

- `summary/audit/026_*.md` написан и одобрен ✅
- `mcp-server/index.js` остаётся single-domain (это не меняется этим change'ом)
- `~/.minimax/mcp.json` пользователя не трогаем (runtime-конфиг, не в репо)
- `~/Projects/draw-things-mcp/` не трогаем (независимый проект)

## Как использовать

После фиксации — никаких новых команд. Бот работает как до commit `bd0a10e`,
но `/mcp_list` показывает только 10 тулов comic-studio.

```bash
# Cleanup у пользователя (если data/.provider остался с предыдущей сессии):
rm -f data/.provider

# Проверка после фиксации:
cd /Users/vladteresena/Projects/comic-studio
git grep -nE "draw-things|drawthings|/provider|provider_set" \
  -- tg-bot/ web/ py/ AGENTS.md .gitignore
# Ожидаемый вывод: (пусто)
```

## Env variables

Никаких новых. Существующие не тронуты:

| Переменная | Назначение | Default | Действие |
|---|---|---|---|
| `MCP_NODE_BIN` | Путь к node для spawn MCP | `/Users/vladteresena/.hermes/node/bin/node` | Сохранён (но больше не читается — упрощаем) |
| `MINIMAX_MCP_CONFIG` | Путь к mcp.json | `~/.minimax/mcp.json` | Сохранён (больше не читается) |
| `TELEGRAM_BOT_TOKEN` | Telegram API token | обязателен | Без изменений |
| `TELEGRAM_CHAT_ID` | Авторизованный chat | `1045621572` | Без изменений |

После упрощения `mcp-client.js` оба env (`MCP_NODE_BIN`, `MINIMAX_MCP_CONFIG`)
больше не нужны и могут быть удалены из `.env.example` отдельным change'ом
(не входит в эту фиксацию — избыточный scope).

## Файлы

- `tg-bot/mcp-client.js` — REWRITTEN — single-server обёртка, 100 строк
  (было 225 — multi-server)
- `tg-bot/bot.js` — MODIFIED — удалено ~80 строк provider-кода
- `.gitignore` — MODIFIED — удалена строка `data/.provider`
- `AGENTS.md` — MODIFIED — секции `Image gen provider` и
  `Telegram bot MCP integration` обновлены
- `summary/audit/026_remove-draw-things-orchestrator.md` — CREATED
- `summary/tasks/026_remove-draw-things-orchestrator.md` — CREATED (этот файл)
- `summary/tasks/025_tg-bot-mcp-tools.md` — MODIFIED — tasks 13, 14, 15, 16 → ❌ Cancelled
- `CHANGELOG.md` — MODIFIED — добавлена запись `2026-09-05T22:00:00+03:00`

## Связанные

- `summary/audit/025_tg-bot-mcp-tools.md` — что ввело (отменяем)
- `summary/audit/026_remove-draw-things-orchestrator.md` — обоснование
- `summary/tasks/025_tg-bot-mcp-tools.md` — cancelled tasks
- `AGENTS.md` → `## Image gen provider` — обновлена
- `AGENTS.md` → `## Telegram bot MCP integration` — обновлена
- `~/Projects/draw-things-mcp/` — НЕ тронут, остаётся отдельным проектом

## Следующие задачи (для будущего)

| ID | Задача | Приоритет | Когда |
|---|---|---|---|
| F1 | **Draw Things integration v2** — если решим переходить: `py/render/drawthings_client.py` (mirror `minimax_client.py`), проброс `provider` через mcp-server → web API, `render_provider` в scenario JSON, A/B test harness. См. `summary/audit/026` §5. | Low | Когда будет явный запрос на production-использование (не «evaluating») |
| F2 | Убрать `MCP_NODE_BIN` / `MINIMAX_MCP_CONFIG` из `.env.example` (после упрощения mcp-client.js они не нужны) | Low | Отдельный chore commit |
| F3 | Ретроспектива: зачем вообще был введён multi-server client, если он не использовался? Lessons learned для будущих exploratory-фич | Low | На досуге |
