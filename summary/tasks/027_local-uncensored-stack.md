# Задачи: Local Uncensored Stack (Draw Things + LM Studio Magnum)

**Change ID:** `local-uncensored-stack`
**OpenSpec:** `openspec/changes/local-uncensored-stack/`
**Компаньон:** `summary/audit/027_local-uncensored-stack.md`

## Статус: 🚧 In Progress (foundation в работе)

| ID | Задача | Оценка | Статус |
|---|---|---|---|
| 1 | OpenSpec: `proposal.md` + `tasks.md` + 4 delta specs | 30m | ✅ Done |
| 2 | `summary/audit/027_*.md` + `summary/tasks/027_*.md` | 15m | ✅ Done |
| 3 | `py/scenario/provider_router.py` (genre table + override + fallback) | 30m | 🚧 In Progress |
| 4 | `py/scenario/lmstudio_client.py` (OpenAI-compat для Magnum) | 30m | ⏳ Pending |
| 5 | `py/render/drawthings_client.py` (HTTP к DT `:7860`, mirror minimax) | 45m | ⏳ Pending |
| 6 | `tests/test_provider_router.py` (mocked) | 30m | ⏳ Pending |
| 7 | `tests/test_lmstudio_client.py` (mocked) | 20m | ⏳ Pending |
| 8 | `tests/test_drawthings_client.py` (mocked) | 30m | ⏳ Pending |
| 9 | `py/scenario/writer.py`: Stage 2 через `provider_router` | 30m | ⏳ Pending |
| 10 | `py/render/comic_assembler.py`: `image_provider` параметр + router | 30m | ⏳ Pending |
| 11 | `web/server.js` или `web/routes/scenarios.js`: `POST /api/scenarios/:id/render` принимает `provider` | 20m | ⏳ Pending |
| 12 | `mcp-server/index.js`: `render_comic` пробрасывает `provider` | 10m | ⏳ Pending |
| 13 | `scripts/render_approved.py`: `--text-provider`, `--image-provider` CLI-флаги | 15m | ⏳ Pending |
| 14 | `.env.example`: секции `LM_*` и `DRAWTHINGS_*` | 5m | ⏳ Pending |
| 15 | `AGENTS.md` → `## Image gen provider` обновить (оба провайдера + router) | 5m | ⏳ Pending |
| 16 | `AGENTS.md` → `## Censorship-sensitive content` дополнить | 5m | ⏳ Pending |
| 17 | `CHANGELOG.md`: запись `2026-09-05T22:55:00+03:00` | 2m | ⏳ Pending |
| 18 | Verification: `python -m unittest tests/test_provider_router.py tests/test_lmstudio_client.py tests/test_drawthings_client.py` | 5m | ⏳ Pending |
| 19 | OpenSpec validation `--strict` | 5m | ⏳ Pending |
| 20 | Git commit + push | 2m | ⏳ Pending |

## Зависимости

- **LM Studio запущен** с Magnum-Picaro-0.7-v3-12b-i1 (на `192.168.55.1:1234`) — для live-теста после foundation
- **Draw Things запущен** на `192.168.55.1:7860` с `stalker_sdxl_lora_f16.ckpt` в Models/ — для live-теста
- **WireGuard-соединение** активно (для live-тестов)
- **MiniMax** env — для fallback-теста (любой сценарий должен рендериться через MM при недоступности локалки)

## Как использовать (после завершения)

### Обычный запуск (через scenario.json)
```bash
# scenario.json имеет genre="stalker-horror", без явных providers
python scripts/render_approved.py --scenario-id stalker-013
# → автоматически: text=lmstudio, image=drawthings
# → если LM Studio лежит: fallback на minimax для текста, лог в scenario
# → если Draw Things лежит: fallback на minimax для картинок
```

### С явным override через CLI
```bash
python scripts/render_approved.py --scenario-id stalker-013 \
  --text-provider lmstudio --image-provider drawthings

python scripts/render_approved.py --scenario-id leopold-001 \
  --image-provider minimax   # override только картинок
```

### Через Web API
```bash
curl -X POST http://127.0.0.1:3000/api/scenarios/stalker-013/render \
  -H "Content-Type: application/json" \
  -d '{"provider": "image"}'
# provider ∈ "image" | "text" | "both" — какие именно override'ить
```

### Через Telegram / MCP
```
/mcp render_comic {"id": "stalker-013", "provider": "image"}
```

## Env variables

| Переменная | Default | Назначение |
|---|---|---|
| `LM_BASE_URL` | `http://192.168.55.1:1234` | LM Studio OpenAI endpoint |
| `LM_API_KEY` | `lm-studio` | LM Studio игнорирует, но клиенты требуют |
| `LM_MODEL` | `magnum-picaro-0.7-v3-12b-i1` | Текстовая модель в LM Studio |
| `DRAWTHINGS_BASE_URL` | `http://192.168.55.1:7860` | Draw Things SD API |
| `DRAWTHINGS_TIMEOUT` | `120` | HTTP timeout сек |
| `DEFAULT_TEXT_PROVIDER` | `minimax` | Fallback если нет override и нет genre-match |
| `DEFAULT_IMAGE_PROVIDER` | `minimax` | То же для картинок |

Все опциональны.

## Файлы

### Created (новый change)
- `openspec/changes/local-uncensored-stack/proposal.md` — обоснование
- `openspec/changes/local-uncensored-stack/tasks.md` — чек-лист change'а
- `openspec/changes/local-uncensored-stack/specs/python-scenario-provider-router/spec.md` — delta spec для router
- `openspec/changes/local-uncensored-stack/specs/python-scenario-lmstudio-client/spec.md` — delta spec для LM Studio
- `openspec/changes/local-uncensored-stack/specs/python-render-drawthings-client/spec.md` — delta spec для Draw Things
- `openspec/changes/local-uncensored-stack/specs/web-render-provider-passthrough/spec.md` — delta spec для web+mcp
- `py/scenario/provider_router.py` — CREATED (~120 строк)
- `py/scenario/lmstudio_client.py` — CREATED (~80 строк)
- `py/render/drawthings_client.py` — CREATED (~120 строк)
- `tests/test_provider_router.py` — CREATED
- `tests/test_lmstudio_client.py` — CREATED
- `tests/test_drawthings_client.py` — CREATED
- `summary/audit/027_local-uncensored-stack.md` — CREATED
- `summary/tasks/027_local-uncensored-stack.md` — CREATED (этот файл)

### Modified
- `py/scenario/writer.py` — Stage 2 через router
- `py/render/comic_assembler.py` — image_provider switch
- `web/server.js` или `web/routes/scenarios.js` — render endpoint принимает provider
- `mcp-server/index.js` — render_comic пробрасывает provider
- `scripts/render_approved.py` — CLI-флаги
- `AGENTS.md` — секции про provider обновляются
- `.env.example` — новые env-секции
- `CHANGELOG.md` — запись

## Связанные

- `openspec/changes/local-uncensored-stack/` — OpenSpec change (proposal + tasks + 4 delta specs)
- `summary/audit/022_lmstudio-provider-setup.md` — Hermes-side LM Studio
- `summary/audit/026_remove-draw-things-orchestrator.md` — откуда пришли
- `summary/tasks/026_*.md` → F1 — этот change закрывает тот future task
- `AGENTS.md` → `## Image gen provider` — обновляется

## Следующие задачи (после foundation, отдельные change'ы)

| ID | Задача | Приоритет |
|---|---|---|
| F1 | Series consistency bible (`bible/character-<name>.md` + character-LoRA workflow) | High |
| F2 | A/B harness (`scripts/ab_test_scenario.py` уже untracked) | Medium |
| F3 | `/render <id> [--provider]` команда в tg-bot | Medium |
| F4 | Draw Things model auto-discovery (каталог `Models/` → whitelist по тегам) | Low |
