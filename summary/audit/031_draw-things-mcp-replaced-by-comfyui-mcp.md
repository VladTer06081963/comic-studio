# Аудит: draw-things-mcp заменён на comfyui-mcp в глобальных конфигах

**Дата:** 2026-10-26
**Change ID:** `—` (не OpenSpec change; обслуживание локального окружения)
**Компаньон:** `summary/audit/029_draw-things-removed-comfyui-migration.md`
**Связан:** `~/Projects/comfyui-mcp/` (новый проект)

## 1. Контекст

Пользователь заметил: «В глобальном конфиге Antigravity всё ещё прописан
сервер "draw-things"».

Проверка подтвердила — запись была **в трёх местах**, а не в одном:

| Файл | Что было |
|---|---|
| `~/.gemini/config/mcp_config.json` | MCP-сервер `draw-things` → `~/Projects/draw-things-mcp/mcp-server/draw-things/index.js`, `DRAW_THINGS_URL: http://192.168.50.250:7860` |
| `~/.hermes/config.yaml` | то же самое в секции `mcp_servers:` |
| `~/.gemini/antigravity-ide/mcp/draw-things/` | кэш схем инструментов Antigravity IDE (пересоздаётся сам) |

Бэкенд за записью мёртв: `curl http://192.168.50.250:7860` и
`http://127.0.0.1:7860` → **HTTP 000** (соединение не устанавливается).
Draw Things снят с машины.

Отдельно проверены MCP-конфиги других агентов — `~/.codex/config.toml`,
`~/.claude.json`, `~/.cursor/mcp.json` — **совпадений нет**.

## 2. Что сделано

### 2.1. Новый MCP-сервер `~/Projects/comfyui-mcp/`

Полный аналог `draw-things-mcp`, но проксирующий в ComfyUI.

**Контракт инструментов сохранён** — `generate_image` (txt2img/img2img,
возвращает путь к PNG + base64 inline) и `get_options`. Существующие
вызовы продолжают работать без переписывания.

**Маппинг аргументов — другой**, и это отражено в описаниях инструментов:

| Параметр | Было (Draw Things) | Стало (ComfyUI) |
|---|---|---|
| `cfg_scale` | CFG 7.0 | **`FluxGuidance.guidance`, дефолт 3.5** |
| `model` | переключение модели в UI | `UnetLoaderGGUF.unet_name` на один вызов |
| `lora` + `lora_weight` | состояние сессии | нода `LoraLoader` в графе |
| `denoising_strength` | `/sdapi/v1/img2img` | `KSampler.denoise` |

**Таймауты.** FLUX на M Studio идёт ~16 с/шаг → 1024×1024 / 20 шагов = 4–8 минут.
Это превышает и дефолт MCP SDK (60 с), и дефолт Hermes (300 с). Подняты
все три слоя:

| Слой | Значение |
|---|---|
| MCP-клиент (`callTool(..., { timeout })`) | 1 800 000 мс |
| Hermes per-server (`mcp_servers.comfyui.timeout`) | **1800** |
| Сервер (`COMFYUI_TIMEOUT`) | **1800** |

### 2.2. Конфиги заменены

| Файл | Было | Стало |
|---|---|---|
| `~/.hermes/config.yaml` | `draw-things:` → `draw-things-mcp/.../index.js`, `DRAW_THINGS_URL`, `DRAW_THINGS_TIMEOUT: '300'` | `comfyui:` → `comfyui-mcp/.../index.js`, `COMFYUI_URL: http://127.0.0.1:8189`, `COMFYUI_TIMEOUT: '1800'`, `timeout: 1800` |
| `~/.gemini/config/mcp_config.json` | то же | то же (без per-server timeout — у Antigravity другой механизм) |

Правка выполнена скриптами с **проверками**: старый блок должен
встречаться ровно один раз, новый — ещё не существовать, YAML/JSON
должны парситься, `comic-server` / `comic-studio` должны выжить.
Бэкапы: `*.bak-20261026` рядом с каждым конфигом.

### 2.3. Два бага, найденных на живом бэкенде

**`denoise` протекал в txt2img.** Первый прогон smoke-теста отчитался
«all checks passed» — вызов успешен, файл настоящий PNG, ~650 KB. Но
пиксели были **чистым шумом**. Причина: `denoise` брался из
`denoising_strength` (дефолт 0.45), а на свежем латенте нужно 1.0 —
иначе сэмплер останавливается на полпути. Исправлено: `denoise = 1.0`,
если `init_image` не передан.

**`/models/unet` отдаёт 404.** ComfyUI-GGUF регистрирует свой алиас
`unet_gguf`, поэтому папка `unet` эндпоинту `/models/<folder>` неизвестна,
хотя `UnetLoaderGGUF` грузит `flux1-dev-Q4_K_S.gguf` нормально. Источник
истины — enum ноды в `/object_info`: это ровно то, что лоадер примет.
Клиент читает enum и только для папок, которых нет в enum'ах нод,
добирает папками.

### 2.4. Hermes подхватил сервер сразу

```
2026-10-26 18:11:45 ===== starting MCP server 'comfyui' =====
```

`~/.hermes/cache/mcp_schema_cache.json` содержит оба инструмента с
полными схемами. Процесс `node .../comfyui-mcp/.../index.js` поднят.

## 3. Файлы

| Путь | Действие | Описание |
|---|---|---|
| `~/Projects/comfyui-mcp/mcp-server/comfyui/index.js` | CREATED | stdio MCP-сервер, 2 инструмента |
| `~/Projects/comfyui-mcp/mcp-server/comfyui/package.json` | CREATED | зависимость `@modelcontextprotocol/sdk` ^1.30.0 |
| `~/Projects/comfyui-mcp/mcp-server/comfyui/smoke-test.mjs` | CREATED | живой прогон: connect → tools → get_options → render |
| `~/Projects/comfyui-mcp/mcp-server/comfyui/smoke-img2img.mjs` | CREATED | проверка img2img-пути (upload + denoise + LoRA) |
| `~/Projects/comfyui-mcp/README.md` | CREATED | документация, маппинг, грабли |
| `~/Projects/comfyui-mcp/.gitignore` | CREATED | `node_modules/` |
| `~/.hermes/config.yaml` | MODIFIED | `draw-things` → `comfyui` + `timeout: 1800` |
| `~/.gemini/config/mcp_config.json` | MODIFIED | `draw-things` → `comfyui` |
| `~/.hermes/skills/creative/comfyui-local/SKILL.md` | MODIFIED | раздел про MCP-сервер, таймауты, `denoise` |

**Не тронуто:** `~/Projects/draw-things-mcp/` (проект остаётся на диске —
он проксировал в несуществующий Draw Things, но удалять его без
отдельного решения незачем), `~/.gemini/antigravity-ide/mcp/draw-things/`
(кэш схем, пересоздаётся при следующем старте Antigravity).

## 4. Verification

| Шаг | Результат |
|---|---|
| `curl http://192.168.50.250:7860` / `http://127.0.0.1:7860` | ✅ HTTP 000 — бэкенд Draw Things мёртв, запись была безнадёжной |
| `grep -rn 'draw.things' ~/.hermes/config.yaml ~/.gemini/config/mcp_config.json` | ✅ ноль совпадений |
| `grep -rn 'draw.things' ~/.codex/config.toml ~/.claude.json ~/.cursor/mcp.json` | ✅ ноль совпадений |
| `python3 -c "yaml.safe_load(config.yaml)"` | ✅ YAML валиден, `mcp_servers: [comic-studio, comfyui, voicebox, davinci-resolve, concat-bridge, canva-mcp-bridge]` |
| `python3 -c "json.load(mcp_config.json)"` | ✅ JSON валиден, `mcpServers: [comic-server, comfyui]` |
| путь `mcp_servers.comfyui.args[0]` существует | ✅ `True` |
| `npm install` в новом проекте | ✅ 95 пакетов, импорт SDK работает |
| `node smoke-test.mjs` → connect | ✅ `[ok] connected` |
| `node smoke-test.mjs` → tools/list | ✅ `generate_image, get_options` |
| `node smoke-test.mjs` → get_options | ✅ `version=0.42.5`, `unets=[flux1-dev-Q4_K_S.gguf, z_image_turbo_bf16.safetensors]`, `loras=4`, очередь пуста |
| `node smoke-test.mjs` → generate_image (512², 12 шагов) | ✅ PNG сохранён, base64-блок 393 248 символов |
| **визуальный осмотр рендера** | ✅ силуэт солдата, контровой свет из окон, объёмный туман, артефактов нет (после фикса `denoise`) |
| `node smoke-img2img.mjs <png>` | ✅ img2img-путь отработал |
| логи Hermes | ✅ `18:11:45 starting MCP server 'comfyui'` |
| `mcp_schema_cache.json` | ✅ сервер `comfyui`, оба инструмента с полными схемами |

## 5. Связанные

- `summary/audit/029_draw-things-removed-comfyui-migration.md` — переход на ComfyUI
- `summary/audit/030_freevideo-removal-plan.md` — план удаления FreeVideo (50.6 ГБ)
- `~/Projects/comfyui-mcp/README.md` — документация нового MCP-сервера

## 6. Известные ограничения

- **`mcp__comfyui__*` не появится в схеме текущей сессии.** Набор
  toolsets фиксируется при старте сессии; сервер поднят, схемы
  закешированы, но нужен **рестарт Hermes**, чтобы новый toolset вошёл
  в prompt. Старый `draw-things` toolset в баннере остался от старой сессии.
- **Процессы старого `draw-things-mcp` ещё висят** (PID 40572, 28416,
  26194) — их подняли прежние сессии Hermes. Умрут при рестарте.
- **`~/.gemini/antigravity-ide/mcp/draw-things/`** — кэш схем в
  Antigravity IDE, пересоздастся при следующем старте Antigravity.
- **Antigravity не имеет per-server `timeout`** в своём формате
  конфига. Клиент Antigravity использует свой дефолт — если рендер
  через Antigravity обрывается на ~60 с, это клиентский лимит SDK;
  лечится `resetTimeoutOnProgress` или меньшим рендером.
- **Один img2img-тест** — проверен путь upload + denoise + LoRA на
  одной картинке; разные `denoise` не прогонялись.
- **`draw-things-mcp` не удалён** с диска — оставлен как есть.

## 7. Следующие шаги

- [ ] **Рестартовать Hermes**, чтобы `mcp__comfyui__*` вошёл в схему
      активных toolsets
- [ ] Проверить рендер через Antigravity после его рестарта (кэш схем
      пересоздастся)
- [ ] Решить, удалять ли `~/Projects/draw-things-mcp/` (проксирует в
      несуществующий Draw Things)
- [ ] Прогнать img2img с несколькими `denoise` через MCP-сервер
- [ ] Удалить старые skill'и `draw-things-comic` / `draw-things-icons`
      (см. tasks 029, задача #10)
