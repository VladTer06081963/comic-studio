# Аудит: Telegram bot — direct MCP tools + provider switcher

**Дата:** 2026-09-05
**Change ID:** `tg-bot-mcp-tools`
**Компаньон:** `summary/tasks/025_tg-bot-mcp-tools.md`

## 1. Контекст

Раньше Telegram-бот `tg-bot/bot.js` управлял сценариями только через **Web API**
(`http://127.0.0.1:3000/api/...`): `fetch()` к эндпоинтам, `execAsync()` Python-скриптов.
Это работало для «свой-чужой» сценариев (approve, render), но:

- Не было способа **дать свободную задачу** агенту из Telegram.
- Не было способа **вызвать типизированную MCP-операцию** из бота без
  обёртки через Web API.
- Не было UI для **смены image-провайдера** (MiniMax ↔ Draw Things) —
  только переменная в `.env`, требующая рестарта.

Параллельно в `~/Projects/draw-things-mcp/` уже был готовый
stdio-MCP-сервер с `generate_image` (prompt, seed, lora, и т.д.),
проксирующий в локальный Draw Things на `:7860`. Зарегистрирован в
Hermes, но **не подключён к боту и не интегрирован в comic-studio
pipeline**.

## 2. Что сделано

### 2.1. `tg-bot/mcp-client.js` (CREATED, ~95 строк)

Новый модуль — тонкий wrapper над `@modelcontextprotocol/sdk/client`.
Спавнит comic-studio MCP-сервер через stdio, даёт `listTools`/`callTool`/
`formatMcpResult`/`closeMcpClient`. Использует те же пути, что и Hermes
(`/Users/vladteresena/.hermes/node/bin/node` + `mcp-server/index.js`).

```js
const { client, transport } = await createMcpClient();
const tools = await listTools(client);
const result = await callTool(client, 'list_scenarios', { status: 'draft' });
const text = formatMcpResult(result);
await closeMcpClient(client);
```

### 2.2. `tg-bot/package.json` (MODIFIED)

Добавлена зависимость `@modelcontextprotocol/sdk: ^1.30.0` (через `npm install`).
`node_modules/` и `package-lock.json` в `.gitignore` (как и раньше), коммитится
только `package.json`.

### 2.3. `tg-bot/bot.js` (MODIFIED, +~250 строк)

**Env-константы** для mcode-CLI: `MCODE_BIN`, `MCODE_CWD`, `MCODE_TIMEOUT_MS`.

**Хелпер `chunkString(text, size=3800)`** — разбивка длинных ответов
для Telegram 4096-char лимита.

**Три новые команды:**

- `/mcp_list` — inline-список всех 10 MCP-тулов с описанием и параметрами
- `/mcp <tool> [json-args]` — прямой вызов любого тула, без LLM в горячем пути
- `/mcode <task>` — запуск `mcode exec --cwd PROJECT_ROOT --permission smart '<task>'`,
  ответ отправляется чанками в Telegram

**Команда `/provider`** с inline-кнопками `🟢 minimax (active) / ⚪ drawthings`:

- `/provider` — показать текущее состояние + кнопки
- клик на кнопку — `bot.action('provider_set:NAME')` → writeProviderState()

**Стейт провайдера** хранится в `data/.provider` (JSON, runtime-only,
добавлен в `.gitignore`):

```json
{ "current": "minimax", "available": ["minimax", "drawthings"] }
```

**Фикс callback timeout:** `answerCbQuery()` теперь вызывается **самой
первой строкой** в action-handler, до любой работы. Без этого Telegram
timeout'ил за ~10с и показывал «text copied» вместо выполнения.

### 2.4. `AGENTS.md` (MODIFIED)

Добавлена секция **«Telegram bot MCP integration»** — описывает разделение
`/mcp` (типизированные операции) vs `/mcode` (LLM-задачи), обоснование
и примеры.

Также добавлена секция **«Quality reference (vision)»** со ссылкой
на https://openaiua.fr/comic/chernobyl-ritual/ — quality bar для
Stalker-стиля.

### 2.5. `.gitignore` (MODIFIED)

Добавлена строка `data/.provider` (runtime state, не коммитим).

## 3. Файлы

| Путь | Действие | Описание |
|---|---|---|
| `tg-bot/mcp-client.js` | CREATED | Прямой MCP-клиент для бота, ~95 строк |
| `tg-bot/package.json` | MODIFIED | + `@modelcontextprotocol/sdk` |
| `tg-bot/bot.js` | MODIFIED | +3 команды, /provider с inline-кнопками, фикс callback |
| `AGENTS.md` | MODIFIED | +секции «Telegram bot MCP integration» и «Quality reference» |
| `.gitignore` | MODIFIED | + `data/.provider` |

## 4. Verification

| Шаг | Результат |
|---|---|
| `node --check bot.js` | exit 0 ✅ |
| `node --check mcp-client.js` | exit 0 ✅ |
| `mcp-client.js` standalone: `createMcpClient()` → 10 тулов, `list_scenarios` → `{"items": [], ...}` | ✅ |
| `mcp-client.js` standalone: `get_scenario("c6964b6a")` → полный JSON «СмехуЁчки для взрослых» | ✅ |
| Write-op cycle: `create_comic` → `list_scenarios` (draft: 0→1) → `approve_scenario` → `list_scenarios` (approved: 1→2) | ✅ через MCP-клиент |
| `mcp-client.js` standalone: `read_comic_image` на approved без rendered → корректная MCP-ошибка `Image not found` | ✅ (graceful error path) |
| Бот перезапущен с новым кодом, polling активен | ✅ PID 21327 |
| `/mcp_list` через Telegram | ✅ ответ 10 тулов в читаемом виде |
| `/mcp list_scenarios {"status": "draft"}` через Telegram | ✅ `{"items": [], "invalid_count": 0, ...}` |
| `/mcp get_scenario {"id": "c6964b6a"}` через Telegram | ✅ полный JSON, разбит на чанки |
| `/mcp nonexistent_tool` через Telegram | ✅ структурированная MCP-ошибка `Unknown tool: nonexistent_tool` |
| `/mcp create_comic {...}` через Telegram | ✅ создан драфт `486188d1` |
| Кнопка `/provider` (`provider_set:drawthings`) | ✅ (после фикса answerCbQuery) |

## 5. Связанные

- `summary/audit/022_lmstudio-provider-setup.md` — LM Studio как провайдер Hermes (стиль этого аудита)
- `summary/audit/024_ports_audit_and_standardization.md` — стандартизация портов (откуда порт 3000 у Web API)
- `~/Projects/draw-things-mcp/README.md` — Draw Things MCP-сервер, который мы НЕ написали, но обнаружили
- `AGENTS.md → "Image gen provider"` — план миграции на Draw Things

## 6. Известные ограничения

- **Кнопка `/provider` только пишет state.** Фактический рендер пока идёт
  через `py/render/minimax_client.py` (жёстко в `comic_assembler.py`),
  независимо от значения в `data/.provider`. Чтобы кнопка стала
  функциональной end-to-end, нужно:
  1. Дописать чтение `data/.provider` в `py/render/comic_assembler.py`
  2. Реализовать `py/render/drawthings_client.py` ИЛИ вызывать
     `mcp:draw-things:generate_image` напрямую
  3. Перезапустить `web/server.js`
- **draw-things-mcp не зарегистрирован в `~/.minimax/mcp.json`**, поэтому
  бот пока не может вызвать его через `/mcp` (только comic-studio MCP).
- **Тестовый артефакт `486188d1`** — e2e-сценарий, оставлен в `data/scenarios/draft/`.
  Не критично (draft не считается в nightly cron), но при желании
  можно удалить через `mavis-trash`.

## 7. Следующие шаги

- [ ] **Закоротить `comic_assembler.py` на `data/.provider`** — при рендере
  читать state, выбирать client (minimax vs draw-things), перезапустить web.
- [ ] **Добавить `draw-things` в `~/.minimax/mcp.json`** — тогда бот через
  `/mcp draw_things generate_image` сможет дёргать Draw Things MCP.
- [ ] **Тестовый рендер через draw-things-mcp** — вызвать
  `mcp:draw-things:generate_image` с промптом из существующего сценария,
  посмотреть на результат глазами, сравнить с vision reference
  (chernobyl-ritual).
- [ ] **Почистить `486188d1`** из `data/scenarios/draft/` — это e2e-test артефакт.

## 8. Lessons learned

- **`answerCbQuery()` в начале handler** — Telegram timeout ~10с, ack должен
  быть первой строкой. Это **не опционально** в Telegraf v4.
- **mcode exec не загружает MCP** — для полного tool-доступа нужна отдельная
  интеграция. Решение для бота: `mcp-client.js` в самом боте, минуя mcode.
- **У пользователя уже есть `draw-things-mcp`** — не надо было «планировать
  drawthings_client.py», инфраструктура готова. **Сначала проверить
  `~/Projects/`, потом строить новое.**
