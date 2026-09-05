# Аудит: Local Uncensored Stack (Draw Things + LM Studio Magnum)

**Дата:** 2026-09-05
**Change ID:** `local-uncensored-stack`
**OpenSpec:** `openspec/changes/local-uncensored-stack/`
**Компаньон:** `summary/tasks/027_local-uncensored-stack.md`
**Предшественник:** `summary/audit/026_remove-draw-things-orchestrator.md` (F1 закрывается этим change'ом)

## 1. Контекст

После фиксации 026 main имеет единственный image-провайдер MiniMax и единственный
текст MiniMax-Text-01. Для проектов со «взрослыми» жанрами (Stalker, military, horror)
это упрётся в refusals на обоих слоях:

- MiniMax M-series отказывается генерировать сценарии с violence / horror / war themes
- MiniMax image-01 зацензуривает LoRA, не подключает custom-модели

**Цель**: дать main полноценный локальный стек без цензуры (WireGuard-isolated):

| Слой | Провайдер | Endpoint |
|---|---|---|
| Текст | LM Studio + Magnum-Picaro-0.7-v3-12b-i1 | `http://192.168.55.1:1234/v1/chat/completions` (OpenAI-совместимый) |
| Изображения | Draw Things + SD LoRA | `http://192.168.55.1:7860/sdapi/v1/txt2img` |
| Fallback | MiniMax | `https://api.minimax.io/v1/...` (когда локалка недоступна) |

## 2. Архитектура (от высшего приоритета к низшему)

Выбор провайдера для каждого сценария (per-scenario, без глобального state):

```
1. CLI override (--text-provider, --image-provider)
   ↓ если нет
2. scenario["text_provider"] / scenario["image_provider"] (per-scenario)
   ↓ если нет
3. scenario["genre"] → GENRE_DEFAULT table
   ↓ если жанр неизвестен
4. env DEFAULT_TEXT_PROVIDER / DEFAULT_IMAGE_PROVIDER
   ↓ если env нет
5. hardcoded "minimax" (последний рубеж)
```

**Auto-fallback** при runtime-ошибке (LM Studio лежит / Draw Things лежит):
- Primary клиент бросил `LMRuntimeError` / `DTRuntimeError` → `try_with_fallback`
  вызывает fallback-клиент (lazy import of `minimax_client` / `minimax_chat`)
- В scenario JSON пишется `text_provider_fallback: "minimax"` или
  `image_provider_fallback: "minimax"`
- Если и fallback упал — пробрасывается последнее исключение (явный fail, не silent)

## 3. Решение по архитектурным вопросам

Из обсуждения с пользователем (см. `summary/audit/026` → секция "Q&A" и
questionnaire-ответы):

| Вопрос | Решение | Обоснование |
|---|---|---|
| Гранулярность выбора | **per-scenario JSON + CLI override** | Серии могут быть смешанные (Stalker в DT+Magnum, публичные в MM); CLI для override |
| Default text provider | **выбираемый по жанру через таблицу** | Magnum для dark/military/horror, MiniMax для comedy/kids/sci-fi |
| Draw Things client | **HTTP напрямую из Python** | Просто, отлаживаемо, без spawn-ов |

## 4. Genre default table

`GENRE_DEFAULT` в `py/scenario/provider_router.py`:

```python
GENRE_DEFAULT = {
    "stalker-horror": {"text": "lmstudio", "image": "drawthings"},
    "military":       {"text": "lmstudio", "image": "drawthings"},
    "horror":         {"text": "lmstudio", "image": "drawthings"},
    "comedy":         {"text": "minimax",  "image": "minimax"},
    "kids":           {"text": "minimax",  "image": "minimax"},
    "educational":    {"text": "minimax",  "image": "minimax"},
    "sci-fi":         {"text": "minimax",  "image": "minimax"},
    "default":        {"text": "minimax",  "image": "minimax"},
}
```

Сценарий «Stalker: Рыжий лес» без явных полей:
```json
{"genre": "stalker-horror", "panels": [...]}
```
→ автоматически: `text=lmstudio`, `image=drawthings`

Сценарий «Кот Леопольд»:
```json
{"genre": "kids", "panels": [...]}
```
→ автоматически: `text=minimax`, `image=minimax`

Гибрид «Sci-fi с элементами хоррора»:
```json
{
  "genre": "sci-fi",
  "text_provider": "lmstudio",      // <- override
  "image_provider": "drawthings",   // <- override
  "panels": [...]
}
```
→ `text=lmstudio`, `image=drawthings` (явное указание победило жанр)

## 5. Что создаётся / меняется

### Новые модули

- `py/scenario/provider_router.py` (~120 строк) — `pick_text_provider`,
  `pick_image_provider`, `GENRE_DEFAULT`, `try_with_fallback`
- `py/scenario/lmstudio_client.py` (~80 строк) — `_call_lmstudio_chat` + `LMRuntimeError`
- `py/render/drawthings_client.py` (~120 строк) — `generate_image` + `DTRuntimeError`
- `tests/test_provider_router.py`, `tests/test_lmstudio_client.py`,
  `tests/test_drawthings_client.py` — mocked, без live provider calls

### Модифицируемые модули

- `py/scenario/writer.py` — Stage 2 через `provider_router` (вместо hardcoded MiniMax)
- `py/render/comic_assembler.py` — `image_provider` параметр + router в цикле
- `web/server.js` (или `web/routes/scenarios.js`) — `POST /api/scenarios/:id/render`
  принимает `provider` в body
- `mcp-server/index.js` — tool `render_comic` пробрасывает `provider`
- `scripts/render_approved.py` — `--text-provider`, `--image-provider` CLI-флаги
- `AGENTS.md` → `## Image gen provider` — обновляется (оба провайдера + router)
- `AGENTS.md` → `## Censorship-sensitive content` — дополняется (было: «LM Studio
  предпочтительнее для Stalker»; теперь: «router сам выберет по жанру»)
- `.env.example` — добавить `LM_*` и `DRAWTHINGS_*` секции
- `CHANGELOG.md` — запись с ISO-8601 timestamp

### Scenario JSON schema — новые поля (все опциональны)

```json
{
  "id": "stalker-013",
  "genre": "stalker-horror",
  "text_provider": "lmstudio",                 // опционально
  "image_provider": "drawthings",              // опционально
  "render_seed": 42,                           // опционально
  "render_lora": "stalker_sdxl_lora_f16.ckpt", // опционально (для Draw Things)
  "text_provider_fallback": null,              // пишется при fallback
  "image_provider_fallback": null,             // пишется при fallback
  "panels": [...]
}
```

Backward-compat: сценарии без этих полей работают как раньше (MiniMax по default).

## 6. Что НЕ входит в этот change

- **Series consistency bible** (`bible/character-<name>.md` + character-LoRA workflow):
  упомянуто в AGENTS.md как open problem. Требует редакторской работы и обкатки
  на нескольких сериях. Out of scope.
- **A/B harness** (`scripts/ab_test_scenario.py` уже untracked): рендер одного
  сценария двумя провайдерами side-by-side. После foundation, когда оба клиента
  стабильны.
- **Telegram bot UI** для выбора провайдера: `tg-bot/bot.js` не имеет render-flow,
  только `/mcp` для typed operations. Добавление `/render <id> [--provider]` — отдельный change.
- **Hermes-side tools**: уже подключены в audit 022 (`lmstudio-provider-setup`).
  Magnum доступен из Hermes/TUI агентов. Этот change работает на уровне render-пайплайна.

## 7. Файлы

### Created (новый change)

- `openspec/changes/local-uncensored-stack/proposal.md`
- `openspec/changes/local-uncensored-stack/tasks.md`
- `openspec/changes/local-uncensored-stack/specs/python-scenario-provider-router/spec.md`
- `openspec/changes/local-uncensored-stack/specs/python-scenario-lmstudio-client/spec.md`
- `openspec/changes/local-uncensored-stack/specs/python-render-drawthings-client/spec.md`
- `openspec/changes/local-uncensored-stack/specs/web-render-provider-passthrough/spec.md`
- `py/scenario/provider_router.py`
- `py/scenario/lmstudio_client.py`
- `py/render/drawthings_client.py`
- `tests/test_provider_router.py`
- `tests/test_lmstudio_client.py`
- `tests/test_drawthings_client.py`
- `summary/audit/027_local-uncensored-stack.md` (этот файл)
- `summary/tasks/027_local-uncensored-stack.md`

### Modified

- `py/scenario/writer.py` — Stage 2 через router
- `py/render/comic_assembler.py` — image_provider switch
- `web/server.js` или `web/routes/scenarios.js` — render endpoint принимает provider
- `mcp-server/index.js` — render_comic пробрасывает provider
- `scripts/render_approved.py` — CLI-флаги
- `AGENTS.md` — секции про provider обновляются
- `.env.example` — новые env-секции
- `CHANGELOG.md` — запись

## 8. Проверка

- [ ] `py/scenario/provider_router.py` экспортирует `pick_text_provider`,
      `pick_image_provider`, `try_with_fallback`, `GENRE_DEFAULT`
- [ ] `py/scenario/lmstudio_client.py` экспортирует `_call_lmstudio_chat`,
      `LMRuntimeError`. Зеркалит сигнатуру `_call_minimax_chat`.
- [ ] `py/render/drawthings_client.py` экспортирует `generate_image`, `DTRuntimeError`.
      Зеркалит сигнатуру `minimax_client.generate_image` + `lora` параметр.
- [ ] Все три тест-файла проходят с `python -m unittest`
- [ ] Live provider calls в тестах: 0
- [ ] `py/scenario/writer.py:generate_scenario()` принимает `text_provider` параметр
- [ ] `py/render/comic_assembler.py:assemble_comic()` принимает `image_provider` параметр
- [ ] Scenario JSON без новых полей продолжает работать (backward-compat)
- [ ] При падении LM Studio → fallback на MiniMax, scenario помечается
- [ ] OpenSpec validated `--strict` (когда tasks завершены)
- [ ] `CHANGELOG.md` обновлён

## 9. Связанные

- `summary/audit/022_lmstudio-provider-setup.md` — Hermes-side LM Studio (уже есть)
- `summary/audit/026_remove-draw-things-orchestrator.md` — откуда пришли
- `summary/tasks/026_*.md` → F1 — этот change закрывает тот future task
- `AGENTS.md` → `## Image gen provider` — обновляется
- `AGENTS.md` → `## Censorship-sensitive content` — обновляется
- `openspec/changes/local-uncensored-stack/` — OpenSpec change
