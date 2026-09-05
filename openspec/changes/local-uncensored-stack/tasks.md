# Tasks: Local Uncensored Stack (Draw Things + LM Studio Magnum)

**Change ID:** `local-uncensored-stack`
**Компаньон:** `summary/audit/027_local-uncensored-stack.md`
**Proposal:** `openspec/changes/local-uncensored-stack/proposal.md`

## Фаза 1: Foundation (новые модули)

| ID | Задача | Оценка | Статус |
|---|---|---|---|
| 1.1 | `py/scenario/provider_router.py` (genre table + override + fallback) | 30m | 🚧 In Progress |
| 1.2 | `py/scenario/lmstudio_client.py` (OpenAI-compat для Magnum) | 30m | ⏳ Pending |
| 1.3 | `py/render/drawthings_client.py` (HTTP к DT `:7860`, mirror minimax) | 45m | ⏳ Pending |
| 1.4 | `tests/test_provider_router.py` (mocked) | 30m | ⏳ Pending |
| 1.5 | `tests/test_lmstudio_client.py` (mocked) | 20m | ⏳ Pending |
| 1.6 | `tests/test_drawthings_client.py` (mocked) | 30m | ⏳ Pending |

## Фаза 2: Wire-up в существующий код

| ID | Задача | Оценка | Статус |
|---|---|---|---|
| 2.1 | `py/scenario/writer.py`: Stage 2 через `provider_router` (вместо hardcoded MiniMax) | 30m | ⏳ Pending |
| 2.2 | `py/render/comic_assembler.py`: `image_provider` параметр + router в цикле | 30m | ⏳ Pending |
| 2.3 | Scenario JSON: новые поля `text_provider`, `image_provider`, `render_seed`, `render_lora`, `genre` (все опциональны) | 20m | ⏳ Pending |
| 2.4 | `web/server.js`: `POST /api/scenarios/:id/render` принимает `provider` в body | 20m | ⏳ Pending |
| 2.5 | `mcp-server/index.js`: tool `render_comic` пробрасывает `provider` | 10m | ⏳ Pending |
| 2.6 | `scripts/render_approved.py`: `--text-provider`, `--image-provider` CLI-флаги | 15m | ⏳ Pending |

## Фаза 3: A/B harness + series consistency (out-of-scope этого change'а)

| ID | Задача | Где |
|---|---|---|
| 3.1 | `scripts/ab_test_scenario.py` — оба провайдера side-by-side, HTML compare | отдельный change |
| 3.2 | `bible/character-<name>.md` + character-LoRA workflow | отдельный change |
| 3.3 | `/render <id> [--provider]` команда в tg-bot | отдельный change |

## Зависимости

- **LM Studio запущен** с Magnum-Picaro-0.7-v3-12b-i1 (на `192.168.55.1:1234`)
- **Draw Things запущен** на `192.168.55.1:7860` с нужными LoRA в Models/
- **WireGuard-соединение** активно (для live-тестов после foundation)
- **MiniMax** env (для fallback-теста)

## Связанные

- `openspec/changes/local-uncensored-stack/proposal.md` — обоснование
- `summary/audit/022_lmstudio-provider-setup.md` — Hermes-side LM Studio
- `summary/audit/026_remove-draw-things-orchestrator.md` — откуда пришли
- `summary/tasks/026_*.md` → F1 — закрывается этим change'ом
