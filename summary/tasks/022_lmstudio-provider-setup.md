# Задачи: LM Studio Provider Setup

**Change ID:** `lmstudio-provider-setup`
**Компаньон:** `summary/audit/022_lmstudio-provider-setup.md`

## Статус: ✅ Done

| ID | Задача | Оценка | Статус |
|---|---|---|---|
| 1 | Убрать хардкод `DEFAULT_BASE_URL` из `style_writer.py`, читать из `LM_BASE_URL` env | 5m | ✅ Done |
| 2 | Убрать хардкод `DEFAULT_API_KEY` из `style_writer.py`, читать из `LM_API_KEY` env | 2m | ✅ Done |
| 3 | Убрать хардкод пути к GGUF из `DEFAULT_MODEL`, читать из `LM_MODEL` env | 3m | ✅ Done |
| 4 | Сохранить backward-compat: если env не задан, использовать старые значения | 1m | ✅ Done |
| 5 | Сменить `LM_BASE_URL` в `~/.hermes/.env` на `127.0.0.1:1234/v1` | 1m | ✅ Done |
| 6 | Добавить `providers.lmstudio` в `~/.hermes/config.yaml` через `hermes config set` | 2m | ✅ Done |
| 7 | Добавить `models.magnum-picaro` с alias `magnum` | 2m | ✅ Done |
| 8 | Verification: `curl /v1/models` без токена → 401, с токеном → список моделей | 1m | ✅ Done |
| 9 | Verification: `hermes config get providers.lmstudio` показывает 4 ключа | 1m | ✅ Done |
| 10 | Verification: `hermes config get models.magnum-picaro` показывает 4 ключа + alias | 1m | ✅ Done |
| 11 | Audit + tasks документы в `summary/` | 5m | ✅ Done |
| 12 | Update `CHANGELOG.md` с ISO-8601 timestamp | 1m | ✅ Done |

## Зависимости

- LM Studio 0.4.21+ с включённым Local Server на `127.0.0.1:1234`
- API token включён (Auth: ON) — без токена сервер возвращает 401
- Модель `magnum-picaro-0.7-v3-12b-i1` загружена в LM Studio
- Hermes CLI (`hermes config`) для безопасной правки config

## Как использовать

```bash
# Простой тест подключения
hermes chat --model magnum --provider lmstudio -q "Привет, кто ты?"

# Magnum в стиле Пелевина для комикса
hermes chat --model magnum -q "Напиши 3 сцены в стиле Пелевина про сталкера у костра"

# Из Python (comic-studio 2-stage pipeline)
python -c "
from py.scenario.style_writer import write_narrative
r = write_narrative(
    context='Старый сталкер Резник встречает молодого бойца у костра',
    style='pelevin', tone='dark', num_scenes=3
)
print(r['narrative'][:500])
print(f'({r[\"elapsed_sec\"]}s, {r[\"tokens_used\"]} tokens)')
"
```

## Env variables

| Переменная | Назначение | Default (fallback) |
|---|---|---|
| `LM_BASE_URL` | Endpoint LM Studio (с `/v1` или без) | `http://127.0.0.1:49462` |
| `LM_API_KEY` | Bearer token для auth | старый захардкоженный ключ |
| `LM_MODEL` | Имя модели (короткое или путь к GGUF) | `magnum-picaro-0.7-v3-12b-i1` |

## Файлы

- `py/scenario/style_writer.py` — MODIFIED (env-driven defaults)
- `~/.hermes/.env` — `LM_BASE_URL` → localhost
- `~/.hermes/config.yaml` — `providers.lmstudio` + `models.magnum-picaro`
- `summary/audit/022_lmstudio-provider-setup.md` — этот аудит
- `summary/tasks/022_lmstudio-provider-setup.md` — этот таск

## Связанные

- `summary/audit/020_two-stage-scenario-pipeline.md` — вчерашнее подключение Magnum
- `summary/tasks/020_two-stage-scenario-pipeline.md` — TODO #11 (token через env) ✅ закрыт
- `~/.hermes/skills/lmstudio-provider/SKILL.md` — официальная справка Hermes
- LM Studio 0.4.21 (build 2) — текущая версия

## Следующие задачи (для будущего)

| ID | Задача | Приоритет |
|---|---|---|
| 13 | Подключить остальные 14 моделей из `lms ls` как aliases | Low |
| 14 | Custom LM Studio provider с поддержкой `/api/v1/chat` (MCP integrations) | Medium |
| 15 | TUI picker для LM Studio моделей без `--provider` флага | Low |
| 16 | Temperature/top_k параметры через env для `style_writer.py` | Low |
| 17 | Кэширование Magnum responses (LRU по context hash) | Low |
