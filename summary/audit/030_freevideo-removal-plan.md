# Аудит: FreeVideo — план безопасного удаления (отложен до физического доступа к маке)

**Дата:** 2026-10-26
**Change ID:** `—` (не OpenSpec change; обслуживание локального окружения)
**Компаньон:** `—`
**Связан:** `summary/audit/029_draw-things-removed-comfyui-migration.md` (переход на ComfyUI как единственный локальный image-бэкенд)

## 1. Контекст

После сноса **Draw Things** и перехода на **ComfyUI** пользователь задал вопрос:
«Он же шёл как отдельный инструмент и при установке был выбор. Ставить отдельно или
присоединить к Comfy UI. Надо посмотреть как правильно удалять. Чтобы ничего не сломать.»

Речь про **FreeVideo** — плагин, который стоит в `custom_nodes/` ComfyUI и тянет
**21 ГБ весов Edge-модели** на системный диск. Пользователь ранее обозначил позицию:
FreeVideo M Studio «слабо тянет», на него не рассчитываем, модели снесём, если
не хватает места.

**Решение пользователя:** удаление отложено. «Я через час буду рядом с компом.
Тогда и удалим. А пока запиши в аудите.»

Этот аудит фиксирует **проверенную карту** того, что занимает место, что FreeVideo
изменил вне своих папок, что можно удалять, а что сломается — чтобы удаление
через час было **проведённым по инструкции**, а не импровизацией.

## 2. Что показало обследование

### 2.1. Как устроен FreeVideo

Это **не отдельное приложение**, а **custom node для ComfyUI** (плагин). При
установке был выбор — отдельным инструментом или подключить к ComfyUI; у вас
второй вариант.

```
custom_nodes/FreeVideo/          76 M   ← код плагина (git-репозиторий)
~/FreeVideo/                     23 G   ← его data-каталог (FREEVIDEO_HOME)
    prepared/edge-da37681f5a1f7015/
      int8-convrot/              21 G   ← веса Edge-модели (int8 + convrot)
    downloads/uv-cache/          1.2 G
    envs/                         82 M
    vendor/                      268 M
    python/                       59 M
    setup-runs/                   40 M
    tools/                        39 M   ← uv 41 M
    input-cache/                 3.8 M
    continuations/               1.3 M
```

**Штатного `uninstall` нет.** CLI плагина (`./freevideo --help`) содержит
`setup`, `test`, `doctor`, `diagnose`, `generate`, `plan`, `predict`, `bench`,
`agent`, `mcp`, `status`, `stop`, `restart` — но не `uninstall` и не `remove`.
Удалять придётся вручную, по частям, в правильном порядке.

### 2.2. Что FreeVideo изменил ВНЕ своих папок — обследовано полностью

| Что | Состояние | Риск |
|---|---|---|
| `ComfyUI/requirements.txt`, `.gitignore`, конфиги | **чисто** — `git status --short` в `ComfyUI` пуст | нет |
| `ComfyUI/.venv` | **нет** пакетов FreeVideo — своё окружение в `~/FreeVideo/envs` | нет |
| LaunchAgent, `~/.zshrc` / `~/.zprofile` / `~/.bashrc` | **нет** следов | нет |
| Comfy Desktop `instance-model-paths/inst-*.yaml` | **не тронут** | нет |
| **Launch-команда сервера** | `PYTHONPATH=".../custom_nodes/FreeVideo"` + `FREEVIDEO_HOME="$HOME/FreeVideo"` | **единственная** точка, которую надо поправить |

**Вывод:** плагин не вносил изменений в ComfyUI. Трогать его конфиги не нужно.

### 2.3. Что принадлежит FreeVideo, а что — нет

**Принадлежит FreeVideo (можно удалять):**

| Путь | Размер |
|---|---|
| `~/FreeVideo/` | 23 G |
| `custom_nodes/FreeVideo/` | 76 M |
| `~/ComfyUI-Shared/models/h3-base/` | 10 G |
| `~/ComfyUI-Shared/models/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | 15 G |
| `~/ComfyUI-Shared/models/stage-dmd-step-250/` | 84 K (скелет) |
| `~/ComfyUI-Shared/models/sampling-cache/` | 2.5 G (пересоздастся сам) |

**НЕ принадлежит — НЕ ТРОГАТЬ:**

| Путь | Почему важно |
|---|---|
| `models/unet/flux1-dev-Q4_K_S.gguf` | FLUX — наш рабочий бэкенд |
| `models/vae/ae.safetensors` | нужен FLUX |
| `models/text_encoders/t5xxl_fp8_e4m3fn.safetensors`, `clip_l.safetensors` | нужны FLUX и Voicebox |
| `models/loras/` (4 шт.) | стили для FLUX |
| `custom_nodes/ComfyUI-GGUF` | без него FLUX GGUF не грузится |
| `custom_nodes/ComfyUI-Voicebox` (48 K) | **независим** от FreeVideo — даёт `VoiceboxSpeak` / `VoiceboxMakeVideo` для озвучки комиксов |
| `custom_nodes/ComfyUI-VideoHelperSuite` | `VHS_VideoCombine` |

### 2.4. Что сломается

**Три workflow'а** в `~/ComfyUI-Shared/workflows/` содержат ноды FreeVideo:

```
comic-panel-freevideo.json           → FreeVideoGenerate, FreeVideoMedia
comic-panel-freevideo-keyframe.json  → то же
comic-panel-freevideo-voice.json     → то же + VoiceboxSpeak
```

Пользователь подтвердил: **это были тесты**, восстанавливать не нужно → удаляются.

**`SaveVideo` — не FreeVideo.** Это нод **ядра ComfyUI**
(`comfy_extras/nodes_video.py`), не плагина. Поэтому в `comic-panel-voice.json`
и `flux-dev-gguf.json` FreeVideo-нод нет, и эти два workflow'а **продолжат
работать** после удаления.

## 3. План удаления (порядок важен)

| # | Действие | Освободит | Проверка после |
|---|---|---|---|
| 1 | Остановить ComfyUI-сервер (`./freevideo stop` либо kill по PID) | — | `curl /system_stats` не отвечает |
| 2 | Удалить `custom_nodes/FreeVideo/` | 76 M | — |
| 3 | Удалить 3 workflow'а `comic-panel-freevideo*.json` | — | `ls workflows/` — остались `comic-panel-voice.json`, `flux-dev-gguf.json` |
| 4 | Удалить `~/FreeVideo/` | 23 G | — |
| 5 | Удалить `models/h3-base/`, `qwen3vl_32b_*.safetensors`, `stage-dmd-step-250/`, `sampling-cache/` | 27.5 G | `curl /models/text_encoders` — остались `t5xxl`, `clip_l`, `qwen_3_4b` |
| 6 | Перезапустить сервер **без** `FREEVIDEO_HOME` и `PYTHONPATH=.../FreeVideo` | — | `ps aux \| grep main.py` — флагов нет |
| 7 | Прогнать тестовый FLUX-рендер | — | PNG получен, `UnetLoaderGGUF` в `object_info` |
| 8 | Проверить озвучку | — | `VoiceboxSpeak` и `VoiceboxMakeVideo` в `object_info` |

**Итого освободится ~50.6 ГБ** — свободное место на системном томе поднимется
с 99 GiB примерно до 150 GiB.

### Что НЕ трогаем при удалении

- Песочницу Draw Things (`~/Library/Containers/com.liuliu.draw-things`) — размер
  не измерить без «Полного доступа к диску» в macOS; отдельная задача.
- `~/.hermes` (44 G) — включает кэш сессий; отдельная тема.
- ComfyUI-Installs (5.9 G), `.lmstudio` (3.3 G) — рабочие.

## 4. Verification (обследование, выполнено 2026-10-26)

| Шаг | Результат |
|---|---|
| `du -sh ~/FreeVideo` | ✅ 23 G |
| `du -sh ~/FreeVideo/prepared/edge-*/int8-convrot` | ✅ 21 G — единственный крупный файл |
| `du -sh custom_nodes/FreeVideo` | ✅ 76 M |
| `du -sh ~/ComfyUI-Shared/models/h3-base` | ✅ 10 G |
| `du -sh .../qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` | ✅ 15 G |
| `du -sh ~/ComfyUI-Shared/models/sampling-cache` | ✅ 2.5 G |
| `./freevideo --help` | ✅ CLI есть, команды `uninstall`/`remove` **нет** |
| `./freevideo setup --help` | ✅ опции установки; удаления нет |
| `cd ComfyUI && git status --short` | ✅ пусто — плагин не менял репозиторий |
| `ls ComfyUI/.venv/.../site-packages \| grep -i freevideo` | ✅ пусто — пакетов нет |
| `grep -rn freevideo ComfyUI/*.json *.yaml *.txt` | ✅ пусто |
| `ls ~/Library/LaunchAgents \| grep -i freevideo\|comfy` | ✅ пусто |
| `grep -rn freevideo ~/.zshrc ~/.zprofile ~/.bashrc` | ✅ пусто |
| `machine.json` → `base`, `checkpoint`, `encoder` | ✅ подтверждает принадлежность h3-base / stage-dmd-step-250 / qwen3vl |
| `grep "SaveVideo" ComfyUI/comfy_extras/nodes_video.py` | ✅ `SaveVideo` — ядро ComfyUI, не FreeVideo |
| разбор `class_type` всех 5 workflow'ов | ✅ FreeVideo-ноды только в 3 тестовых |
| `ps aux \| grep main.py` | ✅ сервер запущен с `FREEVIDEO_HOME` + `PYTHONPATH=.../FreeVideo` |
| `df -h /` | ✅ 99 GiB свободно (460 GiB, 77% занято) |

## 5. Связанные

- `summary/audit/029_draw-things-removed-comfyui-migration.md` — переход на ComfyUI
  как единственный локальный image-бэкенд; этот аудит — его продолжение
- `~/knowledge/ConfyUI/ComfyUI.md` — гайд по ComfyUI на Mac Studio

## 6. Известные ограничения

- **Удаление не выполнено.** Этот документ — план, а не отчёт о сделанном.
  Фактическое удаление и его проверка будут в отдельном аудите (030).
- **Размер песочницы Draw Things неизвестен** — нет «Полного доступа к диску».
- **`.hermes` (44 G)** не проанализирован — там кэш сессий и, возможно, модели;
  отдельная задача по очистке.
- **`sampling-cache` пересоздастся сам** при следующих рендерах — это нормально.

## 7. Следующие шаги

- [ ] **Когда пользователь будет у машины:** выполнить удаление по шагам 1–8 из раздела 3
- [ ] После удаления — перезапустить ComfyUI **без** `FREEVIDEO_HOME` и `PYTHONPATH=.../FreeVideo`
- [ ] Прогнать тестовый FLUX-рендер и проверить озвучку (`VoiceboxSpeak`)
- [ ] Проверить `df -h` — ожидается ~150 GiB свободно
- [ ] Записать аудит 030 с фактическим результатом и скриншотами проверок
- [ ] Отдельно: решить, что делать с песочницей Draw Things (нужен «Полный доступ к диску»)
- [ ] Отдельно: проанализировать `~/.hermes` (44 G) на предмет очистки кэша
