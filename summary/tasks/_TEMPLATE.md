# Задачи: <slug>

**Change ID:** `<openspec-change-name>` (или `—` если не было OpenSpec change)
**Компаньон:** `summary/audit/<NNN>_<slug>.md`

## Статус: ✅ Done (или 🚧 In Progress / ❌ Cancelled)

| ID | Задача | Оценка | Статус |
|---|---|---|---|
| 1 | <первая задача> | 5m | ✅ Done |
| 2 | <вторая задача> | 2m | ✅ Done |
| 3 | <третья задача> | 10m | 🚧 In Progress |

## Зависимости

- <что должно быть готово до начала этой задачи>
- <внешние сервисы / API ключи / пакеты>

## Как использовать

```bash
# Конкретные команды, которые пользователь может выполнить после фиксации
# (curl / python / node / bash — что применимо)
```

## Env variables

| Переменная | Назначение | Default (fallback) |
|---|---|---|
| `EXAMPLE_URL` | endpoint внешнего сервиса | `http://localhost:8000` |
| `EXAMPLE_KEY` | API key | обязательно через env |

## Файлы

- `path/to/file.py` — MODIFIED / CREATED — что именно
- `path/to/another.md` — CREATED — зачем

## Связанные

- `summary/audit/<NNN>_<other>.md` — почему связано
- `summary/tasks/<NNN>_<other>.md` — TODO #X закрыт этим change'ом
- `openspec/specs/<area>/spec.md` — какая capability затронута

## Следующие задачи (для будущего)

| ID | Задача | Приоритет |
|---|---|---|
| N+1 | <что отложили> | Low / Medium / High |
| N+2 | <что отложили> | Low / Medium / High |

---

## Заметки по формату

- **NNN** — трёхзначный номер, монотонно растёт. Перед созданием проверь `ls summary/tasks/ | sort -r | head`.
- **slug** — kebab-case, описывает суть change'а (например, `lmstudio-provider-setup`, `comic-html-rendering`).
- **Change ID** — должен совпадать с `openspec/changes/<name>/` если change был, иначе `—`.
- **Оценка** — реалистичная оценка времени (m / h), помогает при ретроспективе.
- **Статус** — `✅ Done` / `🚧 In Progress` / `❌ Cancelled` / `⏸ Blocked`.
- **Env variables** — перечисли ВСЕ env, которые использует change, даже если они уже были.
- **Файлы** — список реально изменённых файлов с типом действия.
- **Связанные** — это кросс-ссылки для будущей навигации; обновляй, когда ссылаешься.
- **Следующие задачи** — что отложили и почему. Не «когда-нибудь», а конкретные пункты.
