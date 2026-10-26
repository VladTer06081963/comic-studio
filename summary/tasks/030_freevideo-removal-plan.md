# Задачи: FreeVideo removal plan (deferred until the user is at the machine)

**Change ID:** `—` (не OpenSpec change; обслуживание локального окружения)
**Компаньон:** `summary/audit/030_freevideo-removal-plan.md`

## Статус: 🚧 In Progress (обследование завершено, удаление отложено)

| ID | Задача | Оценка | Статус |
|---|---|---|---|
| 1 | Обследовать, как FreeVideo установлен (отдельный инструмент или custom node к ComfyUI) | 15m | ✅ Done — **custom node**, `FREEVIDEO_HOME` + `PYTHONPATH` |
| 2 | Посчитать, что именно занимает место | 15m | ✅ Done — 23 G (`~/FreeVideo`) + 76 M (плагин) + 27.5 G (модели) |
| 3 | Проверить, есть ли штатный `uninstall` | 10m | ✅ Done — **нет**; CLI: setup/test/doctor/generate/…, удаления нет |
| 4 | Проверить, что FreeVideo изменил ВНЕ своих папок | 20m | ✅ Done — только launch-команда сервера; репозиторий ComfyUI чист |
| 5 | Определить границу «своё / чужое» в `ComfyUI-Shared/models/` | 15m | ✅ Done — h3-base, qwen3vl, stage-dmd-step-250 = FreeVideo; FLUX/LoRA/t5xxl = нет |
| 6 | Определить, что сломается после удаления | 15m | ✅ Done — 3 тестовых workflow'а; `SaveVideo` — ядро ComfyUI, не FreeVideo |
| 7 | Записать план удаления в аудит | 30m | ✅ Done — `summary/audit/030_freevideo-removal-plan.md` |
| 8 | **Остановить ComfyUI-сервер** | 1m | ⏸ Ожидает пользователя у машины |
| 9 | **Удалить `custom_nodes/FreeVideo/`** | 1m | ⏸ Шаг 2 плана |
| 10 | **Удалить 3 workflow'а `comic-panel-freevideo*.json`** (тесты, восстановление не нужно) | 1m | ⏸ Шаг 3 плана |
| 11 | **Удалить `~/FreeVideo/`** | 5m | ⏸ Шаг 4 плана — 23 G |
| 12 | **Удалить `models/h3-base/`, `qwen3vl_32b_*.safetensors`, `stage-dmd-step-250/`, `sampling-cache/`** | 5m | ⏸ Шаг 5 плана — 27.5 G |
| 13 | **Перезапустить сервер без `FREEVIDEO_HOME` и `PYTHONPATH=.../FreeVideo`** | 2m | ⏸ Шаг 6 плана |
| 14 | **Прогнать тестовый FLUX-рендер** | 10m | ⏸ Шаг 7 плана |
| 15 | **Проверить озвучку** (`VoiceboxSpeak` / `VoiceboxMakeVideo` в `object_info`) | 2m | ⏸ Шаг 8 плана |
| 16 | **Проверить `df -h`** — ожидается ~150 GiB свободно | 1m | ⏸ |
| 17 | Записать аудит 031 с фактическим результатом | 30m | ⏸ После удаления |

## Зависимости

- **Пользователь должен быть физически у машины** — удаление отложено по его решению
- ComfyUI должен быть остановлен на время удаления
- `ComfyUI-Installs/my_test1/ComfyUI/.venv` — рабочее окружение, **не трогать**
- `~/ComfyUI-Shared/models/{unet,vae,loras,text_encoders/t5xxl*,text_encoders/clip_l}` — **не трогать**

## Как использовать

```bash
# === ШАГ 1: остановить сервер ===
# PID виден в: ps aux | grep "[m]ain.py" | grep comfy
pkill -f "ComfyUI/.venv/bin/python main.py"

# === ШАГ 2: удалить плагин ===
rm -rf ~/ComfyUI-Installs/my_test1/ComfyUI/custom_nodes/FreeVideo

# === ШАГ 3: удалить 3 тестовых workflow'а ===
rm -f ~/ComfyUI-Shared/workflows/comic-panel-freevideo.json \
      ~/ComfyUI-Shared/workflows/comic-panel-freevideo-keyframe.json \
      ~/ComfyUI-Shared/workflows/comic-panel-freevideo-voice.json
# Остаться должны: comic-panel-voice.json, flux-dev-gguf.json

# === ШАГ 4: удалить data-каталог FreeVideo ===
rm -rf ~/FreeVideo

# === ШАГ 5: удалить модели FreeVideo ===
rm -rf ~/ComfyUI-Shared/models/h3-base
rm -f  ~/ComfyUI-Shared/models/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors
rm -rf ~/ComfyUI-Shared/models/stage-dmd-step-250
rm -rf ~/ComfyUI-Shared/models/sampling-cache

# === ШАГ 6: перезапустить сервер БЕЗ FreeVideo-переменных ===
C="$HOME/ComfyUI-Installs/my_test1/ComfyUI"
Y="$HOME/Library/Application Support/Comfy Desktop/instance-model-paths/inst-1792755651466.yaml"
cd "$C" && ./.venv/bin/python main.py --listen 127.0.0.1 --port 8189 \
  --extra-model-paths-config "$Y" \
  --output-directory "$HOME/ComfyUI-Shared/output"

# === ШАГ 7: проверить ноды ===
curl -s http://127.0.0.1:8189/object_info | python3 -c "
import sys,json; d=json.load(sys.stdin)
for n in ['UnetLoaderGGUF','KSampler','SaveImage','SaveVideo','VoiceboxSpeak','VoiceboxMakeVideo']:
    print(f'  {n}: ' + ('ЕСТЬ' if n in d else '-- нет --'))
print('  FreeVideoGenerate: ' + ('ЕСТЬ (плохо!)' if 'FreeVideoGenerate' in d else '-- нет --'))
"

# === ШАГ 8: тестовый рендер ===
python ~/.hermes/skills/creative/comfyui-local/scripts/comfy_client.py generate \
  --prompt "a weathered soldier, dramatic rim light" \
  --out ~/Desktop/comfy-post-cleanup --width 768 --height 768 --steps 16

# === ШАГ 9: место ===
df -h /
```

## Env variables

| Переменная | Назначение | Default (fallback) |
|---|---|---|
| `FREEVIDEO_HOME` | data-каталог FreeVideo | **не задавать** после удаления |
| `PYTHONPATH` | добавлялся `custom_nodes/FreeVideo` | **не задавать** после удаления |
| `COMFY_SERVER` | базовый URL | `http://127.0.0.1:8189` |

## Файлы

- `summary/audit/030_freevideo-removal-plan.md` — CREATED — обследование и пошаговый план
- `summary/tasks/030_freevideo-removal-plan.md` — CREATED — этот чек-лист
- `~/FreeVideo/` — DELETED (шаг 4) — 23 G
- `~/ComfyUI-Installs/my_test1/ComfyUI/custom_nodes/FreeVideo/` — DELETED (шаг 2) — 76 M
- `~/ComfyUI-Shared/models/h3-base/` — DELETED (шаг 5) — 10 G
- `~/ComfyUI-Shared/models/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` — DELETED (шаг 5) — 15 G
- `~/ComfyUI-Shared/models/stage-dmd-step-250/` — DELETED (шаг 5) — 84 K
- `~/ComfyUI-Shared/models/sampling-cache/` — DELETED (шаг 5) — 2.5 G, пересоздастся сам
- `~/ComfyUI-Shared/workflows/comic-panel-freevideo.json` — DELETED (шаг 3) — тест
- `~/ComfyUI-Shared/workflows/comic-panel-freevideo-keyframe.json` — DELETED (шаг 3) — тест
- `~/ComfyUI-Shared/workflows/comic-panel-freevideo-voice.json` — DELETED (шаг 3) — тест

## Связанные

- `summary/audit/029_draw-things-removed-comfyui-migration.md` — переход на ComfyUI; этот план — его продолжение
- `summary/audit/027_local-uncensored-stack.md` — DT + LM Studio как локальный стек

## Следующие задачи (для будущего)

| ID | Задача | Приоритет |
|---|---|---|
| 15 | Оценить песочницу Draw Things — нужен «Полный доступ к диску» в macOS | Low |
| 16 | Проанализировать `~/.hermes` (44 G) на предмет очистки кэша | Medium |
| 17 | Решить, нужен ли ComfyUI-клиент в `capcut-studio` (OpenSpec proposal) | Medium |
