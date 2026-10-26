# Задачи: draw-things-mcp заменён на comfyui-mcp

**Change ID:** `—` (не OpenSpec change; обслуживание глобальных MCP-конфигов)
**Компаньон:** `summary/audit/031_draw-things-mcp-replaced-by-comfyui-mcp.md`

## Статус: ✅ Done (2026-10-26)

| ID | Задача | Оценка | Статус |
|---|---|---|---|
| 1 | Проверить, где прописан мёртвый MCP-сервер `draw-things` | 15m | ✅ Done — нашлось 3 живых MCP-конфига + pi-расширение + whitelist |
| 2 | Убедиться, что бэкенд за записью действительно мёртв | 5m | ✅ Done — `curl :7860` (LAN и localhost) → HTTP 000 |
| 3 | Создать MCP-сервер `~/Projects/comfyui-mcp/` с тем же контрактом инструментов | 1.5h | ✅ Done — `generate_image`, `get_options`; тот же интерфейс, другой маппинг аргументов |
| 4 | Поднять таймауты во всех трёх слоях (клиент / Hermes per-server / сервер) | 30m | ✅ Done — 1800 с везде; без per-server `timeout` вызов умирает на 300-й секунде |
| 5 | Заменить запись в `~/.hermes/config.yaml` | 15m | ✅ Done — скриптом с проверками + бэкап |
| 6 | Заменить запись в `~/.gemini/config/mcp_config.json` | 15m | ✅ Done — скриптом с проверками + бэкап |
| 7 | Заменить запись в `~/.minimax/mcp.json` | 15m | ✅ Done — найдено полным свипом, не первым проходом |
| 8 | Переписать pi-расширение `/draw` + инструмент `draw` на ComfyUI | 45m | ✅ Done — `~/.pi/agent/extensions/comfyui.ts`; бил в мёртвый `localhost:7860` |
| 9 | Синхронизировать allow-list `~/.minimax/permission.json` | 15m | ✅ Done — 3 записи переписаны на новый путь |
| 10 | Найти и починить баг: `denoise` протекал в txt2img | 20m | ✅ Done — на txt2img теперь 1.0; на 0.45 сэмплер вставал на полпути и давал шум |
| 11 | Найти и починить баг: `/models/unet` отдаёт 404 | 20m | ✅ Done — ComfyUI-GGUF регистрирует алиас `unet_gguf`; источник истины — enum ноды в `/object_info` |
| 12 | Прогнать живой smoke-тест (tools, get_options, txt2img, img2img) | 30m | ✅ Done — 4 прогона, 2 рендера осмотрены глазами |
| 13 | Прогнать workflow pi-расширения и осмотреть рендер | 15m | ✅ Done — `node_errors: {}`, кот на пляже в золотой час |
| 14 | Обновить skill `comfyui-local` | 20m | ✅ Done — раздел про MCP-сервер, таймауты, `denoise` |
| 15 | Записать аудит 031 | 30m | ✅ Done — `summary/audit/031_draw-things-mcp-replaced-by-comfyui-mcp.md` |

## Зависимости

- ComfyUI должен быть запущен (порт **8189**) — иначе `generate_image` вернёт ошибку
- FLUX dev Q4 GGUF в `~/ComfyUI-Shared/models/unet/` — иначе `UnetLoaderGGUF` не найдёт модель
- Node.js ≥ 18 (проверено на v22.22.3) и npm для `npm install` в `~/Projects/comfyui-mcp/`
- Пакет `@modelcontextprotocol/sdk` ^1.30.0 — ставится `npm install`

## Как использовать

```bash
# Проверить, что сервер поднят
curl -s http://127.0.0.1:8189/system_stats

# Живой прогон: connect → tools → get_options → рендер
cd ~/Projects/comfyui-mcp/mcp-server/comfyui
node smoke-test.mjs

# Проверить img2img-путь (upload + denoise + LoRA)
node smoke-img2img.mjs /abs/path/to/image.png

# Установить зависимости с нуля
cd ~/Projects/comfyui-mcp/mcp-server/comfyui && npm install
```

**Рендер занимает минуты** (FLUX ~16 с/шаг на M Studio). MCP-вызовы дольше
300 с требуют поднятого `timeout` — в Hermes он уже выставлен на 1800.

## Env variables

| Переменная | Назначение | Default (fallback) |
|---|---|---|
| `COMFYUI_URL` | базовый URL ComfyUI | `http://127.0.0.1:8189` |
| `COMFYUI_TIMEOUT` | таймаут запроса, секунды | `1800` |
| `COMFYUI_OUTPUT` | каталог для сохранённых PNG | `os.tmpdir()` |
| `COMFYUI_TIMEOUT_MS` | таймаут в pi-расширении, мс | `1800000` |

## Файлы

- `~/Projects/comfyui-mcp/mcp-server/comfyui/index.js` — CREATED — stdio MCP-сервер
- `~/Projects/comfyui-mcp/mcp-server/comfyui/package.json` — CREATED — зависимости
- `~/Projects/comfyui-mcp/mcp-server/comfyui/smoke-test.mjs` — CREATED — живой прогон txt2img
- `~/Projects/comfyui-mcp/mcp-server/comfyui/smoke-img2img.mjs` — CREATED — живой прогон img2img
- `~/Projects/comfyui-mcp/README.md` — CREATED — документация, маппинг, грабли
- `~/.hermes/config.yaml` — MODIFIED — `draw-things` → `comfyui` + `timeout: 1800`
- `~/.gemini/config/mcp_config.json` — MODIFIED — `draw-things` → `comfyui`
- `~/.minimax/mcp.json` — MODIFIED — `draw-things` → `comfyui` + `cwd`
- `~/.minimax/permission.json` — MODIFIED — 3 записи allow-list
- `~/.pi/agent/extensions/draw-things.ts` → `comfyui.ts` — REPLACED — `/draw` и инструмент `draw`
- `~/.hermes/skills/creative/comfyui-local/SKILL.md` — MODIFIED — MCP-сервер, таймауты, `denoise`

## Связанные

- `summary/audit/029_draw-things-removed-comfyui-migration.md` — переход на ComfyUI
- `summary/audit/030_freevideo-removal-plan.md` — план удаления FreeVideo
- `~/Projects/comfyui-mcp/README.md` — документация нового MCP-сервера

## Следующие задачи (для будущего)

| ID | Задача | Приоритет |
|---|---|---|
| 16 | Рестартнуть Hermes — чтобы `mcp__comfyui__*` вошёл в схему активных toolsets | High |
| 17 | Рестартнуть Antigravity и pi — перечитают конфиги и `comfyui.ts` | Medium |
| 18 | Решить, удалять ли `~/Projects/draw-things-mcp/` (проксирует в несуществующий Draw Things) | Low |
| 19 | Проверить рендер через Antigravity после рестарта | Medium |
| 20 | Прогнать img2img с несколькими `denoise` через MCP-сервер | Low |
