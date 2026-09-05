# Proposal: Local Uncensored Stack (Draw Things + LM Studio Magnum)

## Status: 🟡 Proposed

## Context

В main сейчас единственный image-провайдер — MiniMax (cloud, цензурированный), а текст
генерируется через MiniMax-Text-01. Для сценариев Stalker / horror / military / «взрослые»
жанры это упрётся в refusals и content policy.

Цель: дать main полноценный локальный стек без цензуры (WireGuard-isolated, без облака):

- **Текст**: LM Studio + `magnum-picaro-0.7-v3-12b-i1` (OpenAI-совместимый API на
  `http://192.168.55.1:1234/v1/chat/completions`).
- **Изображения**: Draw Things на `http://192.168.55.1:7860` (через `sdapi/v1/txt2img`),
  с поддержкой LoRA (`stalker_sdxl_lora_f16.ckpt`, `pixar_sdxl_lora.safetensors`),
  фиксированным seed для consistency.

MiniMax остаётся как **fallback** и как **default для demo-ветки** (где публичный
стенд и нельзя локальный стек).

Гранулярность выбора провайдера: **per-scenario** (поле `text_provider` /
`image_provider` в JSON сценария) + **per-genre default** (таблица в
`provider_router.py` для автопилота) + **CLI override** при запуске render.

## Why

| Проблема | Сейчас | Решение |
|---|---|---|
| Stalker-серия пишется, но текст цензурится | `_call_minimax_chat` отказывается | Stage 2b → LM Studio (Magnum) через `_call_lmstudio_chat` |
| Stalker-серия рисуется, но LoRA не подключается | `minimax_client.generate_image` не поддерживает LoRA | `drawthings_client.generate_image` с `lora` параметром |
| Mid-series смена провайдера ломает consistency | — | per-scenario provider + scene-level render_seed, render_lora |
| WireGuard-изоляция нарушается | весь pipeline ходит в облако | LM Studio + Draw Things локально, облако только как fallback |
| Demo-ветка случайно подхватывает локальный стек | — | `provider_router` использует env `DEFAULT_*` отдельно для demo и main |
| Uncensored-агент в Hermes не может прицельно сгенерировать Stalker-LoRA панель | — | `drawthings_client` экспонируется в `py.render`, доступен из любого слоя |

## Scope

### In scope (этот change)

1. **Новый модуль `py/scenario/provider_router.py`**:
   - `pick_text_provider(scenario, override=None) -> str` (один из `lmstudio|minimax`)
   - `pick_image_provider(scenario, override=None) -> str` (один из `drawthings|minimax`)
   - Genre-default table для автопилота:
     - `stalker-horror`, `military`, `horror` → `text=lmstudio`, `image=drawthings`
     - `comedy`, `kids`, `educational`, `sci-fi` → `text=minimax`, `image=minimax`
     - default → `minimax, minimax`
   - **Env-overrides** `DEFAULT_TEXT_PROVIDER` и `DEFAULT_IMAGE_PROVIDER` (на случай
     когда жанр не распознан или нужен глобальный override).
   - **Auto-fallback**: если `lmstudio` упал (WireGuard down, модель не загружена) →
     `minimax` для текста; если `drawthings` упал → `minimax` для картинок. Fallback
     событие логируется в scenario JSON: `text_provider_fallback: "minimax"`.

2. **Новый модуль `py/scenario/lmstudio_client.py`**:
   - `_call_lmstudio_chat(system, user, model=None) -> str` — зеркало
     `_call_minimax_chat` (writer.py:81), но через OpenAI-совместимый API LM Studio.
   - Env: `LM_BASE_URL` (default `http://192.168.55.1:1234`), `LM_API_KEY` (default
     `lm-studio` — LM Studio игнорирует, но OpenAI-клиенты требуют), `LM_MODEL`
     (default `magnum-picaro-0.7-v3-12b-i1`).
   - Ошибки `requests.exceptions.*` и `LM Studio unavailable` пробрасываются как
     `LMRuntimeError` для retry-логики в router.

3. **Новый модуль `py/render/drawthings_client.py`**:
   - `generate_image(prompt, output_path, aspect_ratio, seed, lora=None,
     sampler="DPM++ SDE Karras", steps=20, cfg_scale=7) -> Path` — зеркало
     `minimax_client.generate_image`, но к `http://192.168.55.1:7860/sdapi/v1/txt2img`.
   - Поддержка `lora` через `override_settings.sd_model_lora` (для
     `stalker_sdxl_lora_f16.ckpt` и т.п.).
   - Aspect-ratio → `(width, height)`: `16:9=1024x576`, `1:1=1024x1024`,
     `9:16=576x1024`.
   - Env: `DRAWTHINGS_BASE_URL` (default `http://192.168.55.1:7860`),
     `DRAWTHINGS_TIMEOUT` (default `120`).
   - Возвращает `Path` к PNG, base64-декодированный из ответа.

4. **Модификация `py/scenario/writer.py`**:
   - `generate_scenario()` принимает опциональный `text_provider` параметр.
   - Stage 2 (структура → JSON) теперь идёт через `provider_router` →
     `_call_lmstudio_chat` или `_call_minimax_chat`. Раньше был только MiniMax.
   - Stage 1 (Magnum narrative) — без изменений (уже использует LM Studio через
     `py.scenario.style_writer`).

5. **Модификация `py/render/comic_assembler.py`**:
   - `assemble_comic(panels, ..., image_provider="auto", image_provider_override=None)`
   - Внутри цикла рендера панелей: `provider = image_provider_override or
     pick_image_provider(scenario)`. Затем `import_module(f"py.render.{provider}_client")
     .generate_image(...)`.
   - Если провайдер упал — fallback на `minimax`, лог в scenario JSON.

6. **Модификация `web/server.js` и `mcp-server/index.js`**:
   - `POST /api/scenarios/:id/render` принимает `provider: "image" | "text" | "both"`
     в body (опционально). Если не передан — читается из scenario JSON.
   - `mcp-server` tool `render_comic` пробрасывает `provider` дальше.

7. **Модификация `scripts/render_approved.py`**:
   - Поддержка `--text-provider`, `--image-provider` CLI-флагов (override
     всего).

8. **Scenario JSON schema — новые поля**:
   - `text_provider: "lmstudio" | "minimax"` (опционально)
   - `image_provider: "drawthings" | "minimax"` (опционально)
   - `render_seed: int` (опционально; для consistency в серии)
   - `render_lora: "stalker_sdxl_lora_f16.ckpt"` (опционально; для Draw Things)
   - `genre: "stalker-horror" | ...` (опционально; для genre-router)

9. **Тесты**:
   - `tests/test_provider_router.py` — таблица, override, fallback (mocked)
   - `tests/test_lmstudio_client.py` — OpenAI-формат, ошибки (mocked)
   - `tests/test_drawthings_client.py` — payload, aspect-ratio, LoRA, base64 decode
     (mocked)
   - **Live provider calls в тестах: 0** (CLAUDE.md rule 7).

### Out of scope (отдельные change'ы)

- **Series consistency bible** (AGENTS.md → "Series workflow"): `bible/character-<name>.md`
  с описанием персонажа + фиксированный seed для всех панелей серии. Это поверх
  render_provider — отдельный change, потому что требует редактуры и обкатки.
- **A/B harness** (`scripts/ab_test_scenario.py` уже частично есть, untracked):
  рендер одного сценария двумя провайдерами side-by-side для QA. Делается после
  foundation, когда оба клиента стабильны.
- **Demo-ветка** (`origin/demo-production`): не трогаем. `provider_router` имеет
  default = `minimax, minimax`, что совпадает с поведением demo-ветки. Env override
  через `DEFAULT_*` если demo захочет сменить.
- **Telegram bot UI для выбора провайдера**: `tg-bot/bot.js` сейчас не имеет
  render-flow (только `/mcp` для typed operations и Web API для create/approve).
  Добавление `/render <id> [--provider]` команды — отдельный change.
- **Hermes-side tools** для агентов: уже подключены в audit 022
  (`lmstudio-provider-setup`).

## Acceptance Criteria

- [ ] `py/scenario/provider_router.py` экспортирует `pick_text_provider` и
      `pick_image_provider` с покрытием тестами.
- [ ] `py/scenario/lmstudio_client.py` экспортирует `_call_lmstudio_chat`,
      зеркалит сигнатуру `_call_minimax_chat`, валит ошибки явно.
- [ ] `py/render/drawthings_client.py` экспортирует `generate_image`, зеркалит
      сигнатуру `minimax_client.generate_image` + добавляет `lora` параметр.
- [ ] `py/scenario/writer.py` использует `pick_text_provider` в Stage 2.
- [ ] `py/render/comic_assembler.py` использует `pick_image_provider` в цикле
      панелей.
- [ ] Scenario JSON принимает новые поля; не существующие сценарии продолжают
      работать (backward-compat: новые поля опциональны).
- [ ] При падении LM Studio — fallback на MiniMax, scenario помечается
      `*_provider_fallback: "minimax"`.
- [ ] При падении Draw Things — fallback на MiniMax для картинок.
- [ ] Web API `POST /api/scenarios/:id/render` принимает `provider` в body.
- [ ] `mcp-server` tool `render_comic` пробрасывает `provider`.
- [ ] `scripts/render_approved.py` поддерживает `--text-provider` и
      `--image-provider` CLI-флаги.
- [ ] Live provider calls в тестах: 0 (mocked).
- [ ] OpenSpec валидирован `--strict` и архивирован после merge.
- [ ] Audit `summary/audit/027_local-uncensored-stack.md` написан.
- [ ] Tasks `summary/tasks/027_local-uncensored-stack.md` написан.
- [ ] `CHANGELOG.md` обновлён.

## Env additions

| Var | Default | Назначение |
|---|---|---|
| `LM_BASE_URL` | `http://192.168.55.1:1234` | LM Studio OpenAI endpoint |
| `LM_API_KEY` | `lm-studio` | LM Studio игнорирует, но клиенты требуют |
| `LM_MODEL` | `magnum-picaro-0.7-v3-12b-i1` | Текстовая модель в LM Studio |
| `DRAWTHINGS_BASE_URL` | `http://192.168.55.1:7860` | Draw Things SD API |
| `DRAWTHINGS_TIMEOUT` | `120` | HTTP timeout сек |
| `DEFAULT_TEXT_PROVIDER` | `minimax` | Fallback если нет override и нет genre-match |
| `DEFAULT_IMAGE_PROVIDER` | `minimax` | То же для картинок |

Все опциональны (есть default).

## Risks

- **WireGuard down**: оба локальных провайдера могут лечь. Fallback на MiniMax
  обязателен; scenario JSON помечается `*_provider_fallback`. Если и MiniMax
  недоступен — pipeline падает с явной ошибкой (не silent fail).
- **Magnum refusals**: Magnum-picaro — uncensored, но не вседозволенный. На
  откровенной порнографии может отказать. Это by design; пользователь выбирает
  жанр через scenario context.
- **Draw Things reproducibility**: фиксированный seed даёт 95% consistency,
  не 100%. Для production-серий нужны character-LoRAs и пост-обработка (вынесено
  в out-of-scope).
- **LM Studio context window**: Magnum 12B обычно 32K контекст. Длинные истории
  (>32K токенов) нужно либо chunk'ить, либо использовать более крупную модель.
  `MAX_CONTEXT_CHARS = 8_000` в `writer.py:124` — безопасный лимит.

## Open Questions

- Нужен ли whitelist `genre` значений (enum), или freeform строка? — Предлагаю
  freeform + `GENRE_DEFAULT.get(genre, GENRE_DEFAULT["default"])` (unknown →
  default). Это упрощает добавление жанров.
- Должна ли таблица GENRE_DEFAULT быть overridable через .env
  (`CUSTOM_GENRE_MAPPING`)? — Пока нет; если понадобится — отдельный change.
- Draw Things возвращает image в base64. Нужен ли image format param
  (`PNG` vs `WEBP`)? — Пока только PNG (consistency с minimax_client).

## Связанные

- `summary/audit/022_lmstudio-provider-setup.md` — Hermes-side LM Studio (уже есть)
- `summary/audit/026_remove-draw-things-orchestrator.md` — откуда мы пришли
- `summary/tasks/026` → F1 — этот change закрывает тот future task
- `AGENTS.md` → `## Image gen provider` — обновится в этом change
- `AGENTS.md` → `## Censorship-sensitive content` — обновится (сейчас неполное)
