# Аудит: Draw Things удалён, локальный image-бэкенд переведён на ComfyUI

**Дата:** 2026-10-26
**Change ID:** `—` (не OpenSpec change; инфраструктурная миграция)
**Компаньон:** `—`
**Связан:** `summary/audit/026_remove-draw-things-orchestrator.md` (удаление half-wired DT-обвязки из `main`), `summary/audit/027_local-uncensored-stack.md` (DT + LM Studio как локальный стек)

## 1. Контекст

Пользователь снёс приложение **Draw Things** с Mac Studio и перешёл на **ComfyUI**.
Вопрос, который породил этот аудит: «У нас здесь это как-то задействовано?»

Выяснилось, что **задействовано в трёх разных местах**, и в двух из них — живым кодом:

| Место | Степень involvement | Что именно |
|---|---|---|
| `capcut-studio` | косвенно | одна строка `"id": "draw-things"` в `config/model_registry.json` + тестовая фикстура + упоминание в in-flight OpenSpec proposal. **Кода вызова — ноль** |
| `comic-studio` | **живой код** | `py/render/drawthings_client.py` (284 строки), `bible/prototypes/` (6 скриптов, ~590 строк), `tests/test_drawthings_client.py` (315 строк), MCP-опция `"drawthings"` в `mcp-server/index.js`, `provider_router` в `py/scenario/` |
| Hermes skills | **сломано** | `draw-things-comic` (ходит на `localhost:7860`), `draw-things-icons` (зовёт `mcp__draw_things__*` — инструмента больше нет) + 5 skill'ов, ссылающихся на них |

**Draw Things MCP-инструменты в Hermes больше не существуют** (приложение снесено,
порт 7860 не слушается). Два живых skill'а падали бы при любом вызове.

Сразу после этого выяснилось второе: **ComfyUI уже был настроен** на этой машине
и работал — бэкенд, модели, LoRA, готовые workflow'и, собственный раннер. То есть
переход свёлся не к «поднимать с нуля», а к «переписать точки вызова».

## 2. Что сделано

### 2.1. Hermes: три новых skill'а (CREATED)

| Skill | Роль |
|---|---|
| `~/.hermes/skills/creative/comfyui-local/` | ядро: клиент `comfy_client.py` (txt2img + img2img + LoRA), обнаружение порта из живого процесса, инвентарь нод и моделей, таблица маппинга аргументов Draw Things → ComfyUI |
| `~/.hermes/skills/creative/comfyui-comic/` | комикс-стрипы: `_comic_lib.py` / `assemble.py` / `overlay_cyrillic.py` / `build_comic.py` перенесены из DT как есть (чистый Pillow), `make_comic.py` и `create_image.py` переписаны на ComfyUI, `run_comic.sh` обновлён |
| `~/.hermes/skills/creative/comfyui-icons/` | пиктограммы: 512×512 вместо 256 (FLUX деградирует ниже 512) |

`--cfg` переименован в `--guidance` **намеренно**: FLUX игнорирует CFG, и старое
значение 7.5 нельзя было дать вставить случайно.

### 2.2. Hermes: семь зависимых skill'ов (MODIFIED)

`comic-scenario-writer`, `comic-generator` (таблица провайдеров, pitfall'и 11–13,
reference по бэкендам), `video-storyboard-pipeline`, `mcp-bridge-for-desktop-apps`,
`comic-book-pipeline`, `comic-book-styles`, плюс сам `comfyui-local` /
`comfyui-comic` / `comfyui-icons`.

**Попутно найден и починен баг:** `comic-book-pipeline/SKILL.md` имел **сломанный
YAML** — `description` содержал `:` без кавычек, skill вообще не грузился.

**Исторические pitfall'ы** про Draw Things-специфику (его `/sdapi/v1/*` API,
LoRA trainer UI, `custom_lora.json`, песочница моделей, 300-секундный таймаут MCP)
**сохранены** как запись — но помечены баннером в разделе `## Pitfalls`:
бэкенда больше нет, читать ComfyUI-специфичные пункты и таблицу маппинга.

### 2.3. capcut-studio (MODIFIED)

| Файл | Изменение |
|---|---|
| `config/model_registry.json` | провайдер `"draw-things"` → `"comfyui"` (метка: «локальный FLUX/GGUF, порт 8189») |
| `tests/test_model_approval.py` | фикстура провайдера обновлена (`draw-things` → `comfyui`) |
| `openspec/changes/hybrid-media-workflow/proposal.md` | «Prefer local Draw Things for image experiments» → ComfyUI + предупреждение про 16 с/шаг |

**Кода вызова Draw Things в capcut-studio не было и не появилось** — видео-пайплайн
ходит через KIE / MiniMax / OpenRouter / LM Studio.

### 2.4. Измеренное открытие: FLUX в img2img игнорирует style-only промпт

Это ломает инструкцию, унаследованную от Draw Things/SDXL, поэтому измерено
в двух конфигурациях и зафиксировано в skill'ах.

**Условия:** FLUX dev Q4 GGUF, 768×768, 16 шагов, guidance 3.5,
init = фотореалистичный солдат, prompt = `"comic book panel, bold black ink
outlines, halftone dot shading, cel shaded"`.

| `denoise` | Стиль применился? | Субъект |
|---|---|---|
| 0.40 | **нет** — остался фотореалистичным | сохранён точно (форма, оружие, поза) |
| 0.70 | **нет** — всё ещё фотореалистичный | **перерисован**: другая форма, другой шлем, другая сцена (метро вместо завода) |

**Вывод:** в FLUX `denoise` управляет **изменением субъекта**, а не **силой стиля**.
Промежуточной настройки «и то, и то» нет: либо субъект цел — но стиля нет,
либо стиль не появился — но субъект перерисован.

**Рабочий путь — LoRA, а не прилагательные.** Проверено:
`--lora super-panavision-70-cinematic-vintage-film-style-xl-f1d --lora-strength 0.8
--denoise 0.45 --guidance 4.0` + промпт, описывающий **субъект**
(`"a weathered soldier in an abandoned industrial plant"`):

- стиль применился — desaturation teal/amber, виньетка, зерно
- субъект сохранён полностью — та же форма, шлем, оружие, поза, кадрирование
- артефактов на руках и оружии нет

Тот же вызов **без** LoRA сохранял субъект, но **не давал стиля вообще**.

**Следствие для `video-storyboard-pipeline`:** «переделай сториборд в комикс»
через FLUX style-only промптом **не работает**. Либо LoRA (LoRA-стиль, например
panavision-70), либо MiniMax `image-01` в облаке. Инструкция в skill'е
переписана accordingly, чтобы не сжечь час рендеров впустую.

### 2.5. Старые DT-skill'ы НЕ удалены

`draw-things-comic` и `draw-things-icons` оставлены на месте — замена готова и
проверена, но удаление не производилось без явного решения пользователя.

## 3. Файлы

| Путь | Действие | Описание |
|---|---|---|
| `~/.hermes/skills/creative/comfyui-local/SKILL.md` | CREATED | ядро: топология, инвентарь, маппинг аргументов, грабли |
| `~/.hermes/skills/creative/comfyui-local/scripts/comfy_client.py` | CREATED | txt2img + img2img + LoRA поверх REST API ComfyUI |
| `~/.hermes/skills/creative/comfyui-comic/` | CREATED | комикс-стрипы на ComfyUI |
| `~/.hermes/skills/creative/comfyui-icons/` | CREATED | пиктограммы на ComfyUI |
| `~/.hermes/skills/comic-scenario-writer/SKILL.md` | MODIFIED | 2 ссылки на skill'и |
| `~/.hermes/skills/creative/comic-generator/SKILL.md` | MODIFIED | таблица провайдеров, pitfall'и 11–13, баннер про историю DT |
| `~/.hermes/skills/creative/comic-generator/references/local-diffusion-backends.md` | MODIFIED | таблица бэкендов + пометка об удалении DT |
| `~/.hermes/skills/media/video-storyboard-pipeline/SKILL.md` | MODIFIED | img2img-путь переписан на ComfyUI + измеренное правило про LoRA |
| `~/.hermes/skills/mcp-bridge-for-desktop-apps/SKILL.md` | MODIFIED | 1 ссылка на skill'и |
| `~/.hermes/skills/comic-book-pipeline/SKILL.md` | MODIFIED | DT → ComfyUI; **попутно починен сломанный YAML** |
| `~/.hermes/skills/comic-book-styles/SKILL.md` | MODIFIED | таблица стилей: Draw Things → ComfyUI |
| `~/Projects/capcut-studio/config/model_registry.json` | MODIFIED | провайдер `draw-things` → `comfyui` |
| `~/Projects/capcut-studio/tests/test_model_approval.py` | MODIFIED | фикстура провайдера |
| `~/Projects/capcut-studio/openspec/changes/hybrid-media-workflow/proposal.md` | MODIFIED | ComfyUI + предупреждение про скорость |

**Не тронуто (осознанно):** `draw-things-comic`, `draw-things-icons` (ждут решения),
`capcut-studio` capcut-studio-render код (DT там не использовался).

## 4. Verification

| Шаг | Результат |
|---|---|
| `curl http://127.0.0.1:8189/system_stats` | ✅ ComfyUI 0.42.5 отвечает, 1064 ноды |
| `curl http://127.0.0.1:8189/object_info` (выборка нод) | ✅ `UnetLoaderGGUF`, `LoraLoader`, `LoadImage`, `VAEEncode`, `KSampler`, `SaveImage`, `VoiceboxSpeak` есть; `FluxLoraLoader` и `FluxQuantize` **отсутствуют** |
| `curl http://127.0.0.1:8189/models/{unet,loras,text_encoders,vae}` | ✅ FLUX Q4_K_S, 4 LoRA, t5xxl+clip_l, ae.safetensors |
| `render_flux_gguf.py` (старый раннер), 768², 16 шагов | ✅ `flux_dev_gguf_00001_.png` — кинематографичный кадр, контровой свет, артефактов нет |
| `comfy_client.py generate` (пиктограмма), 512² | ✅ чистый чёрный силуэт молнии на белом, без ореола |
| `comfy_client.py generate --lora kodachrome-1970s --lora-strength 0.7` | ✅ плёночная обработка 70-х видна (тёплые тона, зерно) |
| `comfy_client.py img2img --denoise 0.40` | ✅ субъект сохранён, ⚠ стиль **не** применился |
| `comfy_client.py img2img --denoise 0.70` | ⚠ субъект перерисован (форма/шлем/сцена), стиль **не** применился |
| `comfy_client.py img2img --lora super-panavision-70 --lora-strength 0.8 --denoise 0.45` | ✅ стиль применён, субъект сохранён полностью, артефактов нет |
| `python3 -c "yaml.safe_load(...)"` на трёх новых skill'ах | ✅ YAML валиден, description ≤ 60 символов (57/51/54) |
| `ps aux \| grep "main.py" \| grep comfy` | ✅ сервер запущен с `PYTHONPATH=custom_nodes/FreeVideo` — это отдельная тема, см. аудит 029 |

## 5. Связанные

- `summary/audit/026_remove-draw-things-orchestrator.md` — предыдущее удаление
  half-wired DT-обвязки из `main`; тот же принцип «документируй, что убрано и почему»
- `summary/audit/027_local-uncensored-stack.md` — DT + LM Studio как локальный стек;
  теперь DT-мёртв, стек остался на ComfyUI
- `~/knowledge/ConfyUI/ComfyUI.md` — измеренный гайд по ComfyUI на Mac Studio
  (два python-окружения, MPS-грабли, download-подводные камни)

## 6. Известные ограничения

- **`comic-studio` не переведён.** Там остаётся ~1300 строк живого DT-кода:
  `py/render/drawthings_client.py`, `provider_router`, `ab_renderer` (сравнение
  A/B-вариантов), 6 скриптов `bible/prototypes/`, тесты, MCP-опция `"drawthings"`.
  Перенос требует переписать не только вызов, но и логику сравнения — отдельная задача.
- **`mcp-server/index.js`** в comic-studio всё ещё предлагает `"drawthings"` как
  enum-значение image-провайдера.
- **Старые DT-skill'ы** (`draw-things-comic`, `draw-things-icons`) остались в индексе
  и сломаны — пока их явно не удалят.
- **Проверен только один LoRA в img2img** (`super-panavision-70`).
  `soviet-animation-style` и `vovka_flux` не тестировались в этом режиме.
- **Icon-set батч не гонялся** — skill `comfyui-icons` написан, но сам сет не прогонялся.
- **Песочница Draw Things** (`~/Library/Containers/com.liuliu.draw-things`) осталась
  на диске; её размер не измерить без «Полного доступа к диску» в macOS.
- **FreeVideo не тронут** — см. аудит 029.

## 7. Следующие шаги

- [ ] Решить, удалять ли `draw-things-comic` и `draw-things-icons` (замена готова и проверена)
- [ ] Перевести `comic-studio` с DT на ComfyUI (~1300 строк; нужна отдельная проработка `ab_renderer`)
- [ ] Убрать enum-значение `"drawthings"` из `comic-studio/mcp-server/index.js`
- [ ] Прогнать icon-set батч на `comfyui-icons` (10+ иконок, сериализованно — watchdog-ловушка на этой машине уже срабатывала)
- [ ] Проверить остальные три LoRA в img2img (`soviet-animation-style`, `vovka_flux`)
