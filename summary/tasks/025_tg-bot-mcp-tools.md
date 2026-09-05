# Задачи: Telegram bot — direct MCP tools + provider switcher

**Change ID:** `tg-bot-mcp-tools`
**Компаньон:** `summary/audit/025_tg-bot-mcp-tools.md`

## Статус: ✅ Done (UI + state; render-side wiring — отдельная задача)

| ID | Задача | Оценка | Статус |
|---|---|---|---|
| 1 | Создать `tg-bot/mcp-client.js` (spawn comic-studio MCP, listTools, callTool) | 30m | ✅ Done |
| 2 | Добавить `@modelcontextprotocol/sdk` в `tg-bot/package.json` | 2m | ✅ Done |
| 3 | Добавить команду `/mcp_list` (inline список 10 тулов) | 15m | ✅ Done |
| 4 | Добавить команду `/mcp <tool> [json-args]` (прямой вызов MCP) | 30m | ✅ Done |
| 5 | Добавить команду `/mcode <task>` (запуск mcode exec) | 20m | ✅ Done |
| 6 | Добавить `/provider` команду с inline-кнопками MiniMax/Draw Things | 20m | ✅ Done |
| 7 | Persist state провайдера в `data/.provider` (atomic write) | 10m | ✅ Done |
| 8 | Добавить `data/.provider` в `.gitignore` | 1m | ✅ Done |
| 9 | Фикс callback timeout — `answerCbQuery()` в начале handler | 5m | ✅ Done |
| 10 | Обновить `AGENTS.md` (раздел Telegram bot MCP integration) | 10m | ✅ Done |
| 11 | Обновить `AGENTS.md` (раздел Quality reference) | 5m | ✅ Done |
| 12 | Verification: e2e через Telegram (`/mcp_list`, `/mcp get_scenario`, `/mcp create_comic`, ошибки) | 15m | ✅ Done |
| 13 | Дописать `py/render/comic_assembler.py` чтение `data/.provider` для выбора client | 30m | ⏸ TODO |
| 14 | Добавить `draw-things` в `~/.minimax/mcp.json` для бота | 5m | ⏸ TODO |
| 15 | Тест: `mcp:draw-things:generate_image` через бота | 10m | ⏸ TODO |
| 16 | Cleanup: `mavis-trash data/scenarios/draft/486188d1.json` (e2e артефакт) | 1m | ⏸ TODO |

## Зависимости

- `@modelcontextprotocol/sdk` v1.30+ в `tg-bot/node_modules/` (установлено)
- comic-studio MCP-сервер запускается из `mcp-server/index.js` (есть)
- Hermes-side: `draw-things-mcp` уже зарегистрирован в `~/.hermes/config.yaml` (есть)
- `web/server.js` для bot → web API (опционально, бот может работать без него)
- mcode CLI v0.3+ в PATH (есть)

## Как использовать

### В Telegram
```
/start
  → показывает текущий провайдер

/provider
  → inline-кнопки: 🟢 minimax (active) / ⚪ drawthings
  → нажатие переключает state в data/.provider

/mcp_list
  → 10 тулов с описанием параметров

/mcp list_scenarios {"status": "draft"}
  → JSON-ответ, по чанкам если длинный

/mcp get_scenario {"id": "c6964b6a"}
  → полный JSON сценария

/mcp approve_scenario {"id": "abc12345"}
  → {"ok": true, ...}

/mcode list draft scenarios
  → mcode exec разбирается через filesystem
```

### Для разработчика

```js
import { createMcpClient, listTools, callTool, formatMcpResult, closeMcpClient } from './mcp-client.js';

const handle = await createMcpClient();
try {
  const tools = await listTools(handle);
  const result = await callTool(handle, 'list_scenarios', { status: 'draft' });
  console.log(formatMcpResult(result));
} finally {
  await closeMcpClient(handle);
}
```

## Env variables

| Переменная | Назначение | Default (fallback) |
|---|---|---|
| `MCODE_BIN` | Путь к mcode CLI | `/Users/vladteresena/.minimax-code/bin/mcode` |
| `MCODE_CWD` | Рабочая директория для mcode exec | `PROJECT_ROOT` |
| `MCODE_TIMEOUT_MS` | Таймаут в мс | `600000` (10 мин) |
| `TELEGRAM_BOT_TOKEN` | Telegram API token | обязателен (иначе бот не стартует) |
| `TELEGRAM_CHAT_ID` | Авторизованный chat | `1045621572` (hardcoded fallback) |
| `WEB_API_URL` | Web API для существующих команд | `http://127.0.0.1:3000` |
| `WEB_PUBLIC_URL` | Публичный URL для HTML-ссылок в Telegram | `''` (off) |

## Файлы

- `tg-bot/mcp-client.js` — CREATED, 95 строк, MCP-клиент
- `tg-bot/bot.js` — MODIFIED, +250 строк (3 команды + /provider + helpers)
- `tg-bot/package.json` — MODIFIED, +1 dep (`@modelcontextprotocol/sdk`)
- `AGENTS.md` — MODIFIED, +2 секции (Telegram bot MCP, Quality reference)
- `.gitignore` — MODIFIED, +1 строка (`data/.provider`)
- `summary/audit/025_tg-bot-mcp-tools.md` — этот аудит
- `summary/tasks/025_tg-bot-mcp-tools.md` — этот таск

## Связанные

- `summary/audit/022_lmstudio-provider-setup.md` — LM Studio как альтернативный LLM-провайдер (стиль)
- `summary/audit/024_ports_audit_and_standardization.md` — откуда порт 3000
- `~/Projects/draw-things-mcp/` — Draw Things MCP-сервер (уже существует)
- `AGENTS.md → "Image gen provider"` — план миграции на Draw Things

## Следующие задачи (для будущего)

| ID | Задача | Приоритет |
|---|---|---|
| 17 | Render-side wiring: `comic_assembler.py` читает `data/.provider`, выбирает client | High |
| 18 | Регистрация `draw-things` в `~/.minimax/mcp.json` | Medium |
| 19 | Тестовый рендер через draw-things-mcp, сравнение с vision reference (chernobyl-ritual) | Medium |
| 20 | Cleanup `data/scenarios/draft/486188d1.json` (e2e test артефакт) | Low |
| 21 | `/mcp` документация в `MCP_GUIDE.md` (сейчас тулы только в коде) | Low |
| 22 | Удалить жёстко зашитый `TELEGRAM_CHAT_ID = '1045621572'` fallback, требовать env | Low |
| 23 | Inline preview в `/mcp read_comic_image` (отправлять фото в Telegram) | Low |

## Уроки

- **Сначала проверить `~/Projects/`, потом строить новое.** У пользователя
  уже был готовый `draw-things-mcp` — я планировал `py/render/drawthings_client.py`,
  который не нужен. Lesson: для каждой новой задачи сначала `find /Users/vladteresena/Projects -iname "*<thing>*"`.
- **Telegram callback timeout.** `answerCbQuery()` — первая строка, не
  последняя. ~10 секунд, иначе «text copied» / permanent spinner.
- **mcode exec ≠ full MCP.** Для tools-доступа нужна прямая интеграция
  в клиенте (наш `mcp-client.js`). mcode exec хорош для freeform LLM-задач.
