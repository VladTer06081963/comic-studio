# Workflow Comic Studio

## Типичный день

### Утро — заготовка материала
1. Читаете статью / смотрите YouTube / формулируете идею
2. Запускаете:
   ```bash
   cd ~/Projects/comic-studio
   source .venv/bin/activate

   # Из URL
   python scripts/ingest_and_draft.py --url "https://example.com/article" --tone funny

   # Из YouTube
   python scripts/ingest_and_draft.py --youtube "https://youtu.be/..."

   # Из мысли
   python scripts/ingest_and_draft.py --freeform "Идея про пожарного, который..."
   ```
3. В Telegram получаете черновик с кнопками

### Утверждение
4. Нажимаете ✅ Утвердить (или ✏️ с правками)
5. Сценарий переходит в `data/scenarios/approved/`

### Ручной рендер
```bash
python scripts/render_approved.py --scenario-id abc12345
```
Или все сразу:
```bash
python scripts/render_approved.py --all
```

### Публикация
```bash
node scripts/publish_rendered.js
```

## Cron-режим (ночной выпуск серии)

Каждый день в 02:00 `cron/nightly.sh`:
1. Берёт все approved сценарии
2. Рендерит (≤4 параллельно)
3. Публикует на сайт + соцсети
4. Архивирует в `data/archive/YYYY-MM-DD/`
5. Уведомляет в Telegram

Настройка cron через Hermes:
```bash
hermes cron create --schedule "0 2 * * *" \
  --prompt "Запусти bash /Users/vladteresena/Projects/comic-studio/cron/nightly.sh и сообщи результат" \
  --name "comic-studio-nightly"
```

## Типы сценариев

### Одиночный комикс (3-4 панели)
- `--panels 3` или `4`
- Используется для коротких историй

### Character-consistent (тот же персонаж)
- Добавьте `--character-ref path/to/ref.jpg` в `py/render/minimax_client.py`
- Через `make_comic_character.py` из minimax-comic skill

### Серия (несколько выпусков об одном)
- Генерируйте несколько сценариев на одну тему
- В промте указывайте "this is episode 2 of a series"
- Notion-зеркало хранит связь по `series_id`

## Что добавить

- **Веб-интерфейс для редактирования промтов** — кнопка ✏️ в UI сейчас заглушка
- **Авто-публикация превью** — загружать panel_1.png как превью в Telegram при отправке сценария
- **Расписание выпусков** — не только cron, но и конкретные даты
- **Метрики** — сколько утверждено / отклонено / опубликовано

## Что НЕ делать

- ❌ Рендерить комикс без утверждения
- ❌ Публиковать черновик
- ❌ Менять файлы в `data/archive/` (immutable)
- ❌ Удалять `data/scenarios/` без бэкапа
- ❌ Коммитить `.env`