# Задачи: Draw Things removed, local image backend moved to ComfyUI

**Change ID:** `—` (не OpenSpec change; миграция локального окружения)
**Компаньон:** `summary/audit/029_draw-things-removed-comfyui-migration.md`

## Статус: 🚧 In Progress (миграция Hermes-части завершена; comic-studio — нет)

| ID | Задача | Оценка | Статус |
|---|---|---|---|
| 1 | Обследовать, где Draw Things задействован в трёх местах (capcut-studio, comic-studio, Hermes skills) | 30m | ✅ Done |
| 2 | Обследовать ComfyUI: сервер, порт, ноды, модели, LoRA, workflow'и | 30m | ✅ Done |
| 3 | Создать skill `creative/comfyui-local` (клиент + топология + маппинг аргументов) | 1h | ✅ Done |
| 4 | Создать skill `creative/comfyui-comic` (комикс-стрипы; Pillow-части перенесены из DT) | 1h | ✅ Done |
| 5 | Создать skill `creative/comfyui-icons` (пиктограммы, 512×512) | 30m | ✅ Done |
| 6 | Обновить 7 зависимых Hermes-skill'ов (ссылки + устаревшие правила) | 1h | ✅ Done |
| 7 | capcut-studio: реестр, фикстура теста, in-flight proposal | 30m | ✅ Done — `summary/audit/025_…md` в capcut-studio, PR #3 |
| 8 | Измерить поведение FLUX в img2img (style-only промпт vs LoRA) | 1h | ✅ Done — таблица denoise 0.40/0.70 + рабочий рецепт с LoRA |
| 9 | Прогнать живые рендеры: txt2img, пиктограмма, LoRA, img2img×2, img2img+LoRA | 1h | ✅ Done — 6 рендеров, все проверены глазами |
| 10 | Удалить старые `draw-things-comic` / `draw-things-icons` | 15m | ⏸ Ожидает решения пользователя |
| 11 | Перевести `comic-studio` (~1300 строк живого DT-кода) на ComfyUI | 4-6h | ❌ Не начато — отдельная задача |
| 12 | Убрать enum-значение `"drawthings"` из `comic-studio/mcp-server/index.js` | 15m | ❌ Не начато — зависит от #11 |
| 13 | Прогнать icon-set батч на `comfyui-icons` (10+ иконок, сериализованно) | 1h | ❌ Не начато |
| 14 | Проверить остальные три LoRA в img2img (`soviet-animation-style`, `vovka_flux`) | 45m | ❌ Не начато |

## Зависимости

- ComfyUI должен быть запущен (порт **8189**, не 8188) — для всех рендеров
- FLUX dev Q4 GGUF в `~/ComfyUI-Shared/models/unet/` — для txt2img и img2img
- LoRA в `~/ComfyUI-Shared/models/loras/` — для стилевых рендеров
- Python 3.11+ с `pillow` — для сборки комиксов и кириллических подписей

## Как использовать

```bash
# Запуск ComfyUI (если не запущен)
C="$HOME/ComfyUI-Installs/my_test1/ComfyUI"
cd "$C" && ./.venv/bin/python main.py --port 8189 \
  --extra-model-paths-config "$HOME/Library/Application Support/Comfy Desktop/instance-model-paths/inst-1792755651466.yaml" \
  --output-directory "$HOME/ComfyUI-Shared/output"

# Проверка, что сервер жив
curl -s http://127.0.0.1:8189/system_stats

# Что ComfyUI реально видит
curl -s http://127.0.0.1:8189/models/loras
curl -s http://127.0.0.1:8189/object_info | python3 -c "import sys,json; d=json.load(sys.stdin); print([k for k in d if 'Lora' in k or 'Flux' in k])"

# txt2img
python ~/.hermes/skills/creative/comfyui-local/scripts/comfy_client.py generate \
  --prompt "a weathered soldier, dramatic rim light" \
  --out ~/Desktop/comfy-out --width 1024 --height 1024

# Стиль через LoRA (проверенный рецепт)
python ~/.hermes/skills/creative/comfyui-local/scripts/comfy_client.py generate \
  --prompt "a cat in an abandoned factory" \
  --lora "kodachrome-1970s.safetensors" --lora-strength 0.7 \
  --out ~/Desktop/comfy-out

# img2img со стилем (LoRA обязателен — style-only промпт FLUX игнорирует)
python ~/.hermes/skills/creative/comfyui-local/scripts/comfy_client.py img2img \
  --prompt "a weathered soldier in an abandoned industrial plant" \
  --input-image /abs/path/frame.png \
  --lora "super-panavision-70-cinematic-vintage-film-style-xl-f1d.safetensors" \
  --lora-strength 0.8 --denoise 0.45 --guidance 4.0 \
  --out ~/Desktop/comfy-out
```

**Рендер занимает минуты** (FLUX ~16 с/шаг на M Studio) — запускать в фоне:
`terminal(background=true, notify=true, timeout=1800)`.

## Env variables

| Переменная | Назначение | Default (fallback) |
|---|---|---|
| `COMFY_SERVER` | базовый URL ComfyUI | `http://127.0.0.1:8189` (определяется из живого процесса) |
| `COMFYUI_SHARED` | каталог общих моделей | `~/ComfyUI-Shared` |
| `FREEVIDEO_HOME` | **устаревшее** — задавалось при запуске сервера для FreeVideo | не задавать (см. audit 030) |

## Файлы

- `~/.hermes/skills/creative/comfyui-local/SKILL.md` — CREATED — ядро: топология, инвентарь, маппинг, грабли
- `~/.hermes/skills/creative/comfyui-local/scripts/comfy_client.py` — CREATED — txt2img + img2img + LoRA
- `~/.hermes/skills/creative/comfyui-comic/` — CREATED — комикс-стрипы
- `~/.hermes/skills/creative/comfyui-icons/` — CREATED — пиктограммы
- `~/.hermes/skills/comic-scenario-writer/SKILL.md` — MODIFIED — 2 ссылки
- `~/.hermes/skills/creative/comic-generator/SKILL.md` — MODIFIED — провайдеры, pitfall'и 11–13, баннер про историю DT
- `~/.hermes/skills/creative/comic-generator/references/local-diffusion-backends.md` — MODIFIED — таблица бэкендов
- `~/.hermes/skills/media/video-storyboard-pipeline/SKILL.md` — MODIFIED — img2img-путь + измеренное правило про LoRA
- `~/.hermes/skills/mcp-bridge-for-desktop-apps/SKILL.md` — MODIFIED — 1 ссылка
- `~/.hermes/skills/comic-book-pipeline/SKILL.md` — MODIFIED — DT → ComfyUI; **попутно починен сломанный YAML**
- `~/.hermes/skills/comic-book-styles/SKILL.md` — MODIFIED — таблица стилей
- `summary/audit/029_draw-things-removed-comfyui-migration.md` — CREATED — аудит
- `summary/audit/030_freevideo-removal-plan.md` — CREATED — план удаления FreeVideo

## Связанные

- `summary/audit/026_remove-draw-things-orchestrator.md` — предыдущее удаление half-wired DT-обвязки
- `summary/audit/027_local-uncensored-stack.md` — DT + LM Studio как локальный стек
- `summary/audit/030_freevideo-removal-plan.md` — план удаления FreeVideo (50.6 ГБ)
- `~/knowledge/ConfyUI/ComfyUI.md` — измеренный гайд по ComfyUI на Mac Studio

## Следующие задачи (для будущего)

| ID | Задача | Приоритет |
|---|---|---|
| 10 | Удалить старые `draw-things-comic` / `draw-things-icons` (замена готова и проверена) | Medium |
| 11 | Перевести `comic-studio` на ComfyUI — `drawthings_client.py` (284 строки), `provider_router`, `ab_renderer`, 6 скриптов `bible/prototypes/`, тесты (315 строк) | High |
| 12 | Убрать `"drawthings"` из enum в `comic-studio/mcp-server/index.js` | Low |
| 13 | Прогнать icon-set батч на `comfyui-icons` | Medium |
| 14 | Проверить остальные три LoRA в img2img | Low |
| 15 | Оценить песочницу Draw Things (нужен «Полный доступ к диску» в macOS) | Low |
